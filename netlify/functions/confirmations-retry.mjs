// Ajastatud funktsioon: kord tunnis kontrollib viimase 7 päeva makstud tellimusi, mille mõni
// kõrvalmõju jäi pooleli (kliendi kinnituskiri, omaniku teavitus või laoseisu vähendamine) —
// nt kui e-posti teenus vastas webhooki ajal korraks veaga ja klient sulges kohe vahelehe.
// Valvurid (confirmation_sent_at / admin_notified_at / laoliikumiste unikaalsus) tagavad, et
// midagi ei tehta topelt. Netlify käivitab selle ise; HTTP kaudu seda tootmises kutsuda ei saa.
import { getDb } from './_lib/db.mjs';
import { ensurePaidSideEffects } from './_lib/payments.mjs';
import { createMailer } from './_lib/mail.mjs';
import { adminEmail } from './_lib/config.mjs';

export async function retryPendingConfirmations({ env = process.env, getDb: getDbImpl = () => getDb(env), mailer, logger = console, limit = 50 } = {}) {
  const db = await getDbImpl();
  const mail = mailer || createMailer({ env, logger });
  const needAdmin = Boolean(adminEmail(env));
  const rows = await db.query(
    `SELECT * FROM orders
      WHERE payment_status IN ('paid', 'partially_refunded')
        AND paid_at > now() - interval '7 days'
        AND (confirmation_sent_at IS NULL OR inventory_applied_at IS NULL OR ($1::boolean AND admin_notified_at IS NULL))
      ORDER BY paid_at ASC
      LIMIT $2`,
    [needAdmin, limit],
  );
  let done = 0;
  for (const order of rows) {
    try {
      await ensurePaidSideEffects(db, order, { mailer: mail, env, logger });
      done++;
    } catch (err) {
      logger.warn?.(`[kinnitused] ${order.number}: kordus ebaõnnestus: ${err?.message || err}`);
    }
  }
  if (rows.length) logger.log?.(`[kinnitused] kontrollitud ${rows.length}, töödeldud ${done}`);
  return { checked: rows.length, processed: done };
}

export default async function confirmationsRetry() {
  try {
    const r = await retryPendingConfirmations();
    return new Response(JSON.stringify({ ok: true, ...r }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[kinnitused] ajastatud kordus ebaõnnestus:', err?.message || err);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export const config = { schedule: '@hourly' };
