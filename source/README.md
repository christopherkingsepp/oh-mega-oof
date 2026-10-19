# Lähtefailid

See kaust on git'is, aga **ei ole veebis avalik** (Netlify avaldab ainult `public/`). GitHubi repo on siiski
avalik, seega siin tohib hoida ainult faile, mille sisu on niikuinii avalik.

## Repos

| Fail | Sisu |
| --- | --- |
| `mida-viiu-pakend-stants.pdf` | MIDA V!!!U pakendi stantsifail (Canva PDF, 1 lk, 1440×810 pt). Püstine karp: esi-, taga- ja kaks külgpaneeli, üla- ja alaklapp. **Punased jooned = lõikejooned, rohelised = voltimisjooned** — need ei tohi tootepildile jääda (vt `scripts/assets/mida-viiu-faces.py`). |

## Privaatsed (EI OLE repos)

Hoia need kohalikus kaustas `source/private/` (on `.gitignore`-s) või muus privaatses kohas.
Need sisaldavad mängude täissisu ja **ei tohi minna ei git'i ega `public/` kausta**.

| Fail / kaust | Sisu | Kasutab |
| --- | --- | --- |
| `private/mida-viiu-kaardid/` | MIDA V!!!U kõigi 85 kaardi JPG-d (1074×720, 91×61 mm), kaustad nagu `2_KAARDID 1-5/1.jpg`; iga kausta `6.jpg` = kaarditüübi selg | `scripts/assets/cards.py` (avaldab ainult 19 eelvaatekaarti + 4 selga) |
| `private/viguri_ja_oled_semu_kaardid_koos_reeglitega.pdf` | Canva PDF, 34 lk: lk 1–9 Viguri kaardid (esi- + tagakülg), 10–12 Viguri reeglid, 13 vahetiitel, 14–28 Oled Semu? küsimuskaardid, 29–31 boonuskaardid, 32–34 Oled Semu? reeglid | `scripts/assets/cards.py` (valik kaarte) |
| `private/pakendifotod/IMG_8180…8193.jpeg` | Oled Semu? (8180–8186) ja Viguri (8187–8193) pakendifotod, VANA ÄGE logoga | `scripts/assets/photo-faces.py` |

Kehtiv ÄGE logo on `public/assets/img/brand/age-logo-white.png` (valge ÄGE + lilla kuju) ja
`age-logo-pink.png` — sama logo mis MIDA V!!!U stantsifailil.

Kuidas pildid uuesti teha: [`scripts/assets/README.md`](../scripts/assets/README.md).
