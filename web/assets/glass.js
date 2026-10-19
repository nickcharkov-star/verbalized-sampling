/* ═══════════════════════════════════════════════════════════════════════
   COLD GLASS — a fogged pane over a photograph, with condensation that
   gathers, runs and leaves clear trails, and a pointer that wipes it.

   Three layers, composited in one WebGL 1 fragment shader:

     the photograph        sharp, untouched
     the frost             the same photograph blurred and hazed, shown
                           where the fog map says the glass is misted
     the water             drops drawn into a normal map on a 2D canvas;
                           each one refracts the sharp photograph and
                           catches a highlight

   The fog never covers the bottle at rest. Its resting map keeps the
   middle of the pane clear, where the bottle stands, and mists only the
   edges, where the ingredients are — wiping is how you reach them.

   Three dials (set): mist, how far the fog reaches into the edges; rain,
   how much water runs; breath, how fast a wiped pane mists back. None of
   them can fog the middle: the resting map is scaled, and the middle of it
   is all but zero.

   Returns null without WebGL; the photograph underneath stays as it is.
   ═══════════════════════════════════════════════════════════════════════ */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; vUv.y = 1.0 - vUv.y; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImg, uBlur, uDrops, uFog;
uniform vec2 uCover;          // uv scale for object-fit: cover
uniform float uTime;

vec2 cover(vec2 uv){ return (uv - 0.5) * uCover + 0.5; }

