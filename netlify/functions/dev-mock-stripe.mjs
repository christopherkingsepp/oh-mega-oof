// /__mock-stripe/* — KOHALIK TEST-STRIPE'I MAKSELEHT (ainult arenduseks).
//
// Töötab AINULT siis, kui MOCK_STRIPE=1 JA kood ei jookse AWS Lambdas (Netlify tootmises on
// AWS_LAMBDA_FUNCTION_NAME alati seatud) — muidu vastab alati 404, nagu funktsiooni polekski.
//
//   GET  /__mock-stripe/checkout?session=cs_test_mock…  → makseleht (summa + valikud)
//   POST /__mock-stripe/action  (session, action)        → muudab sessiooni, saadab PÄRIS allkirjastatud
//        webhooki(d) aadressile /api/stripe-webhook ja suunab success/cancel URL-ile (nagu Stripe).
//
// Valikud: Maksa edukalt · Viivitusega makse (õnnestub hiljem) · Makse ebaõnnestub · Katkesta ·
// Lase aeguda; makstud sessioonil ka tagasimakse (charge.refunded).
import { readTextLimited } from './_lib/http.mjs';
import { isMockStripe, webhookSecret } from './_lib/config.mjs';
import { getMockSession, applyMockAction, deliverMockEvent } from './_lib/stripe-mock.mjs';
import { formatEur } from '../../public/assets/js/catalog.js';

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const eur = (c) => esc(formatEur(Number(c) || 0));

const STATUS = (s, entry) => {
  if (s.status === 'open') return ['Ootab makset', 'open'];
  if (s.status === 'expired') return ['Makseleht aegus', 'bad'];
  if (s.payment_status === 'paid') {
    if (entry.refunded >= s.amount_total) return ['Makstud ja täielikult tagastatud', 'warn'];
    if (entry.refunded > 0) return [`Makstud, tagastatud ${formatEur(entry.refunded)}`, 'warn'];
    return ['Makstud', 'ok'];
  }
  if (entry.delayed) return ['Viivitusega makse — ootab kinnitust', 'warn'];
  return ['Makse ebaõnnestus', 'bad'];
};

const NOTICES = {
  refund: 'Tagasimakse sündmus (charge.refunded) saadeti webhookile.',
  delay_succeed: 'Viivitusega makse kinnitati (checkout.session.async_payment_succeeded).',
};

