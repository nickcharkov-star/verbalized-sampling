/* ═══════════════════════════════════════════════════════════════════════
   PIXEL FIELD — the campaign photograph, taken apart.

   One particle per pixel of the original file. Nothing is sampled down:
   a 270 × 480 photograph becomes 129,600 particles, and the photograph
   you see is those particles sitting still.

   Written directly against WebGL 2. It used to lean on three.js, which
   is 671 KB, for a renderer, four render targets, two shader programs,
   a point cloud and a perspective matrix — about five percent of the
   library, for twenty times the weight of this file. The simulation was
   always raw GLSL; only the plumbing was borrowed, and the plumbing is
   a few hundred lines.

   The simulation never touches the CPU. Position and velocity live in
   two pairs of floating-point framebuffers, ping-ponged each frame by a
   fragment shader; the point cloud's vertex shader reads the position
   texture back out. The only CPU work per frame is a handful of uniforms.

   FIVE MOVEMENTS

     I   Frame      every pixel at home. The photograph, held together
                    by a spring per particle.
     II  Sillage    the springs let go. Curl noise carries the image off
                    like scent, and it drifts back when you stop.
     III Relief     each pixel pushed along z by its own luminance, so the
                    flat frame becomes a surface you can look across.
     IV  The Five   every pixel flies to whichever of the five house
                    colours it most resembles.
     V   Flacon     all of them reassemble into one silhouette, rank-
                    matched by luminance so it arrives lit.

   The pointer is a force the whole time: it pushes the field away, and
   pressing pulls it back in.
   ═══════════════════════════════════════════════════════════════════════ */
export { MOVEMENTS } from './catalogue.js';
import { MOVEMENTS } from './catalogue.js';

/* The house palette, as the sorter sees it. A pixel joins whichever of
   these it is nearest in linear RGB. */
const PALETTE = [
  0x17 / 255, 0x13 / 255, 0x10 / 255,   // I   Kingdom
  0x5b / 255, 0x3a / 255, 0x25 / 255,   // II  Sovereign
  0x2e / 255, 0x5e / 255, 0x8e / 255,   // III Celestial
  0xe9 / 255, 0xdf / 255, 0xcd / 255,   // IV  Crown
  0xd9 / 255, 0x73 / 255, 0x2a / 255    // V   Empire
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ── just enough matrix maths ─────────────────────────────────────── */
function perspective (fovyDeg, aspect, near, far) {
  const f = 1 / Math.tan(fovyDeg * Math.PI / 360), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function lookAt (ex, ey, ez, cx, cy, cz) {
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  // up is +Y; the camera never rolls, so the cross products stay simple
  let xx = zz, xy = 0, xz = -zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez), 1
  ]);
}

