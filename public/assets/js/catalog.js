// Ühtne tootekataloog. Seda faili kasutavad NII veebileht (brauser) KUI ka
// makse-funktsioon (netlify/functions/create-checkout.mjs), et hinnad oleksid
// alati samad ja keegi ei saaks brauseris hinda muuta.
//
// Hinna muutmiseks muuda siin `price` väärtust (eurodes) ja tee uus deploy.

export const CURRENCY = 'EUR';

export const PRODUCTS = {
  'mida-viiu': {
    id: 'mida-viiu',
    name: 'MIDA V!!!U',
    tagline: 'Rohkem kui kaardimäng',
    price: 17.5,
    badge: 'UUS',
    adult: true,
    url: '/mida-viiu',
    // Visuaalid (scripts/assets/*): image = väike tootepilt 240x240 (läbipaistev, 3/4 nurk — ostukorv,
    // sahtel, kassa, toast, kataloog), box = sama 900x900, imagePng = 480x480 PNG (Stripe, e-kirjad),
    // cover = 16:9 kaanepilt 1600x900, faces/dims = 3D karbi (box3d.js) kuus tahku ja mõõdud.
    image: '/assets/img/games/mida-viiu-box-sm.webp',
    box: '/assets/img/games/mida-viiu-box.webp',
    imagePng: '/assets/img/games/mida-viiu-box.png',
    cover: '/assets/img/games/mida-viiu-cover.webp',
    faces: {
      front: '/assets/img/games/mida-viiu/front.webp',
      back: '/assets/img/games/mida-viiu/back.webp',
      left: '/assets/img/games/mida-viiu/left.webp',
      right: '/assets/img/games/mida-viiu/right.webp',
      top: '/assets/img/games/mida-viiu/top.webp',
      bottom: '/assets/img/games/mida-viiu/bottom.webp',
    },
    dims: { w: 1, h: 1.543, d: 0.601 },
    accent: '#ff2fa8',
    gradient: 'radial-gradient(120% 120% at 50% 0%, #ff2fa8 0%, #6d0047 45%, #0b0108 100%)',
    short: '85 kaarti, 50+ shotti ja ainult üks reegel: väljapääsu pole. 18+ seltskonnamäng, mis teeb igast õhtust loo, mida järgmisel päeval veel räägitakse.',
    facts: ['85 kaarti', '50+ shotti', '18+', 'Lamineeritud kaardid'],
  },
  'oled-semu': {
    id: 'oled-semu',
    name: 'Oled Semu?',
    tagline: 'Kui hästi sa oma sõpru tegelikult tunned?',
    price: 12.95,
    badge: null,
    adult: false,
    url: '/oled-semu',
    image: '/assets/img/games/oled-semu-box-sm.webp',
    box: '/assets/img/games/oled-semu-box.webp',
    imagePng: '/assets/img/games/oled-semu-box.png',
    cover: '/assets/img/games/oled-semu-cover.webp',
    faces: {
      front: '/assets/img/games/oled-semu/front.webp',
      back: '/assets/img/games/oled-semu/back.webp',
      left: '/assets/img/games/oled-semu/left.webp',
      right: '/assets/img/games/oled-semu/right.webp',
      top: '/assets/img/games/oled-semu/top.webp',
      bottom: '/assets/img/games/oled-semu/bottom.webp',
    },
    dims: { w: 1, h: 1.543, d: 0.601 },
    accent: '#6f7bff',
    gradient: 'linear-gradient(100deg, #0a4bb5 0%, #c56be0 100%)',
    short: '75 küsimust viies raskusastmes, 7 boonuskaarti ja punktivargus. Mäng, mis näitab, kes on päriselt semu.',
    facts: ['85 kaarti', '75 küsimust', '7 boonuskaarti', '12+'],
  },
  vigur: {
    id: 'vigur',
    name: 'Vigur',
    tagline: 'Räägi tõtt või valeta. Kas nad usuvad sind?',
    price: 12.95,
    badge: null,
    adult: false,
    url: '/vigur',
    image: '/assets/img/games/vigur-box-sm.webp',
    box: '/assets/img/games/vigur-box.webp',
    imagePng: '/assets/img/games/vigur-box.png',
    cover: '/assets/img/games/vigur-cover.webp',
    faces: {
      front: '/assets/img/games/vigur/front.webp',
      back: '/assets/img/games/vigur/back.webp',
      left: '/assets/img/games/vigur/left.webp',
      right: '/assets/img/games/vigur/right.webp',
      top: '/assets/img/games/vigur/top.webp',
      bottom: '/assets/img/games/vigur/bottom.webp',
    },
    dims: { w: 1, h: 1.543, d: 0.601 },
    accent: '#ff1f6b',
    gradient: 'linear-gradient(100deg, #ff00b4 0%, #e8123f 100%)',
    short: '50 olukorrakaarti ja 32 „Shh“-tegevuskaarti. Bluffi, naera ja arva ära, kes valetab.',
    facts: ['82 kaarti', '50 olukorda', '32 tegevuskaarti', '12+'],
  },
  'komplekt-semu-vigur': {
    id: 'komplekt-semu-vigur',
    name: 'Oled Semu? + Vigur',
    tagline: 'Klassikute komplekt',
    price: 20.0,
    badge: 'KOMPLEKT',
    adult: false,
    url: '/#mangud',
    // komplekti pilt: mõlemad karbid koos (image 240x240, box 900x900, imagePng 480x480)
    image: '/assets/img/games/komplekt-semu-vigur-sm.webp',
    box: '/assets/img/games/komplekt-semu-vigur.webp',
    imagePng: '/assets/img/games/komplekt-semu-vigur.png',
    includes: ['oled-semu', 'vigur'],
    accent: '#a35cff',
    gradient: 'linear-gradient(100deg, #0a4bb5 0%, #ff00b4 100%)',
    short: 'Mõlemad klassikud koos. Säästad 5,90 €.',
    facts: ['2 mängu', 'Säästad 5,90 €'],
  },
  'komplekt-koik': {
    id: 'komplekt-koik',
    name: 'Kõik 3 mängu',
    tagline: 'ÄGE täiskomplekt',
    price: 33.0,
    badge: 'PARIM DIIL',
    adult: true,
    url: '/#komplekt',
    // komplekti pilt: kõik kolm karpi koos (image 240x240, box 900x900, imagePng 480x480)
    image: '/assets/img/games/komplekt-koik-sm.webp',
    box: '/assets/img/games/komplekt-koik.webp',
    imagePng: '/assets/img/games/komplekt-koik.png',
    includes: ['mida-viiu', 'oled-semu', 'vigur'],
    accent: '#ff2fa8',
    gradient: 'linear-gradient(100deg, #0a4bb5 0%, #ff2fa8 55%, #e8123f 100%)',
    short: 'MIDA V!!!U + Oled Semu? + Vigur. Säästad 10,40 €.',
    facts: ['3 mängu', 'Säästad 10,40 €'],
  },
};

