# ÄGE veebipood: samm-sammuline juhend

Hei! See juhend on sulle, ÄGE omanik. Programmeerimist pole vaja osata. Kõik, mis vaja, on brauser, e-post, pangakonto ja natuke kannatust.

Juhendi lõpuks:

- on ÄGE pood päriselt internetis (alguses aadressil `age-pood.netlify.app`, hiljem sinu oma domeenil),
- saavad kliendid maksta kaardi, Apple Pay ja Google Payga,
- tead täpselt, kust leida tellimus, kuidas pakk teele panna ja kuidas hindu või tekste ise muuta.

**Kuidas seda juhendit kasutada**

- **Esimesel korral** käi läbi peatükid **1–8** järjest. Kokku kulub umbes 2–4 tundi, millele lisandub ooteaeg, kuni Stripe sinu ettevõtte andmed üle kontrollib (mõnest minutist mõne päevani).
- **Pärast avamist** on sinu igapäevane tööriist peatükk **9**. Hindade, tekstide ja piltide muutmiseks vaata peatükki **10**.
- Kui midagi ei tööta, ava peatükk **13**.
- Linnukeste `- [ ]` loendeid võid välja printida või oma märkmetesse kopeerida ja tehtud asjad maha tõmmata.

> ⚠️ **Tähtis:** ingliskeelsed nupunimed (nt **Add new project**) on kirjutatud nii, nagu need Netlify, Stripe'i ja GitHubi lehtedel praegu on. Need teenused muudavad oma kujundust aeg-ajalt. Kui nuppu täpselt sellise nimega ei leia, otsi sarnase tähendusega nuppu või kasuta lehe otsingut. Kõik kolm teenust on piisavalt sarnased, et õige koha üles leiad.

---

## Sisukord

