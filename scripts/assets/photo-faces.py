#!/usr/bin/env python3
"""OLED SEMU? ja VIGUR pakendifotod -> puhtad, perspektiivkorrigeeritud karbitahud.

Kasutus (repo juurkaustast):
    python3 -I scripts/assets/photo-faces.py <fotode kaust> <väljundkaust> [--only oled-semu:front]

<fotode kaust> = kaust, kus on IMG_8180.jpeg … IMG_8193.jpeg (PRIVAATSED originaalid — EI lähe
git'i ega public/ kausta; vt source/README.md). <väljundkaust> = vahetulemuste kaust (nt
scratchpad), kuhu tekivad <mäng>-<tahk>.png (puhastatud põhi, vana logo ja vanad kontaktid
eemaldatud). Lõpliku kujunduse (uus logo, kontaktid, klapid) paneb kokku compose-faces.py.

Töövoog iga tahu jaoks:
  1. Perspektiivkorrektsioon (cv2.getPerspectiveTransform) — nurgad on leitud käsitsi
     suurendustelt ja täpsustatud servagradiendi järgi (vt CONFIG).
  2. Valge tasakaal: kõik sama karbi tahud viiakse esikülje foto värvi järgi samasse tooni
     (võimendused mõõdetakse samal fotol nähtava võrdluspinna järgi).
  3. Tausta hinnang: normaliseeritud konvolutsioon (Gaussi hägu ainult taustapikslitel), nii et
     kiri/logo tausta ei mõjuta. Rebenenud ala (Vigur) hinnatakse eraldi piirkonnana.
  4. Puhas taust: tasapinnaline (lineaarne) sobitus taustast — eemaldab valguslaigud, kriimud,
     paberimüra ja peegeldused, aga hoiab kujunduse üldise tooni.
     Mustriga taust (Vigur: suured „TÕDE!/VALE!“ tähed): muster võetakse fotolt suhtena
     foto/taust ja puhastatakse mediaanfiltriga (peened kriimud kaovad, laiad tähed jäävad).
  5. Kujunduse elemendid (kiri, logo) võetakse fotolt sama valguskorrektsiooniga; vana ÄGE
     logo ja vanad kontaktandmed asendatakse taustaga (remove-alad).
  6. Servade varu (margin): kulunud valged servad ja taustalekked kaovad.
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

W, H, D = 1000, 1543, 601  # tööresolutsioon; suhe = MIDA V!!!U stants (1 : 1,543 : 0,601)

# ---------------------------------------------------------------------------
# Konfiguratsioon. Koordinaadid: quad = fotol (TL, TR, BR, BL); remove/keep/regions/cracks =
# rektifitseeritud tahu koordinaatides (W x H või D x H).
# ---------------------------------------------------------------------------
CONFIG = {
    'oled-semu': {
        # Karbi põhitoon (RGB): esikülje taust fotol 8180 (lavendel). Küljed = sama toon.
        'color': (179, 155, 224),
        'faces': {
            'front': {
                'photo': 'IMG_8180.jpeg', 'size': (W, H),
                'quad': [(634.9, 1419.1), (1649.5, 1418.7), (1674.4, 2996.9), (637.5, 3032.2)],
                'remove': [(36, 150, 300, 305)],  # vana ÄGE logo (vasakul üleval)
                'T': 13,
                'quantize': [(40, 500, 990, 1080, 5, 2.4)],  # OLED SEMU? mullikiri (4 värvi)
            },
            'left': {
                'photo': 'IMG_8181.jpeg', 'size': (D, H),
                'quad': [(573.9, 1661.7), (1056.5, 1588.1), (1112.2, 3139.9), (595.2, 3111.9)],
                'remove': [(40, 1060, 561, 1400)],  # vanad kontaktid
                'T': 13,
                'quantize': [(40, 200, 561, 1060, 5, 2.4)],
            },
            'right': {
                'photo': 'IMG_8184.jpeg', 'size': (D, H),
                'quad': [(849.0, 1302.6), (1396.5, 1386.1), (1323.7, 2998.7), (788.7, 3050.0)],
                'remove': [(40, 1060, 561, 1400)],
                'T': 13,
                'margin': (28, 28, 28, 56),
                'quantize': [(40, 200, 561, 1060, 5, 2.4)],
            },
            'back': {
                'photo': 'IMG_8185.jpeg', 'size': (W, H),
                'quad': [(646.6, 1434.7), (1302.2, 1518.9), (1404.2, 2833.9), (780.6, 3105.6)],
                'target': (64, 82, 214),  # sügavsinine (foto 8185, valge kuju järgi neutraalne)
                'notch': True,
                'T': 16,
                'margin': (44, 28, 34, 28),
                'min_thick': 1.0, 'min_area': 6,
                'center_art': True,
                'quantize': [],
            },
        },
    },
    'vigur': {
        # Erk roosa (fotode 8187/8190/8191 keskmine; 8188 on üle säritatud).
        'color': (242, 56, 112),
        'faces': {
            'front': {
                'photo': 'IMG_8188.jpeg', 'size': (W, H),
                'quad': [(648.6, 1679.5), (1513.2, 1690.8), (1500.7, 3028.3), (623.1, 3025.5)],
                'remove': [(350, 285, 660, 450), (660, 280, 820, 370)],  # vana ÄGE logo + rebendi ots
                'pattern': True,
                'T': 30,
                # Rebenenud ala paremal üleval: eraldi tausta hinnang + rebendijoon üle värvida.
                'regions': [[(1000, 0), (975, 0), (968, 40), (945, 80), (900, 140), (868, 190), (835, 240),
                             (800, 272), (760, 310), (700, 340), (600, 372), (540, 390), (560, 430), (1000, 520)]],
                'cracks': [[(985, -5), (968, 40), (945, 80), (930, 105), (900, 140), (885, 165), (868, 190),
                            (850, 215), (835, 240), (815, 258), (800, 272), (780, 292), (760, 310), (740, 322), (700, 340), (650, 358), (600, 372), (550, 386)]],
                'crack_width': 24,
                'quantize': [(60, 640, 940, 960, 1, 1.2)],  # VIGUR-logo
            },
            'right': {
                'photo': 'IMG_8190.jpeg', 'size': (D, H),
                'quad': [(893, 1407), (1392, 1512), (1418, 3027), (888, 3062)],
                'remove': [(40, 1005, 561, 1270)],
                'pattern': True,
                'T': 30,
                'quantize': [(200, 280, 480, 960, 1, 1.2)],
            },
            'back': {
                'photo': 'IMG_8192.jpeg', 'size': (W, H),
                'quad': [(584.9, 1591.7), (1308.8, 1496.7), (1219.8, 3218.4), (428.4, 3080.5)],
                'target': (232, 60, 146),  # tagakülg on külgedest veidi lillakam (vt foto 8191)
                'notch': True,
                'pattern': True,
                'margin': (22, 28, 34, 28),  # vasak, ülemine, parem, alumine
                'T': 22,
                'min_thick': 1.0, 'min_area': 6,  # väike kiri (Ä-täpid) peab alles jääma
                'center_art': True,  # perspektiivi ebatäpsus: kujundus tsentreeritakse
                'quantize': [],
            },
        },
    },
}


def rectify(img, quad, size):
    w, h = size
    src = np.float32(quad)
    dst = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)


def rect_median(img, r):
    x0, y0, x1, y1 = r
    return np.median(img[y0:y1, x0:x1].reshape(-1, 3), axis=0).astype(np.float32)


def to_lab(img):
    return cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)


def delta_e(a_lab, b_lab):
    d = a_lab - b_lab
    # OpenCV 8-bit Lab: L skaalal 0..255 (=L*2.55), a/b nihkega 128 — viime L tagasi CIE skaalale
    d[..., 0] /= 2.55
    return np.sqrt((d ** 2).sum(-1))


def norm_conv(img, weight, sigma):
    """Normaliseeritud konvolutsioon: kaalutud Gaussi hägu (kaal 0 = pikslit ei arvestata)."""
    wgt = cv2.GaussianBlur(weight.astype(np.float32), (0, 0), sigma)
    num = cv2.GaussianBlur(img * weight[..., None], (0, 0), sigma)
    return num / np.maximum(wgt, 1e-4)[..., None], wgt


def poly_mask(shape, polys, thickness=None):
    m = np.zeros(shape[:2], np.uint8)
    for p in polys:
        pts = np.int32(p).reshape(-1, 1, 2)
        if thickness:
            cv2.polylines(m, [pts], False, 255, thickness)
        else:
            cv2.fillPoly(m, [pts], 255)
    return m > 0


def poly_terms(xs, ys, deg):
    """2D polünoomi liikmed (x, y normeeritud -0.5..0.5)."""
    t = []
    for i in range(deg + 1):
        for j in range(deg + 1 - i):
            t.append((xs ** i) * (ys ** j))
    return np.stack(t, -1)


def estimate_bg(img, bgw, regions, deg=3):
    """Taust = robustne 2D polünoom (iga piirkond eraldi, nt rebenenud ala).

    Polünoom ei „lekita“ suure logo värve taustasse (erinevalt hägust) ja annab sileda
    valgusjaotuse, mille järgi saab kogu tahu valgustuse ühtlustada.
    """
    h, w = img.shape[:2]
    step = 4
    ys, xs = np.mgrid[0:h:step, 0:w:step]
    xn, yn = xs / w - 0.5, ys / h - 0.5
    yy, xx = np.mgrid[0:h, 0:w]
    full = poly_terms(xx / w - 0.5, yy / h - 0.5, deg)
    out = np.zeros_like(img)
    rest = np.ones((h, w), bool)
    parts = []
    for r in regions:
        parts.append(r & rest)
        rest &= ~r
    parts.append(rest)
    for part in parts:
        sel = (bgw & part)[::step, ::step]
        A = poly_terms(xn[sel], yn[sel], deg)
        vals = img[::step, ::step][sel]
        wts = np.ones(len(vals), np.float32)
        for it in range(4):  # iteratiivselt kaalutud vähimruudud (kriimud, peegeldused välja)
            coef = np.linalg.lstsq(A * wts[:, None], vals * wts[:, None], rcond=None)[0]
            res = np.linalg.norm(vals - A @ coef, axis=1)
            s = np.median(res) * 1.5 + 1e-3
            wts = (1 / (1 + (res / s) ** 2)).astype(np.float32)
        out[part] = (full[part] @ coef)
    return out


def plane_fit(B, valid, damp=0.6):
    """Lineaarne (tasapinnaline) sobitus taustale; damp < 1 vähendab kallet (valgust)."""
    h, w = B.shape[:2]
    ys, xs = np.mgrid[0:h:8, 0:w:8]
    v = valid[::8, ::8]
    A = np.stack([np.ones(v.sum()), xs[v] / w - 0.5, ys[v] / h - 0.5], 1)
    yy, xx = np.mgrid[0:h, 0:w]
    out = np.zeros_like(B)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, B[::8, ::8, c][v], rcond=None)
        out[..., c] = coef[0] + damp * (coef[1] * (xx / w - 0.5) + coef[2] * (yy / h - 0.5))
    return out


def tone_map(img, B, Bc):
    """Kanalipõhine tükiti lineaarne kõver, mis viib kohaliku tausta B sihttooni Bc,
    aga jätab musta mustaks ja valge valgeks: [0,B]->[0,Bc], [B,255]->[Bc,255].
    Nii parandab üks teisendus nii valgustuse, valge tasakaalu kui ka tausta, ilma et valge
    kiri roosaks/lillaks muutuks."""
    B = np.clip(B, 1, 254)
    lo = img * (Bc / B)
    hi = Bc + (img - B) * (255 - Bc) / (255 - B)
    return np.where(img <= B, lo, hi)


def quantize_art(col, alpha, bg, k, seed=1, sigma=2.2):
    """„Vektoriseerib“ fotolt võetud kujunduse: k-keskmiste värvirühmad (k kujundusvärvi +
    taust), siledad piirjooned ja antialias. Trükise ühtlased värvipinnad jäävad puhtaks
    (paberitekstuur, müra ja hägu kaovad), servad on teravad.
    Tagastab (värv, alfa)."""
    h, w = alpha.shape
    region = cv2.dilate((alpha > 0.02).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    lab = to_lab(col)
    bg_lab = to_lab(bg)
    # treeningandmed: kujunduse pikslid (alfa ~1) + taustatoon eraldi rühmana
    core = (alpha > 0.85) & region
    if core.sum() < max(10, k * 5):  # liiga väike element -> jäta nii nagu on
        return col, alpha
    pts = lab[core][:: max(1, core.sum() // 60000)].astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.2)
    cv2.setRNGSeed(seed)
    _, _, centers = cv2.kmeans(pts, k, None, crit, 4, cv2.KMEANS_PP_CENTERS)
    centers = np.vstack([centers, np.median(bg_lab[region].reshape(-1, 3), axis=0)[None]])
    # silumine: iga rühma kaugus -> sile „tõenäosus“, argmax -> sile piir
    d = np.stack([np.linalg.norm((lab - c) * [1 / 2.55, 1, 1], axis=-1) for c in centers], -1)
    # taust on kohalik (gradient): kasuta tegelikku kaugust kohalikust taustast
    d[..., -1] = np.linalg.norm((lab - bg_lab) * [1 / 2.55, 1, 1], axis=-1)
    d[~region] = np.inf
    d[~region, -1] = 0
    lbl = np.argmin(d, -1)
    oh = np.stack([(lbl == i).astype(np.float32) for i in range(len(centers))], -1)
    oh = np.stack([cv2.GaussianBlur(oh[..., i], (0, 0), sigma) for i in range(len(centers))], -1)
    lbl = np.argmax(oh, -1)
    oh = np.stack([(lbl == i).astype(np.float32) for i in range(len(centers))], -1)
    oh = np.stack([cv2.GaussianBlur(oh[..., i], (0, 0), 0.7) for i in range(len(centers))], -1)
    oh /= np.maximum(oh.sum(-1, keepdims=True), 1e-6)
    # rühmade värvid BGR-is (kujundusvärvid = rühma mediaan fotolt)
    cols = []
    for i in range(len(centers) - 1):
        m = (lbl == i) & core
        cols.append(np.median(col[m].reshape(-1, 3), axis=0) if m.sum() > 20 else cv2.cvtColor(np.uint8([[centers[i]]]), cv2.COLOR_LAB2BGR)[0, 0].astype(np.float32))
    cols = np.float32(cols)
    a = 1 - oh[..., -1]
    art = (oh[..., :-1] @ cols) / np.maximum(a, 1e-4)[..., None]
    return art, a


def clean_face(rect, opt, target, debug=None):
    h, w = rect.shape[:2]
    img = rect.astype(np.float32)
    margin = opt.get('margin', 28)
    ml, mt, mr, mb = margin if isinstance(margin, (tuple, list)) else (margin,) * 4
    edge = np.zeros((h, w), bool)
    edge[:mt, :] = True
    edge[h - mb:, :] = True
    edge[:, :ml] = True
    edge[:, w - mr:] = True
    edge_bg = np.zeros((h, w), bool)  # tausta hinnangust välja jäetav (laiem) serv
    edge_bg[:mt * 2, :] = True
    edge_bg[h - mb * 2:, :] = True
    edge_bg[:, :ml * 2] = True
    edge_bg[:, w - mr * 2:] = True

    # 0) Pragude/rebendijoonte üle värvimine enne kõike muud
    if opt.get('cracks'):
        cm = poly_mask(img.shape, opt['cracks'], opt.get('crack_width', 10)).astype(np.uint8) * 255
        img = cv2.inpaint(np.clip(img, 0, 255).astype(np.uint8), cm, 9, cv2.INPAINT_TELEA).astype(np.float32)

    regions = [poly_mask(img.shape, [p]) for p in opt.get('regions', [])]
    lab = to_lab(img)
    T = opt.get('T', 14)

    # 1) Esimene lähend: suur mediaan
    small = cv2.resize(img, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
    med = cv2.resize(cv2.medianBlur(np.clip(small, 0, 255).astype(np.uint8), 31), (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    fg = delta_e(lab, to_lab(med)) > T
    # 2) Kaks iteratsiooni: taust ilma esiplaanita -> uus esiplaan
    for it in range(2):
        bgw = ~cv2.dilate(fg.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & ~edge_bg
        B = estimate_bg(img, bgw, regions, opt.get('deg', 3))
        # kerge hägu enne lävendit: servad siledamad, paberimüra ei tekita „narmaid“
        fg = cv2.GaussianBlur(delta_e(lab, to_lab(B)), (0, 0), 1.0) > T

    # Esiplaani mask: väikesed täpid (müra/kriimud) välja
    fg8 = fg.astype(np.uint8)
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(fg8, 8)
    # Peened kriimud on kitsad (laius < ~5 px): komponendi suurim kaugus servast (distance
    # transform) on väike. Kirja tähed ja täpid on paksemad ja jäävad alles.
    dt = cv2.distanceTransform(fg8, cv2.DIST_L2, 3)
    dtmax = np.zeros(n, np.float32)
    np.maximum.at(dtmax, lbl.ravel(), dt.ravel())
    drop = (stats[:, cv2.CC_STAT_AREA] < opt.get('min_area', 40)) | (dtmax < opt.get('min_thick', 2.6))
    drop[0] = False
    fg[drop[lbl]] = False
    # Pöidlasälk joonistatakse hiljem puhtalt (compose-faces.py) -> sälgu alal kujundust pole
    if opt.get('notch'):
        ncx, nr = notch_params(rect)
        yy, xx = np.mgrid[0:h, 0:w]
        fg &= (xx - ncx) ** 2 + yy ** 2 > (nr + 12) ** 2
    # Eemaldatavad alad (vana logo, vanad kontaktid) ja rebenenud ala -> taust
    for (x0, y0, x1, y1) in opt.get('remove', []):
        fg[y0:y1, x0:x1] = False
    for r in regions:
        fg &= ~r
    fg &= ~edge
    ell = lambda k: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    fg8 = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, ell(3))
    fgs = cv2.dilate(fg8, ell(3)).astype(np.float32)
    fgs = cv2.GaussianBlur(fgs, (0, 0), 1.0)
    fgs[edge] = 0

    # 3) Puhas taust: lineaarne sobitus (kerge kalle jääb), keskmine = sihttoon
    valid = ~edge_bg
    for r in regions:
        valid &= ~r
    Bc = plane_fit(B, valid, opt.get('damp', 0.35))
    Bc = Bc - Bc[valid].mean(0) + np.float32(target)

    fg_col = tone_map(img, B, Bc)
    # Trükipinna müra (paberitekstuur, JPEG) välja servi säilitades + kerge teravdus,
    # et fotolt võetud kiri/logo näeks välja nagu puhas trükis.
    u8 = np.clip(fg_col, 0, 255).astype(np.uint8)
    for _ in range(opt.get('smooth', 2)):
        u8 = cv2.bilateralFilter(u8, 9, 22, 6)
    f = u8.astype(np.float32)
    fg_col = f + opt.get('sharpen', 0.6) * (f - cv2.GaussianBlur(f, (0, 0), 1.6))
    if 'quantize' in opt:
        # Piirkonnad (x0, y0, x1, y1, k[, sigma]): suured logod „vektoriseeritakse“ k värviga.
        # Väikest kirja EI kvantiseerita (lävend paksendaks tähti) — see jääb silutud fotokirjaks.
        fg_col = np.clip(fg_col, 0, 255)
        out_c, out_a = fg_col.copy(), fgs.copy()
        done = np.zeros((h, w), bool)
        boxes = list(opt['quantize'])
        for box in boxes:
            x0, y0, x1, y1, k = box[:5]
            sigma = box[5] if len(box) > 5 else 2.2
            sl = (slice(y0, y1), slice(x0, x1))
            if (fgs[sl] > 0.5).sum() < 50:
                continue
            c, a = quantize_art(fg_col[sl], fgs[sl], Bc[sl], k, sigma=sigma)
            out_c[sl], out_a[sl] = c, a
            done[sl] = True
        fg_col, fgs = out_c, out_a
        fgs[edge] = 0
    if debug is not None:
        debug['fg'] = (fgs * 255).astype(np.uint8)
        debug['B'] = np.clip(B, 0, 255).astype(np.uint8)
    return np.clip(fg_col, 0, 255).astype(np.uint8), fgs, np.clip(Bc, 0, 255).astype(np.uint8)


def draw_notch(face, cx, r, color):
    """Tagakülje pöidlasälk: puhas poolring ülaservas, sees sisemise klapi toon."""
    h, w = face.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - cx) ** 2 + yy.astype(np.float32) ** 2)
    a = np.clip(r - dist + 0.5, 0, 1)[..., None]  # pehme (antialias) serv
    # sisemine klapp on karbi sees -> kerge vari sälgu servas
    shade = (1 - 0.18 * np.clip(dist / r, 0, 1) ** 3)[..., None]
    col = np.float32(color)[None, None, :] * shade
    return np.clip(face.astype(np.float32) * (1 - a) + col * a, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('photos')
    ap.add_argument('outdir')
    ap.add_argument('--only', default=None, help='nt oled-semu:front')
    ap.add_argument('--debug', action='store_true')
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    report = {}
    for game, gc in CONFIG.items():
        for face, opt in gc['faces'].items():
            if args.only and args.only != f'{game}:{face}':
                continue
            src = cv2.imread(os.path.join(args.photos, opt['photo']))
            if src is None:
                sys.exit(f'Puudub foto: {opt["photo"]}')
            rect = rectify(src, opt['quad'], opt['size'])
            target = np.float32(opt.get('target', gc['color']))[::-1]  # RGB -> BGR
            dbg = {} if args.debug else None
            art, alpha, bg = clean_face(rect, opt, target, dbg)
            base = os.path.join(args.outdir, f'{game}-{face}')
            rgba = np.dstack([art, np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)])
            cv2.imwrite(base + '-art.png', rgba)  # kujunduse elemendid (läbipaistval taustal)
            cv2.imwrite(base + '-bg.png', bg)     # puhas taust (sihttoon + kerge valguskalle)
            extra = {}
            if opt.get('notch'):
                cx, r = notch_params(rect)
                extra = {'notch': {'cx': round(float(cx), 1), 'r': round(float(r), 1)}}
            if dbg:
                for k, v in dbg.items():
                    cv2.imwrite(os.path.join(args.outdir, f'dbg-{game}-{face}-{k}.png'), v)
                cv2.imwrite(os.path.join(args.outdir, f'dbg-{game}-{face}-rect.png'), rect)
            report[f'{game}:{face}'] = {'art': base + '-art.png', 'bg': base + '-bg.png', 'size': list(opt['size']),
                                        'photo': opt['photo'], 'target_rgb': [int(v) for v in target[::-1]], **extra}
            print(base, opt['size'], 'sihttoon', [int(v) for v in target[::-1]], extra)
    with open(os.path.join(args.outdir, 'photo-faces.json'), 'w') as f:
        json.dump(report, f, indent=1)


def notch_params(rect):
    """Leiab pöidlasälgu (poolringi) keskpunkti ja raadiuse rektifitseeritud tagaküljelt."""
    h, w = rect.shape[:2]
    lab = to_lab(rect.astype(np.float32))
    band = lab[12:40, :]
    ref = np.median(lab[260:320, 100:-100].reshape(-1, 3), axis=0)
    diff = np.median(delta_e(band, np.broadcast_to(ref, band.shape).copy()), axis=0)
    cols = np.where(diff > 15)[0]
    cols = cols[(cols > w * 0.25) & (cols < w * 0.75)]
    if len(cols) < 20:
        return w / 2, w * 0.14
    x0, x1 = int(np.percentile(cols, 1)), int(np.percentile(cols, 99))
    return (x0 + x1) / 2, (x1 - x0) / 2 + 1


if __name__ == '__main__':
    main()
