# ÄGE veebipood

Tallinna kaardimängufirma **ÄGE** (Äärmiselt Geniaalne Ettevõtmine) e-pood. Müügil on **MIDA V!!!U** (18+), **Oled Semu?** ja **Vigur** ning nende komplektid. Tarne käib Eesti pakiautomaatidesse (vaikimisi Omniva ja SmartPosti), maksed Stripe Checkouti kaudu. Tellimused, laoseis ja taganemisavaldused on Postgresi andmebaasis ning neid hallatakse halduspaneelis `/admin`.

👉 **Omanikule: samm-sammuline juhend on failis [JUHEND.md](JUHEND.md)**: avaldamine, Netlify DB, Stripe ja webhook, Resend, halduspaneel, igapäevane töö, õiguslik kontrollnimekiri ja veaotsing.

## Arhitektuur

- **Staatiline sait** (`public/`): HTML, CSS ja brauseri ES-moodulid. Ehitusetappi pole. Netlify avaldab ainult kausta `public`.
- **Netlify Functions v2** (`netlify/functions/`, Node 22): `export default async (req, context) => Response`, aadress failis endas (`export const config = { path }`). Abimoodulid on kaustas `_lib/`. Iga käsitleja on kujul `createHandler({ env, logger, getDb, mailer, stripeFactory, now })`, nii et testides saab sõltuvused süstida.
- **Andmebaas:** Postgres. Tootmises Netlify DB / Neon (`NETLIFY_DATABASE_URL` või `DATABASE_URL`, HTTP-draiver `@netlify/neon`). Interaktiivseid tehinguid pole, seega on iga olekumuutus üks SQL-lause (CTE). Kohalikult PGlite (`.data/pglite`), testides mälus PGlite. Skeem (`_lib/schema.mjs`) rakendatakse automaatselt ja idempotentselt esimesel päringul. Tabelid: `orders`, `stripe_events`, `inventory`, `inventory_movements`, `withdrawals`, `locker_cache`. Tellimuse number tuleb jadast `order_number_seq` (AGE-1001 …). Rahasummad on täisarvulistes sentides, ajad `timestamptz`, kuupäevaarvutused Europe/Tallinn (`_lib/time.mjs`).
- **Ühine kataloog:** `public/assets/js/catalog.js` (tooted, hinnad, komplektide sisu, tarne, vedajad, sooduskoodid, `computeTotals`). Seda kasutavad nii brauser kui ka server. Hinnad ja tarne arvutatakse alati serveris uuesti.
- **Maksed:** Stripe Checkout (`locale: 'et'`, makseviisid töölaua seadetest, soodustus deterministliku kupongina). Makse olek tuleb ainult webhookist või serveripoolsest `checkout.sessions.retrieve`-ist, mitte brauserist.
- **E-post:** Resend (`_lib/mail.mjs`). Kui see pole seadistatud, logitakse hoiatus ja tellimus ei ebaõnnestu.
- **Halduspaneel:** `/admin` serveerib funktsioon (mitte staatiline fail). Üks omaniku parool (scrypt-räsi), HMAC-iga allkirjastatud HttpOnly SameSite=Strict küpsis 12 h, muutvatel päringutel Origin-kontroll, sisselogimisel kiiruspiirang.

### Ostuteekond

1. `POST /api/checkout` valideerib (`_lib/order.mjs`), kontrollib vedajat (`ENABLED_CARRIERS`) ja laoseisu (409, kui ei jätku), loob `orders` rea olekuga `pending` ja Stripe'i Checkout Sessioni (`expires_at` +60 min, `client_reference_id` = `metadata.order_id` = tellimuse UUID) ning tagastab `{ url, orderNumber, token, expiresAt }`.
2. Stripe suunab `success_url`-ile `/aitah?t=TOKEN&session_id=…`. Kinnitusleht küsib `GET /api/tellimus` ja tühjendab ostukorvi ainult olekus `paid` või `processing`.
3. `POST /api/stripe-webhook` kontrollib allkirja (`STRIPE_WEBHOOK_SECRET`) ja on idempotentne (`stripe_events` + olekuvalvurid). Makstud tellimus vähendab laoseisu (komplektid lahti võetuna) ning saadab kinnituskirja kliendile ja teavituse omanikule (iga kiri üks kord).
4. Katkestamisel suunatakse `/ostukorv?katkestatud=1&t=TOKEN`. Kui sessioon kehtib veel, näidatakse nuppu „Jätka makset“.

