// Stripe kliendi loomine ühes kohas (makse loomine ja kinnituslehe sünkroonimine).
// MOCK_STRIPE=1 (ainult kohalikult, mitte Lambdas) → kohalik test-Stripe (_lib/stripe-mock.mjs).
import Stripe from 'stripe';
import { isMockStripe } from './config.mjs';
import { getMockStripe } from './stripe-mock.mjs';

// Stripe klient luuakse üks kord soojas funktsioonis ja taaskasutatakse.
const clients = new Map();
export function defaultStripeFactory(key) {
  if (!clients.has(key)) {
    clients.set(
      key,
      new Stripe(key, {
        maxNetworkRetries: 1, // Stripe lisab korduspäringule ise idempotency-võtme
        timeout: 8000, // Netlify funktsiooni ajalimiit on 10 s
        appInfo: { name: 'AGE veebipood' },
      }),
    );
  }
  return clients.get(key);
}

/** Kas võti on Stripe'i testrežiimi oma (sk_test_… / rk_test_…)? */
export const isTestKey = (key) => /^(sk|rk)_test_/.test(String(key || '').trim());

/**
 * Kontrollib võtit ja tagastab kliendi. `test` = testrežiim (testvõti või kohalik näidisrežiim):
 * sellise kassa tellimused on testtellimused (TEST-ÄGE-…, ei muuda laoseisu ega statistikat).
 * @returns {{stripe:any, mock:boolean, test:boolean, key?:string} | {error:'missing'|'format'|'init', detail?:string}}
 */
export function resolveStripe(env = process.env, { stripeFactory = defaultStripeFactory } = {}) {
  if (isMockStripe(env)) return { stripe: getMockStripe(), mock: true, test: true };
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return { error: 'missing', detail: 'STRIPE_SECRET_KEY puudub — lisa see Netlify keskkonnamuutujatesse (vt .env.example).' };
  if (!/^(sk|rk)_(test|live)_/.test(key)) {
    return { error: 'format', detail: 'STRIPE_SECRET_KEY on vales vormingus — see peab algama "sk_live_" või "sk_test_" (mitte "pk_").' };
  }
  try {
    return { stripe: stripeFactory(key), mock: false, test: isTestKey(key), key };
  } catch (err) {
    return { error: 'init', detail: String(err?.message || err) };
  }
}

/** Stripe'i webhooki allkirja kontroll ja testallkirja loomine (ei vaja API võtit). */
export const webhooks = Stripe.webhooks;
