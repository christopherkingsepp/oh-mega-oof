#!/usr/bin/env python3
"""OLED SEMU? ja VIGUR karbitahkude lõplik kujundus (uus ÄGE logo, kehtivad kontaktid, klapid).

Kasutus (repo juurkaustast):
    python3 -I scripts/assets/compose-faces.py <photo-faces väljundkaust> <fondikaust> \
        [--out public/assets/img/games]

Sisend:
  * photo-faces.py väljund: <mäng>-<tahk>-art.png (fotolt puhastatud kujundus, läbipaistev),
    <mäng>-<tahk>-bg.png (puhas taust) ja photo-faces.json.
  * <fondikaust>: Google Fontsi TTF-id (OFL): Unbounded (kontaktid) ja Playfair Display
    (Viguri taustamuster „TÕDE! VALE!“). Vt scripts/assets/README.md, kuidas need alla laadida.
  * Kehtiv ÄGE logo: public/assets/img/brand/age-logo-white.png.
  * Sotsiaalmeedia ikoonid võetakse MIDA V!!!U stantsifailist (source/mida-viiu-pakend-stants.pdf,
    pdfimages), et kõigil karpidel oleks sama kujundus.

Väljund: public/assets/img/games/<mäng>/{front,back,left,right,top,bottom}.webp
  (front/back 800x1234, left/right 480x1234, top/bottom 800x480 — sama suhe kui MIDA V!!!U stantsil).

Kujundusotsused (vt ka scripts/assets/README.md):
  * Vana ÄGE logo on eemaldatud; esiküljel väike kehtiv logo (ainult tähed, nagu MIDA V!!!U
    esiküljel), klappidel suur täislogo (valged tähed + lilla kuju).
  * Külgedel on vanad kontaktid (of.age / opilasfirma_age / opilasfirma.age@gmail.ee) asendatud
    kehtivatega (@ou.age, aarmiselt@gmail.com) samas paigutuses nagu MIDA V!!!U külgedel.
  * Viguri taustamuster on fotol kriimustatud ja rebenenud -> joonistatakse uuesti puhtalt
    (samad sõnad, sama nurk ja kirjatüüp, sama läbipaistvus).
  * Viguri vasak külg on fotodel liiga viltu -> tehakse parema külje põhjal (logo 180° pööratud,
    nagu päris karbil).
"""
import argparse
import glob
import json
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO = os.path.join(ROOT, 'public/assets/img/brand/age-logo-white.png')
STANTS = os.path.join(ROOT, 'source/mida-viiu-pakend-stants.pdf')

OUT_SIZES = {'front': (800, 1234), 'back': (800, 1234), 'left': (480, 1234), 'right': (480, 1234),
             'top': (800, 480), 'bottom': (800, 480)}
WORK = (1000, 1543, 601)  # tööresolutsioon (W, H, D)

GAMES = {
    'oled-semu': {
        'color': (179, 155, 224),
        'logo_small': {'cx': None, 'left': 62, 'cy': 228, 'h': 112, 'color': 'from:12+'},
        'socials': {'cy': 1222, 'color': (255, 255, 255)},
        'pattern': False,
    },
    'vigur': {
        'color': (242, 56, 112),
        'logo_small': {'cx': 500, 'left': None, 'cy': 366, 'h': 128, 'color': (255, 240, 246)},
        'socials': {'cy': 1135, 'color': (255, 255, 255)},
        'pattern': True,
    },
}


def find_font(fontdir, needle):
    for f in sorted(glob.glob(os.path.join(fontdir, '*.ttf'))):
        try:
            name = ' '.join(ImageFont.truetype(f, 10).getname())
        except OSError:
            continue
        if needle.lower() in name.lower():
            return f
    raise SystemExit(f'Fonti "{needle}" ei leitud kaustast {fontdir}')


