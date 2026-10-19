// MIDA V!!!U avalik eelvaade: TÄPSELT 19 kaarti (kliendi valik, SPEC2). Ühtegi teist MIDA V!!!U
// mängukaardi teksti ega pilti ei tohi veebis olla — lisa siia uusi kaarte ainult omaniku loal.
//
// Pildid: /assets/img/cards/mida-viiu/<id>.webp — 1074×720 (91×61 mm horisontaalne kaart),
// WebP alfaga ümarad nurgad. Seljad (kaarditüübi tagakülg, mängusisu pole): back-sh/ot/shot/age.webp.
// Puhas ESM ilma DOM-ita: sobib nii brauserile kui serverile/testidele.
//
//   import { PREVIEW_CARDS, CATEGORY_INFO, drawRound } from '/assets/js/preview-cards.js';

const DIR = '/assets/img/cards/mida-viiu';

/** Kaardipildi loomulik suurus (px) — kasuta <img width/height> atribuutides. */
export const CARD_SIZE = Object.freeze({ width: 1074, height: 720 });

/**
 * Kaarditüübid päris reeglikaartide järgi. `label` = väike pealkiri kaardil, `name` = tüübi nimi
 * (reeglites), `gradient`/`color` on võetud päris kaartidelt.
 */
export const CATEGORY_INFO = Object.freeze({
  sh: Object.freeze({
    id: 'sh',
    code: 'SH',
    name: 'Oled semu?',
    label: 'Oled semu?',
    count: 25,
    short: 'Küsi küsimus enda kohta — kes sind päriselt tunneb?',
    description:
      'Kaardi tõmbaja loeb kaardil oleva küsimuse ette ja küsib seda enda kohta. Kes vastab õigesti, saab kaardi endale. Vastused on aususe peale.',
    color: '#fb05ce',
    gradient: 'linear-gradient(90deg, #fb05ce 0%, #7f61e6 50%, #05beff 100%)',
    back: `${DIR}/back-sh.webp`,
  }),
  ot: Object.freeze({
    id: 'ot',
    code: 'OT',
    name: 'Most likely to',
    label: 'Kõige tõenäolisem inimene…',
    count: 25,
    short: 'Grupp otsustab, kellest kaardil räägitakse.',
    description:
      'Kaardi tõmbaja loeb kaardi ette ja grupp otsustab, kes on kõige tõenäolisemalt see inimene, keda kaardil kirjeldatakse. Väljavalitu saab kaardi endale.',
    color: '#fc9605',
    gradient: 'linear-gradient(90deg, #fc9605 0%, #d24d7e 50%, #a803f8 100%)',
    back: `${DIR}/back-ot.webp`,
  }),
  shot: Object.freeze({
    id: 'shot',
    code: 'SHOT',
    name: 'Tee või joo',
    label: 'Tee või joo',
    count: 25,
    short: 'Tõde/tegu või joo — vali ise.',
    description:
      'Tõde/tegu või joo: kaardi tõmbaja kas teeb nii, nagu kaardil palutakse, või võtab ühe shoti. Kui ta teeb ülesande ära, saadab ta shoti vabalt valitud mängijale.',
    color: '#990dff',
    gradient: 'linear-gradient(180deg, #09b8ff 0%, #990dff 30%, #d500e7 50%, #fd0dbe 70%, #fb910f 100%)',
    back: `${DIR}/back-shot.webp`,
  }),
  age: Object.freeze({
    id: 'age',
    code: 'ÄGE',
    name: 'Boonuskaart',
    label: 'Boonuskaart',
    count: 5,
    short: 'Wildcard — väljapääsu pole!',
    description:
      'ÄGE boonuskaart ehk wildcard: grupp või mängija teeb täpselt nii, nagu kaardil kirjas. Väljapääsu pole! Mõni boonuskaart tuleb sulle kasuks, mõni mitte.',
    color: '#00f764',
    gradient: 'linear-gradient(to bottom right, #02c8f0 0%, #00f764 20%, #fd02cd 50%, #8d00ff 80%, #1002fd 100%)',
    back: `${DIR}/back-age.webp`,
  }),
});

