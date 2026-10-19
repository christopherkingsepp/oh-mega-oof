#!/usr/bin/env python3
"""MIDA V!!!U pakendi stantsifail -> karbi kuus tahku veebipiltidena.

Kasutus (repo juurkaustast):
    python3 -I scripts/assets/mida-viiu-faces.py source/mida-viiu-pakend-stants.pdf \
        public/assets/img/games/mida-viiu [--work /tmp/mingi-kaust]

Mida skript teeb:
  1. Renderdab stantsifaili (Canva PDF, 1440x810 pt) 400 dpi PNG-ks (pdftoppm).
  2. Lõikab välja kuus paneeli (esi-, taga-, külg- ja klapitahud). Paneelide piirid on
     mõõdetud 400 dpi renderdusel voltimis- (roheline) ja lõikejoonte (punane) järgi;
     iga paneel lõigatakse joone seest väikese varuga (INSET), et joon pildile ei jääks.
  3. Värvib üle järelejäänud joonepikslid (nt tagakülje pöidlasälgu punane kaar) —
     need asendatakse ümbritseva taustaga (cv2.inpaint).
  4. Kontrollib, et paneeli servaaladel ei oleks punaseid/rohelisi joonepiksleid,
     ja salvestab WebP-failid: front, back, left, right, top, bottom.

Karbi orientatsioon vastab box3d.js-i kokkuleppele (vt public/assets/js/box3d.js):
  * top: pildi ALUMINE serv on vastu esikülge; bottom: pildi ÜLEMINE serv on vastu esikülge;
  * left: pildi PAREM serv on vastu esikülge; right: pildi VASAK serv on vastu esikülge;
  * back: vaadatuna tagant, pildi parem serv on karbi vasakul küljel (nagu stantsil).
"""
import argparse
import os
import subprocess
import sys
import tempfile

import cv2
import numpy as np
from PIL import Image

DPI = 400
INSET = 14  # px 400 dpi juures (~0,9 mm) — joon on ~10 px lai

# Paneelide piirid 400 dpi renderdusel (x0, y0, x1, y1; x1/y1 välja arvatud).
# Mõõdetud joonte keskjoontest: esikülg 4162..5473 x 1237..3266, sügavus ~795 px.
PANELS = {
    'front': (4162, 1237, 5473, 3266),
    'back': (2028, 1248, 3341, 3260),
    'left': (3351, 1248, 4151, 3262),
    'right': (5484, 1248, 6273, 3262),
    'top': (4162, 448, 5473, 1226),
    'bottom': (4162, 3278, 5473, 4056),
}

# Väljundmõõdud (px). Karbi suhe stantsilt: laius : kõrgus : sügavus = 1 : 1,543 : 0,601.
W, H, D = 800, 1234, 480
SIZES = {
    'front': (W, H), 'back': (W, H),
    'left': (D, H), 'right': (D, H),
    'top': (W, D), 'bottom': (W, D),
}


def line_masks(img_bgr):
    """Tagastab (punane, roheline) maskid stantsijoonte jaoks (HSV tooni järgi)."""
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    h, s, v = (hsv[:, :, i].astype(np.int16) for i in range(3))
    red = ((h <= 6) | (h >= 174)) & (s > 150) & (v > 40)
    b, g, r = (img_bgr[:, :, i].astype(np.int16) for i in range(3))
    # Roheline joon (0,166,80) — ka siis, kui see on poolläbipaistva roosa kihi all (toonitud).
    green = (g > r + 25) & (g > b + 12) & (g > 40)
    return red, green


def border_zone(shape, width):
    z = np.zeros(shape[:2], bool)
    z[:width, :] = z[-width:, :] = True
    z[:, :width] = z[:, -width:] = True
    return z


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pdf')
    ap.add_argument('outdir')
    ap.add_argument('--work', default=None, help='ajutine kaust renderduse jaoks')
    ap.add_argument('--quality', type=int, default=88)
    args = ap.parse_args()

    work = args.work or tempfile.mkdtemp(prefix='mida-faces-')
    os.makedirs(work, exist_ok=True)
    png = os.path.join(work, f'stants-{DPI}-1.png')
    if not os.path.exists(png):
        subprocess.run(['pdftoppm', '-r', str(DPI), '-png', args.pdf, os.path.join(work, f'stants-{DPI}')], check=True)
    page = cv2.imread(png)
    if page is None or page.shape[1] != 8000:
        sys.exit(f'Ootamatu renderdus: {png}')

    os.makedirs(args.outdir, exist_ok=True)
    ok = True
    for name, (x0, y0, x1, y1) in PANELS.items():
        crop = page[y0 + INSET:y1 - INSET, x0 + INSET:x1 - INSET].copy()
        red, green = line_masks(crop)
        # Üle värvitavad joonepikslid: servaaladel (60 px) olevad lõike/voltimisjoone jupid
        # (nt klappide lukustuspilude otsad) ja tagakülje pöidlasälgu (poolring) punane kaar.
        fix = border_zone(crop.shape, 60)
        if name == 'back':
            fix[:260, 400:900] = True
        m = (((red | green) & fix).astype(np.uint8)) * 255
        if m.any():
            m = cv2.dilate(m, np.ones((7, 7), np.uint8))
            crop = cv2.inpaint(crop, m, 5, cv2.INPAINT_TELEA)
            red, green = line_masks(crop)
        # Kontroll: servaaladel (40 px) ei tohi olla joonepiksleid.
        zone = border_zone(crop.shape, 40)
        left_red, left_green = int((red & zone).sum()), int((green & zone).sum())
        if left_red > 20 or left_green > 20:
            ok = False
            print(f'HOIATUS {name}: servaaladel joonepiksleid punane={left_red} roheline={left_green}', file=sys.stderr)
        out = cv2.resize(crop, SIZES[name], interpolation=cv2.INTER_AREA)
        rgb = Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))
        path = os.path.join(args.outdir, f'{name}.webp')
        rgb.save(path, 'WEBP', quality=args.quality, method=6)
        print(f'{path}  {SIZES[name][0]}x{SIZES[name][1]}  joonepikslid servas: {left_red}/{left_green}')
    if not ok:
        sys.exit(1)


if __name__ == '__main__':
    main()
