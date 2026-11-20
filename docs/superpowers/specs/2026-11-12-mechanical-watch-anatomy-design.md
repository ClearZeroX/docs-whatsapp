# Mechanical watch · isometric explode figure (Anatomy)

Date: 2026-11-12
Status: approved
Deliverable: one self-contained HTML page, `watch-anatomy/index.html`

## What it is

An interactive exploded view of an automatic mechanical watch, built with the
Anatomy skill's isometric kit (SVG solids, four-tone shading, painter's order).
The watch rests dial-up in a movement holder on an inspection stage. Hovering (or
Space, or a tap) takes it apart in the real disassembly order; the balance wheel
keeps swinging at 4 Hz and the second hand steps 8 times a second, so the parts'
motion is the explanation of the movement.

The concept follows Anatomy's rule: the object is the explanation. No arrows, no
labels floating in the air; all words live in the card (Fig, title, hint,
readout) and one tiny engraved plate.

## True numbers

Reference movement: ETA 2824-2 class automatic.

| quantity | value |
|---|---|
| case | 40.0 mm diameter, 10.4 mm high |
| movement | 25.6 mm diameter, 4.6 mm high |
| jewels | 25 |
| frequency | 28,800 vph = 4 Hz = 8 beats/s |
| power reserve | 38 h |
| balance amplitude | 270° (±135°) |
| escape wheel | 15 teeth, 12° per beat |
| display time | 10:10, seconds live |

World units: 1 unit = 0.1 mm. Origin at the watch axis; z = 0 at the stage top.

## Layers and explode (bottom to top)

| id | contents | z (assembled) | explode Δz | order |
|---|---|---|---|---|
| stage | plate, feet, screws, label plate, ruler strip, holder ring | -46..14 | 0 | static |
| caseback | caseback, gasket, engraved ring | 14..26 | 0 | static |
| case | case band, lugs, spring bars, crown, tube, stem | 26..106 | +55 | 4 |
| movement | mainplate, rotor, train, escapement, balance, bridges | 26..74 | +140 | 3 |
| dial | dial plate, 12 indices, minute track, hands (h/m static at 10:10) | 74..82 | +210 | 2 |
| hands | hour, minute, second hands, centre cap | 82..90 | +265 | 1 |
| crystal | bezel, sapphire crystal, gasket | 106..118 | +320 | 0 |

Highest layer leaves first (order 0) so nothing passes through anything.
The caseback stays in the holder: it is the bed of the stack.

Rotor, balance wheel, escape wheel and the second hand spin about the vertical
axis with an exact screen-space affine matrix (the kit's projection is linear):
`M = A · R(θ) · A⁻¹`, `p' = M(p − C) + C`.

## Card

`Fig 1 · Automatic watch · Hover to take it apart`
Readout: assembled `28,800 vph · 8 beats/s · 38 h`; moving `taking apart · 3 of 6`;
settled apart `apart · 6 assemblies`. Legend: lit = balance wheel and hairspring;
raised = the layers that lift. Caption explains the escapement in one sentence.

## Interaction

- pointer enter/leave on the stage, click/tap, Space: explode / close, staggered
  springs (0 for assembled, 1 for apart), one spring per assembly.
- idle tour: assembled, then a slow explode demonstration when untouched.
- `prefers-reduced-motion`: every figure static, one state.
- keyboard: Space toggles; the stage is focusable and exposes
  `aria-valuetext` (`apart · 6 assemblies`).
- theme toggle button (top right) switches `body[data-theme]` between dark and
  light; both palettes ship in the page.

## Files

```
watch-anatomy/
  build.mjs              composes the page, inlines the kit
  kit/                   copied from the installed skill
  scripts/               capture.mjs, drive.mjs, lines.mjs, inline-kit.mjs
  src/model.mjs          dimensions, layers, explode, projection, specs
  src/stage.mjs          inspection stage + holder
  src/case.mjs           caseback, case, crystal assemblies
  src/dial.mjs           dial + hands assemblies
  src/movement.mjs       movement assembly (train, escapement, balance, rotor)
  src/live.mjs           springs, spins, readout, theme toggle
  src/_preview.mjs       renders one module alone with ghost guides, for review
  index.html             the deliverable
```

Module contract: every module exports `parts(P)` returning
`[{ id, body }]`, where `body` is an SVG string in world coordinates and `id`
matches a layer in `model.mjs`.

## Verification

- `node build.mjs` writes `index.html`; `node build.mjs --light` writes
  `index-light.html` for the light theme pass.
- `node scripts/capture.mjs index.html --out shots/page.png` and 390 px + apart
  poses; read every PNG.
- `node scripts/lines.mjs index.html` must report `line ends: 0`.
- kit audit (`--audit`) on the static and apart poses where shapes are recorded;
  any failing pair is fixed in the geometry, never with a key bias.
- truth check: every number in the readout comes from `src/model.mjs`.

## Outcome (2026-11-12)

Built as specified: 7 layers, 6 that lift, ~1,800 SVG paths and ~500 solids across
stage/case/dial/movement, page 831 KB with the kit inlined. `node build.mjs` exits 0;
`lines.mjs` reports `line ends: 0` in both themes; both themes, 390 px, assembled and
apart were captured and read, plus slowed contact sheets of the explode and of the
balance wheel. The theme toggle and the Space key were driven in headless Chrome.

Deviations from the plan, all deliberate:
- The caseback stays in the holder as the bed of the stack, so 6 assemblies lift
  rather than 7 (readout says `apart · 6 assemblies`).
- The second hand is drawn at z 82.4–83.6 and its spin centre is z 83, because a
  spin about the vertical axis is exact only in the plane of its centre; it is
  painted above the hour/minute hands so it reads as the top hand.
- The hands/indices carry a small group-level fill override so they read as steel
  on the paper dial (the dial's minute track uses mid/hi instead of lo/mid).
- No geometry audit: the modules draw SVG directly rather than through the kit's
  shape recorder, so `--audit` has nothing to prove. Verification is visual (both
  themes, 1× and 4×), the line-end check, and the headless-Chrome interactions.
