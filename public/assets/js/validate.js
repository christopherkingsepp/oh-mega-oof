// Ühine e-posti kontroll: sama reegel brauseris (kassa, soodushüpik) ja serveris
// (netlify/functions/_lib/order.mjs). Puhas ESM ilma DOM-ita.
//
// Kohalik osa ainult ASCII-märkidega (nagu Stripe nõuab), domeen võib sisaldada
// täpitähti (nt õie.ee), tipptase vähemalt 2 tähte.
export const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+\p{L}{2,}$/u;

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}