/** Boonuskaardi mõju (ainult type 'age'). */
export const BONUS_INFO = Object.freeze({
  plus: Object.freeze({ id: 'plus', label: 'Kasulik', description: 'See boonuskaart tuleb sulle kasuks.' }),
  minus: Object.freeze({ id: 'minus', label: 'Ebasoodne', description: 'See boonuskaart sulle ei meeldi — aga väljapääsu pole.' }),
});

/** Kogu paki üldreegel (reeglikaardilt). */
export const SHOT_RULE = 'Kaardipakis on kolme sorti kaarte: SH, OT ja SHOT. Iga kord, kui saad kaartidest kokku sõna SHOT, võid kellelegi shoti saata.';

const card = (id, type, text, bonus = null) =>
  Object.freeze({
    id,
    type,
    bonus,
    label: CATEGORY_INFO[type].label,
    text,
    img: `${DIR}/${id}.webp`,
    back: CATEGORY_INFO[type].back,
    alt: `MIDA V!!!U ${CATEGORY_INFO[type].code}-kaart (${CATEGORY_INFO[type].label}): ${text}`,
  });

/** Eelvaate 19 kaarti (tekstid täpselt kaartidelt, korrektse kirjaviisiga). */
export const PREVIEW_CARDS = Object.freeze([
  card('sh-go-to-jook', 'sh', 'Minu go to alkoholiga jook?'),
  card('sh-suurim-viga', 'sh', 'Mu suurim viga täis peaga?'),
  card('sh-vangi', 'sh', 'Mille eest ma vangi läheksin? (parim vastus saab kaardi)'),
  card('sh-first-kiss', 'sh', 'Mu first kiss?'),
  card('sh-varastanud', 'sh', 'Kas ma olen kunagi midagi varastanud?'),
  card('ot-kaklus', 'ot', 'Kes satub kaklustesse?'),
  card('ot-friikim', 'ot', 'Kes siit grupist on kõige friikim?'),
  card('ot-kaob-ara', 'ot', 'Kes kaob ära õhtu jooksul?'),
  card('ot-korgijook', 'ot', 'Kes kõige tõenäolisemalt korgijooki annab?'),
  card('ot-kaotab-asjad', 'ot', 'Kes kaotaks täis peaga kõik oma asjad ära?'),
  card('shot-korv', 'shot', 'Kõige piinlikum inimene, kellelt olen korvi saanud?'),
  card('shot-telefon', 'shot', 'Anna oma telefon viieks minutiks teiste kasutusse'),
  card('shot-seltskond-teo', 'shot', 'Seltskond ütleb sulle teo'),
  card('shot-kusib-mida', 'shot', 'Seltskond küsib sinult ükskõik mida'),
  card('shot-syles', 'shot', 'Grupp valib kellegi, kes istub kaks ringi su süles'),
  card('age-paased-shotist', 'age', 'Pääsed järgmisest shotist', 'plus'),
  card('age-koik-peale-sinu', 'age', 'Kõik peale sinu joovad!', 'plus'),
  card('age-grupp-valib', 'age', 'Grupp valib, kellele ja mida sa kirjutad', 'minus'),
  card('age-pealekas', 'age', 'Pealekas läinud kolmeks ringiks', 'minus'),
]);

/** Kaart id järgi (või undefined). */
export const previewCard = (id) => PREVIEW_CARDS.find((c) => c.id === id);

/**
 * Üks eelvaate voor: `size` erinevat kaarti 19-st segatud järjekorras (ühe vooru sees kordusi pole).
 * Kui `previousIds` on antud, ei ole uus voor täpselt sama kaardihulk mis eelmine (võib osaliselt kattuda).
 * `random` — valikuline juhuarvu funktsioon [0, 1) (testide jaoks).
 */
export function drawRound(size = 10, previousIds = null, random = Math.random) {
  const n = Math.max(1, Math.min(PREVIEW_CARDS.length, Math.floor(size) || 10));
  const prev = previousIds ? new Set(previousIds) : null;
  for (let attempt = 0; ; attempt++) {
    const deck = PREVIEW_CARDS.slice();
    // Fisher–Yates
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const round = deck.slice(0, n);
    const same = prev && prev.size === n && round.every((c) => prev.has(c.id));
    // n === 19 korral on hulk paratamatult sama; muidu proovi uuesti (kordus on väga ebatõenäoline)
    if (!same || n === PREVIEW_CARDS.length || attempt > 20) return round;
  }
}
