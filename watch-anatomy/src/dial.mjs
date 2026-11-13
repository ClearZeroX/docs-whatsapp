// The dial and the hands. The dial is the printed paper face of the watch,
// with an applied index at every hour; the hands are shown at 10:10. Hour and
// minute hands are turned in world coordinates, so the isometric camera
// foreshortens them exactly as it foreshortens the dial they lie over.
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { U } from "./model.mjs";

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const UP = [0, 0, 1];
const FLAT = G.frameOf([0, 0, 0], UP, [1, 0, 0], [0, 1, 0]);

// Clock angles: 0 points to 12 o'clock (-y) and grows clockwise seen from above,
// the convention k.radialTicks and the page's second-hand spin both use.
const turn = (deg) => (deg * Math.PI) / 180;
const radial = (deg) => [Math.sin(turn(deg)), -Math.cos(turn(deg))];
const across = (deg) => [Math.cos(turn(deg)), Math.sin(turn(deg))];
// A hand is laid out along t (out from the centre) and w (across it).
const onHand = (deg, t, w) => {
  const d = radial(deg);
  const c = across(deg);
  return [d[0] * t + c[0] * w, d[1] * t + c[1] * w];
};
const prism = (P, plan, z0, z1, style) => S(G.prismOf(FLAT, plan, z0, z1, P), style);
const hand = (P, deg, outline, z0, z1, style) => prism(P, outline.map(([t, w]) => onHand(deg, t, w)), z0, z1, style);

const AT = { hours: 10, minutes: 10 };
const HOUR_ANGLE = AT.hours * 30 + AT.minutes * 0.5; // 305°
const MINUTE_ANGLE = AT.minutes * 6; // 60°
const Z = U.dial.z1; // 82: everything on the face stands on this
// Polished steel: applied indices and hand bodies take the darker fills so they
// read as solid metal on the paper face instead of only as outlines.
const STEEL = "--anatomy-paper:var(--anatomy-shade-0);--anatomy-top:var(--anatomy-shade-1)";

const HOUR = [
  [-14, -5.6], [-6, -5.6], [-6, -4.6], [74, -3.9], [96, 0], [74, 3.9], [-6, 4.6], [-6, 5.6], [-14, 5.6],
];
const MINUTE = [
  [-16, -5], [-8, -5], [-8, -3.7], [126, -3.1], [150, 0], [126, 3.1], [-8, 3.7], [-8, 5], [-16, 5],
];
const SECOND = [
  [-26, -2.6], [-12, -2.6], [-12, -1.4], [140, -1.1], [165, 0], [140, 1.1], [-12, 1.4], [-26, 2.6],
];

