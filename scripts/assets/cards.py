#!/usr/bin/env python3
"""Kaardipildid veebi jaoks (public/assets/img/cards/…).

  python3 -I scripts/assets/cards.py --mida-src <kaust> --pdf <kaardid.pdf> [--out public/assets/img/cards] [--work <ajutine kaust>]

Lähtefailid EI ole repos (repo on avalik) — vt source/README.md:
  --mida-src  MIDA V!!!U kaartide JPG-d (1074x720, 91x61 mm), kaustad „2_KAARDID 1-5/1.jpg“ jne
  --pdf       „Viguri ja Oled Semu kaardid koos reeglitega“ PDF (34 lk, 1440x810 pt, Canva)

Väljund (WebP, alfakanaliga ümarad nurgad nagu päriskaardil, horisontaalne):
  mida-viiu/<id>.webp   — TÄPSELT 19 avaliku eelvaate kaarti (SPEC2 tabel) + seljad back-sh/ot/shot/age, 1074x720
  oled-semu/<id>.webp   — valik küsimuskaarte (iga punktitase 100–500) + 2 boonuskaarti ja nende tagaküljed, 1074x693
  vigur/<id>.webp       — 4 olukorrakaarti + „Räägi tõtt!“ + „Valeta!“ + tagaküljed (OLUKORD, SHH!), 1074x693

NB tagaküljed: PDF-is on Oled Semu? tagakülg kujundatud püstiselt (suur täht + punktid). Päriskaart on
horisontaalne, seega salvestame tagakülje SAMAS formaadis kui esikülje: püstine kujundus pööratakse 90°
vastupäeva (tekst loetav alt üles) — sama loogika mis MIDA V!!!U seljakaartidel (SH/OT/ÄGE).

Ära lisa siia MIDA V!!!U kaarte väljaspool 19 eelvaatekaarti (avalik repo / avalik veeb)!
"""
import argparse
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

# --- MIDA V!!!U: 19 eelvaatekaarti (id -> lähtefail) + 4 selga -------------------------------
MIDA = {
    # SH („Oled semu?“ kategooria)
    'sh-go-to-jook': '2_KAARDID 1-5/1.jpg',
    'sh-suurim-viga': '17_KAARDID 6-10/2.jpg',
    'sh-vangi': '5_KAARDID 11-15/1.jpg',
    'sh-first-kiss': '4_KAARDID 16-20/2.jpg',
    'sh-varastanud': '6_KAARDID 21-25/1.jpg',
    # OT („Kõige tõenäolisem inimene…“)
    'ot-kaklus': '18_KAARDID 26-30/2.jpg',
    'ot-friikim': '18_KAARDID 26-30/4.jpg',
    'ot-kaob-ara': '8_KAARDID 36-40/2.jpg',
    'ot-korgijook': '16_KAARDID 41-45/1.jpg',
    'ot-kaotab-asjad': '9_KAARDID 46-50/3.jpg',
    # SHOT („Tee või joo“)
    'shot-korv': '13_KAARDID 66-70/2.jpg',
    'shot-telefon': '13_KAARDID 66-70/4.jpg',
    'shot-seltskond-teo': '14_KAARDID 71-75/1.jpg',
    'shot-kusib-mida': '14_KAARDID 71-75/2.jpg',
    'shot-syles': '14_KAARDID 71-75/4.jpg',
    # ÄGE boonuskaardid (wildcard)
    'age-paased-shotist': '11_WILDCARDID 81-85/1.jpg',
    'age-koik-peale-sinu': '11_WILDCARDID 81-85/2.jpg',
    'age-grupp-valib': '11_WILDCARDID 81-85/4.jpg',
    'age-pealekas': '11_WILDCARDID 81-85/5.jpg',
    # seljad (kaarditüübi tagakülg, mängusisu pole)
    'back-sh': '2_KAARDID 1-5/6.jpg',
    'back-ot': '18_KAARDID 26-30/6.jpg',
    'back-shot': '13_KAARDID 66-70/6.jpg',
    'back-age': '11_WILDCARDID 81-85/6.jpg',
}
assert len([k for k in MIDA if not k.startswith('back-')]) == 19

# --- Oled Semu? ja Vigur: PDF-i lehekülg -> (esikülje id, tagakülje id, kas tagakülg on püstine) -
PDF_CARDS = {
    'vigur': [
        (1, 'shh-raagi-tott', 'back-shh', False),
        (2, 'shh-valeta', None, False),
        (3, 'olukord-eelmine-synnipaev', 'back-olukord', False),
        (6, 'olukord-parim-spikker', None, False),
        (7, 'olukord-raha-kogusin', None, False),
        (9, 'olukord-lemmikmanguasi', None, False),
    ],
    'oled-semu': [
        (15, 'g100-ananassid', 'back-g100', True),
        (19, 'a200-kelleks', 'back-a200', True),
        (20, 'a300-kohting', 'back-a300', True),
        (23, 'e400-narvi', 'back-e400', True),
        (27, 'g500-president', 'back-g500', True),
        (29, 'boonus1-pikem', 'back-boonus1', False),
        (31, 'boonus3-lyhem', 'back-boonus3', False),
    ],
}

