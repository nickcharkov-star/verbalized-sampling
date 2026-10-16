/* ═══════════════════════════════════════════════════════════════════════
   PIXEL FIELD — the campaign photograph, taken apart.

   One particle per pixel of the original file. Nothing is sampled down:
   a 270 × 480 photograph becomes 129,600 particles, and the photograph
   you see is those particles sitting still.

   The simulation never touches the CPU. Position and velocity live in two
   pairs of floating-point render targets, ping-ponged each frame by a
   fragment shader; the point cloud's vertex shader reads the position
   texture back out. The only CPU work per frame is setting a handful of
   uniforms, so the particle count costs almost nothing to raise.

   FIVE MOVEMENTS

     I   Frame      every pixel at home. The photograph, held together
                    by a spring per particle.
     II  Sillage    the springs let go. Curl noise carries the image off
                    like scent, and it drifts back when you stop.
     III Relief     each pixel pushed along z by its own luminance, so the
                    flat frame becomes a surface you can look across.
     IV  The Five   every pixel flies to whichever of the five house
                    colours it most resembles — and each of those five
                    piles is a flacon. The photograph sorts itself into
                    the collection it belongs to.
     V   Flacon     all 129,600 reassemble into one bottle.

   The pointer is a force the whole time: it pushes the field away, and
   pressing pulls it back in.
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

export { MOVEMENTS } from './catalogue.js';
import { MOVEMENTS } from './catalogue.js';

/* The house palette, as the sorter sees it. A pixel joins whichever of
   these it is nearest in linear RGB. */
const PALETTE = [
  [0x17 / 255, 0x13 / 255, 0x10 / 255],   // I   Kingdom
  [0x5b / 255, 0x3a / 255, 0x25 / 255],   // II  Sovereign
  [0x2e / 255, 0x5e / 255, 0x8e / 255],   // III Celestial
  [0xe9 / 255, 0xdf / 255, 0xcd / 255],   // IV  Crown
  [0xd9 / 255, 0x73 / 255, 0x2a / 255]    // V   Empire
];

/* ── shared GLSL ──────────────────────────────────────────────────── */

/* Simplex noise (Ashima Arts / Stefan Gustavson, MIT). Curl of this is
   what carries the sillage: divergence-free, so the field swirls instead
   of piling up. */
const NOISE = /* glsl */`
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
}`;

/* Where a particle belongs, per movement. Shared by both simulation
   passes so the spring and the damping agree about the destination. */
const TARGET = /* glsl */`
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
  vec4 shapeTex = texture2D(uShape, ref);
  vec2 shape = shapeTex.xy - 0.5;
  // thickness comes from the baked distance-to-edge, so the pile has the
  // volume of a flacon rather than of a ball
  float thru = (hash12(ref * 97.3) - 0.5) * 2.0 * shapeTex.z;

  if (mode < 0.5) return homePos(ref);                                  // I
  if (mode < 1.5) return homePos(ref);                                  // II (weak spring)
  if (mode < 2.5) return homePos(ref) + vec3(0.0, 0.0, (lum - 0.42) * uDepth);  // III

  if (mode < 3.5){                                                      // IV
    vec4 mixTex = texture2D(uShapeMix, ref);
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
}`;

const SIM_VERT = /* glsl */`
varying vec2 vRef;
void main(){ vRef = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* ── velocity ─────────────────────────────────────────────────────── */
const VEL_FRAG = /* glsl */`
precision highp float;
varying vec2 vRef;
uniform sampler2D uPos, uVel, uPhoto;
uniform float uTime, uDt, uSillage, uSwirl;
uniform vec4  uPointer;      // xyz world, w = press (−1 pull … +1 push)
uniform float uPointerR;
${NOISE}
${TARGET}

