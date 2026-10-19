# Tootevisuaalide ja kaardipiltide skriptid

Need skriptid teevad `public/assets/img/games/` ja `public/assets/img/cards/` pildid lähtefailidest.
Lähtefailide kirjeldus ja asukoht: [`source/README.md`](../../source/README.md). **Repo on avalik** —
mängu täisfailid (kaardi-PDF, kaardipildid, pakendifotod) ei tohi minna git'i ega `public/` kausta;
hoia neid `source/private/` all (gitignore'is) või väljaspool repot.

Nõuded: Python 3 + `opencv-python` (cv2), `numpy`, `Pillow`; `pdftoppm`/`pdfimages` (poppler-utils);
Node + `playwright` (devDependency). Käivita Pythoni skriptid `python3 -I …` repo juurkaustast.

| Skript | Sisend | Väljund |
| --- | --- | --- |
| `mida-viiu-faces.py` | `source/mida-viiu-pakend-stants.pdf` | `games/mida-viiu/{front,back,left,right,top,bottom}.webp` |
| `photo-faces.py` | Oled Semu? / Vigur pakendifotod `IMG_8180…8193.jpeg` (privaatsed) | vahetulemused (puhastatud kujundus + taust) ajutisse kausta |
| `compose-faces.py` | `photo-faces.py` väljund + fondid | `games/{oled-semu,vigur}/{front,…,bottom}.webp` |
| `render-boxes.mjs` | ülaltoodud tahud + `box3d.js/css` | `games/<id>-box.webp`, `-box-sm.webp`, `-box.png`, `komplekt-*.webp/png`, `<id>-cover.webp` |
| `cards.py` | MIDA V!!!U kaardi-JPG-d + Oled Semu?/Vigur kaardi-PDF (privaatsed) | `cards/mida-viiu/*.webp` (19 + 4 selga), `cards/oled-semu/*.webp`, `cards/vigur/*.webp` |

## Järjekord

```sh
# 1. MIDA V!!!U tahud stantsifailist
python3 -I scripts/assets/mida-viiu-faces.py source/mida-viiu-pakend-stants.pdf public/assets/img/games/mida-viiu --work /tmp/age-mida

# 2. Oled Semu? ja Vigur tahud fotodelt (perspektiivkorrektsioon, vana logo eemaldus) + lõplik kujundus
python3 -I scripts/assets/photo-faces.py source/private/pakendifotod /tmp/age-faces
python3 -I scripts/assets/compose-faces.py /tmp/age-faces /tmp/age-fonts --out public/assets/img/games

# 3. Staatilised tootepildid (Playwright renderdab box3d karbid läbipaistval taustal)
node scripts/assets/render-boxes.mjs --work /tmp/age-render            # kõik
node scripts/assets/render-boxes.mjs --work /tmp/age-render --only komplekt-koik

# 4. Kaardipildid
python3 -I scripts/assets/cards.py --mida-src source/private/mida-viiu-kaardid \
  --pdf source/private/viguri_ja_oled_semu_kaardid_koos_reeglitega.pdf --work /tmp/age-cards
```

Fondid (`compose-faces.py`): Google Fontsi TTF-id (SIL Open Font License) — **Unbounded** (kaal 700,
külgede kontaktid) ja **Playfair Display** (kaal 900, Viguri taustamuster „TÕDE! VALE!“). Lae need
alla <https://fonts.google.com/> lehelt ja pane `.ttf` failid ühte kausta (skript otsib fondi nime järgi).

## Kokkulepped

- **Karbi formaat** (kõigil kolmel mängul sama): laius : kõrgus : sügavus = 1 : 1.543 : 0.601
  (MIDA V!!!U stantsist). Tahud: front/back 800×1234, left/right 480×1234, top/bottom 800×480.
- **Tahkude orientatsioon** (box3d.js): front/back püsti nagu karpi eest/tagant vaadates; left-pildi
  PAREM serv ja right-pildi VASAK serv on vastu esikülge; top-pildi ALUMINE serv ja bottom-pildi
  ÜLEMINE serv on vastu esikülge.
- **Logo**: kehtiv ÄGE logo `public/assets/img/brand/age-logo-white.png` (esiküljel väike, klappidel suur).
  Vana ÄGE logo (fotodel) on eemaldatud.
- **Tootepildid** on ruudukujulised läbipaistva taustaga (3/4 nurk, kontaktvari) — üks ja sama pilt
  kataloogis, ostukorvis, sahtlis, kassa kokkuvõttes, toastis ja tootekaartidel.
- **Kaardid**: WebP alfaga ümarad nurgad (raadius ≈ 3,2% laiusest). MIDA V!!!U 1074×720 (91×61 mm),
  Oled Semu?/Vigur 1074×693 (PDF-i kaardi kuvasuhe 1,549). Oled Semu? küsimuskaardi tagakülg on PDF-is
  püstine; salvestatakse kaardi formaadis (90° vastupäeva pööratud, nagu MIDA V!!!U seljad).
- **MIDA V!!!U avalik eelvaade = täpselt 19 kaarti** (`cards.py` → `MIDA`, `public/assets/js/preview-cards.js`).
  Teisi MIDA V!!!U kaarte ei tohi avaldada.
