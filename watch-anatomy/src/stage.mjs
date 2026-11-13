import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { U } from "./model.mjs";

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const at = (P, [x, y, z]) => k.iso([x, y, z], P);
const UP = [0, 0, 1];

function feet(P) {
  const out = [];
  const plate = U.plate;
  const spots = [
    [plate.x + 24, plate.y + 24],
    [plate.x + plate.w - 24, plate.y + 24],
    [plate.x + 24, plate.y + plate.d - 24],
    [plate.x + plate.w - 24, plate.y + plate.d - 24],
  ];
  for (const [x, y] of spots) {
    out.push(S(k.cylinder(x, y, 11, U.plateZ - 16, 16, P, 32), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 8, U.plateZ - 18, 3, P, 32), { tone: "lo" }));
    out.push(L(k.ring(x, y, 9, U.plateZ - 18, P, 24), { tone: "faint" }));
  }
  return out.join("");
}

function plate(P) {
  const out = [`<path class="iso-halo" d="${k.haloOf(U.plate, U.plateZ - 18, 18, P)}"/>`];
  out.push(S(k.slabOf(U.plate, U.plateZ, -U.plateZ, P, 10, 2.2), { tone: "mid" }));
  const panel = k.insetPlan(U.plate, 10);
  out.push(S(k.slabOf(panel, 0, 1.2, P, 6, 0.4), { tone: "mid", crease: "none" }));
  out.push(L(k.planOutline(panel, 1.2, P), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(U.plate, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(U.plate, 15);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 3.2, 1.2, P, 20)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at(P, [x, y, 1.2])), { size: 0.5 }));
  return out.join("");
}

// Index ring around the holder: the stage is an instrument, so it has a scale.
function indexRing(P) {
  const out = [];
  const ticks = k.radialTicks(0, 0, 210, 60, 5, 1.2, [3, 6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(0, 0, 212, 1.2, P, 96), { tone: "lo" }));
  const zero = (0 * Math.PI) / 180;
  out.push(L(k.lineOnTop([Math.sin(zero) * 202, -Math.cos(zero) * 202], [Math.sin(zero) * 216, -Math.cos(zero) * 216], 1.2, P), { tone: "mid" }));
  out.push(D([at(P, [Math.sin(zero) * 219, -Math.cos(zero) * 219, 1.2])], { size: 0.55, tone: "hi" }));
  return out.join("");
}

function labelPlate(P) {
  const plan = { x: 108, y: 148, w: 128, d: 52, r: 3 };
  const z = 1.2;
  const out = [S(k.slabOf(plan, z, 4, P, 3, 0.8), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(plan, 2), z + 4, P), { tone: "lo" }));
  const rules = [16, 24, 32, 40].map((dy) => k.lineOnTop([plan.x + 2, plan.y + dy], [plan.x + plan.w - 2, plan.y + dy], z + 4, P));
  out.push(L(rules.join(""), { tone: "lo" }));
  out.push(L(k.lineOnTop([plan.x + 2, plan.y + 8], [plan.x + 62, plan.y + 8], z + 4, P), { tone: "mid" }));
  out.push(D([at(P, [plan.x + 2, plan.y + 8, z + 4]), at(P, [plan.x + 62, plan.y + 8, z + 4])], { size: 0.45, tone: "hi" }));
  return out.join("");
}

// A millimetre rule on the plate's front edge.
function ruler(P) {
  const strip = { x: -238, y: 196, w: 150, d: 10, r: 1 };
  const z = 1.2;
  const out = [S(k.slabOf(strip, z, 0.8, P, 3), { tone: "mid", crease: "none" })];
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 2.2, 5, strip.y + 1, z + 0.8, [1.4, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at(P, [strip.x + 2, strip.y + 5, z + 0.8]), at(P, [strip.x + strip.w - 2, strip.y + 5, z + 0.8])], { size: 0.4 }));
  return out.join("");
}

function holder(P) {
  const out = [];
  const F = G.frameAlong([0, 0, U.holder.z0], UP);
  out.push(S(G.ringBand(U.holder.z0, U.holder.z1, U.holder.rIn, U.holder.rOut, F, P, { steps: 112 }), { tone: "mid" }));
  out.push(L(k.ring(0, 0, U.holder.rOut, U.holder.z1, P, 112), { tone: "lo" }));
  out.push(L(k.ring(0, 0, U.holder.rIn, U.holder.z1, P, 112), { tone: "faint" }));
  for (let index = 0; index < 3; index++) {
    const angle = (index / 3) * Math.PI * 2 + Math.PI / 6;
    const plan = {
      x: Math.cos(angle) * 168 - 10,
      y: Math.sin(angle) * 168 - 10,
      w: 20,
      d: 20,
      r: 3,
    };
    out.push(S(k.slabOf(plan, U.holder.z1, 4, P, 3, 0.6), { tone: "mid" }));
    out.push(D([at(P, [plan.x + 10, plan.y + 10, U.holder.z1 + 4])], { size: 0.4 }));
  }
  out.push(S(k.cylinder(0, 0, U.holder.rIn - 4, U.holder.z1, 2, P, 112), { tone: "lo" }));
  return out.join("");
}

export function parts(P) {
  return [{ id: "stage", body: plate(P) + feet(P) + indexRing(P) + holder(P) + labelPlate(P) + ruler(P) }];
}
