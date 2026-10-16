/* ═══════════════════════════════════════════════════════════════════════
   THE FLACON — the actual Domain Black bottle, in three dimensions.

   Modelled from the campaign photograph rather than invented: a squat
   squircle body in satin lacquer, a knurled gold collar, the raised gold
   db monogram, and a polished asymmetric stone for a cap — each cap is a
   stone, so no two read quite alike, and the geometry says so.

   The liquid is not a texture. It is the body solid, clipped by a plane
   that tilts on a spring driven by how fast the bottle is turning and how
   fast the page is scrolling. Tip it and the surface lags, overshoots and
   settles, because that is what a half-full flacon does.
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* The five compositions. Colours sampled from the campaign photograph and
   the house palette — Sovereign is the bottle in the photograph. */
export const DOMAINS = [
  { num: 'I',   name: 'Kingdom',   theme: 'Quiet Authority',
    lacquer: 0x171310, juice: 0x2a211b, gloss: 0.34,
    notes: ['Vanilla', 'Salt', 'Cannabis', 'Sandalwood'],
    line: 'For those whose presence speaks before they do.',
    world: 'Dark walnut, black stone, and morning fog.' },
  { num: 'II',  name: 'Sovereign', theme: 'Refined Indulgence',
    lacquer: 0x5b3a25, juice: 0x7a4a22, gloss: 0.38,
    notes: ['Pomegranate', 'Orchard Fruits', 'Cocoa', 'Rum'],
    line: 'Luxury without excess.',
    world: 'A private library. Leather, espresso, and dark woods.' },
  { num: 'III', name: 'Celestial', theme: 'Light Beyond Reach',
    lacquer: 0x2e5e8e, juice: 0x3f79ad, gloss: 0.30,
    notes: ['Orange', 'Lemon', 'Jasmine', 'Amber', 'Musk'],
    line: 'A quiet brilliance that never asks to be seen.',
    world: 'Blue hour, open sky, and glass architecture.' },
  { num: 'IV',  name: 'Crown',     theme: 'Comfort Elevated',
    lacquer: 0xe9dfcd, juice: 0xd8c4a2, gloss: 0.42,
    notes: ['Vanilla', 'Cocoa', 'Amber', 'Sugar', 'Tonka Bean'],
    line: 'Confidence wrapped in comfort.',
    world: 'Cashmere, cream stone, and soft candlelight.' },
  { num: 'V',   name: 'Empire',    theme: 'Magnetic Arrival',
    lacquer: 0xd9732a, juice: 0xc9571a, gloss: 0.36,
    notes: ['Peach', 'Blood Orange', 'Rum'],
    line: 'Every entrance deserves a signature.',
    world: 'Golden sunset over a modern city.' }
];

const GOLD = 0xd8b589;

/* ── the squircle the body is drawn from ──────────────────────────────
   Measured off the photograph: the body is essentially square in front
   elevation (55 × 52 px) with a generous corner radius, so it is a
   superellipse, not a rounded rectangle and not a cylinder. */
function squircle(w, h, n = 4.2, steps = 96) {
  const s = new THREE.Shape();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), si = Math.sin(t);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * w;
    const y = Math.sign(si) * Math.pow(Math.abs(si), 2 / n) * h;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/* ── the db monogram, as raised gold ──────────────────────────────────
   A d and a b sharing a centre, bowls below, ascenders full height, with
   the house's diagonal struck through the d. Built from shapes rather
   than traced from the photograph so it extrudes cleanly and catches a
   real highlight along every edge. */
