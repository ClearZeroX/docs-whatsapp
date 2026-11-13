// Case assemblies: the caseback in the holder, the case band with its lugs and
// crown tube, the crown and its stem, and the bezel with the glass crystal.
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { U } from "./model.mjs";

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const Fd = (list, style) => k.fadedSvg(list, style);
const UP = [0, 0, 1];
const TAU = Math.PI * 2;
const at = (P, [x, y, z]) => k.iso([x, y, z], P);
const arc = (r, from, to, steps = 24) =>
  Array.from({ length: steps + 1 }, (_, index) => {
    const a = from + ((to - from) * index) / steps;
    return [r * Math.cos(a), r * Math.sin(a)];
  });

// The case band: rounded lower lip, a brushed bottom band, a polished flank
// with its hi crease, and a chamfered seat under the bezel.
const CASE = { rIn: U.caseInR, rOut: U.caseR, z0: U.case.z0, z1: U.case.z1 };
const CASE_M = [
  [0, CASE.rIn],
  [0, 191],
  [0.5, 196, 1],
  [1.3, 199, 1],
  [2.4, 200],
  [70, 200],
  [75, 197.4],
  [80, 195.4],
  [80, CASE.rIn],
  [0, CASE.rIn],
];
const BRUSH = [4.5, 16]; // s span of the brushed bottom band
const LUG = { x: U.lug.x, y: U.lug.y, w: U.lug.w, d: U.lug.d, z0: 44, z1: 66, z2: 70 };
const BAR_Z = 56;
const CROWN_Z = (U.crown.z0 + U.crown.z1) / 2;

// ---------------------------------------------------------------- caseback
function caseback(P) {
  const { r, z0, z1 } = U.caseback;
  const h = z1 - z0;
  const F = G.frameAlong([0, 0, z0], UP);
  const floor = z0 + h - 3.2;
  const out = [];
  out.push(
    S(
      G.lathe(
        [
          [0, 0],
          [0, r - 14],
          [0.6, r - 4, 1],
          [1.9, r, 1],
          [h - 2.6, r],
          [h - 1.2, 196.6, 1],
          [h, 195],
          [h, 189.6],
          [h - 3.2, 187],
          [h - 3.2, 0],
        ],
        F,
        P,
        { steps: 96 },
      ),
      { tone: "mid" },
    ),
  );
  // Rubber gasket wrapping the rim, proud of the back.
  out.push(S(G.ringBand(2.6, 8.2, 195.8, 200.2, F, P, { steps: 96 }), { tone: "lo" }));
  // Brushed concentric finish and the engraved rings on the recessed floor.
  const brushed = [];
  for (let ring = 30; ring <= 164; ring += 12) brushed.push(k.ring(0, 0, ring, floor, P, 72));
  out.push(L(brushed.join(""), { tone: "faint" }));
  out.push(L([52, 98, 144, 178].map((ring) => k.ring(0, 0, ring, floor, P, 96)).join(""), { tone: "lo" }));
  // Six notched screws around the rim.
  const screws = [];
  const dots = [];
  for (let index = 0; index < 6; index++) {
    const angle = (30 + index * 60) * (Math.PI / 180);
    const x = Math.cos(angle) * 192;
    const y = Math.sin(angle) * 192;
    screws.push(k.ring(x, y, 3.6, z1, P, 20));
    screws.push(k.lineOnTop([x - Math.cos(angle) * 3.6, y - Math.sin(angle) * 3.6], [x + Math.cos(angle) * 3.6, y + Math.sin(angle) * 3.6], z1, P));
    dots.push(at(P, [x, y, z1]));
  }
  out.push(L(screws.join(""), { tone: "lo" }));
  out.push(D(dots, { size: 0.45, tone: "mid" }));
  return out.join("");
}

