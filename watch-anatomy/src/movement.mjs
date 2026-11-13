// The movement: a 25.6 mm automatic calibre, dial side up, lifted clear of the
// rest of the watch. The mainplate (z34..42) carries the going train, the
// escapement and the balance; the rotor turns in the well below it and is seen
// through the open-heart window in the plate. Every stroke in the drawing is
// geometry of a real part: pillars, bridges, jewels, screws, teeth.
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { U } from "./model.mjs";

const TAU = Math.PI * 2;
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const UP = [0, 0, 1];

const Z = {
  cover0: 26,
  cover1: 28,
  rotor0: 28,
  rotor1: 34,
  plate0: 34,
  plate1: 42,
  barrel0: 44,
  barrel1: 51,
  spring: 45.4,
  escape0: 46,
  escape1: 49.5,
  fork0: 46.5,
  fork1: 50,
  bridge0: 59,
  bridge1: 63,
  boss1: 65.5,
  balance0: 66,
  balance1: 71.5,
  cap1: 73.5,
};

// Open-heart window in the mainplate, cut over the rotor's counterweight.
const WIN = { x: 72.5, y: -63, r: 17 };

// Going-train axes. The escape wheel and the balance stay where model.mjs puts
// them; the rest is laid out so each wheel meshes the next pinion and the wheel
// discs pass one over another, as they do in a real calibre.
const B = { x: -39, y: -33, r: 46 }; // barrel
const C = { x: 0, y: 0, r: 32, z0: 56, z1: 58.5 }; // centre wheel, under the hands
const T3 = { x: 38, y: 5, r: 24, z0: 53, z1: 55 }; // third wheel
const T4 = { x: 62, y: 22, r: 18, z0: 50, z1: 52.5 }; // fourth wheel
const ESC = { x: U.escape.x, y: U.escape.y, r: U.escape.r };
const BAL = { x: U.balance.x, y: U.balance.y, r: U.balance.r };
const PIVOT = { x: 20, y: 44 }; // pallet fork staff
const ROLLER = 12; // impulse jewel radius on the balance staff

const RIM_BOSS = 114; // pillars on the mainplate rim
const PILLARS = [
  { a: 0, bridge: "train" },
  { a: 30, bridge: null },
  { a: 90, bridge: "pallet" },
  { a: 150, bridge: "cock" },
  { a: 210, bridge: "barrel" },
  { a: 270, bridge: null },
];

// ---------------------------------------------------------------- geometry bits

const polar = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const iso = (P, [x, y, z]) => k.iso([x, y, z], P);

const signedArea = (pts) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[(i + 1) % pts.length];
    sum += x * ny - nx * y;
  }
  return sum;
};
const oriented = (pts) => (signedArea(pts) < 0 ? [...pts].reverse() : pts);

function arcPts(cx, cy, r, a0, a1, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(polar(cx, cy, r, a0 + ((a1 - a0) * i) / steps));
  return pts;
}

// A straight spoke: a rectangle between two radii of a wheel.
function beam(cx, cy, r0, r1, angle, half) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const px = -dy * half;
  const py = dx * half;
  return [
    [cx + dx * r0 + px, cy + dy * r0 + py],
    [cx + dx * r1 + px, cy + dy * r1 + py],
    [cx + dx * r1 - px, cy + dy * r1 - py],
    [cx + dx * r0 - px, cy + dy * r0 - py],
  ];
}

// An annular sector: the counterweight of the rotor.
function sector(cx, cy, rIn, rOut, a0, a1, steps = 40) {
  return [...arcPts(cx, cy, rOut, a0, a1, steps), ...arcPts(cx, cy, rIn, a1, a0, steps)];
}

