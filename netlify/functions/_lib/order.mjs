// Tellimuse valideerimine serveris. Brauserist tulevat infot EI usaldata:
// hinnad arvutatakse alati uuesti ühisest kataloogist (assets/js/catalog.js).
import { PRODUCTS, SHIPPING, MAX_QTY_PER_ITEM, computeTotals, normalizeCode } from '../../../assets/js/catalog.js';
import { cleanText } from './http.mjs';

export const MAX_LINES = 20;

// Lihtne, aga range e-posti kontroll (Stripe valideerib lõpuks ise ka).
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+\p{L}{2,}$/u;

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

/** Eesti mobiil: 5xx xxxx, 5xxx xxxx või 8xxx xxxx (pakiautomaadi kood saabub SMS-iga). */
const EE_MOBILE_RE = /^(?:5\d{6,7}|8\d{7})$/;

/**
 * Normaliseerib telefoninumbri E.164 kujule.
 *   "5123 4567" → "+37251234567", "+372 5123 4567" → "+37251234567",
 *   "00358 40 123 4567" → "+358401234567".
 * Tagastab { phone } või { error } (eestikeelne veateade).
 */
export function normalizePhone(input) {
  const raw = typeof input === 'number' ? String(input) : typeof input === 'string' ? input.trim() : '';
  const generic = 'Kontrolli telefoninumbrit (nt +372 5123 4567).';
  if (!raw) return { error: 'Sisesta telefoninumber — kuller saadab pakiautomaadi koodi SMS-iga.' };
  if (raw.length > 32 || !/^[+\d\s().\-/]+$/.test(raw)) return { error: generic };

  let plus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!plus && digits.startsWith('00')) {
    plus = true;
    digits = digits.slice(2);
  }

  const estonian = (n) =>
    EE_MOBILE_RE.test(n)
      ? { phone: `+372${n}` }
      : { error: 'Sisesta Eesti mobiilinumber (algab 5 või 8) — pakiautomaadi kood saabub SMS-iga.' };

  if (plus) {
    if (digits.startsWith('372')) return estonian(digits.slice(3));
    // Muu riik: E.164 lubab kuni 15 numbrit (koos riigikoodiga).
    return digits.length >= 7 && digits.length <= 15 && !digits.startsWith('0') ? { phone: `+${digits}` } : { error: generic };
  }
  // Ilma "+"-ita: kas "372…" või kohalik Eesti number.
  if (digits.startsWith('372') && digits.length >= 10) return estonian(digits.slice(3));
  return estonian(digits);
}

const fail = (error, field) => ({ ok: false, error, field });
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Valideerib ja normaliseerib /api/checkout päringu keha.
 *
 * Ootab: { items:[{id,qty}], code?, customer:{name,email,phone},
 *          shipping:{carrier, lockerId?, lockerName, lockerAddress?},
 *          termsAccepted:true, ageConfirmed?:true, newsletter?:bool }
 *
 * Tagastab { ok:true, order } või { ok:false, error, field }, kus `field` on
 * vigase välja tee päringu kehas (nt 'customer.email'), et vorm saaks selle
 * välja esile tõsta.
 */
export function validateOrder(body) {
  if (!isObject(body)) return fail('Vigane päring. Värskenda lehte ja proovi uuesti.', null);

  /* ---- Ostukorv ---- */
  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return fail('Sinu ostukorv on tühi. Lisa enne maksmist mõni mäng.', 'items');
  }
  if (rawItems.length > MAX_LINES) return fail('Ostukorvis on liiga palju ridu. Vähenda tooteid ja proovi uuesti.', 'items');

  const merged = new Map(); // sama toode mitmel real → liidame kokku
  for (const item of rawItems) {
    if (!isObject(item) || typeof item.id !== 'string' || !Object.prototype.hasOwnProperty.call(PRODUCTS, item.id)) {
      return fail('Ostukorvis on toode, mida enam ei müüda. Värskenda lehte ja proovi uuesti.', 'items');
    }
    const product = PRODUCTS[item.id];
    const qty = item.qty;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      return fail(`Toote „${product.name}“ kogus peab olema 1 kuni ${MAX_QTY_PER_ITEM}.`, 'items');
    }
    const total = (merged.get(item.id) || 0) + qty;
    if (total > MAX_QTY_PER_ITEM) return fail(`Toodet „${product.name}“ saab korraga tellida kuni ${MAX_QTY_PER_ITEM} tk.`, 'items');
    merged.set(item.id, total);
  }
  const items = [...merged].map(([id, qty]) => ({ id, qty }));

  /* ---- Klient ---- */
  const customer = isObject(body.customer) ? body.customer : {};
  const name = cleanText(customer.name);
  if (name.length < 2 || name.length > 100 || !/\p{L}/u.test(name)) {
    return fail('Sisesta oma ees- ja perekonnanimi — see läheb pakile.', 'customer.name');
  }
  const email = cleanText(customer.email); // tühikud keskel → vigane (regex ei luba)
  if (!isValidEmail(email)) return fail('Kontrolli e-posti aadressi — sinna saadame tellimuse kinnituse.', 'customer.email');

  const phoneResult = normalizePhone(customer.phone);
  if (phoneResult.error) return fail(phoneResult.error, 'customer.phone');

  /* ---- Tarne ---- */
  const shipping = isObject(body.shipping) ? body.shipping : {};
  const carrierId = cleanText(shipping.carrier).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(SHIPPING.carriers, carrierId)) {
    return fail('Vali pakiautomaadi vedaja: Omniva, SmartPost või DPD.', 'shipping.carrier');
  }
  const lockerName = cleanText(shipping.lockerName);
  if (lockerName.length < 2) return fail('Vali pakiautomaat, kuhu pakk saata.', 'shipping.lockerName');
  if (lockerName.length > 200) return fail('Pakiautomaadi nimi on liiga pikk. Kontrolli ja proovi uuesti.', 'shipping.lockerName');
  const lockerId = cleanText(shipping.lockerId).slice(0, 64);
  const lockerAddress = cleanText(shipping.lockerAddress).slice(0, 200);

  /* ---- Nõusolekud ---- */
  if (body.termsAccepted !== true) {
    return fail('Tellimiseks nõustu palun müügitingimustega.', 'termsAccepted');
  }
  const adult = items.some((i) => PRODUCTS[i.id].adult);
  if (adult && body.ageConfirmed !== true) {
    return fail('MIDA V!!!U on ainult täiskasvanutele. Kinnita, et oled vähemalt 18-aastane.', 'ageConfirmed');
  }

  /* ---- Sooduskood (vale kood ei takista ostu — see lihtsalt jäetakse välja) ---- */
  const rawCode = cleanText(body.code);
  const code = normalizeCode(rawCode);
  const warnings = [];
  if (rawCode && !code) warnings.push('Sooduskood ei kehti, seega jätsime selle välja.');

  const totals = computeTotals(items, code);

  return {
    ok: true,
    order: {
      items,
      code: totals.code,
      customer: { name, email, phone: phoneResult.phone },
      shipping: {
        carrier: carrierId,
        carrierName: SHIPPING.carriers[carrierId].name,
        lockerId,
        lockerName,
        lockerAddress,
      },
      adult,
      ageConfirmed: body.ageConfirmed === true,
      termsAccepted: true,
      newsletter: body.newsletter === true || customer.newsletter === true,
      totals,
      warnings,
    },
  };
}