0. [Ülevaade](#0-ülevaade)
1. [Mida on vaja enne alustamist](#1-mida-on-vaja-enne-alustamist)
2. [Kood GitHubi põhiharusse](#2-kood-githubi-põhiharusse)
3. [Netlify: pood internetti](#3-netlify-pood-internetti)
4. [Stripe: maksete seadistamine testrežiimis](#4-stripe-maksete-seadistamine-testrežiimis)
5. [Testtellimus](#5-testtellimus)
6. [Uudiskirja e-postid Netlify Formsiga](#6-uudiskirja-e-postid-netlify-formsiga)
7. [Oma domeen](#7-oma-domeen)
8. [LIVE-režiim: päris maksed](#8-live-režiim-päris-maksed)
9. [Igapäevane töö: tellimuse täitmine](#9-igapäevane-töö-tellimuse-täitmine)
10. [Sisu muutmine: hinnad, tekstid, pildid](#10-sisu-muutmine-hinnad-tekstid-pildid)
11. [Pacdora 3D-mudel](#11-pacdora-3d-mudel)
12. [Õiguslik kontrollnimekiri](#12-õiguslik-kontrollnimekiri)
13. [Korduma kippuvad probleemid](#13-korduma-kippuvad-probleemid)
14. [Järgmised sammud ja ideed](#14-järgmised-sammud-ja-ideed)
- [Lisa A: kohalik arendus arvutis](#lisa-a-kohalik-arendus-arvutis)
- [Lisa B: failide kaart](#lisa-b-failide-kaart)
- [Lisa C: kasulikud lingid](#lisa-c-kasulikud-lingid)

---

## 0. Ülevaade

### Mis on valmis

**Lehed**

| Aadress | Mis seal on |
|---|---|
| `/` (avaleht) | Pöörlev 3D-karp, MIDA V!!!U tutvustus ja kaarditüübid, minimäng „Tõmba kaart“, kõik kolm mängu, komplektid, reeglid nelja sammuna, ÄGE lugu (õpilasfirmast päris firmaks), KKK eelvaade ja sotsiaalmeedia lingid |
| `/mida-viiu` | MIDA V!!!U tootelehekülg: 3D-karp ja galerii, kaardipakk, mida saab lohistada ja ümber pöörata, kogusevalik, mobiilis ekraani alla kinnituv osturiba, nupp **„Vaata 3D-mudelit“** (Pacdora), KKK ja soovitused teistele mängudele |
| `/oled-semu`, `/vigur` | Samasugused tootelehed Oled Semu? ja Viguri jaoks |
| `/ostukorv` | Ostukorv ja kassa ühel lehel: **Sinu ostukorv → Tarne pakiautomaati → Kontaktandmed → Kinnita ja maksa**. Seal on ka sooduskoodi väli, pakiautomaadi otsing ja kokkuvõte. Nupp **„Maksa …“** viib Stripe'i makselehele |
| `/aitah` | Tänuleht konfetiga, tellimuse kokkuvõte ja TikToki/Instagrami lingid. Siia jõuab klient pärast makset |
| `/kkk`, `/tingimused`, `/privaatsus` | KKK, müügitingimused ja privaatsuspoliitika. Need tuleb enne avamist läbi lugeda ja täiendada (vt peatükk 12) |

**Funktsioonid kõigil lehtedel**

- Päis, jalus ja külgsahtlisse avanev ostukorv. Iga „Lisa ostukorvi“ nupp näitab väikest teadet ja ostukorv jääb brauserisse meelde.
- **18+ vanusekontroll** avalehel ja MIDA V!!!U lehel. Kassas peab klient lisaks märkima, et on vähemalt 18-aastane, kui ostukorvis on MIDA V!!!U või „Kõik 3 mängu“ komplekt.
- **−15% hüpik:** mõne sekundi pärast ilmub ekraani nurka kaart. Klient sisestab e-posti, kraabib kraapekaardi ja saab koodi **AGE15**. Nupp „Kasuta kohe“ lisab koodi otse ostukorvi. E-postid salvestuvad Netlify Formsi (peatükk 6).
- Mobiil on esikohal ja kogu kujundus on tehtud ka 360 px laiuse ekraani jaoks. Kui külastaja on oma seadmes animatsioonid välja lülitanud (*reduced motion*), jäävad animatsioonid vaiksemaks.
- Otsingumootorite ja sotsiaalmeedia eelvaate andmed (pealkirjad, kirjeldused, jagamispilt) ning turvapäised.

**Serveri pool (Netlify Functions)**

- `/api/pakiautomaadid` toob Omniva ja SmartPosti pakiautomaatide nimekirja automaatselt vedajate avalikest allikatest. DPD puhul kirjutab klient automaadi nime ja aadressi ise, sest DPD-l pole avalikku nimekirja.
- `/api/checkout` arvutab hinna, soodustuse ja tarne **serveris uuesti** (keegi ei saa brauseris hinda muuta) ja loob Stripe'i makselehe.
- Automaattestid (`npm test`) kontrollivad hinnaarvutust, tellimuse kontrolli ja pakiautomaatide nimekirja.

### Kuidas see töötab

```
  KLIENT (telefon või arvuti)
     │  valib mängu → ostukorv → pakiautomaat → kontaktandmed
     ▼
  VEEBILEHT (Netlify)
     │  /api/pakiautomaadid ──► Omniva / SmartPosti automaatide nimekiri
     │  „Maksa“ ──► /api/checkout arvutab summa ise üle
     ▼
  STRIPE'I MAKSELEHT (kaart, Apple Pay, Google Pay)
     │  makse õnnestus
     ├──► KLIENT: tänuleht /aitah + Stripe'i kviitung e-postile
     └──► SINA: Stripe'i teavitus + tellimuse info (nimi, telefon, automaat)
                 + raha Stripe'i kontole → automaatselt sinu pangakontole
     ▼
  SINA: pakid mängu → registreerid saadetise vedaja lehel → viid pakiautomaati
     ▼
  KLIENT saab vedajalt SMS-i koodiga ja võtab paki automaadist
```

Eraldi „admin-paneeli“ pole ja seda pole ka vaja:

| Mida tahad teha | Kus |
|---|---|
| Näha tellimusi, raha, teha tagasimakseid | **Stripe** (dashboard.stripe.com) |
| Näha hüpikust liitunud e-poste | **Netlify → Forms** |
| Muuta hindu, tekste, pilte | **GitHub** (muudatus jõuab lehele ise umbes minutiga) |
| Näha, kas leht töötab, ja vigade logisid | **Netlify → Deploys / Logs** |

### Mida veebileht (veel) ei tee

Parem teada kohe alguses:

- **Pakkide registreerimine pole automaatne.** Saadetise teed ise vedaja lehel (peatükk 9).
- **Veebileht ise sulle e-kirja ei saada.** Uuest tellimusest annab teada Stripe, kui sa selle sisse lülitad (samm 4.6).
- **Laoseisu ei peeta.** Kui mõni mäng saab otsa, tuleb see käsitsi müügilt maha võtta (palu arendaja abi).
- **Sooduskood AGE15 pole isiklik ega ühekordne.** Sama koodi saab tehniliselt kasutada mitu korda ja seda saab teistega jagada. Kui see muutub probleemiks, vaheta kood (peatükk 10.4).
- **Vanusekontroll on enesekinnitus**, mitte isikutuvastus.
- **Tänuleht `/aitah` ei ole maksekinnitus.** Ainus kindel tõend makse kohta on Stripe'is staatusega „Succeeded“ makse.

### Kulud

| Mis | Hind | Märkus |
|---|---|---|
| GitHub | 0 € | Siin hoitakse koodi |
| Netlify (Free plaan) | 0 € | Veebimajutus, serverifunktsioonid ja vormid. Tasuta plaanil on igakuised limiidid: uutel kontodel arvestatakse krediite, mida kulutavad näiteks iga avaldamine (deploy), liiklus ja vormide esitused. Väikesele poele piisab sellest tavaliselt. Kontrolli kehtivat hinda: [netlify.com/pricing](https://www.netlify.com/pricing/) |
| Stripe | Kuutasu pole. Iga makse pealt umbes **1,5% + 0,25 €** (standardsed Euroopa kaardid) | Premium-, äri- ja Euroopa-väliste kaartide tasu on suurem. **Kontrolli kehtivat hinda: [stripe.com/ee/pricing](https://stripe.com/ee/pricing)** |
| `.ee` domeen | umbes 10–20 € aastas | Valikuline (peatükk 7), hind sõltub registripidajast |
| Pakkide saatmine | vedaja hinnakirja järgi | Klient maksab tarne eest 2,99 € (alates 30 € on tarne tasuta). Ülejäänu on sinu kulu |

**Näide:** klient ostab MIDA V!!!U koos tarnega: 17,50 € + 2,99 € = 20,49 €. Stripe võtab sellest umbes 20,49 × 1,5% + 0,25 ≈ **0,56 €**, nii et sinu kontole jõuab umbes **19,93 €**. Sellest tuleb veel maksta paki saatmise eest.

### Mini-sõnastik

| Sõna | Tähendus |
|---|---|
| **Repo** (repository) | Projekti kaust GitHubis, kus on kõik veebilehe failid |
| **Haru** (branch) | Repo paralleelne versioon. **main** on põhiharu, millest pood internetti läheb |
| **Commit** | Salvestatud muudatus koos lühikese kirjeldusega |
| **Pull Request (PR)** | Ettepanek ühe haru muudatused teise haru tõsta |
| **Merge** | Muudatuste ühendamine põhiharuga |
| **Deploy** | Veebilehe uue versiooni avaldamine. Netlify teeb seda ise pärast igat muudatust `main` harus |
| **Keskkonnamuutuja** | Salajane seadistus (nt Stripe'i võti), mida hoitakse Netlifys, mitte koodis |
| **Netlify Function** | Väike serveriprogramm, mis töötab Netlifys (nt makse alustamine) |
| **Testrežiim / LIVE** | Stripe'i harjutusrežiim (raha ei liigu) ja päris maksete režiim |
| **Metadata** | Stripe'i makse juurde salvestatud lisainfo. Sealt leiad pakiautomaadi, telefoni ja muu |

---

## 1. Mida on vaja enne alustamist

- [ ] **GitHubi konto**, millel on ligipääs repole **`christopherkingsepp/oh-mega-oof`**. Kood on juba seal.
- [ ] **Netlify konto** ([netlify.com](https://www.netlify.com)). Kõige lihtsam on registreeruda nupuga „Sign up with GitHub“.
- [ ] **Stripe'i konto** ([stripe.com/ee](https://stripe.com/ee)). Testimiseks piisab e-postist. Päris maksete jaoks on vaja:
  - **ettevõtet**, soovitatavalt **OÜ-d** koos registrikoodiga. Stripe toetab ka füüsilisest isikust ettevõtjat (FIE), aga OÜ eraldab ettevõtte raha sinu isiklikust rahast;
  - **isikut tõendavat dokumenti** (ID-kaart või pass) ettevõtte esindaja kohta;
  - **ettevõtte pangakontot (IBAN)**, kuhu Stripe raha kannab;
  - telefoninumbrit kaheastmelise sisselogimise jaoks.
- [ ] **Domeen** (valikuline, nt `age.ee`). Poe saab avada ka tasuta `netlify.app` aadressil ja domeeni hiljem juurde lisada.
- [ ] **Ettevõtte e-postiaadress**, kuhu tulevad Stripe'i ja Netlify teavitused. Praegu on veebilehel kirjas `aarmiselt@gmail.com`. Kontrolli, et see on õige (peatükk 10.5).

> ⚠️ **Tähtis: alaealisena.** Stripe'i konto avaja ja ettevõtte esindaja peab üldjuhul olema täisealine. Kui oled alla 18, peab Stripe'i konto avama ja seda haldama täiskasvanu (nt lapsevanem), kes on ka ettevõtte esindaja. JA õpilasfirma ei ole juriidiline isik, seega päris maksete jaoks on vaja OÜ-d (või FIE-d). OÜ saab asutada e-äriregistris ([ettevotjaportaal.rik.ee](https://ettevotjaportaal.rik.ee)) ID-kaardi või Smart-ID-ga. Kehtivad osakapitali ja riigilõivu nõuded leiad samast portaalist.

---

## 2. Kood GitHubi põhiharusse

Veebilehe kood on GitHubis harus **`claude/age-kaardimang-jt4br4`**. Netlify avaldab poe põhiharust **`main`**, seega tuleb muudatused sinna tõsta.

### Variant A: repos on juba haru `main` (tavaline juhtum)

1. Ava [github.com/christopherkingsepp/oh-mega-oof](https://github.com/christopherkingsepp/oh-mega-oof).
2. Kui lehe ülaosas on kollane riba tekstiga *„claude/age-kaardimang-jt4br4 had recent pushes“*, vajuta **Compare & pull request**.
   Kui riba pole, vajuta **Pull requests → New pull request** ja vali:
   - **base:** `main`
   - **compare:** `claude/age-kaardimang-jt4br4`
3. Kirjuta pealkirjaks näiteks *„ÄGE veebipood“* ja vajuta **Create pull request**.
4. Oota, kuni automaatkontrollid lõpetavad. Kui Netlify on juba ühendatud, ilmub siia ka **Deploy Preview** link, kust saad poodi enne avaldamist vaadata.
5. Vajuta **Merge pull request → Confirm merge**.
6. Valikuline: vajuta **Delete branch**, et vana haru ei segaks.

### Variant B: haru `main` pole olemas

Kui repo oli tühi, võib GitHub näidata vaikeharuna hoopis `claude/age-kaardimang-jt4br4`.

1. Ava repo, vajuta vasakul üleval haru nimega nuppu, kirjuta väljale `main` ja vali **Create branch main from claude/age-kaardimang-jt4br4**.
2. Mine **Settings → General → Default branch**, vaheta vaikeharuks `main` (nooltega ikoon) ja kinnita.

✅ **Kontroll:** repo avalehel on valitud haru `main` ja failide seas on näha `index.html`, `netlify.toml` ja `JUHEND.md`.

---

## 3. Netlify: pood internetti

1. Logi sisse: [app.netlify.com](https://app.netlify.com).
2. Vajuta **Add new project** (vanemas vaates **Add new site**) → **Import an existing project**.
3. Vali **GitHub** ja luba Netlifyl GitHubi kasutada.
   - Kui repot `oh-mega-oof` nimekirjas pole, vajuta **Configure the Netlify app on GitHub** ja anna ligipääs sellele repole (sobib *Only select repositories*).
4. Vali repo **oh-mega-oof**.
5. Seadista (enamik välju täitub ise, sest repos on fail `netlify.toml`):

   | Väli | Väärtus |
   |---|---|
   | Branch to deploy | `main` |
   | Base directory | *(tühi)* |
   | Build command | *(tühi, ehitusetappi pole vaja)* |
   | Publish directory | `.` (punkt ehk repo juurkaust) |
   | Functions directory | `netlify/functions` |
   | Project name | `age-pood` (kui see on vaba) |

6. Vajuta **Deploy** (nupu nimes võib olla ka projekti nimi). Oota 1–3 minutit, kuni deploy staatus on **Published**.
7. Ava aadress, näiteks **https://age-pood.netlify.app**.

**Saidi nime muutmine hiljem:** **Project configuration → General → Project details → Change project name**. Uus nimi muudab ka aadressi (`uusnimi.netlify.app`).

✅ **Kontrolli:**

- [ ] Avaleht avaneb ja 3D-karp pöörleb.
- [ ] `/mida-viiu`, `/oled-semu` ja `/vigur` avanevad.
- [ ] „Lisa ostukorvi“ töötab ja ostukorvi sahtel avaneb.
- [ ] Lehel `/ostukorv` laeb Omniva ja SmartPosti valimisel automaatide nimekiri. DPD valimisel ilmub käsitsi sisestamise väli.
- [ ] Nupp **„Maksa …“** annab praegu teate *„Makse pole veel seadistatud. Võta meiega ühendust.“* **See on õige**, sest Stripe pole veel ühendatud.

> 💡 **Nipp:** iga muudatus `main` harus avaldatakse nüüd automaatselt. Kõik avaldused näed vaates **Deploys**. Kui mõni uus versioon läheb katki, saad seal varasema töötava versiooni ühe klikiga tagasi panna (peatükk 13).

---

## 4. Stripe: maksete seadistamine testrežiimis

Alusta **testrežiimis**. Seal liigub ainult mänguraha ja kõike saab rahulikult proovida.

### 4.1 Konto loomine

1. Mine aadressile [dashboard.stripe.com/register](https://dashboard.stripe.com/register).
2. Sisesta e-post, nimi ja parool, vali riigiks **Estonia** ja kinnita e-post.
3. Ettevõtte andmeid **ei pea veel** sisestama. Testida saab ka ilma.

### 4.2 Testrežiim

- Lülita sisse **Test mode** (lüliti töölaual) või vali uuemas vaates kontomenüüst testkeskkond (**Sandbox**).
- Testrežiimis on lehel värviline riba või märge „Test“. Kõik selle ajal tehtud maksed on päriselt olematud.

### 4.3 Salajase võtme kopeerimine

1. Mine **Developers → API keys** (otse: [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)). Kui menüüs seda ei leia, kirjuta Stripe'i otsingusse „API keys“.
2. Real **Secret key** vajuta **Reveal test key** ja kopeeri võti. See algab nii: **`sk_test_…`**
3. *Publishable key* (`pk_test_…`) **ei ole** vaja. See siin ei tööta.

> ⚠️ **Tähtis: salajane võti on nagu sinu pangakaardi PIN.**
> - Ära pane seda **mitte kunagi** koodi, GitHubi, sõnumisse, e-kirja ega ekraanipildile.
> - Seda hoitakse ainult Netlify keskkonnamuutujates (järgmine samm).
> - Kui võti lekib, mine **Developers → API keys**, vali võtme juures **Roll key** (loob uue võtme ja tühistab vana) ning pane uus võti Netlifysse.

### 4.4 Võtme lisamine Netlifysse

1. Netlifys ava oma projekt → **Project configuration** (vanemas vaates *Site configuration*) → **Environment variables**.
2. Vajuta **Add a variable → Add a single variable**.
3. Täida:
   - **Key:** `STRIPE_SECRET_KEY`
   - **Value:** sinu `sk_test_…` võti
   - **Scopes:** jäta *All scopes* (vähemalt **Functions** peab olema valitud)
   - Kui pakutakse valikut **Contains secret values**, märgi see.
4. Vajuta **Create variable**.

### 4.5 Uus deploy

Keskkonnamuutuja hakkab tööle **alles pärast uut deploy'd**.

1. Mine **Deploys → Trigger deploy → Deploy project** (vanemas vaates *Deploy site*).
2. Oota, kuni staatus on **Published**.

### 4.6 Stripe'i seaded, mis tasub kohe ära teha

- [ ] **Bränding** (**Settings → Branding**): lae üles logo (nt repost `assets/img/brand/icon-512.png`), vali brändivärviks `#ff2fa8`. Need ilmuvad Stripe'i makselehel ja kviitungitel.
- [ ] **Avalikud andmed** (**Settings → Business → Public details**): nimi „ÄGE“, klienditoe e-post, veebilehe aadress ja *statement descriptor*, ehk tekst, mida klient näeb oma pangaväljavõttel (nt `AGE KAARDIMANG`).
- [ ] **Makseviisid** (**Settings → Payment methods**): kontrolli, et **Cards**, **Apple Pay** ja **Google Pay** on sees. Need on tavaliselt vaikimisi sisse lülitatud. Pood pakub automaatselt kõiki makseviise, mille siin sisse lülitad ja mis kliendi seadmele sobivad. Apple Pay näiteks ilmub ainult Apple'i seadmes, kus Walletis on kaart. Vaata ka, mida veel saab lisada (nt Revolut Pay või Klarna).
- [ ] **Kviitungid kliendile** (**Settings → Customer emails**): lülita sisse **Successful payments**. LIVE-režiimis saadab pood kliendi e-posti Stripe'ile niikuinii, nii et kviitung läheb välja, aga hoia see seade igaks juhuks sees.
- [ ] **Teavitused sulle**: Stripe'i isiklikes seadetes (*Personal details* / *Communication preferences*) lülita sisse e-kiri õnnestunud maksete kohta (**Successful payments**).
- [ ] **Stripe'i äpp telefonis** (iOS/Android): saad iga makse kohta kohe märguande.

---

## 5. Testtellimus

### 5.1 Tee testost

1. Ava oma pood (`https://age-pood.netlify.app`). Kõige parem on privaatne/inkognito aken.
2. Kinnita vanusekontroll, ava `/mida-viiu` ja vajuta **„Lisa ostukorvi“**.
3. Ava **Ostukorv** ja täida:
   - **Tarne pakiautomaati:** vali **Omniva** ja otsi automaat (nt „Kristiine“).
   - **Kontaktandmed:** oma nimi, **oma e-post** ja **oma Eesti mobiilinumber** (nt `5123 4567`).
   - **Kinnita ja maksa:** märgi müügitingimuste ja 18+ kastikesed.
4. Vajuta **„Maksa 20,49 €“**. Avaneb Stripe'i makseleht.
5. Sisesta **testkaart**:

   | Väli | Väärtus |
   |---|---|
   | Kaardi number | `4242 4242 4242 4242` |
   | Kehtivus | ükskõik milline tulevane kuupäev, nt `12/34` |
   | CVC | ükskõik millised 3 numbrit, nt `123` |
   | Nimi | ükskõik milline |

6. Vajuta maksmise nuppu. Sind suunatakse tänulehele **`/aitah`**: konfetid, tellitud tooted ja pakiautomaat. Ostukorv on nüüd tühi.

### 5.2 Kontrolli Stripe'is

1. Stripe'is (testrežiimis) ava **Transactions** (vanemas vaates **Payments**). Seal peab olema makse summaga **20,49 €** ja staatusega **Succeeded**.
2. Klõpsa maksel ja keri alla jaotiseni **Metadata**. Seal on kogu tellimuse info:

| Väli | Mis see on | Näide |
|---|---|---|
| `order_id` | Tellimuse number | `AGE-7KQ2PX` |
| `customer_name` | Saaja nimi (läheb pakile) | `Mari Maasikas` |
| `phone` | Telefon, kuhu vedaja saadab SMS-i | `+37251234567` |
| `carrier` | Vedaja | `omniva` / `smartpost` / `dpd` |
| `locker_id` | Automaadi kood vedaja süsteemis (puudub, kui klient kirjutas automaadi käsitsi) | `96331` |
| `locker_name` | Automaadi nimi. Käsitsi sisestamisel kliendi kirjutatud nimi ja aadress | `Tallinna Kristiine keskuse pakiautomaat` |
| `locker_address` | Automaadi aadress | `Endla 45` |
| `items` | Tooted ja kogused | `mida-viiu x1, vigur x2` |
| `discount_code` | Kasutatud sooduskood (kui kasutati) | `AGE15` |
| `discount_cents` | Soodustus **sentides** | `263` = 2,63 € |
| `shipping_cents` | Tarne hind sentides (`0` = tasuta) | `299` = 2,99 € |
| `total_cents` | Makstud kokku sentides | `2049` = 20,49 € |
| `newsletter` | Kas klient soovis kassas uudiskirja | `jah` / `ei` |
| `age_confirmed` | Kas klient kinnitas, et on 18+ | `jah` / `ei` |

**Tootekoodid väljal `items`:**

| Kood | Toode | Mitu karpi pakki panna |
|---|---|---|
| `mida-viiu` | MIDA V!!!U | 1 |
| `oled-semu` | Oled Semu? | 1 |
| `vigur` | Vigur | 1 |
| `komplekt-semu-vigur` | Oled Semu? + Vigur | **2** (Oled Semu? ja Vigur) |
| `komplekt-koik` | Kõik 3 mängu | **3** (MIDA V!!!U, Oled Semu? ja Vigur) |

Lisaks on makse kirjelduses (*Description*) näiteks „ÄGE tellimus AGE-7KQ2PX: MIDA V!!!U ×1“. Kliendi e-post on makse andmetes ja saaja nimi, telefon ning automaat on näha ka tarneandmetes (*Shipping*).

> 💡 **Nipp:** testrežiimis **Stripe kviitungit automaatselt ei saada**. See on normaalne. Kviitungi välimust saad vaadata, kui saadad selle makse lehelt käsitsi iseendale (nt nupuga *Send receipt*).

### 5.3 Testi ka neid olukordi

- [ ] **Sooduskood:** lisa ostukorvis kood `AGE15`, kontrolli, et summa väheneb 15%, ja maksa. Stripe'is ilmub **Product catalog → Coupons** alla kupong nimega „AGE15 (−15%)“. See luuakse automaatselt esimesel kasutusel (vt peatükk 10.4).
- [ ] **Tasuta tarne:** pane ostukorvi „Kõik 3 mängu“ (33 €). Tarne peab olema 0 €.
- [ ] **Katkestamine:** Stripe'i makselehel vajuta vasakul üleval tagasi-noolt. Jõuad tagasi ostukorvi teatega, et makse katkestati, ja ostukorv on alles.
- [ ] **Tagasilükatud kaart:** kasuta kaarti `4000 0000 0000 0002`. Stripe näitab veateadet ja raha ei liigu.
- [ ] **Pangakinnitus (3D Secure):** kaardiga `4000 0025 0000 3155` avaneb testkinnituse aken.
- [ ] **DPD:** vali kassas DPD ja kirjuta automaadi nimi käsitsi. Stripe'is on see väljal `locker_name`.
- [ ] **Mobiil:** tee üks testost ka telefonis.

✅ Kui kõik ülaltoodu töötab, on makse pool valmis. Päris raha liigub alles pärast peatükki 8.

---

## 6. Uudiskirja e-postid Netlify Formsiga

−15% hüpikus sisestatud e-postid saadetakse Netlify Formsi vormi nimega **`soodus`**. Iga kirje juures on e-post ja leht, kus klient liitus.

### 6.1 Vormide sisselülitamine

1. Netlifys ava oma projekt → **Forms**.
2. Vajuta **Enable form detection**.
3. Tee uus deploy: **Deploys → Trigger deploy → Deploy project**. Netlify otsib vorme ainult deploy ajal, seega ilma uue deploy'ta vormi ei leita.
4. Ava uuesti **Forms**. Nimekirjas peab olema vorm **`soodus`**.

> ⚠️ **Tähtis:** Netlify leiab vormid ainult HTML-failidest deploy hetkel. Hüpik luuakse lehel JavaScriptiga, mistõttu peab mõnes HTML-failis olema ka vormi **peidetud koopia**. Kui pärast samme 1–3 vormi `soodus` nimekirjas **ei ole**, vaata peatüki 13 rida „Uudiskirja e-postid ei ilmu Netlifysse“. Seal on täpne koodijupp, mille saad ise lisada. Klient näeb koodi AGE15 igal juhul, aga e-post jääb siis salvestamata.

### 6.2 Testi

1. Ava pood inkognito aknas, oota umbes 4 sekundit (või keri lehte) ja klõpsa nurka ilmunud kaardil.
2. Sisesta oma e-post ja vajuta **„Saan −15%“**.
3. Netlifys ava **Forms → soodus**. Uus kirje peaks ilmuma mõne sekundi jooksul.

### 6.3 E-kiri iga uue liituja kohta

1. **Project configuration → Notifications → Emails and webhooks**.
2. Jaotises **Form submission notifications** vajuta **Add notification → Email notification**.
3. Vali vormiks **soodus**, sisesta oma e-post ja salvesta.

### 6.4 Nimekirja allalaadimine (CSV)

**Forms → soodus →** nupp **Download as CSV** (võib olla „⋯“ menüü all). CSV-faili saab avada Excelis või Google Sheetsis ja importida uudiskirjateenusesse.

### 6.5 Rämpspost

Netlify filtreerib rämpsu automaatselt. Lisaks on vormis nähtamatu „lõksuväli“, mida täidavad ainult robotid. Vaata aeg-ajalt ka vaadet **Spam submissions**. Kui mõni päris inimene on sinna sattunud, märgi ta õigeks.

> 💡 **Tasuta plaanil on vormide esituste arvul kuine piir.** Kontrolli kehtivat limiiti [netlify.com/pricing](https://www.netlify.com/pricing/) lehelt. Kui liitujaid tuleb palju, on aeg kolida uudiskirjateenusesse (6.7).

### 6.6 Uudiskirja soov kassas

Kassas on ka märkeruut **„Soovin uudiskirja ja eripakkumisi“**. See info **ei lähe** Netlify Formsi. See on Stripe'is makse juures väljal `newsletter = jah`. Kui kogud uudiskirja nimekirja, lisa ka need ostjad. Kõige mugavam on Stripe'ist makseid eksportida (**Transactions → Export**, kus saab tavaliselt valida ka metadata veerud).

### 6.7 Hiljem: MailerLite või Mailchimp

- **Käsitsi:** laadi Netlifyst CSV alla ja impordi see uudiskirjateenusesse (*Subscribers → Import*). Kinnita importimisel, et inimesed on liitumiseks nõusoleku andnud.
- **Automaatselt:** Zapieri kaudu: päästik *Netlify – New Form Submission* → toiming *MailerLite – Create/Update Subscriber*. Zapieri tasuta plaanil on toimingute arv piiratud.
- **Boonus:** seadista uudiskirjateenuses tervituskiri, mis saadab koodi AGE15 uuesti meelde.

> ⚠️ **Tähtis: isikuandmed (GDPR).**
> - Kasuta e-poste **ainult** ÄGE uudiste ja pakkumiste jaoks. Hüpikus on kirjas, et liituja nõustub just sellega.
> - Ära jaga nimekirja kellegagi ja hoia CSV-faile turvaliselt. Ära jäta neid avalikku kausta ega saada neid laiali.
> - Igas uudiskirjas peab olema lihtne loobumislink. Kui keegi soovib, et tema andmed kustutataks, kustuta need kõikjalt (Netlify Forms, CSV-failid, uudiskirjateenus).
> - Privaatsuspoliitikas (`/privaatsus`) peab olema kirjas, et kasutad Netlifyt ja hiljem uudiskirjateenust.

---

## 7. Oma domeen

### 7.1 Domeeni ostmine

1. Mõtle välja nimi ja kontrolli, kas see on vaba. `.ee` domeene müüvad akrediteeritud registripidajad, näiteks [zone.ee](https://www.zone.ee) ja [veebimajutus.ee](https://www.veebimajutus.ee). Täisnimekirja leiad [internet.ee](https://www.internet.ee) lehelt.
2. Osta domeen. Kui ettevõte on olemas, registreeri see **ettevõtte nimele**. Hind on umbes 10–20 € aastas.

### 7.2 Domeeni lisamine Netlifysse

1. Netlifys: **Domain management → Add a domain** (või *Add custom domain*), kirjuta näiteks `age.ee` ja kinnita.
2. Netlify küsib, kuidas DNS-i hallata. Vali üks kahest variandist.

**Variant A: Netlify DNS (lihtsam)**

1. Netlify näitab sulle 4 nimeserverit.
2. Registripidaja lehel (nt Zone'i haldusliideses) otsi domeeni juurest **nimeserverid** ja asenda need Netlify omadega.
3. Muudatus võib jõuda kõikjale mõne minutiga, aga mõnikord kulub kuni 24–48 tundi.

> ⚠️ **Tähtis:** kui kasutad registripidaja juures selle domeeniga e-posti (nt `info@age.ee`), vii pärast nimeserverite vahetust ka **MX-kirjed** Netlify DNS-i üle. Vastasel juhul lakkab e-post töötamast. Kui sa pole kindel, kasuta varianti B.

**Variant B: DNS jääb registripidaja juurde**

Lisa registripidaja DNS-i halduses kirjed, mida Netlify sulle näitab. Tavaliselt on need järgmised:

| Tüüp | Nimi | Väärtus |
|---|---|---|
| A | `@` (ehk `age.ee`) | `75.2.60.5` (Netlify koormusjaotur) |
| CNAME | `www` | `age-pood.netlify.app` (sinu Netlify aadress) |

Kasuta **alati neid väärtusi, mida Netlify sulle oma juhistes näitab**. Tabel on ainult näide.

### 7.3 HTTPS (turvaline ühendus)

Kui DNS töötab, hangib Netlify tasuta **Let's Encrypt** sertifikaadi automaatselt. Seisu näed vaates **Domain management → HTTPS**. Kui tunni-paari pärast pole midagi juhtunud, vajuta seal **Verify DNS configuration** ja seejärel **Provision certificate**.

### 7.4 Pärast domeeni käivitumist

- [ ] Ava `assets/js/site.js` ja täida `url: 'https://www.age.ee'` (oma päris aadressiga, vt peatükk 10).
- [ ] Kui projektis on failid `sitemap.xml` ja `robots.txt`, asenda neis vana aadress uuega.
- [ ] Stripe'is: **Settings → Business → Public details → Website** on uus aadress.
- [ ] Tee Netlifys uus deploy. Stripe suunab pärast makset kliendi tagasi Netlify **põhidomeenile**, seega pärast põhidomeeni määramist tasub teha üks testost (peatükk 5) ja veenduda, et tänuleht avaneb uuel aadressil.
- [ ] Uuenda TikToki ja Instagrami profiilis link.
- [ ] Valikuline: lisa leht [Google Search Console'i](https://search.google.com/search-console) ja esita seal sitemap, et Google leiaks poe kiiremini.

---

## 8. LIVE-režiim: päris maksed

### 8.1 Enne aktiveerimist

- [ ] Peatükk 5 on läbi tehtud ja kõik töötab.
- [ ] Ettevõtte andmed on `assets/js/site.js` failis täidetud (nimi koos „OÜ“-ga, registrikood, e-post).
- [ ] `/tingimused` ja `/privaatsus` on läbi loetud ja täiendatud. **Peatükk 12 on läbi mõeldud**, eriti tagastamise osa.

> 💡 Stripe vaatab aktiveerimisel ka sinu veebilehte. Seal peavad olema nähtavad tooted koos hindadega, kontaktandmed, müügitingimused (sh tagastamine) ja privaatsuspoliitika. Kõik need lehed on poes olemas. Hoolitse, et nende sisu oleks täidetud.

### 8.2 Stripe'i konto aktiveerimine

1. Stripe'i töölaual vajuta **Activate payments** (või *Complete your profile*).
2. Täida andmed:
   - **Ettevõtte tüüp:** näiteks *Company* (OÜ) ja registrikood,
   - **esindaja andmed:** nimi, sünniaeg, aadress ja isikut tõendav dokument,
   - **omanikud ja juhatuse liikmed**,
   - **veebileht:** sinu domeen või `age-pood.netlify.app`,
   - **tegevuse kirjeldus**, näiteks *„Seltskonna- ja kaardimängude e-pood. Mängud peredele ja täiskasvanutele, tarne Eesti pakiautomaatidesse.“*,
   - **pangakonto (IBAN)**, kuhu raha kantakse,
   - kaheastmeline sisselogimine.
3. Oota kinnitust. Mõnikord tuleb see mõne minutiga, mõnikord küsib Stripe lisadokumente.

### 8.3 LIVE-võti Netlifysse

1. Stripe'is lülita testrežiim **välja**.
2. **Developers → API keys → Secret key → Reveal live key** ja kopeeri võti. See algab nii: **`sk_live_…`**
   > ⚠️ Stripe võib LIVE-võtit näidata **ainult üks kord**. Kopeeri see kohe Netlifysse. Kui see kaob, loo uus võti (**Roll key** / **Create secret key**).
3. Netlifys: **Project configuration → Environment variables → STRIPE_SECRET_KEY → Edit**, pane väärtuseks `sk_live_…` ja salvesta.
   > 💡 **Edasijõudnutele:** Netlify lubab panna eri keskkondadele eri väärtused. Näiteks *Production* jaoks `sk_live_…` ja *Deploy Previews* ning *Branch deploys* jaoks `sk_test_…`. Siis saab muudatusi eelvaates testkaardiga proovida, ilma et päris raha liiguks.
4. **Deploys → Trigger deploy → Deploy project**. Oota, kuni staatus on **Published**.

### 8.4 Päris testost

1. Osta poest midagi odavat **oma päris kaardiga**, näiteks Oled Semu? (12,95 € + 2,99 € tarne = 15,94 €).
2. Kontrolli:
   - [ ] Stripe'is (LIVE-režiimis) on makse staatusega **Succeeded** ja metadata on olemas.
   - [ ] Sulle tuli **kviitung** e-postile.
   - [ ] Sulle tuli **teavitus** uuest maksest (e-post või äpp).
3. Tee sellele maksele **tagasimakse**: ava makse → **Refund** → kogu summa → **Refund**. Raha jõuab kaardile tagasi mõne päeva jooksul.
   > Stripe ei tagasta tagasimakse korral oma algset teenustasu. See test maksab sulle umbes 0,49 €.

### 8.5 Avamise kontrollnimekiri

- [ ] Kõik lehed avanevad nii telefonis kui arvutis.
- [ ] Hinnad, tarnehind ja tasuta tarne piir on õiged.
- [ ] Testost LIVE-režiimis õnnestus ja tagasimakse on tehtud.
- [ ] Netlify Formsis on vorm `soodus` ja e-kirja teavitus on seadistatud.
- [ ] Stripe'i teavitused jõuavad sinu telefoni või e-posti.
- [ ] Pakkimismaterjalid on olemas ja oled vedaja lehel saatmise läbi proovinud (peatükk 9).
- [ ] Müügitingimused ja privaatsuspoliitika on täidetud (peatükk 12).
- [ ] Sotsiaalmeedias on link poele. **Pood on avatud! 🎉**

---

## 9. Igapäevane töö: tellimuse täitmine

Veebilehel on lubatud, et **pakk väljastatakse 1–3 tööpäeva jooksul**. Hea rütm on vaadata tellimused üle iga tööpäeva hommikul ja õhtul.

### 9.1 Tellimuse info leidmine

1. Tuleb teavitus (e-post või Stripe'i äpp): uus makse.
2. Ava Stripe (LIVE-režiim) → **Transactions** / **Payments** → klõpsa maksel.
3. Kontrolli, et staatus on **Succeeded**. Ära saada pakki makse eest, mis pole õnnestunud.
4. Vaata jaotist **Metadata** (tabel peatükis 5.2):
   - kes: `customer_name`, `phone`,
   - kuhu: `carrier`, `locker_name`, `locker_address` (ja `locker_id`),
   - mida: `items`. Komplekti puhul pane pakki mitu karpi (vt tootekoodide tabel).

### 9.2 Pakkimine

- Mängukarbid mahuvad tavaliselt pakiautomaadi väikseimasse lahtrisse. Kontrolli oma vedaja mõõte ja hindu.
- Kasuta tugevat ümbrikku või karpi, et nurgad ei muljuks.
- 💡 Turundusnipp: pane pakki väike aitäh-kaart või kleeps ja kutse jagada mänguõhtu videot TikTokis või Instagramis, märkides @ou.age.

### 9.3 Saadetise registreerimine

Kõigi vedajate juures käib see samamoodi: sisestad **saaja nime**, **telefoninumbri** ja **sihtautomaadi**, maksad ja saad koodi või sildi. Seejärel viid paki automaati.

| Vedaja (`carrier`) | Kus saata | Märkus |
|---|---|---|
| `omniva` | [omniva.ee](https://www.omniva.ee) → paki saatmine (eraklient) või Omniva äriklientide iseteenindus | Sihtautomaadi leiad nime järgi (`locker_name`). `locker_id` on Omniva automaadi kood |
| `smartpost` | [smartpost.ee](https://www.smartpost.ee) → paki saatmine | SmartPost on Itella/Posti teenus |
| `dpd` | [dpd.ee](https://www.dpd.ee) → paki saatmine (DPD Pickup) | Automaadi nime kirjutas klient käsitsi. Kui nimi pole selge, helista või kirjuta kliendile enne saatmist |

1. Vali saatmisviisiks pakiautomaadist pakiautomaati (või automaati).
2. Sisesta saaja nimi, telefon (`phone`, nt `+37251234567`) ja vali sihtautomaat.
3. Maksa ja salvesta saadetise number. **Hoia see alles.** Sellega saad tõendada, et pakk on teele pandud, kui klient peaks hiljem kaebama.
4. Vii pakk vedaja suvalisse pakiautomaati (või postkontorisse).
5. Kui pakk jõuab sihtautomaati, saab **klient vedajalt SMS-i** koodiga.

> 💡 **Kui saadad regulaarselt,** sõlmi vedajaga **äriklientide leping**. Hinnad on soodsamad, arve tuleb kord kuus ja iseteenindus on mugavam. Kliendilt küsid tarne eest 2,99 € ja alates 30 €-st on tarne tasuta, seega jälgi, et saatmiskulu ei sööks kogu kasumit.

### 9.4 Märgi tellimus saadetuks

Vali endale üks süsteem ja kasuta seda alati:

- **Stripe'is:** makse lehel saad metadata't muuta (*Edit metadata*). Lisa näiteks `saadetud` = `2026-10-14, Omniva CC123456789EE`.
- **Või tabelis** (Google Sheets): tellimuse number (`order_id`), kuupäev, nimi, vedaja, saadetise number ja „saadetud ✓“.

### 9.5 Kui midagi läheb valesti

| Olukord | Mida teha |
|---|---|
| Automaadi nimi on segane (eriti DPD käsitsi sisestus) | Kirjuta või helista kliendile (e-post ja telefon on maksel) ja küsi täpsustust |
| Pakk saabus katki või millestki on puudu | Palu kliendilt pilti e-postiga ja saada uus mäng (uus saadetis on sinu kulul) või tee tagasimakse |
| Klient ei võtnud pakki välja | Pakk tuleb mõne aja pärast sulle tagasi. Võta kliendiga ühendust ja lepi kokku uus saatmine või tagasimakse |
| Tagasimakse (refund) | Stripe → makse → **Refund** → vali **kogu summa** või **osaline summa** (nt ainult ühe toote eest) → põhjus → **Refund**. Raha jõuab kliendi kaardile tavaliselt 5–10 päevaga. Stripe'i teenustasu tagasi ei tule |
| Klient vaidlustab makse pangas (*dispute*) | Stripe → **Disputes**. Vasta tähtaja jooksul ja lisa tõendid: saadetise number, vedaja kinnitus ja kirjavahetus |

### 9.6 Raha ja raamatupidamine

- Stripe kannab raha sinu pangakontole automaatselt graafiku järgi (**Balances → Payouts**). Esimene väljamakse võib võtta tavalisest kauem.
- Kord kuus: ekspordi Stripe'ist maksed (**Transactions → Export**) ja väljamaksete aruanne ning anna need raamatupidajale või kanna raamatupidamisprogrammi.

### 9.7 Hiljem: automatiseerimine

Kui tellimusi tuleb palju, saab käsitöö automatiseerida:

- **Montonio Shipping** (Omniva, SmartPost ja DPD sildid ühest kohast) või vedajate enda äriliidesed,
- Zapier: Stripe *New Payment* → uus rida Google Sheetsis,
- mõlemad vajavad arendaja abi, vt peatükk 14.

---

## 10. Sisu muutmine: hinnad, tekstid, pildid

### 10.1 Kuidas faili muuta (ilma programmeerimata)

**Ühe faili muutmine GitHubis:**

1. Ava [github.com/christopherkingsepp/oh-mega-oof](https://github.com/christopherkingsepp/oh-mega-oof) ja veendu, et üleval on valitud haru **`main`**.
2. Ava fail, näiteks `assets` → `js` → `catalog.js`.
3. Vajuta paremal üleval **pliiatsiikooni** (*Edit this file*).
4. Tee muudatus.
5. Vajuta **Commit changes…**, kirjuta lühike kirjeldus (nt *„Muuda MIDA V!!!U hinda“*), jäta valituks *Commit directly to the main branch* ja vajuta **Commit changes**.
6. Netlify avaldab muudatuse ise umbes **1 minutiga** (vaata **Deploys**: *Building* → *Published*).
7. Ava pood ja värskenda lehte nii, et brauser vahemälu ei kasutaks: **Ctrl + Shift + R** (Mac: **Cmd + Shift + R**).

**Mitu faili korraga ja otsing kõigist failidest (github.dev):**

1. Ava repo GitHubis ja vajuta klaviatuuril **`.`** (punkt). Brauseris avaneb koodiredaktor.
2. Otsi kõigist failidest korraga: **Ctrl + Shift + F** (Mac: **Cmd + Shift + F**), näiteks `17,50`.
3. Muuda vajalikud failid.
4. Vasakult menüüst ava **Source Control** (harude ikoon), kirjuta kirjeldus ja vajuta **Commit & Push**.

> 💡 **Koonda muudatused.** Iga commit `main` harusse tähendab uut deploy'd ja tasuta plaanil on deploy'de hulk piiratud. Tee mitu pisiparandust korraga ja salvesta need ühe commitiga.

> ⚠️ **Tähtis: kui leht läks pärast muudatust katki,** ava Netlifys **Deploys**, klõpsa viimasel **töötaval** versioonil ja vajuta **Publish deploy**. Vana versioon on kohe tagasi. Seejärel paranda viga GitHubis (faili ajaloost, nupp *History*, näed, mida muutsid).

**JavaScripti failides (`.js`) tuleb jälgida reegleid:**

- Komakohaga numbrites kasuta **punkti**: `17.5`, mitte `17,5`.
- Tekst on jutumärkides: `'MIDA V!!!U'`. Kui tekstis endas on ülakoma, kasuta `’` või küsi abi.
- Rea lõpus olevad komad ja looksulud `{ }` jäta alles.

### 10.2 Hinnad

Hinnad on failis **`assets/js/catalog.js`** toodete nimekirjas `PRODUCTS`:

```js
'mida-viiu': {
  …
  price: 17.5,      // ← hind eurodes, komakoht PUNKTIGA
```

| Toode | Rida failis |
|---|---|
| MIDA V!!!U | `'mida-viiu'` → `price: 17.5` |
| Oled Semu? | `'oled-semu'` → `price: 12.95` |
| Vigur | `vigur` → `price: 12.95` |
| Oled Semu? + Vigur | `'komplekt-semu-vigur'` → `price: 20.0` |
| Kõik 3 mängu | `'komplekt-koik'` → `price: 33.0` |

Sellest failist võtavad hinna nii veebileht kui ka makse. Stripe küsib alati siin kirjas olevat summat.

**Pärast hinna muutmist otsi samad numbrid ka teistest failidest** (github.dev otsinguga, nt `17,50` **ja** `17.50`). Mõnes kohas on hind kirjas tavalise tekstina:

- `index.html`, `mida-viiu.html`, `oled-semu.html`, `vigur.html`: lehe kirjeldus otsingumootoritele (`<meta name="description" …>`), jagamise eelvaade, toote andmed Google'i jaoks (`"price": "17.50"`, `product:price:amount`) ja mõned tekstid. Enamik nähtavaid hindu uuendab leht ise, aga need kohad tuleb muuta käsitsi.
- `assets/js/catalog.js` komplektide juures: `short` ja `facts` tekstid (*„Säästad 5,90 €“*, *„Säästad 10,40 €“*). Arvuta sääst uuesti.
- KKK ja müügitingimuste lehed, kui hind on seal mainitud.

### 10.3 Tarnehind ja tasuta tarne piir

Samas failis `assets/js/catalog.js`:

```js
export const SHIPPING = {
  price: 2.99,     // tarne hind eurodes
  freeFrom: 30,    // tasuta tarne alates (eurodes, arvestatakse pärast sooduskoodi)
```

Pärast muutmist otsi kõigist failidest ka `2,99` ja `30 €`. Need on kirjas tootelehtede, KKK ja tingimuste tekstides.

### 10.4 Sooduskoodid

Samas failis `assets/js/catalog.js`:

```js
export const WELCOME_CODE = 'AGE15';   // kood, mida −15% hüpik jagab
export const DISCOUNT_CODES = {
  AGE15: 15,                           // KOOD: protsent
};
```

- **Uue koodi lisamine** (nt suvekampaania jaoks):
  ```js
  export const DISCOUNT_CODES = {
    AGE15: 15,
    SUVI20: 20,
  };
  ```
  Koodid kirjuta **SUURTÄHTEDEGA**, ilma tühikute ja täpitähtedeta. Klient võib koodi sisestada ka väikeste tähtedega.
- **Hüpiku koodi vahetamine:** muuda `WELCOME_CODE` väärtust. See kood peab olema ka `DISCOUNT_CODES` nimekirjas. Protsendi võtab hüpik ise sellest nimekirjast.
- **Koodi lõpetamine:** kustuta selle rida `DISCOUNT_CODES` seest. Pärast deploy'd kood enam ei kehti. Kui kellelgi on see ostukorvis, jätkub ost ilma soodustuseta.
- **Tekstid:** otsi failidest ka `15%` ja `AGE15`. Need on kirjas näiteks avalehe ja KKK tekstides.
- **Kuidas kood töötab:**
  - soodustus kehtib toodetele, mitte tarnele;
  - korraga saab kasutada ainult ühte koodi;
  - kood **ei ole ühekordne**. Iga kood töötab seni, kuni see nimekirjas on.
- **Link, mis lisab koodi ise:** `https://sinu-pood/ostukorv?kood=AGE15`. Sobib hästi sotsiaalmeedia postitusse või uudiskirja.
- **Stripe'i kupongid:** iga erineva soodussumma jaoks loob pood Stripe'is automaatselt kupongi (nt `AGE15-263` tähendab 2,63 € soodustust). Neid ei pea ise looma ja **ära neid muuda ega kustuta**. Kui kustutad, luuakse vajadusel uus.

### 10.5 Ettevõtte ja kontaktandmed

Fail **`assets/js/site.js`**:

| Väli | Mis see on | Praegu |
|---|---|---|
| `url` | Poe aadress pärast domeeni ostmist | tühi (täida peatükis 7) |
| `brand` | Brändi nimi | `ÄGE` |
| `legalName` | Ettevõtte ametlik nimi (näha jaluses) | `Äärmiselt Geniaalne Ettevõtmine`. Lisa „OÜ“, kui OÜ on loodud |
| `regCode` | Registrikood (ilmub jalusesse, kui täidetud) | tühi |
| `address` | Aadress | `Tallinn, Eesti` |
| `email` | Kontakt-e-post (jalus ja tänuleht) | `aarmiselt@gmail.com`. **Kontrolli, kas see on õige** |
| `instagram`, `instagramHandle` | Instagrami link ja kasutajanimi | `@ou.age` |
| `tiktok`, `tiktokHandle` | TikToki link ja kasutajanimi | `@ou.age` |
| `pacdora3d` | 3D-mudeli link (peatükk 11) | Pacdora jagamislink |

Mõnes HTML-failis (nt avaleht, tänuleht, tingimused) on sotsiaalmeedia lingid või e-post kirjas ka otse tekstis. Kui midagi muutub, otsi vana väärtust github.dev otsinguga kõigist failidest.

### 10.6 Tekstid

Iga lehe tekst on oma HTML-failis:

| Leht | Fail |
|---|---|
| Avaleht | `index.html` |
| MIDA V!!!U | `mida-viiu.html` |
| Oled Semu? | `oled-semu.html` |
| Vigur | `vigur.html` |
| Ostukorv ja kassa | `ostukorv.html` |
| Tänuleht | `aitah.html` |
| KKK / müügitingimused / privaatsus | `kkk.html` / `tingimused.html` / `privaatsus.html` |
| Menüü ja jalus (kõigil lehtedel) | `assets/js/layout.js` |
| −15% hüpiku tekstid | `assets/js/promo.js` |
| Toodete lühikirjeldused ja faktid (kaardid, ostukorv) | `assets/js/catalog.js` (`tagline`, `short`, `facts`) |

**HTML-is muuda ainult teksti märkide `>` ja `<` vahel.** Näide:

```html
<p>Pakk jõuab tavaliselt <strong>1–3 tööpäevaga</strong>.</p>
```

Siin võid muuta sõnu, aga jäta alles `<p>`, `<strong>`, `</strong>` ja `</p>`. `&nbsp;` tähendab tühikut, mille kohalt rida ei murdu (nt `17,50&nbsp;€`).

Ära unusta lehe alguses olevat `<title>` ja `<meta name="description" content="…">` rida. Need näeb inimene Google'i otsingutulemustes.

### 10.7 Pildid

Pildid on kaustas `assets/img/`:

| Kaust | Mis seal on | Mõõdud |
|---|---|---|
| `brand/` | Logod, favicon, jagamispilt `og-image.jpg` | jagamispilt 1200 × 630 px |
| `games/` | Karpide esiküljed (`…-box-front.webp`), kaanepildid (`…-cover.webp`), hüpiku pilt (`mida-viiu-promo.webp`) | esikülg 1000 × 691 px, kaanepilt 1600 × 900 px |
| `cards/` | MIDA V!!!U kaardid | 760 × 509 px |

**Pildi vahetamine:**

1. Tee uus pilt **samades mõõtudes**.
2. Muuda see **WebP-vormingusse** ja paki kokku: [squoosh.app](https://squoosh.app) → vali *WebP*, kvaliteet umbes 75–80. Hoia fail alla ~200 KB.
3. ⚠️ **Anna failile uus nimi**, näiteks `mida-viiu-box-front-v2.webp`. Brauserid hoiavad pilte kuni nädal meeles. Sama nimega uut pilti ei pruugi kliendid kohe näha.
4. Lae fail GitHubis õigesse kausta: ava kaust → **Add file → Upload files** → **Commit changes**.
5. Asenda vana failinimi uuega kõikjal, kus seda kasutatakse. Otsi vana nime github.dev otsinguga. Tavaliselt on see `assets/js/catalog.js` (`image`, `cover`) ja HTML-failides.

### 10.8 Uue mängu lisamine

Uus mäng puudutab mitut faili ja osa neist on kood. **Seda on mõistlik teha arendaja (või Claude'i) abiga** ja testida enne arvutis (Lisa A). Mida on vaja:

- [ ] Pildid: karbi esikülg (1000 × 691) ja kaanepilt (1600 × 900) kausta `assets/img/games/`.
- [ ] `assets/js/catalog.js`: uus toode `PRODUCTS` alla (id, nimi, hind, pildid, värvid, kirjeldus, faktid).
- [ ] Uus leht, näiteks `uus-mang.html` (`oled-semu.html` koopia, millele on muudetud `data-product`, tekstid, pealkiri, kirjeldus ja Google'i tooteandmed).
- [ ] `assets/js/product.js` (tootelehe 3D-karp ja galerii) ja `assets/js/home.js` + `index.html` (avalehe mängude nimekiri).
- [ ] `assets/js/layout.js`: menüü ja jaluse lingid.
- [ ] Vajadusel uued komplektid `catalog.js` failis ja `sitemap.xml` (kui see on olemas).

### 10.9 Mida ilma arendajata parem mitte muuta

- `netlify/functions/` (makse ja pakiautomaatide serverikood),
- `netlify.toml` (Netlify seadistus ja turvapäised),
- `package.json`, `package-lock.json`,
- failide ja kaustade nimed (lehed viitavad neile).

---

## 11. Pacdora 3D-mudel

- MIDA V!!!U lehel (`/mida-viiu`) on toote pildi juures nupp **„Vaata 3D-mudelit“**.
- Nupp avab akna, kuhu laetakse Pacdora jagamislink. Link laetakse alles nupu vajutamisel, nii et see ei aeglusta lehte.
- Kui Pacdora ei luba oma lehte teise lehe sisse panna või brauser blokeerib selle, jääb aken tühjaks. Akna all on alati nupp **„Ava 3D-vaade uues aknas“**, mis töötab igal juhul.
- **Kontrolli pärast avaldamist:** ava `/mida-viiu` → „Vaata 3D-mudelit“. Kui mudel avaneb aknas, on kõik korras. Kui ei avane, töötab ikkagi uues aknas avamise nupp.

**Lingi vahetamine:**

1. Pacdoras ava oma projekt ja kopeeri jagamislink (*Share*).
2. Pane see faili `assets/js/site.js` reale `pacdora3d: '…'`.
3. Sama link on varulingina kirjas ka failis `mida-viiu.html` (otsi `pacdora.com`). Muuda see ka seal, et lingid oleksid ühesugused.

> 💡 Turvaseaded (`netlify.toml`) lubavad lehe sisse panna ainult `pacdora.com` aadressil olevat sisu. Kui tahad kasutada mõnda teist 3D-teenust, on vaja arendaja abi.

---

## 12. Õiguslik kontrollnimekiri

> ⚠️ **Tähtis:** see peatükk ei ole juriidiline nõuanne. See on nimekiri asjadest, mis tuleks enne päris müüki üle vaadata. Kahtluse korral küsi juristilt, raamatupidajalt või [Tarbijakaitse ja Tehnilise Järelevalve Ametilt (TTJA)](https://www.ttja.ee).

### Lehed ja ettevõtte andmed

- [ ] **Müügitingimused (`/tingimused`)** on läbi loetud ja kõik puuduvad andmed (ettevõtte nimi, registrikood, aadress, e-post) on täidetud.
- [ ] **Privaatsuspoliitika (`/privaatsus`)** on läbi loetud. Kirjas on, keda andmete töötlemiseks kasutad: Netlify (majutus ja vormid), Stripe (maksed), Omniva/SmartPost/DPD (tarne) ja hiljem uudiskirjateenus. Samuti kui kaua andmeid hoiad ja kuidas inimene saab oma andmed kustutada lasta.
- [ ] **Ettevõtte andmed on poes nähtaval.** E-poes peavad olema ettevõtte nimi, registrikood, aadress ja kontakt-e-post. Täida need failis `assets/js/site.js` (peatükk 10.5).

### Tagastamine

> ⚠️ **TÄHTIS: tagastamisõigus.**
> Praegu on poes kirjas, et **mänge ei saa tagastada**. See lause on KKK-s, kassa märkeruudu juures ja tootelehtede Google'i andmetes (`MerchantReturnNotPermitted`) ning tõenäoliselt ka müügitingimustes.
>
> **Eesti võlaõigusseaduse järgi** on tarbijal sidevahendi abil (ka e-poest) ostetud kaubale **üldjuhul 14-päevane taganemisõigus**, mida arvestatakse kauba kättesaamisest. Seaduses on erandid, näiteks kiiresti riknev kaup, kliendi soovi järgi valmistatud kaup või hügieenilistel põhjustel suletud pakendis kaup pärast avamist. Tavaline kaardimäng ei pruugi ühegi erandi alla minna. Tarbija seadusjärgseid õigusi ei saa tingimustega piirata, seega **tingimus „tagastamine pole võimalik“ ei pruugi kehtida**. Kui kaupleja jätab taganemisõigusest teavitamata, võib taganemisaeg pikeneda kuni 12 kuu võrra.
>
> **Soovitus:**
> 1. Loe TTJA e-kaubanduse ja taganemisõiguse juhiseid ([ttja.ee](https://www.ttja.ee)) ja/või küsi juristilt.
> 2. Tõenäoline lahendus: luba 14-päevane taganemine. Klient võib kanda tagasisaatmise kulu, kui oled sellest ette teavitanud.
> 3. Muuda siis tekstid kõikjal: `tingimused.html`, `kkk.html`, KKK avalehel (`index.html`), kassa märkeruut ja märkus (`ostukorv.html`), tootelehtede KKK ja Google'i andmed (`mida-viiu.html`, `oled-semu.html`, `vigur.html`). See on hea töö arendajale.

### Maksud ja raamatupidamine

- [ ] **Käibemaks:** kui ettevõtte maksustatav käive ületab kalendriaasta jooksul **40 000 €**, tuleb registreeruda käibemaksukohustuslaseks. Siis peavad hinnad sisaldama käibemaksu. **Kontrolli kehtivat piiri ja määra: [emta.ee](https://www.emta.ee).**
- [ ] **Raamatupidamine:** OÜ peab pidama raamatupidamist ja esitama majandusaasta aruande. Stripe'i kuuaruanded on müügi tõendiks. Küsi raamatupidajalt nõu või uuri RIK-i tasuta e-arveldajat väikeettevõtetele (kontrolli tingimusi).

### MIDA V!!!U, vanus ja alkohol

- [ ] **18+:** poes on vanusekontroll (avaleht ja MIDA V!!!U leht) ja kassas peab ostja kinnitama, et on 18+. See on enesekinnitus. Hoia 18+ märge ka pakendil ja turunduses nähtaval.
- [ ] **Alkohol turunduses:** MIDA V!!!U ei ole alkohol, aga see on joomamäng. Eestis piiravad alkoholi reklaami **reklaamiseadus ja alkoholiseadus**. Lisaks on TikTokil ja Instagramil oma reeglid. Ole sotsiaalmeedias ettevaatlik:
  - ära näita postitustes alaealisi ega suuna postitusi alaealistele (reklaamidel vali sihtrühmaks 18+),
  - ära näita alkoholi ega selle joomist eduka, sportliku või seksika elu osana ja ära ärgita liigjoomist,
  - ära reklaami konkreetseid alkoholibrände,
  - kasuta sõnumit „mängi vastutustundlikult“. Kaardil olev hoiatus („Kui mängijad jäävad liiga täis, JÄTKE MÄNG POOLELI!“) sobib selleks hästi,
  - tasuliste reklaamide puhul loe enne platvormi reklaamireegleid.

### Isikuandmed (GDPR)

- [ ] Uudiskirja nimekirja kasutad ainult nõusoleku alusel ja ainult turunduseks (peatükk 6).
- [ ] Igas uudiskirjas on loobumislink. Kustutamissoovid täidad kiiresti.
- [ ] Tellimuse andmeid (nimi, telefon, automaat) kasutad ainult tellimuse täitmiseks.
- [ ] Kui lisad hiljem analüütika või reklaamipiksli, on vaja küpsiste nõusolekut (peatükk 14). Praegu kasutab pood brauseri mälu ainult ostukorvi, vanusekontrolli ja hüpiku meelespidamiseks.

---

## 13. Korduma kippuvad probleemid

| Mis juhtub | Tõenäoline põhjus | Lahendus |
|---|---|---|
| Kassas tuleb teade **„Makse pole veel seadistatud. Võta meiega ühendust.“** | `STRIPE_SECRET_KEY` puudub, on vales vormingus (nt kogemata `pk_…`) või pärast lisamist pole uut deploy'd tehtud | Kontrolli võtit (peatükk 4.4): see peab algama `sk_test_` või `sk_live_`. Tee **Deploys → Trigger deploy**. Vigade logid: Netlify → **Logs → Functions** (uuemas vaates *Logs & metrics → Functions*) → `create-checkout` |
| **„Makset ei õnnestunud alustada. Proovi uuesti.“** | Stripe lükkas päringu tagasi: võti on tühistatud, LIVE-konto pole veel aktiveeritud või Stripe'il on ajutine häire | Vaata Netlify → **Logs → Functions** → `create-checkout`. Seal on rida `[checkout] Stripe viga …` koos põhjusega. Kontrolli Stripe'i konto staatust ja [status.stripe.com](https://status.stripe.com) |
| Pakiautomaatide nimekiri ei lae ja kassas on käsitsi sisestamise väli | Vedaja avalik nimekiri ei vasta või on oma aadressi muutnud | **Müük ei peatu**: klient saab automaadi kirjutada käsitsi. Vaata Netlify → **Logs → Functions** → `parcel-lockers` (rida `[pakiautomaadid] …`). Kui viga kestab üle päeva, palu arendajal kontrollida allikaid failis `netlify/functions/_lib/lockers.mjs` |
| DPD-l on alati käsitsi sisestamine | See on nii mõeldud: DPD-l pole avalikku nimekirja | Kui saad DPD-lt automaatide JSON-nimekirja aadressi, lisa Netlifysse keskkonnamuutuja `DPD_LOCKERS_URL` ja tee uus deploy |
| Uus pakiautomaat pole veel nimekirjas | Nimekiri salvestatakse kiiruse huvides kuni ööpäevaks | Oota päev. Seni saab klient kasutada käsitsi sisestamist |
| **Uudiskirja e-postid ei ilmu Netlifysse** | Form detection pole sees, pärast sisselülitamist pole deploy'd tehtud või HTML-is puudub vormi peidetud koopia | 1) **Forms → Enable form detection**. 2) **Trigger deploy**. 3) Kui vormi `soodus` ikka pole, lisa faili `index.html` lõppu, rea `</body>` ette, allolev koodijupp ja tee commit |
| Muudatus ei ilmu lehele | Deploy ebaõnnestus või ei ole veel valmis, või brauser näitab vana versiooni | Vaata Netlify → **Deploys**: kas viimane on *Published* või *Failed*? Kui *Failed*, ava see ja vaata logi. Värskenda lehte **Ctrl + Shift + R** (Mac: **Cmd + Shift + R**). Piltide puhul vaata peatükki 10.7 (uus failinimi) |
| Pärast muudatust on leht katki või tühi | Tõenäoliselt on süntaksiviga (nt kustutatud koma, jutumärk või sulg `.js` failis) | **Deploys** → viimane töötav versioon → **Publish deploy**. Seejärel vaata GitHubis faili ajalugu (*History*) ja paranda viga |
| Pärast makset ei avane tänuleht või suunatakse vale aadressi peale | Põhidomeen on muutunud, aga uut deploy'd pole tehtud | Tee **Trigger deploy** ja testi uuesti (peatükk 7.4) |
| Klient ütleb, et kviitung ei tulnud | Kiri on rämpspostis või klient tegi e-posti aadressis vea | Kontrolli Stripe'is kliendi e-posti. Makse lehelt saad kviitungi uuesti saata |
| Apple Pay või Google Pay ei ilmu makselehele | Seade või brauser ei toeta seda, Walletis pole kaarti või makseviis on välja lülitatud | Stripe → **Settings → Payment methods**. Apple Pay ilmub ainult Apple'i seadmetes, kus Walletis on kaart |

**Vormi peidetud koopia** (lisa faili `index.html` lõppu, vahetult rea `</body>` ette):

```html
<!-- Netlify Forms: −15% hüpiku vormi koopia. Netlify leiab vormid ainult HTML-ist. -->
<form name="soodus" data-netlify="true" netlify-honeypot="bot-field" hidden>
  <input type="hidden" name="form-name" value="soodus">
  <input type="email" name="email">
  <input type="text" name="page">
  <input type="text" name="bot-field">
</form>
```

Kui ükski lahendus ei aita, kirjuta arendajale. Lisa ekraanipilt, lehe aadress, kellaaeg ja Netlify logi rida.

---

## 14. Järgmised sammud ja ideed

| Idee | Milleks | Märkus |
|---|---|---|
| **Analüütika** (Plausible, Google Analytics) | Näed, kust külastajad tulevad ja kus nad ostu pooleli jätavad | Google Analyticsi jaoks on vaja küpsiste nõusoleku riba. Plausible on privaatsussõbralikum. Vaja on muuta ka turvaseadeid `netlify.toml` failis |
| **Meta (Instagram) ja TikToki piksel** | Reklaamide mõõtmine ja uuesti sihtimine | Vajab küpsiste nõusolekut ja 18+ sihtimist (vt peatükk 12) |
| **Arvustused ja klientide videod** | Sotsiaalne tõestus müüb. TikToki videod (12k–25k vaatamist) juba on | Alustuseks võib parimad tsitaadid ja videod lisada avalehele käsitsi |
| **Inglise või vene keel** | Rohkem kliente Eestis | Kaardid on eesti keeles. Mõtle enne, kas mäng ise sobib teise keele rääkijale |
| **Montonio pangalingid** | Paljud Eesti ostjad eelistavad pangalinki | Teine makseteenus. Teine variant on uurida, milliseid makseviise Stripe veel pakub |
| **Laoseis ja „Läbi müüdud“ märge** | Ei müü seda, mida pole | Vajab arendust |
| **Pakkide automaatsed sildid** (Montonio Shipping või vedajate äriliidesed) | Säästab iga tellimusega mitu minutit | Mõistlik, kui tellimusi on rohkem kui paar päevas |
| **Automaatne tervituskiri MailerLite'is koodiga AGE15** | Liituja saab koodi ka e-postiga ja meenutus toob ta tagasi | Peatükk 6.7 |
| **Isiklikud ühekordsed sooduskoodid** | Kood ei levi internetis | Vajab arendust (nt Stripe'i promokoodid) |
| **Kampaanialingid** | `…/ostukorv?kood=AGE15` lisab koodi ise ostukorvi | Töötab juba. Kasuta TikToki ja Instagrami bios |

---

## Lisa A: kohalik arendus arvutis

Seda läheb vaja arendajal (või sul, kui tahad muudatusi enne avaldamist arvutis proovida).

**Vaja on:** [Node.js](https://nodejs.org) versioon 20 või uuem (soovitatavalt 22 LTS) ja [Git](https://git-scm.com).

```bash
git clone https://github.com/christopherkingsepp/oh-mega-oof.git
cd oh-mega-oof
npm install
```

| Käsk | Mida teeb |
|---|---|
| `npm run dev:mock` | Käivitab poe aadressil **http://localhost:8080** **näidisandmetega**. Pakiautomaadid on näidisnimekirjast ja „Maksa“ viib otse tänulehele. Stripe'i ega internetti pole vaja |
| `npm run dev` | Käivitab poe **päris** serverifunktsioonidega (Stripe ja vedajate nimekirjad). Vaja on `STRIPE_SECRET_KEY` võtit (ainult `sk_test_…`!) |
| `npm test` | Käivitab automaattestid (hinnad, soodustus, tarne, tellimuse kontroll ja pakiautomaadid) |

**Päris funktsioonidega käivitamine:**

1. Kopeeri fail `.env.example` uue nimega `.env` ja kirjuta sinna oma `sk_test_…` võti. `.env` faili GitHubi ei saadeta.
2. Käivita: `node --env-file=.env scripts/dev-server.mjs`

**Windowsis:** `npm run dev:mock` töötab ka PowerShellis ja cmd-s.

Teine port: `PORT=8090 npm run dev:mock` (PowerShellis `$env:PORT = "8090"`).

---

## Lisa B: failide kaart

```
oh-mega-oof/
├── index.html, mida-viiu.html, oled-semu.html, vigur.html   ← lehed (tekstid)
├── ostukorv.html, aitah.html                                  ← kassa ja tänuleht
├── kkk.html, tingimused.html, privaatsus.html                 ← KKK ja õiguslikud lehed
├── assets/
│   ├── css/            ← kujundus (värvid, fondid, paigutus)
│   ├── img/            ← pildid: brand/, games/, cards/
│   └── js/
│       ├── catalog.js  ← ★ HINNAD, tarne, sooduskoodid
│       ├── site.js     ← ★ ettevõtte andmed, e-post, sotsiaalmeedia, Pacdora link
│       ├── layout.js   ← menüü, jalus, ostukorvi sahtel
│       ├── promo.js    ← −15% hüpik
│       └── …           ← muu lehtede loogika
├── netlify/functions/  ← serveri pool: makse (/api/checkout) ja pakiautomaadid (/api/pakiautomaadid)
├── netlify.toml        ← Netlify seadistus ja turvapäised
├── .env.example        ← keskkonnamuutujate näidis (päris võtmeid siia EI kirjutata)
├── scripts/            ← kohalik arendusserver ja ekraanipildid
├── tests/              ← automaattestid
├── README.md           ← lühiülevaade arendajale
└── JUHEND.md           ← see juhend
```

**Keskkonnamuutujad (Netlify → Project configuration → Environment variables):**

| Nimi | Kohustuslik? | Mis see on |
|---|---|---|
| `STRIPE_SECRET_KEY` | **Jah** | Stripe'i salajane võti: `sk_test_…` testimiseks, `sk_live_…` päris müügiks |
| `DPD_LOCKERS_URL` | Ei | DPD pakiautomaatide JSON-nimekirja aadress. Tühjana sisestab klient DPD automaadi käsitsi |

---

## Lisa C: kasulikud lingid

| Mis | Link |
|---|---|
| Koodirepo | [github.com/christopherkingsepp/oh-mega-oof](https://github.com/christopherkingsepp/oh-mega-oof) |
| Netlify töölaud | [app.netlify.com](https://app.netlify.com) |
| Stripe'i töölaud | [dashboard.stripe.com](https://dashboard.stripe.com) |
| Stripe'i API võtmed (test) | [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys) |
| Stripe'i hinnad | [stripe.com/ee/pricing](https://stripe.com/ee/pricing) |
| Netlify hinnad | [netlify.com/pricing](https://www.netlify.com/pricing/) |
| Piltide pakkimine | [squoosh.app](https://squoosh.app) |
| E-äriregister | [ettevotjaportaal.rik.ee](https://ettevotjaportaal.rik.ee) |
| Maksu- ja Tolliamet | [emta.ee](https://www.emta.ee) |
| Tarbijakaitse ja Tehnilise Järelevalve Amet | [ttja.ee](https://www.ttja.ee) |
| Andmekaitse Inspektsioon | [aki.ee](https://www.aki.ee) |
| `.ee` domeenid ja registripidajad | [internet.ee](https://www.internet.ee) |

Edu ja palju ÄGEDAID õhtuid! 🃏
