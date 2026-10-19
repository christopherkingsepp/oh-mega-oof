// GET /admin, /admin/* — halduspaneeli leht (serveerib funktsioon, MITTE staatiline fail).
// Sisselogimata → sisselogimisleht; sisseloginult → rakenduse kest, mis laeb
// /assets/admin/admin.js ja admin.css. Andmed tulevad ainult /api/admin/* kaudu.
// Vt netlify/functions/_lib/admin-html.mjs.
import { createPageHandler } from './_lib/admin-html.mjs';

export default createPageHandler();

export const config = {
  path: ['/admin', '/admin/*'],
};