def font(path, size, weight=None):
    ft = ImageFont.truetype(path, size)
    if weight is not None:
        try:
            axes = ft.get_variation_axes()
            ft.set_variation_by_axes([weight] + [a.get('default', 0) for a in axes[1:]])
        except (OSError, AttributeError):
            pass
    return ft


def pdf_icons(workdir):
    """Instagram-, TikToki- ja e-posti ikoon MIDA V!!!U stantsifailist (RGBA)."""
    subprocess.run(['pdfimages', '-png', STANTS, os.path.join(workdir, 'i')], check=True)

    def rgba(n):
        im = Image.open(os.path.join(workdir, f'i-{n:03d}.png')).convert('RGB')
        m = Image.open(os.path.join(workdir, f'i-{n + 1:03d}.png')).convert('L').resize(im.size)
        im.putalpha(m)
        return im
    # objektid: 16 = Instagram (410 px), 18 = TikTok (60 px), 20 = e-post (205 px)
    return {'instagram': rgba(16), 'tiktok': rgba(18), 'mail': rgba(20)}


LETTERS = None


def letters_alpha(workdir):
    """Kehtiva logo tähed (ilma kujuta) vektorkujul MIDA V!!!U stantsilt (esikülje väike logo,
    1200 dpi). Roosa logo mustal taustal -> alfa = punane kanal."""
    global LETTERS
    if LETTERS is None:
        base = os.path.join(workdir, 'letters')
        subprocess.run(['pdftoppm', '-r', '1200', '-x', '12650', '-y', '4150', '-W', '1100', '-H', '750',
                        '-png', STANTS, base], check=True)
        im = np.array(Image.open(base + '-1.png').convert('RGB')).astype(np.float32)
        a = np.clip(im[..., 0] / np.percentile(im[..., 0][im[..., 0] > 128], 50), 0, 1)
        ys, xs = np.nonzero(a > 0.02)
        LETTERS = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return LETTERS


def logo_letters(color, workdir):
    """Väike logo (ainult ÄGE tähed) soovitud värviga — nagu MIDA V!!!U esiküljel."""
    alpha = letters_alpha(workdir)
    out = np.zeros(alpha.shape + (4,), np.uint8)
    out[..., :3] = color
    out[..., 3] = np.clip(alpha * 255 + 0.5, 0, 255)
    return Image.fromarray(out, 'RGBA')


def logo_full():
    im = Image.open(LOGO).convert('RGBA')
    return im.crop(im.getbbox())


def place(base, layer, cx, cy):
    base.alpha_composite(layer, (int(round(cx - layer.width / 2)), int(round(cy - layer.height / 2))))


def resize_h(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


def resize_w(im, w):
    return im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)