| Stripe'i sündmus | Tellimuse makse olek |
|---|---|
| `checkout.session.completed` | `paid` (või `processing`, kui `payment_status` on `unpaid`) |
| `checkout.session.async_payment_succeeded` | `paid` |
| `checkout.session.async_payment_failed` | `failed` |
| `checkout.session.expired` | `expired` (ainult `pending`/`processing` olekust) |
| `charge.refunded` | `refunded` / `partially_refunded` (+ `refunded_cents`) |

### API

| Aadress | Fail | Kirjeldus |
|---|---|---|
| `POST /api/checkout` | `create-checkout.mjs` | Tellimus + Stripe'i makseleht (rateLimit 10/min) |
| `POST /api/stripe-webhook` | `stripe-webhook.mjs` | Stripe'i sündmused (toores keha + allkiri) |
| `GET /api/tellimus?t=…[&session_id=…]` | `order-status.mjs` | Kinnituslehe andmed tunnusega; ootel makse puhul sünkroonib Stripe'ist |
| `GET /api/pakiautomaadid?carrier=omniva\|smartpost\|dpd\|all` | `parcel-lockers.mjs` | Automaadid ja vedajate info (`enabled`, `lockerCount`, `stale`, `manual`, `errors`). Puhver `locker_cache` 12 h |
| ajastatud `@daily` | `lockers-refresh.mjs` | Värskendab automaatide puhvrit |
| `POST /api/taganemine` | `withdrawal.mjs` | Taganemisavaldus → viide `TAG-XXXXXX` (rateLimit 5/min) |
| `/admin`, `/admin/*` | `admin-page.mjs` | Sisselogimisleht või halduse kest (`public/assets/admin/`) |
| `POST /api/admin/login` | `admin-login.mjs` | Sisselogimine (rateLimit 10/min + mälupiiraja) |
| `/api/admin/*` | `admin-api.mjs` → `_lib/admin-api.mjs` | `me`, `orders`, `orders.csv`, `orders/:number` (PATCH: täitmise olek, jälgimiskood, märkmed), `packing`, `inventory`, `withdrawals`, `stats`, `calendar`, `logout` |
| `/__mock-stripe/*` | `dev-mock-stripe.mjs` | Ainult kohalik test-Stripe (`MOCK_STRIPE=1` ja mitte Lambdas), muidu 404 |

## Struktuur

```
.
├── public/                    kõik, mis läheb internetti (Netlify publish)
│   ├── index.html, kataloog.html, mida-viiu.html, oled-semu.html, vigur.html
│   ├── ostukorv.html          ostukorv + kassa (/ostukorv)
│   ├── aitah.html             kinnitusleht (/aitah, noindex, no-referrer)
│   ├── taganemine.html        taganemisavalduse vorm
│   ├── kkk.html, tingimused.html, privaatsus.html, 404.html
│   ├── __forms.html           soodusvormi peidetud koopia (Netlify Forms)
│   └── assets/
│       ├── css/               base.css (disainisüsteem) + lehtede stiilid
│       ├── img/               brand/, games/ (karbid ja tahud), cards/ (mida-viiu, oled-semu, vigur)
│       ├── admin/             halduspaneeli JS/CSS (ainult kood, andmed /api/admin/* kaudu)
│       └── js/                catalog.js, site.js, cart.js, layout.js, box3d.js, preview-cards.js,
│                              preview-deck.js, checkout.js, aitah.js, taganemine.js, …
├── netlify/functions/         serverifunktsioonid (vt API) + _lib/
├── netlify.toml               publish "public", functions, Node 22, turvapäised (CSP), puhverdus
├── .env.example               keskkonnamuutujad koos selgitustega
├── scripts/
│   ├── dev-server.mjs         kohalik server (marsruudid loetakse funktsioonide config.path-ist)
│   ├── admin-hash.mjs         halduspaneeli parooli räsi
│   ├── screenshot.mjs         Playwrighti ekraanipildid
│   └── assets/                tootevisuaalide ja kaardipiltide skriptid
├── source/                    pakendi stantsifail ja lähtefailide kirjeldus (source/private/ on gitignore'is)
└── tests/                     node:test testid, tests/helpers.mjs, fixtures/
```

URL-id on ilma `.html` lõputa (Netlify Pretty URLs): `/mida-viiu` → `public/mida-viiu.html`. Kausta `public/` ei tohi panna faili `admin.html` ega kausta `admin/`.

## Käsud

Vaja on Node.js 20+ (soovitatavalt 22).

```bash
npm install
npm run dev:mock     # http://localhost:8080 — test-Stripe, mock-meilid (.data/mail), näidisautomaadid,
                     # päris PGlite andmebaas (.data/pglite), /admin parool "demo-admin"
npm run dev          # päris Stripe/Resend/vedajad; loeb .env faili ise
npm test             # node --test tests/ (200+ testi, mälus PGlite, võrku pole vaja)
npm run admin:hash   # prindib ADMIN_PASSWORD_HASH ja ADMIN_SESSION_SECRET
npm run screenshot -- <tee> <out.png> --base=http://localhost:8080 [--mobile] [--full] [--fresh]
```

