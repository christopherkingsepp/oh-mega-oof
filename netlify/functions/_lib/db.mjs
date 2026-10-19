// Andmebaasi ühendus ühe liidesega: `await db.query(sql, params) → rows`.
//
//  • Tootmine (Netlify): Netlify DB / Neon Postgres. Ühendus tuleb keskkonnamuutujast
//    NETLIFY_DATABASE_URL (Netlify seab selle ise, kui DB on lisatud) või DATABASE_URL.
//    Kasutame HTTP-draiverit (@netlify/neon) — iga päring on eraldi ja atomaarne, seega
//    olekumuutused tehakse ÜHE SQL-lausega (CTE-d), mitte interaktiivsete tehingutena.
//  • Kohalik arendus: kui ühenduse URL-i pole, kasutatakse PGlite'i (Postgres WASM-is),
//    andmed kaustas .data/pglite (PGLITE_DIR). Testides süstitakse mälus PGlite (setDb()).
//
// Skeem rakendatakse automaatselt esimesel päringul (idempotentne, vt schema.mjs).
import { SCHEMA_SQL } from './schema.mjs';

let current = null; // { query, close?, kind }
let migrated = null; // Promise

/** Kas tootmisandmebaas on seadistatud? */
export function databaseUrl(env = process.env) {
  return (env.NETLIFY_DATABASE_URL || env.DATABASE_URL || '').trim();
}

async function createNeon(url) {
  const { neon } = await import('@netlify/neon');
  const sql = neon(url);
  return {
    kind: 'neon',
    async query(text, params = []) {
      return sql.query(text, params);
    },
    async exec(text) {
      // HTTP-draiver ei luba mitut lauset ühes päringus → jagame skeemi lauseteks.
      for (const stmt of splitStatements(text)) await sql.query(stmt, []);
    },
  };
}

async function createPglite(dir) {
  // Dünaamiline import muutujaga, et Netlify bundler ei paneks PGlite'i tootmisfunktsiooni.
  const mod = '@electric-sql/pglite';
  const { PGlite } = await import(/* @vite-ignore */ mod);
  const pg = dir ? new PGlite(dir) : new PGlite();
  await pg.waitReady;
  return wrapPglite(pg);
}

export function wrapPglite(pg) {
  return {
    kind: 'pglite',
    pg,
    async query(text, params = []) {
      const res = await pg.query(text, params);
      return res.rows;
    },
    async exec(text) {
      await pg.exec(text);
    },
    async close() {
      await pg.close();
    },
  };
}

/** Jagab SQL-teksti lauseteks (lihtne: skeemis pole stringides semikooloneid). */
export function splitStatements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Tagastab andmebaasi (luues ja migreerides selle vajadusel).
 * Viskab vea koodiga DB_NOT_CONFIGURED, kui tootmises pole ühendust seadistatud.
 */
export async function getDb(env = process.env) {
  if (!current) {
    const url = databaseUrl(env);
    if (url) current = await createNeon(url);
    // Netlify funktsioonid jooksevad AWS Lambdas: seal PGlite'i (ajutine kettaruum) EI kasutata.
    else if (env.AWS_LAMBDA_FUNCTION_NAME && !env.NETLIFY_DEV) {
      const err = new Error('Andmebaas pole seadistatud (NETLIFY_DATABASE_URL puudub).');
      err.code = 'DB_NOT_CONFIGURED';
      throw err;
    } else current = await createPglite(env.PGLITE_DIR || '.data/pglite');
  }
  if (!migrated) {
    migrated = current.exec(SCHEMA_SQL).catch((err) => {
      migrated = null;
      throw err;
    });
  }
  await migrated;
  return current;
}

/** Testide ja skriptide jaoks: kasuta etteantud andmebaasi (nt mälus PGlite). */
export async function setDb(db, { migrate = true } = {}) {
  current = db;
  migrated = migrate ? db.exec(SCHEMA_SQL) : Promise.resolve();
  await migrated;
  return db;
}

/** Testide jaoks: uus tühi mälus andmebaas. */
export async function createMemoryDb() {
  const db = await createPglite(null);
  return setDb(db);
}

export function resetDbForTests() {
  current = null;
  migrated = null;
}
