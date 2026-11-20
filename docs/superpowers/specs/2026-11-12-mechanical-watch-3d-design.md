# Mechanical watch · real 3D teardown (Three.js)

Date: 2026-11-12
Status: delivered
Deliverable: `watch-3d/index.html` — one self-contained HTML page (≈900 KB, no
external requests)

## Why this exists

The first deliverable (`watch-anatomy/`) was an Anatomy isometric *SVG* figure.
That is a fixed-camera drawing, not a rotatable 3D model: the user asked for a
real 3D teardown with a one-click explode/assemble and a parts list. This spec is
the second attempt: a genuine Three.js scene, adapted from the architecture of the
user's earlier `dji-action4-3d` project.

## Product

An automatic watch ("Calibre 2824"): 40 mm case, 25.6 mm movement, 28,800 vph.
Procedural geometry only — no model files, no textures on disk (every texture is
drawn on a canvas at runtime). 19 registered parts, each its own `THREE.Group`:

crystal · bezel · second hand · minute hand · hour hand · indices · dial · case &
lugs · caseback · crown & stem · bridges · balance & hairspring · escape wheel ·
pallet fork · going train · barrel & mainspring · ratchet & crown wheel ·
mainplate · rotor.

Assembled the watch floats over a dark instrument stage (floor rings, bloom,
particles). Interactions:

- orbit / dolly / pan (OrbitControls); raycast hover shows a tooltip, click
  selects a part and opens its specification panel;
- **拆解整机 / 一键组装** button (E) explodes all 19 parts on staggered eased
  moves and pulls the camera back; the progress meter reads 0–100 %;
- parts list (left) and specification panel (right); label leaders with the
  per-part category; auto-rotate and label toggles; reset view (R); Esc deselects;
- intro overlay, loading screen, WebGL failure message, mobile drawers.

Living motion comes from `js/model.js` `update(t)`: the balance swings at 4 Hz
(±135°), the second hand steps 8×/s (0.75°/beat), the escape wheel steps 12° per
beat, the rotor swings slowly, third/fourth wheels creep at their real rates.

## Architecture

```
src/page.html          markup + copy (dev; <script src>)
css/style.css          HUD, panels, intro, mobile (from the DJI project)
vendor/three/          three r147 UMD + OrbitControls, RoundedBox, Bloom passes
js/data.js             DEVICE + 19 PARTS: ids, names, explode vectors, anchors,
                       summaries, descriptions, specs, design notes
js/model-mats.js       shared materials + lathe / ring / gear / disc helpers
js/model-exterior.js   10 exterior parts  (50,494 tris)
js/model-movement.js   9 movement parts   (76,910 tris)
js/model.js            registry: builds parts from data + modules, spin contract
js/app.js              scene, camera, controls, post, interaction, panels,
                       explode animation (adapted from dji-action4-3d/js/app.js)
build.mjs              inlines CSS + vendor + js into index.html
```

Contract: each module returns `{ partId: THREE.Group }`; `data.js` supplies the
explode vector in watch units (1 unit = 10 mm); the app lerps
`group.position = base + explode·k` with a per-part stagger, and spins only
children named `spin` with `userData.spinKind` (`balance`, `second`, `escape`,
`rotor`, `trainThird`, `trainFourth`).

## Verification

- `node build.mjs` → index.html 904 KB, 15 scripts inlined, ~0.05 s.
- Node contract checks by the builders: 9/9 movement groups, bbox inside the
  case, no NaN vertices, spin axes correct; 10/10 exterior groups.
- Headless Chrome (WebGL software) driven through all states: intro, assembled,
  explode 100 %, hover tooltip, part selection + spec panel, assemble back,
  reset, mobile 390×844. Console clean in every run, FPS 57–60 desktop.
- Screenshots in `shots/` read every iteration.

## Known weak points

- The lug horns read a little "paddle-like" at 1×; the spring bars are visible
  from behind when nothing is attached (correct, but stylised).
- The caseback's engraved underside is dark under the current key light; it reads
  best in the exploded view or when orbited.
- The rotor sits under the mainplate, so it is only readable in the exploded
  state or from below.
- The dial's minute track is faint at 1×; the dial rewards a closer camera.
- The loading screen in a *background* headless tab is timer-throttled; drive the
  page with `#nointro` or hide `#loader` for screenshots.
