// 3D mängukarp: hõljub, keerleb aeglaselt ja seda saab hiire/sõrmega keerutada.
//
// UUS (soovitatav): kõik kuus tahku piltidena + karbi mõõdud (püstine karp).
//   import { mountBox, BOX_FACES, BOX_DIMS } from '/assets/js/box3d.js';
//   const box = mountBox(document.querySelector('#hero-box'), {
//     faces: BOX_FACES['mida-viiu'],   // { front, back, left, right, top, bottom } (pildi URL-id)
//     dims: BOX_DIMS,                  // { w, h, d } suhtena (nt 1 : 1.543 : 0.601) või px-des
//     theme: 'mida',                   // 'mida' | 'semu' | 'vigur' (varu-värvid, vari)
//     label: 'MIDA V!!!U mängukarp',
//     width: 300,                      // karbi esikülje laius px (või CSS-i --w)
//     speed: 18,                       // automaatne pöörlemine kraadi/sek (0 = ei pöörle)
//     hint: 'Lohista, et keerutada',   // väike vihje karbi all (false = peidus)
//   });
//   box.destroy();
//
// VANA (töötab edasi muutmata kujul): ainult esikülje pilt, ülejäänud tahud genereeritakse
//   (lapik karp suhtega 1.448:1, külgedel tekst).
//   mountBox(el, { front: '/assets/img/…', theme, title, facts, tagline, width, speed, hint, label, startAngle, tilt })
//
// Mõõdud (dims):
//   * suhtena: { w: 1, h: 1.543, d: 0.601 } — tegelik suurus tuleb `width`-ist või CSS-i --w-st;
//   * px-des: { w: 300, h: 463, d: 180 } (kui w >= 20, loetakse px-deks ja sellest saab --w,
//     välja arvatud kui `width` on eraldi antud).
//   Elemendi kõrgus = karbi kõrgus + sügavus (ruum keerutamiseks), laius = karbi laius.
//
// Tahkude orientatsioon (pildid tehakse selle järgi, vt scripts/assets/README.md):
//   front/back: püsti, nagu karpi eest/tagant vaadates; left/right: püsti, left-pildi PAREM serv ja
//   right-pildi VASAK serv on vastu esikülge; top: pildi ALUMINE serv on vastu esikülge;
//   bottom: pildi ÜLEMINE serv on vastu esikülge.
//
// Lisavalikud: shadow (true | false — vari põrandal), interactive (true | false — false: ei
//   pöörle, ei reageeri hiirele; sobib staatiliseks kuvamiseks ja tootepiltide renderdamiseks),
//   startAngle / angle (kraadi, Y-telg), tilt (kraadi, X-telg).
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Karbi mõõdud MIDA V!!!U stantsifailist (laius : kõrgus : sügavus). Kõik kolm mängu on sama formaati. */
export const BOX_DIMS = Object.freeze({ w: 1, h: 1.543, d: 0.601 });

const IMG = '/assets/img/games';
const facesOf = (id) =>
  Object.freeze({
    front: `${IMG}/${id}/front.webp`,
    back: `${IMG}/${id}/back.webp`,
    left: `${IMG}/${id}/left.webp`,
    right: `${IMG}/${id}/right.webp`,
    top: `${IMG}/${id}/top.webp`,
    bottom: `${IMG}/${id}/bottom.webp`,
  });

/** Valmis tahupildid mängude kaupa (sama info on ka catalog.js-is: PRODUCTS[id].faces). */
export const BOX_FACES = Object.freeze({
  'mida-viiu': facesOf('mida-viiu'),
  'oled-semu': facesOf('oled-semu'),
  vigur: facesOf('vigur'),
});

const FACE_NAMES = ['front', 'back', 'right', 'left', 'top', 'bottom'];

const NORMALS = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, -1, 0],
  bottom: [0, 1, 0],
};
const LIGHT = (() => {
  const v = [-0.35, -0.55, 1];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
})();