// -------------------------------------------------------------------- case
// A lug is a horn: its inner face stays flat for the spring bar, its outer
// side tapers to a rounded tip, and the root is the case's own wall.
function lugPlan(sx, sy) {
  const R = U.caseR;
  const innerX = LUG.x - LUG.w / 2;
  const outerX = LUG.x + LUG.w / 2;
  const tipY = LUG.y + LUG.d;
  const tipTop = tipY - 5;
  const atCase = (x) => Math.sqrt(R * R - x * x);
  const point = ([x, y]) => [x * sx, y * sy];
  const ring = [[outerX, atCase(outerX)]];
  for (let step = 1; step <= 5; step++) {
    const t = step / 5;
    ring.push([outerX - 5 * t * t, atCase(outerX) + (tipTop - atCase(outerX)) * t]);
  }
  for (let step = 1; step <= 3; step++) {
    const angle = (step / 4) * (Math.PI / 2);
    ring.push([outerX - 10 + 5 * Math.cos(angle), tipTop + 5 * Math.sin(angle)]);
  }
  ring.push([innerX + 5, tipY]);
  for (let step = 1; step <= 3; step++) {
    const angle = Math.PI / 2 + (step / 4) * (Math.PI / 2);
    ring.push([innerX + 5 + 5 * Math.cos(angle), tipTop + 5 * Math.sin(angle)]);
  }
  ring.push([innerX, tipTop], [innerX, atCase(innerX)]);
  const from = Math.acos(innerX / R);
  const to = Math.acos(outerX / R);
  for (let step = 1; step <= 4; step++) {
    const angle = from + ((to - from) * step) / 5;
    ring.push([R * Math.cos(angle), R * Math.sin(angle)]);
  }
  return ring.map(point);
}

// The tip's raised plateau, inset off the lug's outline, is the bevel that
// makes the horn read in the round.
function insetRing(ring, by) {
  const cx = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
  const cy = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  return ring.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const length = Math.hypot(dx, dy) || 1;
    return [x - (dx / length) * by, y - (dy / length) * by];
  });
}

function lug(P, sx, sy) {
  const plan = lugPlan(sx, sy);
  return (
    S(k.extrude(plan, LUG.z0, LUG.z1 - LUG.z0, P, { convex: false, bevel: 1 }), { tone: "mid", crease: "lo" }) +
    S(k.extrude(insetRing(plan, 2.8), LUG.z1, LUG.z2 - LUG.z1, P, { convex: false, bevel: 1.4 }), { tone: "mid", crease: "lo" })
  );
}

function lugHole(P, sx, sy) {
  const x = (LUG.x - LUG.w / 2) * sx;
  return L(k.sideRing([x, LUG.y * sy, BAR_Z], 7, "x", P, 24), { tone: "lo" });
}

function springBar(P, sy) {
  const F = G.frameAlong([-45, LUG.y * sy, BAR_Z], [1, 0, 0]);
  return S(G.disc(0, 90, 2.4, F, P), { tone: "mid" }) + S(G.disc(0, 3, 4.2, F, P), { tone: "mid" }) + S(G.disc(87, 90, 4.2, F, P), { tone: "mid" });
}

function crownTube(P) {
  const F = G.frameAlong([194, 0, CROWN_Z], [1, 0, 0]);
  const boss = G.disc(5, 9, 10, F, P);
  return S(boss, { tone: "mid" }) +
    S(G.disc(9, 22, 6, F, P), { tone: "mid" }) +
    L(k.sideRing([203, 0, CROWN_Z], 6, "x", P, 24), { tone: "faint" }) +
    L(k.sideRing([203, 0, CROWN_Z], 10, "x", P, 24), { tone: "lo" });
}

function band(P) {
  const F = G.frameAlong([0, 0, CASE.z0], UP);
  const out = [];
  // far pair, its spring bar, the crown tube, then the case over them
  out.push(lug(P, -1, -1), lug(P, 1, -1), springBar(P, -1), crownTube(P));
  out.push(`<g style="fill-rule:evenodd">${S(G.lathe(CASE_M, F, P, { steps: 128, hole: [80, CASE.rIn] }), { tone: "mid" })}</g>`);
  // brushed bottom band
  out.push(Fd(G.ribsOf(F, BRUSH[0], BRUSH[1], CASE.rOut, 84, P, { fade: [0.04, 0.42] }), { tone: "lo" }));
  out.push(L([BRUSH[0], BRUSH[1]].map((s) => G.arcOf(F, s, CASE.rOut, P)).join(""), { tone: "lo" }));
  // the polished flank's hi crease
  out.push(L(G.arcOf(F, 70, CASE.rOut, P), { tone: "hi" }));
  out.push(L(k.ring(0, 0, CASE.rIn, CASE.z1, P, 96), { tone: "faint" }));
  // near pair, its spring bar, then the two visible drilled holes
  out.push(lug(P, -1, 1), springBar(P, 1), lug(P, 1, 1));
  out.push(lugHole(P, -1, -1), lugHole(P, -1, 1));
  return out.join("");
}

