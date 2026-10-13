// Ühilduvuskiht: package.json-i "npm test" käivitab `node --test tests/`.
// Node 22+ käsitleb kaustanime moodulina ja laeb selle faili, mis omakorda
// impordib kõik *.test.mjs failid. (Node 20 leiab testifailid kaustast ise ega
// käivita seda faili.) Kui "test" skript muudetakse kujule `node --test`, võib
// selle faili kustutada.
import { readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
  await import(new URL(file, dir).href);
}
