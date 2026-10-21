#!/usr/bin/env python3
"""MIDA V!!!U stantsifail -> sama fail, kus tahkude kirjad ja märgid on tahu keskel.

Kasutus (repo juurkaustast):
    python3 -I scripts/assets/mida-viiu-center.py source/mida-viiu-pakend-stants.pdf \
        /tmp/age-mida/stants-keskel.pdf [--work /tmp/age-mida/center] [--report]

Seejärel tee tahud keskele seatud failist (vt README):
    python3 -I scripts/assets/mida-viiu-faces.py /tmp/age-mida/stants-keskel.pdf \
        public/assets/img/games/mida-viiu --work /tmp/age-mida/keskel

Mida skript teeb:
  * Canva PDF-is on iga kujunduselement oma q…Q plokk (esi- ja küljetahkude sisu vormis /X144,
    tagakülje sisu vormis /X60, klappide logod lehe tasemel). Skript renderdab iga elemendi
    eraldi (pdftocairo, läbipaistev taust), mõõdab selle piirid ja arvutab nihke nii, et
    elemendirühm oleks oma tahu keskel. Taust (must + roosad helendused) jääb puutumata.
  * Nihe lisatakse elemendi ploki algusesse translatsioonina (`1 0 0 1 tx ty cm`) —
    vektorid, fondid ja pildid jäävad samaks, muutub ainult asukoht.
  * Rühmad: logo „MIDA“ + „V!!!U“ liigub koos; kontaktiplokk (ikoonid + tekst) liigub koos;
    tagakülje kuju + täht + vari liiguvad koos. Esikülje nurgamärgid (ÄGE ja 18+) saavad
    võrdse kauguse servadest. Klappide logo seatakse keskele mõlemas suunas.
  * Algne fail jääb muutmata (source/), väljund kirjutatakse eraldi.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import pikepdf
from PIL import Image

MEASURE_DPI = 288  # 4 px punkti kohta
K = 400 / 72  # mida-viiu-faces.py PANELS on 400 dpi pikslites

# Tahkude piirid punktides (sama mis mida-viiu-faces.py PANELS, jagatud K-ga).
PANELS_400 = {
    'front': (4162, 1237, 5473, 3266),
    'back': (2028, 1248, 3341, 3260),
    'left': (3351, 1248, 4151, 3262),
    'right': (5484, 1248, 6273, 3262),
    'top': (4162, 448, 5473, 1226),
    'bottom': (4162, 3278, 5473, 4056),
}
PANELS = {n: tuple(v / K for v in b) for n, b in PANELS_400.items()}

# Elemendid: ('page', ploki nr) | ('form', vormi nimi, alamploki nr) | ('loose', vormi nimi, Do op nr)
# Plokinumbrid on mõõdetud (vt --report): lehe sisu on üks q…Q, mille sees 50 plokki.
FORMS = {'/X144': 49, '/X60': 46}  # vorm -> lehe plokk, mis seda joonistab
GROUPS = [
    # (tahk, rühma nimi, režiim, elemendid, ainult-liigub-kaasa)
    ('front', 'logo MIDA V!!!U', 'x', [('form', '/X144', i) for i in (13, 15, 17, 19, 21)], []),
    ('front', 'ROHKEM KUI KAARDIMÄNG', 'x', [('form', '/X144', 7)], []),
    ('front', 'ÄGE + 18+ nurgad', 'corners', [('form', '/X144', 1), ('form', '/X144', 4)], []),
    ('left', 'hüüumärk', 'x', [('loose', '/X144', 620)], []),
    ('left', 'kontaktid', 'x', [('form', '/X144', i) for i in (27, 28, 29, 30)], []),
    ('right', 'hüüumärk', 'x', [('form', '/X144', 26)], []),
    ('right', 'kontaktid', 'x', [('form', '/X144', i) for i in (22, 23, 24, 25)], []),
    ('back', 'kuju + täht', 'x', [('form', '/X60', 0), ('form', '/X60', 1)], [('form', '/X60', 2)]),
    ('back', 'tutvustus', 'x', [('form', '/X60', 3)], []),
    ('back', 'ÄÄRMISELT GENIAALNE ETTEVÕTMINE', 'x', [('form', '/X60', 4)], []),
    ('top', 'ÄGE logo', 'xy', [('page', 42)], []),
    ('bottom', 'ÄGE logo', 'xy', [('page', 44)], []),
]


def split_blocks(ops, depth0, lo=0, hi=None):
    """Tagastab tasemel depth0 olevate q…Q plokkide (algus, lõpp) indeksid."""
    hi = len(ops) if hi is None else hi
    d, out, st = 0, [], None
    for i in range(lo, hi):
        o = str(ops[i][1])
        if o == 'q':
            if d == depth0:
                st = i
            d += 1
        elif o == 'Q':
            d -= 1
            if d == depth0:
                out.append((st, i))
    return out


class Doc:
    def __init__(self, path):
        self.path = path
        pdf = pikepdf.open(path)
        self.ops = list(pikepdf.parse_content_stream(pdf.pages[0]))
        # Lehe sisu: op 0 = q, op 1 = cm, siis 50 plokki, op 1150 = Q, siis märgistatud sisu.
        self.close_idx = max(e for _, e in split_blocks(self.ops, 0))
        self.blocks = split_blocks(self.ops, 1, 0, self.close_idx + 1)
        self.form_ops = {}
        for name in FORMS:
            self.form_ops[name] = list(pikepdf.parse_content_stream(pdf.pages[0].Resources.XObject[name]))
        self.form_blocks = {n: split_blocks(o, 0) for n, o in self.form_ops.items()}

    def build(self, out_path, only=None, shifts=None):
        """Kirjuta PDF: only=element -> ainult see element; shifts={element: (tx, ty)} -> nihked."""
        shifts = shifts or {}
        pdf = pikepdf.open(self.path)
        page = pdf.pages[0]
        cm = lambda tx, ty: ([1, 0, 0, 1, round(float(tx), 4), round(float(ty), 4)], pikepdf.Operator('cm'))
        q, Q = ([], pikepdf.Operator('q')), ([], pikepdf.Operator('Q'))

        def with_shifts(ops, blocks, kinds, name=None):
            ins_after, wrap = {}, {}
            for el, (tx, ty) in shifts.items():
                if el[0] in kinds and (name is None or el[1] == name):
                    if el[0] == 'loose':
                        wrap[el[2]] = (tx, ty)
                    else:
                        a, _ = blocks[el[-1]]
                        ins_after[a] = (tx, ty)
            res = []
            for i, ins in enumerate(ops):
                if i in wrap:
                    res += [q, cm(*wrap[i]), ins, Q]
                    continue
                res.append(ins)
                if i in ins_after:
                    res.append(cm(*ins_after[i]))
            return res

        # vormid
        for name, fops in self.form_ops.items():
            fb = self.form_blocks[name]
            if only is not None and only[0] in ('form', 'loose') and only[1] == name:
                if only[0] == 'form':
                    a, b = fb[only[2]]
                    sel = fops[a:b + 1]
                else:
                    sel = [fops[only[2]]]
                page.Resources.XObject[name].write(pikepdf.unparse_content_stream(sel))
            else:
                new = with_shifts(fops, fb, ('form', 'loose'), name)
                page.Resources.XObject[name].write(pikepdf.unparse_content_stream(new))
        # leht
        if only is not None:
            blk = only[1] if only[0] == 'page' else FORMS[only[1]]
            a, b = self.blocks[blk]
            sel = self.ops[0:2] + self.ops[a:b + 1] + [self.ops[self.close_idx]]
        else:
            sel = with_shifts(self.ops, self.blocks, ('page',))
        page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(sel))
        pdf.save(out_path)


def bbox_of(pdf_path, work, tag):
    base = os.path.join(work, tag)
    subprocess.run(['pdftocairo', '-png', '-transp', '-r', str(MEASURE_DPI), '-singlefile', pdf_path, base],
                   check=True, stderr=subprocess.DEVNULL)
    a = np.array(Image.open(base + '.png').convert('RGBA'))[:, :, 3] > 12
    if not a.any():
        return None
    ys, xs = np.where(a)
    s = 72 / MEASURE_DPI
    return (xs.min() * s, ys.min() * s, (xs.max() + 1) * s, (ys.max() + 1) * s)


def union(bbs):
    return (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))


def tag_of(el):
    return '-'.join(str(x).strip('/') for x in el)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pdf')
    ap.add_argument('out')
    ap.add_argument('--work', default=None)
    ap.add_argument('--report', action='store_true', help='prindi mõõdetud piirid ja nihked')
    args = ap.parse_args()
    work = args.work or tempfile.mkdtemp(prefix='mida-center-')
    os.makedirs(work, exist_ok=True)
    doc = Doc(args.pdf)

    # 1) mõõda iga element eraldi ja ühikumõõt (nihe 100 ühikut -> mitu punkti)
    elements = {el for g in GROUPS for el in g[3] + g[4]}
    bb, scale = {}, {}
    for el in sorted(elements, key=str):
        p = os.path.join(work, f'm-{tag_of(el)}.pdf')
        doc.build(p, only=el)
        bb[el] = bbox_of(p, work, f'm-{tag_of(el)}')
        if bb[el] is None:
            sys.exit(f'Element {el} on tühi — kas stantsifail on muutunud?')
        for step in (100, 10):
            sp = os.path.join(work, f's-{tag_of(el)}.pdf')
            _build_only_shifted(doc, sp, el, (step, step))
            b2 = bbox_of(sp, work, f's-{tag_of(el)}')
            w0, w2 = bb[el][2] - bb[el][0], (b2[2] - b2[0]) if b2 else -1
            if b2 and abs(w2 - w0) < 0.3 and abs(b2[0] - bb[el][0]) > 0.5:
                scale[el] = (round((b2[0] - bb[el][0]) / step, 3), round((b2[1] - bb[el][1]) / step, 3))
                break
        else:
            sys.exit(f'Elemendi {el} ühikumõõtu ei õnnestunud mõõta')

    # 2) arvuta nihked rühmade kaupa
    shifts, report = {}, []
    for face, name, mode, els, followers in GROUPS:
        px0, py0, px1, py1 = PANELS[face]
        pcx, pcy = (px0 + px1) / 2, (py0 + py1) / 2
        if mode == 'corners':
            a, b = bb[els[0]], bb[els[1]]
            dl, dr = a[0] - px0, px1 - b[2]
            m = (dl + dr) / 2
            moves = {els[0]: (m - dl, 0), els[1]: ((px1 - m) - b[2], 0)}
            report.append((face, name, f'servad {dl:.1f}/{dr:.1f} pt -> {m:.1f}/{m:.1f}', moves))
        else:
            u = union([bb[e] for e in els])
            dx = pcx - (u[0] + u[2]) / 2
            dy = pcy - (u[1] + u[3]) / 2 if mode == 'xy' else 0
            moves = {e: (dx, dy) for e in els + followers}
            report.append((face, name, f'nihe x {dx:+.1f} pt' + (f', y {dy:+.1f} pt' if mode == 'xy' else ''), moves))
        for e, (dx, dy) in moves.items():
            sx, sy = scale[e]
            shifts[e] = (round(dx / sx, 4) if abs(dx) > 0.05 else 0, round(dy / sy, 4) if abs(dy) > 0.05 else 0)

    doc.build(args.out, shifts=shifts)
    for face, name, txt, _ in report:
        print(f'{face:6s} {name:34s} {txt}')
    if args.report:
        print(json.dumps({tag_of(e): {'bbox_pt': [round(v, 2) for v in bb[e]], 'unit_pt': scale[e]} for e in bb}, indent=1))

    # 3) kontroll: pärast nihet on rühmad keskel (±0,6 pt)
    after = Doc(args.out)
    bad = []
    for face, name, mode, els, _ in GROUPS:
        px0, py0, px1, py1 = PANELS[face]
        bbs = []
        for e in els:
            p = os.path.join(work, f'a-{tag_of(e)}.pdf')
            after.build(p, only=located(after, e))
            bbs.append(bbox_of(p, work, f'a-{tag_of(e)}'))
        if mode == 'corners':
            dl, dr = bbs[0][0] - px0, px1 - bbs[1][2]
            if abs(dl - dr) > 0.6:
                bad.append(f'{face} {name}: {dl:.2f}/{dr:.2f}')
        else:
            u = union(bbs)
            if abs((u[0] + u[2]) / 2 - (px0 + px1) / 2) > 0.6:
                bad.append(f'{face} {name}: x {(u[0] + u[2]) / 2 - (px0 + px1) / 2:+.2f}')
            if mode == 'xy' and abs((u[1] + u[3]) / 2 - (py0 + py1) / 2) > 0.6:
                bad.append(f'{face} {name}: y {(u[1] + u[3]) / 2 - (py0 + py1) / 2:+.2f}')
    if bad:
        sys.exit('Keskele seadmine ebaõnnestus: ' + '; '.join(bad))
    print(f'OK: {args.out}')


def located(shifted, el):
    """Nihutatud dokumendis: lahtine Do on nüüd q…Q plokis vormi lõpus -> tagasta see plokk."""
    if el[0] != 'loose':
        return el
    return ('form', el[1], len(shifted.form_blocks[el[1]]) - 1)


def _build_only_shifted(doc, path, el, t):
    """Renderdamiseks: ainult element el koos nihkega t (lähteruumi ühikutes)."""
    tmp = path + '.tmp.pdf'
    doc.build(tmp, shifts={el: t})
    shifted = Doc(tmp)
    el2 = located(shifted, el)
    shifted.build(path, only=el2)
    os.remove(tmp)


if __name__ == '__main__':
    main()
