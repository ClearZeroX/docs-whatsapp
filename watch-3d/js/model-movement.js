/* =========================================================================
 * Mechanical Watch — 3D Teardown
 * js/model-movement.js — 机芯组件：主夹板 / 自动陀 / 条盒 / 轮系 / 擒纵轮 /
 *                        擒纵叉 / 摆轮游丝 / 夹板组 / 棘轮上链轮
 * 单位：1 unit = 10 mm；机芯直径 25.6 mm (r 1.28)，机芯厚度 4.6 mm。
 * 坐标：x 右 / y 上（表盘朝 +y）/ z 朝观察者；12 点 = -z，3 点 = +x。
 * 全部程序化生成，无外部资源。三角形预算约 6 万。
 * ========================================================================= */
(function () {
  'use strict';

  function build(ctx) {
    const T = ctx.T;
    const TWO_PI = Math.PI * 2;
    const out = {};

    /* ------------------------------------------------------------------
     * 装配尺寸：所有几何都落在 y -0.38 .. 0.08、r <= 1.28 之内
     * ---------------------------------------------------------------- */
    const PLATE_TOP = -0.2395;          // 主夹板上表面（镀镍 + 珍珠纹）
    const BRIDGE_BOTTOM = -0.070;       // 夹板底面
    const BRIDGE_TOP = -0.034;          // 夹板顶面
    const BALANCE_Y = 0.004;            // 摆轮环中心高度

    const POS = {
      barrel: [0.382, -0.382],          // 1:30 方向，条盒轮轴
      crown: [0.801, 0.000],            // 3 点方向，上链轮
      third: [0.329, 0.200],            // 三番车
      fourth: [0.312, 0.540],           // 四番车
      escape: [0.580, 0.460],           // 擒纵轮
      pallet: [0.185, 0.394],           // 擒纵叉轴
      balance: [-0.380, 0.300],         // 摆轮轴
      stud: [-0.674, 0.357],            // 游丝桩
      click: [0.750, -0.700],           // 棘爪轴
      pads: [                            // 6 只夹板固定点 / 机芯支柱
        [0.376, -1.034], [0.971, -0.516], [1.096, -0.096],  // 条盒夹板（2-3 点）
        [1.034, 0.376], [0.516, 0.971],                      // 轮系夹板（5 点）
        [-1.005, 0.447]                                      // 摆轮夹板（8 点）
      ]
    };

    /* ==================================================================
     * 通用小工具
     * ================================================================ */
    function standard(color, metalness, roughness, extra) {
      return new T.MeshStandardMaterial(Object.assign({
        color: color, metalness: metalness, roughness: roughness
      }, extra || {}));
    }

    function add(parent, geo, material, x, y, z, rx, ry, rz) {
      const mesh = new T.Mesh(geo, material);
      mesh.position.set(x || 0, y || 0, z || 0);
      if (rx) mesh.rotation.x = rx;
      if (ry) mesh.rotation.y = ry;
      if (rz) mesh.rotation.z = rz;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    function cylMesh(rTop, rBot, h, material, seg) {
      return new T.Mesh(new T.CylinderGeometry(rTop, rBot, h, seg || 16), material);
    }

    // 把 ExtrudeGeometry（绕 X 转平后）的底面移到 y = bottom
    function extrudeXZ(shape, depth, bevel, curveSegments) {
      const geo = new T.ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: bevel > 0 ? 1 : 0,
        curveSegments: curveSegments || 12,
        steps: 1
      });
      geo.rotateX(-Math.PI / 2);   // shape 平面 -> xz 平面，shape +y -> 世界 -z
      geo.computeBoundingBox();
      geo.translate(0, -geo.boundingBox.min.y, 0);
      geo.computeBoundingBox();
      return geo;
    }

    function placePlate(parent, shape, yBottom, depth, bevel, capMat, sideMat) {
      const geo = extrudeXZ(shape, depth, bevel, 14);
      const mesh = new T.Mesh(geo, sideMat ? [capMat, sideMat] : capMat);
      mesh.position.y = yBottom;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    // 世界 xz 多边形 -> Shape（shape +y 对应 12 点方向）
    function polyShape(points) {
      const shape = new T.Shape();
      points.forEach((p, i) => {
        if (i === 0) shape.moveTo(p[0], -p[1]);
        else shape.lineTo(p[0], -p[1]);
      });
      shape.closePath();
      return shape;
    }

    // 环形扇区（转子摆陀 / 配重弧）
    function bandShape(r0, r1, a0, a1) {
      const shape = new T.Shape();
      shape.absarc(0, 0, r1, a0, a1, false);
      shape.absarc(0, 0, r0, a1, a0, true);
      shape.closePath();
      return shape;
    }

    // 齿轮轮廓（梯形齿）— 可带轴孔与减重孔
    function gearShape(teeth, rOut, rRoot, opts) {
      opts = opts || {};
      const shape = new T.Shape();
      const step = TWO_PI / teeth;
      for (let i = 0; i < teeth; i++) {
        const a0 = i * step;
        const pts = [
          [a0, rRoot],
          [a0 + step * 0.28, rOut],
          [a0 + step * 0.72, rOut],
          [a0 + step, rRoot]
        ];
        pts.forEach((pt, j) => {
          const x = Math.cos(pt[0]) * pt[1];
          const y = Math.sin(pt[0]) * pt[1];
          if (i === 0 && j === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        });
      }
      shape.closePath();
      if (opts.bore) {
        const bore = new T.Path();
        bore.absarc(0, 0, opts.bore, 0, TWO_PI, true);
        shape.holes.push(bore);
      }
      const holes = opts.holes || 0;
      if (holes > 0) {
        for (let k = 0; k < holes; k++) {
          const a = (k / holes) * TWO_PI + Math.PI / holes;
          const hole = new T.Path();
          hole.absarc(Math.cos(a) * opts.holeRadius, Math.sin(a) * opts.holeRadius, opts.holeSize, 0, TWO_PI, true);
          shape.holes.push(hole);
        }
      }
      return shape;
    }

    // 15 齿棒头（club tooth）擒纵轮轮廓
    function escapeShape(teeth, rOut, rRoot, bore, crossings) {
      const shape = new T.Shape();
      const step = TWO_PI / teeth;
      for (let i = 0; i < teeth; i++) {
        const a0 = i * step;
        const f = [
          [0.00, rRoot],
          [0.36, rRoot],
          [0.47, rOut * 0.80],
          [0.57, rOut],
          [0.79, rOut],                 // 棒头锁面
          [0.87, rRoot + (rOut - rRoot) * 0.18],
          [1.00, rRoot]
        ];
        f.forEach((pt, j) => {
          const a = a0 + step * pt[0];
          const x = Math.cos(a) * pt[1];
          const y = Math.sin(a) * pt[1];
          if (i === 0 && j === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        });
      }
      shape.closePath();
      const b = new T.Path();
      b.absarc(0, 0, bore, 0, TWO_PI, true);
      shape.holes.push(b);
      if (crossings > 0) {
        for (let k = 0; k < crossings; k++) {
          const a = (k / crossings) * TWO_PI + Math.PI / crossings;
          const hole = new T.Path();
          hole.absarc(Math.cos(a) * 0.142, Math.sin(a) * 0.142, 0.058, 0, TWO_PI, true);
          shape.holes.push(hole);
        }
      }
      return shape;
    }

    // Chaikin 平滑（闭合折线）
    function chaikin(points, iterations) {
      let out = points;
      for (let it = 0; it < (iterations || 1); it++) {
        const next = [];
        for (let i = 0; i < out.length; i++) {
          const p = out[i];
          const q = out[(i + 1) % out.length];
          next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
          next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
        }
        out = next;
      }
      return out;
    }

    /*  多个圆 / 胶囊的并集轮廓（marching squares）。夹板就是这种有机外形。 */
    function unionShape(primitives, bbox, res) {
      const x0 = bbox[0], z0 = bbox[1], x1 = bbox[2], z1 = bbox[3];
      const nx = res;
      const nz = Math.max(12, Math.round(res * (z1 - z0) / (x1 - x0)));
      const gx = (x1 - x0) / nx, gz = (z1 - z0) / nz;
      const prims = primitives.map((p) => p.length === 3
        ? { circle: true, ax: p[0], az: p[1], r: p[2] }
        : { circle: false, ax: p[0], az: p[1], bx: p[2], bz: p[3], r: p[4] });
      function sdf(x, z) {
        let best = 1e9;
        for (let k = 0; k < prims.length; k++) {
          const p = prims[k];
          let d;
          if (p.circle) {
            d = Math.hypot(x - p.ax, z - p.az) - p.r;
          } else {
            const vx = p.bx - p.ax, vz = p.bz - p.az;
            const len2 = vx * vx + vz * vz;
            let t = ((x - p.ax) * vx + (z - p.az) * vz) / len2;
            t = t < 0 ? 0 : (t > 1 ? 1 : t);
            d = Math.hypot(x - (p.ax + t * vx), z - (p.az + t * vz)) - p.r;
          }
          if (d < best) best = d;
        }
        return best;
      }
      const val = new Float32Array((nx + 1) * (nz + 1));
      for (let j = 0; j <= nz; j++) {
        for (let i = 0; i <= nx; i++) {
          val[j * (nx + 1) + i] = sdf(x0 + i * gx, z0 + j * gz);
        }
      }
      function gridX(i) { return x0 + i * gx; }
      function gridZ(j) { return z0 + j * gz; }
      function crossH(i, j) {  // bottom edge of cell (i,j)
        const va = val[j * (nx + 1) + i], vb = val[j * (nx + 1) + i + 1];
        const t = va / (va - vb);
        return [gridX(i) + gx * t, gridZ(j)];
      }
      function crossV(i, j) {  // left edge of cell (i,j)
        const va = val[j * (nx + 1) + i], vb = val[(j + 1) * (nx + 1) + i];
        const t = va / (va - vb);
        return [gridX(i), gridZ(j) + gz * t];
      }
      const points = [];
      const key2idx = new Map();
      const pointKey = (p) => p[0].toFixed(5) + ',' + p[1].toFixed(5);
      function idxOf(p) {
        const k = pointKey(p);
        let idx = key2idx.get(k);
        if (idx === undefined) {
          idx = points.length;
          points.push(p);
          key2idx.set(k, idx);
        }
        return idx;
      }
      const edges = [];
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const v00 = val[j * (nx + 1) + i];
          const v10 = val[j * (nx + 1) + i + 1];
          const v01 = val[(j + 1) * (nx + 1) + i];
          const v11 = val[(j + 1) * (nx + 1) + i + 1];
          const code = (v00 < 0 ? 1 : 0) | (v10 < 0 ? 2 : 0) | (v11 < 0 ? 4 : 0) | (v01 < 0 ? 8 : 0);
          if (code === 0 || code === 15) continue;
          const eB = (code & 1) !== (code & 2) ? crossH(i, j) : null;
          const eR = (code & 2) !== (code & 4) ? crossV(i + 1, j) : null;
          const eT = (code & 4) !== (code & 8) ? crossH(i, j + 1) : null;
          const eL = (code & 8) !== (code & 1) ? crossV(i, j) : null;
          const push = (a, b) => { if (a && b) edges.push([idxOf(a), idxOf(b)]); };
          switch (code) {
            case 1: case 14: push(eL, eB); break;
            case 2: case 13: push(eB, eR); break;
            case 3: case 12: push(eL, eR); break;
            case 4: case 11: push(eR, eT); break;
            case 6: case 9: push(eB, eT); break;
            case 7: case 8: push(eL, eT); break;
            case 5: push(eL, eT); push(eB, eR); break;
            case 10: push(eL, eB); push(eR, eT); break;
            default: break;
          }
        }
      }
      // 把线段串成闭合环
      const adj = new Map();
      for (let e = 0; e < edges.length; e++) {
        const a = edges[e][0], b = edges[e][1];
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(e);
        adj.get(b).push(e);
      }
      const used = new Uint8Array(edges.length);
      let best = null;
      for (let e = 0; e < edges.length; e++) {
        if (used[e]) continue;
        const loop = [];
        let curEdge = e;
        let curPoint = edges[e][0];
        for (let guard = 0; guard < edges.length + 4; guard++) {
          used[curEdge] = 1;
          loop.push(points[curPoint]);
          const a = edges[curEdge][0], b = edges[curEdge][1];
          curPoint = (curPoint === a) ? b : a;
          const list = adj.get(curPoint) || [];
          let nextEdge = -1;
          for (let k = 0; k < list.length; k++) {
            if (!used[list[k]]) { nextEdge = list[k]; break; }
          }
          if (nextEdge < 0) break;
          curEdge = nextEdge;
        }
        if (loop.length > 6 && (!best || loop.length > best.length)) best = loop;
      }
      if (!best) return polyShape(bboxFallback(primitives));
      const smooth = chaikin(best, 1);
      const shape = new T.Shape();
      const first = smooth[0];
      shape.moveTo(first[0], -first[1]);
      for (let i = 1; i < smooth.length; i++) shape.lineTo(smooth[i][0], -smooth[i][1]);
      shape.closePath();
      return shape;
    }
    function bboxFallback(primitives) {
      let x0 = 9, z0 = 9, x1 = -9, z1 = -9;
      primitives.forEach((p) => {
        const r = p.length === 3 ? p[2] : p[4];
        const xs = p.length === 3 ? [p[0]] : [p[0], p[2]];
        const zs = p.length === 3 ? [p[1]] : [p[1], p[3]];
        xs.forEach((x) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); });
        zs.forEach((z) => { z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); });
      });
      return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    }

    /* ==================================================================
     * 纹理（Canvas2D -> CanvasTexture，全部程序化）
     * ================================================================ */
    const TEX = {};

    // 珍珠纹 perlage：一排排相互叠压的旋涡圆纹
    TEX.perlage = ctx.makeTexture(512, 512, function (c, w, h) {
      c.fillStyle = '#bcb9b1';
      c.fillRect(0, 0, w, h);
      const base = c.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, w * 0.72);
      base.addColorStop(0, 'rgba(255,255,250,0.30)');
      base.addColorStop(0.7, 'rgba(120,122,118,0.18)');
      base.addColorStop(1, 'rgba(38,40,40,0.45)');
      c.fillStyle = base;
      c.fillRect(0, 0, w, h);
      const step = 34;
      for (let row = -1; row * step < h + step; row++) {
        for (let col = -1; col * step < w + step; col++) {
          const x = col * step + (row % 2 ? step / 2 : 0) + (Math.random() - 0.5) * 5;
          const y = row * step + (Math.random() - 0.5) * 5;
          const r = step * 0.74;
          const a0 = Math.random() * TWO_PI;
          for (let ring = 1; ring <= 6; ring++) {
            const rr = r * (ring / 6);
            c.strokeStyle = ring % 2 ? 'rgba(255,255,250,0.36)' : 'rgba(44,46,45,0.32)';
            c.lineWidth = 2.1;
            c.beginPath();
            c.arc(x, y, rr, a0, a0 + Math.PI * 1.55);
            c.stroke();
          }
          c.fillStyle = 'rgba(255,255,246,0.05)';
          c.beginPath();
          c.arc(x - r * 0.18, y - r * 0.18, r * 0.5, 0, TWO_PI);
          c.fill();
        }
      }
    });

    // 日内瓦波纹 côtes de Genève：弧形明暗条带
    TEX.cotes = ctx.makeTexture(512, 512, function (c, w, h) {
      c.fillStyle = '#b8b7b2';
      c.fillRect(0, 0, w, h);
      const bands = 11;
      const bw = w / bands;
      const freq = TWO_PI * 3 / h;
      for (let i = -1; i <= bands; i++) {
        const x0 = i * bw;
        const g = c.createLinearGradient(x0, 0, x0 + bw, 0);
        g.addColorStop(0.00, 'rgba(26,27,28,0.88)');
        g.addColorStop(0.12, 'rgba(104,106,104,0.32)');
        g.addColorStop(0.36, 'rgba(255,255,250,0.54)');
        g.addColorStop(0.55, 'rgba(226,228,224,0.38)');
        g.addColorStop(0.82, 'rgba(74,76,76,0.62)');
        g.addColorStop(1.00, 'rgba(26,27,28,0.88)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(x0, 0);
        for (let y = 0; y <= h; y += 8) c.lineTo(x0 + Math.sin(y * freq) * 11, y);
        for (let y = h; y >= 0; y -= 8) c.lineTo(x0 + bw + Math.sin(y * freq + 0.55) * 11, y);
        c.closePath();
        c.fill();
      }
      c.strokeStyle = 'rgba(255,255,250,0.10)';
      c.lineWidth = 1;
      for (let i = 0; i < 46; i++) {
        const x = i * 11.5;
        c.beginPath();
        for (let y = 0; y <= h; y += 8) {
          const px = x + Math.sin(y * freq) * 11;
          if (y === 0) c.moveTo(px, y); else c.lineTo(px, y);
        }
        c.stroke();
      }
    });

    // 同心圆打磨（棘轮 / 齿轮端面）
    TEX.grain = ctx.makeTexture(256, 256, function (c, w, h) {
      c.fillStyle = '#c8c6bf';
      c.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (let r = 3; r < w * 0.52; r += 2.4) {
        c.strokeStyle = (Math.floor(r / 2.4) % 2) ? 'rgba(255,255,250,0.34)' : 'rgba(46,48,46,0.30)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(cx, cy, r, 0, TWO_PI);
        c.stroke();
      }
      const g = c.createRadialGradient(cx, cy, 4, cx, cy, w * 0.52);
      g.addColorStop(0, 'rgba(255,255,250,0.18)');
      g.addColorStop(1, 'rgba(28,30,30,0.36)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });

    // 放射状拉丝（棘轮 / 上链轮端面）
    TEX.radial = ctx.makeTexture(256, 256, function (c, w, h) {
      c.fillStyle = '#c8c6bf';
      c.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      for (let i = 0; i < 220; i++) {
        const a = (i / 220) * TWO_PI;
        c.strokeStyle = i % 2 ? 'rgba(255,255,250,0.26)' : 'rgba(44,46,44,0.22)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * w * 0.055, cy + Math.sin(a) * w * 0.055);
        c.lineTo(cx + Math.cos(a) * w * 0.5, cy + Math.sin(a) * w * 0.5);
        c.stroke();
      }
      const g = c.createRadialGradient(cx, cy, 6, cx, cy, w * 0.52);
      g.addColorStop(0, 'rgba(255,255,250,0.20)');
      g.addColorStop(0.7, 'rgba(255,255,250,0.02)');
      g.addColorStop(1, 'rgba(28,30,30,0.32)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });

    // 主夹板环形刻字
    TEX.engrave = ctx.makeTexture(1024, 1024, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const R = w * 0.4315;
      const text = 'CALIBRE 2824  ·  25 JEWELS  ·  SWISS MADE  ·  ADJUSTED TO 5 POSITIONS  ·  ';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 36px "Helvetica Neue", Arial, sans-serif';
      c.fillStyle = 'rgba(26,20,11,0.98)';
      const chars = text.split('');
      const widths = chars.map((ch) => c.measureText(ch).width + 3.2);
      const total = widths.reduce((s, v) => s + v, 0);
      let a = -Math.PI / 2 - (total / R) / 2;
      for (let i = 0; i < chars.length; i++) {
        const mid = a + (widths[i] / R) / 2;
        c.save();
        c.translate(cx + Math.cos(mid) * R, cy + Math.sin(mid) * R);
        c.rotate(mid + Math.PI / 2);
        c.fillText(chars[i], 0, 0);
        c.restore();
        a += widths[i] / R;
      }
      // 内外两条细刻线
      c.strokeStyle = 'rgba(30,24,13,0.72)';
      c.lineWidth = 3;
      [0.395, 0.470].forEach((f) => {
        c.beginPath();
        c.arc(cx, cy, w * f, 0, TWO_PI);
        c.stroke();
      });
      // 6 个定位小点
      c.fillStyle = 'rgba(30,24,13,0.78)';
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * TWO_PI - Math.PI / 2;
        c.beginPath();
        c.arc(cx + Math.cos(ang) * w * 0.433, cy + Math.sin(ang) * w * 0.433, 3.2, 0, TWO_PI);
        c.fill();
      }
    });

    // 自动陀刻字
    TEX.rotorMark = ctx.makeTexture(512, 128, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 52px "Helvetica Neue", Arial, sans-serif';
      c.fillStyle = 'rgba(232,242,252,0.72)';
      c.fillText('CALIBRE  2824', w / 2, h / 2 - 8);
      c.font = '500 28px "Helvetica Neue", Arial, sans-serif';
      c.fillStyle = 'rgba(210,225,240,0.5)';
      c.fillText('AUTOMATIC  ·  SWISS', w / 2, h / 2 + 34);
    });

    // 夹板刻字（小铭牌）
    TEX.bridgeMark = ctx.makeTexture(512, 128, function (c, w, h) {
      c.clearRect(0, 0, w, h);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '600 44px "Helvetica Neue", Arial, sans-serif';
      c.fillStyle = 'rgba(38,29,15,0.95)';
      c.fillText('2824  ·  25 JEWELS', w / 2, h / 2);
    });

    /* ==================================================================
     * 主夹板
     * ================================================================ */
    function buildMainplate() {
      const g = new T.Group();
      const mPlate = standard(0x6e7271, 0.74, 0.42);
      const mTop = standard(0x7f8380, 0.55, 0.44, { map: TEX.perlage });
      const mEngrave = new T.MeshBasicMaterial({
        map: TEX.engrave, transparent: true, opacity: 0.88, depthWrite: false
      });
      const mSteel = standard(0xa9b3bf, 0.92, 0.28);
      const mSteelDark = standard(0x76808c, 0.90, 0.38);
      const mDark = standard(0x24282d, 0.85, 0.58);
      const mBlued = standard(0x25406e, 0.88, 0.30);
      const mGold = standard(0xb98d43, 0.62, 0.38);
      const mRuby = standard(0x841323, 0.20, 0.16, { emissive: 0x30030a, emissiveIntensity: 0.9 });

      // 车削主夹板：上下倒角 + 外缘圆弧
      const profile = [
        [-0.3185, 0.0008],
        [-0.3185, 1.092],
        [-0.3172, 1.202],
        [-0.3105, 1.252],
        [-0.2985, 1.2745],
        [-0.2830, 1.280],
        [-0.2665, 1.2725],
        [-0.2550, 1.2455],
        [-0.2482, 1.1990],
        [-0.2450, 1.1150],
        [-0.2450, 0.0008]
      ];
      const body = new T.Mesh(ctx.lathe(profile, 120), mPlate);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      // 顶面珍珠纹圆盘 + 环形刻字 + 刻线
      const top = new T.Mesh(new T.CircleGeometry(1.238, 128), mTop);
      top.rotation.x = -Math.PI / 2;
      top.position.y = PLATE_TOP;
      top.receiveShadow = true;
      g.add(top);

      const ring = new T.Mesh(new T.RingGeometry(0.905, 1.206, 160, 1), mEngrave);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = PLATE_TOP + 0.0014;
      g.add(ring);

      [0.897, 1.212].forEach(function (r) {
        const groove = new T.Mesh(new T.TorusGeometry(r, 0.0032, 5, 128), mDark);
        groove.rotation.x = Math.PI / 2;
        groove.position.y = PLATE_TOP + 0.0012;
        g.add(groove);
      });

      // 表背侧同心圆打磨（拆开后从表背可见）
      const bottom = new T.Mesh(new T.CircleGeometry(1.238, 120),
        standard(0x83878a, 0.55, 0.46, { map: TEX.grain }));
      bottom.rotation.x = Math.PI / 2;
      bottom.position.y = -0.3200;
      bottom.receiveShadow = true;
      g.add(bottom);

      // 6 只机芯支柱（连接夹板）
      function pillarAt(x, z) {
        const shaft = new T.Mesh(new T.CylinderGeometry(0.029, 0.033, 0.170, 14), mSteel);
        shaft.position.set(x, -0.1545, z);
        shaft.castShadow = true;
        g.add(shaft);
        const foot = new T.Mesh(ctx.ringGeometry(0.034, 0.056, -0.241, -0.229, 20), mSteelDark);
        foot.position.set(x, 0, z);
        g.add(foot);
        const neck = new T.Mesh(new T.CylinderGeometry(0.040, 0.040, 0.012, 14), mSteelDark);
        neck.position.set(x, -0.0735, z);
        g.add(neck);
      }
      POS.pads.forEach(function (p) { pillarAt(p[0], p[1]); });

      // 夹板固定螺丝（露在部件之间的 5 枚）
      function plateScrew(x, z, y, r, mat) {
        const collar = new T.Mesh(ctx.ringGeometry(r * 1.02, r * 1.52, y - 0.004, y + 0.0012, 20), mDark);
        collar.position.set(x, 0, z);
        g.add(collar);
        const head = cylMesh(r, r * 0.92, 0.011, mat, 16);
        head.position.set(x, y + 0.0055, z);
        head.castShadow = true;
        g.add(head);
        const slot = new T.Mesh(new T.BoxGeometry(r * 1.65, 0.0022, r * 0.30), mDark);
        slot.position.set(x, y + 0.0115, z);
        slot.rotation.y = Math.random() * Math.PI;
        g.add(slot);
      }
      plateScrew(-0.862, -0.420, PLATE_TOP, 0.040, mBlued);
      plateScrew(-0.552, -0.930, PLATE_TOP, 0.036, mSteel);
      plateScrew(-0.985, 0.022, PLATE_TOP, 0.036, mSteel);
      plateScrew(0.020, 0.780, PLATE_TOP, 0.034, mSteel);
      plateScrew(-0.300, 0.900, PLATE_TOP, 0.030, mBlued);

      // 宝石轴承（主夹板侧轴孔，共 9 颗）
      function jewel(x, z, r, opts) {
        opts = opts || {};
        const chaton = new T.Mesh(new T.RingGeometry(r * 0.84, r * 1.45, 22), mGold);
        chaton.rotation.x = -Math.PI / 2;
        chaton.position.set(x, PLATE_TOP + 0.0012, z);
        g.add(chaton);
        const gem = cylMesh(r * 0.86, r * 0.70, 0.011, mRuby, 14);
        gem.position.set(x, PLATE_TOP + 0.0055, z);
        g.add(gem);
        if (opts.shock) {
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * TWO_PI + 0.4;
            const prong = new T.Mesh(new T.TorusGeometry(r * 1.16, 0.0045, 4, 8, 1.5), mGold);
            prong.rotation.x = Math.PI / 2;
            prong.rotation.z = a;
            prong.position.set(x, PLATE_TOP + 0.009, z);
            g.add(prong);
          }
        }
      }
      jewel(0, 0, 0.062, { shock: true });                        // 中心管
      jewel(POS.third[0], POS.third[1], 0.045);                   // 三番车下轴
      jewel(POS.fourth[0], POS.fourth[1], 0.040);                 // 四番车下轴
      jewel(POS.escape[0], POS.escape[1], 0.036);                 // 擒纵轮下轴
      jewel(POS.pallet[0], POS.pallet[1], 0.030);                 // 擒纵叉下轴
      jewel(POS.balance[0], POS.balance[1], 0.048, { shock: true }); // 摆轮下轴
      jewel(-0.700, 0.752, 0.044, { shock: true });               // 装饰宝石
      jewel(0.120, 0.862, 0.040);                                 // 装饰宝石
      jewel(-0.952, -0.252, 0.038);                               // 装饰宝石
      jewel(-0.615, 0.862, 0.040, { shock: true });               // 6:30 装饰宝石
      plateScrew(-0.120, 0.988, PLATE_TOP, 0.030, mSteel);
      plateScrew(-0.815, 0.640, PLATE_TOP, 0.028, mBlued);

      // 中心凸台
      const centerBoss = new T.Mesh(ctx.ringGeometry(0.118, 0.158, PLATE_TOP - 0.002, PLATE_TOP + 0.006, 40), mSteelDark);
      g.add(centerBoss);

      // 边缘一圈小凹点（车削纹）
      const dotGeo = new T.SphereGeometry(0.009, 6, 5);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TWO_PI;
        const dot = new T.Mesh(dotGeo, mDark);
        dot.position.set(Math.cos(a) * 1.196, PLATE_TOP + 0.0015, Math.sin(a) * 1.196);
        dot.scale.y = 0.35;
        g.add(dot);
      }

      return g;
    }

    /* ==================================================================
     * 自动陀（半圆盘 + 辐条 + 配重弧 + 7 珠轴承）
     * ================================================================ */
    function buildRotor() {
      const g = new T.Group();
      const spin = new T.Group();
      spin.name = 'spin';
      spin.userData.spinKind = 'rotor';
      g.add(spin);

      const rotorTex = TEX.radial.clone();
      rotorTex.needsUpdate = true;
      rotorTex.wrapS = rotorTex.wrapT = T.ClampToEdgeWrapping;
      rotorTex.repeat.set(1 / (2 * 1.16 * 1.06), 1 / (2 * 1.16 * 1.06));
      rotorTex.offset.set(0.5, 0.5);
      const mBody = standard(0xc4cad0, 0.38, 0.48, { map: rotorTex });
      const mBodyDark = standard(0x8b949c, 0.65, 0.44);
      const mSteel = standard(0xc2ccd6, 0.92, 0.24);
      const mSteelDark = standard(0x7a8490, 0.90, 0.34);
      const mGold = standard(0xc1964a, 0.72, 0.34);
      const mDark = standard(0x22262c, 0.85, 0.55);
      const mRuby = standard(0x841323, 0.20, 0.16, { emissive: 0x30030a, emissiveIntensity: 0.9 });

      // 半圆盘：200° 环形扇区 + 3 个减重孔（留下轮缘与辐条）
      const discShape = bandShape(0.300, 1.155, -Math.PI * 0.555, Math.PI * 0.555);
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI * 0.37 + k * Math.PI * 0.37;
        const hole = new T.Path();
        hole.absarc(Math.cos(a) * 0.725, Math.sin(a) * 0.725, 0.212, 0, TWO_PI, true);
        discShape.holes.push(hole);
      }
      placePlate(spin, discShape, -0.354, 0.024, 0.004, mBody, mBodyDark);

      // 配重弧：外缘一段向下加厚的弧形配重
      const cwShape = bandShape(0.995, 1.150, -Math.PI * 0.30, Math.PI * 0.30);
      placePlate(spin, cwShape, -0.372, 0.010, 0.003, mBody, mBodyDark);

      // 3 枚配重螺丝（朝向表背）
      [-0.55, 0, 0.55].forEach(function (a) {
        const x = Math.cos(a) * 1.070, z = Math.sin(a) * 1.070;
        const head = cylMesh(0.044, 0.040, 0.009, mSteel, 18);
        head.position.set(x, -0.3735, z);
        spin.add(head);
        const slot = new T.Mesh(new T.BoxGeometry(0.072, 0.0026, 0.010), mDark);
        slot.position.set(x, -0.3787, z);
        slot.rotation.y = -a;
        spin.add(slot);
      });

      // 7 珠滚珠轴承（表背侧可见：内外圈 + 7 颗钢珠 + 中心宝石）
      const outerRace = new T.Mesh(ctx.ringGeometry(0.192, 0.262, -0.376, -0.340, 48), mGold);
      g.add(outerRace);
      const innerRace = cylMesh(0.098, 0.098, 0.044, mGold, 24);
      innerRace.position.y = -0.356;
      g.add(innerRace);
      const ballGeo = new T.SphereGeometry(0.019, 10, 8);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TWO_PI + 0.2;
        const ball = new T.Mesh(ballGeo, mSteel);
        ball.position.set(Math.cos(a) * 0.160, -0.358, Math.sin(a) * 0.160);
        ball.castShadow = true;
        g.add(ball);
      }
      const endStone = new T.Mesh(new T.CircleGeometry(0.034, 18), mRuby);
      endStone.rotation.x = Math.PI / 2;
      endStone.position.y = -0.3775;
      g.add(endStone);
      const cap = cylMesh(0.058, 0.052, 0.008, mSteelDark, 18);
      cap.position.set(0, -0.326, 0);
      g.add(cap);

      // 表背侧刻字
      const markMat = new T.MeshBasicMaterial({ map: TEX.rotorMark, transparent: true, opacity: 0.5, depthWrite: false });
      const mark = new T.Mesh(new T.PlaneGeometry(0.50, 0.125), markMat);
      mark.rotation.x = Math.PI / 2;
      mark.position.set(0.62, -0.3555, 0.0);
      spin.add(mark);

      // 轮缘装饰刻线
      [1.012, 1.148].forEach(function (r) {
        const groove = new T.Mesh(new T.TorusGeometry(r, 0.0026, 4, 96, Math.PI * 1.05), mDark);
        groove.rotation.x = Math.PI / 2;
        groove.rotation.z = 0.55;
        groove.position.y = -0.3724;
        spin.add(groove);
      });

      return g;
    }

    /* ==================================================================
     * 条盒轮与主发条
     * ================================================================ */
    function buildBarrel() {
      const g = new T.Group();
      g.position.set(POS.barrel[0], 0, POS.barrel[1]);

      const mBrass = standard(0xbe9445, 0.68, 0.34);
      const mBrassDark = standard(0x92722f, 0.64, 0.42);
      const mSteel = standard(0xa9b3bf, 0.92, 0.28);
      const mBlued = standard(0x27436f, 0.88, 0.30);
      const mGold = standard(0xb98d43, 0.62, 0.38);
      const mRuby = standard(0x841323, 0.20, 0.16, { emissive: 0x30030a, emissiveIntensity: 0.9 });
      const grain = TEX.grain.clone();
      grain.needsUpdate = true;
      grain.wrapS = grain.wrapT = T.ClampToEdgeWrapping;
      grain.repeat.set(1 / (2 * 0.49 * 1.06), 1 / (2 * 0.49 * 1.06));
      grain.offset.set(0.5, 0.5);
      const mToothCap = standard(0xc7a250, 0.62, 0.36, { map: grain });

      // 条盒壁 + 底
      const wall = new T.Mesh(ctx.ringGeometry(0.442, 0.468, -0.215, -0.147, 96), mBrassDark);
      g.add(wall);
      const bottom = cylMesh(0.445, 0.445, 0.014, mBrass, 96);
      bottom.position.y = -0.208;
      bottom.castShadow = true;
      g.add(bottom);

      // 40 齿条盒轮齿圈（顶部）
      const teethShape = gearShape(40, 0.490, 0.462, { bore: 0.442 });
      placePlate(g, teethShape, -0.147, 0.022, 0.005, mToothCap, mBrass);

      // 顶沿抛光唇口
      const lip = new T.Mesh(ctx.ringGeometry(0.438, 0.470, -0.118, -0.112, 96), mBrass);
      g.add(lip);

      // 主发条：阿基米德螺线 TubeGeometry
      const spring = new T.Mesh(spiralTube(0.092, 0.424, 5.25, -0.176, 0.0062, 190, 0.6), mBlued);
      spring.castShadow = true;
      g.add(spring);
      // 发条外端挂钩 + 内端挂条轴
      const outerHook = new T.Mesh(new T.BoxGeometry(0.036, 0.028, 0.016), mBlued);
      outerHook.position.set(0.412, -0.176, 0.10);
      outerHook.rotation.y = 0.3;
      g.add(outerHook);
      const innerHook = new T.Mesh(new T.BoxGeometry(0.030, 0.026, 0.014), mBlued);
      innerHook.position.set(0.070, -0.176, 0.062);
      innerHook.rotation.y = -0.9;
      g.add(innerHook);

      // 条轴
      const arbor = cylMesh(0.036, 0.036, 0.240, mSteel, 20);
      arbor.position.y = -0.124;
      arbor.castShadow = true;
      g.add(arbor);
      const collar = cylMesh(0.052, 0.052, 0.022, mSteel, 22);
      collar.position.y = -0.118;
      g.add(collar);
      const square = new T.Mesh(new T.BoxGeometry(0.078, 0.024, 0.078), mSteel);
      square.position.y = -0.058;
      square.rotation.y = Math.PI / 4;
      g.add(square);

      // 条轴底部宝石
      const chaton = new T.Mesh(new T.RingGeometry(0.046, 0.076, 20), mGold);
      chaton.rotation.x = -Math.PI / 2;
      chaton.position.y = -0.218;
      g.add(chaton);
      const gem = cylMesh(0.044, 0.036, 0.012, mRuby, 14);
      gem.position.y = -0.213;
      g.add(gem);

      // 条盒壁上的 3 枚小螺丝（拆解后可见）
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TWO_PI + 0.7;
        const s = cylMesh(0.016, 0.014, 0.008, mSteel, 10);
        s.position.set(Math.cos(a) * 0.455, -0.185, Math.sin(a) * 0.455);
        s.rotation.z = Math.PI / 2;
        s.rotation.y = -a;
        g.add(s);
      }

      return g;
    }

    function spiralTube(r0, r1, turns, y, tubeR, segments, phase) {
      const pts = [];
      const total = turns * TWO_PI;
      const count = Math.max(24, Math.round(segments));
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const a = phase + t * total;
        const rr = r0 + (r1 - r0) * t;
        pts.push(new T.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
      }
      const curve = new T.CatmullRomCurve3(pts);
      return new T.TubeGeometry(curve, count, tubeR, 4, false);
    }

    /* ==================================================================
     * 轮系：二番车（中心轮 40T）/ 三番车（32T）/ 四番车（28T）
     * ================================================================ */
    function buildTrain() {
      const g = new T.Group();

      const mBrass = standard(0xbe9445, 0.68, 0.34);
      const mSteel = standard(0xa9b3bf, 0.92, 0.28);
      const mGold = standard(0xc09544, 0.66, 0.36);
      const mRuby = standard(0x841323, 0.20, 0.16, { emissive: 0x30030a, emissiveIntensity: 0.9 });

      function grainMat(r, color) {
        const tex = TEX.grain.clone();
        tex.needsUpdate = true;
        tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
        tex.repeat.set(1 / (2 * r * 1.10), 1 / (2 * r * 1.10));
        tex.offset.set(0.5, 0.5);
        return standard(color, 0.62, 0.36, { map: tex });
      }

      function wheel(parent, teeth, rOut, rRoot, yBottom, thickness, holes, holeRadius, holeSize, bore) {
        const shape = gearShape(teeth, rOut, rRoot, {
          bore: bore, holes: holes, holeRadius: holeRadius, holeSize: holeSize
        });
        const bevel = 0.003;
        const depth = thickness - bevel * 2;
        placePlate(parent, shape, yBottom, depth, bevel, grainMat(rOut, 0xc8a24e), mBrass);
      }

      function pinion(parent, leaves, rOut, yBottom, height) {
        const bevel = 0.0025;
        const shape = gearShape(leaves, rOut, rOut * 0.68, {});
        placePlate(parent, shape, yBottom, height - bevel * 2, bevel, mSteel, mSteel);
      }

      function arbor(parent, x, z, r, y0, y1) {
        const m = cylMesh(r, r, y1 - y0, mSteel, 12);
        m.position.set(x, (y0 + y1) / 2, z);
        m.castShadow = true;
        parent.add(m);
        return m;
      }

      // ---- 二番车（中心轮）：不动，指针轴 ----
      wheel(g, 40, 0.335, 0.300, -0.100, 0.022, 5, 0.185, 0.078, 0.030);
      pinion(g, 11, 0.056, -0.175, 0.063);
      arbor(g, 0, 0, 0.022, -0.239, -0.050);
      // 中心轮毂
      const chub = cylMesh(0.058, 0.058, 0.026, mBrass, 20);
      chub.position.y = -0.089;
      g.add(chub);
      // 中心管
      const cannon = cylMesh(0.030, 0.030, 0.055, mSteel, 16);
      cannon.position.y = -0.075;
      g.add(cannon);

      // ---- 三番车：旋转子组 ----
      const spinThird = new T.Group();
      spinThird.name = 'spin';
      spinThird.userData.spinKind = 'trainThird';
      spinThird.position.set(POS.third[0], 0, POS.third[1]);
      g.add(spinThird);
      wheel(spinThird, 32, 0.300, 0.268, -0.150, 0.022, 5, 0.165, 0.066, 0.026);
      pinion(spinThird, 12, 0.053, -0.115, 0.043);
      arbor(spinThird, 0, 0, 0.019, -0.239, -0.048);

      // ---- 四番车：旋转子组 ----
      const spinFourth = new T.Group();
      spinFourth.name = 'spin';
      spinFourth.userData.spinKind = 'trainFourth';
      spinFourth.position.set(POS.fourth[0], 0, POS.fourth[1]);
      g.add(spinFourth);
      wheel(spinFourth, 28, 0.240, 0.212, -0.100, 0.022, 4, 0.132, 0.052, 0.024);
      pinion(spinFourth, 10, 0.045, -0.150, 0.045);
      arbor(spinFourth, 0, 0, 0.017, -0.239, -0.046);

      // 三 / 四番车在夹板侧的轴颈套
      [POS.third, POS.fourth].forEach(function (p) {
        const collar = cylMesh(0.032, 0.032, 0.008, mSteel, 14);
        collar.position.set(p[0], -0.075, p[1]);
        g.add(collar);
      });

      // 轮系盖宝石（夹板上的宝石属于夹板组，这里补两枚小垫圈）
      const jewelRing = new T.Mesh(new T.RingGeometry(0.020, 0.032, 14), mRuby);
      jewelRing.rotation.x = -Math.PI / 2;
      jewelRing.position.set(0, -0.099, 0);
      g.add(jewelRing);

      return g;
    }

    /* ==================================================================
     * 擒纵轮（15 齿棒头）
     * ================================================================ */
    function buildEscape() {
      const part = new T.Group();
      part.position.set(POS.escape[0], 0, POS.escape[1]);
      const spin = new T.Group();
      spin.name = 'spin';
      spin.userData.spinKind = 'escape';
      part.add(spin);

      const mSteel = standard(0xc2ad77, 0.72, 0.32);
      const mSteelDark = standard(0x9c8a58, 0.65, 0.40);
      const mSteelBlue = standard(0xaab4c0, 0.90, 0.28);

      function grainMat(r, color) {
        const tex = TEX.grain.clone();
        tex.needsUpdate = true;
        tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
        tex.repeat.set(1 / (2 * r * 1.10), 1 / (2 * r * 1.10));
        tex.offset.set(0.5, 0.5);
        return standard(color, 0.66, 0.34, { map: tex });
      }

      const shape = escapeShape(15, 0.260, 0.214, 0.052, 4);
      placePlate(spin, shape, -0.200, 0.032, 0.004, grainMat(0.26, 0xcab268), mSteelDark);

      // 轮毂 + 3 枚轮辐小销
      const hub = cylMesh(0.058, 0.058, 0.044, mSteelDark, 16);
      hub.position.y = -0.178;
      spin.add(hub);

      // 擒纵小齿轴
      const pinionShape = gearShape(8, 0.041, 0.030, {});
      placePlate(spin, pinionShape, -0.110, 0.034, 0.002, mSteelBlue, mSteelBlue);
      const arbor = cylMesh(0.014, 0.014, 0.190, mSteelBlue, 10);
      arbor.position.y = -0.145;
      spin.add(arbor);

      return part;
    }

    /* ==================================================================
     * 擒纵叉（瑞士杠杆式）
     * ================================================================ */
    function buildPallet() {
      const part = new T.Group();
      part.position.set(POS.pallet[0], 0, POS.pallet[1]);

      const mSteel = standard(0xaab4bf, 0.90, 0.30);
      const mSteelDark = standard(0x78828e, 0.88, 0.38);
      const mRuby = standard(0x8a1626, 0.20, 0.15, { emissive: 0x30030a, emissiveIntensity: 0.9 });
      const mGold = standard(0xb98d43, 0.62, 0.38);

      // 叉体：局部 +x 指向摆轮，-x 指向擒纵轮
      const bodyShape = new T.Shape();
      const body = [
        [0.330, 0.016], [0.440, 0.016], [0.440, 0.072], [0.372, 0.086],
        [0.290, 0.056], [0.020, 0.060], [-0.020, 0.060], [-0.020, -0.060],
        [0.290, -0.056], [0.372, -0.086], [0.440, -0.072], [0.440, -0.016],
        [0.330, -0.016]
      ];
      body.forEach(function (p, i) {
        if (i === 0) bodyShape.moveTo(p[0], p[1]);
        else bodyShape.lineTo(p[0], p[1]);
      });
      bodyShape.closePath();
      const bodyMesh = placePlate(part, bodyShape, -0.185, 0.016, 0.003, mSteel, mSteelDark);
      bodyMesh.position.y = -0.185;

      // 叉口两枚护钉
      [0.058, -0.058].forEach(function (z) {
        const pin = cylMesh(0.010, 0.010, 0.028, mSteel, 8);
        pin.position.set(0.398, -0.171, z);
        part.add(pin);
      });

      // 轴座
      const boss = cylMesh(0.044, 0.044, 0.020, mSteelDark, 18);
      boss.position.y = -0.176;
      part.add(boss);
      const pivot = cylMesh(0.016, 0.016, 0.150, mSteel, 12);
      pivot.position.y = -0.135;
      part.add(pivot);

      // 两枚叉瓦臂（朝向擒纵轮）+ 红宝石瓦
      function palletArm(sign) {
        const armShape = new T.Shape();
        const pts = [
          [0.020, sign * 0.020], [-0.070, sign * 0.052], [-0.160, sign * 0.086],
          [-0.176, sign * 0.060], [-0.090, sign * 0.024], [-0.010, sign * -0.006]
        ];
        pts.forEach(function (p, i) {
          if (i === 0) armShape.moveTo(p[0], p[1]);
          else armShape.lineTo(p[0], p[1]);
        });
        armShape.closePath();
        const arm = placePlate(part, armShape, -0.183, 0.014, 0.002, mSteel, mSteelDark);
        arm.position.y = -0.183;
        const stone = new T.Mesh(new T.BoxGeometry(0.046, 0.030, 0.028), mRuby);
        stone.position.set(-0.166, -0.170, sign * 0.078);
        stone.rotation.y = sign * 0.30;
        stone.rotation.z = sign * 0.22;
        part.add(stone);
        const stoneSeat = new T.Mesh(new T.BoxGeometry(0.058, 0.012, 0.036), mSteelDark);
        stoneSeat.position.set(-0.162, -0.181, sign * 0.078);
        stoneSeat.rotation.y = sign * 0.30;
        part.add(stoneSeat);
      }
      palletArm(1);
      palletArm(-1);

      // 叉尾 / 限位钉
      const tail = new T.Mesh(new T.BoxGeometry(0.070, 0.014, 0.026), mSteelDark);
      tail.position.set(-0.050, -0.176, 0);
      part.add(tail);

      // 角色变换：让局部 +x 指向摆轮轴
      const dx = POS.balance[0] - POS.pallet[0];
      const dz = POS.balance[1] - POS.pallet[1];
      part.rotation.y = Math.atan2(-dz, dx);

      return part;
    }

    /* ==================================================================
     * 摆轮 + 游丝（机芯主角，唯一带自发光的高光部件）
     * ================================================================ */
    function buildBalance() {
      const part = new T.Group();
      part.position.set(POS.balance[0], 0, POS.balance[1]);
      const spin = new T.Group();
      spin.name = 'spin';
      spin.userData.spinKind = 'balance';
      part.add(spin);

      const mGold = standard(0xe0a52f, 0.62, 0.38, {
        emissive: 0x6a3a08, emissiveIntensity: 1.15
      });
      const mGoldDark = standard(0xa87a26, 0.60, 0.44, {
        emissive: 0x2a1704, emissiveIntensity: 0.7
      });
      const mSteel = standard(0xc3ccd7, 0.92, 0.24);
      const mSteelDark = standard(0x7d8792, 0.90, 0.34);
      const mHair = new T.MeshBasicMaterial({ color: 0x2a4a75 });
      const mRuby = standard(0x8a1626, 0.20, 0.15, { emissive: 0x30030a, emissiveIntensity: 0.9 });
      const mDark = standard(0x22262c, 0.85, 0.55);

      // 摆轮环：金色圆环（机芯主角，唯一带自发光的高光部件）
      const rim = new T.Mesh(new T.TorusGeometry(0.440, 0.030, 14, 96), mGold);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = BALANCE_Y;
      rim.castShadow = true;
      spin.add(rim);

      // 内圈抛光台阶
      const innerLine = new T.Mesh(new T.TorusGeometry(0.408, 0.009, 8, 96), mGoldDark);
      innerLine.rotation.x = Math.PI / 2;
      innerLine.position.y = BALANCE_Y + 0.010;
      spin.add(innerLine);

      // 3 条摆臂
      function arm(angle) {
        const shape = new T.Shape();
        shape.moveTo(0.050, -0.056);
        shape.lineTo(0.418, -0.034);
        shape.lineTo(0.418, 0.034);
        shape.lineTo(0.050, 0.056);
        shape.closePath();
        const mesh = placePlate(spin, shape, BALANCE_Y - 0.008, 0.014, 0.0018, mGold, mGoldDark);
        mesh.position.y = BALANCE_Y - 0.008;
        mesh.rotation.y = -angle;
        return mesh;
      }
      arm(0.45);
      arm(0.45 + TWO_PI / 3);
      arm(0.45 + TWO_PI * 2 / 3);

      // 轮毂
      const hub = cylMesh(0.080, 0.072, 0.034, mGoldDark, 24);
      hub.position.y = BALANCE_Y;
      spin.add(hub);
      const hubTop = cylMesh(0.050, 0.062, 0.010, mSteel, 20);
      hubTop.position.y = BALANCE_Y + 0.021;
      spin.add(hubTop);

      // 12 枚配重螺丝：径向贯穿轮缘，螺丝头露在轮缘上表面
      const screwBodyGeo = new T.CylinderGeometry(0.017, 0.017, 0.038, 10);
      const screwHeadGeo = new T.CylinderGeometry(0.023, 0.019, 0.012, 16);
      const screwSlotGeo = new T.BoxGeometry(0.042, 0.0024, 0.009);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TWO_PI + 0.13;
        const dir = new T.Vector3(Math.cos(a), 0, Math.sin(a));
        const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
        const body = new T.Mesh(screwBodyGeo, mSteelDark);
        body.position.set(dir.x * 0.440, BALANCE_Y, dir.z * 0.440);
        body.quaternion.copy(q);
        spin.add(body);
        const head = new T.Mesh(screwHeadGeo, mSteel);
        head.position.set(dir.x * 0.440, BALANCE_Y + 0.029, dir.z * 0.440);
        head.castShadow = true;
        spin.add(head);
        const slot = new T.Mesh(screwSlotGeo, mDark);
        slot.position.set(dir.x * 0.440, BALANCE_Y + 0.0355, dir.z * 0.440);
        slot.rotation.y = -a + 0.28;
        spin.add(slot);
      }

      // 摆轴
      const staff = cylMesh(0.020, 0.020, 0.245, mSteel, 12);
      staff.position.y = -0.0725;
      spin.add(staff);
      const staffTop = cylMesh(0.012, 0.020, 0.022, mSteel, 12);
      staffTop.position.y = 0.064;
      spin.add(staffTop);

      // 双圆盘 / 摆轮销（与擒纵叉配合，位于擒纵平面）
      const roller = cylMesh(0.150, 0.150, 0.012, mSteelDark, 32);
      roller.position.y = -0.198;
      spin.add(roller);
      const rollerRim = new T.Mesh(new T.TorusGeometry(0.150, 0.008, 6, 40), mSteel);
      rollerRim.rotation.x = Math.PI / 2;
      rollerRim.position.y = -0.198;
      spin.add(rollerRim);
      const impulse = cylMesh(0.013, 0.013, 0.060, mRuby, 10);
      impulse.position.set(0.143, -0.170, 0.024);
      spin.add(impulse);
      const guard = cylMesh(0.008, 0.008, 0.030, mSteel, 8);
      guard.position.set(-0.150, -0.180, 0);
      spin.add(guard);

      // 11 圈平面游丝（细管，蓝钢）
      const hair = new T.Mesh(spiralTube(0.072, 0.294, 11, 0.046, 0.0021, 300, Math.PI * 0.94), mHair);
      hair.castShadow = false;
      hair.receiveShadow = false;
      spin.add(hair);
      const collet = cylMesh(0.021, 0.021, 0.012, mGold, 12);
      collet.position.y = 0.046;
      spin.add(collet);

      // 摆轮上盖石 + 避震簧
      const chaton = new T.Mesh(ctx.ringGeometry(0.038, 0.070, 0.052, 0.060, 24), mGold);
      spin.add(chaton);
      const capJewel = cylMesh(0.036, 0.030, 0.012, mRuby, 14);
      capJewel.position.y = 0.066;
      spin.add(capJewel);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TWO_PI + 0.2;
        const prong = new T.Mesh(new T.TorusGeometry(0.058, 0.005, 4, 8, 1.4), mGold);
        prong.rotation.x = Math.PI / 2;
        prong.rotation.z = a;
        prong.position.y = 0.070;
        spin.add(prong);
      }

      return part;
    }

    /* ==================================================================
     * 夹板组：条盒夹板 / 轮系夹板 / 摆轮夹板（日内瓦波纹）
     * ================================================================ */
    function buildBridges() {
      const g = new T.Group();

      const cotes = TEX.cotes;
      cotes.wrapS = cotes.wrapT = T.RepeatWrapping;
      cotes.repeat.set(1, 1);
      cotes.rotation = -0.35;
      cotes.center.set(0.5, 0.5);

      const mCap = standard(0xb4b7b6, 0.55, 0.40, { map: cotes });
      const mSide = standard(0x8f9294, 0.72, 0.42);
      const mSteel = standard(0xb0bac6, 0.92, 0.26);
      const mSteelDark = standard(0x76808c, 0.90, 0.38);
      const mGold = standard(0xb98d43, 0.62, 0.38);
      const mBlued = standard(0x25406e, 0.88, 0.30);
      const mDark = standard(0x24282d, 0.85, 0.58);
      const mRuby = standard(0x841323, 0.20, 0.16, { emissive: 0x30030a, emissiveIntensity: 0.9 });

      function bridgePlate(prims, bbox) {
        const shape = unionShape(prims, bbox, 118);
        return placePlate(g, shape, BRIDGE_BOTTOM, 0.022, 0.007, mCap, mSide);
      }

      // ---- 条盒夹板（12:40 ~ 2:50 + 支承条盒轴与上链轮） ----
      const barrelPrims = [
        [POS.barrel[0], POS.barrel[1], 0.300],
        [POS.crown[0], POS.crown[1], 0.235],
        [POS.barrel[0], POS.barrel[1], POS.crown[0], POS.crown[1], 0.170],
        [POS.barrel[0], POS.barrel[1], 0.376, -1.034, 0.155],
        [0.376, -1.034, 0.155],
        [POS.crown[0], POS.crown[1], 1.096, -0.096, 0.155],
        [1.096, -0.096, 0.155],
        [0.376, -1.034, 0.971, -0.516, 0.140],
        [0.971, -0.516, 0.140],
        [0.971, -0.516, 1.096, -0.096, 0.140]
      ];
      bridgePlate(barrelPrims, [-0.06, -1.31, 1.30, 0.31]);

      // ---- 轮系夹板（三 / 四番车 + 擒纵轮 + 擒纵叉上轴） ----
      const trainPrims = [
        [POS.escape[0], POS.escape[1], 0.122],
        [POS.fourth[0], POS.fourth[1], 0.132],
        [POS.third[0], POS.third[1], 0.126],
        [POS.escape[0], POS.escape[1], POS.fourth[0], POS.fourth[1], 0.086],
        [POS.fourth[0], POS.fourth[1], POS.third[0], POS.third[1], 0.082],
        [POS.escape[0], POS.escape[1], POS.pallet[0], POS.pallet[1], 0.034],
        [POS.pallet[0], POS.pallet[1], 0.070],
        [POS.escape[0], POS.escape[1], 1.034, 0.376, 0.100],
        [1.034, 0.376, 0.155],
        [POS.escape[0], POS.escape[1], 0.516, 0.971, 0.100],
        [0.516, 0.971, 0.155]
      ];
      bridgePlate(trainPrims, [0.09, 0.04, 1.23, 1.17]);

      // ---- 摆轮夹板（8 点方向到摆轮轴，带快慢针与游丝桩） ----
      const cockPrims = [
        [POS.balance[0], POS.balance[1], 0.200],
        [POS.stud[0], POS.stud[1], 0.135],
        [POS.balance[0], POS.balance[1], POS.pads[5][0], POS.pads[5][1], 0.145],
        [POS.pads[5][0], POS.pads[5][1], 0.155]
      ];
      bridgePlate(cockPrims, [-1.19, 0.10, -0.14, 0.64]);

      // ---- 夹板上的凸台 + 宝石 ----
      function boss(x, z, r, jewelR, opts) {
        opts = opts || {};
        const pad = cylMesh(r, r * 0.96, 0.008, mSide, 32);
        pad.position.set(x, BRIDGE_TOP + 0.0045, z);
        pad.castShadow = true;
        g.add(pad);
        if (opts.settingScrews) {
          for (let s = 0; s < 2; s++) {
            const a = (s ? 1 : -1) * 0.62 + (opts.angle || 0);
            const hx = x + Math.cos(a) * (r + 0.030);
            const hz = z + Math.sin(a) * (r + 0.030);
            const sh = cylMesh(0.015, 0.013, 0.006, mSteel, 10);
            sh.position.set(hx, BRIDGE_TOP + 0.0095, hz);
            g.add(sh);
            const ss = new T.Mesh(new T.BoxGeometry(0.021, 0.0018, 0.0045), mDark);
            ss.position.set(hx, BRIDGE_TOP + 0.0130, hz);
            ss.rotation.y = a;
            g.add(ss);
          }
        }
        const chaton = new T.Mesh(new T.RingGeometry(jewelR * 0.78, jewelR * 1.40, 22), mGold);
        chaton.rotation.x = -Math.PI / 2;
        chaton.position.set(x, BRIDGE_TOP + 0.0092, z);
        g.add(chaton);
        const gem = cylMesh(jewelR * 0.82, jewelR * 0.66, 0.011, mRuby, 14);
        gem.position.set(x, BRIDGE_TOP + 0.0135, z);
        g.add(gem);
        if (opts.shock) {
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * TWO_PI + 0.5;
            const prong = new T.Mesh(new T.TorusGeometry(jewelR * 1.22, 0.0045, 4, 8, 1.5), mGold);
            prong.rotation.x = Math.PI / 2;
            prong.rotation.z = a;
            prong.position.set(x, BRIDGE_TOP + 0.018, z);
            g.add(prong);
          }
        }
      }
      boss(POS.barrel[0], POS.barrel[1], 0.165, 0.078, { settingScrews: true, angle: 1.9 });  // 条盒轴
      boss(POS.crown[0], POS.crown[1], 0.135, 0.062, { settingScrews: true, angle: 2.4 });     // 上链轮
      boss(POS.escape[0], POS.escape[1], 0.102, 0.062, { shock: true });
      boss(POS.fourth[0], POS.fourth[1], 0.092, 0.048);
      boss(POS.third[0], POS.third[1], 0.086, 0.042);
      boss(POS.pallet[0], POS.pallet[1], 0.078, 0.036);          // 擒纵叉上轴
      boss(POS.balance[0], POS.balance[1], 0.140, 0.070, { shock: true, settingScrews: true, angle: 2.0 });

      // ---- 夹板固定螺丝（6 枚，落在 6 只机芯支柱上） ----
      POS.pads.forEach(function (p, i) {
        const r = 0.046;
        const collar = new T.Mesh(new T.RingGeometry(r * 0.98, r * 1.62, 24), mDark);
        collar.rotation.x = -Math.PI / 2;
        collar.position.set(p[0], BRIDGE_TOP + 0.0012, p[1]);
        g.add(collar);
        const head = cylMesh(r, r * 0.90, 0.012, i % 3 === 1 ? mBlued : mSteel, 18);
        head.position.set(p[0], BRIDGE_TOP + 0.0075, p[1]);
        head.castShadow = true;
        g.add(head);
        const slot = new T.Mesh(new T.BoxGeometry(r * 1.7, 0.0024, r * 0.30), mDark);
        slot.position.set(p[0], BRIDGE_TOP + 0.0142, p[1]);
        slot.rotation.y = i * 0.9;
        g.add(slot);
      });

      // ---- 夹板中部的抛光螺丝 ----
      function bridgeScrew(x, z, r, mat, angle) {
        const head = cylMesh(r, r * 0.9, 0.011, mat, 16);
        head.position.set(x, BRIDGE_TOP + 0.0062, z);
        g.add(head);
        const slot = new T.Mesh(new T.BoxGeometry(r * 1.7, 0.0022, r * 0.30), mDark);
        slot.position.set(x, BRIDGE_TOP + 0.0125, z);
        slot.rotation.y = angle || 0;
        g.add(slot);
      }
      bridgeScrew(0.640, -0.150, 0.034, mSteel, 0.4);
      bridgeScrew(0.300, -0.760, 0.030, mBlued, 1.1);
      bridgeScrew(0.470, 0.300, 0.030, mSteel, 2.0);
      bridgeScrew(-0.790, 0.365, 0.030, mSteel, 0.8);
      bridgeScrew(0.600, -0.860, 0.028, mSteel, 0.2);
      bridgeScrew(1.030, -0.300, 0.028, mBlued, 1.5);

      // ---- 夹板铭牌刻字（条盒夹板，靠近 1 点方向） ----
      const markMat = new T.MeshBasicMaterial({ map: TEX.bridgeMark, transparent: true, opacity: 0.75, depthWrite: false });
      const mark = new T.Mesh(new T.PlaneGeometry(0.56, 0.14), markMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0.585, BRIDGE_TOP + 0.0012, -0.835);
      mark.rotation.z = -0.55;
      g.add(mark);

      // ---- 快慢针（regulator arm） ----
      const regShape = new T.Shape();
      regShape.moveTo(-0.070, -0.020);
      regShape.lineTo(0.205, -0.016);
      regShape.lineTo(0.250, -0.030);
      regShape.lineTo(0.250, 0.030);
      regShape.lineTo(0.205, 0.016);
      regShape.lineTo(-0.070, 0.020);
      regShape.closePath();
      const regulator = placePlate(g, regShape, BRIDGE_TOP + 0.008, 0.005, 0.0012, mBlued, mBlued);
      regulator.position.set(POS.balance[0], BRIDGE_TOP + 0.008, POS.balance[1] + 0.055);
      regulator.rotation.y = -0.10;
      // 快慢针的叉口
      [0.030, -0.030].forEach(function (dz) {
        const prong = new T.Mesh(new T.BoxGeometry(0.052, 0.006, 0.013), mBlued);
        prong.position.set(POS.balance[0] + 0.245, BRIDGE_TOP + 0.011, POS.balance[1] + 0.055 + dz);
        g.add(prong);
      });
      // 快慢针轴钉
      const regPivot = new T.Mesh(new T.BoxGeometry(0.05, 0.012, 0.026), mDark);
      regPivot.position.set(POS.balance[0] + 0.090, BRIDGE_TOP + 0.012, POS.balance[1] + 0.055);
      g.add(regPivot);

      // 快慢针刻度
      for (let i = 0; i < 5; i++) {
        const tick = new T.Mesh(new T.BoxGeometry(0.010, 0.002, i === 2 ? 0.030 : 0.020), mDark);
        tick.position.set(
          POS.balance[0] + 0.200 + i * 0.020,
          BRIDGE_TOP + 0.0085,
          POS.balance[1] + 0.128 - i * 0.011
        );
        tick.rotation.y = 0.5;
        g.add(tick);
      }

      // ---- 游丝桩（hairspring stud） ----
      const studPost = cylMesh(0.026, 0.026, 0.074, mGold, 12);
      studPost.position.set(POS.stud[0], BRIDGE_TOP + 0.035, POS.stud[1]);
      g.add(studPost);
      const studBlock = new T.Mesh(new T.BoxGeometry(0.056, 0.024, 0.046), mGold);
      studBlock.position.set(POS.stud[0], 0.040, POS.stud[1]);
      g.add(studBlock);
      const studScrew = cylMesh(0.017, 0.015, 0.010, mBlued, 10);
      studScrew.position.set(POS.stud[0] + 0.012, 0.056, POS.stud[1]);
      g.add(studScrew);

      return g;
    }

    /* ==================================================================
     * 棘轮 + 上链轮 + 棘爪
     * ================================================================ */
    function buildRatchet() {
      const g = new T.Group();

      const mBrass = standard(0xbe9445, 0.68, 0.34);
      const mBrassDark = standard(0x8e6d2f, 0.62, 0.44);
      const mSteel = standard(0xb6c0cb, 0.92, 0.26);
      const mBlued = standard(0x25406e, 0.88, 0.30);
      const mBluedDark = standard(0x1d3156, 0.90, 0.36);
      const mDark = standard(0x24282d, 0.85, 0.58);
      const mSteelDark = standard(0x78828e, 0.88, 0.38);

      function wheelAt(x, z, teeth, rOut, rRoot, bore, holes, holeRadius, holeSize, matCap) {
        const tex = TEX.radial.clone();
        tex.needsUpdate = true;
        tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
        tex.repeat.set(1 / (2 * rOut * 1.10), 1 / (2 * rOut * 1.10));
        tex.offset.set(0.5, 0.5);
        const capMat = standard(0xc7a14e, 0.62, 0.36, { map: tex });
        const shape = gearShape(teeth, rOut, rRoot, {
          bore: bore, holes: holes, holeRadius: holeRadius, holeSize: holeSize
        });
        const mesh = placePlate(g, shape, -0.026, 0.018, 0.004, capMat, mBrass);
        mesh.position.set(x, -0.026, z);
        return mesh;
      }

      // 棘轮 36T（条盒轴上）
      wheelAt(POS.barrel[0], POS.barrel[1], 36, 0.348, 0.298, 0.088, 3, 0.175, 0.062);
      // 上链轮 28T（3 点方向）
      wheelAt(POS.crown[0], POS.crown[1], 28, 0.260, 0.212, 0.070, 0, 0, 0);

      // 中央蓝钢螺丝
      function centerScrew(x, z, r) {
        const collar = new T.Mesh(ctx.ringGeometry(r * 0.95, r * 1.30, -0.008, -0.001, 24), mSteel);
        collar.position.set(x, 0, z);
        g.add(collar);
        const head = cylMesh(r, r * 0.92, 0.012, mBlued, 20);
        head.position.set(x, 0.004, z);
        head.castShadow = true;
        g.add(head);
        const slot = new T.Mesh(new T.BoxGeometry(r * 1.72, 0.0026, r * 0.30), mBluedDark);
        slot.position.set(x, 0.0106, z);
        slot.rotation.y = 0.6;
        g.add(slot);
      }
      centerScrew(POS.barrel[0], POS.barrel[1], 0.092);
      centerScrew(POS.crown[0], POS.crown[1], 0.070);

      // 棘轮上的 3 枚小固定螺丝
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TWO_PI + 0.4;
        const x = POS.barrel[0] + Math.cos(a) * 0.245;
        const z = POS.barrel[1] + Math.sin(a) * 0.245;
        const head = cylMesh(0.024, 0.022, 0.010, mSteel, 12);
        head.position.set(x, 0.001, z);
        g.add(head);
        const slot = new T.Mesh(new T.BoxGeometry(0.034, 0.0022, 0.008), mDark);
        slot.position.set(x, 0.0066, z);
        slot.rotation.y = a;
        g.add(slot);
      }

      // 棘爪（擒爪）+ 弹簧
      const clickPrims = [
        [POS.click[0], POS.click[1], 0.045],
        [0.651, -0.614, 0.024],
        [POS.click[0], POS.click[1], 0.651, -0.614, 0.026],
        [0.826, -0.792, 0.020],
        [POS.click[0], POS.click[1], 0.826, -0.792, 0.018]
      ];
      const clickShape = unionShape(clickPrims, [0.60, -0.84, 0.86, -0.55], 72);
      const click = placePlate(g, clickShape, -0.020, 0.011, 0.002, mSteel, mSteelDark);
      click.position.y = -0.020;
      // 棘爪轴 + 蓝钢螺丝
      const clickPivot = cylMesh(0.030, 0.030, 0.014, mSteelDark, 16);
      clickPivot.position.set(POS.click[0], -0.010, POS.click[1]);
      g.add(clickPivot);
      const clickScrew = cylMesh(0.022, 0.020, 0.010, mBlued, 12);
      clickScrew.position.set(POS.click[0], -0.001, POS.click[1]);
      g.add(clickScrew);

      // 棘爪弹簧（弯钢丝）
      const springPts = [
        new T.Vector3(0.826, -0.012, -0.792),
        new T.Vector3(0.880, -0.020, -0.760),
        new T.Vector3(0.900, -0.028, -0.680),
        new T.Vector3(0.872, -0.030, -0.600)
      ];
      const springCurve = new T.CatmullRomCurve3(springPts);
      const clickSpring = new T.Mesh(new T.TubeGeometry(springCurve, 26, 0.0075, 4, false), mSteel);
      clickSpring.castShadow = true;
      g.add(clickSpring);
      const springPin = cylMesh(0.018, 0.018, 0.026, mSteelDark, 10);
      springPin.position.set(0.872, -0.016, -0.600);
      g.add(springPin);

      // 防倒转显示：棘轮外缘小倒角环
      const rimRing = new T.Mesh(ctx.ringGeometry(0.347, 0.355, -0.026, -0.004, 72), mBrassDark);
      rimRing.position.set(POS.barrel[0], 0, POS.barrel[1]);
      g.add(rimRing);
      const rimRing2 = new T.Mesh(ctx.ringGeometry(0.259, 0.267, -0.026, -0.004, 64), mBrassDark);
      rimRing2.position.set(POS.crown[0], 0, POS.crown[1]);
      g.add(rimRing2);

      return g;
    }

    /* ==================================================================
     * 组装
     * ================================================================ */
    out.mainplate = buildMainplate();
    out.rotor = buildRotor();
    out.barrel = buildBarrel();
    out.train = buildTrain();
    out.escapeWheel = buildEscape();
    out.palletFork = buildPallet();
    out.balance = buildBalance();
    out.bridges = buildBridges();
    out.ratchet = buildRatchet();

    return out;
  }

  window.WatchMovement = { build: build };
})();