// ------------------------------------------------------------------- crown
function crown(P) {
  const r = U.crown.r;
  const out = [];
  // The stem slides inside the case's tube, so at rest it hides under it.
  const FS = G.frameAlong([194, 0, CROWN_Z], [1, 0, 0]);
  out.push(S(G.disc(0, 32, 6, FS, P), { tone: "mid" }));
  const F = G.frameAlong([206, 0, CROWN_Z], [1, 0, 0]);
  out.push(S(G.disc(0, 15, r, F, P), { tone: "mid" }));
  out.push(Fd(G.ribsOf(F, 1.4, 15, r, 24, P, { fade: [0.06, 0.5] }), { tone: "lo" }));
  out.push(S(G.solidOf([[15, r], [16.2, 13.5, 1], [18.4, 10.4, 1], [19.6, 6.2, 1], [20, 0]], F, P), { tone: "hi", crease: "faint" }));
  return out.join("");
}

// ------------------------------------------------------------- bezel, glass
function bezel(P) {
  const { rIn, rOut, z0, z1 } = U.bezel;
  const h = z1 - z0;
  const F = G.frameAlong([0, 0, z0], UP);
  const meridian = [
    [0, rIn],
    [0, rOut],
    [6.2, rOut],
    [8.6, 197.4],
    [h, 195.4],
    [h, 171.6],
    [h - 1.5, 169.2],
    [h - 3.6, rIn],
    [0, rIn],
  ];
  const paths = G.lathe(meridian, F, P, { steps: 128, hole: [h, 171.6] });
  const out = [`<g style="fill-rule:evenodd">${S(paths, { tone: "mid" })}</g>`];
  out.push(L(G.arcOf(F, 6.2, rOut, P), { tone: "hi" }));
  out.push(L(k.ring(0, 0, 195.4, z1, P, 96), { tone: "hi" }));
  out.push(L(k.ring(0, 0, 179, z1, P, 96), { tone: "faint" }));
  out.push(L(k.ring(0, 0, 188, z1, P, 96), { tone: "faint" }));
  return out.join("");
}

function sapphire(P) {
  const r = U.crystal.r;
  const { z0, z1 } = U.crystal;
  const phi = Math.PI / 4;
  const out = [];
  // the glass's bottom rim, seen through the open bezel
  out.push(L(k.onTop(arc(r, phi + Math.PI / 2, phi + (3 * Math.PI) / 2, 40), z0, P), { tone: "faint" }));
  // the top rim and the two side edges of the glass wall
  out.push(L(k.ring(0, 0, r, z1, P, 96), { tone: "lo" }));
  const side = r / Math.SQRT2;
  out.push(L(k.rise([side, -side], z0, z1, P) + k.rise([-side, side], z0, z1, P), { tone: "faint" }));
  // specular arcs on the glass, ramped out where they end on the bare glass
  const shine = (radius, from, to, steps) =>
    k.fadeLineSvg(arc(radius, from, to, steps).map(([x, y]) => k.iso([x, y, z1 + 0.4], P)), { fade: [7, 12], tone: "hi" });
  out.push(shine(150, phi + 0.35, phi + 1.45, 18));
  out.push(shine(74, phi - 0.55, phi - 0.12, 8));
  return out.join("");
}

export function parts(P) {
  return [
    { id: "caseback", body: caseback(P) },
    { id: "case", body: band(P) },
    { id: "crown", body: crown(P) },
    { id: "crystal", body: bezel(P) + sapphire(P) },
  ];
}
