import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import { kitScript } from "./scripts/inline-kit.mjs";
import * as model from "./src/model.mjs";
import * as stage from "./src/stage.mjs";
import * as caseParts from "./src/case.mjs";
import * as dial from "./src/dial.mjs";
import * as movement from "./src/movement.mjs";
import { live } from "./src/live.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const P = model.projection();

const bodies = new Map();
for (const module of [stage, caseParts, dial, movement]) {
  for (const part of module.parts(P)) bodies.set(part.id, part.body);
}

const body = model.LAYERS.map((layer) => `<g data-part="${layer.id}">${bodies.get(layer.id) ?? ""}</g>`).join("");

const svg = k.figureSvg({
  width: model.CARD.width,
  height: model.CARD.height,
  label:
    "An automatic mechanical watch on an inspection stage, taken apart into its layers: bezel and crystal, hands, dial, movement with its wheel train, escapement and balance wheel, case with crown, and caseback in the holder. Hover to take it apart; the balance wheel swings at four hertz and the second hand steps eight times a second.",
  body,
});

const card = k.plateHtml({
  fig: model.SPECS.fig,
  title: model.SPECS.title,
  hint: "Hover to take it apart",
  readout: model.readout({ apart: false, moving: false, share: 0 }),
  keys: [
    { mark: "lit", label: `Balance wheel and hairspring: the only part that is lit` },
    { mark: "raised", label: `Six layers lift: bezel and crystal, hands, dial, movement, case, crown` },
  ],
  caption: `An automatic watch, 40 mm across, taken apart. The balance swings at ${model.SPECS.hz} Hz and lets the 15-tooth escape wheel advance ${model.SPECS.escapeDegreesPerBeat}° on every beat, so the second hand steps ${model.SPECS.beatsPerSecond} times a second; the mainspring holds ${model.SPECS.powerReserve} hours of it.`,
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="Automatic watch: Space takes it apart, the theme button switches light and dark">${svg}</div>`,
});

const toggle = `<div style="position:fixed;top:18px;right:20px;z-index:10"><button type="button" data-theme-toggle style="font:12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em;padding:8px 12px;border-radius:8px;border:1px solid currentColor;color:var(--anatomy-text);background:transparent;cursor:pointer;opacity:.8">Light</button></div>`;

const page = k.pageHtml({
  title: "Automatic watch",
  theme,
  body: card + toggle,
  script: kitScript() + live(P),
  width: model.CARD.pageWidth,
});

writeFileSync(join(HERE, theme === "light" ? "index-light.html" : "index.html"), page);
console.log("wrote", theme === "light" ? "index-light.html" : "index.html", `${Math.round(page.length / 1024)} KB`);
