import { LAYERS, SPECS, SPINS, spinMatrix } from "./model.mjs";

// The page script: staggered explode springs, spins driven by the model's own
// numbers, readout, theme toggle. Returns source to inline in the page.
export function live(P) {
  const spinSource = spinMatrix.toString().replace(/\bk\./g, "");
  const layers = LAYERS.map(({ id, order, explode }) => ({ id, order, explode }));
  return `
const P = ${JSON.stringify(P)};
const LAYERS = ${JSON.stringify(layers)};
const SPECS = ${JSON.stringify(SPECS)};
const SPINS = ${JSON.stringify(SPINS)};
const spinMatrix = ${spinSource};

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const moving = LAYERS.filter((layer) => layer.order < 9);
const maxOrder = Math.max(...moving.map((layer) => layer.order));
const layers = moving.map((layer) => ({
  ...layer,
  el: svg.querySelector('[data-part="' + layer.id + '"]'),
  value: 0,
  rate: 0,
  target: 0,
  begin: 0,
}));
const spins = SPINS.map((spin) => ({ ...spin, el: svg.querySelector('[data-spin="' + spin.key + '"]') })).filter((spin) => spin.el);
const snap = (element, text) => { if (element.textContent !== text) element.textContent = text; };
let apart = false, frame = 0, last = 0, visible = false, clock = 0, idle = 0, touring = true;

function schedule(next) {
  const now = performance.now() / 1000;
  for (const layer of layers) {
    const target = next ? 1 : 0;
    const changed = layer.target !== target;
    layer.target = target;
    if (changed) {
      const delay = next ? layer.order * 0.05 : (maxOrder - layer.order) * 0.035;
      layer.begin = now + delay;
    }
  }
  apart = next;
  if (!next) idle = 0;
}

function place() {
  for (const layer of layers) {
    if (!layer.el) continue;
    layer.el.setAttribute("transform", translateAlong(P, [layer.explode[0] * layer.value, layer.explode[1] * layer.value, layer.explode[2] * layer.value]));
  }
}

function spinAt(time) {
  for (const item of spins) {
    let radians = 0;
    if (item.kind === "oscillate") radians = (item.amplitude * Math.PI / 180) * Math.sin(2 * Math.PI * item.hz * time);
    else if (item.kind === "step") radians = Math.floor(time * item.beatsPerSecond) * item.degreesPerBeat * Math.PI / 180;
    else if (item.kind === "swing") radians = (item.amplitude * Math.PI / 180) * Math.sin(2 * Math.PI * time / item.period);
    item.el.setAttribute("transform", spinMatrix(P, item.centre, radians));
  }
}

function state() {
  const out = layers.filter((layer) => layer.target === 1 && layer.value > 0.5).length;
  const animating = layers.some((layer) => Math.abs(layer.target - layer.value) > 0.002 || Math.abs(layer.rate) > 0.02);
  let text;
  if (animating) text = (apart ? "taking apart" : "closing up") + " · " + out + " of " + layers.length;
  else if (apart) text = "apart · " + layers.length + " assemblies";
  else text = SPECS.vph.toLocaleString("en-US") + " vph · " + SPECS.beatsPerSecond + " beats/s · " + SPECS.powerReserve + " h";
  snap(readout, text);
  stage.setAttribute("aria-valuetext", text);
  stage.dataset.apart = apart ? "true" : "false";
}

function step(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  idle += dt;
  const calm = still.matches;
  for (const layer of layers) {
    if (calm) { layer.value = layer.target; layer.rate = 0; continue; }
    if (now / 1000 < layer.begin) continue;
    const stiff = 64, drag = 14.2;
    for (let i = 0; i < 4; i++) {
      layer.rate += ((layer.target - layer.value) * stiff - layer.rate * drag) * dt / 4;
      layer.value += layer.rate * dt / 4;
    }
    if (Math.abs(layer.target - layer.value) < 0.002 && Math.abs(layer.rate) < 0.02) {
      layer.value = layer.target;
      layer.rate = 0;
    }
  }
  place();
  if (!calm) spinAt(clock);
  state();
  const settled = layers.every((layer) => Math.abs(layer.target - layer.value) < 0.01);
  if (touring && !calm && visible && idle > 6 && settled) { schedule(!apart); idle = 0; }
  frame = visible && !calm ? requestAnimationFrame(step) : 0;
}

function run() {
  if (!frame && visible && !still.matches) {
    last = 0;
    frame = requestAnimationFrame(step);
  }
}

function settleNow() {
  for (const layer of layers) { layer.value = layer.target; layer.rate = 0; }
  place();
  spinAt(still.matches ? 0 : clock);
  state();
}

new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

stage.addEventListener("pointerenter", () => { touring = false; schedule(true); run(); });
stage.addEventListener("pointerleave", () => { schedule(false); idle = 0; run(); });
stage.addEventListener("click", () => { touring = false; schedule(!apart); run(); });
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    touring = false;
    schedule(!apart);
    run();
  }
  if (event.key === "Escape") { schedule(false); run(); }
});
still.addEventListener("change", () => { if (still.matches) { settleNow(); } else { run(); } });

const toggle = document.querySelector("[data-theme-toggle]");
if (toggle) {
  toggle.addEventListener("click", () => {
    const light = document.body.dataset.theme !== "light";
    document.body.dataset.theme = light ? "light" : "dark";
    toggle.textContent = light ? "Dark" : "Light";
    run();
  });
}

if (location.hash.indexOf("apart") >= 0) {
  for (const layer of layers) { layer.target = 1; layer.value = 1; }
  apart = true;
}
place();
if (still.matches) settleNow();
else { state(); spinAt(0); }
`;
}
