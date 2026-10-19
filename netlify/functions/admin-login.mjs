// POST /api/admin/login — halduspaneeli sisselogimine { password }.
// Kaitse: päritolu kontroll, scrypt-räsi konstantse ajaga võrdlus, väike viivitus vale
// parooli korral, mälus piiraja (10 valet katset / 15 min IP kohta) + Netlify rateLimit.
// Vt netlify/functions/_lib/admin-api.mjs (createLoginHandler) ja _lib/admin-auth.mjs.
import { createLoginHandler } from './_lib/admin-api.mjs';

export default createLoginHandler();

// Kiiruspiirang: ühelt IP-lt kuni 10 sisselogimiskatset minutis.
export const config = {
  path: '/api/admin/login',
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
