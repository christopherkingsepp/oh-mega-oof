#!/usr/bin/env node
// Teeb lehest ekraanipildi ja logib konsoolivead (testimiseks).
//   node scripts/screenshot.mjs /mida-viiu out.png [--mobile] [--full] [--base=http://localhost:8080] [--wait=1200]
// Vanusekontroll ja sooduspopup on vaikimisi juba "läbitud" (localStorage), et need pilti ei segaks;
// lisa --fresh, et näha lehte nagu esmakülastaja.
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? true];
  }),
);
const [path = '/', out = 'screenshot.png'] = args.filter((a) => !a.startsWith('--'));
const base = flags.base || 'http://localhost:8080';

const browser = await chromium.launch();
const context = await browser.newContext(
  flags.mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
);
if (!flags.fresh) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('age_agegate_ok', '1');
      localStorage.setItem('age_promo_seen', String(Date.now()));
    } catch {}
  });
}
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
await page.goto(base + path, { waitUntil: 'networkidle' }).catch((e) => errors.push(`goto: ${e.message}`));
await page.waitForTimeout(Number(flags.wait || 1200));
await page.screenshot({ path: out, fullPage: Boolean(flags.full) });
console.log(`saved ${out}`);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
else console.log('no console errors');
await browser.close();