function monogramShapes() {
  const shapes = [];
  const W = 0.148;                       // stroke weight, off the photograph

  const bar = (x0, y0, x1, y1) => {
    const s = new THREE.Shape();
    s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1);
    s.closePath(); return s;
  };

  // The bowls are not circles. They are squarish — a superellipse ring,
  // which is what gives the mark its blunt, struck-metal feel.
  const ring = (cx, cy, rx, ry, t, n = 3.3) => {
    const pt = (r1, r2, i, steps) => {
      const a = (i / steps) * Math.PI * 2;
      const c = Math.cos(a), si = Math.sin(a);
      return [cx + Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * r1,
              cy + Math.sign(si) * Math.pow(Math.abs(si), 2 / n) * r2];
    };
    const sh = new THREE.Shape();
    for (let i = 0; i <= 72; i++) {
      const [x, y] = pt(rx, ry, i, 72);
      if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
    }
    sh.closePath();
    const hole = new THREE.Path();
    for (let i = 72; i >= 0; i--) {
      const [x, y] = pt(rx - t, ry - t, i, 72);
      if (i === 72) hole.moveTo(x, y); else hole.lineTo(x, y);
    }
    hole.closePath();
    sh.holes.push(hole);
    return sh;
  };

  // d — bowl left, ascender on its right
  shapes.push(ring(-0.395, -0.235, 0.375, 0.375, W));
  shapes.push(bar(-0.178, -0.58, -0.030, 0.635));
  // b — ascender left, bowl on its right
  shapes.push(bar(0.030, -0.58, 0.178, 0.635));
  shapes.push(ring(0.395, -0.235, 0.375, 0.375, W));

  // the house diagonal, struck through both ascenders
  const ang = 0.33, L = 0.60, t = 0.044;
  const ux = Math.sin(ang), uy = Math.cos(ang);
  const px = uy * t, py = -ux * t;
  const cx = -0.01, cy = 0.145;
  const d = new THREE.Shape();
  d.moveTo(cx - ux * L - px, cy - uy * L - py);
  d.lineTo(cx + ux * L - px, cy + uy * L - py);
  d.lineTo(cx + ux * L + px, cy + uy * L + py);
  d.lineTo(cx - ux * L + px, cy - uy * L + py);
  d.closePath();
  shapes.push(d);

  return shapes;
}

/* ── a stone for a cap ────────────────────────────────────────────────
   An icosphere pushed around by three octaves of smooth noise, flattened
   and tilted. The seed is the lot number, so Kingdom's stone is not
   Sovereign's stone — which is true of the real thing. */
function stoneGeometry(seed = 1) {
  // An indexed sphere, not an icosahedron: IcosahedronGeometry is non-indexed,
  // so computeVertexNormals gives one normal per triangle and the stone comes
  // out faceted like a cut gem instead of tumbled smooth.
  const g = new THREE.SphereGeometry(1, 128, 72);
  const pos = g.attributes.position;
  let s = seed * 9781 + 1;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const ox = [rnd() * 10, rnd() * 10, rnd() * 10];
  const oy = [rnd() * 10, rnd() * 10, rnd() * 10];
  const wob = (x, y, z, f) =>
    Math.sin(x * f + ox[0]) * Math.cos(y * f * 1.3 + oy[0]) +
    Math.sin(z * f * 0.8 + ox[1]) * Math.cos(x * f * 1.1 + oy[1]);

  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1
      + 0.088 * wob(v.x, v.y, v.z, 1.35)
      + 0.026 * wob(v.x, v.y, v.z, 2.6)
      + 0.007 * wob(v.x, v.y, v.z, 5.1);
    v.multiplyScalar(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.scale(1.0, 0.60, 0.84);
  g.computeVertexNormals();
  return g;
}

/* ── a knurled gold collar ────────────────────────────────────────────
   Fluting is cut into the geometry, not painted on, so it flashes as the
   bottle turns instead of sitting still like a decal. */
function knurledRing(rOuter, rInner, h, teeth = 44) {
  const pts = [];
  for (let i = 0; i <= teeth * 2; i++) {
    const t = (i / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? rOuter : rOuter - (rOuter - rInner);
    pts.push(new THREE.Vector2(Math.cos(t) * r, Math.sin(t) * r));
  }
  const shape = new THREE.Shape(pts);
  return new THREE.ExtrudeGeometry(shape, {
    depth: h, bevelEnabled: true, bevelThickness: h * 0.16,
    bevelSize: h * 0.14, bevelSegments: 2, curveSegments: 4
  });
}

/* ── a studio, as an environment map ──────────────────────────────────
   No HDR file to fetch: the room is painted into a canvas and run through
   PMREM. A soft overhead bank, a warm key to the left, a cool bounce to
   the right, floor falling away — which is the light in the photograph. */
function studioEnvironment(renderer) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0.00, '#ffffff');
  sky.addColorStop(0.30, '#d8d4cf');
  sky.addColorStop(0.52, '#6b645e');
  sky.addColorStop(0.74, '#241d19');
  sky.addColorStop(1.00, '#0b0908');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 256);

  // the warm key — a window, left of camera
  const key = g.createRadialGradient(132, 74, 4, 132, 74, 128);
  key.addColorStop(0, 'rgba(255,238,210,1)');
  key.addColorStop(1, 'rgba(255,238,210,0)');
  g.fillStyle = key; g.fillRect(0, 0, 512, 256);

  // a cool bounce off the glass on the other side
  const fill = g.createRadialGradient(386, 104, 4, 386, 104, 112);
  fill.addColorStop(0, 'rgba(188,206,226,.85)');
  fill.addColorStop(1, 'rgba(188,206,226,0)');
  g.fillStyle = fill; g.fillRect(0, 0, 512, 256);

  // a hard overhead strip, so the stone gets one clean streak
  const strip = g.createLinearGradient(0, 0, 0, 40);
  strip.addColorStop(0, 'rgba(255,255,255,.95)');
  strip.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = strip; g.fillRect(150, 0, 230, 40);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose(); tex.dispose();
  return env;
}

