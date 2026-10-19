---
name: pixel-field
description: Turn a photograph into an interactive GPU particle field — one particle per pixel, simulated in ping-pong float textures, with scroll- or pointer-driven movements between arrangements (the photo, a diffused cloud, a luminance relief, colour-sorted piles, a silhouette). Use when asked to "break an image down to pixels", build a particle/dissolve/reform effect from a photo, make an image interactive or scroll-driven, or produce a hero that reassembles into a product shape. Covers the WebGL2 float-target setup, curl-noise advection, silhouette baking with a distance transform, and the specific bugs that eat a day.
---

# Pixel field

Decompose a photograph into one particle per pixel and move them. A 270×480
image is 129,600 particles; a 1024×1024 is a million. Either runs at 60fps,
because **the simulation never touches the CPU**.

## The shape of it

Four float render targets, two ping-pong pairs:

```
positionA ⇄ positionB      RGBA32F, size = particle grid
velocityA ⇄ velocityB
```

Per frame, two fullscreen-quad passes:

1. **velocity** ← reads position + velocity + the photo, writes new velocity
2. **position** ← reads position + the new velocity, writes new position

Then one `THREE.Points` draw whose **vertex shader reads the position
texture**. Each vertex carries only an `aRef` attribute — its own `(u,v)` into
the simulation textures. Nothing else is per-particle on the CPU, so raising
the particle count costs a bigger texture and nothing else.

```glsl
// draw vertex shader
attribute vec2 aRef;
uniform sampler2D uPos, uPhoto;
void main(){
  vec3 p = texture2D(uPos, aRef).xyz;
  vCol   = texture2D(uPhoto, aRef).rgb;     // the pixel keeps its colour
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
```

## Movements

Give every particle a **target** that depends on a `uMode` uniform, and a
spring that pulls it there. Crossfade between integer modes so scrubbing is
continuous:

```glsl
vec3 blendTarget(vec2 ref, vec3 col, float lum){
  float lo = floor(uMode), hi = min(lo + 1.0, LAST);
  float k  = smoothstep(0.0, 1.0, uMode - lo);
  return mix(targetFor(lo, ref, col, lum), targetFor(hi, ref, col, lum), k);
}
```

Useful targets:

| Movement | Target |
|---|---|
| the photograph | `((ref - 0.5) * plane)` — the pixel's own grid position |
| relief | the same, plus `z = (luminance - mean) * depth` |
| diffusion | no target; slacken the spring and advect on curl noise |
| colour sort | nearest of N palette colours → that pile's centre + an offset |
| silhouette | a baked seat inside a shape (see below) |

**Slacken the spring, don't switch it off.** A diffusion movement with
`stiffness = 0` never comes home; `stiffness = 16 → 1.1` drifts away and
finds its way back when the noise lets go.

**Curl noise, not plain noise.** `curl(snoise)` is divergence-free, so the
field swirls instead of piling particles into the noise's troughs.

## Baking a silhouette

Cut the shape out of the photograph itself where you can — a silhouette
traced from the real subject is the real subject, and a drawn stand-in is a
drawn stand-in however good it looks. See the `photo-cutout` skill.

To reassemble into a shape, bake one seat per particle from a PNG's alpha:

1. Draw the PNG to a 256×256 canvas, read `getImageData`.
2. Collect every pixel over an alpha threshold as a seat.
3. **Centre and normalise on the seats' bounding box**, so the shape sits in
   the middle whatever the source render did.
4. Deal particle `i` to seat `(i * stride) % n`, with `stride` coprime to `n`
   — a deterministic shuffle, so the shape assembles identically every time
   and the photograph does not simply fold up in rows.
5. Store `(u, v, thickness)` in an RGBA float `DataTexture`.

For **thickness**, run a two-pass chamfer distance transform over the mask and
store `sqrt(distance / maxDistance)`. Then scatter particles through the
volume with `z = (hash(ref) - 0.5) * 2.0 * thickness`.

## On paper: dots, not glow