// A ring with a hole you can see through: the kit's lathe fill closes the hole,
// so the annulus is built here from its top face, its two visible walls and its
// own silhouette. Paint order below makes the hole show what is behind it.
function ringSolid(P, cx, cy, rIn, rOut, z0, z1, options = {}) {
  const steps = options.steps ?? 72;
  const tone = options.tone ?? "mid";
  const crease = options.crease ?? "faint";
  const lit = Boolean(options.lit);
  const ringAt = (r, z) => {
    const pts = [];
    for (let i = 0; i < steps; i++) pts.push(iso(P, polar(cx, cy, r, (i / steps) * TAU).concat(z)));
    return pts;
  };
  const oT = ringAt(rOut, z1);
  const oB = ringAt(rOut, z0);
  const iT = ringAt(rIn, z1);
  const iB = ringAt(rIn, z0);
  const [vx, vy] = k.towardViewer(P);
  const phi = Math.atan2(vy, vx);
  const quad = (a, b, c, d) => k.pathOf(oriented([a, b, c, d]), true);
  const shades = ["", "", "", ""];
  for (let i = 0; i < steps; i++) {
    const a = ((i + 0.5) / steps) * TAU;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    const j = (i + 1) % steps;
    if (nx * vx + ny * vy > 0) {
      shades[Math.min(3, G.toneOf([nx, ny, 0], P))] += quad(oT[i], oT[j], oB[j], oB[i]);
    } else {
      shades[Math.min(3, G.toneOf([-nx, -ny, 0], P))] += quad(iT[i], iT[j], iB[j], iB[i]);
    }
  }
  const arc = (r, z, from, to, count = Math.max(10, Math.round(steps / 2))) => {
    const pts = [];
    for (let i = 0; i <= count; i++) {
      const a = from + ((to - from) * i) / count;
      pts.push(iso(P, polar(cx, cy, r, a).concat(z)));
    }
    return pts;
  };
  const nearFrom = phi - Math.PI / 2 + 0.03;
  const nearTo = phi + Math.PI / 2 - 0.03;
  const farFrom = phi + Math.PI / 2 + 0.03;
  const farTo = phi + (Math.PI * 3) / 2 - 0.03;
  const limbs = [nearFrom, nearTo]
    .map((a) => {
      const [x, y] = polar(cx, cy, rOut, a);
      return k.pathOf([iso(P, [x, y, z1]), iso(P, [x, y, z0])]);
    })
    .join("");
  const top = k.pathOf([...oT, ...iT.slice().reverse()], true);
  const outline = [k.pathOf(oT, true), k.pathOf(iT, true), k.pathOf(arc(rOut, z0, nearFrom, nearTo))].join("");
  const inner = k.pathOf(arc(rIn, z0, farFrom, farTo));
  const body = [
    `<path class="iso-top" d="${top}"/>`,
    ...shades.map((d, i) => (d ? `<path class="iso-shade" data-shade="${i}" d="${d}"/>` : "")),
    inner ? `<path class="iso-line iso-crease" data-tone="${crease}" d="${inner}"/>` : "",
    `<path class="iso-line iso-edge" data-tone="${tone}" d="${outline}"/>`,
  ].join("");
  return `<g class="iso-solid"${lit ? ' data-lit=""' : ""}>${body}</g>`;
}

// A decoration clipped to a face: parallel stripes that end exactly on the edge.
function stripes(P, clipId, facePaths, z, spacing = 7, tone = "faint") {
  const lines = [];
  for (let offset = -300; offset <= 300; offset += spacing) {
    const t = offset;
    const points = [];
    for (let s = -320; s <= 320; s += 40) {
      // 45 degrees in plan, marching across the face
      points.push([t + s * 0.7071, -s * 0.7071]);
    }
    lines.push(L(k.onTop(points, z, P), { tone }));
  }
  return `<clipPath id="${clipId}"><path d="${facePaths.top}"/></clipPath><g clip-path="url(#${clipId})">${lines.join("")}</g>`;
}

// ------------------------------------------------------------------ small parts

function screw(P, x, y, z, r = 2.8, tone = "mid") {
  return (
    S(k.cylinder(x, y, r, z, 1.2, P, 18, 0.3), { tone }) +
    L(k.ring(x, y, r, z + 1.2, P, 18), { tone: "lo" }) +
    D([iso(P, [x, y, z + 1.2])], { size: 0.5, tone: "mid" })
  );
}

function jewel(P, x, y, z, r = 5) {
  return (
    L(k.ring(x, y, r, z, P, 24), { tone: "lo" }) +
    L(k.ring(x, y, r * 0.42, z, P, 16), { tone: "faint" }) +
    D([iso(P, [x, y, z])], { size: 0.55, tone: "hi" })
  );
}

function jewelBoss(P, x, y, r, z = Z.bridge1, top = Z.boss1) {
  return S(k.cylinder(x, y, r, z, top - z, P, 32, 0.4), { tone: "hi" }) + jewel(P, x, y, top, r * 0.46);
}

// A screwed chaton: a jewel in a screwed setting, as on the plate.
function chaton(P, x, y, z, r = 7) {
  const out = [S(k.cylinder(x, y, r, z, 1.8, P, 24, 0.4), { tone: "mid" })];
  out.push(L(k.ring(x, y, r, z + 1.8, P, 24), { tone: "lo" }));
  out.push(jewel(P, x, y, z + 1.8, r * 0.5));
  for (const a of [0.6, Math.PI + 0.6]) {
    const [sx, sy] = polar(x, y, r - 1.6, a);
    out.push(L(k.ring(sx, sy, 1.5, z + 1.8, P, 12), { tone: "lo" }));
    out.push(D([iso(P, [sx, sy, z + 1.8])], { size: 0.38, tone: "mid" }));
  }
  return out.join("");
}