/* ═══════════════════════════════════════════════════════════════════ */
export function createFlacon(canvas, opts = {}) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  // Probe first. Constructing a WebGLRenderer on a machine without WebGL
  // throws *and* logs its own console error on the way out, which would be
  // a red line in the console on a path that is meant to degrade quietly.
  const probe = document.createElement('canvas');
  const supported = !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  if (!supported) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 0.18, 9.1);

  scene.environment = studioEnvironment(renderer);

  const key = new THREE.DirectionalLight(0xfff0dc, 2.1);
  key.position.set(-3.4, 4.2, 4.0); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd2e6, 1.5);
  rim.position.set(4.2, 1.6, -3.2); scene.add(rim);
  const under = new THREE.DirectionalLight(0xffd8a8, 0.45);
  under.position.set(0.4, -3.2, 1.8); scene.add(under);

  /* ── the bottle ─────────────────────────────────────────────────── */
  const W = 1.00, H = 0.95, D = 0.62;          // from the photograph
  const rig = new THREE.Group();
  const spinner = new THREE.Group();            // everything that turns
  rig.add(spinner); scene.add(rig);

  const bodyShape = squircle(W, H);
  const BEV = 0.055;
  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: D, bevelEnabled: true, bevelThickness: BEV,
    bevelSize: BEV, bevelSegments: 4, curveSegments: 10
  });
  // ExtrudeGeometry runs from -bevelThickness to depth+bevelThickness, so the
  // front face sits at D/2 + BEV once centred — not at D/2.
  bodyGeo.translate(0, 0, -(D + 2 * BEV) / 2 + BEV);
  const FRONT = D / 2 + BEV;
  bodyGeo.computeVertexNormals();

  const lacquer = new THREE.MeshPhysicalMaterial({
    color: 0x5b3a25, roughness: 0.46, metalness: 0.0,
    clearcoat: 0.95, clearcoatRoughness: 0.085,
    sheen: 0.30, sheenColor: new THREE.Color(0xd8b38c), envMapIntensity: 1.55
  });
  const body = new THREE.Mesh(bodyGeo, lacquer);
  spinner.add(body);

  /* The bottle is opaque lacquer, so there is no liquid to see inside it —
     drawing one would be a lie and a whole transmission pass. The moving
     liquid lives on the page instead; `level` is kept as the pour that the
     neck shows when the stone is lifted. */
  const neckJuice = new THREE.Mesh(
    new THREE.CylinderGeometry(0.168, 0.168, 0.26, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x7a4a22, roughness: 0.10, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.8
    })
  );
  neckJuice.position.set(-0.03, H + 0.03, 0);
  spinner.add(neckJuice);

  /* the monogram, raised in gold off the front face */
  const goldMat = new THREE.MeshPhysicalMaterial({
    color: GOLD, roughness: 0.21, metalness: 1.0,
    clearcoat: 0.45, clearcoatRoughness: 0.14, envMapIntensity: 1.9
  });
  const monoGeo = new THREE.ExtrudeGeometry(monogramShapes(), {
    depth: 0.030, bevelEnabled: true, bevelThickness: 0.012,
    bevelSize: 0.011, bevelSegments: 3, curveSegments: 22
  });
  monoGeo.computeVertexNormals();
  const mono = new THREE.Mesh(monoGeo, goldMat);
  mono.scale.setScalar(0.72);
  mono.position.set(0, -0.02, FRONT - 0.004);
  spinner.add(mono);

  /* neck and collar */
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.175, 0.20, 0.20, 40),
    lacquer.clone()
  );
  neck.position.set(-0.03, H + 0.075, 0);
  spinner.add(neck);

  const collarGeo = knurledRing(0.212, 0.182, 0.105, 46);
  collarGeo.rotateX(-Math.PI / 2);
  const collar = new THREE.Mesh(collarGeo, goldMat);
  collar.position.set(-0.03, H + 0.090, 0);
  spinner.add(collar);

  /* the stone */
  const stoneMat = new THREE.MeshPhysicalMaterial({
    color: 0x4a2c1b, roughness: 0.075, metalness: 0.0,
    clearcoat: 1.0, clearcoatRoughness: 0.045,
    envMapIntensity: 1.45
  });
  const stone = new THREE.Mesh(stoneGeometry(2), stoneMat);
  stone.scale.setScalar(0.635);
  stone.position.set(-0.055, H + 0.195, 0.015);
  stone.rotation.set(0.10, 0.5, -0.14);
  const stoneRig = new THREE.Group();          // lifts, so the cap can come off
  stoneRig.add(stone);
  spinner.add(stoneRig);

  /* a soft plate under it, so it is standing on something */
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  {
    const sg = shadowCanvas.getContext('2d');
    const rg = sg.createRadialGradient(64, 64, 2, 64, 64, 62);
    rg.addColorStop(0, 'rgba(0,0,0,.72)');
    rg.addColorStop(0.45, 'rgba(0,0,0,.34)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
  }
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 48),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true, opacity: 0.55, depthWrite: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -H - 0.10;
  rig.add(shadow);

  /* ── state ──────────────────────────────────────────────────────── */
  const state = {
    spin: 0.52, spinV: 0, drag: 0, open: 0, level: 0.40,
    tiltX: 0, tiltY: 0, surf: 0, surfV: 0, surfX: 0, surfXV: 0,
    scrollV: 0, idle: true, domain: 1
  };

  function applyDomain(i, instant) {
    const d = DOMAINS[i % DOMAINS.length];
    state.domain = i % DOMAINS.length;
    const to = new THREE.Color(d.lacquer);
    const toJ = new THREE.Color(d.juice);
    if (instant) {
      lacquer.color.copy(to); neck.material.color.copy(to);
      neckJuice.material.color.copy(toJ);
      stoneMat.color.copy(to.clone().multiplyScalar(0.82));
    } else {
      state._to = { lacquer: to, juice: toJ, t: 0 };
    }
    lacquer.clearcoatRoughness = 0.16 - d.gloss * 0.22;
    stone.geometry.dispose();
    stone.geometry = stoneGeometry(i + 2);
  }
  applyDomain(1, true);

  /* ── interaction: it is never completely still ──────────────────── */
  let dragging = false, lastX = 0, lastY = 0;
  const onDown = (e) => {
    dragging = true; state.idle = false;
    lastX = (e.touches ? e.touches[0].clientX : e.clientX);
    lastY = (e.touches ? e.touches[0].clientY : e.clientY);
  };
  const onMove = (e) => {
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    if (dragging) {
      const dx = x - lastX, dy = y - lastY;
      state.spinV += dx * 0.00042;
      state.tiltX = THREE.MathUtils.clamp(state.tiltX + dy * 0.0016, -0.34, 0.34);
      state.surfXV += dx * 0.00030;
      lastX = x; lastY = y;
      if (e.cancelable) e.preventDefault();
    } else {
      const r = canvas.getBoundingClientRect();
      state.tiltY = ((x - r.left) / r.width - 0.5) * 0.30;
    }
  };
  const onUp = () => { dragging = false; };

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';

  /* ── size ───────────────────────────────────────────────────────── */
  let zoom = 1;
  function resize() {
    const w = canvas.clientWidth || 400, h = canvas.clientHeight || 520;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the bottle the same size however tall the slot is
    camera.position.z = 9.1 * Math.max(1, 1.42 / camera.aspect) * 0.78 * zoom;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = ('ResizeObserver' in window) ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas); else window.addEventListener('resize', resize);

  /* ── frame ──────────────────────────────────────────────────────── */
  let t0 = performance.now(), raf = 0, visible = true;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;

    // the turn: a steady drift plus whatever the hand added, bleeding off
    if (!still) state.spin += (0.118 + state.spinV) * dt * 60 * 0.0166;
    state.spinV *= Math.pow(0.0016, dt);

    spinner.rotation.y = state.spin;
    spinner.rotation.x = state.tiltX;
    spinner.rotation.z = state.tiltY * 0.5;

    // the juice lags the bottle, overshoots, settles — a spring on the
    // surface angle, pushed by turn speed and by scroll speed
    const push = state.spinV * 44 + state.scrollV * 0.9;
    state.surfV += (-state.surf * 16.0 - state.surfV * 3.4 + push) * dt;
    state.surf += state.surfV * dt;
    state.surfXV += (-state.surfX * 15.0 - state.surfXV * 3.2) * dt;
    state.surfX += state.surfXV * dt;
    state.scrollV *= Math.pow(0.02, dt);

    const sx = THREE.MathUtils.clamp(state.surf, -0.42, 0.42);
    const sz = THREE.MathUtils.clamp(state.surfX, -0.42, 0.42);

    // the cut plane, in the bottle's own frame then taken to world
    // the pour in the neck rocks with the same spring, and shows only once
    // the stone is off
    neckJuice.rotation.set(sx * 0.7, 0, sz * 0.7);
    neckJuice.scale.y = 0.35 + state.level * 0.9;
    neckJuice.position.y = H + 0.03 - (1 - state.level) * 0.05;
    neckJuice.visible = state.open > 0.02 && state.level > 0.03;

    // the cap: lifts, turns a little, floats
    const o = state.open;
    stoneRig.position.y = o * 0.92;
    stoneRig.rotation.z = o * 0.42;
    stoneRig.rotation.x = -o * 0.20;
    stoneRig.position.x = o * 0.10;

    // colourway cross-fade
    if (state._to) {
      state._to.t = Math.min(1, state._to.t + dt * 1.5);
      const k = state._to.t * state._to.t * (3 - 2 * state._to.t);
      lacquer.color.lerp(state._to.lacquer, k * 0.3);
      neck.material.color.copy(lacquer.color);
      neckJuice.material.color.lerp(state._to.juice, k * 0.3);
      stoneMat.color.copy(lacquer.color).multiplyScalar(0.82);
      if (state._to.t >= 1) state._to = null;
    }

    shadow.material.opacity = 0.30 * (1 - Math.abs(state.tiltX) * 0.8);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // stop drawing when it is not on screen — it is a hero, not a heater
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible) t0 = performance.now();
    }, { rootMargin: '120px' }).observe(canvas);
  }

  return {
    state, DOMAINS,
    setDomain: (i, instant) => applyDomain(i, !!instant),
    setZoom: (k) => { zoom = k || 1; resize(); },
    setOpen: (v) => { state.open = THREE.MathUtils.clamp(v, 0, 1); },
    setLevel: (v) => { state.level = THREE.MathUtils.clamp(v, 0, 1); },
    setTilt: (x) => { state.tiltX = THREE.MathUtils.clamp(x, -0.34, 0.34); },
    nudge: (v) => { state.scrollV = THREE.MathUtils.clamp(v, -14, 14); },
    spinBy: (v) => { state.spinV += v; },
    resize,
    dispose () {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      renderer.dispose();
    }
  };
}
