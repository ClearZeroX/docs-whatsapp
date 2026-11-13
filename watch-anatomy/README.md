# Automatic watch — an Anatomy exploded figure

One self-contained page: `index.html`. No dependencies, no network, no build step
needed to view it — open the file in a browser.

## What it is

An automatic mechanical watch (40 mm, ETA 2824-2 class movement) resting dial-up in
a movement holder on an inspection stage, drawn in the Anatomy house style with the
isometric kit: solid parts in four-tone shading, painter's order, a framed card with
Fig, title, hint and live readout.

Hover the figure (or press Space, or tap) and it comes apart in the real
disassembly order — bezel and crystal, hands, dial, movement, case, crown — each
layer on its own staggered spring. The balance wheel keeps swinging at 4 Hz, the
15-tooth escape wheel steps 12° on every beat and the second hand steps 8 times a
second, so the parts' motion *is* the explanation. The top-right button switches
between the light and dark palettes; `prefers-reduced-motion` freezes everything.

## True numbers (single source: `src/model.mjs`)

| quantity | value |
|---|---|
| case | 40.0 mm across, 10.4 mm high |
| movement | 25.6 mm across, 4.6 mm high, 25 jewels |
| frequency | 28,800 vph = 4 Hz = 8 beats/s |
| balance amplitude | 270° |
| escape wheel | 15 teeth, 12° per beat |
| power reserve | 38 h |
| display time | 10:10, seconds live |

World units: 1 unit = 0.1 mm. The readout, the spins and the caption all read from
`src/model.mjs`.

## Controls

- hover the stage / tap / Space: take it apart, again to close it up
- `Esc`: close
- top-right button: light / dark
- idle for a few seconds: the figure demonstrates the explode on its own
- `index.html#apart`: opens already apart (handy for screenshots)

## Rebuild

```sh
node build.mjs            # writes index.html (dark default, toggle switches theme)
node build.mjs --light    # writes index-light.html (light-first copy)
```

The kit lives in `kit/` (copied from the installed Anatomy skill); `scripts/` holds
the kit inliner and the headless-Chrome checks. Fonts and CSS are inlined, so the
page has no external requests at all.

## Files

```
build.mjs          composes the page, inlines kit + live script
src/model.mjs      dimensions, layers, explode, projection, spins, readout
src/stage.mjs      inspection stage: plate, feet, index ring, holder, label plate, ruler
src/case.mjs       caseback, case band + lugs + tube, crown + stem, bezel + glass crystal
src/dial.mjs       dial (track, 12 applied indices, engraving) + hands at 10:10
src/movement.mjs   mainplate, rotor, barrel + mainspring, going train, escapement,
                   bridges, balance wheel + hairspring (the only lit part)
src/live.mjs       staggered explode springs, spins, readout, theme toggle, a11y
src/_preview.mjs   render one module alone on the figure camera, with ghost guides
shot.mjs           quick headless-Chrome screenshot (no CDP)
```

## Verification used

```sh
node build.mjs                                              # exit 0
node scripts/capture.mjs index.html --out shots/page.png     # read the PNG
node scripts/lines.mjs index.html --out shots/lines.png      # "line ends: 0", exit 0
node scripts/lines.mjs index-light.html                      # "line ends: 0", exit 0
node src/_preview.mjs movement && node shot.mjs preview/movement.html shots/m.png
```

Checked at 1× in both themes, at 390 px wide, assembled and apart, with a slowed
contact sheet of the explode and of the balance wheel; the theme toggle and Space
were driven in headless Chrome. Note: in this sandbox the Chrome checks need
`TMPDIR=$PWD/.tmp` and a `--no-sandbox` flag (already patched into `scripts/`).

Known weak spots: the lugs are bevel-plateau prisms rather than smoothly blended
horns; the crown tube joint is ~3 px at 1×; the hairspring reads only at 4×; the
movement's lower-left plate is the quietest area; the figure leaves air above the
assembled watch because the card reserves the room the explode needs.