function page({ entry, notice = '', error = '', deliveries = [] }) {
  const s = entry.session;
  const [statusText, statusKind] = STATUS(s, entry);
  const orderNo = s.metadata?.order_number || s.client_reference_id || '';
  const lines = entry.lineItems
    .map((l) => `<tr><td>${esc(l.name)} <span class="muted">× ${esc(l.quantity)}</span></td><td class="r">${eur(l.unit_amount * l.quantity)}</td></tr>`)
    .join('');
  const discount = entry.discountCents ? `<tr><td>Soodustus</td><td class="r">−${eur(entry.discountCents)}</td></tr>` : '';
  const ship = `<tr><td>${esc(entry.shippingName)}</td><td class="r">${s.total_details?.amount_shipping ? eur(s.total_details.amount_shipping) : 'Tasuta'}</td></tr>`;
  const expires = s.expires_at ? new Intl.DateTimeFormat('et-EE', { timeZone: 'Europe/Tallinn', dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.expires_at * 1000)) : '';
  const btn = (action, label, hint, cls = '') =>
    `<form method="post" action="/__mock-stripe/action"><input type="hidden" name="session" value="${esc(s.id)}"><input type="hidden" name="action" value="${esc(action)}"><button class="btn ${cls}" type="submit">${esc(label)}</button><span class="hint">${esc(hint)}</span></form>`;

  let actions = '';
  if (s.status === 'open') {
    actions =
      btn('pay', 'Maksa edukalt', 'checkout.session.completed (paid) → tellimus makstud, laoseis väheneb, kirjad lähevad välja', 'primary') +
      btn('delay', 'Viivitusega makse (õnnestub hiljem)', 'completed (unpaid) → „töötlemisel“; mõne sekundi pärast async_payment_succeeded') +
      btn('fail', 'Makse ebaõnnestub', 'completed (unpaid) + async_payment_failed → makse ebaõnnestus') +
      btn('cancel', 'Katkesta', 'tagasi ostukorvi (nagu Stripe’i „tagasi“ nupp); sündmust ei saadeta', 'ghost') +
      btn('expire', 'Lase aeguda', 'checkout.session.expired → tellimus aegunud', 'ghost');
  } else if (s.status === 'complete' && s.payment_status === 'unpaid' && entry.delayed) {
    actions = btn('delay_succeed', 'Kinnita viivitusega makse kohe', 'saadab async_payment_succeeded', 'primary');
  } else if (s.payment_status === 'paid' && entry.refunded < s.amount_total) {
    actions = btn('refund', 'Tagasta kogu summa', 'charge.refunded (kogu summa)') + btn('refund_partial', 'Tagasta osaliselt (5 €)', 'charge.refunded (osaline)');
  }

  const back = s.status === 'open' ? s.cancel_url : s.success_url ? s.success_url.replace('{CHECKOUT_SESSION_ID}', s.id) : '/';
  const deliveryHtml = deliveries.length
    ? `<ul class="log">${deliveries.map((d) => `<li class="${d.status >= 200 && d.status < 300 ? 'ok' : 'bad'}">${esc(d.type)} → HTTP ${esc(d.status)} ${esc(d.body.slice(0, 160))}</li>`).join('')}</ul>`
    : '';

  return `<!doctype html>
<html lang="et">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>TESTMAKSE — ÄGE</title>
<link rel="icon" type="image/png" href="/assets/img/brand/favicon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;800&family=Unbounded:wght@700;800&display=swap">
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#07030a;color:#fff;font:15px/1.55 Manrope,system-ui,sans-serif;min-height:100vh}
  .banner{background:repeating-linear-gradient(-45deg,#ff2fa8 0 14px,#c2147a 14px 28px);color:#fff;text-align:center;padding:10px 16px;font:800 14px/1.3 Unbounded,system-ui,sans-serif;letter-spacing:.06em}
  main{max-width:560px;margin:0 auto;padding:28px 16px 48px}
  .card{background:#140a12;border:1px solid #3a1630;border-radius:22px;padding:24px 20px;box-shadow:0 0 60px rgba(255,47,168,.15)}
  h1{font:800 22px/1.25 Unbounded,system-ui,sans-serif;margin:6px 0 4px}
  .muted{color:#bfaeb9}
  table{width:100%;border-collapse:collapse;margin:16px 0 6px}
  td{padding:8px 0;border-bottom:1px solid #2a1424;vertical-align:top}
  .r{text-align:right;white-space:nowrap;padding-left:12px}
  .total td{border:0;font:800 18px Unbounded,system-ui,sans-serif;padding-top:14px}
  .total .r{color:#ff2fa8}
  .pill{display:inline-block;padding:4px 12px;border-radius:999px;font-weight:800;font-size:13px}
  .pill.open{background:#2a1424;color:#ffd1ec}.pill.ok{background:#0f3d24;color:#7dffb3}.pill.warn{background:#3d300f;color:#ffd86b}.pill.bad{background:#3d0f17;color:#ff8a9a}
  form{margin:12px 0 0}
  .btn{display:block;width:100%;min-height:48px;border-radius:999px;border:1px solid #ff2fa8;background:transparent;color:#fff;font:700 15px Unbounded,system-ui,sans-serif;cursor:pointer;padding:12px 18px}
  .btn.primary{background:#ff2fa8;color:#fff;box-shadow:0 0 24px rgba(255,47,168,.45)}
  .btn.ghost{border-color:#4a2a40;color:#e8d7e2}
  .btn:focus-visible{outline:3px solid #fff;outline-offset:3px}
  .hint{display:block;font-size:12px;color:#9c8796;margin:4px 6px 0}
  .notice{background:#0f3d24;color:#b9ffd6;border-radius:14px;padding:10px 14px;margin:14px 0 0}
  .error{background:#3d0f17;color:#ffc2cb;border-radius:14px;padding:10px 14px;margin:14px 0 0}
  .log{list-style:none;padding:0;margin:14px 0 0;font:12px/1.5 ui-monospace,monospace;word-break:break-word}
  .log li{padding:6px 10px;border-radius:10px;margin-bottom:6px;background:#1c0f19}.log .ok{color:#7dffb3}.log .bad{color:#ff8a9a}
  a{color:#ff7ac8}
  .meta{font-size:13px;margin-top:10px;overflow-wrap:anywhere}
  img.logo{width:84px;height:auto;display:block;margin:0 0 8px}
</style>
</head>
<body>
<div class="banner" role="note">TESTMAKSE — päris raha ei liigu</div>
<main>
  <div class="card">
    <img class="logo" src="/assets/img/brand/age-logo-white.png" width="84" height="40" alt="ÄGE">
    <span class="muted">Kohalik test-Stripe (arenduseks)</span>
    <h1>${orderNo ? `Tellimus ${esc(orderNo)}` : 'Testmakse'}</h1>
    <span class="pill ${statusKind}">${esc(statusText)}</span>
    <table>${lines}${discount}${ship}<tr class="total"><td>Kokku</td><td class="r">${eur(s.amount_total)}</td></tr></table>
    <div class="meta muted">E-post: ${esc(s.customer_email || '—')}${expires ? ` · Makseleht aegub ${esc(expires)}` : ''}<br>Sessioon: ${esc(s.id)}</div>
    ${notice ? `<div class="notice" role="status">${esc(notice)}</div>` : ''}
    ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
    ${deliveryHtml}
    ${actions}
    <p class="meta"><a href="${esc(back || '/')}">${s.status === 'open' ? 'Tagasi ostukorvi' : 'Edasi kinnituslehele'}</a> · <a href="/">Avalehele</a></p>
  </div>
</main>
</body>
</html>`;
}

