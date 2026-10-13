# ÄGE veebipood

See on Tallinna kaardimängufirma **ÄGE** (Äärmiselt Geniaalne Ettevõtmine) e-pood. Müügil on **MIDA V!!!U** (18+), **Oled Semu?** ja **Vigur** ning nende komplektid. Tarne käib Eesti pakiautomaatidesse (Omniva, SmartPost, DPD) ja maksed Stripe Checkouti kaudu (kaart, Apple Pay, Google Pay).

👉 **Omanikule: samm-sammuline juhend on failis [JUHEND.md](JUHEND.md).** Sealt leiad avaldamise, maksed, tellimuste täitmise, hindade muutmise ja õigusliku kontrollnimekirja.

## Tehnoloogia

- **Staatiline sait:** HTML, CSS ja JavaScripti moodulid. Ehitusetappi pole.
- **Netlify Functions** (Node 22):
  - `POST /api/checkout` arvutab summa serveris uuesti ja loob Stripe Checkout Session'i,
  - `GET /api/pakiautomaadid?carrier=omniva|smartpost|dpd` tagastab pakiautomaatide nimekirja.
- **Netlify Forms:** vorm `soodus` kogub −15% hüpiku e-poste.
- Hinnad, tarne ja sooduskoodid on ühes kohas, failis `assets/js/catalog.js`. Seda kasutavad nii brauser kui ka server.

## Struktuur

```
.
├── index.html                 avaleht
├── mida-viiu.html             tootelehed (/mida-viiu, /oled-semu, /vigur)
├── oled-semu.html
├── vigur.html
├── ostukorv.html              ostukorv + kassa (/ostukorv)
├── aitah.html                 tänuleht pärast makset (/aitah)
├── kkk.html, tingimused.html, privaatsus.html
├── assets/
│   ├── css/                   base.css (disainisüsteem) + lehtede stiilid
│   ├── img/                   brand/, games/, cards/
│   └── js/
│       ├── catalog.js         tooted, hinnad, tarne, sooduskoodid, computeTotals()
│       ├── site.js            ettevõtte andmed, kontaktid, Pacdora link
│       ├── cart.js            ostukorv (localStorage)
│       ├── layout.js          päis, jalus, ostukorvi sahtel, toastid
│       ├── main.js            iga lehe sisendpunkt (layout + vanusekontroll + hüpik)
│       ├── box3d.js           3D-karp
│       └── home.js, product.js, checkout.js, aitah.js, promo.js, agegate.js
├── netlify/functions/
│   ├── create-checkout.mjs    → /api/checkout
│   ├── parcel-lockers.mjs     → /api/pakiautomaadid
│   └── _lib/                  valideerimine, Stripe'i parameetrid, pakiautomaatide allikad
├── netlify.toml               publish ".", functions, turvapäised (CSP), puhverdus
├── .env.example               keskkonnamuutujate näidis
├── scripts/                   dev-server.mjs, screenshot.mjs
└── tests/                     node:test testid + näidisandmed
```

URL-id on ilma `.html` lõputa (Netlify Pretty URLs): `/mida-viiu` → `mida-viiu.html`.

## Kiirstart

Vaja on Node.js 20+ (soovitatavalt 22).

```bash
npm install
npm run dev:mock   # http://localhost:8080, /api/* tagastab näidisandmeid (Stripe'i pole vaja)
npm run dev        # päris funktsioonid, vajab keskkonnas STRIPE_SECRET_KEY väärtust
npm test           # automaattestid
```

Päris funktsioonid `.env` failiga: `cp .env.example .env`, täida võti ja käivita `node --env-file=.env scripts/dev-server.mjs`.
Teise pordi saad nii: `PORT=8090 npm run dev:mock`.

## Keskkonnamuutujad

| Nimi | Kohustuslik | Kirjeldus |
|---|---|---|
| `STRIPE_SECRET_KEY` | jah | `sk_test_…` või `sk_live_…`. Pane see Netlifysse ja **mitte kunagi** koodi |
| `DPD_LOCKERS_URL` | ei | DPD automaatide JSON-nimekirja aadress. Kui see puudub, sisestab klient DPD automaadi käsitsi |

## Avaldamine

Netlify on ühendatud GitHubi repoga `christopherkingsepp/oh-mega-oof`, haruga `main`. Build command on tühi, publish directory on `.` ja seadistus on failis `netlify.toml`. Iga push `main` harusse avaldatakse automaatselt. Täpsed sammud on failis [JUHEND.md](JUHEND.md) (peatükid 2–8).
