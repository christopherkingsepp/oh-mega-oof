# ÄGE veebipood: samm-sammuline juhend

Hei! See juhend on sulle, ÄGE omanik. Programmeerimist pole vaja osata. Vaja on brauserit, e-posti, pangakontot ja natuke kannatust.

Juhendi lõpuks:

- on ÄGE pood päriselt internetis (alguses aadressil `age-pood.netlify.app`, hiljem sinu oma domeenil);
- saavad kliendid maksta kaardi, Apple Pay ja Google Payga ning valida Omniva või SmartPosti pakiautomaadi;
- jõuab iga tellimus andmebaasi ja **halduspaneeli** (`/admin`), klient saab kinnituskirja ja sina teavituse;
- tead, kuidas tellimus pakkida ja teele panna, laoseisu pidada, taganemisavaldusi käsitleda ning hindu ja tekste ise muuta.

**Kuidas seda juhendit kasutada**

- **Esimesel korral** käi läbi peatükid **1–12** järjest. Kokku kulub umbes 3–5 tundi. Lisaks tuleb oodata, kuni Stripe sinu ettevõtte andmed üle kontrollib, ja kuni domeeni DNS-kirjed hakkavad tööle (mõlemal mõnest minutist mõne päevani).
- **Pärast avamist** on sinu igapäevane tööriist peatükk **13** (halduspaneel). Hindade, tekstide ja piltide muutmiseks vaata peatükki **16**.
- Kui midagi ei tööta, ava peatükk **19** (veaotsing).
- Linnukestega `- [ ]` loendeid võid välja printida või oma märkmetesse kopeerida ja tehtud asjad maha tõmmata.

> ⚠️ **Tähtis: nuppude nimed võivad muutuda.** Ingliskeelsed nupunimed (nt **Add new project**) on kirjutatud nii, nagu need Netlify, Stripe'i, Resendi ja GitHubi lehtedel selle juhendi kirjutamise ajal olid. Need teenused muudavad oma kujundust tihti. Kui nuppu täpselt sellise nimega ei leia, otsi sarnase tähendusega nuppu, kasuta lehe otsingut või ava teenuse ametlik juhend (lingid on [Lisas C](#lisa-c-kasulikud-lingid)). Kohtades, kus nupu nimi pole kindel, kirjeldab juhend lihtsalt, mida on vaja teha.

---

## Sisukord