// A lobed bridge: the hull of its bearing lobes, extruded as one plate.
function bridge(P, lobes, z0 = Z.bridge0, z1 = Z.bridge1, bevel = 1) {
  const pts = [];
  for (const [cx, cy, r] of lobes) {
    for (let i = 0; i < 30; i++) pts.push(polar(cx, cy, r, (i / 30) * TAU));
  }
  return k.extrude(G.hullOf(pts), z0, z1 - z0, P, { bevel });
}

// ------------------------------------------------------------------- assemblies

function rotor(P) {
  const out = [];
  const half = { a0: (-124 * Math.PI) / 180, a1: (56 * Math.PI) / 180 };
  // Spokes first, the counterweight and the hub then hide their ends: one piece.
  for (const deg of [-100, -41, 18]) {
    const quad = beam(0, 0, 12, 96, (deg * Math.PI) / 180, 4.6);
    out.push(S(k.extrude(quad, Z.rotor0, Z.rotor1 - Z.rotor0, P, { bevel: 0.5 }), { tone: "hi" }));
  }
  out.push(S(k.extrude(sector(0, 0, 92, 114, half.a0, half.a1, 48), Z.rotor0, Z.rotor1 - Z.rotor0, P, { bevel: 0.7 }), { tone: "hi" }));
  out.push(L(k.onTop(arcPts(0, 0, 103, half.a0 + 0.1, half.a1 - 0.1, 60), Z.rotor1, P), { tone: "lo" }));
  out.push(L(k.onTop(arcPts(0, 0, 97, half.a0 + 0.14, half.a1 - 0.14, 60), Z.rotor1, P), { tone: "faint" }));
  out.push(L(k.onTop(arcPts(0, 0, 111, half.a0 + 0.2, half.a1 - 0.2, 60), Z.rotor1, P), { tone: "faint" }));
  for (const deg of [-116, -88, -60, -14, 32]) {
    const a = (deg * Math.PI) / 180;
    out.push(L(k.lineOnTop(polar(0, 0, 97, a), polar(0, 0, 111, a), Z.rotor1, P), { tone: "faint" }));
  }
  for (const deg of [-96, -41, 14]) {
    const [x, y] = polar(0, 0, 104, (deg * Math.PI) / 180);
    out.push(screw(P, x, y, Z.rotor1 - 0.2, 2.4));
  }
  out.push(S(k.cylinder(0, 0, 14, Z.rotor0 - 1, Z.rotor1 - Z.rotor0 + 3, P, 40), { tone: "hi" }));
  out.push(L(k.ring(0, 0, 8, Z.rotor1 + 2, P, 24), { tone: "faint" }));
  out.push(screw(P, 0, 0, Z.rotor1 + 1.4, 3.2));
  return out.join("");
}

function goingWheel(P, wheel, z0, z1, teeth, spokeCount, phase = 0) {
  const out = [];
  const F = G.frameAlong([wheel.x, wheel.y, 0], UP);
  const hub = 5.5;
  for (let i = 0; i < spokeCount; i++) {
    const quad = beam(wheel.x, wheel.y, hub - 1, wheel.r - 1, phase + (i / spokeCount) * TAU, 3.4);
    out.push(S(k.extrude(quad, z0 + 0.3, z1 - z0 - 0.6, P), { tone: "hi" }));
  }
  out.push(ringSolid(P, wheel.x, wheel.y, wheel.r - 4.6, wheel.r, z0, z1, { steps: 72, tone: "hi" }));
  const t = k.radialTicks(wheel.x, wheel.y, wheel.r + 3, teeth, teeth, z1, [3, 3], P);
  out.push(L(t.minor, { tone: "lo" }));
  out.push(L(k.ring(wheel.x, wheel.y, wheel.r + 3, z1, P, teeth * 2), { tone: "faint" }));
  out.push(S(k.cylinder(wheel.x, wheel.y, hub, z0 - 1, z1 - z0 + 2, P, 24), { tone: "hi" }));
  out.push(L(k.ring(wheel.x, wheel.y, hub - 1.4, z1 + 1, P, 20), { tone: "faint" }));
  return out.join("");
}

