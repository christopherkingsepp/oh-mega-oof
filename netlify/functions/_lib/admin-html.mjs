// Halduspaneeli HTML: sisselogimisleht ja rakenduse kest (/admin, /admin/*).
//
// Leht ise ei sisalda KUNAGI andmeid — need tulevad ainult /api/admin/* kaudu, mis kontrollib
// seanssi. Sisselogimata kasutaja näeb ainult sisselogimisvormi (rakenduse kest ja selle JS
// laetakse alles pärast sisselogimist).
//
// Turvapäised: noindex, no-store, X-Frame-Options DENY + frame-ancestors 'none', range CSP
// (skriptid ainult oma domeenilt, inline-skripte ega inline-stiile pole), Referrer-Policy.
import { authConfig, getSession } from './admin-auth.mjs';

export const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
].join('; ');

export const ADMIN_PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': ADMIN_CSP,
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** HTML-i paoaine (kasutatakse ainult seadistusteate jaoks — muud dünaamilist sisu lehel pole). */
export function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap';

function head(title, scriptSrc) {
  return `<!doctype html>
<html lang="et">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="same-origin">
  <meta name="theme-color" content="#07030a">
  <title>${escHtml(title)}</title>
  <link rel="icon" type="image/png" href="/assets/img/brand/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${FONTS}">
  <link rel="stylesheet" href="/assets/admin/admin.css">
  <script type="module" src="${scriptSrc}"></script>
</head>`;
}

/** Sisselogimisleht. `reason` = miks sisselogimine on keelatud (seadistamata) — siis vorm lukus. */
export function renderLoginPage({ reason = '', dev = false } = {}) {
  const disabled = reason ? ' disabled' : '';
  return `${head('Logi sisse | ÄGE haldus', '/assets/admin/login.js')}
<body class="adm-login-page">
  <div class="adm-blobs" aria-hidden="true"><span></span><span></span><span></span></div>
  <main class="adm-login" id="main">
    <div class="adm-login__card">
      <img class="adm-login__logo" src="/assets/img/brand/age-logo-white.webp" alt="ÄGE" width="160" height="80">
      <p class="adm-eyebrow">Halduspaneel</p>
      <h1 class="adm-login__title">Tere tulemast tagasi</h1>
      <p class="adm-login__lead">Tellimused, pakkimine, laoseis ja müüginumbrid — ühes kohas. Sisene omaniku parooliga.</p>
      ${reason ? `<div class="adm-alert adm-alert--error" role="alert"><strong>Sisselogimine on välja lülitatud.</strong> ${escHtml(reason)}</div>` : ''}
      <form class="adm-login__form" id="login-form" method="post" action="/api/admin/login" novalidate>
        <label class="adm-label" for="password">Parool</label>
        <div class="adm-password">
          <input class="adm-input" id="password" name="password" type="password" autocomplete="current-password" required maxlength="256" autofocus${disabled} aria-describedby="login-error">
          <button class="adm-password__toggle" type="button" data-toggle-password aria-controls="password" aria-pressed="false"${disabled}>Näita</button>
        </div>
        <p class="adm-field-error" id="login-error" role="alert" aria-live="assertive"></p>
        <button class="adm-btn adm-btn--primary adm-btn--block" type="submit"${disabled}>Logi sisse</button>
      </form>
      ${dev ? '<p class="adm-login__dev">Kohalik arendus: parool on <code>ADMIN_DEV_PASSWORD</code> (npm run dev:mock → <code>demo-admin</code>).</p>' : ''}
      <p class="adm-login__foot"><a href="/">← Tagasi poodi</a></p>
    </div>
  </main>
</body>
</html>`;
}

export const NAV = [
  { id: 'ulevaade', path: '/admin', label: 'Ülevaade' },
  { id: 'tellimused', path: '/admin/tellimused', label: 'Tellimused' },
  { id: 'pakkimine', path: '/admin/pakkimine', label: 'Pakkimine' },
  { id: 'laoseis', path: '/admin/laoseis', label: 'Laoseis' },
  { id: 'kalender', path: '/admin/kalender', label: 'Kalender' },
  { id: 'taganemised', path: '/admin/taganemised', label: 'Taganemised' },
];

/** Rakenduse kest (ainult sisseloginule). Sisu renderdab /assets/admin/admin.js. */
export function renderAppShell({ dev = false } = {}) {
  const nav = NAV.map((n) => `<a class="adm-nav__link" href="${n.path}" data-nav="${n.id}">${escHtml(n.label)}</a>`).join('');
  return `${head('Haldus | ÄGE', '/assets/admin/admin.js')}
<body class="adm-app">
  <a class="adm-skip" href="#view">Liigu sisu juurde</a>
  <header class="adm-header">
    <div class="adm-header__inner">
      <a class="adm-brand" href="/admin" data-nav-home>
        <img src="/assets/img/brand/age-logo-white.webp" alt="ÄGE" width="72" height="36">
        <span class="adm-brand__tag"><span class="adm-brand__word">Haldus</span>${dev ? ' <span class="adm-badge adm-badge--warn" title="Kohalik arendus (NETLIFY_DEV)">arendus</span>' : ''}</span>
      </a>
      <nav class="adm-nav" aria-label="Halduse vaated">${nav}</nav>
      <div class="adm-header__actions">
        <a class="adm-btn adm-btn--ghost adm-btn--sm adm-hide-sm" href="/" target="_blank" rel="noopener">Pood ↗</a>
        <button class="adm-btn adm-btn--ghost adm-btn--sm" type="button" data-logout>Logi välja</button>
      </div>
    </div>
  </header>
  <main class="adm-main" id="view" tabindex="-1" aria-live="polite">
    <div class="adm-loading" role="status">Laen…</div>
  </main>
  <div class="adm-toast-region" aria-live="polite" aria-atomic="true"></div>
  <noscript><p class="adm-alert adm-alert--error">Halduspaneel vajab JavaScripti.</p></noscript>
</body>
</html>`;
}

/**
 * GET /admin, /admin/* — sisselogimata: sisselogimisleht; sisseloginult: rakenduse kest.
 * @param {{env?:object, now?:()=>Date}} deps
 */
export function createPageHandler({ env = process.env, now = () => new Date() } = {}) {
  return async function adminPage(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('Lubatud on ainult GET-päring.', { status: 405, headers: { ...ADMIN_PAGE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' } });
    }
    const cfg = authConfig(env);
    const session = getSession(req, { env, now: now(), cfg });
    const html = session ? renderAppShell({ dev: cfg.dev }) : renderLoginPage({ reason: cfg.enabled ? '' : cfg.reason, dev: cfg.dev && cfg.enabled && Boolean(cfg.devPassword) });
    return new Response(req.method === 'HEAD' ? null : html, { status: 200, headers: ADMIN_PAGE_HEADERS });
  };
}
