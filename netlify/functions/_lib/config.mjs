// Keskkonnamuutujatest tulenevad seaded ühes kohas (vt .env.example).
//
// NB! Näidisrežiimid (MOCK_STRIPE, MOCK_MAIL, MOCK_LOCKERS) töötavad AINULT kohalikus
// arenduses. Netlify tootmises jooksevad funktsioonid AWS Lambdas (seal on alati seatud
// AWS_LAMBDA_FUNCTION_NAME) — siis on näidisrežiimid välja lülitatud ka siis, kui keegi
// muutuja kogemata Netlifysse lisab.
import { SHIPPING, toCents } from '../../../public/assets/js/catalog.js';
import { SITE } from '../../../public/assets/js/site.js';

/** Kas kood jookseb Netlify/AWS Lambda keskkonnas (st päris serveris)? */
export function isLambda(env = process.env) {
  return Boolean(env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Näidisrežiim on sees ainult siis, kui muutuja on täpselt '1' JA me ei ole Lambdas. */
export function mockEnabled(env, name) {
  return env?.[name] === '1' && !isLambda(env);
}

export const isMockStripe = (env = process.env) => mockEnabled(env, 'MOCK_STRIPE');
export const isMockMail = (env = process.env) => mockEnabled(env, 'MOCK_MAIL');
export const isMockLockers = (env = process.env) => mockEnabled(env, 'MOCK_LOCKERS');

/**
 * Webhooki allkirja saladus. Näidisrežiimis (ainult kohalikult) on vaikeväärtus, et
 * test-Stripe'i leht saaks saata päriselt allkirjastatud sündmusi ka ilma .env-ita.
 * Tootmises vaikeväärtust EI kasutata.
 */
export const DEFAULT_MOCK_WEBHOOK_SECRET = 'whsec_kohalik_naidisrezhiim_ainult_arenduseks';
export function webhookSecret(env = process.env) {
  const s = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (s) return s;
  return isMockStripe(env) ? DEFAULT_MOCK_WEBHOOK_SECRET : '';
}

/* ---------------------------------------------------------------------------
 * Vedajad
 * ------------------------------------------------------------------------- */

export const DEFAULT_ENABLED_CARRIERS = ['omniva', 'smartpost'];

/**
 * Vedajad, kuhu saab PÄRISELT tellida (ENABLED_CARRIERS, komadega eraldatud, nt "omniva,smartpost,dpd").
 * Tundmatud nimed jäetakse välja. Kui muutuja puudub või ei sisalda ühtegi tuntud vedajat,
 * kasutatakse vaikimisi Omnivat ja SmartPostit.
 */
export function enabledCarriers(env = process.env, logger = null) {
  const raw = String(env.ENABLED_CARRIERS ?? '').trim();
  if (!raw) return [...DEFAULT_ENABLED_CARRIERS];
  const list = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const id = part.trim().toLowerCase();
    if (id && Object.prototype.hasOwnProperty.call(SHIPPING.carriers, id) && !list.includes(id)) list.push(id);
  }
  if (!list.length) {
    logger?.warn?.(`[seaded] ENABLED_CARRIERS="${raw}" ei sisalda ühtegi tuntud vedajat — kasutan vaikimisi omniva,smartpost.`);
    return [...DEFAULT_ENABLED_CARRIERS];
  }
  return list;
}

export function isCarrierEnabled(carrier, env = process.env) {
  return enabledCarriers(env).includes(carrier);
}

/** Vedajate info kassale: [{ id, name, label, priceCents, eta, enabled }] kataloogi järjekorras. */
export function carrierMeta(env = process.env) {
  const enabled = enabledCarriers(env);
  return Object.values(SHIPPING.carriers).map((c) => ({
    id: c.id,
    name: c.name,
    label: c.label,
    priceCents: toCents(c.price),
    eta: c.eta,
    enabled: enabled.includes(c.id),
  }));
}

/** "Omniva või SmartPosti" — lubatud vedajate nimed loetavalt (veateadete jaoks). */
export function enabledCarrierNames(env = process.env) {
  const names = enabledCarriers(env).map((id) => SHIPPING.carriers[id].name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} või ${names[names.length - 1]}`;
}

/* ---------------------------------------------------------------------------
 * Sait ja kontakt
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

/** Saidi avalik aadress meilide linkide jaoks (SITE_URL → Netlify URL → SITE.url → päringu aadress). */
export function siteUrl(env = process.env, fallback = '') {
  return (
    safeOrigin(env.SITE_URL) || safeOrigin(env.URL) || safeOrigin(SITE.url) || safeOrigin(fallback) || 'http://localhost:8080'
  );
}

/** Kontakt-e-post (kliendile näidatav). */
export function contactEmail() {
  return SITE.email;
}

/** Omaniku e-post teavituste jaoks (ADMIN_EMAIL); kui puudub, siis teavitust ei saadeta. */
export function adminEmail(env = process.env) {
  return String(env.ADMIN_EMAIL || '').trim();
}