// Tarne pakiautomaati. Hind eurodes; tasuta tarne alates `freeFrom` eurost
// (arvestatakse pärast sooduskoodi).
export const SHIPPING = {
  price: 2.99,
  freeFrom: 30,
  // Pakiautomaadivõrgud. `price` = tarnehind eurodes (tasuta alates freeFrom). Millised neist on
  // ostmisel PÄRISELT valitavad, otsustab server keskkonnamuutujaga ENABLED_CARRIERS (vt .env.example).
  carriers: {
    omniva: { id: 'omniva', name: 'Omniva', label: 'Omniva pakiautomaat', price: 2.99, eta: '1–3 tööpäeva' },
    smartpost: { id: 'smartpost', name: 'SmartPosti', label: 'SmartPosti pakiautomaat', price: 2.99, eta: '1–3 tööpäeva' },
    dpd: { id: 'dpd', name: 'DPD', label: 'DPD Pickup pakiautomaat', price: 2.99, eta: '1–3 tööpäeva' },
  },
};

// Sooduskoodid: kood -> protsent. Hüpikaknas jagatav kood on WELCOME_CODE.
export const WELCOME_CODE = 'AGE15';
export const DISCOUNT_CODES = {
  AGE15: 15,
};

export const MAX_QTY_PER_ITEM = 20;

/** Laoartiklid: ainult mängud. Komplektid koosnevad neist (PRODUCTS[id].includes). */
export const GAMES = ['mida-viiu', 'oled-semu', 'vigur'];

/** Komplekti sisu koos kogustega: [{ id, name, qty }] (tavalisel mängul [{ id, name, qty: 1 }]). */
export function productContents(id) {
  const p = Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? PRODUCTS[id] : null;
  if (!p) return [];
  const ids = p.includes?.length ? p.includes : [p.id];
  const out = [];
  for (const gid of ids) {
    const row = out.find((r) => r.id === gid);
    if (row) row.qty += 1;
    else out.push({ id: gid, name: PRODUCTS[gid].name, qty: 1 });
  }
  return out;
}

/** Mitu tükki igat mängu read sisaldavad (komplektid lahti võetuna): { 'vigur': 3, … }. */
export function gameQuantities(items) {
  const q = {};
  for (const { id, qty } of items) {
    for (const c of productContents(id)) q[c.id] = (q[c.id] || 0) + c.qty * (Number(qty) || 0);
  }
  return q;
}

/** Ümardab sendi täpsusega (väldib 0.1 + 0.2 probleeme). */
export const toCents = (eur) => Math.round(eur * 100);

/**
 * Arvutab ostukorvi summad sentides. Kasutatakse nii brauseris kui serveris.
 * @param {{id:string, qty:number}[]} items
 * @param {string|null} code
 * @param {string|null} [carrier] valitud pakiautomaadivõrk (tarnehinna jaoks)
 */
export function computeTotals(items, code, carrier = null) {
  const lines = [];
  for (const { id, qty } of items) {
    const p = Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? PRODUCTS[id] : null;
    const q = Math.max(0, Math.min(MAX_QTY_PER_ITEM, Math.floor(Number(qty) || 0)));
    if (!p || q === 0) continue;
    lines.push({ product: p, qty: q, unitCents: toCents(p.price), totalCents: toCents(p.price) * q });
  }
  const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);
  const normalized = normalizeCode(code);
  const percent = normalized ? DISCOUNT_CODES[normalized] : 0;
  const discountCents = Math.round((subtotalCents * percent) / 100);
  const afterDiscount = subtotalCents - discountCents;
  const carrierPrice = carrier && SHIPPING.carriers[carrier] ? SHIPPING.carriers[carrier].price : SHIPPING.price;
  const shippingCents = lines.length === 0 || afterDiscount >= toCents(SHIPPING.freeFrom) ? 0 : toCents(carrierPrice);
  return {
    lines,
    code: percent ? normalized : null,
    percent,
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents: afterDiscount + shippingCents,
    freeShippingRemainingCents: Math.max(0, toCents(SHIPPING.freeFrom) - afterDiscount),
  };
}

export function normalizeCode(code) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(DISCOUNT_CODES, c) ? c : null;
}

export function formatEur(cents) {
  return new Intl.NumberFormat('et-EE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