function arbor(P, wheel, zTop, zBottom) {
  const base = zBottom ?? wheel.z0 - 3;
  return (
    S(k.cylinder(wheel.x, wheel.y, 5.2, base, 4, P, 24), { tone: "hi" }) +
    L(k.knurl(wheel.x, wheel.y, 5.2, base, base + 4, 12, P), { tone: "lo" }) +
    S(k.cylinder(wheel.x, wheel.y, 2.8, base, zTop - base, P, 16), { tone: "hi", crease: "none" }) +
    L(k.ring(wheel.x, wheel.y, 5.2, base + 4, P, 20), { tone: "faint" })
  );
}

function barrel(P) {
  const out = [];
  const F = G.frameAlong([B.x, B.y, 0], UP);
  out.push(S(G.disc(Z.barrel0, Z.barrel0 + 1.6, B.r - 7, F, P, { steps: 72 }), { tone: "lo" }));
  // Mainspring: a flat spiral from the arbor out to the drum wall.
  const turns = 5.25;
  const pts = [];
  for (let i = 0; i <= 220; i++) {
    const t = i / 220;
    const a = 1.2 + t * turns * TAU;
    const r = 8 + (B.r - 8.5) * t;
    pts.push(polar(B.x, B.y, r, a));
  }
  out.push(L(k.onTop(pts, Z.spring, P), { tone: "lo" }));
  out.push(ringSolid(P, B.x, B.y, B.r - 8, B.r, Z.barrel0, Z.barrel1, { steps: 96, tone: "hi" }));
  out.push(L(k.sideArc(B.x, B.y, B.r, Z.barrel0 + 3, P, 48), { tone: "faint" }));
  const t = k.radialTicks(B.x, B.y, B.r + 3, 40, 40, Z.barrel1, [3, 3], P);
  out.push(L(t.minor, { tone: "lo" }));
  out.push(L(k.ring(B.x, B.y, B.r + 3, Z.barrel1, P, 80), { tone: "faint" }));
  out.push(S(k.cylinder(B.x, B.y, 6.6, Z.plate1, Z.cap1 - Z.plate1 - 3, P, 24), { tone: "hi", crease: "none" }));
  out.push(L(k.sideArc(B.x, B.y, 6.6, Z.barrel1 + 1.4, P, 16), { tone: "faint" }));
  return out.join("");
}

function escapeWheel(P) {
  const out = [];
  const F = G.frameAlong([ESC.x, ESC.y, 0], UP);
  const z0 = Z.escape0;
  const z1 = Z.escape1;
  out.push(S(k.cylinder(ESC.x, ESC.y, 2.8, Z.plate1, Z.bridge0 + 2 - Z.plate1, P, 16), { tone: "hi", crease: "none" }));
  out.push(S(G.disc(z0 - 1.5, z0, 5, F, P, { steps: 24 }), { tone: "hi" }));
  out.push(L(k.knurl(ESC.x, ESC.y, 5, z0 - 5.5, z0 - 1.5, 12, P), { tone: "lo" }));
  out.push(ringSolid(P, ESC.x, ESC.y, 15, 21, z0, z1, { steps: 60, tone: "hi" }));
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * TAU;
    const tooth = [
      polar(ESC.x, ESC.y, 20, a - 0.10),
      polar(ESC.x, ESC.y, 26, a - 0.15),
      polar(ESC.x, ESC.y, 26, a + 0.02),
      polar(ESC.x, ESC.y, 20, a + 0.075),
    ];
    out.push(S(k.extrude(tooth, z0, z1 - z0, P, { bevel: 0.3 }), { tone: "hi" }));
  }
  out.push(L(k.ring(ESC.x, ESC.y, 26, z1, P, 60), { tone: "lo" }));
  for (let i = 0; i < 4; i++) {
    out.push(S(k.extrude(beam(ESC.x, ESC.y, 5, 15.5, (i / 4) * TAU + Math.PI / 4, 2.2), z0 + 0.2, z1 - z0 - 0.4, P), { tone: "hi" }));
  }
  out.push(S(k.cylinder(ESC.x, ESC.y, 6, z0 - 1, z1 - z0 + 2, P, 24), { tone: "hi" }));
  out.push(L(k.ring(ESC.x, ESC.y, 4.4, z1 + 1, P, 20), { tone: "faint" }));
  return out.join("");
}