/* ── shaders ──────────────────────────────────────────────────────── */
const SIM_VERT = `#version 300 es
precision highp float;

in vec2 aPos;
out vec2 vRef;
void main(){ vRef = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const VEL_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
vec3 curl(vec3 p){
  const float e = 0.12;
  float n1 = snoise(vec3(p.x, p.y + e, p.z));
  float n2 = snoise(vec3(p.x, p.y - e, p.z));
  float n3 = snoise(vec3(p.x, p.y, p.z + e));
  float n4 = snoise(vec3(p.x, p.y, p.z - e));
  float n5 = snoise(vec3(p.x + e, p.y, p.z));
  float n6 = snoise(vec3(p.x - e, p.y, p.z));
  return normalize(vec3(n1 - n2 - (n3 - n4), n3 - n4 - (n5 - n6), n5 - n6 - (n1 - n2)) + 1e-6);
}
uniform vec2  uPlane;        // world size of the photograph
uniform float uMode;         // 0..4, fractional while crossfading
uniform float uDepth;        // relief displacement
uniform vec3  uPalette[5];
uniform vec3  uCluster[5];   // where each of the five piles stands
uniform float uClusterScale;
uniform sampler2D uShape;    // rank-matched seats — the lit bottle, movement V
uniform sampler2D uShapeMix; // shuffled seats — the colour piles, movement IV
uniform float uShapeScale;

vec3 homePos(vec2 ref){
  return vec3((ref.x - 0.5) * uPlane.x, (0.5 - ref.y) * uPlane.y, 0.0);
}

int nearestLot(vec3 col){
  int best = 0;
  float bd = 1e9;
  for (int i = 0; i < 5; i++){
    float d = distance(col, uPalette[i]);
    if (d < bd){ bd = d; best = i; }
  }
  return best;
}

float hash12(vec2 p){
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 targetFor(float mode, vec2 ref, vec3 col, float lum){
  vec4 shapeTex = texture(uShape, ref);
  vec2 shape = shapeTex.xy - 0.5;
  // thickness comes from the baked distance-to-edge, so the pile has the
  // volume of a flacon rather than of a ball
  float thru = (hash12(ref * 97.3) - 0.5) * 2.0 * shapeTex.z;

  if (mode < 0.5) return homePos(ref);                                  // I
  if (mode < 1.5) return homePos(ref);                                  // II (weak spring)
  if (mode < 2.5) return homePos(ref) + vec3(0.0, 0.0, (lum - 0.42) * uDepth);  // III

  if (mode < 3.5){                                                      // IV
    vec4 mixTex = texture(uShapeMix, ref);
    vec2 mshape = mixTex.xy - 0.5;
    float mthru = (hash12(ref * 97.3) - 0.5) * 2.0 * mixTex.z;
    int lot = nearestLot(col);
    vec3 c = uCluster[0];
    for (int i = 0; i < 5; i++) if (i == lot) c = uCluster[i];
    return c + vec3(mshape * uClusterScale, mthru * uClusterScale * 0.30 + (lum - 0.5) * 0.06);
  }
  return vec3(shape * uShapeScale, thru * uShapeScale * 0.26 + (lum - 0.5) * 0.10);   // V
}

vec3 blendTarget(vec2 ref, vec3 col, float lum){
  float lo = floor(uMode), hi = min(lo + 1.0, 4.0);
  float k  = smoothstep(0.0, 1.0, uMode - lo);
  return mix(targetFor(lo, ref, col, lum), targetFor(hi, ref, col, lum), k);
}

in vec2 vRef;
uniform sampler2D uPos, uVel, uPhoto;
uniform float uTime, uDt, uSillage, uSwirl;
uniform vec4  uPointer;      // xyz world, w = press (−1 pull … +1 push)
uniform float uPointerR;

void main(){
  vec4 P = texture(uPos, vRef);
  vec4 V = texture(uVel, vRef);
  vec3 col = texture(uPhoto, vRef).rgb;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

  vec3 tgt = blendTarget(vRef, col, lum);
  vec3 vel = V.xyz;

  // the spring that holds the photograph together. Movement II slackens
  // it rather than switching it off, so the image can still find its way
  // home when the noise lets go.
  float stiff = mix(16.0, 1.1, uSillage);
  vel += (tgt - P.xyz) * stiff * uDt;

  // curl carries it. Scale by sillage so it is a tremor at rest and a
  // current once the springs slacken.
  vec3 c = curl(P.xyz * 0.42 + vec3(0.0, 0.0, uTime * 0.09));
  vel += c * (0.30 + uSillage * 5.4) * uSwirl * uDt;

  // a per-particle tremor, so nothing is ever perfectly still
  vel += vec3(
    snoise(vec3(vRef * 180.0, uTime * 0.7)),
    snoise(vec3(vRef * 180.0 + 31.0, uTime * 0.7)),
    0.0) * (0.035 + uSillage * 0.55) * uDt;

  // the pointer. Falls off smoothly and acts in three dimensions, so the
  // field opens around it rather than smearing.
  vec3 d = P.xyz - uPointer.xyz;
  float dist = length(d);
  if (dist < uPointerR){
    float f = 1.0 - dist / uPointerR;
    vel += normalize(d + 1e-5) * f * f * uPointer.w * 26.0 * uDt;
  }

  vel *= pow(mix(0.015, 0.34, uSillage), uDt);   // damping
  fragColor = vec4(vel, V.w);
}`;

const POS_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;


in vec2 vRef;
uniform sampler2D uPos, uVel;
uniform float uDt;
void main(){
  vec4 P = texture(uPos, vRef);
  vec3 V = texture(uVel, vRef).xyz;
  fragColor = vec4(P.xyz + V * uDt, P.w);
}`;

const DRAW_VERT = `#version 300 es
precision highp float;