On a dark page the points glow; on a light page they should print. Draw
each particle with normal alpha blending over a transparent clear (the
page's paper shows through), coloured by its pixel, and **sized by the ink
it would carry**:

```glsl
float ink = 1.0 - dot(vCol, vec3(0.299, 0.587, 0.114));
gl_PointSize = base * mix(1.0, 0.28 + 1.2 * sqrt(ink), uPaper);
```

Dark pixels print large, light ones barely mark the sheet — that is what a
halftone is, and the photograph reads as a print at rest.

## End on the real thing, not a silhouette

Reassembling the particles into a product *silhouette* gives a shape in
the wrong colours — the lineup's browns poured into a blue bottle's
outline. A user who launched that bottle reads it as a mock-up. Give the
last movement a **second photograph** instead: each particle's target is
its own (u, v) placed in the second frame, and its colour crossfades to
the second photograph sampled at the same (u, v).

```glsl
if (uSecond > 0.5) return vec3((ref.x - 0.5) * uPlane2.x, (0.5 - ref.y) * uPlane2.y, 0.0);
// draw: vCol = mix(texture(uPhoto, aRef).rgb, texture(uPhoto2, aRef).rgb, uMorph);
```

The particles that were the lineup become the product's own catalogue
photograph — the real bottle, made of the same dots.

## Six bugs that cost real time

1. **The image renders upside down.** `THREE.Texture.flipY` defaults to
   `true`, so `v = 0` is the *bottom* row. A particle grid that puts `v = 0`
   at the top inverts the photo. Set `photoTex.flipY = false`.

2. **Thickness from distance-to-centre gives a sphere.** `sqrt(1 - r²)` where
   `r` is distance from the silhouette's centre domes everything into a ball
   and welds a bottle's cap to its body. Thickness must come from distance to
   the *edge* — hence the distance transform.

3. **The alpha threshold eats the drop shadow.** A render with a soft shadow
   has a wide skirt of low alpha. `> 110` rounds the silhouette into a blob;
   `> 198` is the object. Check the mask as an image before blaming the
   shader.

4. **Camera blend ranges that don't line up with the movements.** If movement
   IV is `mode === 3` but the dolly interpolates over `2.1 → 3.5`, the camera
   is only 82% of the way back when the movement arrives and the content is
   clipped. Key the dolly to the integers: `clamp(mode - 2, 0, 1)`.

5. **Magic camera distances clip on the next aspect ratio.** Compute it:
   `z = max(h/2/tan(fov/2), w/2/(tan(fov/2)*aspect)) * margin`, with `w,h`
   the bounding box of the movement being shown.

6. **A `let` used by a ResizeObserver callback declared below it.**
   `new ResizeObserver(resize)` fires *synchronously* on `observe()`. If
   `resize()` touches a `let` declared further down the function body, it
   throws a temporal-dead-zone `ReferenceError` and the whole module dies
   silently. Declare shared state before anything that observes.

## Write it against WebGL 2, not a 3D library

three.js gives you a renderer, render targets, shader programs, a point cloud
and a perspective matrix — about five percent of its surface, for ~690 KB.
The simulation is raw GLSL either way; only the plumbing is borrowed, and the
plumbing is a few hundred lines: compile and link, two ping-pong framebuffer
pairs of `RGBA32F`, a fullscreen-quad VAO, a points VAO carrying one `vec2`
per particle, and `perspective()` / `lookAt()`. Dropping the library took one
page from 1456 KB to 559 KB.

Two things bite in the port:

- **Blending must be off for the simulation passes.** Leave it on and each
  new velocity is blended against the old one using the velocity's own alpha
  — which is zero — so every write is discarded and nothing moves. three.js
  toggles it per material, so this only shows up once you own the state.
  `gl.disable(BLEND)` in the sim pass, `gl.enable(BLEND)` before the points.
- **Bind attribute locations before linking.** `gl.bindAttribLocation(p, 0,
  'aRef')`. With one attribute per program you will usually get 0 anyway,
  and "usually" is the problem.

## Never import the heavy thing statically

If the page's module imports the field at the top:

```js
import { createPixelField } from './pixelfield.js';
```

then one failed request for three.js takes down **the entire module** — every
list the script builds, every reveal it wires, every handler it attaches —
and the browser reports only a network error. The page renders as a husk with
no explanation.

Put the data in its own dependency-free module, import *that* statically, and
load the heavy parts dynamically after the page already reads:

```js
import { CATALOGUE } from './catalogue.js';   // depends on nothing
let field = null;
(async () => {
  try {
    const { createPixelField } = await import('./pixelfield.js');
    field = createPixelField(canvas, opts);
    if (!field) say('this browser cannot run it');
  } catch (e) { say('it could not be loaded'); }
})();
```

Then test it: block the dependency with
`page.route('**/pixelfield.js', r => r.abort())` and assert the content is
all still there. A page that silently loses
everything looks identical to a page that never loaded.

## Capability check, and degrading

Probe before constructing — `new THREE.WebGLRenderer()` without WebGL throws
*and* logs its own console error, which is a red line on a path meant to
degrade quietly:

```js
const probe = document.createElement('canvas');
const gl = probe.getContext('webgl2');
if (!gl) return null;
if (!gl.getExtension('EXT_color_buffer_float')) return null;   // the sim lives here
```

Return `null` and let the caller show a line of text. Everything else on the
page should read the same without it.

## Driving it from scroll without a library

Make the section tall and the stage `position: sticky`. Scroll position
through the section **is** the movement index — no pin, no ScrollTrigger, and
it works with no animation library at all:

```js
const r = section.getBoundingClientRect();
const p = clamp((-r.top) / (section.offsetHeight - innerHeight), 0, 1);
field.scrub(p * (MOVEMENTS.length - 1));
```

Have the movement buttons **scroll** to their position rather than setting the
mode directly, so scroll stays the single source of truth.

## Layout, not just scale

Five piles in a row is the wrong shape for a phone — each ends up a
thumbnail. Re-lay-out on aspect (`camera.aspect < 0.95` → stack vertically)
and let the camera fit whichever arrangement is in use.

## Reference implementation

`web/assets/pixelfield.js` in this repository: five movements, pointer push
and press-to-pull, aspect-aware layout, paper mode, the second-photograph
finale, and the silhouette bake with the distance transform as a fallback.

## Testing it

**Software GL converges slowly.** Under SwiftShader a 200k-particle field
runs at a few frames a second and `dt` is clamped, so simulated time crawls:
a movement that settles in two seconds on a GPU still looks torn after
seven seconds of wall clock. Before calling a frame broken, wait 20 s or
jump the mode, and compare again.


Screenshots of a particle system are the only way to see it. Snap each
movement from a bench page with a `__jump(i)` hook that sets the mode without
easing, wait for the springs to settle (~3s), and look at the image. Check
separately with WebGL disabled by overriding `HTMLCanvasElement.prototype.
getContext` in an init script — the fallback path is the one nobody tests.