function palletFork(P) {
  const out = [];
  const entry = polar(ESC.x, ESC.y, 24.6, (154 * Math.PI) / 180);
  const exit = polar(ESC.x, ESC.y, 24.4, (212 * Math.PI) / 180);
  const forkEnd = polar(BAL.x, BAL.y, ROLLER + 2.4, (-6 * Math.PI) / 180);
  for (const tip of [entry, exit]) {
    const a = Math.atan2(tip[1] - PIVOT.y, tip[0] - PIVOT.x);
    const len = Math.hypot(tip[0] - PIVOT.x, tip[1] - PIVOT.y);
    out.push(S(k.extrude(beam(PIVOT.x, PIVOT.y, 1, len + 3, a, 3.2), Z.fork0, Z.fork1 - Z.fork0, P, { bevel: 0.5 }), { tone: "hi" }));
  }
  // Lever body, with its two-pronged fork end, as one concave outline.
  const a = Math.atan2(forkEnd[1] - PIVOT.y, forkEnd[0] - PIVOT.x);
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy;
  const py = dx;
  const len = Math.hypot(forkEnd[0] - PIVOT.x, forkEnd[1] - PIVOT.y);
  const mouthA = [PIVOT.x + dx * len + px * 5, PIVOT.y + dy * len + py * 5];
  const mouthB = [PIVOT.x + dx * len - px * 5, PIVOT.y + dy * len - py * 5];
  const notchA = [mouthA[0] + dx * 7, mouthA[1] + dy * 7];
  const notchB = [mouthB[0] + dx * 7, mouthB[1] + dy * 7];
  const prongA = [notchA[0] + dx * 6, notchA[1] + dy * 6];
  const prongB = [notchB[0] + dx * 6, notchB[1] + dy * 6];
  const body = [
    [PIVOT.x + px * 5 - dx * 2, PIVOT.y + py * 5 - dy * 2],
    mouthA,
    notchA,
    prongA,
    prongB,
    notchB,
    mouthB,
    [PIVOT.x - px * 5 - dx * 2, PIVOT.y - py * 5 - dy * 2],
  ];
  out.push(S(k.extrude(body, Z.fork0 + 0.3, Z.fork1 - Z.fork0 - 0.6, P, { bevel: 0.5 }), { tone: "hi" }));
  for (const [x, y] of [entry, exit]) {
    const stone = [[x - 3.2, y - 3.2], [x + 3.2, y - 3.2], [x + 2.3, y + 3.4], [x - 2.3, y + 3.4]];
    out.push(S(k.extrude(stone, Z.fork1, 1.6, P, { bevel: 0.3 }), { tone: "hi" }));
    out.push(D([iso(P, [x, y, Z.fork1 + 1.6])], { size: 0.42, tone: "hi" }));
  }
  out.push(S(k.cylinder(PIVOT.x, PIVOT.y, 2.6, Z.plate1, Z.bridge0 + 2 - Z.plate1, P, 16), { tone: "hi", crease: "none" }));
  out.push(S(k.cylinder(PIVOT.x, PIVOT.y, 5.2, Z.fork0 - 1, Z.fork1 - Z.fork0 + 2, P, 24), { tone: "hi" }));
  out.push(L(k.ring(PIVOT.x, PIVOT.y, 3.6, Z.fork1 + 1, P, 16), { tone: "faint" }));
  return out.join("");
}