in vec2 aRef;
uniform sampler2D uPos, uPhoto;
uniform mat4 uProj, uView;
uniform float uSize, uPixelRatio, uSillage;
out vec3 vCol;
out float vFade;
void main(){
  vec3 p = texture(uPos, aRef).xyz;
  vCol = texture(uPhoto, aRef).rgb;

  vec4 mv = uView * vec4(p, 1.0);
  gl_Position = uProj * mv;

  // a pixel keeps its size on screen until it travels, then it thins out
  float travel = clamp(abs(p.z) * 0.6 + uSillage * 0.5, 0.0, 1.0);
  vFade = 1.0 - travel * 0.45;
  gl_PointSize = uSize * uPixelRatio * (300.0 / -mv.z) * (1.0 + travel * 0.5);
}`;

const DRAW_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;


in vec3 vCol;
in float vFade;
void main(){
  // round, with a soft shoulder — square points read as a glitch, not a grain
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.18, length(d));
  if (a < 0.01) discard;
  fragColor = vec4(vCol, a * vFade);
}`;

/* ═══════════════════════════════════════════════════════════════════ */
export function createPixelField (canvas, opts = {}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(devicePixelRatio || 1, 2);

  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: true, premultipliedAlpha: false,
    depth: false, powerPreference: 'high-performance'
  });
  if (!gl) return null;
  // the whole simulation lives in floating-point framebuffers
  if (!gl.getExtension('EXT_color_buffer_float')) return null;

  /* ── tiny GL helpers ─────────────────────────────────────────────── */
  function shader (type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src.trim());
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program (vs, fs, attrib) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    // bind before linking: the only attribute each of these has must be 0,
    // and the linker is free to number them otherwise
    if (attrib) gl.bindAttribLocation(p, 0, attrib);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    // uniform locations, looked up once
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  function floatTexture (w, h, data = null) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function target (w, h, data = null) {
    const tex = floatTexture(w, h, data);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error('framebuffer incomplete');
    return { tex, fbo, w, h };
  }

  let simProgVel, simProgPos, drawProg, quadVAO, pointVAO;
  let posA, posB, velA, velB, photoTex, shapeTex, shapeMixTex;
  let raf = 0, visible = true, disposed = false;

  const state = {
    mode: 0, modeTarget: 0, sillage: 0, swirl: 1,
    pointer: [0, 0, 0, 0], pointerR: 0.9,
    press: 0, ready: false, cols: 0, rows: 0, count: 0
  };

  /* Read the photograph's own luminance, one value per particle, so the
     deal below can be rank-matched instead of shuffled. */
  function photoLuminance (img, cols, rows) {
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, cols, rows);
    let px;
    try { px = g.getImageData(0, 0, cols, rows).data; } catch (e) { return null; }
    const lum = new Float32Array(cols * rows);
    for (let i = 0; i < lum.length; i++) {
      lum[i] = (px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722) / 255;
    }
    return lum;
  }

  /* ── bake the flacon silhouette into one target per particle ──────
     Every opaque pixel of the rendered bottle becomes a seat, and the
     particles are dealt into those seats. Dealing is deterministic, so
     the bottle assembles the same way every time — and because the deal
     is shuffled, the photograph does not simply fold up in rows. */
  /* Read the photograph's own luminance, one value per particle, so the
     deal below can be rank-matched instead of shuffled. */
  function photoLuminance (img, cols, rows) {
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, cols, rows);
    let px;
    try { px = g.getImageData(0, 0, cols, rows).data; } catch (e) { return null; }
    const lum = new Float32Array(cols * rows);
    for (let i = 0; i < lum.length; i++) {
      lum[i] = (px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722) / 255;
    }
    return lum;
  }

  function bakeShape (img, cols, rows, photoLum) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, S, S);
    let px;
    try { px = g.getImageData(0, 0, S, S).data; } catch (e) { return null; }

    // 110 let the render's soft drop shadow in, which rounded the bottle
    // into a blob and welded the stone onto the body. 198 is the glass.
    const seats = [], seatIdx = [], seatLum = [];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (px[(y * S + x) * 4 + 3] > 198) {
          const k = (y * S + x) * 4;
          const u = (x + 0.5) / S, v = 1 - (y + 0.5) / S;
          seatIdx.push(y * S + x);
          seatLum.push((px[k] * 0.2126 + px[k + 1] * 0.7152 + px[k + 2] * 0.0722) / 255);
          seats.push(u, v);
          if (u < x0) x0 = u; if (u > x1) x1 = u;
          if (v < y0) y0 = v; if (v > y1) y1 = v;
        }
      }
    }
    const n = seats.length / 2;
    if (!n) return null;

    // How thick is the bottle here? Distance to the nearest edge, by a
    // two-pass chamfer transform. Deriving thickness from distance to the
    // centre instead gives a sphere, and the flacon comes out a blob.
    const INF = 1e6;
    const dt = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) dt[i] = px[i * 4 + 3] > 198 ? INF : 0;
    const D1 = 1, D2 = 1.41421356;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (dt[i] === 0) continue;
      let m = dt[i];
      if (y > 0) {
        m = Math.min(m, dt[i - S] + D1);
        if (x > 0) m = Math.min(m, dt[i - S - 1] + D2);
        if (x < S - 1) m = Math.min(m, dt[i - S + 1] + D2);
      }
      if (x > 0) m = Math.min(m, dt[i - 1] + D1);
      dt[i] = m;
    }
    let dmax = 0;
    for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
      const i = y * S + x;
      if (dt[i] === 0) continue;
      let m = dt[i];
      if (y < S - 1) {
        m = Math.min(m, dt[i + S] + D1);
        if (x > 0) m = Math.min(m, dt[i + S - 1] + D2);
        if (x < S - 1) m = Math.min(m, dt[i + S + 1] + D2);
      }
      if (x < S - 1) m = Math.min(m, dt[i + 1] + D1);
      dt[i] = m;
      if (m > dmax) dmax = m;
    }
    dmax = dmax || 1;

    // centre on the silhouette, and scale so its longer side fills the
    // unit box — the bottle then sits in the middle whatever the render did
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const span = Math.max(x1 - x0, y1 - y0) || 1;
    for (let i = 0; i < seats.length; i += 2) {
      seats[i]     = (seats[i] - cx) / span + 0.5;
      seats[i + 1] = (seats[i + 1] - cy) / span + 0.5;
    }

    // thickness per seat, eased so the surface rounds rather than steps
    const thick = new Float32Array(n);
    for (let i = 0; i < n; i++) thick[i] = Math.sqrt(dt[seatIdx[i]] / dmax);

    const count = cols * rows;
    const lit = new Float32Array(count * 4);   // rank-matched: movement V
    const mix = new Float32Array(count * 4);   // shuffled:     movement IV

    // the shuffled deal — stride coprime with n, so the photograph does
    // not simply fold up in rows, and every pile fills its whole shape
    {
      let stride = Math.max(1, Math.floor(n * 0.6180339887));
      while (gcd(stride, n) !== 1) stride++;
      for (let i = 0; i < count; i++) {
        const k = (i * stride) % n;
        mix[i * 4]     = seats[k * 2];
        mix[i * 4 + 1] = seats[k * 2 + 1];
        mix[i * 4 + 2] = thick[k];
        mix[i * 4 + 3] = 1;
      }
    }

    const data = lit;
    if (photoLum) {
      /* Rank-match. Sort the photograph's pixels by brightness, sort the
         bottle's own pixels by brightness, then deal the nth brightest
         pixel to the nth brightest seat. The bottle assembles *lit* — a
         photomosaic of the campaign shot in the shape of the flacon,
         with its highlights and its monogram where they belong. */
      const pOrder = new Uint32Array(count);
      for (let i = 0; i < count; i++) pOrder[i] = i;
      pOrder.sort((a, b) => photoLum[a] - photoLum[b]);

      const sOrder = new Uint32Array(n);
      for (let i = 0; i < n; i++) sOrder[i] = i;
      sOrder.sort((a, b) => seatLum[a] - seatLum[b]);

      // a little jitter inside the rank, so equal-luminance runs do not
      // land in lockstep rows
      for (let r = 0; r < count; r++) {
        const particle = pOrder[r];
        const band = Math.min(n - 1, Math.floor((r / count) * n));
        const wob = Math.min(n - 1, Math.max(0, band + ((r * 2654435761) % 17) - 8));
        const k = sOrder[wob];
        data[particle * 4]     = seats[k * 2];
        data[particle * 4 + 1] = seats[k * 2 + 1];
        data[particle * 4 + 2] = thick[k];
        data[particle * 4 + 3] = 1;
      }
    } else {
      lit.set(mix);                 // nothing to rank-match on
    }
    return { lit, mix };          // plain Float32Arrays; the caller uploads
  }
  function gcd (a, b) { while (b) { const t = b; b = a % b; a = t; } return a; }
  /* ── build, once the images are in ───────────────────────────────── */
  const extent = { photo: [2, 2], five: [2, 2], one: [2, 2] };
  let clusters = new Float32Array(15), clusterScale = 0.98, shapeScale = 2.9;
  let plane = [1.125, 2];
  let camZ = 4.2, camX = 0, camY = 0;
  let aspect = 1;

  function build (photoImg, shapeImg) {
    const iw = photoImg.naturalWidth || photoImg.width;
    const ih = photoImg.naturalHeight || photoImg.height;

    // one particle per pixel, unless the device says otherwise — the cap is
    // about a phone's fill rate, not about the maths
    const cap = opts.maxParticles || (DPR > 1.5 && innerWidth < 700 ? 90000 : 200000);
    const scale = Math.min(1, Math.sqrt(cap / (iw * ih)));
    const cols = Math.max(8, Math.round(iw * scale));
    const rows = Math.max(8, Math.round(ih * scale));
    const count = cols * rows;
    state.cols = cols; state.rows = rows; state.count = count;

    plane = [(iw / ih) * 2.0, 2.0];
    extent.photo = [plane[0], plane[1]];
    extent.one = [shapeScale, shapeScale];

    // the photograph. UNPACK_FLIP_Y stays false so v = 0 is the top row —
    // flipping it is what put the photograph on its head once before.
    photoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, photoTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photoImg);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const photoLum = photoLuminance(photoImg, cols, rows);
    const baked = shapeImg ? bakeShape(shapeImg, cols, rows, photoLum) : null;

    let lit, mix;
    if (baked) { lit = baked.lit; mix = baked.mix; }
    else {
      // no silhouette supplied: a filled disc, so IV and V still read
      lit = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const a = i * 2.39996323, r = Math.sqrt(i / count) * 0.5;
        lit[i * 4] = 0.5 + Math.cos(a) * r;
        lit[i * 4 + 1] = 0.5 + Math.sin(a) * r;
        lit[i * 4 + 2] = Math.sqrt(Math.max(0, 1 - (r / 0.5) ** 2));
        lit[i * 4 + 3] = 1;
      }
      mix = lit;
    }
    shapeTex = floatTexture(cols, rows, lit);
    shapeMixTex = (mix === lit) ? shapeTex : floatTexture(cols, rows, mix);

    // the photograph's own grid as the starting position, so the first
    // frame on screen is the photograph rather than a cloud settling
    const seed = new Float32Array(count * 4);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        seed[i]     = ((x + 0.5) / cols - 0.5) * plane[0];
        seed[i + 1] = (0.5 - (y + 0.5) / rows) * plane[1];
        seed[i + 3] = 1;
      }
    }
    posA = target(cols, rows, seed);
    posB = target(cols, rows, seed);
    velA = target(cols, rows, new Float32Array(count * 4));
    velB = target(cols, rows, new Float32Array(count * 4));

    simProgVel = program(SIM_VERT, VEL_FRAG, 'aPos');
    simProgPos = program(SIM_VERT, POS_FRAG, 'aPos');
    drawProg   = program(DRAW_VERT, DRAW_FRAG, 'aRef');

    // a fullscreen quad for the simulation passes
    quadVAO = gl.createVertexArray();
    gl.bindVertexArray(quadVAO);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // one vertex per particle, carrying only its own (u,v) into the
    // simulation textures
    const refs = new Float32Array(count * 2);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        refs[i * 2]     = (x + 0.5) / cols;
        refs[i * 2 + 1] = (y + 0.5) / rows;
      }
    }
    pointVAO = gl.createVertexArray();
    gl.bindVertexArray(pointVAO);
    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, refs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    state.ready = true;
    resize();
  }

  /* ── layout and camera ───────────────────────────────────────────── */
  function layoutClusters () {
    const portrait = aspect < 0.95;
    const cs = portrait ? 1.12 : 0.98;
    const gap = cs * 1.12;
    clusterScale = cs;
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * gap;
      clusters[i * 3]     = portrait ? 0 : o;
      clusters[i * 3 + 1] = portrait ? -o : 0;
      clusters[i * 3 + 2] = 0;
    }
    const span = gap * 4 + cs;
    extent.five = portrait ? [cs, span] : [span, cs];
  }
  function fitFor (w, h) {
    const t = Math.tan(32 * Math.PI / 360);
    const a = Math.max(0.3, aspect);
    return Math.max(h / 2 / t, w / 2 / (t * a)) * 1.22;
  }
  function fitCamera () {
    const zP = fitFor(extent.photo[0], extent.photo[1]);
    const zF = fitFor(extent.five[0], extent.five[1]);
    const zO = fitFor(extent.one[0], extent.one[1]);
    const k34 = clamp(state.mode - 2, 0, 1);
    const k45 = clamp(state.mode - 3, 0, 1);
    camZ = zP + (zF - zP) * k34 + (zO - zF) * k45;
  }

  function resize () {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 500;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    aspect = w / h;
    layoutClusters();
    fitCamera();
  }
  const ro = ('ResizeObserver' in window) ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas); else addEventListener('resize', resize);

  /* ── pointer ─────────────────────────────────────────────────────── */
  let pointerIn = false;
  function movePointer (clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    // unproject the cursor onto the z = 0 plane, by hand
    const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    const ndcY = -((clientY - r.top) / r.height) * 2 + 1;
    const t = Math.tan(32 * Math.PI / 360);
    state.pointer[0] = camX + ndcX * t * Math.max(0.3, aspect) * camZ;
    state.pointer[1] = camY + ndcY * t * camZ;
    state.pointer[2] = 0;
    pointerIn = true;
  }
  const onMove = e => movePointer(e.clientX, e.clientY);
  const onTouch = e => { if (e.touches[0]) movePointer(e.touches[0].clientX, e.touches[0].clientY); };
  const onDown = () => { state.press = -1; };          // press pulls it back in
  const onUp = () => { state.press = 0; };
  const onLeave = () => { pointerIn = false; };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('touchmove', onTouch, { passive: true });
  canvas.addEventListener('touchstart', e => { onDown(); onTouch(e); }, { passive: true });
  addEventListener('touchend', onUp);
  canvas.style.touchAction = 'pan-y';

  /* ── one simulation pass ─────────────────────────────────────────── */
  function pass (prog, dst, binds, setUniforms) {
    gl.disable(gl.BLEND);          // a simulation pass replaces, never blends
    gl.useProgram(prog.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    binds.forEach(([name, tex], i) => {
      if (prog.u[name] === undefined) return;
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(prog.u[name], i);
    });
    if (setUniforms) setUniforms(prog.u);
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ── frame ───────────────────────────────────────────────────────── */
  let t0 = performance.now(), simTime = 0;

  function step (now) {
    raf = requestAnimationFrame(step);
    if (!state.ready || !visible) { t0 = now; return; }

    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - t0) / 1000));
    t0 = now;
    simTime += dt;

    // the movement eases rather than cuts, and the targets crossfade
    state.mode += (state.modeTarget - state.mode) * Math.min(1, dt * 2.1);
    const wantSillage = (state.mode > 0.5 && state.mode < 1.9)
      ? 1 - Math.abs(state.mode - 1.35) / 0.85 : 0;
    state.sillage += (Math.max(0, wantSillage) - state.sillage) * Math.min(1, dt * 1.8);
    state.pointer[3] = pointerIn ? (state.press < 0 ? -1.15 : 0.85) : 0;

    const common = u => {
      gl.uniform2f(u.uPlane, plane[0], plane[1]);
      gl.uniform1f(u.uMode, state.mode);
      gl.uniform1f(u.uDepth, 1.35);
      gl.uniform3fv(u.uPalette, PALETTE);
      gl.uniform3fv(u.uCluster, clusters);
      gl.uniform1f(u.uClusterScale, clusterScale);
      gl.uniform1f(u.uShapeScale, shapeScale);
    };

    // velocity, then position; ping-pong both
    pass(simProgVel, velB,
      [['uPos', posA.tex], ['uVel', velA.tex], ['uPhoto', photoTex],
       ['uShape', shapeTex], ['uShapeMix', shapeMixTex]],
      u => {
        common(u);
        gl.uniform1f(u.uTime, simTime);
        gl.uniform1f(u.uDt, dt);
        gl.uniform1f(u.uSillage, state.sillage);
        gl.uniform1f(u.uSwirl, still ? 0.12 : state.swirl);
        gl.uniform4fv(u.uPointer, state.pointer);
        gl.uniform1f(u.uPointerR, state.pointerR);
      });
    [velA, velB] = [velB, velA];

    pass(simProgPos, posB, [['uPos', posA.tex], ['uVel', velA.tex]],
      u => gl.uniform1f(u.uDt, dt));
    [posA, posB] = [posB, posA];

    // relief is the one movement that wants a look from the side
    fitCamera();
    const want = (state.mode > 1.6 && state.mode < 2.6) ? 1 : 0;
    camX += ((want ? Math.sin(simTime * 0.33) * 1.5 : 0) - camX) * Math.min(1, dt * 1.4);
    camY += ((want ? Math.sin(simTime * 0.21) * 0.5 : 0) - camY) * Math.min(1, dt * 1.4);

    // draw
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);           // the point cloud, and only it, blends
    gl.useProgram(drawProg.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, posA.tex);
    gl.uniform1i(drawProg.u.uPos, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, photoTex);
    gl.uniform1i(drawProg.u.uPhoto, 1);
    gl.uniformMatrix4fv(drawProg.u.uProj, false, perspective(32, Math.max(0.3, aspect), 0.1, 100));
    gl.uniformMatrix4fv(drawProg.u.uView, false, lookAt(camX, camY, camZ, 0, 0, 0));
    gl.uniform1f(drawProg.u.uSize, opts.pointSize || 0.030);
    gl.uniform1f(drawProg.u.uPixelRatio, DPR * clamp(canvas.clientWidth / 900, 0.7, 1.6));
    gl.uniform1f(drawProg.u.uSillage, state.sillage);
    gl.bindVertexArray(pointVAO);
    gl.drawArrays(gl.POINTS, 0, state.count);
    gl.bindVertexArray(null);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible) t0 = performance.now();
    }, { rootMargin: '140px' }).observe(canvas);
  }

  /* ── load, then go ───────────────────────────────────────────────── */
  const loadOnce = (src, anon) => new Promise(res => {
    const im = new Image();
    if (anon) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  // crossOrigin lets the canvas be read for luminance, but against a server
  // that sends no CORS header it fails the request outright rather than
  // merely tainting — so retry without, and fall back to the shuffled deal
  const load = async src => src
    ? (await loadOnce(src, true)) || (await loadOnce(src, false))
    : null;

  const ready = Promise.all([load(opts.photo), load(opts.shape)]).then(([p, s]) => {
    if (disposed || !p) return null;
    try { build(p, s); } catch (e) { return null; }
    raf = requestAnimationFrame(step);
    return api;
  }).catch(() => null);

  const api = {
    state, MOVEMENTS, ready,
    setMovement (i) { state.modeTarget = clamp(i, 0, MOVEMENTS.length - 1); },
    movement: () => Math.round(state.mode),
    scrub (v) { state.modeTarget = clamp(v, 0, MOVEMENTS.length - 1); },
    setSwirl (v) { state.swirl = v; },
    debug: () => ({ aspect: +aspect.toFixed(3), z: +camZ.toFixed(2),
                    mode: +state.mode.toFixed(2), count: state.count }),
    resize,
    dispose () {
      disposed = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      [posA, posB, velA, velB].forEach(t => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } });
      [photoTex, shapeTex, shapeMixTex].forEach(t => t && gl.deleteTexture(t));
    }
  };
  return api;
}
