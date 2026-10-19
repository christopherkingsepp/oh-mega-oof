#!/usr/bin/env node
// Halduspaneeli parooli räsi loomine:  npm run admin:hash
//
// Küsib parooli (sisestus on peidetud) kaks korda ja prindib:
//   ADMIN_PASSWORD_HASH=scrypt$N$r$p$sool$räsi   ← lisa Netlify keskkonnamuutujatesse
//   ADMIN_SESSION_SECRET=…                       ← juhuslik saladus seansiküpsiste allkirjastamiseks
//
// Parooli võib anda ka torust (nt CI-s):  printf '%s' 'minu parool' | npm run admin:hash --silent
// Parooli EI salvestata ega prindita kuhugi. Ära anna parooli käsurea argumendina (jääb ajalukku).
import readline from 'node:readline';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, MAX_PASSWORD_LENGTH } from '../netlify/functions/_lib/admin-auth.mjs';

const MIN_LENGTH = 10;
const RECOMMENDED_LENGTH = 14;

/** Küsib terminalist peidetud sisestusega. */
function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
      else if (/[\r\n]/.test(s)) rl.output.write('\n');
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0];
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

async function main() {
  let password;
  if (process.stdin.isTTY) {
    console.log('ÄGE halduspaneeli parooli räsi\n');
    console.log(`Vali pikk parool (vähemalt ${MIN_LENGTH}, soovitatavalt ${RECOMMENDED_LENGTH}+ märki, nt 3–4 juhuslikku sõna).`);
    password = await promptHidden('Parool: ');
    const again = await promptHidden('Korda parooli: ');
    if (password !== again) fail('Paroolid ei kattu. Proovi uuesti.');
  } else {
    password = await readStdin();
  }

  if (!password) fail('Parool puudub.');
  if (password.length > MAX_PASSWORD_LENGTH) fail(`Parool on liiga pikk (kuni ${MAX_PASSWORD_LENGTH} märki).`);
  if (Array.from(password).length < MIN_LENGTH) fail(`Parool on liiga lühike (vähemalt ${MIN_LENGTH} märki).`);
  if (password.trim() !== password) console.warn('⚠ Parooli alguses või lõpus on tühik — see on parooli osa.');

  const hash = hashPassword(password);
  if (!verifyPassword(password, hash)) fail('Räsi kontroll ebaõnnestus (ootamatu viga).');
  const secret = randomBytes(48).toString('base64url');

  console.log(`
Lisa need Netlify keskkonnamuutujatesse (Site configuration → Environment variables),
märgi need salajaseks (Secret) ja tee seejärel uus deploy:

ADMIN_PASSWORD_HASH=${hash}
ADMIN_SESSION_SECRET=${secret}

Märkused:
 • Räsis on $-märgid — Netlify liideses kopeeri väärtus täpselt nii. Kohalikus .env failis
   pane väärtus ühekordsetesse jutumärkidesse: ADMIN_PASSWORD_HASH='${hash.slice(0, 18)}…'
 • ADMIN_SESSION_SECRET-i vahetus (või uus parool) logib kõik seadmed halduspaneelist välja.
 • Halduspaneel: /admin`);
  if (Array.from(password).length < RECOMMENDED_LENGTH) console.warn(`\n⚠ Soovitus: kasuta vähemalt ${RECOMMENDED_LENGTH}-märgilist parooli.`);
}

main().catch((err) => fail(err?.message || String(err)));