function plate(P) {
  const F = G.frameAlong([0, 0, 0], UP);
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: -124, y: -124, w: 248, d: 248, r: 124 }, Z.cover0 - 3, 3, P)}"/>`);
  out.push(
    `<clipPath id="mv-plate" clip-rule="evenodd"><path clip-rule="evenodd" d="M-3000 -3000H4000V4000H-3000Z${k.ring(WIN.x, WIN.y, WIN.r, Z.plate1, P, 96)}"/></clipPath>`,
  );
  const disc = S(G.disc(Z.plate0, Z.plate1, U.movement.r, F, P, { steps: 128, bevel: 1.6 }), { tone: "mid" });
  const top = [
    L(k.ring(0, 0, 40, Z.plate1, P, 72), { tone: "faint" }),
    L(k.ring(0, 0, 115, Z.plate1, P, 128), { tone: "lo" }),
    L(k.ring(0, 0, 119, Z.plate1, P, 128), { tone: "faint" }),
    L(k.ring(0, 0, 123, Z.plate1, P, 128), { tone: "faint" }),
    L(k.ring(WIN.x, WIN.y, WIN.r + 5, Z.plate1, P, 64), { tone: "lo" }),
    L(k.ring(WIN.x, WIN.y, WIN.r + 8.5, Z.plate1, P, 64), { tone: "faint" }),
  ];
  const engrave = k.radialTicks(0, 0, 123, 96, 96, Z.plate1, [2.4, 2.4], P);
  top.push(L(engrave.minor, { tone: "faint" }));
  for (const deg of [15, 75, 135, 195, 255, 285]) {
    const a = (deg * Math.PI) / 180;
    top.push(L(k.lineOnTop(polar(0, 0, 35, a), polar(0, 0, 112, a), Z.plate1, P), { tone: "faint" }));
  }
  out.push(`<g clip-path="url(#mv-plate)">${disc}${top.join("")}</g>`);
  // The window's rim, its far inner wall, then what shows through it.
  out.push(`<clipPath id="mv-window"><path d="${k.ring(WIN.x, WIN.y, WIN.r, Z.plate1, P, 96)}"/></clipPath>`);
  out.push(`<g clip-path="url(#mv-window)"><path class="iso-shade" data-shade="0" d="${windowWall(P)}"/></g>`);
  out.push(L(k.ring(WIN.x, WIN.y, WIN.r, Z.plate1, P, 96), { tone: "lo" }));
  out.push(L(k.ring(WIN.x, WIN.y, WIN.r - 1.4, Z.plate1, P, 96), { tone: "faint" }));
  // Plate screws, chatons and the six rim pillars.
  for (const [deg, r] of [[170, 98], [250, 98], [200, 98], [60, 96]]) {
    const [x, y] = polar(0, 0, r, (deg * Math.PI) / 180);
    out.push(screw(P, x, y, Z.plate1, 3));
  }
  for (const [x, y] of [[-18, 94], [-78, 78], [-16, -89]]) out.push(chaton(P, x, y, Z.plate1));
  // Case clamps: little tabs bolted to the plate that hold the movement down.
  for (const deg of [120, 240, 300]) {
    const a = (deg * Math.PI) / 180;
    const tab = [
      polar(0, 0, 100, a - 0.055),
      polar(0, 0, 117, a - 0.045),
      polar(0, 0, 117, a + 0.045),
      polar(0, 0, 100, a + 0.055),
    ];
    out.push(S(k.extrude(tab, Z.plate1, 2.4, P, { bevel: 0.4 }), { tone: "mid" }));
    out.push(screw(P, ...polar(0, 0, 110, a), Z.plate1 + 2.4, 2.4));
  }
  for (const pillar of PILLARS) {
    const [x, y] = polar(0, 0, RIM_BOSS, (pillar.a * Math.PI) / 180);
    out.push(S(k.cylinder(x, y, 10.5, Z.plate1, Z.bridge0 - Z.plate1, P, 32, 0.5), { tone: "mid" }));
    out.push(L(k.sideArc(x, y, 10.5, Z.plate1 + 6, P, 20), { tone: "faint" }));
    if (!pillar.bridge) {
      out.push(S(k.cylinder(x, y, 7.4, Z.bridge0, 2.6, P, 28), { tone: "mid" }));
      out.push(jewel(P, x, y, Z.bridge0 + 2.6, 4));
    }
  }
  return out.join("");
}

// The visible inner wall of the window: the far half of its cylinder.
function windowWall(P) {
  const [vx, vy] = k.towardViewer(P);
  const phi = Math.atan2(vy, vx);
  const half = (z) => {
    const pts = [];
    for (let i = 0; i <= 36; i++) {
      const a = phi + Math.PI / 2 + (Math.PI * i) / 36;
      pts.push(iso(P, [WIN.x + WIN.r * Math.cos(a), WIN.y + WIN.r * Math.sin(a), z]));
    }
    return pts;
  };
  return k.pathOf([...half(Z.plate1), ...half(Z.rotor1).reverse()], true);
}

