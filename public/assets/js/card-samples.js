// Oled Semu? ja Vigur: valik päris kaarte (esi- ja tagaküljed) tootelehtede jaoks.
// Lõigatud mängu kaardi-PDF-ist (scripts/assets/cards.py). Pildid on 1074×693 px horisontaalsed
// WebP-d alfaga ümarate nurkadega (sama formaat esi- ja tagaküljel).
//
// NB tagaküljed: Oled Semu? küsimuskaardi tagakülg (suur täht Ä/G/E + punktid) on kujundatud püstiselt;
// päriskaart on horisontaalne, seega on pilt salvestatud kaardi formaadis ja kujundus on 90° pööratud
// (loetav alt üles) — täpselt nagu kaarti ümber pöörates. Boonuskaartide ja Viguri tagaküljed on horisontaalsed.
// Puhas ESM ilma DOM-ita.
//
//   import { CARD_SAMPLES, CARD_SAMPLE_SIZE } from '/assets/js/card-samples.js';
//   CARD_SAMPLES['oled-semu'][0] // { id, kind, front, back, text, meta, alt, … }

const SEMU = '/assets/img/cards/oled-semu';
const VIGUR = '/assets/img/cards/vigur';

/** Kaardipildi loomulik suurus (px) — kasuta <img width/height> atribuutides. */
export const CARD_SAMPLE_SIZE = Object.freeze({ width: 1074, height: 693 });

/** Oled Semu? punktitasemed: värvid mõõdetud päris kaartidelt (esikülje gradient ülevalt alla, `color` = keskmine toon). */
export const SEMU_LEVELS = Object.freeze({
  100: Object.freeze({ points: 100, color: '#2e96c9', gradient: 'linear-gradient(180deg, #5adde5 0%, #2e96c9 50%, #004bad 100%)' }),
  200: Object.freeze({ points: 200, color: '#a96ae1', gradient: 'linear-gradient(180deg, #546ffc 0%, #a76be1 50%, #fd67c5 100%)' }),
  300: Object.freeze({ points: 300, color: '#40b884', gradient: 'linear-gradient(180deg, #0198b0 0%, #40b882 50%, #7ad859 100%)' }),
  400: Object.freeze({ points: 400, color: '#ff6140', gradient: 'linear-gradient(180deg, #ff3331 0%, #ff6140 50%, #ff904d 100%)' }),
  500: Object.freeze({ points: 500, color: '#c555aa', gradient: 'linear-gradient(180deg, #fd565a 0%, #c554ac 50%, #8d52fa 100%)' }),
});

const semu = (id, letter, points, text) =>
  Object.freeze({
    id,
    kind: 'kusimus',
    letter,
    points,
    front: `${SEMU}/${id}.webp`,
    back: `${SEMU}/back-${letter === 'Ä' ? 'a' : letter.toLowerCase()}${points}.webp`,
    text,
    meta: `${letter} · ${points} punkti`,
    alt: `Oled Semu? küsimuskaart (${letter}, ${points} punkti): ${text}`,
  });

const semuBonus = (id, n, text) =>
  Object.freeze({
    id,
    kind: 'boonus',
    letter: null,
    points: null,
    front: `${SEMU}/${id}.webp`,
    back: `${SEMU}/back-boonus${n}.webp`,
    text,
    meta: `Boonuskaart · ${n}/7`,
    alt: `Oled Semu? boonuskaart ${n}/7: ${text}`,
  });

const vigur = (id, kind, text) =>
  Object.freeze({
    id,
    kind,
    front: `${VIGUR}/${id}.webp`,
    back: `${VIGUR}/${kind === 'olukord' ? 'back-olukord' : 'back-shh'}.webp`,
    text,
    meta: kind === 'olukord' ? 'Olukorrakaart' : 'Shh-kaart',
    alt: kind === 'olukord' ? `Viguri olukorrakaart: ${text}` : `Viguri Shh-kaart: ${text}`,
  });

export const CARD_SAMPLES = Object.freeze({
  'oled-semu': Object.freeze([
    semu('g100-ananassid', 'G', 100, 'Kas minu arust sobivad ananassid pitsale?'),
    semu('a200-kelleks', 'Ä', 200, 'Kelleks ma tahtsin väiksena saada?'),
    semu('a300-kohting', 'Ä', 300, 'Kuhu ma viiksin oma kaaslase esimesele kohtingule?'),
    semu('e400-narvi', 'E', 400, 'Mis mind kõige rohkem inimestes närvi ajab?'),
    semu('g500-president', 'G', 500, 'Kui ma oleksin president, mis oleks minu esimene otsus või tegu?'),
    semuBonus('boonus1-pikem', 1, 'Vasta kõige pikema mängija ühele küsimusele'),
    semuBonus('boonus3-lyhem', 3, 'Vasta kõige lühema mängija ühele küsimusele'),
  ]),
  vigur: Object.freeze([
    vigur('olukord-eelmine-synnipaev', 'olukord', 'Eelmine sünnipäev'),
    vigur('olukord-parim-spikker', 'olukord', 'Parim spikker, mille olen teinud'),
    vigur('olukord-raha-kogusin', 'olukord', 'Esimene asi, milleks raha kogusin'),
    vigur('olukord-lemmikmanguasi', 'olukord', 'Lemmikmänguasi, mida olen omanud'),
    vigur('shh-raagi-tott', 'shh', 'Räägi tõtt!'),
    vigur('shh-valeta', 'shh', 'Valeta!'),
  ]),
});

/** Ainult tagaküljed (nt kaardipaki kujutamiseks). */
export const CARD_BACKS = Object.freeze({
  'oled-semu': Object.freeze([...new Set(CARD_SAMPLES['oled-semu'].map((c) => c.back))]),
  vigur: Object.freeze([`${VIGUR}/back-olukord.webp`, `${VIGUR}/back-shh.webp`]),
});