def socials_block(fonts, icons, color, width):
    """Kontaktiplokk nagu MIDA V!!!U külgedel: TikTok ou.age / Instagram ou.age / e-post."""
    fs = 46
    ft = font(fonts['unbounded'], fs, 700)
    icon_h = 46
    gap = 16
    rows = [('tiktok', 'ou.age'), ('instagram', 'ou.age'), ('mail', 'aarmiselt@'), (None, 'gmail.com')]
    line_h = 62
    tmp = Image.new('RGBA', (1400, line_h * len(rows) + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    widths = []
    for ic, text in rows:
        tw = d.textlength(text, font=ft)
        widths.append((icon_h + gap if ic else 0) + tw)
    for i, ((ic, text), wdt) in enumerate(zip(rows, widths)):
        x = (tmp.width - wdt) / 2
        y = 10 + i * line_h
        if ic:
            ico = resize_h(icons[ic], icon_h)
            tmp.alpha_composite(ico, (int(x), int(y + (line_h - icon_h) / 2 - 4)))
            x += icon_h + gap
        d.text((x, y + line_h / 2 - 4), text, font=ft, fill=color + (255,), anchor='lm')
    tmp = tmp.crop(tmp.getbbox())
    if tmp.width > width:
        tmp = resize_w(tmp, width)
    return tmp


def pattern_layer(size, fonts, offset=(0, 0), opacity=0.085, angle=31, fsize=318):
    """Viguri taustamuster: diagonaalsed read „VALE! TÕDE!“ (Playfair Display Black)."""
    w, h = size
    big = int((w ** 2 + h ** 2) ** 0.5) + 2 * fsize
    layer = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(layer)
    ft = font(fonts['playfair'], fsize, 900)
    words = ['VALE!', 'TÕDE!']
    row_h = int(fsize * 0.93)
    for r in range(-2, big // row_h + 3):
        y = r * row_h + offset[1]
        # iga rida algab erineva sõna ja nihkega (nagu karbil)
        x = -((r * 0.37 * fsize) % (fsize * 2.6)) + offset[0]
        k = r % 2
        while x < big:
            word = words[k % 2]
            d.text((x, y), word, font=ft, fill=255)
            x += d.textlength(word + ' ', font=ft)
            k += 1
    layer = layer.rotate(angle, resample=Image.BICUBIC)
    l0 = (big - w) // 2
    t0 = (big - h) // 2
    layer = layer.crop((l0, t0, l0 + w, t0 + h))
    a = np.array(layer).astype(np.float32) / 255 * opacity
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = np.clip(a * 255, 0, 255)
    return Image.fromarray(out, 'RGBA')


def flat_bg(size, color, light=0.04):
    """Ühtlane taust väga kerge diagonaalse valgusega (sama loogika mis fototahkudel)."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    t = ((xx / w) + (yy / h)) / 2 - 0.5
    c = np.float32(color)[None, None, :]
    img = c * (1 - light * 2 * t[..., None])
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def draw_notch(img, cx, r, color):
    """Pöidlasälk tagakülje ülaservas: puhas poolring, sees sisemise klapi toon (kerge vari)."""
    a = np.array(img).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - cx) ** 2 + yy.astype(np.float32) ** 2)
    m = np.clip(r - dist + 0.5, 0, 1)[..., None]
    shade = (1 - 0.22 * np.clip(dist / r, 0, 1) ** 3)[..., None]
    col = np.float32(color)[None, None, :] * shade
    a[..., :3] = a[..., :3] * (1 - m) + col * m
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def center_art_x(art, skip_top):
    """Nihutab kujunduse horisontaalselt keskele (perspektiivi jääkviga tagaküljel)."""
    a = np.array(art)[..., 3]
    a[:skip_top] = 0
    cols = np.where(a.max(0) > 128)[0]
    if len(cols) == 0:
        return art
    dx = int(round(art.width / 2 - (cols.min() + cols.max()) / 2))
    out = Image.new('RGBA', art.size, (0, 0, 0, 0))
    out.alpha_composite(art, (dx, 0)) if dx >= 0 else out.alpha_composite(art.crop((-dx, 0, art.width, art.height)), (0, 0))
    return out


def rotate_logo_180(art, box):
    """Vasak külg parema põhjal: logo (box sees) pööratakse 180° ja peegeldatakse x-teljel."""
    x0, y0, x1, y1 = box
    sub = art.crop(box)
    bb = sub.getbbox()
    sub = sub.crop(bb).rotate(180)
    cx = x0 + (bb[0] + bb[2]) / 2
    cy = y0 + (bb[1] + bb[3]) / 2
    out = Image.new('RGBA', art.size, (0, 0, 0, 0))
    place(out, sub, art.width - cx, cy)
    return out


def median_color(art, box):
    a = np.array(art.crop(box))
    m = a[..., 3] > 230
    return tuple(int(v) for v in np.median(a[m][:, :3], axis=0))


def save(img, path, size):
    img = img.convert('RGB').resize(size, Image.LANCZOS)
    img.save(path, 'WEBP', quality=88, method=6)
    print(path, f'{size[0]}x{size[1]}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('faces')
    ap.add_argument('fonts')
    ap.add_argument('--out', default=os.path.join(ROOT, 'public/assets/img/games'))
    args = ap.parse_args()
    info = json.load(open(os.path.join(args.faces, 'photo-faces.json')))
    fonts = {'unbounded': find_font(args.fonts, 'Unbounded'), 'playfair': find_font(args.fonts, 'Playfair Display')}
    tmp = tempfile.mkdtemp(prefix='age-icons-')
    icons = pdf_icons(tmp)
    W, H, D = WORK

    for game, g in GAMES.items():
        outdir = os.path.join(args.out, game)
        os.makedirs(outdir, exist_ok=True)

        def layer(face, kind):
            return Image.open(os.path.join(args.faces, f'{game}-{face}-{kind}.png')).convert('RGBA')

        def pat(size, off):
            return pattern_layer(size, fonts, off) if g['pattern'] else None

        # --- esikülg ---
        front = layer('front', 'bg')
        if g['pattern']:
            front.alpha_composite(pat(front.size, (0, 40)))
        art = layer('front', 'art')
        front.alpha_composite(art)
        ls = g['logo_small']
        col = ls['color']
        if col == 'from:12+':
            col = median_color(art, (760, 180, 920, 275))  # sama toon kui „12+“
        logo = resize_h(logo_letters(col, tmp), ls['h'])
        cx = ls['cx'] if ls['cx'] is not None else ls['left'] + logo.width / 2
        place(front, logo, cx, ls['cy'])
        save(front, os.path.join(outdir, 'front.webp'), OUT_SIZES['front'])

        # --- tagakülg ---
        back = layer('back', 'bg')
        if g['pattern']:
            back.alpha_composite(pat(back.size, (130, -60)))
        n = info[f'{game}:back'].get('notch')
        if n:
            r = n['r']
            back = draw_notch(back, back.width / 2, r, tuple(v * 0.82 for v in g['color']))
        art = layer('back', 'art')
        if info[f'{game}:back'].get('center_art'):
            art = center_art_x(art, int((n['r'] if n else 0) + 30))
        back.alpha_composite(art)
        save(back, os.path.join(outdir, 'back.webp'), OUT_SIZES['back'])

        # --- küljed ---
        soc = socials_block(fonts, icons, g['socials']['color'], int(D * 0.78))
        right = layer('right', 'bg')
        if g['pattern']:
            right.alpha_composite(pat(right.size, (60, 20)))
        right_art = layer('right', 'art')
        right.alpha_composite(right_art)
        place(right, soc, D / 2, g['socials']['cy'])
        save(right, os.path.join(outdir, 'right.webp'), OUT_SIZES['right'])

        if f'{game}:left' in info:
            left = layer('left', 'bg')
            left.alpha_composite(layer('left', 'art'))
        else:
            # Vigur: vasak külg parema põhjal (fotodel liiga viltu), logo 180° pööratud
            left = layer('right', 'bg').transpose(Image.FLIP_LEFT_RIGHT)
            if g['pattern']:
                left.alpha_composite(pat(left.size, (200, 90)))
            left.alpha_composite(rotate_logo_180(right_art, (40, 200, D - 40, 1000)))
        place(left, soc, D / 2, g['socials']['cy'])
        save(left, os.path.join(outdir, 'left.webp'), OUT_SIZES['left'])

        # --- klapid (digitaalne: karbi toon + suur kehtiv logo) ---
        big = resize_w(logo_full(), int(W * 0.56))
        for face, off in (('top', (40, 0)), ('bottom', (240, 120))):
            flap = flat_bg((W, D), g['color'])
            if g['pattern']:
                flap.alpha_composite(pat((W, D), off))
            place(flap, big, W / 2, D / 2)
            save(flap, os.path.join(outdir, f'{face}.webp'), OUT_SIZES[face])


if __name__ == '__main__':
    main()
