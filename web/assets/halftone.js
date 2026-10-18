/* ═══════════════════════════════════════════════════════════════════════
   THE PRESS — a photograph printed as four halftone screens, out of
   register, pulled into register, and then handed back to the photograph.

   Everything here is a transition or a loupe. At rest the canvas is
   transparent and the real <img> underneath is what you see, pixel for
   pixel — the product is never shown through this filter except while it
   is moving or while you hold the loupe over it.

   WebGL 1, one fullscreen triangle, no library. Returns null when the
   browser cannot do it, and the page simply keeps its photograph.
   ═══════════════════════════════════════════════════════════════════════ */

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2  uRes;       // canvas, device px
uniform vec2  uCover;     // uv scale that reproduces object-fit: cover
uniform vec2  uFocus;     // object-position, 0..1
uniform float uCell;      // screen pitch, device px
uniform float uReg;       // 0 out of register … 1 in register
uniform float uMix;       // 0 the print … 1 the photograph
uniform vec3  uLoupe;     // x, y (device px, y down), radius
uniform float uLoupeOn;
uniform vec3  uPaper;

vec3 photoAt(vec2 px){
  vec2 uv = px / uRes;
  uv = (uv - uFocus) * uCover + uFocus;
  return texture2D(uTex, clamp(uv, 0.001, 0.999)).rgb;
}

// one screen: rotate into it, find the cell, size the dot by the ink
float screen(vec2 px, float ang, float cell, vec2 off, vec4 pick){
  float s = sin(ang), c = cos(ang);
  vec2 q = px + off;
  vec2 p = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec2 cc = (floor(p / cell) + 0.5) * cell;
  vec2 back = vec2(c * cc.x + s * cc.y, -s * cc.x + c * cc.y) - off;
  vec3 rgb = photoAt(back);
  float k = 1.0 - max(max(rgb.r, rgb.g), rgb.b);
  vec3 cmy = (1.0 - rgb - k) / max(1.0 - k, 0.001);
  float v = dot(vec4(cmy, k), pick);
  float r = sqrt(clamp(v, 0.0, 1.0)) * cell * 0.66;
  float d = length(p - cc);
  return 1.0 - smoothstep(r - 0.9, r + 0.9, d);
}

void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float mis = (1.0 - uReg);

  // the loupe: inside it the print shows through, a little coarser
  float L = uLoupeOn * (1.0 - smoothstep(uLoupe.z * 0.78, uLoupe.z, distance(px, uLoupe.xy)));
  float cell = uCell * (1.0 + L * 0.9);

  float C = screen(px, 0.2618, cell, vec2(-11.0,  5.0) * mis * uCell / 6.0, vec4(1,0,0,0));
  float M = screen(px, 1.3090, cell, vec2(  9.0, -7.0) * mis * uCell / 6.0, vec4(0,1,0,0));
  float Y = screen(px, 0.0,    cell, vec2(  4.0, 11.0) * mis * uCell / 6.0, vec4(0,0,1,0));
  float K = screen(px, 0.7854, cell, vec2(  0.0,  0.0),                    vec4(0,0,0,1));

  // inks overprint on paper, subtractively
  vec3 col = uPaper;
  col *= mix(vec3(1.0), vec3(0.00, 0.60, 0.86), C);
  col *= mix(vec3(1.0), vec3(0.88, 0.12, 0.50), M);
  col *= mix(vec3(1.0), vec3(1.00, 0.88, 0.05), Y);
  col  = mix(col, vec3(0.085, 0.078, 0.07), K);

  float m = clamp(uMix * (1.0 - L), 0.0, 1.0);
  vec3 photo = photoAt(px);
  vec3 outc = mix(col, photo, m);

  // the loupe's rim, drawn like a glass edge
  float rim = uLoupeOn * smoothstep(1.6, 0.0, abs(distance(px, uLoupe.xy) - uLoupe.z));
  outc = mix(outc, vec3(0.95, 0.93, 0.89), rim * 0.85);

  // fully the photograph and nowhere a loupe: let the real <img> show
  float a = 1.0 - step(0.999, m) * (1.0 - step(0.001, uLoupeOn));
  gl_FragColor = vec4(outc, a);
}`;

const ease = t => 1 - Math.pow(1 - t, 4);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createHalftone (canvas, img, opts = {}) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false });
  if (!gl) return null;

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
  for (const n of ['uTex', 'uRes', 'uCover', 'uFocus', 'uCell', 'uReg', 'uMix', 'uLoupe', 'uLoupeOn', 'uPaper']) {
    u[n] = gl.getUniformLocation(prog, n);
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  } catch (e) { return null; }        // a cross-origin image without CORS

  const paper = opts.paper || [0.925, 0.902, 0.859];
  const focus = opts.focus || [0.5, 0.5];
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const st = { reg: 1, mix: 1, cell: 6, lx: 0, ly: 0, lr: 90, loupe: 0, loupeT: 0 };
  let raf = 0, introT0 = 0, intro = false, disposed = false, lastT = 0;

  function resize () {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    kick();
  }

  function draw () {
    const W = canvas.width, H = canvas.height;
    gl.viewport(0, 0, W, H);
    const ia = img.naturalWidth / img.naturalHeight, ca = W / H;
    // object-fit: cover, as uv scale about the focus point
    const cover = ca > ia ? [1, ia / ca] : [ca / ia, 1];
    gl.uniform1i(u.uTex, 0);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform2f(u.uCover, cover[0], cover[1]);
    gl.uniform2f(u.uFocus, focus[0], focus[1]);
    gl.uniform1f(u.uCell, st.cell * DPR);
    gl.uniform1f(u.uReg, st.reg);
    gl.uniform1f(u.uMix, st.mix);
    gl.uniform3f(u.uLoupe, st.lx * DPR, st.ly * DPR, st.lr * DPR);
    gl.uniform1f(u.uLoupeOn, st.loupe);
    gl.uniform3f(u.uPaper, paper[0], paper[1], paper[2]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame (now) {
    raf = 0;
    if (disposed) return;
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    let busy = false;
    if (intro) {
      const t = (now - introT0) / 1000;
      st.reg = ease(clamp((t - 0.25) / 1.5, 0, 1));
      st.cell = 6 + 10 * (1 - ease(clamp(t / 1.9, 0, 1)));
      st.mix = ease(clamp((t - 1.55) / 0.9, 0, 1));
      if (t > 2.5) { intro = false; st.reg = 1; st.cell = 6; st.mix = 1; }
      busy = true;
    }
    // the loupe eases in and out over a fixed time, however slow the frames
    const d = st.loupeT - st.loupe;
    if (Math.abs(d) > 0.02) { st.loupe += d * (1 - Math.exp(-dt * 14)); busy = true; } else st.loupe = st.loupeT;
    draw();
    canvas.style.opacity = (st.mix >= 0.999 && st.loupe <= 0.001) ? '0' : '1';
    if (busy) kick(); else lastT = 0;
    opts.onFrame?.(st);
  }
  function kick () { if (!raf && !disposed) raf = requestAnimationFrame(frame); }

  const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas); else addEventListener('resize', resize);
  resize();

  return {
    state: st,
    /* the press run: out of register, into register, into the photograph */
    print () { st.reg = 0; st.mix = 0; st.cell = 16; intro = true; introT0 = performance.now(); kick(); },
    loupe (x, y, on) { st.lx = x; st.ly = y; st.loupeT = on ? 1 : 0; kick(); },
    get running () { return intro; },
    dispose () { disposed = true; cancelAnimationFrame(raf); ro?.disconnect(); }
  };
}