// The face: a flat paper disc, a printed minute track at its edge, twelve
// applied batons, the centre hole rim and two tiny engraved lines.
function dial(P) {
  const out = [];
  const face = G.frameAlong([0, 0, U.dial.z0], UP);
  out.push(S(G.disc(0, U.dial.z1 - U.dial.z0, U.dial.r, face, P, { steps: 120, bevel: 0.6 }), { tone: "hi", crease: "lo" }));
  out.push(L(k.ring(0, 0, 169, Z, P, 192), { tone: "lo" }));
  // Minute track: 60 ticks hung between two printed circles, so every tick ends
  // on a stroke. The five-minute marks are heavier, as on a real track.
  out.push(L(k.ring(0, 0, 165, Z, P, 192), { tone: "lo" }));
  out.push(L(k.ring(0, 0, 154, Z, P, 192), { tone: "lo" }));
  const ticks = k.radialTicks(0, 0, 165, 60, 5, Z, [6, 11], P);
  out.push(L(ticks.minor, { tone: "mid" }), L(ticks.major, { tone: "hi" }));
  // Applied hour indices: slim tapered batons, wider and longer at 12. They get
  // the steel fills too, so they read as applied metal on the paper face.
  const indices = [];
  for (let hour = 0; hour < 12; hour++) {
    const deg = hour * 30;
    const twelve = hour === 0;
    const inner = twelve ? 129 : 133;
    const outer = 151;
    const wi = twelve ? 4.8 : 3.6;
    const wo = twelve ? 6 : 4.6;
    const plan = [
      onHand(deg, inner, -wi),
      onHand(deg, inner, wi),
      onHand(deg, outer, wo),
      onHand(deg, outer, -wo),
    ];
    const height = twelve ? 3.2 : 2.6;
    indices.push(S(k.extrude(plan, Z, height, P, { convex: true, bevel: 0.5 }), { tone: "hi", crease: "lo" }));
    // A centre crease across the top facet, ending on the baton's own edges.
    indices.push(L(k.lineOnTop(onHand(deg, inner, 0), onHand(deg, outer, 0), Z + height, P), { tone: "faint" }));
  }
  out.push(`<g style="${STEEL}">${indices.join("")}</g>`);
  // The centre hole and its print ring, under the hands' collet.
  out.push(L(k.ring(0, 0, 20, Z, P, 80), { tone: "faint" }));
  out.push(L(k.ring(0, 0, 15.5, Z, P, 80), { tone: "lo" }));
  // Brand, set on the face just under 12 and read with 12 at the top.
  // Under 6 o'clock, where neither hand crosses it, so the engraving stays clean.
  out.push(k.faceTextSvg(k.topMatrix([0, 104], Z, P, "x"), "AUTOMATIC", { size: 7.5, tone: "lo", anchor: "middle" }));
  out.push(k.faceTextSvg(k.topMatrix([0, 120], Z, P, "x"), "25 JEWELS", { size: 7.5, tone: "lo", anchor: "middle" }));
  return out.join("");
}

function secondHand(P) {
  // The page turns this group about [0, 0, hands.z0], so the hand is drawn in
  // that plane: a turn about a vertical axis is exact only there. It is painted
  // after the other hands, so it reads on top of them and over the applied
  // indices, as a real second hand does.
  const bob = S(k.cylinder(0, 22.5, 4.6, U.hands.z0 + 0.4, 1.2, P, 40), { tone: "hi", crease: "lo" });
  return hand(P, 0, SECOND, U.hands.z0 + 0.4, U.hands.z0 + 1.6, { tone: "hi", crease: "lo" }) + bob;
}

function hands(P) {
  const out = [];
  const base = U.hands.z0; // 82: the dial plane
  // Centre collets: the hour hand's seat, then the minute hand's above it.
  out.push(S(k.cylinder(0, 0, 12.4, base, 2, P, 64, 0.5), { tone: "hi", crease: "lo" }));
  out.push(hand(P, HOUR_ANGLE, HOUR, base + 2, base + 3.8, { tone: "hi", crease: "lo" }));
  out.push(L(k.lineOnTop(onHand(HOUR_ANGLE, -14, 0), onHand(HOUR_ANGLE, 96, 0), base + 3.8, P), { tone: "faint" }));
  out.push(S(k.cylinder(0, 0, 8.2, base + 3.8, 1.2, P, 56, 0.4), { tone: "hi", crease: "lo" }));
  out.push(hand(P, MINUTE_ANGLE, MINUTE, base + 5, base + 6.8, { tone: "hi", crease: "lo" }));
  out.push(L(k.lineOnTop(onHand(MINUTE_ANGLE, -16, 0), onHand(MINUTE_ANGLE, 150, 0), base + 6.8, P), { tone: "faint" }));
  out.push(`<g data-spin="second">${secondHand(P)}</g>`);
  // The centre cap, a small domed nut over the whole stack.
  out.push(S(G.solidOf([[base + 6.8, 7.2], [base + 7.2, 7, 1], [base + 7.8, 4.2, 1], [base + 8, 0, 1]], G.frameAlong([0, 0, 0], UP), P, { steps: 64 }), { tone: "hi", crease: "lo" }));
  return `<g style="${STEEL}">${out.join("")}</g>`;
}

export function parts(P) {
  return [
    { id: "dial", body: dial(P) },
    { id: "hands", body: hands(P) },
  ];
}