function html(status, body) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

/**
 * @param {{env?:object, fetchImpl?:Function, logger?:Console, delayMs?:number}} deps
 */
export function createHandler({ env = process.env, fetchImpl = (...a) => globalThis.fetch(...a), logger = console, delayMs } = {}) {
  const delay = Number.isFinite(delayMs) ? delayMs : Number(env.MOCK_STRIPE_DELAY_MS) || 12000;

  async function deliverAll(events, origin) {
    const out = [];
    for (const evt of events) {
      try {
        const r = await deliverMockEvent(evt, { url: `${origin}/api/stripe-webhook`, secret: webhookSecret(env), fetchImpl });
        out.push({ type: evt.type, ...r });
        logger.log?.(`[mock-stripe] ${evt.type} → ${r.status}`);
      } catch (err) {
        out.push({ type: evt.type, status: 0, body: String(err?.message || err) });
        logger.error?.(`[mock-stripe] ${evt.type} saatmine ebaõnnestus: ${err?.message || err}`);
      }
    }
    return out;
  }

  return async function mockStripeHandler(req) {
    // Tootmises (või ilma MOCK_STRIPE=1-ta) seda lehte pole olemas.
    if (!isMockStripe(env)) return notFound();

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (req.method === 'GET' && path === '/__mock-stripe/checkout') {
      const entry = await getMockSession(url.searchParams.get('session'));
      if (!entry) return html(404, '<!doctype html><meta charset="utf-8"><title>Ei leitud</title><p>Testmakse sessiooni ei leitud. <a href="/">Avalehele</a></p>');
      let deliveries = [];
      // Makseleht on aegunud, aga "Stripe" pole seda veel teatanud → teata nüüd (nagu Stripe teeb).
      if (entry.session.status === 'open' && entry.session.expires_at && entry.session.expires_at * 1000 < Date.now()) {
        deliveries = await deliverAll(applyMockAction(entry, 'expire').events, url.origin);
      }
      const notice = NOTICES[url.searchParams.get('teade')] || '';
      return html(200, page({ entry, notice, deliveries }));
    }

    if (req.method === 'POST' && path === '/__mock-stripe/action') {
      const { text = '', tooLarge } = await readTextLimited(req, 4096);
      if (tooLarge) return html(413, 'Liiga suur päring');
      const form = new URLSearchParams(text);
      const entry = await getMockSession(form.get('session'));
      if (!entry) return html(404, '<!doctype html><meta charset="utf-8"><title>Ei leitud</title><p>Testmakse sessiooni ei leitud.</p>');
      const action = form.get('action') || '';
      const result = applyMockAction(entry, action);
      if (result.error) return html(409, page({ entry, error: result.error }));

      const deliveries = await deliverAll(result.events, url.origin);
      if (result.later?.length) {
        // Viivitusega makse: "pank" kinnitab makse mõne sekundi pärast.
        const timer = setTimeout(async () => {
          const later = applyMockAction(entry, 'delay_succeed');
          if (!later.error) await deliverAll(later.events, url.origin);
        }, delay);
        timer.unref?.();
      }
      const failed = deliveries.filter((d) => !(d.status >= 200 && d.status < 300));
      if (failed.length) return html(502, page({ entry, error: 'Webhook ei vastanud 2xx-ga — vaata dev-serveri logi.', deliveries }));

      const s = entry.session;
      let location = `/__mock-stripe/checkout?session=${encodeURIComponent(s.id)}&teade=${encodeURIComponent(action.startsWith('refund') ? 'refund' : action)}`;
      if (result.redirect === 'success' && s.success_url) location = s.success_url.replace('{CHECKOUT_SESSION_ID}', s.id);
      if (result.redirect === 'cancel' && s.cancel_url) location = s.cancel_url;
      return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } });
    }

    return notFound();
  };
}

export default createHandler();

export const config = { path: '/__mock-stripe/*' };
