// 3D mängukarp: hõljub, keerleb aeglaselt ja seda saab hiire/sõrmega keerutada.
//
//   import { mountBox } from '/assets/js/box3d.js';
//   const box = mountBox(document.querySelector('#hero-box'), {
//     front: '/assets/img/games/mida-viiu-box-front.webp',
//     theme: 'mida',            // 'mida' | 'semu' | 'vigur'
//     title: 'MIDA V!!!U',      // külgedel olev tekst
//     facts: ['85 kaarti', '50+ shotti', '18+'],
//     width: 360,               // px; võib ka jätta CSS-i --w hooleks
//     speed: 22,                // automaatne pöörlemine kraadi/sek (0 = ei pöörle)
//     hint: 'Keeruta mind',     // väike vihje karbi all (false = peidus)
//   });
//   box.destroy();
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

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

export function mountBox(root, opts = {}) {
  const {
    front,
    theme = 'mida',
    title = 'MIDA V!!!U',
    facts = ['85 kaarti', '50+ shotti', '18+'],
    tagline = 'Rohkem kui kaardimäng',
    width,
    speed = 22,
    hint = 'Lohista, et keerutada',
    label = `${title} mängukarp`,
    startAngle = -28,
    tilt = -12,
  } = opts;

  root.classList.add('box3d', `box3d--${theme}`);
  if (width) root.style.setProperty('--w', `${width}px`);
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', `${label}. Kasuta nooleklahve või lohista, et karpi keerutada.`);
  root.tabIndex = 0;

  root.innerHTML = `
    <div class="box3d__float">
      <div class="box3d__obj">
        <div class="box3d__face box3d__face--front" data-face="front">
          <img src="${esc(front)}" alt="" draggable="false" decoding="async">
          <div class="box3d__sheen"></div>
        </div>
        <div class="box3d__face box3d__face--back" data-face="back">
          <div class="box3d__back">
            <img src="/assets/img/brand/age-logo-white.webp" alt="" draggable="false">
            <div class="box3d__back-title">${esc(tagline)}</div>
            <div class="box3d__back-facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
          </div>
        </div>
        <div class="box3d__face box3d__face--right" data-face="right"><div class="box3d__spine"><span>${esc(title)}</span></div></div>
        <div class="box3d__face box3d__face--left" data-face="left"><div class="box3d__spine"><span>ÄGE</span></div></div>
        <div class="box3d__face box3d__face--top" data-face="top"><div class="box3d__spine">${esc(tagline)}</div></div>
        <div class="box3d__face box3d__face--bottom" data-face="bottom"><div class="box3d__spine">ÄGE · ${esc(title)}</div></div>
      </div>
    </div>
    <div class="box3d__shadow"></div>
    ${hint ? `<div class="box3d__hint" aria-hidden="true">${esc(hint)}</div>` : ''}`;

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
  let vel = REDUCED.matches ? 0 : speed; // kraadi/sek
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let dragVel = 0;
  let t0 = performance.now();
  let prev = t0;
  let raf = 0;
  let visible = true;

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
    const curRx = rx + tiltX;
    const curRy = ry + tiltY;

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
    const s = Math.sin(ryr);
    sheen.style.setProperty('--sheen', `${(-s * 140).toFixed(1)}%`);

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
    destroy() {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      root.innerHTML = '';
    },
  };
}
