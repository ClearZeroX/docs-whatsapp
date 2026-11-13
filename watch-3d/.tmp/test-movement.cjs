// Scratch harness: load the movement builder in Node (canvas mocked) to check
// bounds, triangle counts, spin contract and for NaN geometry.
const fs = require('fs');
const path = require('path');
const THREE = require('../vendor/three/build/three.min.js');

const ROOT = path.join(__dirname, '..');

function mock2d() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'canvas') return { width: 512, height: 512 };
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof prop === 'string' && /^create(Linear|Radial|Conic)Gradient$/.test(prop)) return () => grad;
      if (typeof prop === 'string' && /^(fillStyle|strokeStyle|font|textAlign|textBaseline|lineWidth|lineCap|globalAlpha|shadowColor|shadowBlur|filter|lineJoin|miterLimit|globalCompositeOperation)$/.test(prop)) return undefined;
      return () => {};
    },
    set() { return true; }
  });
}

function mockCanvas() {
  const c = { width: 300, height: 150, style: {}, getContext: () => mock2d() };
  return c;
}

global.document = {
  createElement(tag) { return mockCanvas(); },
  createElementNS(ns, tag) { return mockCanvas(); }
};
global.window = {};

const win = global.window;
const run = (file) => {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  new Function('window', 'document', 'THREE', code)(win, global.document, THREE);
};

run('js/model-mats.js');
const KIT = win.WatchKit;
if (!KIT) throw new Error('WatchKit missing');
run('js/model-movement.js');
if (!win.WatchMovement) throw new Error('WatchMovement missing');

const ctx = Object.assign({}, KIT, { mats: KIT.MATS, makeTexture: KIT.makeTexture });

const t0 = process.hrtime.bigint();
const out = win.WatchMovement.build(ctx);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;

const IDS = ['bridges', 'balance', 'escapeWheel', 'palletFork', 'train', 'barrel', 'ratchet', 'mainplate', 'rotor'];
let totalTris = 0, totalMeshes = 0;
const problems = [];
let globalBox = new THREE.Box3();
let maxRadius = 0;
let minY = Infinity, maxY = -Infinity;

for (const id of IDS) {
  const g = out[id];
  if (!g) { problems.push('MISSING group: ' + id); continue; }
  if (!g.isGroup) problems.push(id + ' is not a THREE.Group');
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  let tris = 0, meshes = 0;
  let partMaxR = 0, partMinY = Infinity, partMaxY = -Infinity;
  const offenders = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const geo = o.geometry;
    if (!geo || !geo.attributes || !geo.attributes.position) {
      problems.push(id + ': mesh without position attribute (' + (geo && geo.type) + ')');
      return;
    }
    const count = geo.index ? geo.index.count : geo.attributes.position.count;
    tris += count / 3;
    if (!o.material) problems.push(id + ': mesh without material');
    if (Array.isArray(o.material)) o.material.forEach((m) => { if (!m || !m.isMaterial) problems.push(id + ': bad material in array'); });
    else if (!o.material.isMaterial) problems.push(id + ': bad material');
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
        problems.push(id + ': NaN vertex'); break;
      }
    }
    // world-space vertices for radius check
    o.updateMatrixWorld(true);
    const arr = pos.array;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) {
      v.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(o.matrixWorld);
      const r = Math.hypot(v.x, v.z);
      if (r > maxRadius) maxRadius = r;
      if (r > partMaxR) partMaxR = r;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.y < partMinY) partMinY = v.y;
      if (v.y > partMaxY) partMaxY = v.y;
      if (r > 1.2805 || v.y < -0.3803 || v.y > 0.0803) offenders.push(o.geometry.type + ' y=' + v.y.toFixed(3) + ' r=' + r.toFixed(3));
    }
  });
  totalTris += tris;
  totalMeshes += meshes;
  globalBox.union(box);
  const b = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  console.log(
    id.padEnd(12),
    'meshes', String(meshes).padStart(4),
    'tris', String(Math.round(tris)).padStart(6),
    '| y', box.min.y.toFixed(3), '..', box.max.y.toFixed(3),
    '| r', partMaxR.toFixed(3), '| yExact', partMinY.toFixed(3), partMaxY.toFixed(3),
    '| c', c.x.toFixed(2), c.y.toFixed(2), c.z.toFixed(2)
  );
  if (offenders.length) console.log('   offenders:', offenders.slice(0, 3).join(' | '), 'x' + offenders.length);
  // spin contract
  g.traverse((o) => {
    if (o.userData && o.userData.spinKind) {
      const p = new THREE.Vector3();
      o.getWorldPosition(p);
      console.log('   spin', o.userData.spinKind, 'at', p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2));
    }
  });
}

console.log('\nTOTAL meshes', totalMeshes, 'triangles', Math.round(totalTris), 'build ms', ms.toFixed(1));
console.log('world bbox y', globalBox.min.y.toFixed(4), '..', globalBox.max.y.toFixed(4));
console.log('world max radius', maxRadius.toFixed(4));
if (globalBox.min.y < -0.3805) problems.push('y below -0.38: ' + globalBox.min.y);
if (globalBox.max.y > 0.0805) problems.push('y above 0.08: ' + globalBox.max.y);
if (maxRadius > 1.283) problems.push('radius beyond 1.28: ' + maxRadius);
if (totalTris > 120000) problems.push('triangle budget exceeded: ' + Math.round(totalTris));

const expectSpins = {
  rotor: ['rotor'], balance: ['balance'], escapeWheel: ['escape'],
  train: ['trainFourth', 'trainThird']
};
for (const id of Object.keys(expectSpins)) {
  const found = [];
  out[id] && out[id].traverse((o) => { if (o.userData && o.userData.spinKind) found.push(o.userData.spinKind); });
  expectSpins[id].forEach((k) => { if (found.indexOf(k) < 0) problems.push('missing spinKind ' + k + ' in ' + id); });
}

if (problems.length) {
  console.log('\nPROBLEMS:');
  problems.slice(0, 40).forEach((p) => console.log(' -', p));
  process.exitCode = 1;
} else {
  console.log('\nOK: contract + bounds inside limits');
}
