// Stripe Checkout Session'i parameetrite koostamine ja sooduskupongi haldus.
// Kõik funktsioonid on "puhtad" või saavad Stripe kliendi argumendina, et neid
// saaks testida ilma võrguta (vt tests/).
import { randomInt } from 'node:crypto';
import { cleanText, truncate } from './http.mjs';

const CURRENCY = 'eur';

/* ---------------------------------------------------------------------------
 * Päritolu (origin) — kuhu Stripe pärast makset tagasi suunab.
 * ------------------------------------------------------------------------- */

function safeOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Netlify seab tootmises `URL` (saidi peamine aadress). Eelvaadetes
 * (deploy-preview / branch-deploy) kasutame päringu enda aadressi, et testmakse
 * tooks tagasi samasse eelvaatesse, mitte päris poodi.
 */
export function resolveOrigin(req, env = {}, context = {}) {
  const deployContext = env.CONTEXT || context?.deploy?.context;
  const requestOrigin = safeOrigin(req?.url);
  if (deployContext && !['production', 'dev'].includes(deployContext)) {
    return requestOrigin || safeOrigin(env.DEPLOY_PRIME_URL) || safeOrigin(env.URL);
  }
  return safeOrigin(env.URL) || safeOrigin(context?.site?.url) || requestOrigin;
}

/* ---------------------------------------------------------------------------
 * Tellimuse number (inimloetav viide; Stripe sessiooni id on tehniline võti).
 * ------------------------------------------------------------------------- */

const ORDER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ilma 0/O/1/I segaduseta
export function createOrderId() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ORDER_ALPHABET[randomInt(ORDER_ALPHABET.length)];
  return `AGE-${s}`;
}

/* ---------------------------------------------------------------------------
 * Sooduskupong.
 *
 * Miks `amount_off`, mitte `percent_off`? Veebileht arvutab soodustuse
 * computeTotals() abil (nt 17,50 € × 15% = 2,625 → 2,63 €). Stripe ümardaks
 * protsendisoodustust omal moel ja kliendilt võidakse võtta 1 sent rohkem või
 * vähem, kui ostukorvis näidati. Seepärast loome kupongi TÄPSE summaga, mille
 * server ise arvutas — Stripe'i lõppsumma = ostukorvi lõppsumma, alati.
 * Kupongi id on deterministlik (nt "AGE15-263"), nii et sama summaga kupongi
 * kasutatakse korduvalt ja Stripe'i töölaud ei täitu duplikaatidega.
 * Soodustus kehtib ainult toodetele, mitte tarnele (täpselt nagu computeTotals).
 * ------------------------------------------------------------------------- */

export function couponIdFor(code, amountOffCents) {
  return `${String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${amountOffCents}`;
}

function couponParams({ code, percent, amountOffCents }) {
  return {
    amount_off: amountOffCents,
    currency: CURRENCY,
    duration: 'once',
    name: truncate(`${code} (−${percent}%)`, 40), // nähtav Stripe'i makselehel
    metadata: { code: String(code), percent: String(percent) },
  };
}

const isMissing = (err) => err?.code === 'resource_missing' || err?.statusCode === 404 || err?.raw?.code === 'resource_missing';
const isAlreadyExists = (err) =>
  err?.code === 'resource_already_exists' || err?.raw?.code === 'resource_already_exists' || /already exists/i.test(err?.message || '');

// Soojas funktsioonis meelde jäetud kupongid (säästab ühe API päringu).
const knownCoupons = new Set();

/** Unustab kupongi soojas mälus (nt kui see Stripe'i töölaual kustutati). */
export function forgetCoupon(id, cache = knownCoupons) {
  cache.delete(id);
}

/**
 * Tagastab Stripe'i kupongi id, mis annab täpselt `amountOffCents` soodustust.
 * Olemasolev kupong → kasutame; puudub → loome; paralleelne päring jõudis
 * ette (resource_already_exists) → kasutame seda.
 */
export async function ensureCoupon(stripe, { code, percent, amountOffCents }, cache = knownCoupons) {
  if (!Number.isInteger(amountOffCents) || amountOffCents <= 0) throw new Error('ensureCoupon: amountOffCents peab olema positiivne täisarv');
  const id = couponIdFor(code, amountOffCents);
  if (cache.has(id)) return id;

  let existing = null;
  try {
    existing = await stripe.coupons.retrieve(id);
  } catch (err) {
    if (!isMissing(err)) throw err;
  }

  if (existing) {
    const usable =
      existing.valid !== false &&
      existing.amount_off === amountOffCents &&
      String(existing.currency || '').toLowerCase() === CURRENCY &&
      !existing.percent_off;
    if (usable) {
      cache.add(id);
      return id;
    }
    // Sama id-ga kupong on olemas, aga ei sobi (nt käsitsi muudetud või aegunud):
    // loome ühekordse kupongi Stripe'i genereeritud id-ga.
    const fresh = await stripe.coupons.create(couponParams({ code, percent, amountOffCents }));
    return fresh.id;
  }

  try {
    await stripe.coupons.create({ id, ...couponParams({ code, percent, amountOffCents }) });
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
  }
  cache.add(id);
  return id;
}