OUT_W = 1074            # väljundi laius (MIDA lähtefailide laius)
PDF_OUT_H = 693         # PDF-i kaartide kõrgus: 2386x1540 px @300 dpi -> kuvasuhe 1.549 (Canva kaardi formaat)
RADIUS = 77 / 2386      # nurga raadius laiuse suhtes (mõõdetud PDF-i kaartidelt, ~3 mm)
DPI = 300


def rounded_alpha(w, h, r, ss=4):
    """Pehmendatud (supersampled) ümarnurkse ristküliku alfa-mask suurusega w x h."""
    W, H, R = w * ss, h * ss, int(round(r * ss))
    m = np.zeros((H, W), np.uint8)
    cv2.rectangle(m, (R, 0), (W - 1 - R, H - 1), 255, -1)
    cv2.rectangle(m, (0, R), (W - 1, H - 1 - R), 255, -1)
    for cx, cy in ((R, R), (W - 1 - R, R), (R, H - 1 - R), (W - 1 - R, H - 1 - R)):
        cv2.circle(m, (cx, cy), R, 255, -1, lineType=cv2.LINE_AA)
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA)


def fill_corners(bgr, r):
    """Täidab ümarnurkade välise osa (PDF-i must taust) kaardi servavärviga, et vähendamisel ei tekiks
    tumedat äärist — läbipaistvus tuleb hiljem alfamaskist."""
    h, w = bgr.shape[:2]
    inside = rounded_alpha(w, h, r, ss=1)
    hole = (inside < 250).astype(np.uint8) * 255
    hole = cv2.dilate(hole, np.ones((3, 3), np.uint8))
    return cv2.inpaint(bgr, hole, 5, cv2.INPAINT_TELEA)


def save_card(bgr, path, out_w=OUT_W, out_h=None):
    """BGR kaart (täpselt kaardi piirini lõigatud) -> WebP alfaga, laius out_w (kõrgus kuvasuhte järgi
    või ühtlustatud out_h, et kõik sama mängu kaardid oleksid täpselt sama suurusega)."""
    h, w = bgr.shape[:2]
    out_h = out_h or int(round(out_w * h / w))
    rgb = cv2.cvtColor(cv2.resize(bgr, (out_w, out_h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
    alpha = rounded_alpha(out_w, out_h, RADIUS * out_w)
    im = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=90, method=6, alpha_quality=100)
    print(f'{path} {out_w}x{out_h} {os.path.getsize(path) // 1024} KB')


def mida(src_dir, out_dir):
    for cid, rel in MIDA.items():
        bgr = cv2.imread(os.path.join(src_dir, rel))
        if bgr is None:
            sys.exit(f'Puudub lähtefail: {rel}')
        # lähte-JPG-de 3 alumist pikslirida on eksportimisel rikutud (hele/tume joon) -> lõikame ära
        # ja venitame tagasi 720 px peale (0,4% — silmaga märkamatu)
        save_card(bgr[:-3], os.path.join(out_dir, 'mida-viiu', f'{cid}.webp'), out_h=720)


def render_page(pdf, page, work):
    base = os.path.join(work, f'p{page:02d}')
    png = base + '.png'
    if not os.path.exists(png):
        subprocess.run(['pdftoppm', '-r', str(DPI), '-f', str(page), '-l', str(page), '-png', '-singlefile', pdf, base], check=True)
    return cv2.imread(png)


def find_cards(page_bgr):
    """Leheküljel on must taust ja kaks kaarti: esikülg (vasakul üleval) ja tagakülg (paremal all)."""
    mask = (page_bgr.max(axis=2) > 40).astype(np.uint8)
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    boxes = [tuple(int(v) for v in s[:4]) for s in stats[1:] if s[4] > 500_000]
    if len(boxes) != 2:
        raise RuntimeError(f'Leiti {len(boxes)} kaarti, oodati 2')
    return sorted(boxes, key=lambda b: b[0])


def crop(page_bgr, box, inset=3):
    x, y, w, h = box
    c = page_bgr[y + inset:y + h - inset, x + inset:x + w - inset].copy()
    return fill_corners(c, RADIUS * max(c.shape[:2]) - inset)


def pdf_cards(pdf, out_dir, work):
    for game, rows in PDF_CARDS.items():
        for page, front_id, back_id, back_portrait in rows:
            pg = render_page(pdf, page, work)
            fbox, bbox = find_cards(pg)
            save_card(crop(pg, fbox), os.path.join(out_dir, game, f'{front_id}.webp'), out_h=PDF_OUT_H)
            if back_id:
                back = crop(pg, bbox)
                if back_portrait:
                    # püstine kujundus -> horisontaalne kaart (90° vastupäeva, tekst loetav alt üles)
                    back = cv2.rotate(back, cv2.ROTATE_90_COUNTERCLOCKWISE)
                save_card(back, os.path.join(out_dir, game, f'{back_id}.webp'), out_h=PDF_OUT_H)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--mida-src', required=True)
    ap.add_argument('--pdf', required=True)
    ap.add_argument('--out', default=os.path.join('public', 'assets', 'img', 'cards'))
    ap.add_argument('--work', required=True, help='ajutine kaust PDF-i renderduste jaoks (mitte repo sees)')
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    mida(a.mida_src, a.out)
    pdf_cards(a.pdf, a.out, a.work)


if __name__ == '__main__':
    main()