function wheelBridges(P) {
  const out = [];
  const footOf = (key) => {
    const p = PILLARS.find((pillar) => pillar.bridge === key);
    return [...polar(0, 0, RIM_BOSS, (p.a * Math.PI) / 180), 13];
  };
  // Barrel bridge: rim pillar to the barrel arbor.
  const barrelLobes = [[B.x, B.y, 18], [-73, -40, 13], footOf("barrel")];
  const barrelPaths = bridge(P, barrelLobes);
  out.push(S(barrelPaths, { tone: "hi" }));
  out.push(stripes(P, "mv-b0", barrelPaths, Z.bridge1, 8));
  out.push(jewelBoss(P, B.x, B.y, 11));
  out.push(screw(P, -73, -40, Z.bridge1, 2.8));
  const barrelFoot = footOf("barrel");
  out.push(screw(P, barrelFoot[0], barrelFoot[1], Z.bridge1, 3));
  // The click: a spring arm holding the ratchet wheel.
  out.push(S(k.extrude(beam(-61, -22, 2, 22, -0.35, 2.4), Z.bridge1, 1.8, P, { bevel: 0.4 }), { tone: "hi" }));
  out.push(screw(P, -61, -22, Z.bridge1 + 1.8, 2.2));

  // Train bridge: centre, third and fourth pivots, bolted to the rim pillar.
  const trainFoot = footOf("train");
  const trainLobes = [[C.x, C.y, 15], [T3.x, T3.y, 13], [T4.x, T4.y, 12], [ESC.x, ESC.y, 9], trainFoot];
  const trainPaths = bridge(P, trainLobes);
  out.push(S(trainPaths, { tone: "hi" }));
  out.push(stripes(P, "mv-b1", trainPaths, Z.bridge1, 8));
  out.push(jewelBoss(P, C.x, C.y, 11));
  out.push(jewelBoss(P, T3.x, T3.y, 9.6));
  out.push(jewelBoss(P, T4.x, T4.y, 8.6));
  out.push(jewelBoss(P, ESC.x, ESC.y, 8.6));
  out.push(screw(P, trainFoot[0], trainFoot[1], Z.bridge1, 3));
  out.push(screw(P, 29, -6, Z.bridge1, 2.6));

  // Pallet bridge: a slim bar from the rim pillar to the fork staff, so the
  // escape wheel and its stones stay in view.
  const palletFoot = footOf("pallet");
  const palletPaths = bridge(P, [[PIVOT.x, PIVOT.y, 9], [10, 84, 5.5], palletFoot]);
  out.push(S(palletPaths, { tone: "hi" }));
  out.push(stripes(P, "mv-b2", palletPaths, Z.bridge1, 8));
  out.push(jewelBoss(P, PIVOT.x, PIVOT.y, 8.2));
  out.push(screw(P, palletFoot[0], palletFoot[1], Z.bridge1, 3));
  return out.join("");
}

function balanceCock(P) {
  const out = [];
  const foot = polar(0, 0, RIM_BOSS, (150 * Math.PI) / 180);
  const stud = polar(BAL.x, BAL.y, 32, (150 * Math.PI) / 180);
  const paths = bridge(P, [[BAL.x, BAL.y, 14], [-66, 46, 11], [...foot, 12]]);
  out.push(S(paths, { tone: "hi" }));
  out.push(jewelBoss(P, BAL.x, BAL.y, 11, Z.bridge1, Z.boss1));
  out.push(screw(P, foot[0], foot[1], Z.bridge1, 3));
  // Regulator arm, and the hairspring stud it holds.
  out.push(S(k.extrude(beam(BAL.x, BAL.y, 12, 38, (172 * Math.PI) / 180, 2.8), Z.bridge1, 1.6, P, { bevel: 0.4 }), { tone: "hi" }));
  out.push(L(k.lineOnTop(polar(BAL.x, BAL.y, 30, (172 * Math.PI) / 180), polar(BAL.x, BAL.y, 43, (158 * Math.PI) / 180), Z.bridge1 + 1.6, P), { tone: "lo" }));
  out.push(S(k.cylinder(stud[0], stud[1], 3.6, Z.bridge1, 7.2, P, 20), { tone: "hi" }));
  out.push(L(k.ring(stud[0], stud[1], 3.6, Z.bridge1 + 7.2, P, 20), { tone: "lo" }));
  out.push(D([iso(P, [stud[0], stud[1], Z.bridge1 + 7.2])], { size: 0.45, tone: "mid" }));
  return out.join("");
}

function ratchetWheel(P) {
  const out = [];
  const F = G.frameAlong([B.x, B.y, 0], UP);
  const z0 = Z.bridge1;
  const z1 = Z.bridge1 + 2.6;
  out.push(S(G.disc(z0, z1, 26, F, P, { steps: 72, bevel: 0.6 }), { tone: "hi" }));
  out.push(L(k.ring(B.x, B.y, 22, z1, P, 72), { tone: "faint" }));
  out.push(L(k.ring(B.x, B.y, 10, z1, P, 32), { tone: "faint" }));
  const t = k.radialTicks(B.x, B.y, 27, 36, 36, z1, [3, 3], P);
  out.push(L(t.minor, { tone: "lo" }));
  out.push(L(k.ring(B.x, B.y, 27, z1, P, 72), { tone: "faint" }));
  out.push(screw(P, B.x, B.y, z1 - 0.4, 4.4));
  return out.join("");
}