void main(){
  vec4 P = texture2D(uPos, vRef);
  vec4 V = texture2D(uVel, vRef);
  vec3 col = texture2D(uPhoto, vRef).rgb;
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
  gl_FragColor = vec4(vel, V.w);
}`;

/* ── position ─────────────────────────────────────────────────────── */
const POS_FRAG = /* glsl */`
precision highp float;
varying vec2 vRef;
uniform sampler2D uPos, uVel;
uniform float uDt;
void main(){
  vec4 P = texture2D(uPos, vRef);
  vec3 V = texture2D(uVel, vRef).xyz;
  gl_FragColor = vec4(P.xyz + V * uDt, P.w);
}`;

/* ── the point cloud ──────────────────────────────────────────────── */
const DRAW_VERT = /* glsl */`
precision highp float;
attribute vec2 aRef;
uniform sampler2D uPos, uPhoto;
uniform float uSize, uPixelRatio, uSillage;
varying vec3 vCol;
varying float vFade;
void main(){
  vec3 p = texture2D(uPos, aRef).xyz;
  vCol = texture2D(uPhoto, aRef).rgb;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // a pixel keeps its size on screen until it travels, then it thins out
  float travel = clamp(abs(p.z) * 0.6 + uSillage * 0.5, 0.0, 1.0);
  vFade = 1.0 - travel * 0.45;
  gl_PointSize = uSize * uPixelRatio * (300.0 / -mv.z) * (1.0 + travel * 0.5);
}`;

const DRAW_FRAG = /* glsl */`
precision highp float;
varying vec3 vCol;
varying float vFade;
void main(){
  // round, with a soft shoulder — square points read as a glitch, not a grain
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.18, length(d));
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a * vFade);
}`;

/* ═══════════════════════════════════════════════════════════════════ */
export function createPixelField (canvas, opts = {}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(devicePixelRatio || 1, 2);

  // Probe before constructing: a WebGLRenderer without WebGL throws *and*
  // logs its own console error, on a path meant to degrade quietly.
  const probe = document.createElement('canvas');
  const gl2 = probe.getContext('webgl2');
  if (!gl2) return null;
  // float render targets are what the whole simulation lives in
  if (!gl2.getExtension('EXT_color_buffer_float')) return null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 6.4);

  /* ── the simulation's own little scene ──────────────────────────── */
  const simScene = new THREE.Scene();
  const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  simScene.add(simQuad);

  const state = {
    mode: 0, modeTarget: 0, sillage: 0, swirl: 1,
    pointer: new THREE.Vector4(0, 0, 0, 0), pointerR: 0.9,
    press: 0, ready: false, cols: 0, rows: 0, count: 0
  };

  let posA, posB, velA, velB, velMat, posMat, points, drawMat;
  let clusterUniform = null, clusterScaleU = null;
  let photoTex = null, shapeTex = null, shapeMixTex = null;
  let raf = 0, visible = true, disposed = false;

  const rtOpts = {
    type: THREE.FloatType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false
  };
  const makeRT = (w, h) => new THREE.WebGLRenderTarget(w, h, rtOpts);

  function seedTexture (cols, rows, plane) {
    // The photograph's own grid, as the starting position — so the first
    // frame on screen is the photograph, not a cloud settling into one.
    const data = new Float32Array(cols * rows * 4);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        data[i]     = ((x + 0.5) / cols - 0.5) * plane.x;
        data[i + 1] = (0.5 - (y + 0.5) / rows) * plane.y;
        data[i + 2] = 0;
        data[i + 3] = 1;
      }
    }
    const t = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat, THREE.FloatType);
    t.needsUpdate = true;
    return t;
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
    const mk = arr => {
      const t = new THREE.DataTexture(arr, cols, rows, THREE.RGBAFormat, THREE.FloatType);
      t.needsUpdate = true;
      return t;
    };
    return { lit: mk(lit), mix: mk(mix) };
  }
  function gcd (a, b) { while (b) { const t = b; b = a % b; a = t; } return a; }

  /* ── build, once both images are in ─────────────────────────────── */
  function build (photoImg, shapeImg) {
    const iw = photoImg.naturalWidth || photoImg.width;
    const ih = photoImg.naturalHeight || photoImg.height;

    // One particle per pixel, unless the device says otherwise. The cap is
    // about keeping a phone's fill rate sane, not about the maths.
    const cap = opts.maxParticles || (DPR > 1.5 && innerWidth < 700 ? 90000 : 200000);
    let scale = Math.min(1, Math.sqrt(cap / (iw * ih)));
    const cols = Math.max(8, Math.round(iw * scale));
    const rows = Math.max(8, Math.round(ih * scale));
    const count = cols * rows;
    state.cols = cols; state.rows = rows; state.count = count;

    const aspect = iw / ih;
    const plane = new THREE.Vector2(aspect * 2.0, 2.0);

    photoTex = new THREE.Texture(photoImg);
    photoTex.flipY = false;          // v = 0 is the photograph's top row
    photoTex.colorSpace = THREE.SRGBColorSpace;
    photoTex.minFilter = photoTex.magFilter = THREE.LinearFilter;
    photoTex.generateMipmaps = false;
    photoTex.needsUpdate = true;

    const photoLum = photoLuminance(photoImg, cols, rows);
    const baked = shapeImg ? bakeShape(shapeImg, cols, rows, photoLum) : null;
    shapeTex = baked ? baked.lit : null;
    shapeMixTex = baked ? baked.mix : null;
    if (!shapeTex) {
      // No silhouette: fall back to a disc so movements IV and V still work.
      const d = new Float32Array(cols * rows * 4);
      for (let i = 0; i < cols * rows; i++) {
        const a = i * 2.39996323, r = Math.sqrt(i / (cols * rows)) * 0.5;
        d[i * 4] = 0.5 + Math.cos(a) * r;
        d[i * 4 + 1] = 0.5 + Math.sin(a) * r;
        d[i * 4 + 2] = Math.sqrt(1 - Math.min(1, (r / 0.5) ** 2));
        d[i * 4 + 3] = 1;
      }
      shapeTex = new THREE.DataTexture(d, cols, rows, THREE.RGBAFormat, THREE.FloatType);
      shapeTex.needsUpdate = true;
      shapeMixTex = shapeTex;
    }

    posA = makeRT(cols, rows); posB = makeRT(cols, rows);
    velA = makeRT(cols, rows); velB = makeRT(cols, rows);

    const seed = seedTexture(cols, rows, plane);
    const blit = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: seed } },
      vertexShader: SIM_VERT,
      fragmentShader: 'precision highp float; varying vec2 vRef; uniform sampler2D uTex;' +
                      'void main(){ gl_FragColor = texture2D(uTex, vRef); }'
    });
    simQuad.material = blit;
    for (const rt of [posA, posB]) { renderer.setRenderTarget(rt); renderer.render(simScene, simCam); }
    blit.uniforms.uTex.value = new THREE.DataTexture(
      new Float32Array(cols * rows * 4), cols, rows, THREE.RGBAFormat, THREE.FloatType);
    blit.uniforms.uTex.value.needsUpdate = true;
    for (const rt of [velA, velB]) { renderer.setRenderTarget(rt); renderer.render(simScene, simCam); }
    renderer.setRenderTarget(null);
    seed.dispose(); blit.dispose();

    const common = {
      uPlane: { value: plane },
      uMode: { value: 0 },
      uDepth: { value: 1.35 },
      uPalette: { value: PALETTE.map(c => new THREE.Vector3(...c)) },
      uCluster: { value: [-2.08, -1.04, 0, 1.04, 2.08].map(x => new THREE.Vector3(x, 0, 0)) },
      uClusterScale: { value: 0.98 },
      uShape: { value: shapeTex },
      uShapeMix: { value: shapeMixTex },
      uShapeScale: { value: 2.9 }
    };

    clusterUniform = common.uCluster.value;
    clusterScaleU  = common.uClusterScale;
    extent.photo = [plane.x, plane.y];
    extent.one   = [common.uShapeScale.value, common.uShapeScale.value];
    layoutClusters();

    velMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({
        uPos: { value: null }, uVel: { value: null }, uPhoto: { value: photoTex },
        uTime: { value: 0 }, uDt: { value: 0.016 },
        uSillage: { value: 0 }, uSwirl: { value: 1 },
        uPointer: { value: state.pointer }, uPointerR: { value: state.pointerR }
      }, common),
      vertexShader: SIM_VERT, fragmentShader: VEL_FRAG
    });

    posMat = new THREE.ShaderMaterial({
      uniforms: { uPos: { value: null }, uVel: { value: null }, uDt: { value: 0.016 } },
      vertexShader: SIM_VERT, fragmentShader: POS_FRAG
    });

    const refs = new Float32Array(count * 2);
    const verts = new Float32Array(count * 3);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        refs[i * 2]     = (x + 0.5) / cols;
        refs[i * 2 + 1] = (y + 0.5) / rows;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 14);

    drawMat = new THREE.ShaderMaterial({
      uniforms: {
        uPos: { value: posA.texture }, uPhoto: { value: photoTex },
        uSize: { value: opts.pointSize || 0.030 },
        uPixelRatio: { value: DPR }, uSillage: { value: 0 }
      },
      vertexShader: DRAW_VERT, fragmentShader: DRAW_FRAG,
      transparent: true, depthWrite: false, depthTest: true
    });

    points = new THREE.Points(geo, drawMat);
    points.frustumCulled = false;
    scene.add(points);

    state.ready = true;
    resize();
  }

  /* ── pointer ──────────────────────────────────────────────────── */
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  let pointerIn = false;

  function movePointer (clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane0, hit)) {
      state.pointer.set(hit.x, hit.y, 0, state.pointer.w);
      pointerIn = true;
    }
  }
  const onMove = e => movePointer(e.clientX, e.clientY);
  const onTouch = e => { if (e.touches[0]) movePointer(e.touches[0].clientX, e.touches[0].clientY); };
  const onDown = () => { state.press = -1; };          // press pulls it back in
  const onUp   = () => { state.press = 0; };
  const onLeave = () => { pointerIn = false; };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('touchmove', onTouch, { passive: true });
  canvas.addEventListener('touchstart', e => { onDown(); onTouch(e); }, { passive: true });
  addEventListener('touchend', onUp);
  canvas.style.touchAction = 'pan-y';

  /* ── size ─────────────────────────────────────────────────────── */
  function resize () {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    layoutClusters();
    fitCamera();
    if (drawMat) drawMat.uniforms.uPixelRatio.value = DPR * Math.min(1.6, Math.max(0.7, w / 900));
  }
  /* Five piles in a row is the wrong shape for a phone — each ends up the
     size of a thumbnail. On a portrait canvas they stack instead, and the
     camera fits whichever arrangement is in use. */
  function layoutClusters () {
    if (!clusterUniform) return;
    const portrait = camera.aspect < 0.95;
    const cs = portrait ? 1.12 : 0.98;
    const gap = cs * 1.12;
    clusterScaleU.value = cs;
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * gap;
      clusterUniform[i].set(portrait ? 0 : o, portrait ? -o : 0, 0);
    }
    const span = gap * 4 + cs;
    extent.five = portrait ? [cs, span] : [span, cs];
  }

  // How far back the camera has to stand is a question with an answer:
  // fit the movement's own bounding box. Magic constants here clipped the
  // five piles off the sides of a phone.
  let camZ = 4.2;
  const extent = { photo: [2, 2], five: [2, 2], one: [2, 2] };
  function fitFor (w, h) {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const a = Math.max(0.3, camera.aspect);
    return Math.max(h / 2 / t, w / 2 / (t * a)) * 1.22;   // a little air
  }
  function fitCamera () {
    const zPhoto = fitFor(extent.photo[0], extent.photo[1]);
    const zFive  = fitFor(extent.five[0],  extent.five[1]);
    const zOne   = fitFor(extent.one[0],   extent.one[1]);
    // keyed to the movement indices, so the dolly has arrived by the time
    // the movement has: IV is mode 3, not mode 3.2.
    const m = state.mode;
    const k34 = Math.max(0, Math.min(1, m - 2));   // III → IV
    const k45 = Math.max(0, Math.min(1, m - 3));   // IV  → V
    camZ = zPhoto + (zFive - zPhoto) * k34 + (zOne - zFive) * k45;
  }
  const ro = ('ResizeObserver' in window) ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas); else addEventListener('resize', resize);

  /* ── frame ────────────────────────────────────────────────────── */
  let t0 = performance.now(), simTime = 0;

  function step (now) {
    raf = requestAnimationFrame(step);
    if (!state.ready || !visible) { t0 = now; return; }

    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - t0) / 1000));
    t0 = now;
    simTime += dt;

    // the movement eases rather than cuts, and the targets crossfade
    state.mode += (state.modeTarget - state.mode) * Math.min(1, dt * 2.1);
    // sillage is how slack the springs are; movement II is its home
    const wantSillage = (state.mode > 0.5 && state.mode < 1.9)
      ? 1 - Math.abs(state.mode - 1.35) / 0.85 : 0;
    state.sillage += (Math.max(0, wantSillage) - state.sillage) * Math.min(1, dt * 1.8);

    state.pointer.w = pointerIn ? (state.press < 0 ? -1.15 : 0.85) : 0;

    const u = velMat.uniforms;
    u.uTime.value = simTime;
    u.uDt.value = dt;
    u.uMode.value = state.mode;
    u.uSillage.value = state.sillage;
    u.uSwirl.value = still ? 0.12 : state.swirl;
    u.uPointerR.value = state.pointerR;

    // velocity, then position; ping-pong both
    u.uPos.value = posA.texture; u.uVel.value = velA.texture;
    simQuad.material = velMat;
    renderer.setRenderTarget(velB); renderer.render(simScene, simCam);
    [velA, velB] = [velB, velA];

    posMat.uniforms.uPos.value = posA.texture;
    posMat.uniforms.uVel.value = velA.texture;
    posMat.uniforms.uDt.value = dt;
    simQuad.material = posMat;
    renderer.setRenderTarget(posB); renderer.render(simScene, simCam);
    [posA, posB] = [posB, posA];

    renderer.setRenderTarget(null);
    drawMat.uniforms.uPos.value = posA.texture;
    drawMat.uniforms.uSillage.value = state.sillage;

    // relief is the one movement that wants a look from the side
    fitCamera();
    const want = (state.mode > 1.6 && state.mode < 2.6) ? 1 : 0;
    camera.position.x += ((want ? Math.sin(simTime * 0.33) * 1.5 : 0) - camera.position.x) * Math.min(1, dt * 1.4);
    camera.position.y += ((want ? Math.sin(simTime * 0.21) * 0.5 : 0) - camera.position.y) * Math.min(1, dt * 1.4);
    camera.position.z += (camZ - camera.position.z) * Math.min(1, dt * 2.6);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible) t0 = performance.now();
    }, { rootMargin: '140px' }).observe(canvas);
  }

  /* ── load, then go ────────────────────────────────────────────── */
  /* Load once with crossOrigin set — that is what lets the canvas be read
     for luminance — and, if the server sends no CORS header, the request
     fails outright rather than merely tainting. So retry without it: the
     reads are already wrapped, and a shuffled deal is better than no
     photograph at all. */
  const loadOnce = (src, anon) => new Promise(res => {
    const im = new Image();
    if (anon) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  const load = async src => {
    if (!src) return null;
    return (await loadOnce(src, true)) || (await loadOnce(src, false));
  };

  const ready = Promise.all([load(opts.photo), load(opts.shape)]).then(([p, s]) => {
    if (disposed) return null;
    if (!p) return null;
    build(p, s);
    raf = requestAnimationFrame(step);
    return api;
  });

  const api = {
    state, MOVEMENTS, ready,
    setMovement (i) { state.modeTarget = Math.max(0, Math.min(MOVEMENTS.length - 1, i)); },
    movement: () => Math.round(state.mode),
    debug: () => ({ aspect: +camera.aspect.toFixed(3), z: +camera.position.z.toFixed(2),
                    camZ: +camZ.toFixed(2), mode: +state.mode.toFixed(2),
                    extent: JSON.parse(JSON.stringify(extent)) }),
    scrub (v) { state.modeTarget = Math.max(0, Math.min(MOVEMENTS.length - 1, v)); },
    setSwirl (v) { state.swirl = v; },
    resize,
    dispose () {
      disposed = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      [posA, posB, velA, velB].forEach(rt => rt && rt.dispose());
      photoTex && photoTex.dispose();
      shapeTex && shapeTex.dispose();
      shapeMixTex && shapeMixTex !== shapeTex && shapeMixTex.dispose();
      renderer.dispose();
    }
  };
  return api;
}
