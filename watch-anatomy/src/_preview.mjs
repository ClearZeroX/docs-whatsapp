// Render one module alone, on the figure's own camera, with ghost guides so the
// builder can see how it sits in the assembled watch.
// node src/_preview.mjs <module> [--apart]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import { kitScript } from "../scripts/inline-kit.mjs";
import { CARD, LAYERS, U, projection } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name) {
  console.error("usage: node src/_preview.mjs <stage|case|dial|movement>");
  process.exit(1);
}
const module = await import(`./${name}.mjs`);
const P = projection();
const parts = module.parts(P);

const guide = (radius, z) => k.lineSvg(k.ring(0, 0, radius, z, P, 96), { tone: "faint" });
const vertical = [0, 90, 180, 270]
  .map((deg) => {
    const angle = (deg * Math.PI) / 180;
    return [Math.cos(angle) * 210, Math.sin(angle) * 210];
  })
  .map(([x, y]) => k.lineOnTop([x, y], [x, y], U.case.z1, P))
  .join("");

const guides = [
  guide(U.caseR, U.caseback.z0),
  guide(U.caseInR, U.case.z1),
  guide(U.dial.r, U.dial.z1),
  guide(U.movement.r, U.movement.z1),
  guide(U.balance.r, U.balance.z1),
  vertical,
].join("");

const bodies = parts.map((part) => `<g data-part="${part.id}">${part.body}</g>`).join("");

const svg = k.figureSvg({
  width: CARD.width,
  height: CARD.height,
  label: `Preview of the ${name} assembly`,
  body: bodies + guides,
});

const page = k.pageHtml({
  title: `preview ${name}`,
  body: `<div class="iso-stage">${svg}</div>`,
  script: kitScript(),
  width: CARD.pageWidth,
});

writeFileSync(join(HERE, "..", "preview", `${name}.html`), page);
console.log("wrote preview/" + name + ".html", parts.map((part) => part.id).join(", "));
