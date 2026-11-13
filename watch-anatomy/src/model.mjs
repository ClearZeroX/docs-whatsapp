import * as k from "../kit/iso-kit.mjs";

// One world unit is 0.1 mm of the real watch. z = 0 is the top of the stage.
export const CARD = { width: 760, height: 560, pageWidth: 820 };

export const SPECS = {
  fig: "Fig 1",
  title: "Automatic watch",
  caseDiameter: 40.0,
  caseHeight: 10.4,
  movementDiameter: 25.6,
  movementHeight: 4.6,
  jewels: 25,
  vph: 28800,
  hz: 4,
  beatsPerSecond: 8,
  powerReserve: 38,
  amplitude: 270,
  escapeTeeth: 15,
  escapeDegreesPerBeat: 12,
  displayTime: "10:10",
};

export const U = {
  stageTop: 0,
  plate: { x: -262, y: -222, w: 524, d: 444, r: 14 },
  plateZ: -46,
  holder: { rIn: 150, rOut: 198, z0: 0, z1: 14 },

  caseR: 200,
  caseInR: 178,
  caseback: { r: 198, z0: 14, z1: 26 },
  case: { z0: 26, z1: 106 },
  bezel: { rIn: 168, rOut: 200, z0: 106, z1: 116 },
  crystal: { r: 168, z0: 106, z1: 118 },

  movement: { r: 128, z0: 26, z1: 74 },
  mainplate: { z0: 26, z1: 42 },
  rotor: { r: 118, z0: 26, z1: 34 },
  bridges: { z0: 42, z1: 68 },
  balance: { x: -38, y: 30, r: 44, z0: 64, z1: 74 },
  escape: { x: 58, y: 46, r: 26, z0: 46, z1: 50 },

  dial: { r: 172, z0: 74, z1: 82 },
  hands: { z0: 82, z1: 90 },
  crown: { x: 216, z0: 56, z1: 78, r: 14 },
  lug: { x: 58, y: 208, w: 26, d: 40, r: 5 },
};

// Lowest layer first. order 0 is the first to leave on hover; order 9 is static.
export const LAYERS = [
  { id: "stage", label: "inspection stage", order: 9, explode: [0, 0, 0], body: "stage" },
  { id: "caseback", label: "caseback", order: 9, explode: [0, 0, 0], body: "case" },
  { id: "case", label: "case and lugs", order: 4, explode: [0, 0, 18], body: "case" },
  { id: "crown", label: "crown and stem", order: 5, explode: [110, 0, 14], body: "case" },
  { id: "movement", label: "movement", order: 3, explode: [0, 0, 132], body: "movement" },
  { id: "dial", label: "dial", order: 2, explode: [0, 0, 215], body: "dial" },
  { id: "hands", label: "hands", order: 1, explode: [0, 0, 285], body: "dial" },
  { id: "crystal", label: "bezel and crystal", order: 0, explode: [0, 0, 330], body: "case" },
];

export const MOVING = LAYERS.filter((layer) => layer.order < 9);

// Groups that turn about the vertical axis. `key` matches data-spin in the SVG.
export const SPINS = [
  { key: "balance", centre: [U.balance.x, U.balance.y, U.balance.z0], kind: "oscillate", amplitude: 135, hz: SPECS.hz },
  { key: "escape", centre: [U.escape.x, U.escape.y, U.escape.z0], kind: "step", degreesPerBeat: SPECS.escapeDegreesPerBeat, beatsPerSecond: SPECS.beatsPerSecond },
  { key: "second", centre: [0, 0, 83], kind: "step", degreesPerBeat: 0.75, beatsPerSecond: SPECS.beatsPerSecond },
  { key: "rotor", centre: [0, 0, U.rotor.z0], kind: "swing", amplitude: 32, period: 7 },
];

export function projection() {
  const bounds = [...k.boxCorners({ x: -262, y: -222, w: 524, d: 444 }, -46, 450)];
  bounds.push([360, 0, 130], [0, 0, 450], [0, 198, 130]);
  return k.fitProjection(bounds, CARD.width, CARD.height, { pad: 34, azimuth: 45, elevation: 30 });
}

// Screen-space spin about the vertical axis through [cx, cy, cz]. The kit's
// projection is linear, so rotating in world space is an affine transform in
// screen space: p' = M (p - C) + C with M = A R A^-1.
export function spinMatrix(P, [cx, cy, cz], radians) {
  const camera = k.cameraOf(P);
  // A maps a world (x, y) offset to a screen offset.
  const ax = camera.sinA * camera.k;
  const bx = -camera.cosA * camera.k;
  const cx2 = camera.cosA * camera.sinE * camera.k;
  const ex = camera.sinA * camera.sinE * camera.k;
  const det = ax * ex - bx * cx2;
  const inv00 = ex / det, inv01 = -bx / det, inv10 = -cx2 / det, inv11 = ax / det;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const T00 = cos * inv00 - sin * inv10, T01 = cos * inv01 - sin * inv11;
  const T10 = sin * inv00 + cos * inv10, T11 = sin * inv01 + cos * inv11;
  const M00 = ax * T00 + bx * T10, M01 = ax * T01 + bx * T11;
  const M10 = cx2 * T00 + ex * T10, M11 = cx2 * T01 + ex * T11;
  const [px, py] = k.iso([cx, cy, cz], P);
  const tx = px - (M00 * px + M01 * py);
  const ty = py - (M10 * px + M11 * py);
  const f = (value) => Math.round(value * 1000) / 1000;
  return `matrix(${f(M00)} ${f(M10)} ${f(M01)} ${f(M11)} ${f(tx)} ${f(ty)})`;
}

export function readout({ apart, moving, share }) {
  if (moving) return `taking apart · ${Math.round(share)} of ${MOVING.length}`;
  if (apart) return `apart · ${MOVING.length} assemblies`;
  return `${SPECS.vph.toLocaleString("en-US")} vph · ${SPECS.beatsPerSecond} beats/s · ${SPECS.powerReserve} h`;
}