function crownWheel(P) {
  const out = [];
  const CX = 88;
  const CY = 14;
  const F = G.frameAlong([CX, CY, 0], UP);
  const z0 = Z.bridge1;
  const z1 = Z.bridge1 + 2.6;
  out.push(S(G.disc(z0, z1, 18, F, P, { steps: 56, bevel: 0.5 }), { tone: "hi" }));
  out.push(L(k.ring(CX, CY, 12, z1, P, 48), { tone: "faint" }));
  const t = k.radialTicks(CX, CY, 21, 28, 28, z1, [3, 3], P);
  out.push(L(t.minor, { tone: "lo" }));
  out.push(L(k.ring(CX, CY, 21, z1, P, 56), { tone: "faint" }));
  out.push(screw(P, CX, CY, z1 - 0.4, 3.6));
  out.push(S(k.extrude(beam(CX - 16, CY - 8, 0, 20, -0.6, 2.2), z0, 2.2, P, { bevel: 0.4 }), { tone: "hi" }));
  out.push(D([iso(P, [CX - 16, CY - 8, z0 + 2.2])], { size: 0.45, tone: "mid" }));
  return out.join("");
}

// The lit part: balance wheel, staff, timing screws and hairspring.
function balance(P) {
  const out = [];
  const F = G.frameAlong([BAL.x, BAL.y, 0], UP);
  const rim0 = Z.balance0;
  const rim1 = Z.balance1;
  // Hairspring: 11 flat turns from the staff out to the stud, under the arms.
  const studAngle = (150 * Math.PI) / 180;
  const turns = 11;
  const hs = [];
  for (let i = 0; i <= 340; i++) {
    const t = i / 340;
    const a = studAngle - (1 - t) * turns * TAU;
    hs.push([BAL.x + (8 + 24 * t) * Math.cos(a), BAL.y + (8 + 24 * t) * Math.sin(a), 65.7]);
  }
  out.push(`<path class="iso-line" data-tone="faint" style="stroke-width:.85" d="${k.pathOf(hs.map((p) => iso(P, p)))}"/>`);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 6;
    out.push(S(k.extrude(beam(BAL.x, BAL.y, 8, BAL.r - 2, a, 3.1), rim0, 2.6, P, { bevel: 0.4 }), { tone: "lit", lit: true }));
  }
  out.push(ringSolid(P, BAL.x, BAL.y, BAL.r - 6, BAL.r, rim0, rim1, { steps: 112, tone: "hi", lit: true, crease: "lo" }));
  out.push(S(k.cylinder(BAL.x, BAL.y, 10, rim0, 5, P, 32), { tone: "lit", lit: true }));
  out.push(L(k.ring(BAL.x, BAL.y, 8, rim0 + 5, P, 24), { tone: "lo" }));
  for (let i = 0; i < 12; i++) {
    const [x, y] = polar(BAL.x, BAL.y, BAL.r - 3, (i / 12) * TAU + 0.12);
    out.push(S(k.cylinder(x, y, 2.1, rim1 - 0.4, 1.2, P, 16, 0.25), { tone: "lit", lit: true }));
    out.push(D([iso(P, [x, y, rim1 + 0.8])], { size: 0.42, tone: "lo" }));
  }
  out.push(S(k.cylinder(BAL.x, BAL.y, 2.6, Z.boss1 - 2, rim1 - Z.boss1 + 2, P, 16), { tone: "lit", lit: true }));
  out.push(S(k.cylinder(BAL.x, BAL.y, 5.2, rim1 - 0.6, Z.cap1 - rim1 + 0.6, P, 28, 0.4), { tone: "lit", lit: true }));
  out.push(L(k.ring(BAL.x, BAL.y, 5.2, Z.cap1, P, 24), { tone: "lo" }));
  out.push(D([iso(P, [BAL.x, BAL.y, Z.cap1])], { size: 0.5, tone: "lo" }));
  return out.join("");
}

// ---------------------------------------------------------------------------

export function parts(P) {
  const F = G.frameAlong([0, 0, 0], UP);
  const body = [
    S(G.disc(Z.cover0, Z.cover1, 124, F, P, { steps: 112 }), { tone: "lo" }) + L(k.ring(0, 0, 118, Z.cover1, P, 112), { tone: "faint" }),
    `<g data-spin="rotor">${rotor(P)}</g>`,
    plate(P),
    barrel(P),
    `<g data-spin="escape">${escapeWheel(P)}</g>`,
    palletFork(P),
    arbor(P, T4, Z.bridge0 + 2) + goingWheel(P, T4, T4.z0, T4.z1, 28, 4, 0.35),
    arbor(P, T3, Z.bridge0 + 2) + goingWheel(P, T3, T3.z0, T3.z1, 32, 5, 0.2),
    arbor(P, C, Z.bridge0 + 2) + goingWheel(P, C, C.z0, C.z1, 40, 5),
    wheelBridges(P),
    balanceCock(P),
    ratchetWheel(P),
    crownWheel(P),
    `<g data-spin="balance">${balance(P)}</g>`,
  ].join("");
  return [{ id: "movement", body }];
}
