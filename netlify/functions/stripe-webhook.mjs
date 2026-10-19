// POST /api/stripe-webhook — Stripe'i sündmused (makse õnnestus/ebaõnnestus/aegus, tagasimakse).
//
// Seadistus Stripe'i töölaual: Developers → Webhooks → Add endpoint
//   URL: https://<sinu-domeen>/api/stripe-webhook
//   Sündmused: checkout.session.completed, checkout.session.async_payment_succeeded,
//              checkout.session.async_payment_failed, checkout.session.expired, charge.refunded
//   "Signing secret" (whsec_…) → Netlify keskkonnamuutuja STRIPE_WEBHOOK_SECRET.
//
// Turvalisus: sündmust usaldatakse ainult siis, kui allkiri (Stripe-Signature) klapib TOORE kehaga.
// Idempotentsus: iga sündmus (evt_…) salvestatakse tabelisse stripe_events; juba töödeldud sündmus
// jäetakse vahele. Lisaks on igal olekuüleminekul ja kõrvalmõjul oma valvur (vt _lib/payments.mjs),
// nii et ka paralleelne/korduv töötlus ei tee midagi topelt.
// Vastused: 200 (ka tundmatule sündmusele), 400 vale allkiri, 500/503 ajutine viga → Stripe kordab.
import { json, readTextLimited } from './_lib/http.mjs';
import { webhooks } from './_lib/stripe-client.mjs';
import { webhookSecret } from './_lib/config.mjs';
import { getDb } from './_lib/db.mjs';
import { createMailer } from './_lib/mail.mjs';
import { applySessionState, applyChargeRefunded, findOrderForSession } from './_lib/payments.mjs';

export const MAX_BODY_BYTES = 512 * 1024;
/** Allkirja ajatempli lubatud vanus (sekundites) — kaitseb vanade sündmuste kordusesituse eest. */
export const SIGNATURE_TOLERANCE_S = 300;

export const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
]);

/**
 * @param {{env?:object, logger?:Console, getDb?:()=>Promise<object>, mailer?:{send:Function}}} deps
 */
export function createHandler({ env = process.env, logger = console, getDb: getDbImpl = () => getDb(env), mailer = null } = {}) {
  const mail = mailer || createMailer({ env, logger });

  return async function stripeWebhookHandler(req) {
    if (req.method !== 'POST') return json(405, { error: 'Lubatud on ainult POST-päring.' }, { Allow: 'POST' });

    const secret = webhookSecret(env);
    if (!secret) {
      logger.error('[webhook] STRIPE_WEBHOOK_SECRET puudub — lisa see Netlify keskkonnamuutujatesse (Stripe → Developers → Webhooks → Signing secret).');
      return json(500, { error: 'Webhook pole seadistatud.' });
    }

    // Allkiri arvutatakse TOORE keha baitidest — keha ei tohi enne parsida ega muuta.
    const signature = req.headers.get('stripe-signature');
    if (!signature) return json(400, { error: 'Stripe-Signature päis puudub.' });
    const { text: raw, tooLarge } = await readTextLimited(req, MAX_BODY_BYTES);
    if (tooLarge) return json(413, { error: 'Päring on liiga suur.' });

    let event;
    try {
      event = webhooks.constructEvent(raw, signature, secret, SIGNATURE_TOLERANCE_S);
    } catch (err) {
      // Stripe'i veateade on mitmerealine juhend — logime ainult esimese rea.
      logger.warn(`[webhook] allkiri ei klapi: ${String(err?.message || err).split('\n')[0]}`);
      return json(400, { error: 'Vigane allkiri.' });
    }

    if (!HANDLED_EVENTS.has(event.type)) return json(200, { received: true, ignored: true });

    let db;
    try {
      db = await getDbImpl();
    } catch (err) {
      logger.error(`[webhook] andmebaas pole kättesaadav (${err?.code || err?.message}) — Stripe proovib hiljem uuesti.`);
      return json(503, { error: 'Andmebaas pole kättesaadav.' });
    }

    try {
      // 1) Kas see sündmus on juba töödeldud?
      const obj = event.data?.object || {};
      const orderHint = event.type.startsWith('checkout.session.') ? obj.metadata?.order_id || obj.client_reference_id || null : null;
      const rows = await db.query(
        `WITH ins AS (
            INSERT INTO stripe_events (id, type, order_id) VALUES ($1, $2, $3)
            ON CONFLICT (id) DO NOTHING
            RETURNING processed_at
         )
         SELECT processed_at FROM ins
         UNION ALL
         SELECT processed_at FROM stripe_events WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM ins)`,
        [String(event.id), String(event.type), orderHint ? String(orderHint).slice(0, 64) : null],
      );
      if (rows[0]?.processed_at) return json(200, { received: true, duplicate: true });

      // 2) Töötle.
      let outcome;
      if (event.type === 'charge.refunded') {
        outcome = await applyChargeRefunded(db, obj, { logger });
      } else {
        const order = await findOrderForSession(db, obj);
        if (!order) logger.warn(`[webhook] ${event.type}: sessioonile ${obj.id} ei leitud tellimust (mõne teise rakenduse makse?).`);
        outcome = order ? await applySessionState(db, obj, { eventType: event.type, mailer: mail, env, logger, order }) : { order: null };
      }

      // 3) Märgi töödelduks (kui siia ei jõuta, kordab Stripe ja valvurid hoiavad ära topelttegevused).
      await db.query('UPDATE stripe_events SET processed_at = now(), order_id = COALESCE(order_id, $2) WHERE id = $1', [
        String(event.id),
        outcome?.order?.id || null,
      ]);
      return json(200, {
        received: true,
        ...(outcome?.order ? { order: outcome.order.number, status: outcome.order.payment_status } : {}),
      });
    } catch (err) {
      logger.error(`[webhook] ${event.type} (${event.id}) töötlemine ebaõnnestus:`, err?.message || err);
      return json(500, { error: 'Sündmuse töötlemine ebaõnnestus.' });
    }
  };
}

export default createHandler();

export const config = { path: '/api/stripe-webhook' };