0. [Ülevaade](#0-ülevaade)
1. [Mida on vaja enne alustamist](#1-mida-on-vaja-enne-alustamist)
2. [Kood GitHubi põhiharusse](#2-kood-githubi-põhiharusse)
3. [Netlify: pood internetti](#3-netlify-pood-internetti)
4. [Andmebaas: Netlify DB](#4-andmebaas-netlify-db)
5. [Keskkonnamuutujad ehk poe seaded](#5-keskkonnamuutujad-ehk-poe-seaded)
6. [Halduspaneeli parool](#6-halduspaneeli-parool)
7. [Stripe: maksed testrežiimis](#7-stripe-maksed-testrežiimis)
8. [Testtellimus](#8-testtellimus)
9. [Oma domeen](#9-oma-domeen)
10. [E-kirjad: Resend](#10-e-kirjad-resend)
11. [Pakiautomaadid ja vedajad](#11-pakiautomaadid-ja-vedajad)
12. [LIVE-režiim: päris maksed](#12-live-režiim-päris-maksed)
13. [Igapäevane töö halduspaneelis](#13-igapäevane-töö-halduspaneelis)
14. [Eelvaade: vaata muudatusi enne avaldamist](#14-eelvaade-vaata-muudatusi-enne-avaldamist)
15. [Uudiskirja e-postid Netlify Formsiga](#15-uudiskirja-e-postid-netlify-formsiga)
16. [Sisu muutmine: hinnad, tekstid, pildid](#16-sisu-muutmine-hinnad-tekstid-pildid)
17. [Pacdora 3D-mudel](#17-pacdora-3d-mudel)
18. [Õiguslik kontrollnimekiri](#18-õiguslik-kontrollnimekiri)
19. [Veaotsing](#19-veaotsing)
20. [Järgmised sammud ja ideed](#20-järgmised-sammud-ja-ideed)
- [Lisa A: kohalik arendus arvutis](#lisa-a-kohalik-arendus-arvutis)
- [Lisa B: failide kaart](#lisa-b-failide-kaart)
- [Lisa C: kasulikud lingid](#lisa-c-kasulikud-lingid)

---

## 0. Ülevaade

### Mis on valmis

**Lehed**

| Aadress | Mis seal on |
|---|---|
| `/` (avaleht) | MIDA V!!!U tutvustus, pöörlev 3D-karp, **kaardieelvaade**, kõik kolm mängu, komplektid, reeglid, ÄGE lugu, KKK eelvaade ja sotsiaalmeedia lingid |
| `/kataloog` | Kõik mängud ja komplektid ühel lehel (menüüs „Kataloog“ ja „Komplektid“) |
| `/mida-viiu` | MIDA V!!!U tooteleht: 3D-karp kõigist külgedest, kaardieelvaade, reeglid, kogusevalik, mobiilis ekraani alla kinnituv osturiba, nupp **„Vaata 3D-mudelit“** (Pacdora), KKK |
| `/oled-semu`, `/vigur` | Oled Semu? ja Viguri tootelehed päris kaardipiltide ja reeglitega |
| `/ostukorv` | Ostukorv ja kassa ühel lehel: **Sinu ostukorv → Tarne pakiautomaati → Kontaktandmed → Kinnita ja maksa**. Sooduskoodi väli, pakiautomaadi otsing ja kokkuvõte. Nupp **„Maksa …“** viib Stripe'i makselehele |
| `/aitah` | Kinnitusleht. Leht küsib serverilt, kas makse on **päriselt** laekunud, ja näitab tellimuse numbrit, tooteid, summat, pakiautomaati ja olekut. Ostukorv tühjendatakse alles siis, kui makse on kinnitatud (või pangamakse on töötlemisel) |
| `/taganemine` | Taganemisavalduse vorm (14-päevane taganemisõigus). Klient saab ekraanile viitenumbri `TAG-…` ja kinnituse e-postiga |
| `/kkk`, `/tingimused`, `/privaatsus` | KKK, müügitingimused ja privaatsuspoliitika. Loe need enne avamist läbi ja täienda (peatükk 18) |
| `/admin` | **Halduspaneel** (parooliga): tellimused, pakkimine, laoseis, taganemised, statistika ja kalender (peatükk 13) |

**Kaardieelvaade.** MIDA V!!!U lehel ja avalehel saab sirvida **19 avalikku näidiskaarti**. Iga voor on 10 kaarti segatud järjekorras, nupp **„Sega“** annab uue vooru. Mobiilis näeb ühte kaarti korraga suurelt (libista sõrmega või kasuta noolenuppe). Ülejäänud kaarte veebis meelega ei näidata, et mäng jääks üllatuseks (vt peatükk 16.8).

**Funktsioonid kõigil lehtedel**

- Päis, jalus ja külgsahtlisse avanev ostukorv. Ostukorv jääb brauserisse meelde.
- **18+ vanusekontroll** avalehel ja MIDA V!!!U lehel. Kassas peab klient lisaks kinnitama, et on 18-aastane, kui ostukorvis on MIDA V!!!U või „Kõik 3 mängu“.
- **−15% hüpik:** klient sisestab e-posti, kraabib kraapekaardi ja saab koodi **AGE15**. E-postid salvestuvad Netlify Formsi (peatükk 15).
- Mobiil on esikohal: kujundus on tehtud 360–430 px laiustele telefonidele ja töötab ka suurel arvutiekraanil.
- Otsingumootorite ja sotsiaalmeedia eelvaate andmed ning turvapäised.

**Serveri pool (Netlify Functions)**

| Aadress | Mida teeb |
|---|---|
| `/api/checkout` | Arvutab hinna, soodustuse ja tarne **serveris uuesti**, kontrollib laoseisu, salvestab tellimuse andmebaasi (olek „Ootab makset“) ja loob Stripe'i makselehe, mis kehtib 60 minutit |
| `/api/stripe-webhook` | Stripe teatab siia, kui makse õnnestus, ebaõnnestus, aegus või tehti tagasimakse. Pood muudab tellimuse olekut, vähendab laoseisu ja saadab kirjad |
| `/api/tellimus` | Kinnituslehe andmed. Töötab ainult tellimuse salajase tunnusega (link on kliendi kinnituskirjas) |
| `/api/pakiautomaadid` | Omniva ja SmartPosti automaatide nimekiri vedajate avalikest allikatest, puhverdatud andmebaasis (värskendus kord ööpäevas) |
| `/api/taganemine` | Salvestab taganemisavalduse ja saadab kinnituse |
| `/admin`, `/api/admin/*` | Halduspaneel. Iga päring kontrollib serveris, kas oled sisse loginud |

**Automaattestid:** `npm test` (üle 200 testi) kontrollivad hinnaarvutust, tellimuse loomist, webhooki, tagasimakseid, laoseisu, e-kirju, taganemist, halduspaneeli õigusi ja statistikat.

### Valmis ja testitud või vajab sinu seadistust?

**✅ Valmis ja kohalikult testitud.** Arendaja arvutis töötab kogu ostuteekond algusest lõpuni: kassa → test-Stripe'i makseleht → webhook → tellimus „Makstud“ andmebaasis → kinnituskiri → halduspaneel → pakkimine → saadetuks märkimine. Läbi on proovitud ka tagasimakse, makseaja lõppemine, ebaõnnestunud makse ja taganemisavaldus.

> ⚠️ **Mida EI ole testitud:** päris Stripe'i, Resendi, Netlify DB ning Omniva ja SmartPosti päris nimekirjadega. Arenduskeskkonnast polnud nende teenusteni internetiühendust. Kood on kirjutatud nende ametlike liideste järgi ja testitud näidisandmetega, kuid **esimene päris test on sinu teha** (peatükid 8 ja 12). Kui midagi ei tööta, aitab peatükk 19.

**🔧 Vajab sinu seadistust**

| Mida | Milleks | Kui see puudub | Peatükk |
|---|---|---|---|
| **Netlify DB** (andmebaas) | Tellimused, laoseis, taganemisavaldused | Kassa ütleb: *„Tellimuste vastuvõtt on hetkel ajutiselt peatatud.“* Halduspaneel ja taganemisvorm ei tööta | 4 |
| **Halduspaneeli parool** (`ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`) | Sisselogimine `/admin` | `/admin` ütleb, et parool on seadistamata, ja sisse ei saa | 6 |
| **Stripe'i võti** (`STRIPE_SECRET_KEY`) | Makselehe loomine | Kassa ütleb: *„Makse pole veel seadistatud. Võta meiega ühendust.“* | 7 |
| **Stripe'i webhook** (`STRIPE_WEBHOOK_SECRET`) | Makse kinnitus serverisse | Tellimus jääb olekusse **„Ootab makset“**, kui klient pärast makset tänulehele ei jõua. Aegumised ja tagasimaksed halduspaneeli ei jõua | 7.4 |
| **Domeen** | Oma aadress (nt `age.ee`) ja e-kirjade saatja | Pood töötab aadressil `….netlify.app`, aga e-kirju klientidele saata ei saa (vt Resend) | 9 |
| **Resend** (`RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_EMAIL`) | Kinnituskirjad kliendile, teavitused sulle | Kirju ei saadeta. Tellimused töötavad edasi ja kõik on halduspaneelis näha | 10 |
| **Vedajad** (`ENABLED_CARRIERS`) ja **lepingud** | Kuhu saab tellida ja kuidas sa pakke saadad | Vaikimisi saab tellida Omniva ja SmartPosti automaati. DPD on välja lülitatud | 11 |
| **Ettevõtte andmed** (registrikood jm) | Seadusega nõutud info poes | Jaluses ja tingimustes puudub registrikood | 16.5, 18 |
| **Tagastusaadress** | Kuhu klient taganemisel kauba saadab | Kinnituskirjas on *„saadame sulle peagi juhised“*. Pead juhised ise e-postiga saatma | 18 |
| **Repo privaatseks** | Kood ja failid pole kõigile nähtavad | Repo on praegu avalik | 18 |

### Kuidas see töötab

```
  KLIENT (telefon või arvuti)
     │  valib mängu → ostukorv → pakiautomaat → kontaktandmed → „Maksa“
     ▼
  VEEBILEHT (Netlify)
     │  /api/checkout: arvutab summa üle, kontrollib laoseisu,
     │  salvestab tellimuse AGE-1001 andmebaasi („Ootab makset“)
     ▼
  STRIPE'I MAKSELEHT (kaart, Apple Pay, Google Pay …)
     │  makse õnnestus
     ├──► Stripe → /api/stripe-webhook → tellimus „Makstud“, laoseis väheneb
     │         ├──► KLIENT: kinnituskiri (Resend) + Stripe'i kviitung
     │         └──► SINA: teavitus „Uus tellimus AGE-1001 …“
     └──► KLIENT: kinnitusleht /aitah (kontrollib makset serverist)
     ▼
  SINA: /admin → Pakkimine → paki → registreeri saadetis vedaja iseteeninduses
        → märgi „Saadetud“ + jälgimiskood
     ▼
  KLIENT saab vedajalt SMS-i koodiga ja võtab paki automaadist
```

### Kus mida teha

| Mida tahad teha | Kus |
|---|---|
| Näha tellimusi, pakkida, märkida saadetuks, pidada laoseisu, vaadata statistikat, käsitleda taganemisi, laadida alla CSV | **Halduspaneel** `https://<sinu-sait>/admin` |
| Näha makseid, teha tagasimakseid, vaadata väljamakseid pangakontole | **Stripe** ([dashboard.stripe.com](https://dashboard.stripe.com)) |
| Näha, kas kirjad läksid välja | **Resend** ([resend.com](https://resend.com)) |
| Näha hüpikust liitunud e-poste | **Netlify → Forms** |
| Muuta seadeid (võtmed, paroolid, vedajad) | **Netlify → Environment variables** (peatükk 5) |
| Muuta hindu, tekste, pilte | **GitHub** (muudatus jõuab lehele ise umbes minutiga) |
| Näha, kas leht töötab, ja vigade logisid | **Netlify → Deploys / Logs** |

### Mida pood (veel) ei tee

- **Pakkide registreerimine pole automaatne.** Saadetise teed ise vedaja iseteeninduses (peatükk 13.2).
- **Pood ei saada eraldi kirja „pakk on teel“.** Kui märgid tellimuse saadetuks, näeb klient seda koos jälgimiskoodiga kinnituskirja lingilt. Pakiautomaati jõudmisest teatab vedaja SMS-iga.
- **Tühistamine ja tagasimakse ei muuda laoseisu automaatselt.** Tagastatud mängu lisad lattu käsitsi (peatükk 13.4).
- **Sooduskood AGE15 pole isiklik ega ühekordne.** Seda saab kasutada mitu korda ja teistega jagada (peatükk 16.4).
- **Vanusekontroll on enesekinnitus**, mitte isikutuvastus.
- **Tellimusi ei saa halduspaneelist kustutada.** See on meelega nii, sest müügiandmed tuleb raamatupidamise jaoks alles hoida.

### Kulud

| Mis | Hind | Märkus |
|---|---|---|
| GitHub | 0 € | Siin hoitakse koodi (ka privaatne repo on tasuta) |
| Netlify (Free plaan) | 0 € | Veebimajutus, serverifunktsioonid ja vormid. Tasuta plaanil on igakuised limiidid (krediidid, mida kulutavad näiteks deploy'd, liiklus ja funktsioonide käivitused). Väikesele poele piisab sellest tavaliselt. Kontrolli: [netlify.com/pricing](https://www.netlify.com/pricing/) |
| Netlify DB (Neon Postgres) | tavaliselt 0 € | Neoni tasuta paketis on mahupiirang, mis väikesele poele piisab. Kontrolli kehtivaid tingimusi Netlify ja [Neoni](https://neon.com/pricing) lehelt |
| Resend | tasuta pakett | Tasuta paketis on igakuine ja päevane kirjade limiit. Kontrolli: [resend.com/pricing](https://resend.com/pricing) |
| Stripe | Kuutasu pole. Iga makse pealt umbes **1,5% + 0,25 €** (standardsed Euroopa kaardid) | Premium-, äri- ja Euroopa-väliste kaartide tasu on suurem. **Kontrolli: [stripe.com/ee/pricing](https://stripe.com/ee/pricing)** |
| `.ee` domeen | umbes 10–20 € aastas | Vajalik e-kirjade saatmiseks (peatükk 9) |
| Pakkide saatmine | vedaja hinnakirja järgi | Klient maksab tarne eest 2,99 € (alates 30 € on tarne tasuta). Ülejäänu on sinu kulu |

**Näide:** klient ostab MIDA V!!!U koos tarnega: 17,50 € + 2,99 € = 20,49 €. Stripe võtab sellest umbes 20,49 × 1,5% + 0,25 ≈ **0,56 €**, nii et sinu kontole jõuab umbes **19,93 €**. Sellest tuleb veel maksta paki saatmise eest.

### Mini-sõnastik

| Sõna | Tähendus |
|---|---|
| **Repo** (repository) | Projekti kaust GitHubis, kus on kõik veebilehe failid |
| **Haru** (branch) | Repo paralleelne versioon. **main** on põhiharu, millest pood internetti läheb |
| **Commit** | Salvestatud muudatus koos lühikese kirjeldusega |
| **Pull Request (PR)** | Ettepanek ühe haru muudatused teise harusse tõsta. Netlify teeb igast PR-ist eelvaate |
| **Deploy** | Veebilehe uue versiooni avaldamine. Netlify teeb seda ise pärast igat muudatust `main` harus |
| **Deploy Preview** | Netlify eelvaade: pood koos muudatustega eraldi aadressil, enne kui see päris poodi läheb |
| **Keskkonnamuutuja** | Seadistus (nt Stripe'i võti), mida hoitakse Netlifys, mitte koodis |
| **Netlify Function** | Väike serveriprogramm, mis töötab Netlifys (nt makse alustamine) |
| **Andmebaas** | Koht, kuhu tellimused, laoseis ja taganemisavaldused salvestatakse (Netlify DB ehk Neon Postgres) |
| **Webhook** | Automaatne teade ühest teenusest teise. Stripe teatab webhookiga poele, et makse õnnestus |
| **Testrežiim / LIVE** | Stripe'i harjutusrežiim (raha ei liigu) ja päris maksete režiim |
| **Räsi** (hash) | Parooli ühesuunaline „sõrmejälg“. Netlifysse salvestatakse räsi, mitte parool ise |

---

## 1. Mida on vaja enne alustamist

- [ ] **GitHubi konto**, millel on ligipääs repole **`christopherkingsepp/oh-mega-oof`**. Kood on juba seal.
- [ ] **Netlify konto** ([netlify.com](https://www.netlify.com)). Kõige lihtsam on registreeruda GitHubi kontoga.
- [ ] **Stripe'i konto** ([stripe.com/ee](https://stripe.com/ee)). Testimiseks piisab e-postist. Päris maksete jaoks on vaja:
  - **ettevõtet**, soovitatavalt **OÜ-d** koos registrikoodiga. Stripe toetab ka FIE-d, aga OÜ hoiab ettevõtte raha sinu isiklikust rahast eraldi;
  - **isikut tõendavat dokumenti** ettevõtte esindaja kohta;
  - **ettevõtte pangakontot (IBAN)**, kuhu Stripe raha kannab;
  - telefoninumbrit kaheastmelise sisselogimise jaoks.
- [ ] **Domeen** (nt `age.ee`). Poe saab avada ka tasuta `netlify.app` aadressil, aga **klientidele e-kirjade saatmiseks on oma domeen vajalik** (peatükk 10).
- [ ] **Resendi konto** ([resend.com](https://resend.com)) e-kirjade saatmiseks.
- [ ] **Arvuti, kuhu saab paigaldada Node.js-i** ([nodejs.org](https://nodejs.org), versioon 22 LTS). Seda on vaja **üks kord** halduspaneeli parooli räsi tegemiseks (peatükk 6). Kui seda pole, sobib ka GitHub Codespaces (samas peatükis).
- [ ] **Ettevõtte e-postiaadress**, kuhu tulevad teavitused. Praegu on veebilehel kirjas `aarmiselt@gmail.com`. Kontrolli, et see on õige (peatükk 16.5).
- [ ] **Leping vähemalt ühe pakiautomaatide vedajaga** või valmisolek saata pakke eraklienti iseteeninduses (peatükk 11).

> ⚠️ **Tähtis: alaealisena.** Stripe'i konto avaja ja ettevõtte esindaja peab üldjuhul olema täisealine. Kui oled alla 18, peab Stripe'i konto avama ja seda haldama täiskasvanu (nt lapsevanem), kes on ka ettevõtte esindaja. JA õpilasfirma ei ole juriidiline isik, seega päris maksete jaoks on vaja OÜ-d (või FIE-d). OÜ saab asutada e-äriregistris ([ettevotjaportaal.rik.ee](https://ettevotjaportaal.rik.ee)) ID-kaardi või Smart-ID-ga.

---

## 2. Kood GitHubi põhiharusse

Veebilehe kood on GitHubis harus **`claude/age-kaardimang-jt4br4`**. Netlify avaldab poe põhiharust **`main`**, seega tuleb muudatused sinna tõsta.

### Variant A: repos on juba haru `main` (tavaline juhtum)

1. Ava [github.com/christopherkingsepp/oh-mega-oof](https://github.com/christopherkingsepp/oh-mega-oof).
2. Kui lehe ülaosas on kollane riba tekstiga *„claude/age-kaardimang-jt4br4 had recent pushes“*, vajuta **Compare & pull request**.
   Kui riba pole, vajuta **Pull requests → New pull request** ja vali:
   - **base:** `main`
   - **compare:** `claude/age-kaardimang-jt4br4`
3. Kirjuta pealkirjaks näiteks *„ÄGE veebipood v2“* ja vajuta **Create pull request**.
4. Kui Netlify on juba ühendatud, ilmub PR-i juurde **Deploy Preview** link. Sealt saad uut versiooni enne avaldamist vaadata (peatükk 14).
5. Vajuta **Merge pull request → Confirm merge**.

### Variant B: haru `main` pole olemas

1. Ava repo, vajuta vasakul üleval haru nimega nuppu, kirjuta väljale `main` ja vali **Create branch main from claude/age-kaardimang-jt4br4**.
2. Mine **Settings → General → Default branch** ja vaheta vaikeharuks `main`.

✅ **Kontroll:** repo avalehel on valitud haru `main` ja failide seas on näha kaust `public`, kaust `netlify` ning failid `netlify.toml` ja `JUHEND.md`.

---

## 3. Netlify: pood internetti

1. Logi sisse: [app.netlify.com](https://app.netlify.com).
2. Vajuta **Add new project** (vanemas vaates **Add new site**) → **Import an existing project**.
3. Vali **GitHub** ja luba Netlifyl GitHubi kasutada.
   - Kui repot `oh-mega-oof` nimekirjas pole, anna Netlify GitHubi rakendusele ligipääs sellele repole (sobib *Only select repositories*).
4. Vali repo **oh-mega-oof**.
5. Seadista (enamik välju täitub ise, sest repos on fail `netlify.toml`):

   | Väli | Väärtus |
   |---|---|
   | Branch to deploy | `main` |
   | Base directory | *(tühi)* |
   | Build command | *(tühi, ehitusetappi pole vaja)* |
   | Publish directory | **`public`** |
   | Functions directory | `netlify/functions` |
   | Project name | `age-pood` (kui see on vaba) |

6. Vajuta **Deploy**. Oota 1–3 minutit, kuni deploy staatus on **Published**.
7. Ava aadress, näiteks **https://age-pood.netlify.app**.

> 💡 Avaldatakse **ainult kaust `public`**. Juhend, testid, skriptid ja serverikood internetti ei lähe. Serverifunktsioonid (`netlify/functions`) käivitab Netlify ise.

✅ **Kontrolli:**

- [ ] Avaleht avaneb ja 3D-karp pöörleb.
- [ ] `/mida-viiu`, `/oled-semu`, `/vigur` ja `/kataloog` avanevad.
- [ ] „Lisa ostukorvi“ töötab ja ostukorvi sahtel avaneb.
- [ ] Lehel `/ostukorv` laeb Omniva ja SmartPosti automaatide nimekiri. DPD on nähtav märkega „Hetkel pole saadaval“ (peatükk 11).
- [ ] Nupp **„Maksa …“** annab teate *„Makse pole veel seadistatud. Võta meiega ühendust.“* **See on praegu õige**, sest Stripe pole veel ühendatud.

> 💡 **Nipp:** iga muudatus `main` harus avaldatakse nüüd automaatselt. Kõiki avaldusi näed vaates **Deploys**. Kui mõni uus versioon läheb katki, saad seal varasema töötava versiooni tagasi panna (peatükk 19).

---

## 4. Andmebaas: Netlify DB

Kõik tellimused, laoseis ja taganemisavaldused salvestatakse **Postgresi andmebaasi**. Netlifyl on selleks **Netlify DB**, mille taga on teenus **Neon**. Kui andmebaas on saidiga ühendatud, lisab Netlify keskkonnamuutuja **`NETLIFY_DATABASE_URL`** ise. Midagi käsitsi kirjutama ei pea.

**Tabeleid ei pea ise looma.** Pood loob need esimesel päringul automaatselt.

Vali **üks** kolmest variandist.

### Variant A: Netlify veebiliideses (lihtsaim)

1. Ava Netlifys oma projekt.
2. Otsi menüüst **Extensions** (laiendused) ja sealt **Neon** või **Netlify DB**.
3. Paigalda laiendus ja lisa selle juhiste järgi **sellele projektile andmebaas**.
4. Kui Netlify pakub andmebaasi oma Neoni kontoga siduda (*claim*), **tee seda kohe**. Netlify dokumentatsiooni järgi võidakse sidumata andmebaas mõne päeva pärast kustutada. Seotud andmebaasi näed ka oma Neoni kontol ([console.neon.tech](https://console.neon.tech)).
5. Kontrolli, et **Project configuration → Environment variables** all on nüüd muutuja `NETLIFY_DATABASE_URL`.

Kui sa neid valikuid oma Netlify vaates ei leia, kasuta varianti B või C või ava Netlify ametlik juhend ([docs.netlify.com](https://docs.netlify.com), otsi „Netlify DB“).

### Variant B: käsurealt (`netlify db init`)

Selleks on vaja arvutis Node.js-i ja repo koopiat (vt [Lisa A](#lisa-a-kohalik-arendus-arvutis)).

```bash
npx netlify login        # logi Netlifysse sisse (avab brauseri)
npx netlify link         # seo repo kaust oma Netlify projektiga
npx netlify db init      # loob andmebaasi ja seob selle projektiga
```

Vasta käsu küsimustele. Kui käsk pakub näidiskoodi või Drizzle'i seadistust, vasta **ei**, sest poe kood loob tabelid ise. Lõpuks seo andmebaas oma Neoni kontoga, kui seda pakutakse (vt variant A, samm 4).

### Variant C: oma Neoni andmebaas (`DATABASE_URL`)

1. Loo konto [neon.com](https://neon.com) lehel ja uus projekt. Vali Euroopa piirkond.
2. Kopeeri projekti ühenduse aadress (*connection string*). See algab umbes nii: `postgresql://…neon.tech/…?sslmode=require`.
3. Lisa Netlifysse keskkonnamuutuja **`DATABASE_URL`** selle väärtusega ja märgi see salajaseks (peatükk 5).

> ⚠️ **Ainult Neon.** Pood kasutab Neoni kiiret HTTP-ühendust. Muu Postgresi teenuse (nt Supabase või oma server) aadress ilma arendaja abita **ei tööta**.

### 4.1 Pärast andmebaasi lisamist

1. Tee uus deploy: **Deploys → Trigger deploy → Deploy project**. Keskkonnamuutujad hakkavad tööle alles pärast uut deploy'd.
2. Kontrolli hiljem peatükis 8, et testtellimus jõuab halduspaneeli.

> 💡 **Varukoopia.** Neon hoiab andmebaasi ajalugu teatud aja ja võimaldab seda taastada. Kui pood kasvab, ekspordi kord kuus ka halduspaneelist tellimuste CSV (peatükk 13.6). Nii on müügiandmed alles ka siis, kui andmebaasiga peaks midagi juhtuma.

---

## 5. Keskkonnamuutujad ehk poe seaded

Kõik salajased võtmed ja seaded on **Netlify keskkonnamuutujates**, mitte koodis. Repo on avalik, seega **ära kirjuta ühtegi võtit ega parooli GitHubi**.

### 5.1 Kuidas muutujat lisada

1. Netlifys ava oma projekt → **Project configuration** (vanemas vaates *Site configuration*) → **Environment variables**.
2. Vajuta **Add a variable** (ühe muutuja lisamine).
3. Täida **Key** (nimi, nt `STRIPE_SECRET_KEY`) ja **Value** (väärtus).
4. **Scopes:** jäta kõik sisse või vähemalt **Functions**.
5. Kui pakutakse valikut **Contains secret values** (salajane väärtus), märgi see kõigi võtmete, paroolide ja saladuste puhul.
6. Salvesta.
7. **Tee uus deploy:** **Deploys → Trigger deploy → Deploy project**. Muudatus hakkab tööle alles pärast seda.

### 5.2 Kõik muutujad

| Nimi | Kust saada | Kohustuslik? | Näide |
|---|---|---|---|
| `NETLIFY_DATABASE_URL` | Netlify DB lisab ise (peatükk 4) | **Jah** (või `DATABASE_URL`) | `postgresql://…neon.tech/…` |
| `DATABASE_URL` | Oma Neoni projekt (peatükk 4, variant C) | Ainult siis, kui `NETLIFY_DATABASE_URL` puudub | `postgresql://kasutaja:parool@…neon.tech/neondb?sslmode=require` |
| `STRIPE_SECRET_KEY` | Stripe → API keys → Secret key (peatükk 7.3) | **Jah** | `sk_test_51…` (hiljem `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → sinu endpoint → Signing secret (peatükk 7.4) | **Jah** | `whsec_…` |
| `ADMIN_PASSWORD_HASH` | `npm run admin:hash` (peatükk 6) | **Jah** (halduspaneeli jaoks) | `scrypt$…$…$…$…$…` |
| `ADMIN_SESSION_SECRET` | `npm run admin:hash` prindib selle ka (peatükk 6) | **Jah** (halduspaneeli jaoks) | 64 juhuslikku märki |
| `RESEND_API_KEY` | Resend → API Keys (peatükk 10) | Soovitatav (ilma selleta kirju pole) | `re_…` |
| `MAIL_FROM` | Sinu kinnitatud domeeni aadress (peatükk 10) | Koos `RESEND_API_KEY`-ga | `ÄGE <tellimused@age.ee>` |
| `ADMIN_EMAIL` | Sinu enda e-post | Soovitatav (sinna tulevad teavitused) | `aarmiselt@gmail.com` |
| `ENABLED_CARRIERS` | Sinu otsus (peatükk 11) | Ei (vaikimisi `omniva,smartpost`) | `omniva,smartpost` |
| `DPD_LOCKERS_URL` | DPD või vahendaja (peatükk 11) | Ei | `https://…/lockers.json` |
| `SITE_URL` | Sinu domeen | Ei (Netlify teab põhiaadressi ise) | `https://www.age.ee` |

**Netlifysse EI lisa:** `ADMIN_DEV_PASSWORD`, `MOCK_STRIPE`, `MOCK_MAIL`, `MOCK_LOCKERS`, `PGLITE_DIR`, `MAIL_DIR`. Need on ainult arvutis arendamiseks. Netlifys lülitab kood näidisrežiimid igal juhul välja.

Kõik muutujad koos selgitustega on ka failis [`.env.example`](.env.example).

> 💡 **Edasijõudnutele: eri väärtused eri keskkondadele.** Netlify lubab panna muutujale eri väärtuse eri *deploy context*'idele. Näiteks *Production* jaoks `sk_live_…` ja *Deploy Previews* jaoks `sk_test_…`. Siis saab eelvaates testkaardiga proovida, ilma et päris raha liiguks (peatükk 14).

---

## 6. Halduspaneeli parool

Halduspaneel asub aadressil **`https://<sinu-sait>/admin`**. Seal on üks omaniku parool. Netlifysse salvestatakse **ainult parooli räsi**, mitte parool ise.

### 6.1 Räsi tegemine

Vaja on Node.js-i (versioon 20 või uuem) ja repo koopiat. `npm install`-i pole selleks vaja.

1. Paigalda [Node.js](https://nodejs.org) (LTS-versioon), kui seda veel pole.
2. Laadi repo alla: GitHubis **Code → Download ZIP** ja paki lahti (või `git clone`, vt Lisa A).
3. Ava terminal (Windowsis PowerShell, Macis Terminal) **repo kaustas** ja käivita:

   ```bash
   npm run admin:hash
   ```

4. Sisesta parool kaks korda. Sisestatud märke ekraanil ei näe, see on normaalne. Vali **pikk parool** (vähemalt 10, soovitatavalt 14+ märki, nt 3–4 juhuslikku sõna).
5. Käsk prindib kaks rida:

   ```
   ADMIN_PASSWORD_HASH=scrypt$…
   ADMIN_SESSION_SECRET=…
   ```

6. Lisa mõlemad Netlify keskkonnamuutujatesse (peatükk 5.1): nimi on enne `=` märki ja väärtus pärast seda. Kopeeri väärtus **täpselt**, koos kõigi `$`-märkidega. Märgi mõlemad salajaseks.
7. Tee uus deploy.

**Kui arvutisse ei saa Node.js-i paigaldada:** GitHubis saab avada brauseris töötava arenduskeskkonna (**Code → Codespaces**). Selle terminalis tööta sama käsk `npm run admin:hash`. Isiklikul GitHubi kontol on Codespacesi jaoks igakuine tasuta kvoot. Pärast kasutamist kustuta Codespace.

> ⚠️ **Parooli ei salvestata kuhugi.** Kui unustad selle, tee lihtsalt uus räsi (sammud 3–7). Ka `ADMIN_SESSION_SECRET` võib iga kord uus olla. Selle või parooli vahetamine logib kõik seadmed halduspaneelist välja.

### 6.2 Sisselogimine

1. Ava `https://<sinu-sait>/admin` ja sisesta parool.
2. Seanss kehtib **12 tundi**. Pärast seda küsitakse parooli uuesti.
3. Pärast 10 valet katset tuleb oodata kuni 15 minutit (*„Liiga palju valesid katseid …“*).

Kui `/admin` ütleb, et parool on seadistamata või räsi on vales vormingus, vaata peatüki 19 rida „Halduspaneel ei lase sisse“.

> 💡 Lisa `/admin` telefonis avaekraanile (brauseri menüüst „Lisa avaekraanile“). Nii on tellimused alati ühe puudutuse kaugusel.

---

## 7. Stripe: maksed testrežiimis

Alusta **testrežiimis**. Seal liigub ainult mänguraha ja kõike saab rahulikult proovida.

### 7.1 Konto loomine

1. Mine aadressile [dashboard.stripe.com/register](https://dashboard.stripe.com/register).
2. Sisesta e-post, nimi ja parool, vali riigiks **Estonia** ja kinnita e-post.
3. Ettevõtte andmeid **ei pea veel** sisestama.

### 7.2 Testrežiim

Lülita töölaual sisse **Test mode** või vali uuemas vaates kontomenüüst testkeskkond (**Sandbox**). Testrežiimis on lehel märge „Test“. Kõik selle ajal tehtud maksed on päriselt olematud.

### 7.3 Salajane võti

1. Ava **Developers → API keys** (otse: [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)). Kui menüüs seda ei leia, kirjuta Stripe'i otsingusse „API keys“.
2. Real **Secret key** näita võtit ja kopeeri see. See algab nii: **`sk_test_…`**
3. *Publishable key* (`pk_test_…`) **ei ole** vaja. See siin ei tööta.
4. Lisa Netlifysse muutuja **`STRIPE_SECRET_KEY`** (peatükk 5.1) ja märgi see salajaseks.

> ⚠️ **Tähtis: salajane võti on nagu sinu pangakaardi PIN.**
> - Ära pane seda **mitte kunagi** koodi, GitHubi, sõnumisse, e-kirja ega ekraanipildile.
> - Kui võti lekib, loo Stripe'is **API keys** all uus võti (*Roll key*), mis tühistab vana, ja pane uus võti Netlifysse.

### 7.4 Webhook: Stripe teatab poele, et makse õnnestus

**See samm on kohustuslik.** Ilma selleta ei saa pood kindlalt teada, et klient maksis.

1. Stripe'i töölaual (testrežiimis) ava arendaja tööriistad (**Developers** või uuemas vaates **Workbench**) → **Webhooks**.
2. Lisa uus endpoint. Nupu nimi võib olla **Add endpoint**, **Add destination** või sarnane.
3. Kui küsitakse, kust sündmused tulevad, vali **oma konto** (*Your account*). Kui küsitakse sündmuse kuju (*payload style*), vali tavaline täiskuju (*Snapshot*), mitte *Thin*. API versiooni võid jätta vaikimisi.
4. Vali **täpselt need 5 sündmust** (otsi nime järgi):

   | Sündmus | Mida pood teeb |
   |---|---|
   | `checkout.session.completed` | Makse tehtud → tellimus **„Makstud“** (pangamaksete puhul **„Makse on töötlemisel“**) |
   | `checkout.session.async_payment_succeeded` | Hilinenud makse laekus → **„Makstud“** |
   | `checkout.session.async_payment_failed` | Hilinenud makse ebaõnnestus → **„Makse ebaõnnestus“** |
   | `checkout.session.expired` | Klient ei maksnud 60 minuti jooksul → **„Makseaeg sai läbi“** |
   | `charge.refunded` | Tegid Stripe'is tagasimakse → **„Raha on tagastatud“** või **„Raha on osaliselt tagastatud“** |

5. **Endpoint URL:** `https://<sinu-sait>/api/stripe-webhook`, näiteks
   `https://age-pood.netlify.app/api/stripe-webhook`
6. Salvesta. Ava loodud endpoint ja leia **Signing secret** (allkirja saladus). Näita ja kopeeri see. See algab nii: **`whsec_…`**
7. Lisa Netlifysse muutuja **`STRIPE_WEBHOOK_SECRET`** (peatükk 5.1) ja märgi see salajaseks.

> ⚠️ **Test- ja LIVE-režiimil on eraldi webhookid ja eraldi saladused.** Testrežiimis loodud endpoint saab ainult testmakseid. LIVE-režiimis tuleb endpoint uuesti luua (peatükk 12.3) ja panna Netlifysse **uus** `whsec_…`.

Stripe'i ametlik juhend: [docs.stripe.com/webhooks](https://docs.stripe.com/webhooks).

### 7.5 Uus deploy

**Deploys → Trigger deploy → Deploy project.** Oota, kuni staatus on **Published**.

### 7.6 Stripe'i seaded, mis tasub kohe ära teha

- [ ] **Bränding** (**Settings → Branding**): lae üles logo (nt repost `public/assets/img/brand/icon-512.png`), brändivärv `#ff2fa8`. Need ilmuvad makselehel ja kviitungitel.
- [ ] **Avalikud andmed** (**Settings → Business → Public details**): nimi „ÄGE“, klienditoe e-post, veebilehe aadress ja *statement descriptor* ehk tekst, mida klient näeb pangaväljavõttel (nt `AGE KAARDIMANG`).
- [ ] **Makseviisid** (**Settings → Payment methods**): kontrolli, et **Cards**, **Apple Pay** ja **Google Pay** on sees. Pood pakub automaatselt kõiki makseviise, mille siin sisse lülitad ja mis kliendi seadmele sobivad.
- [ ] **Kviitungid kliendile** (**Settings → Customer emails**): lülita sisse **Successful payments**. Pood saadab kinnituskirja niikuinii (peatükk 10), Stripe'i kviitung on lisaks maksekinnituseks.
- [ ] **Stripe'i äpp telefonis** (iOS/Android): saad iga makse kohta kohe märguande.

---

## 8. Testtellimus

### 8.1 Tee testost

1. Ava oma pood privaatses ehk inkognito aknas.
2. Ava `/mida-viiu`, kinnita vanus ja vajuta **„Lisa ostukorvi“**.
3. Ava **Ostukorv** ja täida:
   - **Tarne pakiautomaati:** vali Omniva või SmartPosti automaat (otsi nt „Kristiine“).
   - **Kontaktandmed:** oma nimi, **oma e-post** ja **oma Eesti mobiilinumber**.
   - **Kinnita ja maksa:** märgi müügitingimuste ja 18+ kastikesed.
4. Vajuta **„Maksa 20,49 €“**. Avaneb Stripe'i makseleht.
5. Sisesta **testkaart**:

   | Väli | Väärtus |
   |---|---|
   | Kaardi number | `4242 4242 4242 4242` |
   | Kehtivus | suvaline tulevane kuupäev, nt `12/34` |
   | CVC | suvalised 3 numbrit, nt `123` |
   | Nimi | suvaline |

6. Maksa. Sind suunatakse lehele **`/aitah`**. Leht näitab hetke *„Kontrollime tellimust…“* ja seejärel tellimuse numbrit (esimene on **AGE-1001**), olekut **„Makstud“**, tooteid ja pakiautomaati. Konfetid lendavad ainult kinnitatud makse korral. Ostukorv on nüüd tühi.

### 8.2 Kontrolli, et tellimus jõudis halduspaneeli „Makstud“ olekusse

1. Ava `https://<sinu-sait>/admin` ja logi sisse.
2. **Tellimused:** nimekirjas on **AGE-1001**, makse olek **„Makstud“** ja täitmise olek **„Ootab pakkimist“**. Klõpsa sellel: näed klienti, tooteid, summasid, automaati ja linki Stripe'i maksele.
3. **Pakkimine:** tellimus on seal koos sellega, mida ja kuhu saata.
4. **Ülevaade:** statistikas on 1 tasutud tellimus.
5. **Stripe'is:** **Transactions** (või **Payments**) all on makse 20,49 € staatusega **Succeeded**. Webhooki lehel (7.4) on sündmuse `checkout.session.completed` saatmise vastus **200**.
6. **E-kirjad** (kui Resend on seadistatud, peatükk 10): sulle tuli *„Uus tellimus AGE-1001 …“* ja kliendile (sulle endale) *„Tellimus AGE-1001 on makstud — aitäh!“*.

> ⚠️ **Kui tellimus jääb olekusse „Ootab makset“**, kuigi Stripe'is on makse olemas, ei jõua webhook poeni. Kontrolli endpointi aadressi, valitud sündmusi ja `STRIPE_WEBHOOK_SECRET`-i (peatükk 19).

> 💡 Testrežiimis Stripe kviitungit automaatselt ei saada. See on normaalne.

### 8.3 Testkaardid

| Kaart | Mis juhtub |
|---|---|
| `4242 4242 4242 4242` | Makse õnnestub |
| `4000 0000 0000 0002` | Kaart lükatakse tagasi. Stripe näitab veateadet, raha ei liigu ja klient saab proovida teist kaarti |
| `4000 0027 6000 3184` | Nõuab pangakinnitust (3D Secure). Avaneb testkinnituse aken, kus saad kinnitada või keelduda |

Rohkem testkaarte: [docs.stripe.com/testing](https://docs.stripe.com/testing).

### 8.4 Testi ka neid olukordi

- [ ] **Sooduskood:** lisa ostukorvis kood `AGE15`, kontrolli, et toodete summa väheneb 15%, ja maksa. Stripe'is ilmub kupong nimega „AGE15 (−15%)“. Pood loob selle ise.
- [ ] **Tasuta tarne:** pane ostukorvi „Kõik 3 mängu“ (33 €). Tarne peab olema 0 €.
- [ ] **Katkestamine:** vajuta Stripe'i makselehel tagasi-noolt. Jõuad ostukorvi teatega, et makse katkestati, ja ostukorv on alles. Nupp **„Jätka makset“** viib samale makselehele tagasi. Halduspaneelis on tellimus olekus „Ootab makset“ ja 60 minuti pärast „Makseaeg sai läbi“.
- [ ] **Tagasilükatud kaart** `4000 0000 0000 0002` ja **3D Secure** `4000 0027 6000 3184`.
- [ ] **Tagasimakse:** Stripe'is ava testmakse → **Refund**. Mõne sekundi pärast on halduspaneelis olek „Raha on tagastatud“.
- [ ] **Laoseis:** halduspaneelis **Laoseis** määra Viguri laoseisuks 1 (peatükk 13.4) ja proovi tellida 2 Vigurit. Kassa peab ütlema, et laos pole piisavalt. Pärast testi määra õige laoseis.
- [ ] **Taganemisvorm:** täida `/taganemine` testtellimuse numbriga. Ekraanile tuleb viide `TAG-…` ja halduspaneeli **Taganemised** alla uus avaldus.
- [ ] **Mobiil:** tee üks testost ka telefonis.

✅ Kui kõik ülaltoodu töötab, on maksete pool valmis. Päris raha liigub alles pärast peatükki 12.

> 💡 **Testtellimused jäävad andmebaasi** ja paistavad halduspaneeli statistikas. Kuidas need enne avamist eemaldada, on kirjas peatükis 12.5.

---

## 9. Oma domeen

### 9.1 Domeeni ostmine

1. Mõtle välja nimi ja kontrolli, kas see on vaba. `.ee` domeene müüvad akrediteeritud registripidajad, näiteks [zone.ee](https://www.zone.ee) ja [veebimajutus.ee](https://www.veebimajutus.ee). Täisnimekirja leiad [internet.ee](https://www.internet.ee) lehelt.
2. Osta domeen. Kui ettevõte on olemas, registreeri see **ettevõtte nimele**.

### 9.2 Domeeni lisamine Netlifysse

1. Netlifys: **Domain management → Add a domain**, kirjuta näiteks `age.ee` ja kinnita.
2. Netlify küsib, kuidas DNS-i hallata.

**Variant A: Netlify DNS (lihtsam).** Netlify näitab 4 nimeserverit. Registripidaja lehel asenda domeeni nimeserverid Netlify omadega. Muudatus võib jõuda kõikjale mõne minutiga, aga mõnikord kulub 24–48 tundi.

> ⚠️ Kui kasutad selle domeeniga e-posti (nt `info@age.ee`), vii pärast nimeserverite vahetust ka **MX-kirjed** Netlify DNS-i üle. Muidu lakkab e-post töötamast. Kui sa pole kindel, kasuta varianti B.

**Variant B: DNS jääb registripidaja juurde.** Lisa registripidaja DNS-i halduses kirjed, mida Netlify sulle näitab (tavaliselt `A`-kirje juurdomeenile ja `CNAME`-kirje `www` jaoks). **Kasuta alati neid väärtusi, mida Netlify sulle näitab.**

### 9.3 HTTPS

Kui DNS töötab, hangib Netlify tasuta sertifikaadi automaatselt. Seisu näed vaates **Domain management → HTTPS**.

### 9.4 Pärast domeeni käivitumist

- [ ] **Stripe'i webhooki aadress uuele domeenile!** Netlify suunab `….netlify.app` aadressi põhidomeenile ja Stripe suunamisi ei järgi. Muuda testrežiimi (ja hiljem LIVE) endpointi URL-iks `https://www.age.ee/api/stripe-webhook` (oma domeeniga). Kui muudad olemasolevat endpointi, jääb saladus samaks. Kui lood uue, pane uus `whsec_…` Netlifysse.
- [ ] `public/assets/js/site.js`: täida `url: 'https://www.age.ee'` (peatükk 16.5).
- [ ] `public/sitemap.xml` ja `public/robots.txt`: asenda vana aadress uuega.
- [ ] Stripe: **Settings → Business → Public details → Website** on uus aadress.
- [ ] Tee Netlifys uus deploy ja üks testost (peatükk 8), et kinnitusleht avaneb uuel aadressil ja tellimus jõuab olekusse „Makstud“.
- [ ] Uuenda TikToki ja Instagrami profiilis link.
- [ ] Valikuline: lisa leht [Google Search Console'i](https://search.google.com/search-console) ja esita seal sitemap.

`SITE_URL` muutujat pole vaja: e-kirjade lingid kasutavad Netlify põhidomeeni automaatselt.

---

## 10. E-kirjad: Resend

Pood saadab kirju teenusega **Resend**:

| Kiri | Kellele | Millal |
|---|---|---|
| *„Tellimus AGE-1001 on makstud — aitäh!“* | Kliendile | Kui makse on kinnitatud. Kirjas on tooted, summa, pakiautomaat ja link kinnituslehele, kus klient näeb hiljem ka saatmise olekut ja jälgimiskoodi |
| *„Uus tellimus AGE-1001 — 20,49 € (Omniva)“* | Sulle (`ADMIN_EMAIL`) | Samal ajal. Kirjale vastates läheb vastus kliendile |
| *„Oleme sinu taganemisavalduse kätte saanud (TAG-…)“* | Kliendile | Kui klient saadab vormi `/taganemine` |
| *„Taganemisavaldus TAG-… — tellimus AGE-…“* | Sulle | Samal ajal |

Iga kiri saadetakse ainult üks kord, ka siis, kui Stripe sama teadet mitu korda saadab. Kliendi vastused kinnituskirjale lähevad aadressile, mis on failis `site.js` väljal `email`.

### 10.1 Konto ja domeen

1. Loo konto [resend.com](https://resend.com) lehel.
2. Lisa Resendis oma domeen (jaotis **Domains**). Resend näitab mõned DNS-kirjed (tavaliselt `TXT` ja `MX`-kirjed allkirjade ja saatja kinnituse jaoks).
3. Lisa **täpselt need kirjed** oma DNS-i: Netlify DNS-i kasutades Netlify domeeni DNS-kirjete alla, muidu registripidaja DNS-i halduses.
4. Oota, kuni Resend näitab domeeni kinnitatuna (*Verified*). See võib võtta minuteid kuni tunde.

Täpsed sammud: [resend.com/docs](https://resend.com/docs).

### 10.2 API võti

1. Resendis ava **API Keys** ja loo uus võti. Piisab saatmisõigusest (*Sending access*).
2. Kopeeri võti (algab `re_…`). Seda näidatakse ainult üks kord.

### 10.3 Netlifysse

Lisa kolm muutujat (peatükk 5.1) ja tee uus deploy:

| Nimi | Väärtus |
|---|---|
| `RESEND_API_KEY` | `re_…` (salajane) |
| `MAIL_FROM` | `ÄGE <tellimused@age.ee>`. Aadress peab olema Resendis kinnitatud domeenil |
| `ADMIN_EMAIL` | Sinu e-post, kuhu tulevad teavitused uutest tellimustest ja taganemistest |

### 10.4 Mis juhtub, kui Resend pole seadistatud

- **Tellimused töötavad edasi.** Ükski tellimus ei ebaõnnestu kirja pärast.
- Kirju lihtsalt ei saadeta. Netlify logis on hoiatus märksõnaga `[meil]`.
- Kõik tellimused ja avaldused on ikkagi halduspaneelis näha. Klient saab Stripe'i kviitungi (LIVE-režiimis, kui see on sisse lülitatud).
- Kuni domeen pole kinnitatud, võid testida saatjaga `onboarding@resend.dev`. Siis saadab Resend kirju **ainult sinu enda Resendi konto e-postile**, mitte klientidele.

---

## 11. Pakiautomaadid ja vedajad

### 11.1 Kuidas automaatide nimekiri töötab

- Kassa küsib nimekirja aadressilt `/api/pakiautomaadid`. Server toob selle vedajate avalikest allikatest ja **salvestab andmebaasi** (kuni 12 tundi). Lisaks värskendab ajastatud funktsioon nimekirja kord ööpäevas.
- Kui vedaja allikas ei vasta, kasutatakse viimast toimivat nimekirja. Kui ka seda pole, saab klient automaadi nime ja aadressi **käsitsi sisestada**. Müük ei peatu.
- Server võtab automaadi ametliku nime ja aadressi nimekirjast automaadi ID järgi, mitte kliendi brauseri pakutud tekstist.

### 11.2 Võrgud ja andmeallikad

| Võrk | Omanik | Automaatide nimekiri | Saatmiseks vaja |
|---|---|---|---|
| **Omniva** | AS Eesti Post | Avalik võtmeta JSON `https://www.omniva.ee/locations.json` (pood kasutab) | Väikese mahu korral saab saata Omniva iseteeninduses. Regulaarseks saatmiseks ärikliendi leping (soodsam hind, kuuarve) |
| **SmartPosti** | Posti Grupp (endine Itella SmartPOST) | Avalik `https://www.smartpost.ee/places.json`, varuallikas Posti avalik asukohateenus `locationservice.posti.com` (pood kasutab mõlemat) | Iseteenindus või ärileping |
| **DPD Pickup** | DPD Eesti AS | Avalikku võtmeta nimekirja ei õnnestunud kinnitada. DPD Balticsi API vajab kliendilepingut ja kasutajatunnuseid | Leping. Poes `DPD_LOCKERS_URL` või käsitsi sisestus. **Vaikimisi välja lülitatud** |
| **Venipak** | Venipak (Leedu) | Eestis pickup-punktid ja pakiautomaadid. API kasutajatunnused annab Venipaki müük | Leping. Poes praegu pole |
| **Unisend** (endine LP Express) | Leedu Post | Võrk laieneb Baltikumis. API aktiveeritakse lepinguga | Leping. Poes praegu pole |
| **Vahendajad** (nt Montonio Shipping, Maksekeskus/MakeCommerce, Cargoson) | – | Üks liides mitmele vedajale (ühtne automaatide nimekiri ja sildid) | Leping vahendajaga |

> ⚠️ Allikate kättesaadavust ei saanud arenduskeskkonnast kontrollida. **Kontrolli pärast avaldamist** (11.4).

### 11.3 `ENABLED_CARRIERS`: kuhu saab tellida

- Vaikimisi saab tellida **Omniva ja SmartPosti** automaati (`omniva,smartpost`).
- Kassas on DPD nähtav, aga välja lülitatud (märge „Hetkel pole saadaval“). Server keeldub tellimusest vedajaga, mis pole lubatud.
- **DPD lisamine:** kui sul on DPD-ga leping ja saad DPD pakke saata, pane Netlifysse `ENABLED_CARRIERS` väärtuseks `omniva,smartpost,dpd` ja tee uus deploy. Kui DPD (või vahendaja) annab automaatide JSON-nimekirja aadressi, lisa ka `DPD_LOCKERS_URL`. Muidu kirjutab klient DPD automaadi käsitsi.
- **Ühe vedaja välja lülitamine** (nt Omniva puhkuse ajaks): `ENABLED_CARRIERS=smartpost`.
- Tarnehind on kõigil 2,99 € ja tasuta alates 30 € (peatükk 16.3).

**Uue vedaja (nt Venipak) lisamine** vajab arendajat: normaliseerija failis `netlify/functions/_lib/lockers.mjs`, kirje failis `public/assets/js/catalog.js` (`SHIPPING.carriers`) ja vedaja nimi `ENABLED_CARRIERS`-is.

### 11.4 Kontroll pärast avaldamist

1. Ava brauseris `https://<sinu-sait>/api/pakiautomaadid?carrier=all`. Näed tehnilist teksti (JSON).
2. Otsi iga vedaja juurest:
   - `"enabled": true` – sinna saab tellida;
   - `"lockerCount": 400` vms – mitu automaati leiti (peab olema sadu, mitte 0);
   - `"stale": true` – allikas ei vastanud, kasutatakse vanemat nimekirja (ajutiselt korras);
   - `"manual": true` – nimekirja pole, klient sisestab automaadi käsitsi;
   - `"errors"` – vea kirjeldus.
3. Netlify logides (**Logs → Functions**) otsi märksõna `[pakiautomaadid]`.
4. Ava `/ostukorv` ja proovi automaati otsida (nt „Tallinn“ või „Tartu“).

---

## 12. LIVE-režiim: päris maksed

### 12.1 Enne aktiveerimist

- [ ] Peatükk 8 on läbi tehtud ja kõik töötab.
- [ ] Ettevõtte andmed on failis `public/assets/js/site.js` täidetud (nimi koos „OÜ“-ga, registrikood, e-post).
- [ ] `/tingimused` ja `/privaatsus` on läbi loetud ja täiendatud. Peatükk 18 on läbi mõeldud.

> 💡 Stripe vaatab aktiveerimisel ka sinu veebilehte. Seal peavad olema tooted koos hindadega, kontaktandmed, müügitingimused (sh taganemine) ja privaatsuspoliitika.

### 12.2 Stripe'i konto aktiveerimine

1. Stripe'i töölaual alusta konto aktiveerimist (nupp nagu **Activate payments** või *Complete your profile*).
2. Täida andmed: ettevõtte tüüp ja registrikood, esindaja andmed ja dokument, omanikud ja juhatuse liikmed, veebileht, tegevuse kirjeldus (nt *„Seltskonna- ja kaardimängude e-pood. Tarne Eesti pakiautomaatidesse.“*), pangakonto (IBAN) ja kaheastmeline sisselogimine.
3. Oota kinnitust. Mõnikord küsib Stripe lisadokumente.

### 12.3 LIVE-võtmed ja LIVE-webhook

LIVE-režiimis on **kõik eraldi**: eraldi võti ja eraldi webhook koos eraldi saladusega.

1. Stripe'is lülita testrežiim **välja**.
2. **API keys → Secret key**: kopeeri võti **`sk_live_…`**. Stripe võib LIVE-võtit näidata ainult üks kord.
3. **Webhooks:** loo LIVE-režiimis **uus endpoint** täpselt nagu peatükis 7.4: sama aadress (`https://<sinu-domeen>/api/stripe-webhook`) ja samad 5 sündmust. Kopeeri **uus** Signing secret (`whsec_…`).
4. Netlifys muuda kahte muutujat:
   - `STRIPE_SECRET_KEY` → `sk_live_…`
   - `STRIPE_WEBHOOK_SECRET` → LIVE-endpointi `whsec_…`
5. Tee uus deploy.

> ⚠️ Kui muudad ainult võtme, aga mitte webhooki saladust, jäävad päris tellimused olekusse „Ootab makset“. **Vaheta alati mõlemad korraga.**

### 12.4 Päris testost

1. Osta poest midagi odavat **oma päris kaardiga**, näiteks Oled Semu? (12,95 € + 2,99 € = 15,94 €).
2. Kontrolli:
   - [ ] halduspaneelis on tellimus olekus **„Makstud“**;
   - [ ] Stripe'is (LIVE) on makse staatusega **Succeeded**;
   - [ ] sulle tuli kinnituskiri ja teavitus (peatükk 10);
   - [ ] LIVE-webhooki lehel on vastus **200**.
3. Tee sellele maksele **tagasimakse**: Stripe → makse → **Refund** → kogu summa. Halduspaneelis muutub olek „Raha on tagastatud“. Stripe ei tagasta oma algset teenustasu, nii et see test maksab umbes 0,49 €.

### 12.5 Testandmete eemaldamine (valikuline, ainult enne päris müüki)

Testtellimused jäävad andmebaasi ja statistikasse. Kui tahad avada puhta lehega (esimene päris tellimus on siis AGE-1001):

1. Ava oma Neoni konto ([console.neon.tech](https://console.neon.tech)) → õige projekt → **SQL Editor**.
2. Käivita:

   ```sql
   TRUNCATE orders, stripe_events, inventory_movements, withdrawals;
   ALTER SEQUENCE order_number_seq RESTART WITH 1001;
   ```

3. Halduspaneelis **Laoseis** määra igale mängule õige laoseis (inventuur, peatükk 13.4).

> ⚠️ **See kustutab KÕIK tellimused ja taganemisavaldused jäädavalt.** Tee seda ainult enne esimest päris müüki. Pärast avamist ära seda kunagi tee. Kui sa pole kindel, jäta testtellimused alles: need ei sega ja neid on halduspaneelis lihtne ära tunda.

### 12.6 Avamise kontrollnimekiri

- [ ] Kõik lehed avanevad telefonis ja arvutis.
- [ ] Hinnad, tarnehind ja tasuta tarne piir on õiged.
- [ ] LIVE-võti **ja** LIVE-webhooki saladus on Netlifys. Päris testost ja tagasimakse õnnestusid.
- [ ] Halduspaneel töötab ja laoseis on sisestatud (või teadlikult piiramatu).
- [ ] E-kirjad jõuavad kliendile ja sulle.
- [ ] `ENABLED_CARRIERS` vastab vedajatele, kellega saad päriselt pakke saata. Automaatide nimekiri laeb (11.4).
- [ ] Netlify Formsis on vorm `soodus` (peatükk 15).
- [ ] Müügitingimused, privaatsuspoliitika, registrikood ja tagastusaadress on korras (peatükk 18).
- [ ] Repo on privaatne (peatükk 18).
- [ ] Sotsiaalmeedias on link poele. **Pood on avatud! 🎉**

---

## 13. Igapäevane töö halduspaneelis

Veebilehel on lubatud, et **pakk saadetakse teele 1–3 tööpäeva jooksul**. Hea rütm on vaadata halduspaneel üle iga tööpäeva hommikul ja õhtul.

### 13.1 Halduspaneeli vaated

| Vaade | Aadress | Mida seal teed |
|---|---|---|
| **Ülevaade** | `/admin` | Statistika valitud perioodi kohta, müügigraafikud, populaarsemad tooted, saatmist ootavad tellimused |
| **Tellimused** | `/admin/tellimused` | Kõik tellimused: otsing (number, nimi, e-post, telefon, automaat), kuupäeva- ja olekufiltrid, CSV-eksport. Klõps tellimusel avab detailvaate |
| **Pakkimine** | `/admin/pakkimine` | Makstud ja saatmata tellimused: mida ja kuhu saata. Prinditav |
| **Laoseis** | `/admin/laoseis` | Mängude laoseis, käsitsi muutmine ja ajalugu |
| **Kalender** | `/admin/kalender` | Kuu ruudustik müügiga päevade kaupa. Päeva klõps näitab selle päeva tellimusi |
| **Taganemised** | `/admin/taganemised` | Taganemisavaldused ja nende olek |

**Makse olekud:** „Ootab makset“, „Makse on töötlemisel“, „Makstud“, „Makse ebaõnnestus“, „Makseaeg sai läbi“, „Raha on tagastatud“, „Raha on osaliselt tagastatud“. Neid muudab **ainult Stripe** webhooki kaudu, mitte sina.

**Täitmise olekud:** „Ootab pakkimist“, „Pakitud“, „Teel pakiautomaati“, „Kohale toimetatud“, „Tühistatud“. Neid muudad **sina**.

> ⚠️ **Saada pakk ainult olekus „Makstud“ tellimusele.** „Ootab makset“ tähendab, et klient pole (veel) maksnud. Pakkimisvaates on ainult makstud tellimused.

### 13.2 Töövoog: tellimusest pakini

1. **Teavitus:** tuleb e-kiri *„Uus tellimus AGE-…“* (kui `ADMIN_EMAIL` ja Resend on seadistatud). Või ava lihtsalt halduspaneel.
2. **Ava Pakkimine** (`/admin/pakkimine`). Üleval on kokkuvõte, mitu mängu kokku vaja on. Iga tellimuse juures on:
   - **Mida:** tooted ja kogused. Komplekt on lahti kirjutatud (nt „Kõik 3 mängu“ = MIDA V!!!U + Oled Semu? + Vigur);
   - **Kuhu:** vedaja, automaadi nimi, aadress ja **automaadi ID**;
   - **Kellele:** nimi, telefon ja e-post.

   Vajadusel vajuta **🖨 Prindi**.
3. **Paki** mängud (tugev ümbrik või karp, et nurgad ei muljuks) ja vajuta **„✓ Märgi pakituks“**.
4. **Registreeri saadetis vedaja iseteeninduses** (Omniva või SmartPosti veebis või ärikliendi keskkonnas):
   - saaja nimi ja telefon (sellele numbrile saadab vedaja avamiskoodi);
   - sihtautomaat: otsi **automaadi nime** või **ID** järgi täpselt see, mis on pakkimisvaates;
   - maksa ja salvesta saadetise number (jälgimiskood). **Hoia see alles.** Sellega tõendad vajaduse korral, et pakk on teele pandud.
5. Vii pakk vedaja automaati või postkontorisse.
6. Kirjuta pakkimisvaates väljale **„Jälgimiskood“** saadetise number ja vajuta **„Märgi saadetuks“**. Tellimus kaob pakkimisvaatest. Klient näeb kinnituskirja lingilt olekut „Teel pakiautomaati“ ja jälgimiskoodi.
7. Valikuline: kui vedaja kinnitab kättetoimetamise, märgi tellimuse detailvaates olekuks **„Kohale toimetatud“**.

**Tellimuse detailvaade** (Tellimused → klõps tellimusel): seal saad muuta täitmise olekut, jälgimiskoodi ja **sisemisi märkmeid** (klient neid ei näe) ning vajutada **„Salvesta muudatused“**. Seal on ka link maksele Stripe'i töölaual. Automaadi andmeid muuta ei saa. Kui klient soovib teist automaati, kirjuta see märkmetesse ja vali saatmisel õige automaat.

> 💡 **Kui saadad regulaarselt,** sõlmi vedajaga **äriklientide leping**: hinnad on soodsamad, arve tuleb kord kuus ja iseteenindus on mugavam. Klient maksab tarne eest 2,99 € ja alates 30 €-st on tarne tasuta, seega jälgi, et saatmiskulu ei sööks kogu kasumit.

### 13.3 Kui midagi läheb valesti

| Olukord | Mida teha |
|---|---|
| Automaadi nimi on segane (käsitsi sisestatud automaat) | Kirjuta või helista kliendile ja küsi täpsustust. E-post ja telefon on tellimuse juures |
| Pakk saabus katki või millestki on puudu | Palu kliendilt pilti ja saada uus mäng või tee tagasimakse. Kirjuta tellimuse märkmetesse, mis juhtus |
| Klient ei võtnud pakki välja | Pakk tuleb mõne aja pärast tagasi. Võta kliendiga ühendust ja lepi kokku uus saatmine või tagasimakse |
| Tellimus tuleb tühistada | Tee Stripe'is tagasimakse ja märgi halduses täitmise olekuks **„Tühistatud“**. Kui mäng jäi lattu, lisa see Laoseisu vaates tagasi (13.4) |
| Klient vaidlustab makse pangas (*dispute*) | Stripe → **Disputes**. Vasta tähtaja jooksul ja lisa tõendid: jälgimiskood, vedaja kinnitus, kirjavahetus |

### 13.4 Laoseis

Ava **Laoseis** (`/admin/laoseis`).

- **Kui mängu laoseisu pole sisestatud, on see piiramatu** (märk **∞** ja tekst *„Laoseisu pole sisestatud — müüki ei piirata“*). Pood müüb siis nii palju, kui tellitakse.
- **Laoseisu sisestamine (inventuur):** vali mäng → **„Määra uus laoseis (inventuur)“** → kogus → põhjus **„Parandus / inventuur“** või **„Kaup juurde“** → selgitus (nt „esimene inventuur“) → **„Salvesta laoseis“**.
- **Uus partii:** **„Lisa või eemalda“** → nt `20` → põhjus **„Kaup juurde“** → selgitus.
- **Vähendamine** (nt kahjustatud karp): **„Lisa või eemalda“** → nt `-1` → põhjus **„Parandus / inventuur“**.
- **Makstud tellimus vähendab laoseisu automaatselt.** Komplektid võetakse lahti: „Oled Semu? + Vigur“ vähendab mõlemat ühe võrra.
- Kui klient tahab rohkem, kui laos on, ütleb kassa enne maksmist, et mängu pole piisavalt.
- **Tagasimakse ja tühistamine laoseisu ei muuda.** Kui tagastatud mäng on müügikõlblik, lisa see käsitsi: **„Lisa või eemalda“** → `1` → **„Parandus / inventuur“** → selgitus „tagastus TAG-…“.
- Iga muudatus on ajaloos koos põhjuse ja ajaga.

> 💡 **Laoseis võib harva minna miinusesse**, kui kaks inimest ostavad viimast mängu peaaegu samal ajal. Mõlemad maksed on siis laekunud. Telli mänge juurde või võta ühe kliendiga ühendust ja tee tagasimakse.

### 13.5 Taganemisavaldused ja raha tagastamine

Klient võib **14 päeva jooksul alates kauba kättesaamisest** lepingust taganeda põhjust esitamata (vt `/tingimused`). Avalduse saab ta saata vormiga `/taganemine` või e-kirjaga.

1. **Avaldus saabub:** klient saab kinnituskirja viitega `TAG-…` ja sina teavituse. Halduspaneelis **Taganemised** on avaldus olekus **„Saabunud“**. E-kirjaga saabunud avalduse kohta tee endale märge (avaldus e-postis on samuti kehtiv).
2. **Saada kliendile tagastusjuhised:** kuhu ja kuidas pakk saata (nt sinu valitud pakiautomaat ja saaja nimi). Kinnituskirjas on praegu lause *„saadame sulle peagi juhised“* (vt peatükk 18). Märgi avaldus olekusse **„Menetluses“** ja kirjuta märkmetesse, mis kokku lepiti.
3. **Kauba tagastamise otsese kulu kannab klient.** Klient peab kauba saatma 14 päeva jooksul pärast avaldust.
4. **Raha tagastamine:** ava halduspaneelis tellimus → link Stripe'i maksele → **Refund**:
   - kogu tellimusest taganemisel tagasta kogu summa, **sh algne tarnekulu**;
   - osa tellimusest taganemisel tagasta nende toodete eest makstud summa (soodustust arvestades). Tarnekulu siis ei tagastata.

   Raha tuleb tagastada **14 päeva jooksul avalduse saamisest**. Võid sellega oodata, kuni oled kauba tagasi saanud või klient on näidanud tõendit selle saatmise kohta. Tagasimakse ei tohi kliendile midagi maksta.
5. Stripe teatab tagasimaksest poele ja tellimuse makse olek muutub ise: **„Raha on tagastatud“** või **„Raha on osaliselt tagastatud“**.
6. Märgi taganemisavaldus olekusse **„Raha tagastatud“**. Kui keeldud põhjendatult (nt tähtaeg on möödas), vali **„Tagasi lükatud“** ja kirjuta põhjus märkmetesse ja kliendile.
7. Kui tagastatud mäng on müügikõlblik, lisa see lattu (13.4).

> 💡 **Vigane või kirjeldusele mittevastav mäng** ei ole taganemine. Selle puhul kehtivad seadusjärgsed õigused (2 aastat): asendus, parandus või raha tagasi. Saatmiskulu kannad sina.

### 13.6 CSV-eksport raamatupidamisele

1. Ava **Tellimused**.
2. Vali filtrid, näiteks kuupäevavahemik eelmine kuu ja makse olek **„Tasutud (sh tagastatud)“**.
3. Vajuta **„⬇ Lae CSV (Excel)“**. Fail sisaldab ainult filtritele vastavaid tellimusi.

Fail on tehtud Eesti Exceli jaoks: täpitähed on õiged, eraldaja on semikoolon ja kümnendkoht on koma (`17,50`). Kellaajad on Tallinna ajas. Veerud: number, kuupäev, kellaaeg, klient, e-post, telefon, tooted, kogused, vahesumma, soodustus, tarne, kokku, makse staatus, Stripe'i makse ID, operaator, automaat, automaadi ID, aadress, täitmise staatus, jälgimiskood, märkmed, sooduskood ja tagastatud summa.

**Kord kuus:** anna raamatupidajale halduspaneeli CSV ja Stripe'i väljamaksete aruanne (**Balances → Payouts** või **Reports**). Stripe'i teenustasud on ainult Stripe'i aruandes.

> 💡 Telefoninumbri ees on CSV-s ülakoma (`'+372…`). See on meelega nii, et Excel ei loeks seda valemina.

### 13.7 Statistika tähendus

**Ülevaade** näitab ainult **tegelikult tasutud** tellimusi. Periood loetakse makse laekumise aja järgi **Tallinna ajas**. Vali **Päev**, **Nädal** (E–P), **Kuu**, **Aasta** või **Vahemik**. Nooltega liigud eelmisele või järgmisele perioodile.

| Näitaja | Mida tähendab |
|---|---|
| **Tasutud tellimused** | Tellimused, mille makse laekus valitud perioodil (ka hiljem tagastatud). Maksmata, aegunud ja ebaõnnestunud tellimusi ei loeta |
| **Toodete müük** | Toodete summa pärast sooduskoodi, ilma tarneta. Komplekt on arvestatud komplekti hinnaga |
| **Tarnetulu** | Klientidelt võetud tarnetasud |
| **Tagasimaksed** | Stripe'i kaudu tagastatud raha nende tellimuste eest, mis maksti valitud perioodil |
| **Netokäive** | Toodete müük + tarnetulu − tagasimaksed. Raha, mis jääb poele **enne** Stripe'i tasusid ja saatmiskulusid |
| **Keskmine ostukorv** | Tasutud tellimuse keskmine summa koos tarnega |
| **Müüdud mänge** | Mängude arv tükkides, komplektid lahti võetuna („Kõik 3 mängu“ = 3 mängu). Summasid see ei mõjuta |
| **Antud soodustus** | Sooduskoodidega tehtud allahindlus kokku (on toodete müügist juba maha arvatud) |
| **Saatmist ootavad** | Makstud tellimused, mis on pakkimata või pakitud, aga saatmata. Kogu aja peale, mitte ainult valitud perioodil |

Iga näitaja juures on halduspaneelis ka lühike selgitus.

---

## 14. Eelvaade: vaata muudatusi enne avaldamist

### 14.1 Netlify Deploy Preview (soovitatav)

Kui muudatus tehakse **eraldi harus** ja sellest luuakse GitHubis **Pull Request** `main` harusse (peatükk 2), teeb Netlify sellest automaatselt eelvaate.

1. Ava GitHubis Pull Request.
2. Oota, kuni Netlify kontroll on valmis. PR-i juurde ilmub link **Deploy Preview** (aadress umbes `deploy-preview-12--age-pood.netlify.app`). Sama lingi leiad Netlifys vaatest **Deploys**.
3. Ava link ja vaata poodi telefonis ja arvutis.
4. Kui kõik on korras, vajuta GitHubis **Merge pull request**. Alles siis läheb muudatus päris poodi.

> ⚠️ **Eelvaates töötab ka kassa.** Eelvaade kasutab samu keskkonnamuutujaid, mis on lubatud *Deploy Previews* kontekstile, ja tõenäoliselt ka sama andmebaasi. Kui seal on LIVE-võti, oleks eelvaates tehtud ost **päris ost**. Eelvaates tehtud testtellimused ilmuvad ka halduspaneeli. Turvaline lahendus: pane *Deploy Previews* kontekstile Stripe'i **test**võti (peatükk 5.2) või ära tee eelvaates tellimusi.

### 14.2 Kohalik eelvaade arvutis (`npm run dev:mock`)

See sobib arendajale või sulle, kui arvutis on Node.js (vt [Lisa A](#lisa-a-kohalik-arendus-arvutis)):

1. Repo kaustas: `npm install` (ainult esimesel korral) ja seejärel `npm run dev:mock`.
2. Ava brauseris **http://localhost:8080**. Pood töötab täielikult, aga makse käib **test-Stripe'i lehel** („TESTMAKSE — päris raha ei liigu“), kus nupud on: **Maksa edukalt**, **Viivitusega makse**, **Makse ebaõnnestub**, **Katkesta**, **Lase aeguda** ja pärast makset **Tagasta kogu summa** / **Tagasta osaliselt**.
3. Halduspaneel: **http://localhost:8080/admin**, parool **`demo-admin`**.
4. E-kirjad ei lähe välja. Need salvestatakse kausta `.data/mail` (HTML-failid, mida saab brauseris avada).
5. Lõpetamiseks vajuta terminalis **Ctrl + C**.

---

## 15. Uudiskirja e-postid Netlify Formsiga

−15% hüpikus sisestatud e-postid saadetakse Netlify Formsi vormi **`soodus`**.

### 15.1 Vormide sisselülitamine

1. Netlifys ava oma projekt → **Forms** ja lülita vormide tuvastamine sisse (*Enable form detection*).
2. Tee uus deploy. Netlify otsib vorme ainult deploy ajal.
3. Ava uuesti **Forms**. Nimekirjas peab olema vorm **`soodus`**.

> ⚠️ Hüpik luuakse JavaScriptiga, seepärast on vormi **peidetud koopia** failis `public/__forms.html`. **Ära seda faili kustuta ega ümber nimeta.**

### 15.2 Testi ja seadista teavitus

- Ava pood inkognito aknas, oota mõni sekund, ava hüpik, sisesta e-post ja vajuta **„Saan −15%“**. Kirje ilmub **Forms → soodus** alla.
- E-kiri iga uue liituja kohta: **Project configuration → Notifications** → vormi teavitus (*Form submission notifications*) → e-posti teavitus vormile `soodus`.
- Nimekirja saad alla laadida CSV-na (**Forms → soodus →** allalaadimise nupp).
- Netlify filtreerib rämpsu. Vaata aeg-ajalt ka vaadet **Spam submissions**.

### 15.3 Uudiskirja soov kassas

Kassas on märkeruut **„Soovin uudiskirja ja eripakkumisi“**. See info **ei lähe** Netlify Formsi. Selle näed halduspaneelis tellimuse detailvaates (**Uudiskiri: Jah/Ei**) ja Stripe'is makse juures (`newsletter`).

### 15.4 Hiljem: MailerLite või Mailchimp

Laadi Netlifyst CSV alla ja impordi see uudiskirjateenusesse. Kinnita importimisel, et inimesed on liitumiseks nõusoleku andnud. Seadista seal tervituskiri, mis tuletab koodi AGE15 meelde.

> ⚠️ **Isikuandmed (GDPR):** kasuta e-poste **ainult** ÄGE uudiste ja pakkumiste jaoks, ära jaga nimekirja kellegagi, lisa igasse uudiskirja loobumislink ja täida kustutamissoovid kõikjal (Netlify Forms, CSV-failid, uudiskirjateenus).

---

## 16. Sisu muutmine: hinnad, tekstid, pildid

### 16.1 Kuidas faili muuta (ilma programmeerimata)

**Ühe faili muutmine GitHubis:**

1. Ava repo GitHubis ja veendu, et valitud on haru **`main`**.
2. Ava fail, näiteks `public` → `assets` → `js` → `catalog.js`.
3. Vajuta **pliiatsiikooni** (*Edit this file*) ja tee muudatus.
4. Vajuta **Commit changes…**, kirjuta lühike kirjeldus (nt *„Muuda MIDA V!!!U hinda“*) ja kinnita.
5. Netlify avaldab muudatuse umbes **1 minutiga** (**Deploys**: *Building* → *Published*).
6. Värskenda poodi nii, et brauser vahemälu ei kasutaks: **Ctrl + Shift + R** (Mac: **Cmd + Shift + R**).

**Turvalisem viis:** vali commitimisel *Create a new branch … and start a pull request*. Siis saad muudatust enne avaldamist eelvaates vaadata (peatükk 14.1).

**Mitu faili korraga (github.dev):** vajuta repo lehel klaviatuuril **`.`** (punkt). Avaneb brauseris töötav redaktor. Otsing kõigist failidest: **Ctrl + Shift + F** (Mac: **Cmd + Shift + F**).

> ⚠️ **Kui leht läks pärast muudatust katki,** ava Netlifys **Deploys**, klõpsa viimasel **töötaval** versioonil ja vajuta **Publish deploy**. Vana versioon on kohe tagasi.

**JavaScripti failides (`.js`) jälgi reegleid:**

- Komakohaga numbrites kasuta **punkti**: `17.5`, mitte `17,5`.
- Tekst on jutumärkides: `'MIDA V!!!U'`. Kui tekstis on ülakoma, kasuta `’`.
- Rea lõpus olevad komad ja looksulud `{ }` jäta alles.

### 16.2 Hinnad

Hinnad on failis **`public/assets/js/catalog.js`** nimekirjas `PRODUCTS` (`price: 17.5`):

| Toode | Rida failis |
|---|---|
| MIDA V!!!U | `'mida-viiu'` → `price: 17.5` |
| Oled Semu? | `'oled-semu'` → `price: 12.95` |
| Vigur | `vigur` → `price: 12.95` |
| Oled Semu? + Vigur | `'komplekt-semu-vigur'` → `price: 20.0` |
| Kõik 3 mängu | `'komplekt-koik'` → `price: 33.0` |

Sellest failist võtavad hinna nii veebileht kui ka server. Stripe küsib alati seda summat.

**Pärast hinna muutmist otsi samad numbrid ka teistest failidest** (nt `17,50` **ja** `17.50`): HTML-failide kirjeldused ja Google'i tooteandmed (`"price": "17.50"`), komplektide säästu tekstid failis `catalog.js` (*„Säästad …“*) ning KKK ja tingimused.

### 16.3 Tarnehind ja tasuta tarne piir

Samas failis `catalog.js` objektis `SHIPPING`:

- `price: 2.99` – tarne hind;
- `freeFrom: 30` – tasuta tarne alates (arvestatakse pärast sooduskoodi);
- `carriers` – iga vedaja juures on ka oma `price`. **Muuda hinda kõigis kohtades ühtemoodi.**

Otsi ka tekstidest `2,99` ja `30 €`.

### 16.4 Sooduskoodid

Samas failis:

```js
export const WELCOME_CODE = 'AGE15';   // kood, mida −15% hüpik jagab
export const DISCOUNT_CODES = {
  AGE15: 15,                           // KOOD: protsent
};
```

- **Uus kood:** lisa rida, nt `SUVI20: 20,`. Kirjuta kood SUURTÄHTEDEGA, ilma tühikute ja täpitähtedeta.
- **Koodi lõpetamine:** kustuta selle rida. Pärast deploy'd kood enam ei kehti.
- Soodustus kehtib toodetele, mitte tarnele. Korraga saab kasutada ühte koodi. Kood **ei ole ühekordne**.
- **Link, mis lisab koodi ise:** `https://<sinu-sait>/ostukorv?kood=AGE15`.
- **Stripe'i kupongid** (nt `AGE15-263`) loob pood ise. **Ära neid muuda ega kustuta.**

### 16.5 Ettevõtte ja kontaktandmed

Fail **`public/assets/js/site.js`**:

| Väli | Mis see on | Praegu |
|---|---|---|
| `url` | Poe aadress | tühi (täida peatükis 9) |
| `brand` | Brändi nimi | `ÄGE` |
| `legalName` | Ettevõtte ametlik nimi | `Äärmiselt Geniaalne Ettevõtmine`. Lisa „OÜ“, kui OÜ on loodud |
| `regCode` | Registrikood (jalus, tingimused) | **tühi, täida enne avamist** |
| `address` | Aadress | `Tallinn, Eesti` |
| `email` | Kontakt-e-post (jalus, kinnitusleht, vastused e-kirjadele) | `aarmiselt@gmail.com`. **Kontrolli, kas see on õige** |
| `instagram`, `tiktok` + `…Handle` | Sotsiaalmeedia | `@ou.age` |
| `pacdora3d` | 3D-mudeli link (peatükk 17) | Pacdora jagamislink |

Mõnes HTML-failis on e-post ja ettevõtte andmed kirjas ka otse tekstis (nt `tingimused.html`, `privaatsus.html`). Otsi vana väärtust kõigist failidest.

### 16.6 Tekstid

| Leht | Fail |
|---|---|
| Avaleht | `public/index.html` |
| Kataloog | `public/kataloog.html` |
| MIDA V!!!U / Oled Semu? / Vigur | `public/mida-viiu.html` / `public/oled-semu.html` / `public/vigur.html` |
| Ostukorv ja kassa | `public/ostukorv.html` |
| Kinnitusleht | `public/aitah.html` |
| Taganemine | `public/taganemine.html` |
| KKK / müügitingimused / privaatsus | `public/kkk.html` / `public/tingimused.html` / `public/privaatsus.html` |
| Menüü ja jalus | `public/assets/js/layout.js` |
| −15% hüpik | `public/assets/js/promo.js` |
| Toodete lühikirjeldused ja faktid | `public/assets/js/catalog.js` (`tagline`, `short`, `facts`) |
| MIDA V!!!U eelvaatekaartide tekstid | `public/assets/js/preview-cards.js` |
| E-kirjade tekstid | `netlify/functions/_lib/mail-templates.mjs` (palu arendaja abi) |

**HTML-is muuda ainult teksti märkide `>` ja `<` vahel**, näiteks `<p>Saadame paki teele <strong>1–3 tööpäeva</strong> jooksul.</p>`. `&nbsp;` on tühik, mille kohalt rida ei murdu.

### 16.7 Pildid

Pildid on kaustas `public/assets/img/`:

| Kaust | Mis seal on | Mõõdud |
|---|---|---|
| `brand/` | Logod (`age-logo-white`, `age-logo-pink`, `mida-viiu-logo`), favicon, jagamispilt `og-image.jpg` | jagamispilt 1200 × 630 |
| `games/` | `<mäng>-box-sm.webp` (karp 3/4 vaates, 240 × 240), `<mäng>-box.webp` (900 × 900), `<mäng>-box.png` (480 × 480), `<mäng>-cover.webp` (1600 × 900), komplektide pildid `komplekt-*.webp` | |
| `games/<mäng>/` | 3D-karbi tahud: `front`, `back`, `left`, `right`, `top`, `bottom` | esi/tagakülg 800 × 1234 |
| `cards/mida-viiu/` | 19 eelvaatekaarti + 4 kaarditüübi selga | 1074 × 720 |
| `cards/oled-semu/`, `cards/vigur/` | Näidiskaardid ja seljad | 1074 × 693 |

Pildid on tehtud skriptidega lähtefailidest (vt `scripts/assets/README.md` ja `source/README.md`). **Uute tootepiltide tegemiseks palu arendaja abi.**

**Lihtne pildivahetus** (nt jagamispilt): tee uus pilt samades mõõtudes, paki WebP-vormingusse ([squoosh.app](https://squoosh.app), kvaliteet 75–80), **anna uus failinimi** (brauserid hoiavad pilte kuni nädal meeles), lae see GitHubis õigesse kausta ja asenda vana nimi kõikjal, kus seda kasutatakse.

### 16.8 ⚠️ Kaardid ja mängu sisu: mida EI tohi veebi panna

**Repo on avalik** ja kõik `public/` kausta failid on kõigile nähtavad.

- **MIDA V!!!U avalik eelvaade on täpselt 19 kaarti** (failis `preview-cards.js` ja kaustas `cards/mida-viiu/`). Ära lisa sinna teisi kaarte, reeglikaartide pilte ega kogu kaardipakki.
- Mängu täisfailid (kaardi-PDF-id, kõik kaardipildid, pakendifotode originaalid) hoia ainult oma arvutis või kaustas `source/private/`, mis ei lähe GitHubi.
- Reeglid on lehtedel kirjas tavalise tekstina.

### 16.9 Uue mängu lisamine

Uus mäng puudutab mitut faili ja osa neist on kood. **Tee seda arendaja (või Claude'i) abiga** ja vaata enne eelvaates (peatükk 14). Vaja on: pildid ja karbi tahud, uus toode failis `catalog.js`, uus leht (nt `public/uus-mang.html`), menüü ja jalus (`layout.js`), kataloog, avalehe nimekiri, `sitemap.xml` ning laoseisu jaoks mängu id.

### 16.10 Mida ilma arendajata parem mitte muuta

- `netlify/functions/` (maksed, webhook, andmebaas, halduspaneel),
- `netlify.toml` (Netlify seadistus ja turvapäised),
- `package.json`, `package-lock.json`,
- failide ja kaustade nimed (lehed viitavad neile),
- `public/` kausta ei tohi lisada faili `admin.html` ega kausta `admin/`, sest aadress `/admin` kuulub halduspaneelile.

---

## 17. Pacdora 3D-mudel

- MIDA V!!!U lehel on nupp **„Vaata 3D-mudelit“**, mis avab Pacdora mudeli aknas. Link laetakse alles nupu vajutamisel. Telefonis avaneb mudel uues aknas.
- Akna all on alati nupp **„Ava 3D-vaade uues aknas“**.
- Kui aknas on valge tühi kast, ava fail `public/assets/js/product.js`, otsi rida `const EMBED_3D = true;` ja muuda see `const EMBED_3D = false;`. Siis avab nupp 3D-vaate alati uues aknas.
- **Lingi vahetamine:** kopeeri Pacdorast uus jagamislink faili `public/assets/js/site.js` reale `pacdora3d: '…'` ja otsi `pacdora.com` ka failist `public/mida-viiu.html`.

> 💡 Turvaseaded (`netlify.toml`) lubavad lehe sisse panna ainult `pacdora.com` sisu. Teise 3D-teenuse jaoks on vaja arendaja abi.

---

## 18. Õiguslik kontrollnimekiri

> ⚠️ **Tähtis:** see peatükk ei ole juriidiline nõuanne. See on nimekiri asjadest, mis tuleks enne päris müüki üle vaadata. Kahtluse korral küsi juristilt, raamatupidajalt või [Tarbijakaitse ja Tehnilise Järelevalve Ametilt (TTJA)](https://www.ttja.ee).

### Taganemisõigus (on nüüd poes kirjas)

Pood tunnistab nüüd **seadusjärgset 14-päevast taganemisõigust**. See on kirjas müügitingimustes (`/tingimused`, koos taganemisavalduse tüüpvormiga), KKK-s, kassas ja Google'i tooteandmetes. Vormi `/taganemine` kaudu saab avalduse esitada (peatükk 13.5). Varasem lause „mänge ei saa tagastada“ on eemaldatud.

- [ ] **Tagastusaadress:** otsusta, kuhu klient kauba tagasi saadab (nt kindel pakiautomaat sinu nimele või postiaadress). Praegu on tingimustes ja kinnituskirjas kirjas, et juhised saadetakse e-postiga. Kui aadress on kindel, palu arendajal see otse tingimustesse (`public/tingimused.html`) ja kinnituskirja (`mail-templates.mjs`) kirjutada. Siis ei pea iga kord eraldi kirja saatma.
- [ ] **Tähtajad:** raha (sh algne tarnekulu) tuleb tagastada 14 päeva jooksul avalduse saamisest. Võid oodata, kuni oled kauba tagasi saanud või klient on näidanud tõendit selle saatmise kohta. Tagastamise otsese kulu kannab klient.
- [ ] **Vigane kaup:** seadusjärgne vastutus kehtib 2 aastat. Asendamise kulud kannad sina.
- [ ] **Värvid ja kujundus:** KKK-s ja tooteinfos on märkus, et värvitoonid võivad trükipartii või ekraani tõttu veidi erineda. See märkus ei piira taganemisõigust.

### Ettevõtte andmed

- [ ] **Ärinimi ja registrikood** on poes nähtaval: täida `legalName` ja `regCode` failis `public/assets/js/site.js` (peatükk 16.5). Failides `public/tingimused.html` ja `public/privaatsus.html` on kohad märgitud kommentaariga `TODO`.
- [ ] Aadress ja kontakt-e-post on õiged.

### Isikuandmed (GDPR) ja privaatsuspoliitika

- [ ] **Privaatsuspoliitika (`/privaatsus`)** loetleb kõik volitatud töötlejad: Netlify (majutus, vormid, serverifunktsioonid), Neon / Netlify DB (tellimuste andmebaas), Stripe (maksed), Resend (tehingukirjad), Omniva ja SmartPosti (tarne) ning hiljem uudiskirjateenus. Kontrolli, et nimekiri vastab sellele, mida päriselt kasutad.
- [ ] **Säilitamine:** tellimuste andmed jäävad andmebaasi. Raamatupidamise algdokumente tuleb üldjuhul säilitada 7 aastat (küsi raamatupidajalt). Kirjuta privaatsuspoliitikasse, kui kaua andmeid hoiad.
- [ ] Kinnituskirjas on link kinnituslehele salajase tunnusega (`/aitah?t=…`). Seda lehte otsingumootorid ei indekseeri ja link ei lähe kolmandatele osapooltele edasi.
- [ ] Tellimuse andmeid (nimi, telefon, automaat) kasutad ainult tellimuse täitmiseks. Halduspaneeli parooli ei jaga kellegagi.
- [ ] Uudiskirja nimekirja kasutad ainult nõusoleku alusel (peatükk 15).
- [ ] Kui lisad analüütika või reklaamipiksli, on vaja küpsiste nõusolekut. Praegu kasutab pood brauseri mälu ainult ostukorvi, vanusekontrolli ja hüpiku meelespidamiseks.

### Repo nähtavus

- [ ] **Muuda GitHubi repo privaatseks.** Praegu on repo avalik: kõik näevad koodi, juhendit ja pakendi stantsifaili. Võtmeid ja kliendiandmeid repos pole, aga privaatne repo on turvalisem. GitHubis: **Settings → General →** lehe lõpus **Danger Zone → Change visibility → Make private**. Netlify töötab edasi, sest Netlify GitHubi rakendusel on repole ligipääs (kontrolli pärast muutmist, et järgmine deploy õnnestub).
- [ ] Varem avalikult nähtud faile võib keegi olla juba alla laadinud. Seepärast ära pane ka privaatsesse reposse mängude täisfaile ega salajasi võtmeid.

### Maksud ja raamatupidamine

- [ ] **Käibemaks:** kui ettevõtte maksustatav käive ületab kalendriaasta jooksul **40 000 €**, tuleb registreeruda käibemaksukohustuslaseks. Kontrolli kehtivat piiri ja määra: [emta.ee](https://www.emta.ee).
- [ ] **Raamatupidamine:** OÜ peab pidama raamatupidamist ja esitama majandusaasta aruande. Müügi tõendiks sobivad halduspaneeli CSV ja Stripe'i aruanded (peatükk 13.6).

### MIDA V!!!U, vanus ja alkohol

- [ ] **18+:** poes on vanusekontroll ja kassas peab ostja kinnitama, et on 18-aastane. See on enesekinnitus. Hoia 18+ märge ka pakendil ja turunduses nähtaval.
- [ ] **Alkohol turunduses:** MIDA V!!!U ei ole alkohol, aga see on joomamäng. Eestis piiravad alkoholi reklaami **reklaamiseadus ja alkoholiseadus**, lisaks on TikTokil ja Instagramil oma reeglid:
  - ära näita postitustes alaealisi ega suuna postitusi alaealistele (reklaamides vali sihtrühmaks 18+);
  - ära näita alkoholi eduka, sportliku või seksika elu osana ja ära ärgita liigjoomist;
  - ära reklaami konkreetseid alkoholibrände;
  - kasuta sõnumit „mängi vastutustundlikult“.

---

## 19. Veaotsing

**Logid:** Netlify → **Logs** (uuemas vaates *Logs & metrics*) → **Functions**. Vali funktsioon ja otsi märksõnu: `[checkout]`, `[webhook]`, `[makse]`, `[meil]`, `[pakiautomaadid]`, `[taganemine]`, `[tellimus]`, `[haldus]`.

| Mis juhtub | Tõenäoline põhjus | Lahendus |
|---|---|---|
| Kassas: *„Makse pole veel seadistatud. Võta meiega ühendust.“* | `STRIPE_SECRET_KEY` puudub, on vales vormingus (nt `pk_…`) või pärast lisamist pole uut deploy'd tehtud | Võti peab algama `sk_test_` või `sk_live_`. Tee uus deploy. Logi: `[checkout]` |
| Kassas: *„Tellimuste vastuvõtt on hetkel ajutiselt peatatud …“* | Andmebaas puudub (`NETLIFY_DATABASE_URL` / `DATABASE_URL`) | Lisa Netlify DB (peatükk 4) ja tee uus deploy |
| Kassas: *„Tellimust ei õnnestunud salvestada …“* | Andmebaasi ühendus ebaõnnestus | Vaata logist `[checkout]`. Kontrolli Neoni konsoolis, et andmebaas on olemas ja aktiivne. Proovi mõne minuti pärast uuesti |
| Kassas: *„Makset ei õnnestunud alustada …“* | Stripe lükkas päringu tagasi (võti tühistatud, LIVE-konto aktiveerimata, Stripe'i häire) | Logi `[checkout]`. Kontrolli Stripe'i kontot ja [status.stripe.com](https://status.stripe.com) |
| Kassas: *„Selle vedajaga praegu tellida ei saa …“* | Vedaja pole `ENABLED_CARRIERS`-is | Nii on mõeldud (peatükk 11.3). Muuda `ENABLED_CARRIERS` ja tee uus deploy |
| Kassas: mängu pole laos piisavalt | Laoseis on halduses liiga väike või unustasid uue partii lisada | **Laoseis** → lisa kogus (peatükk 13.4) |
| **Tellimus jääb olekusse „Ootab makset“**, kuigi Stripe'is on makse olemas | Webhook ei jõua poeni: vale aadress, puuduvad sündmused, vale `STRIPE_WEBHOOK_SECRET` (nt testi oma LIVE-režiimis) või aadress on vana `netlify.app` domeen | Ava Stripe'is webhooki endpoint ja vaata saatmiste vastuseid: **400** = vale saladus, **500** = saladus puudub või tekkis viga (logi `[webhook]`), **503** = andmebaas puudub, suunamine (3xx) = vale domeen. Paranda ja saada sündmus Stripe'ist uuesti (sündmuse juures on uuesti saatmise nupp). Kliendi kinnitusleht `/aitah` kontrollib makset ka ise ja parandab oleku |
| Tellimus jääb „Ootab makset“ ja Stripe'is makset pole | Klient ei maksnud (sulges makselehe) | Normaalne. 60 minuti pärast muutub olek „Makseaeg sai läbi“ (kui webhook töötab). Pakki **ei saadeta** |
| Olek „Makse on töötlemisel“ | Klient valis pangapõhise makseviisi, mille kinnitus võtab aega | Oota. Kui raha laekub, muutub olek ise „Makstud“. Ära saada pakki enne |
| **Kirju ei tule** | `RESEND_API_KEY` või `MAIL_FROM` puudub, domeen pole Resendis kinnitatud, kiri on rämpspostis või `ADMIN_EMAIL` puudub (sinu teavitused) | Logi `[meil]`. Resendis vaata saadetud kirjade nimekirja ja domeeni olekut. Kontrolli rämpsposti. Tellimus on halduspaneelis igal juhul olemas |
| **Pakiautomaatide nimekiri ei lae** või kassas on ainult käsitsi sisestamine | Vedaja allikas ei vasta või on aadressi muutnud | Müük ei peatu. Ava `/api/pakiautomaadid?carrier=all` ja vaata välju `stale`, `manual`, `errors` (peatükk 11.4). Logi `[pakiautomaadid]`. Kui viga kestab üle päeva, palu arendajal kontrollida faili `netlify/functions/_lib/lockers.mjs` |
| Uus pakiautomaat pole nimekirjas | Nimekiri värskeneb kord ööpäevas | Oota päev või lase kliendil automaat käsitsi sisestada |
| **Halduspaneel ei lase sisse** | `ADMIN_PASSWORD_HASH` puudub või on valesti kopeeritud, `ADMIN_SESSION_SECRET` puudub või on lühem kui 32 märki, pärast muutmist pole uut deploy'd tehtud või parool on vale | `/admin` näitab põhjust. Tee uus räsi (peatükk 6), kopeeri see täpselt (koos `$`-märkidega, ilma tühikute ja jutumärkideta) ja tee uus deploy. Pärast 10 valet katset oota kuni 15 minutit |
| Halduspaneel viskab välja | Seanss kehtib 12 tundi või vahetati parool või saladus | Logi uuesti sisse |
| **Laoseis on miinuses** | Kaks inimest ostsid viimast mängu peaaegu samal ajal (mõlemad maksid) | Lisa laoseisu (uus partii) või võta ühe kliendiga ühendust ja tee tagasimakse (peatükk 13.4) |
| Statistika tundub vale | Statistika loeb ainult tasutud tellimusi, makse aja järgi Tallinna ajas. Komplektid on summas komplekti hinnaga | Vaata näitajate selgitusi (peatükk 13.7). Kontrolli valitud perioodi |
| CSV avaneb Excelis ühes veerus | Excelil on muud piirkonnaseaded | Excelis kasuta **Data → From Text/CSV** ja vali eraldajaks semikoolon. Google Sheetsis **File → Import** → eraldaja „Semicolon“ |
| Taganemisvorm annab vea | Andmebaas pole kättesaadav | Veateates on e-posti aadress, kuhu klient saab avalduse saata. Kontrolli andmebaasi (peatükk 4) |
| Klient: nuppu „Jätka makset“ pole | Makseleht kehtib 60 minutit. Pärast seda tuleb tellida uuesti | Normaalne. Vana tellimus muutub olekusse „Makseaeg sai läbi“ |
| Muudatus ei ilmu lehele | Deploy ebaõnnestus või pole valmis, või brauser näitab vana versiooni | Vaata **Deploys**: kas viimane on *Published* või *Failed*? Värskenda **Ctrl + Shift + R**. Piltide puhul kasuta uut failinime |
| Pärast muudatust on leht katki | Tõenäoliselt süntaksiviga `.js` failis | **Deploys** → viimane töötav versioon → **Publish deploy**. Seejärel paranda viga |
| Apple Pay või Google Pay ei ilmu | Seade ei toeta, Walletis pole kaarti või makseviis on välja lülitatud | Stripe → **Settings → Payment methods** |
| Uudiskirja e-postid ei ilmu Netlifysse | Vormide tuvastamine pole sees või pole pärast seda deploy'd tehtud | Peatükk 15.1. Kontrolli, et `public/__forms.html` on alles |

Kui ükski lahendus ei aita, kirjuta arendajale. Lisa ekraanipilt, lehe aadress, kellaaeg, tellimuse number ja Netlify logi rida.

---

## 20. Järgmised sammud ja ideed

| Idee | Milleks | Märkus |
|---|---|---|
| **Tagastusaadress kirjadesse** | Klient saab tagastusjuhised kohe | Vajab väikest arendust (peatükk 18) |
| **„Pakk on teel“ e-kiri** | Klient saab jälgimiskoodi kohe e-postiga | Vajab arendust. Praegu näeb klient seda kinnituskirja lingilt |
| **Pakkide automaatsed sildid** (Montonio Shipping või vedajate äriliidesed) | Säästab iga tellimusega mitu minutit | Mõistlik, kui tellimusi on rohkem kui paar päevas |
| **DPD, Venipak või Unisend** | Rohkem valikuid kliendile | Vajab lepingut ja arendust (peatükk 11) |
| **Analüütika** (nt Plausible) | Näed, kust külastajad tulevad ja kus ost pooleli jääb | Vajab turvaseadete muutmist ja vajaduse korral küpsiste nõusolekut |
| **Meta ja TikToki piksel** | Reklaamide mõõtmine | Vajab küpsiste nõusolekut ja 18+ sihtimist |
| **Arvustused ja klientide videod** | Sotsiaalne tõestus müüb | Alustuseks võib parimad tsitaadid lisada käsitsi |
| **Isiklikud ühekordsed sooduskoodid** | Kood ei levi internetis | Vajab arendust |
| **Kampaanialingid** | `…/ostukorv?kood=AGE15` lisab koodi ise | Töötab juba |

---

## Lisa A: kohalik arendus arvutis

Seda läheb vaja arendajal (või sulle, kui tahad muudatusi enne avaldamist arvutis proovida).

**Vaja on:** [Node.js](https://nodejs.org) versioon 20 või uuem (soovitatavalt 22 LTS) ja [Git](https://git-scm.com).

```bash
git clone https://github.com/christopherkingsepp/oh-mega-oof.git
cd oh-mega-oof
npm install
```

| Käsk | Mida teeb |
|---|---|
| `npm run dev:mock` | Pood aadressil **http://localhost:8080** **näidisrežiimis**: test-Stripe'i leht (nupud: maksa edukalt, viivitusega, ebaõnnestub, katkesta, lase aeguda, tagasimakse), e-kirjad salvestatakse kausta `.data/mail`, pakiautomaadid tulevad näidisnimekirjast. Andmebaas on päris (PGlite, kaust `.data/pglite`). Halduspaneel `/admin`, parool **`demo-admin`**. Internetti ega võtmeid pole vaja |
| `npm run dev` | Pood **päris** teenustega: Stripe'i testvõti, Resend ja vedajate päris nimekirjad. Võtmed loetakse failist `.env`. Andmebaas on kohalik PGlite, kui `.env`-is pole `DATABASE_URL`-i |
| `npm test` | Automaattestid (üle 200 testi). Kasutavad mälus olevat andmebaasi ega vaja internetti |
| `npm run admin:hash` | Halduspaneeli parooli räsi (peatükk 6) |

**`.env` fail (päris teenustega arendus):**

1. Kopeeri `.env.example` uue nimega `.env` ja täida väärtused. **Kasuta ainult testvõtmeid (`sk_test_…`).** `.env` faili GitHubi ei saadeta.
2. `ADMIN_PASSWORD_HASH` pane `.env`-is ühekordsetesse jutumärkidesse: `ADMIN_PASSWORD_HASH='scrypt$…'`.
3. Käivita `npm run dev`. Server loeb `.env` faili ise.

**Stripe'i webhooki testimine arvutis (valikuline, Stripe CLI):**

1. Paigalda [Stripe CLI](https://docs.stripe.com/stripe-cli) ja logi sisse: `stripe login`.
2. Käivita teises terminaliaknas:

   ```bash
   stripe listen --forward-to localhost:8080/api/stripe-webhook
   ```

3. Käsk prindib saladuse `whsec_…`. Pane see `.env` faili muutujaks `STRIPE_WEBHOOK_SECRET` (see erineb töölaua endpointi saladusest) ja käivita `npm run dev` uuesti.
4. Tee poes testost kaardiga `4242 4242 4242 4242`. Stripe CLI aknas näed sündmusi ja halduspaneelis muutub tellimus olekusse „Makstud“.

**Muud nipid:**

- Teine port: `PORT=8090 npm run dev:mock` (PowerShellis `$env:PORT = "8090"; npm run dev:mock`).
- Kohaliku andmebaasi tühjendamine: peata server ja kustuta kaust `.data/pglite`.
- Mock-kirjad: ava kaustas `.data/mail` olevad `.html` failid brauseris.
- Ekraanipildid: `npm run screenshot -- / pilt.png --base=http://localhost:8080 --mobile`.
- Kohalik server ei käivita ajastatud funktsioone. Automaatide nimekiri laetakse esimesel päringul.

---

## Lisa B: failide kaart

```
oh-mega-oof/
├── public/                 ← ★ KÕIK, mis läheb internetti (Netlify avaldab ainult selle kausta)
│   ├── index.html, kataloog.html, mida-viiu.html, oled-semu.html, vigur.html   ← lehed
│   ├── ostukorv.html, aitah.html        ← kassa ja kinnitusleht
│   ├── taganemine.html                  ← taganemisavalduse vorm
│   ├── kkk.html, tingimused.html, privaatsus.html, 404.html
│   ├── __forms.html                     ← soodusvormi peidetud koopia (ära kustuta)
│   ├── robots.txt, sitemap.xml
│   └── assets/
│       ├── css/            ← kujundus
│       ├── img/            ← pildid: brand/, games/, cards/
│       ├── admin/          ← halduspaneeli kujundus ja kood (andmed tulevad ainult serverist)
│       └── js/
│           ├── catalog.js        ← ★ HINNAD, tarne, vedajad, sooduskoodid
│           ├── site.js           ← ★ ettevõtte andmed, e-post, sotsiaalmeedia
│           ├── preview-cards.js  ← MIDA V!!!U 19 eelvaatekaarti
│           ├── layout.js         ← menüü, jalus, ostukorvi sahtel
│           ├── promo.js          ← −15% hüpik
│           └── …                 ← muu lehtede loogika (checkout.js, aitah.js, taganemine.js …)
├── netlify/functions/      ← serveri pool
│   ├── create-checkout.mjs      /api/checkout
│   ├── stripe-webhook.mjs       /api/stripe-webhook
│   ├── order-status.mjs         /api/tellimus
│   ├── parcel-lockers.mjs       /api/pakiautomaadid
│   ├── lockers-refresh.mjs      automaatide nimekirja igapäevane värskendus
│   ├── withdrawal.mjs           /api/taganemine
│   ├── admin-page.mjs, admin-login.mjs, admin-api.mjs   /admin ja /api/admin/*
│   ├── dev-mock-stripe.mjs      ainult kohalik test-Stripe
│   └── _lib/                    andmebaas, skeem, tellimused, maksed, e-kirjad, statistika …
├── netlify.toml            ← Netlify seadistus ja turvapäised
├── .env.example            ← keskkonnamuutujate näidis koos selgitustega (päris võtmeid siia EI kirjutata)
├── scripts/                ← kohalik server, parooli räsi, ekraanipildid, piltide skriptid
├── source/                 ← pakendi stantsifail ja lähtefailide kirjeldus (privaatsed failid: source/private/, mitte git'is)
├── tests/                  ← automaattestid
├── README.md               ← tehniline ülevaade arendajale
└── JUHEND.md               ← see juhend
```

---

## Lisa C: kasulikud lingid

| Mis | Link |
|---|---|
| Koodirepo | [github.com/christopherkingsepp/oh-mega-oof](https://github.com/christopherkingsepp/oh-mega-oof) |
| Netlify töölaud | [app.netlify.com](https://app.netlify.com) |
| Netlify dokumentatsioon (sh Netlify DB, keskkonnamuutujad) | [docs.netlify.com](https://docs.netlify.com) |
| Neoni konsool | [console.neon.tech](https://console.neon.tech) |
| Stripe'i töölaud | [dashboard.stripe.com](https://dashboard.stripe.com) |
| Stripe'i webhookid | [docs.stripe.com/webhooks](https://docs.stripe.com/webhooks) |
| Stripe'i testkaardid | [docs.stripe.com/testing](https://docs.stripe.com/testing) |
| Stripe CLI | [docs.stripe.com/stripe-cli](https://docs.stripe.com/stripe-cli) |
| Stripe'i hinnad | [stripe.com/ee/pricing](https://stripe.com/ee/pricing) |
| Resend | [resend.com](https://resend.com), juhend [resend.com/docs](https://resend.com/docs) |
| Omniva | [omniva.ee](https://www.omniva.ee) |
| SmartPosti | [smartpost.ee](https://www.smartpost.ee) |
| Piltide pakkimine | [squoosh.app](https://squoosh.app) |
| E-äriregister | [ettevotjaportaal.rik.ee](https://ettevotjaportaal.rik.ee) |
| Maksu- ja Tolliamet | [emta.ee](https://www.emta.ee) |
| Tarbijakaitse ja Tehnilise Järelevalve Amet | [ttja.ee](https://www.ttja.ee) |
| Andmekaitse Inspektsioon | [aki.ee](https://www.aki.ee) |
| `.ee` domeenid | [internet.ee](https://www.internet.ee) |

Edu ja palju ÄGEDAID õhtuid! 🃏