function rotate([x, y, z], rx, ry) {
  // CSS: transform: rotateX(rx) rotateY(ry) -> kõigepealt Y, siis X
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const y2 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  return [x1, y2, z2];
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Lubame ainult tavalisi pildi-URL-e (suhteline tee, http(s) või data:image). */
function safeUrl(u) {
  if (typeof u !== 'string' || !u) return null;
  const s = u.trim();
  if (/^(\/(?!\/)|\.{0,2}\/|https?:\/\/|data:image\/)/i.test(s) || /^[\w.-]+(\/[\w.-]+)*$/.test(s)) return s;
  return null;
}

function normDims(dims) {
  if (!dims) return null;
  const w = Number(dims.w);
  const h = Number(dims.h);
  const d = Number(dims.d);
  if (!(w > 0 && h > 0 && d > 0)) return null;
  return { hr: h / w, dr: d / w, px: w >= 20 ? w : null };
}

/** Ühe tahu sisu: pilt, kui see on antud, muidu vana genereeritud sisu. */
function faceInner(name, src, { title, tagline, facts }) {
  if (src) {
    return `<img src="${esc(src)}" alt="" draggable="false" decoding="async">${name === 'front' ? '<div class="box3d__sheen"></div>' : ''}`;
  }
  switch (name) {
    case 'front':
      return '<div class="box3d__sheen"></div>';
    case 'back':
      return `<div class="box3d__back">
            <img src="/assets/img/brand/age-logo-white.webp" alt="" draggable="false">
            <div class="box3d__back-title">${esc(tagline)}</div>
            <div class="box3d__back-facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
          </div>`;
    case 'right':
      return `<div class="box3d__spine"><span>${esc(title)}</span></div>`;
    case 'left':
      return '<div class="box3d__spine"><span>ÄGE</span></div>';
    case 'top':
      return `<div class="box3d__spine">${esc(tagline)}</div>`;
    default:
      return `<div class="box3d__spine">ÄGE · ${esc(title)}</div>`;
  }
}

/**
 * Karbi märgistus (ilma JS-animatsioonita) — nt staatilisteks kaartideks või SSR-iks.
 * Tagastab HTML-stringi `<div class="box3d …">…</div>`; sama valikud mis mountBox-il.
 */
export function boxHTML(opts = {}) {
  const { theme = 'mida', width, shadow = true, className = '' } = opts;
  const { cls, style, inner } = buildParts(opts);
  const w = width ? `--w:${Number(width)}px;` : '';
  return `<div class="box3d box3d--${esc(theme)} ${cls} ${esc(className)}" style="${w}${style}" aria-hidden="true">${inner(shadow, false)}</div>`;
}

function buildParts(opts) {
  const {
    front,
    faces,
    dims,
    title = 'MIDA V!!!U',
    facts = ['85 kaarti', '50+ shotti', '18+'],
    tagline = 'Rohkem kui kaardimäng',
  } = opts;
  const src = {};
  for (const n of FACE_NAMES) src[n] = safeUrl(faces?.[n]);
  if (!src.front) src.front = safeUrl(front);
  // tahupiltidega karp on vaikimisi püstine (BOX_DIMS); vana kutse (ainult front) jääb lapikuks
  const D = normDims(dims) || (faces ? normDims(BOX_DIMS) : null);
  const cls = [D ? 'box3d--sized' : '', faces ? 'box3d--faces' : ''].join(' ').trim();
  const style = D ? `--hr:${D.hr.toFixed(4)};--dr:${D.dr.toFixed(4)};${D.px && !opts.width ? `--w:${D.px}px;` : ''}` : '';
  const inner = (shadow, hint) => `
    <div class="box3d__float">
      <div class="box3d__obj">
        ${FACE_NAMES.map(
          (n) =>
            `<div class="box3d__face box3d__face--${n}${src[n] ? ' box3d__face--img' : ''}" data-face="${n}">${faceInner(n, src[n], { title, tagline, facts })}</div>`,
        ).join('')}
      </div>
    </div>
    ${shadow ? '<div class="box3d__shadow"></div>' : ''}
    ${hint ? `<div class="box3d__hint" aria-hidden="true">${esc(hint)}</div>` : ''}`;
  return { cls, style, inner, D };
}

export function mountBox(root, opts = {}) {
  const {
    theme = 'mida',
    title = 'MIDA V!!!U',
    width,
    speed = 22,
    hint = 'Lohista, et keerutada',
    label = `${title} mängukarp`,
    startAngle = opts.angle ?? -28,
    tilt = -12,
    shadow = true,
    interactive = true,
  } = opts;

  const { cls, inner, D } = buildParts(opts);
  root.classList.add('box3d', `box3d--${theme}`, ...cls.split(' ').filter(Boolean));
  if (D) {
    root.style.setProperty('--hr', D.hr.toFixed(4));
    root.style.setProperty('--dr', D.dr.toFixed(4));
    if (D.px && !width) root.style.setProperty('--w', `${D.px}px`);
  }
  if (width) root.style.setProperty('--w', `${width}px`);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', interactive ? `${label}. Kasuta nooleklahve või lohista, et karpi keerutada.` : label);
  if (interactive) root.tabIndex = 0;
  else root.classList.add('box3d--static');

  root.innerHTML = inner(shadow, interactive && hint);

  const floatEl = root.querySelector('.box3d__float');
  const obj = root.querySelector('.box3d__obj');
  const faces = [...root.querySelectorAll('.box3d__face')].map((el) => ({ el, n: NORMALS[el.dataset.face] }));
  const sheen = root.querySelector('.box3d__sheen');

  let ry = startAngle; // kraadides
  let rx = tilt;
  let targetTiltX = 0;
  let targetTiltY = 0;
  let tiltX = 0;
  let tiltY = 0;
  let vel = REDUCED.matches || !interactive ? 0 : speed; // kraadi/sek
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let dragVel = 0;
  let t0 = performance.now();
  let prev = t0;
  let raf = 0;
  let visible = true;

  function pose(curRx, curRy, bob, sway) {
    floatEl.style.transform = `translate3d(0, ${bob.toFixed(2)}px, 0) rotateZ(${sway.toFixed(2)}deg)`;
    obj.style.transform = `rotateX(${curRx.toFixed(2)}deg) rotateY(${curRy.toFixed(2)}deg)`;
    root.style.setProperty('--shadow-scale', (1 - bob / 60).toFixed(3));
    const rxr = (curRx * Math.PI) / 180;
    const ryr = (curRy * Math.PI) / 180;
    for (const f of faces) {
      const n = rotate(f.n, rxr, ryr);
      const lit = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      f.el.style.setProperty('--shade', ((1 - lit) * 0.52).toFixed(3));
    }
    // läige liigub üle esikülje vastavalt nurgale
    if (sheen) sheen.style.setProperty('--sheen', `${(-Math.sin(ryr) * 140).toFixed(1)}%`);
  }

  function render(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const t = (now - t0) / 1000;
    const auto = REDUCED.matches ? 0 : speed;

    if (!dragging) {
      // inerts sumbub tagasi automaatse kiiruse poole
      vel += (auto - vel) * Math.min(1, dt * 1.6);
      ry += vel * dt;
    }
    tiltX += (targetTiltX - tiltX) * Math.min(1, dt * 4);
    tiltY += (targetTiltY - tiltY) * Math.min(1, dt * 4);

    const bob = REDUCED.matches ? 0 : Math.sin(t * 1.3) * 10;
    const sway = REDUCED.matches ? 0 : Math.sin(t * 0.7) * 2.2;
    pose(rx + tiltX, ry + tiltY, bob, sway);

    if (visible) raf = requestAnimationFrame(render);
  }

  function start() {
    if (raf) return;
    prev = performance.now();
    raf = requestAnimationFrame(render);
  }
  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // Staatiline karp: üks poos, ei mingeid kuulajaid ega animatsiooni.
  if (!interactive) {
    pose(rx, ry, 0, 0);
    return {
      el: root,
      spin() {},
      setSpeed() {},
      setAngle(y, x = rx) {
        ry = y;
        rx = x;
        pose(rx, ry, 0, 0);
      },
      destroy() {
        root.innerHTML = '';
      },
    };
  }

  // Lohistamine
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    root.classList.add('is-dragging', 'has-interacted');
    lastX = e.clientX;
    lastT = performance.now();
    dragVel = 0;
    root.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    const rect = root.getBoundingClientRect();
    if (dragging) {
      const now = performance.now();
      const dx = e.clientX - lastX;
      ry += dx * 0.55;
      const dtm = Math.max(1, now - lastT);
      dragVel = (dx * 0.55 * 1000) / dtm;
      lastX = e.clientX;
      lastT = now;
    } else if (e.pointerType === 'mouse') {
      // kerge parallaks hiire järgi
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      targetTiltY = px * 18;
      targetTiltX = -py * 14;
    }
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-dragging');
    vel = Math.max(-900, Math.min(900, dragVel));
    root.releasePointerCapture?.(e.pointerId);
  }
  function onLeave() {
    targetTiltX = 0;
    targetTiltY = 0;
  }
  function onKey(e) {
    if (e.key === 'ArrowLeft') {
      vel = -260;
      root.classList.add('has-interacted');
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      vel = 260;
      root.classList.add('has-interacted');
      e.preventDefault();
    }
  }

  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('keydown', onKey);

  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(([en]) => {
          visible = en.isIntersecting;
          visible ? start() : stop();
        })
      : null;
  io?.observe(root);
  const onVis = () => (document.hidden ? stop() : visible && start());
  document.addEventListener('visibilitychange', onVis);
  start();

  return {
    el: root,
    spin(degPerSec = 720) {
      vel = degPerSec;
    },
    setSpeed(v) {
      vel = v;
    },
    setAngle(y, x = rx) {
      ry = y;
      rx = x;
    },
    destroy() {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('keydown', onKey);
      root.innerHTML = '';
    },
  };
}