void main(){
  vec4 d = texture2D(uDrops, vUv);
  float drop = d.a;
  vec2 n = (d.rg - 0.5) * 2.0;

  vec3 sharp = texture2D(uImg, cover(vUv)).rgb;
  // a drop is a small lens: it shows the scene behind it, displaced and flipped
  vec3 refr = texture2D(uImg, cover(vUv - n * 0.085)).rgb;

  float fog = texture2D(uFog, vUv).r;
  vec3 blur = texture2D(uBlur, cover(vUv)).rgb;
  // frost: blurred, lifted toward a cold white, a touch of grain
  float g = fract(sin(dot(vUv * 913.0, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
  vec3 frost = mix(blur, vec3(0.86, 0.89, 0.92), 0.22) * 0.94 + 0.035 + (g - 0.5) * 0.018;

  vec3 col = mix(sharp, frost, clamp(fog, 0.0, 1.0));
  col = mix(col, refr * 1.05 + 0.02, drop);

  // light from the upper left catches each drop; the far rim darkens
  vec3 N = normalize(vec3(n, 0.55));
  float spec = pow(max(0.0, dot(N, normalize(vec3(-0.45, 0.55, 0.75)))), 24.0);
  col += spec * 0.6 * drop;
  col *= 1.0 - 0.22 * drop * smoothstep(0.35, 0.0, d.b);

  gl_FragColor = vec4(col, 1.0);
}`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* one drop, as a normal-map sprite: R,G the surface normal, B the height */
function dropSprite (size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - r) / r, ny = (y + 0.5 - r) / r;
      const q = nx * nx + ny * ny;
      const i = (y * size + x) * 4;
      if (q >= 1) { img.data[i + 3] = 0; continue; }
      const nz = Math.sqrt(1 - q);
      img.data[i] = Math.round((0.5 + nx * 0.5) * 255);
      img.data[i + 1] = Math.round((0.5 - ny * 0.5) * 255);
      img.data[i + 2] = Math.round(nz * 255);
      img.data[i + 3] = Math.round(Math.min(1, (1 - q) * 3.2) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function createGlass (canvas, img, opts = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  if (!gl) return null;
  const still = !!opts.still;

  function shader (type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { return null; }
  gl.useProgram(prog);
  const u = {};
  for (const n of ['uImg', 'uBlur', 'uDrops', 'uFog', 'uCover', 'uTime']) u[n] = gl.getUniformLocation(prog, n);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function texture (unit, source) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return t;
  }

  // the frost: a soft copy of the photograph. Where the canvas can blur,
  // a real blur at a modest size; elsewhere the photograph taken down to a
  // sliver and back up, which is a blur every browser can do
  const blur = document.createElement('canvas');
  const bg = blur.getContext('2d');
  const soft = typeof bg.filter === 'string';
  blur.width = soft ? 200 : 54;
  blur.height = Math.round(blur.width * img.naturalHeight / img.naturalWidth);
  bg.imageSmoothingQuality = 'high';
  if (soft) {
    bg.filter = 'blur(6px)';
    // drawn a little oversized so the blur does not pull in the transparent edge
    bg.drawImage(img, -12, -12, blur.width + 24, blur.height + 24);
    bg.filter = 'none';
  } else bg.drawImage(img, 0, 0, blur.width, blur.height);

  try {
    texture(0, img);
    texture(1, blur);
  } catch (e) { return null; }             // a cross-origin photograph without CORS

  // drop map and fog map, on 2D canvases, uploaded as they change
  const DW = 300, DH = Math.round(DW * (opts.aspect || 1.25));
  const drops = document.createElement('canvas'); drops.width = DW; drops.height = DH;
  const dg = drops.getContext('2d');
  const FW = 120, FH = Math.round(FW * (opts.aspect || 1.25));
  const fogC = document.createElement('canvas'); fogC.width = FW; fogC.height = FH;
  const fg = fogC.getContext('2d', { willReadFrequently: true });
  const dropTex = texture(2, drops);
  const fogTex = texture(3, fogC);
  const sprite = dropSprite();

  // where the glass rests: misted at the edges, clear over the bottle
  const clearX = opts.clear?.[0] ?? 0.5, clearY = opts.clear?.[1] ?? 0.47;
  const clearRX = opts.clear?.[2] ?? 0.24, clearRY = opts.clear?.[3] ?? 0.34;
  const dial = { mist: 1, rain: 1, breath: 1 };
  const rest0 = new Float32Array(FW * FH), rest = new Float32Array(FW * FH);
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const ex = (x / FW - clearX) / clearRX, ey = (y / FH - clearY) / clearRY;
      const e = Math.sqrt(ex * ex + ey * ey);
      rest0[y * FW + x] = clamp((e - 0.85) / 0.55, 0, 1) * 0.92 + 0.04;
    }
  }
  const restate = () => { for (let i = 0; i < rest.length; i++) rest[i] = Math.min(1, rest0[i] * dial.mist); };
  restate();
  const fog = Float32Array.from(rest);
  const fogImg = fg.createImageData(FW, FH);
  function uploadFog () {
    for (let i = 0; i < fog.length; i++) {
      const v = Math.round(clamp(fog[i], 0, 1) * 255);
      fogImg.data[i * 4] = v; fogImg.data[i * 4 + 3] = 255;
    }
    fg.putImageData(fogImg, 0, 0);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, fogTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fogC);
  }
  function wipeFog (fx, fy, radius, amount) {
    const cx = fx * FW, cy = fy * FH, r = radius * FW;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(FW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(FH - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d < 1) fog[y * FW + x] *= 1 - amount * (1 - d * d);
      }
    }
  }

  /* the water */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const misted = (x, y) => rest[Math.min(FH - 1, Math.floor(y * FH)) * FW + Math.min(FW - 1, Math.floor(x * FW))] > 0.35;
  const beads = [];
  function seed (n) {
    let tries = 0;
    while (n > 0 && tries++ < n * 20) {
      const x = Math.random(), y = Math.random();
      if (!misted(x, y)) continue;
      beads.push({ x, y, r: rnd(0.0035, 0.011) });
      n--;
    }
  }
  seed(still ? 160 : 260);
  const runners = [];
  function spawnRunner () {
    let x, y, tries = 0;
    do { x = Math.random(); y = rnd(0.02, 0.5); } while (!misted(x, y) && tries++ < 40);
    runners.push({ x, y, r: rnd(0.014, 0.024), v: 0, wait: rnd(0.2, 1.6), trail: 0 });
  }
  for (let i = 0; i < 4; i++) spawnRunner();

  function drawDrops () {
    dg.clearRect(0, 0, DW, DH);
    const s = (x, y, rx, ry) => dg.drawImage(sprite, x * DW - rx * DW, y * DH - ry * DW, rx * 2 * DW, ry * 2 * DW);
    for (const b of beads) s(b.x, b.y, b.r, b.r);
    for (const r of runners) s(r.x, r.y, r.r * 0.92, r.r * 1.12);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, dropTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drops);
  }

  function stepWater (dt) {
    if (still) return;
    for (let i = runners.length - 1; i >= 0; i--) {
      const r = runners[i];
      if (r.wait > 0) { r.wait -= dt; continue; }
      // stick and slip: a drop runs, catches, and runs again
      r.v = clamp(r.v + dt * 0.35, 0, 0.32);
      if (Math.random() < dt * 0.7) { r.wait = rnd(0.08, 0.6); r.v *= 0.2; }
      const dy = r.v * dt;
      r.y += dy;
      r.x += Math.sin(r.y * 40 + i) * 0.0008;
      // it clears a path through the mist, and swallows the beads it meets
      wipeFog(r.x, r.y, r.r * 0.9, 0.9);
      r.trail += dy;
      if (r.trail > 0.035) { r.trail = 0; beads.push({ x: r.x + rnd(-0.003, 0.003), y: r.y - r.r * 1.5, r: rnd(0.002, 0.005) }); }
      for (let j = beads.length - 1; j >= 0; j--) {
        const b = beads[j];
        if (Math.abs(b.x - r.x) < r.r && Math.abs(b.y - r.y) < r.r * 1.4) { beads.splice(j, 1); r.r = Math.min(0.03, r.r + b.r * 0.08); }
      }
      if (r.y - r.r > 1.02) runners.splice(i, 1);
    }
    if (runners.length < Math.round(5 * dial.rain) && Math.random() < dt * 0.6 * dial.rain) spawnRunner();
    if (beads.length < 240 * Math.min(1.4, dial.rain) && Math.random() < dt * 6 * dial.rain) seed(1);
  }

  /* the cloth: the pointer wipes, and water gathers at the end of a stroke */
  let wiping = false, lastPX = 0, lastPY = 0, wiped = 0;
  function wipeAt (fx, fy) {
    const dist = Math.hypot(fx - lastPX, fy - lastPY);
    const steps = Math.max(1, Math.ceil(dist / 0.01));
    for (let k = 1; k <= steps; k++) {
      const x = lastPX + (fx - lastPX) * k / steps, y = lastPY + (fy - lastPY) * k / steps;
      wipeFog(x, y, 0.085, 0.85);
      for (let j = beads.length - 1; j >= 0; j--) {
        const b = beads[j];
        if (Math.hypot(b.x - x, (b.y - y) * 1.25) < 0.075) beads.splice(j, 1);
      }
    }
    if (dist > 0.02 && Math.random() < 0.35) beads.push({ x: fx + rnd(-0.06, 0.06), y: fy + rnd(0.05, 0.09), r: rnd(0.004, 0.009) });
    wiped += dist;
    lastPX = fx; lastPY = fy;
    opts.onWipe?.(dist);
  }
  const at = e => {
    const r = canvas.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)];
  };
  canvas.addEventListener('pointerdown', e => { wiping = true; [lastPX, lastPY] = at(e); });
  canvas.addEventListener('pointermove', e => {
    const [x, y] = at(e);
    // a fine pointer wipes on hover, the way a hand passes over glass;
    // a finger wipes while it is down
    if (e.pointerType === 'mouse' || wiping) wipeAt(x, y); else { lastPX = x; lastPY = y; }
  });
  canvas.addEventListener('pointerenter', e => { [lastPX, lastPY] = at(e); });
  addEventListener('pointerup', () => { wiping = false; });
  canvas.addEventListener('pointercancel', () => { wiping = false; });

  /* the clock */
  let raf = 0, last = 0, visible = true, disposed = false, t0 = performance.now();
  function resize () {
    const DPR = Math.min(devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
  }
  function frame (now) {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    // the mist comes back, slowly, as breath does on cold glass
    for (let i = 0; i < fog.length; i++) fog[i] += (rest[i] - fog[i]) * dt * 0.045 * dial.breath;
    stepWater(dt);
    draw(now);
    if (visible) raf = requestAnimationFrame(frame);
  }
  function draw (now) {
    uploadFog();
    drawDrops();
    gl.viewport(0, 0, canvas.width, canvas.height);
    const ia = img.naturalWidth / img.naturalHeight, ca = canvas.width / canvas.height;
    gl.uniform2f(u.uCover, ca > ia ? 1 : ca / ia, ca > ia ? ia / ca : 1);
    gl.uniform1i(u.uImg, 0); gl.uniform1i(u.uBlur, 1); gl.uniform1i(u.uDrops, 2); gl.uniform1i(u.uFog, 3);
    gl.uniform1f(u.uTime, (now - t0) / 1000 % 100);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  ro ? ro.observe(canvas) : addEventListener('resize', resize);
  resize();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    }, { rootMargin: '120px' }).observe(canvas);
  }
  raf = requestAnimationFrame(frame);

  return {
    get wiped () { return wiped; },
    /* a stroke across the glass, for a phone that is only being scrolled */
    demo () {
      if (still) return;
      let k = 0;
      lastPX = 0.08; lastPY = 0.22;
      const id = setInterval(() => {
        k += 0.04;
        wipeAt(0.08 + k * 0.84, 0.22 + Math.sin(k * 3.2) * 0.06);
        if (k >= 1) clearInterval(id);
      }, 30);
    },
    fogAt: (x, y) => fog[Math.min(FH - 1, Math.floor(y * FH)) * FW + Math.min(FW - 1, Math.floor(x * FW))],
    get dials () { return { ...dial }; },
    set (d = {}) {
      if (d.mist != null) dial.mist = clamp(+d.mist, 0.3, 1.5);
      if (d.rain != null) dial.rain = clamp(+d.rain, 0, 2);
      if (d.breath != null) dial.breath = clamp(+d.breath, 0, 3);
      restate();
    },
    /* breathe on the whole pane at once */
    mistOver () {
      for (let i = 0; i < fog.length; i++) fog[i] = Math.max(fog[i], rest[i]);
      seed(still ? 80 : 160);
    },
    /* a cloth across all of it */
    wipeClean () {
      fog.fill(0);
      beads.length = 0;
      runners.length = 0;
    },
    /* the frame as it stands, drawn now and read before it is presented */
    snapshot () {
      draw(performance.now());
      return new Promise(res => canvas.toBlob(res, 'image/png'));
    },
    dispose () { disposed = true; cancelAnimationFrame(raf); ro?.disconnect(); }
  };
}
