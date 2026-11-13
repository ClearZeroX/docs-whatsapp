/* =========================================================================
 * Mechanical Watch — 3D Teardown
 * js/model-mats.js — shared materials, textures and geometry helpers
 * Units: 1 unit = 10 mm. Watch: 4.0 units across, 1.04 units high.
 * Axis: x right, y up (dial faces +y), z towards the viewer.
 * ========================================================================= */
(function () {
  'use strict';

  const T = THREE;

  const MATS = {};

  function standard(color, metalness, roughness, extra) {
    return new T.MeshStandardMaterial(Object.assign({ color: color, metalness: metalness, roughness: roughness }, extra || {}));
  }

  MATS.steel = standard(0xb8c0c9, 0.95, 0.28);
  MATS.steelDark = standard(0x8f98a3, 1.0, 0.36);
  MATS.chrome = standard(0xdde6f0, 0.95, 0.1);
  MATS.gold = standard(0xd8b26a, 1.0, 0.24);
  MATS.brass = standard(0xc7a052, 1.0, 0.3);
  MATS.copper = standard(0xc07a4a, 1.0, 0.32);
  MATS.gunmetal = standard(0x5a6169, 1.0, 0.3);
  MATS.blued = standard(0x2a4c8f, 1.0, 0.18);
  MATS.rubber = standard(0x14161a, 0.0, 0.86);
  MATS.plastic = standard(0x1c2128, 0.05, 0.55);
  MATS.ruby = standard(0x8c1b2c, 0.15, 0.12, { emissive: 0x2a0509, emissiveIntensity: 1.1 });
  MATS.lume = standard(0xdfe9f6, 0.0, 0.5, { emissive: 0x8fc2ff, emissiveIntensity: 0.7 });
  MATS.dialPaper = standard(0xe7e9e4, 0.0, 0.6);
  MATS.dialDark = standard(0x111820, 0.15, 0.42);
  MATS.print = standard(0x2b3038, 0.0, 0.6);

  MATS.sapphire = new T.MeshPhysicalMaterial({
    color: 0xcfe6ff,
    metalness: 0.0,
    roughness: 0.02,
    transparent: true,
    opacity: 0.16,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    side: T.DoubleSide,
    depthWrite: false
  });

  function makeTexture(w, h, draw, opts) {
    opts = opts || {};
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    const tex = new T.CanvasTexture(canvas);
    tex.encoding = opts.linear ? T.LinearEncoding : T.sRGBEncoding;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  // A lathe profile around the y axis: [[y, r], ...] from bottom to top.
  function lathe(points, segments) {
    const pts = points.map((p) => new T.Vector2(Math.max(0.0001, p[1]), p[0]));
    return new T.LatheGeometry(pts, segments || 96);
  }

  // A ring (tube with rectangular section) lying in the xz plane.
  function ringGeometry(rInner, rOuter, y0, y1, segments) {
    const pts = [
      new T.Vector2(rInner, y0),
      new T.Vector2(rOuter, y0),
      new T.Vector2(rOuter, y1),
      new T.Vector2(rInner, y1),
      new T.Vector2(rInner, y0)
    ];
    return new T.LatheGeometry(pts, segments || 96);
  }

  // A spur gear with trapezoid teeth, extruded along y.
  function gearGeometry(teeth, rOuter, rRoot, height, spokes, hubR) {
    const shape = new T.Shape();
    const step = (Math.PI * 2) / teeth;
    const tooth = step * 0.5;
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step;
      const a1 = a0 + tooth * 0.28;
      const a2 = a0 + tooth * 0.72;
      const a3 = a0 + step;
      const pts = [
        [a0, rRoot], [a1, rOuter], [a2, rOuter], [a3, rRoot]
      ];
      pts.forEach(([a, r], j) => {
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0 && j === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
    }
    shape.closePath();
    // Lightening holes between spokes.
    if (spokes && spokes >= 2) {
      const rMid = (rRoot + hubR) / 2;
      const holeR = Math.max(0.01, (rRoot - hubR) * 0.34);
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2 + Math.PI / spokes;
        const hole = new T.Path();
        hole.absarc(Math.cos(a) * rMid, Math.sin(a) * rMid, holeR, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
    }
    if (hubR) {
      const bore = new T.Path();
      bore.absarc(0, 0, hubR * 0.34, 0, Math.PI * 2, true);
      shape.holes.push(bore);
    }
    const geo = new T.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: true,
      bevelThickness: height * 0.12,
      bevelSize: Math.min(0.012, height * 0.2),
      bevelSegments: 1,
      curveSegments: 12,
      steps: 1
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, height, 0);
    return geo;
  }

  // A flat disc with optional groove rings, drawn as one geometry.
  function discGeometry(r, thickness, segments) {
    return new T.CylinderGeometry(r, r, thickness, segments || 96, 1, false);
  }

  window.WatchKit = {
    T: T,
    MATS: MATS,
    makeTexture: makeTexture,
    lathe: lathe,
    ringGeometry: ringGeometry,
    gearGeometry: gearGeometry,
    discGeometry: discGeometry
  };
})();