/* ---------------------------------------------------------------------------
 * Checkout Session'i parameetrid.
 * ------------------------------------------------------------------------- */

const METADATA_MAX_VALUE = 500; // Stripe'i piirang
const METADATA_MAX_KEYS = 50;

/** Stripe metadata: ainult stringid, väärtus ≤ 500 märki, tühjad jäetakse välja. */
export function toMetadata(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Object.keys(out).length >= METADATA_MAX_KEYS) break;
    const v = cleanText(value === true ? 'jah' : value === false ? 'ei' : value);
    if (v) out[key.slice(0, 40)] = truncate(v, METADATA_MAX_VALUE);
  }
  return out;
}

function absoluteUrl(origin, path) {
  try {
    return new URL(path, origin).href;
  } catch {
    return null;
  }
}

/**
 * Koostab stripe.checkout.sessions.create() parameetrid.
 * @param {object} order  validateOrder() tulemus (order)
 * @param {{origin:string, couponId?:string|null, orderId?:string}} opts
 */
export function buildSessionParams(order, { origin, couponId = null, orderId = createOrderId() }) {
  const { totals, customer, shipping } = order;

  const line_items = totals.lines.map((line) => {
    const image = absoluteUrl(origin, line.product.image);
    const product_data = {
      name: line.product.name,
      metadata: { product_id: line.product.id },
    };
    if (line.product.tagline) product_data.description = truncate(line.product.tagline, 200);
    // NB: Stripe ei pruugi .webp pilte makselehel näidata — siis jääb lihtsalt pildita.
    if (image) product_data.images = [image];
    return {
      quantity: line.qty,
      price_data: { currency: CURRENCY, unit_amount: line.unitCents, product_data },
    };
  });

  const itemsSummary = totals.lines.map((l) => `${l.product.id} x${l.qty}`).join(', ');
  const itemsReadable = totals.lines.map((l) => `${l.product.name} ×${l.qty}`).join(', ');

  const metadata = toMetadata({
    order_id: orderId,
    customer_name: customer.name,
    phone: customer.phone,
    carrier: shipping.carrier,
    locker_id: shipping.lockerId,
    locker_name: shipping.lockerName,
    locker_address: shipping.lockerAddress,
    items: itemsSummary,
    discount_code: totals.code || '',
    discount_cents: totals.discountCents ? String(totals.discountCents) : '',
    shipping_cents: String(totals.shippingCents),
    total_cents: String(totals.totalCents),
    newsletter: order.newsletter === true,
    age_confirmed: order.ageConfirmed === true,
  });

  const params = {
    mode: 'payment',
    locale: 'et',
    // NB: payment_method_types jäetakse meelega määramata — Stripe pakub
    // automaatselt kõiki töölaual sisse lülitatud makseviise (kaart, Apple Pay,
    // Google Pay, pangalingid jne).
    customer_email: customer.email,
    client_reference_id: orderId,
    line_items,
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: totals.shippingCents, currency: CURRENCY },
          display_name: truncate(`${shipping.carrierName} — ${shipping.lockerName}`, 100),
          delivery_estimate: {
            // väljastus 1–3 tööpäeva + tavaliselt 1–2 tööpäeva automaati jõudmiseks
            minimum: { unit: 'business_day', value: 2 },
            maximum: { unit: 'business_day', value: 5 },
          },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      description: truncate(`ÄGE tellimus ${orderId}: ${itemsReadable}`, 1000),
      metadata,
      receipt_email: customer.email,
      shipping: {
        name: truncate(customer.name, 100),
        phone: customer.phone,
        address: {
          line1: truncate(shipping.lockerName, 100),
          ...(shipping.lockerAddress ? { line2: truncate(shipping.lockerAddress, 100) } : {}),
          country: 'EE',
        },
      },
    },
    custom_text: {
      submit: {
        message: truncate(
          `Pakk saadetakse pakiautomaati: ${shipping.carrierName} — ${shipping.lockerName}. ` +
            'Saadame paki teele 1–3 tööpäeva jooksul ja automaadi avamiskoodi saad SMS-iga.',
          1200,
        ),
      },
    },
    success_url: `${origin}/aitah?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/ostukorv?katkestatud=1`,
  };

  if (couponId) params.discounts = [{ coupon: couponId }];
  return params;
}