Teine port: `PORT=8090 npm run dev:mock`. Kohaliku andmebaasi tühjendamiseks kustuta `.data/pglite`. Webhooki testimiseks päris Stripe'i testrežiimiga: `stripe listen --forward-to localhost:8080/api/stripe-webhook` ja prinditud `whsec_…` faili `.env` (`STRIPE_WEBHOOK_SECRET`), seejärel `npm run dev`.

Kohalik server ei käivita ajastatud funktsioone. Näidisrežiimid (`MOCK_STRIPE`, `MOCK_MAIL`, `MOCK_LOCKERS`) on Lambdas (`AWS_LAMBDA_FUNCTION_NAME`) alati välja lülitatud.

## Keskkonnamuutujad

Täielik kirjeldus on failis [.env.example](.env.example).

| Nimi | Kohustuslik | Kirjeldus |
|---|---|---|
| `NETLIFY_DATABASE_URL` | jah* | Netlify DB seab ise. *Või `DATABASE_URL` (Neoni ühendusaadress, sest draiver on Neoni HTTP-draiver) |
| `STRIPE_SECRET_KEY` | jah | `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | jah | Webhooki endpointi `whsec_…` (test ja live eraldi) |
| `ADMIN_PASSWORD_HASH` | halduseks | `scrypt$N$r$p$saltB64$hashB64` (`npm run admin:hash`) |
| `ADMIN_SESSION_SECRET` | halduseks | ≥ 32 märki. Vahetus logib kõik seansid välja |
| `RESEND_API_KEY`, `MAIL_FROM` | ei | Ilma nendeta kirju ei saadeta (tellimused töötavad) |
| `ADMIN_EMAIL` | ei | Omaniku teavitused (uus tellimus, taganemine) |
| `ENABLED_CARRIERS` | ei | Vaikimisi `omniva,smartpost`. Server keeldub keelatud vedajast (400, `field: 'shipping.carrier'`) |
| `DPD_LOCKERS_URL` | ei | DPD automaatide JSON. Ilma selleta käsitsi sisestus |
| `SITE_URL` | ei | E-kirjade linkide alus. Vaikimisi Netlify `URL` |
| `PGLITE_DIR`, `MAIL_DIR`, `ADMIN_DEV_PASSWORD`, `MOCK_*` | ainult kohalik | Netlifys neid ei kasutata |

## Testid

`npm test` käivitab kõik `tests/*.test.mjs` failid: hinnaarvutus ja valideerimine, tellimuse loomine ja laoseisu kontroll, webhooki allkiri ja idempotentsus, olekuüleminekud ja tagasimaksed, `/api/tellimus`, pakiautomaatide normaliseerijad ja puhver, e-kirjade mallid, taganemine, mock-Stripe, halduse autentimine, API õigused, CSV ja statistika (Tallinna aeg). Abifunktsioonid on failis `tests/helpers.mjs` (`freshDb`, `signedWebhook`, `mockStripe`, `captureMailer` …).

Päris Stripe'i, Resendi, Neoni ja vedajate allikatega pole arenduskeskkonnast testitud (väline võrk puudus). Need on testitud mock'ide, fixture'ite ja päriselt allkirjastatud test-sündmustega.

## Avaldamine

Netlify on ühendatud GitHubi repoga `christopherkingsepp/oh-mega-oof`, haruga `main`. Build command on tühi, publish directory on `public`, functions directory `netlify/functions`. Seadistus on failis `netlify.toml`. Iga push `main` harusse avaldatakse automaatselt, Pull Requestidest tehakse Deploy Preview. Täpsed sammud on failis [JUHEND.md](JUHEND.md).

## Turvalisus ja sisu

- **Repo on avalik** (soovitus: muuta privaatseks). Mängude täisfailid (kaardi-PDF-id, kõik kaardipildid, pakendifotode originaalid) ei tohi minna git'i ega kausta `public/`. Hoia neid kaustas `source/private/` (gitignore'is).
- MIDA V!!!U avalik eelvaade on täpselt 19 kaarti (`public/assets/js/preview-cards.js`, `public/assets/img/cards/mida-viiu/`). Lisaks on lubatud kaarditüüpide seljad.
- Salajased võtmed on ainult keskkonnamuutujates. `.env` ja `.data/` on gitignore'is.
- CSP lubab skripte ainult oma domeenilt (inline-skripte pole), kaadreid ainult Pacdorast ja vormide sihtkohana Stripe'i.
