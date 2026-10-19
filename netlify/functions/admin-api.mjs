// /api/admin/* — halduspaneeli API (tellimused, CSV, pakkimine, laoseis, taganemised,
// statistika, kalender, väljalogimine). IGA päring kontrollib serveris seanssi (401) ja
// muutvad päringud ka päritolu (403). Marsruudid: netlify/functions/_lib/admin-api.mjs.
// Sisselogimine on eraldi funktsioon (admin-login.mjs), et sellele kehtiks range kiiruspiirang.
import { createAdminApi } from './_lib/admin-api.mjs';

export default createAdminApi();

export const config = {
  path: '/api/admin/*',
  excludedPath: '/api/admin/login',
  // Tavakasutuseks heldelt; kaitseb ainult automaatse koormuse eest.
  rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
