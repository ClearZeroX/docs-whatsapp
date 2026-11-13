/* =========================================================================
 * Mechanical Watch — 3D Teardown
 * js/model-exterior.js — 外观件：表壳/表耳/表背/表圈/镜面/表盘/时标/指针/表冠
 *
 * 全部几何与贴图由代码程序化生成（无外部资源）。
 * 单位：1 unit = 10 mm。表径 4.0，整机高 1.04（y -0.52 .. 0.52）。
 * 坐标：x 右 / y 上（表盘朝 +y）/ z 朝向观察者；12 点 = -z，3 点 = +x。
 * 指针以 12 点（-z）为基准造型，整组再绕 y 旋转到 10:10。
 * ========================================================================= */
(function () {
  'use strict';

  const T = THREE;

  /* =====================================================================
   * 小工具
   * =================================================================== */
  function mesh(geo, mat) {
    const m = new T.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // 平放圆环：faceUp = true 时法线朝 +y
  function annulus(rIn, rOut, y, mat, faceUp, seg) {
    const m = new T.Mesh(new T.RingGeometry(rIn, rOut, seg || 96, 1), mat);
    m.rotation.x = faceUp ? -Math.PI / 2 : Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    return m;
  }

  // 以 x 轴为旋转轴的车削体：profile 为 [[x, r], ...]
  function latheX(ctx, profile, x0, seg) {
    const geo = ctx.lathe(profile, seg || 64);
    geo.rotateZ(-Math.PI / 2);
    geo.translate(x0, 0, 0);
    return geo;
  }

  // 沿 x 轴的圆柱
  function cylX(r, len, x0, mat, seg) {
    const geo = new T.CylinderGeometry(r, r, len, seg || 24, 1, false);
    geo.rotateZ(Math.PI / 2);
    geo.translate(x0, 0, 0);
    return mesh(geo, mat);
  }

  // 绕 x 轴的圆环（孔轴 = x）
  function torusX(r, tube, x, mat, radial, tubular) {
    const geo = new T.TorusGeometry(r, tube, radial || 8, tubular || 48);
    geo.rotateY(Math.PI / 2);
    geo.translate(x, 0, 0);
    return mesh(geo, mat);
  }

  // 平放在 xz 平面的圆环
  function torusY(r, tube, y, mat, radial, tubular) {
    const geo = new T.TorusGeometry(r, tube, radial || 10, tubular || 64);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, y, 0);
    return mesh(geo, mat);
  }

  // 逐字距文本（居中对齐）
  function spacedText(c, text, cx, y, spacing) {
    let total = 0;
    for (let i = 0; i < text.length; i++) total += c.measureText(text[i]).width + spacing;
    total -= spacing;
    let x = cx - total / 2;
    const prev = c.textAlign;
    c.textAlign = 'left';
    for (let i = 0; i < text.length; i++) {
      const w = c.measureText(text[i]).width;
      c.fillText(text[i], x, y);
      x += w + spacing;
    }
    c.textAlign = prev;
  }

  /* =====================================================================
   * 手绘贴图
   * =================================================================== */
  function makeTextures(ctx) {
    const TEX = {};

    /* --- 表壳侧面纵向拉丝（粗糙度 + 凹凸） --- */
    TEX.sideBrush = ctx.makeTexture(2048, 128, function (c, w, h) {
      c.fillStyle = '#b6b6b6';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const x = Math.random() * w;
        const light = Math.random() > 0.5;
        const a = 0.01 + Math.random() * 0.055;
        c.strokeStyle = light
          ? 'rgba(255,255,255,' + a.toFixed(3) + ')'
          : 'rgba(0,0,0,' + (a * 0.85).toFixed(3) + ')';
        c.lineWidth = 0.4 + Math.random() * 1.4;
        c.beginPath();
        c.moveTo(x, -10);
        c.lineTo(x + (Math.random() - 0.5) * 3, h + 10);
        c.stroke();
      }
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * w;
        c.strokeStyle = 'rgba(0,0,0,0.055)';
        c.lineWidth = 1 + Math.random() * 2.6;
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, h);
        c.stroke();
      }
    }, { linear: true });
    TEX.sideBrush.wrapS = TEX.sideBrush.wrapT = T.RepeatWrapping;
    TEX.sideBrush.repeat.set(16, 2.2);

    /* --- 表圈顶面的同心圆拉丝 --- */
    TEX.circleBrush = ctx.makeTexture(512, 512, function (c, w, h) {
      const cx = w / 2, cy = h / 2;
      c.fillStyle = '#808080';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 460; i++) {
        const r = 20 + Math.random() * (w / 2 - 20);
        const light = Math.random() > 0.5;
        const a = 0.03 + Math.random() * 0.24;
        c.strokeStyle = light
          ? 'rgba(255,255,255,' + a.toFixed(3) + ')'
          : 'rgba(0,0,0,' + a.toFixed(3) + ')';
        c.lineWidth = 0.5 + Math.random() * 1.7;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.stroke();
      }
      for (let i = 0; i < 240; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = 12 + Math.random() * (w / 2 - 12);
        c.strokeStyle = 'rgba(0,0,0,0.08)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        c.lineTo(cx + Math.cos(a) * (r0 + 3), cy + Math.sin(a) * (r0 + 3));
        c.stroke();
      }
    }, { linear: true });

    /* --- 表圈内圈的放射状车削纹 --- */
    TEX.radialBrush = ctx.makeTexture(512, 512, function (c, w, h) {
      const cx = w / 2, cy = h / 2;
      c.fillStyle = '#8a8a8a';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const a = Math.random() * Math.PI * 2;
        const light = Math.random() > 0.5;
        c.strokeStyle = light
          ? 'rgba(255,255,255,' + (0.05 + Math.random() * 0.3).toFixed(3) + ')'
          : 'rgba(0,0,0,' + (0.04 + Math.random() * 0.28).toFixed(3) + ')';
        c.lineWidth = 0.5 + Math.random() * 1.6;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
        c.lineTo(cx + Math.cos(a) * 360, cy + Math.sin(a) * 360);
        c.stroke();
      }
    }, { linear: true });

    /* --- 表盘：太阳纹 + 60 格分钟轨道 + 印字 --- */
    TEX.dial = ctx.makeTexture(1024, 1024, function (c, w, h) {
      const cx = w / 2, cy = h / 2;
      const s = (w / 2) / 1.72; // px per unit

      // 银灰底色：中心亮、边缘暗，模拟太阳纹的径向明暗
      const bg = c.createRadialGradient(cx, cy, 8, cx, cy, w / 2);
      bg.addColorStop(0.00, '#999fa6');
      bg.addColorStop(0.38, '#8b9299');
      bg.addColorStop(0.72, '#767e86');
      bg.addColorStop(0.92, '#60686f');
      bg.addColorStop(1.00, '#4e565d');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);

      // 太阳纹：1600 条细放射线
      c.save();
      c.translate(cx, cy);
      for (let i = 0; i < 1600; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = 6 + Math.random() * 90;
        const r1 = 120 + Math.random() * 400;
        const light = Math.random() > 0.44;
        c.strokeStyle = light
          ? 'rgba(255,255,255,' + (0.03 + Math.random() * 0.10).toFixed(3) + ')'
          : 'rgba(18,22,28,' + (0.02 + Math.random() * 0.075).toFixed(3) + ')';
        c.lineWidth = 0.8 + Math.random() * 2.0;
        c.beginPath();
        c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        c.stroke();
      }
      // 柔和的斜向高光
      const sheen = c.createLinearGradient(0, 0, w, h);
      sheen.addColorStop(0.0, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.32, 'rgba(255,255,255,0.10)');
      sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
      sheen.addColorStop(1.0, 'rgba(0,0,0,0.10)');
      c.fillStyle = sheen;
      c.fillRect(-w, -h, w * 2, h * 2);
      c.restore();

      // 分钟轨道：60 格，5 分钟加粗
      c.save();
      c.translate(cx, cy);
      c.strokeStyle = 'rgba(32,37,44,0.5)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 1.700 * s, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = 'rgba(36,41,48,0.32)';
      c.lineWidth = 1.1;
      c.beginPath();
      c.arc(0, 0, 1.487 * s, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const major = i % 5 === 0;
        const rIn = (major ? 1.527 : 1.567) * s;
        const rOut = 1.632 * s;
        c.strokeStyle = major ? 'rgba(22,26,32,0.94)' : 'rgba(40,45,52,0.74)';
        c.lineWidth = major ? 6.4 : 2.3;
        c.beginPath();
        c.moveTo(Math.sin(a) * rIn, -Math.cos(a) * rIn);
        c.lineTo(Math.sin(a) * rOut, -Math.cos(a) * rOut);
        c.stroke();
      }
      c.restore();

      // 印字
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(14,18,24,0.96)';
      c.font = '700 46px "Helvetica Neue", Arial, sans-serif';
      spacedText(c, 'CALIBRE', cx, cy - 0.985 * s, 11);
      c.fillStyle = 'rgba(20,25,32,0.88)';
      c.font = '600 21px "Helvetica Neue", Arial, sans-serif';
      spacedText(c, 'AUTOMATIC', cx, cy - 0.795 * s, 7);
      c.fillStyle = 'rgba(26,31,38,0.7)';
      c.font = '500 16px "Helvetica Neue", Arial, sans-serif';
      spacedText(c, '2824  ·  25 JEWELS', cx, cy - 0.625 * s, 2.5);
      // 6 点位下方的小字
      c.fillStyle = 'rgba(18,23,30,0.8)';
      c.font = '600 20px "Helvetica Neue", Arial, sans-serif';
      spacedText(c, 'SWISS MADE', cx, cy + 1.665 * s, 4.5);
      // 分钟轨道内圈的两个小方点（12 点对准基准）
      c.fillStyle = 'rgba(20,25,32,0.85)';
      c.fillRect(cx - 2.5, cy - 1.455 * s - 2.5, 5, 5);
      c.fillRect(cx - 2.5, cy + 1.455 * s - 2.5, 5, 5);
    });

    /* --- 表盘粗糙度：太阳纹方向 --- */
    TEX.dialRough = ctx.makeTexture(512, 512, function (c, w, h) {
      const cx = w / 2, cy = h / 2;
      c.fillStyle = '#9a9a9a';
      c.fillRect(0, 0, w, h);
      c.save();
      c.translate(cx, cy);
      for (let i = 0; i < 1000; i++) {
        const a = Math.random() * Math.PI * 2;
        const light = Math.random() > 0.5;
        c.strokeStyle = light
          ? 'rgba(255,255,255,' + (0.04 + Math.random() * 0.22).toFixed(3) + ')'
          : 'rgba(0,0,0,' + (0.04 + Math.random() * 0.2).toFixed(3) + ')';
        c.lineWidth = 0.5 + Math.random() * 1.5;
        c.beginPath();
        c.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
        c.lineTo(Math.cos(a) * (w / 2), Math.sin(a) * (w / 2));
        c.stroke();
      }
      c.restore();
      const g = c.createRadialGradient(cx, cy, w * 0.18, cx, cy, w * 0.5);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.32)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }, { linear: true });

    /* --- 日历盘 --- */
    TEX.date = ctx.makeTexture(256, 320, function (c, w, h) {
      c.fillStyle = '#e2e4e6';
      c.fillRect(0, 0, w, h);
      // 细边框
      c.strokeStyle = 'rgba(20,24,30,0.95)';
      c.lineWidth = 7;
      c.strokeRect(4, 4, w - 8, h - 8);
      c.fillStyle = '#1c2128';
      c.font = '600 132px "Helvetica Neue", Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('12', w / 2, h / 2 + 8);
    });

    /* --- 表背底盖：同心拉丝 + 刻字 --- */
    TEX.caseback = ctx.makeTexture(1024, 1024, function (c, w, h) {
      const cx = w / 2, cy = h / 2;
      const s = (w / 2) / 1.0; // 底盖圆盘半径 1.0
      const bg = c.createRadialGradient(cx, cy, 10, cx, cy, w / 2);
      bg.addColorStop(0, '#c4c9ce');
      bg.addColorStop(0.45, '#aeb4ba');
      bg.addColorStop(0.82, '#8f969d');
      bg.addColorStop(1, '#6f767d');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);

      // 同心拉丝（圆环状细纹）
      for (let i = 0; i < 520; i++) {
        const r = 24 + Math.random() * (w / 2 - 24);
        const light = Math.random() > 0.5;
        c.strokeStyle = light ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
        c.lineWidth = 0.6 + Math.random() * 1.4;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.stroke();
      }
      // 细放射丝
      for (let i = 0; i < 420; i++) {
        const a = Math.random() * Math.PI * 2;
        c.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120);
        c.lineTo(cx + Math.cos(a) * 500, cy + Math.sin(a) * 500);
        c.stroke();
      }

      // 刻线 / 刻字（先深色，再在上方偏移 2px 画一道亮边模拟刻痕）
      function engrave(text, radius, font, spacing, alpha) {
        c.font = font;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = 'rgba(16,20,25,' + alpha + ')';
        spacedText(c, text, cx, cy + radius, spacing);
        c.fillStyle = 'rgba(245,248,250,0.22)';
        spacedText(c, text, cx, cy + radius + 2, spacing);
      }
      function ring(radius, width, alpha) {
        c.strokeStyle = 'rgba(20,25,30,' + alpha + ')';
        c.lineWidth = width;
        c.beginPath();
        c.arc(cx, cy, radius, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = 'rgba(250,252,255,0.16)';
        c.lineWidth = width * 0.6;
        c.beginPath();
        c.arc(cx, cy, radius + 1.5, 0, Math.PI * 2);
        c.stroke();
      }

      ring(0.17 * s, 3, 0.55);
      ring(0.36 * s, 2, 0.4);
      ring(0.545 * s, 5, 0.6);
      ring(0.72 * s, 2, 0.4);
      ring(0.88 * s, 4, 0.55);
      ring(0.955 * s, 7, 0.7);

      engrave('CALIBRE', 0.05 * s, '600 58px "Helvetica Neue", Arial, sans-serif', 12, 0.92);
      engrave('AUTOMATIC', 0.25 * s, '500 27px "Helvetica Neue", Arial, sans-serif', 8, 0.78);
      engrave('SWISS MADE', 0.63 * s, '500 24px "Helvetica Neue", Arial, sans-serif', 7, 0.62);
      engrave('SAPPHIRE CRYSTAL   ·   50 m / 165 ft', 0.775 * s, '500 21px "Helvetica Neue", Arial, sans-serif', 3, 0.55);
      engrave('316L STAINLESS STEEL   ·   No. 2824-2', 0.91 * s, '500 18px "Helvetica Neue", Arial, sans-serif', 2.5, 0.5);

      // 中央小圆徽记
      c.strokeStyle = 'rgba(20,25,30,0.55)';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy, 0.105 * s, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = 'rgba(20,25,30,0.5)';
      c.font = '600 40px "Helvetica Neue", Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('C', cx, cy + 2);
    });

    /* --- 表背粗糙度：同心拉丝 --- */
    TEX.casebackRough = ctx.makeTexture(512, 512, function (c, w, h) {
      const cx = w / 2, cy = h / 2;
      c.fillStyle = '#8c8c8c';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) {
        const r = 16 + Math.random() * (w / 2 - 16);
        c.strokeStyle = Math.random() > 0.5
          ? 'rgba(255,255,255,' + (0.04 + Math.random() * 0.26).toFixed(3) + ')'
          : 'rgba(0,0,0,' + (0.03 + Math.random() * 0.2).toFixed(3) + ')';
        c.lineWidth = 0.6 + Math.random() * 1.6;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.stroke();
      }
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * Math.PI * 2;
        c.strokeStyle = 'rgba(0,0,0,0.06)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.cos(a) * (w / 2), cy + Math.sin(a) * (w / 2));
        c.stroke();
      }
    }, { linear: true });

    /* --- 表冠顶面 --- */
    TEX.crownTop = ctx.makeTexture(256, 256, function (c, w, h) {
      const cx = w / 2, cy = h / 2;
      const g = c.createRadialGradient(cx, cy, 4, cx, cy, w / 2);
      g.addColorStop(0, '#dfe6ec');
      g.addColorStop(0.6, '#b9c2ca');
      g.addColorStop(1, '#7e8790');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(40,46,54,0.55)';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(cx, cy, 78, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = 'rgba(40,46,54,0.5)';
      c.font = '600 56px "Helvetica Neue", Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('C', cx, cy + 3);
      // 细放射纹
      for (let i = 0; i < 200; i++) {
        const a = Math.random() * Math.PI * 2;
        c.strokeStyle = 'rgba(255,255,255,0.06)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
        c.lineTo(cx + Math.cos(a) * 124, cy + Math.sin(a) * 124);
        c.stroke();
      }
    });

    return TEX;
  }

  /* =====================================================================
   * 材质库（基于 ctx.mats 派生）
   * =================================================================== */
  function makeMaterials(ctx, TEX) {
    const M = ctx.mats;
    const mats = {};

    mats.caseSide = M.steel.clone();
    mats.caseSide.color = new T.Color(0xc7cfd8);
    mats.caseSide.roughness = 0.58;
    mats.caseSide.metalness = 1.0;
    mats.caseSide.roughnessMap = TEX.sideBrush;
    mats.caseSide.bumpMap = TEX.sideBrush;
    mats.caseSide.bumpScale = 0.0016;

    mats.caseBottom = M.steelDark.clone();
    mats.caseBottom.color = new T.Color(0x9aa3ad);
    mats.caseBottom.roughness = 0.44;

    mats.caseInner = M.steelDark.clone();
    mats.caseInner.color = new T.Color(0xaeb7c1);
    mats.caseInner.roughness = 0.46;
    mats.caseInner.roughnessMap = TEX.circleBrush;
    mats.caseInner.bumpMap = TEX.circleBrush;
    mats.caseInner.bumpScale = 0.0009;

    mats.polished = M.steel.clone();
    mats.polished.color = new T.Color(0xd6dee6);
    mats.polished.roughness = 0.16;
    mats.polished.metalness = 1.0;

    mats.backRim = M.steel.clone();
    mats.backRim.color = new T.Color(0xcbd3db);
    mats.backRim.roughness = 0.36;
    mats.backRim.metalness = 1.0;

    mats.polishedDark = M.steelDark.clone();
    mats.polishedDark.color = new T.Color(0xb3bcc6);
    mats.polishedDark.roughness = 0.24;

    mats.rehaut = M.steelDark.clone();
    mats.rehaut.color = new T.Color(0x79838d);
    mats.rehaut.roughness = 0.30;

    mats.lug = M.steel.clone();
    mats.lug.color = new T.Color(0xcfd7df);
    mats.lug.roughness = 0.30;

    mats.bar = M.steelDark.clone();
    mats.bar.color = new T.Color(0xb9c2cb);
    mats.bar.roughness = 0.26;

    mats.bezelTop = M.steel.clone();
    mats.bezelTop.color = new T.Color(0xdde4ea);
    mats.bezelTop.metalness = 0.82;
    mats.bezelTop.roughness = 0.42;
    mats.bezelTop.roughnessMap = TEX.circleBrush;
    mats.bezelTop.bumpMap = TEX.circleBrush;
    mats.bezelTop.bumpScale = 0.0016;

    mats.bezelMachined = M.steelDark.clone();
    mats.bezelMachined.color = new T.Color(0xc6ced6);
    mats.bezelMachined.metalness = 0.8;
    mats.bezelMachined.roughness = 0.38;
    mats.bezelMachined.roughnessMap = TEX.radialBrush;
    mats.bezelMachined.bumpMap = TEX.radialBrush;
    mats.bezelMachined.bumpScale = 0.0015;

    mats.dial = new T.MeshStandardMaterial({
      map: TEX.dial,
      roughnessMap: TEX.dialRough,
      color: 0xffffff,
      metalness: 0.38,
      roughness: 0.52
    });

    mats.date = new T.MeshStandardMaterial({
      map: TEX.date,
      color: 0xffffff,
      metalness: 0.02,
      roughness: 0.55
    });

    mats.caseback = new T.MeshStandardMaterial({
      map: TEX.caseback,
      roughnessMap: TEX.casebackRough,
      color: 0xffffff,
      metalness: 0.28,
      roughness: 0.52
    });

    mats.crownTop = new T.MeshStandardMaterial({
      map: TEX.crownTop,
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.3
    });

    mats.hand = M.steel.clone();
    mats.hand.color = new T.Color(0xe3eaf2);
    mats.hand.roughness = 0.16;

    mats.handHub = M.chrome.clone();

    mats.sapphire = M.sapphire.clone();
    mats.sapphire.envMapIntensity = 0.18;
    mats.sapphire.opacity = 0.07;
    mats.sapphire.clearcoat = 0.22;
    mats.sapphire.clearcoatRoughness = 0.12;
    mats.sapphire.specularIntensity = 0.45;

    mats.ar = new T.MeshBasicMaterial({
      color: 0x4a74b8,
      transparent: true,
      opacity: 0.26,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.DoubleSide
    });

    mats.screw = M.steelDark.clone();
    mats.screw.color = new T.Color(0xb6bfc8);
    mats.screw.roughness = 0.28;

    return mats;
  }

  /* =====================================================================
   * 表壳 + 表耳 + 生耳 + 表冠管
   * =================================================================== */
  function buildCase(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();
    const SEG = 160;

    /* --- 壳身侧面：纵向拉丝 --- */
    const flank = [
      [-0.3720, 1.9950], [-0.3300, 1.9985], [-0.2400, 2.0000], [-0.1000, 2.0000],
      [0.0600, 2.0000], [0.1700, 1.9993], [0.2550, 1.9972], [0.3150, 1.9935]
    ];
    g.add(mesh(ctx.lathe(flank, SEG), mats.caseSide));

    /* --- 下缘抛光圆唇（底盖座） --- */
    g.add(mesh(ctx.lathe([
      [-0.4000, 1.9550], [-0.3985, 1.9720], [-0.3940, 1.9845], [-0.3860, 1.9925], [-0.3720, 1.9950]
    ], SEG), mats.polished));

    /* --- 上缘抛光倒角 --- */
    g.add(mesh(ctx.lathe([
      [0.3150, 1.9935], [0.3340, 1.9900], [0.3520, 1.9830], [0.3720, 1.9690],
      [0.3890, 1.9475], [0.4000, 1.9160]
    ], SEG), mats.polished));

    /* --- 底面 / 顶面（拆解后可见） --- */
    g.add(annulus(1.7050, 1.9550, -0.4000, mats.caseBottom, false, 128));
    g.add(annulus(1.7750, 1.9160, 0.4000, mats.polishedDark, true, 128));

    /* --- 内圈斜面（rehaut）：从表盘边缘抬到壳口 --- */
    g.add(mesh(ctx.lathe([
      [0.3960, 1.7780], [0.3350, 1.7730], [0.2650, 1.7630], [0.1980, 1.7430], [0.1580, 1.7145]
    ], 128), mats.rehaut));

    /* --- 表盘定位胶圈 --- */
    g.add(annulus(1.7040, 1.7230, 0.1575, M.rubber, true, 128));

    /* --- 四只表耳：一体车削的锥形表耳（20 mm 表耳间距） --- */
    const lugSections = [
      { z: 1.360, xc: 1.400, w: 0.400, h: 0.150, y: 0.015, p: 5.5 },
      { z: 1.800, xc: 1.380, w: 0.380, h: 0.142, y: 0.023, p: 5.5 },
      { z: 2.060, xc: 1.330, w: 0.325, h: 0.130, y: 0.035, p: 5.0 },
      { z: 2.240, xc: 1.270, w: 0.275, h: 0.112, y: 0.053, p: 4.6 },
      { z: 2.360, xc: 1.230, w: 0.225, h: 0.092, y: 0.073, p: 4.2 },
      { z: 2.430, xc: 1.200, w: 0.175, h: 0.070, y: 0.095, p: 3.8 },
      { z: 2.455, xc: 1.190, w: 0.110, h: 0.042, y: 0.123, p: 3.4 }
    ];
    const lugGeo = loftGeometry(lugSections, true);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (cfg) {
      const lug = new T.Mesh(lugGeo, mats.lug);
      lug.castShadow = true;
      lug.receiveShadow = true;
      lug.scale.set(cfg[0], 1, cfg[1]);
      g.add(lug);
    });

    /* --- 生耳（两根）与表耳内侧钻孔 --- */
    [2.30, -2.30].forEach(function (z) {
      const bar = new T.Mesh(new T.CylinderGeometry(0.050, 0.050, 2.000, 20), mats.bar);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 0.020, z);
      g.add(bar);

      [-1, 1].forEach(function (sgn) {
        const pin = new T.Mesh(new T.CylinderGeometry(0.072, 0.072, 0.075, 18), mats.bar);
        pin.rotation.z = Math.PI / 2;
        pin.position.set(sgn * 0.975, 0.020, z);
        g.add(pin);
        // 钻孔阴影
        const hole = new T.Mesh(new T.CircleGeometry(0.052, 24),
          new T.MeshBasicMaterial({ color: 0x05070a }));
        hole.rotation.y = sgn * Math.PI / 2;
        hole.position.set(sgn * 1.004, 0.020, z);
        g.add(hole);
        // 孔的抛光倒角
        const rim = torusX(0.060, 0.0070, sgn * 1.002, mats.polished, 8, 28);
        rim.position.y = 0.020;
        rim.position.z = z;
        g.add(rim);
      });
    });

    /* --- 表冠管座（3 点方向） --- */
    const boss = new T.Mesh(latheX(ctx, [
      [0.000, 0.155], [0.030, 0.157], [0.070, 0.152], [0.110, 0.140],
      [0.140, 0.120], [0.163, 0.104], [0.175, 0.094]
    ], 1.868, 72), mats.polished);
    boss.position.y = 0.010;
    g.add(boss);

    const tube = new T.Mesh(new T.CylinderGeometry(0.085, 0.085, 0.24, 28), mats.polished);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(1.965, 0.010, 0);
    g.add(tube);

    // 表冠管上的两道 O 形圈槽
    [2.006, 2.056].forEach(function (x) {
      const ring = torusX(0.080, 0.0075, x, M.rubber, 8, 36);
      ring.position.y = 0.010;
      g.add(ring);
    });
    // 管口的抛光倒角
    const tubeLip = torusX(0.085, 0.006, 2.0855, mats.polished, 8, 36);
    tubeLip.position.y = 0.010;
    g.add(tubeLip);

    return g;
  }

  // 表耳截面：上/下平面 + 侧平面 + 倒角（归一化坐标，按各站位的 w/h 缩放）
  const LUG_SECTION = [
    [-0.62, 1.00], [-0.84, 0.95], [-0.975, 0.80],
    [-1.00, 0.55], [-1.00, 0.05], [-1.00, -0.42],
    [-0.92, -0.70], [-0.74, -0.88], [-0.48, -0.97],
    [0.00, -1.00], [0.48, -0.97], [0.74, -0.88],
    [0.92, -0.70], [1.00, -0.42], [1.00, 0.05], [1.00, 0.55],
    [0.975, 0.80], [0.84, 0.95],
    [0.62, 1.00]
  ];

  // 放样：把表耳截面沿 z 串起来。
  // 每一段截面各自成条带（相邻条带不共享顶点），因此长轴方向平滑、
  // 截面折角处是硬边——看起来像车铣出来的表耳。
  // 第一圈沿表壳外圆变形，使表耳根部贴合圆柱形壳身。
  function loftGeometry(sections, rootCurve) {
    const N = LUG_SECTION.length;
    const S = sections.length;
    const rings = sections.map(function (sec, si) {
      return LUG_SECTION.map(function (pt) {
        const x = sec.xc + sec.w * pt[0];
        const y = sec.y + sec.h * pt[1];
        let z = sec.z;
        if (si === 0 && rootCurve) {
          z = Math.min(z, Math.sqrt(Math.max(0.06, 4.0 - x * x)) - 0.0006);
        }
        return [x, y, z];
      });
    });

    const pos = [];
    const idx = [];

    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      const base = pos.length / 3;
      for (let si = 0; si < S; si++) {
        const a = rings[si][k], b = rings[si][k2];
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      for (let si = 0; si < S - 1; si++) {
        const a = base + si * 2;
        const b = a + 1;
        const c = a + 3;
        const d = a + 2;
        idx.push(a, b, c, a, c, d);
      }
    }

    // 端面
    function cap(ring, xc, yc, zc, dir) {
      const base = pos.length / 3;
      for (let i = 0; i < N; i++) pos.push(ring[i][0], ring[i][1], ring[i][2]);
      pos.push(xc, yc, zc);
      const c = base + N;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        if (dir > 0) idx.push(c, base + i, base + j);
        else idx.push(c, base + j, base + i);
      }
    }
    const lastS = sections[S - 1];
    cap(rings[S - 1], lastS.xc, lastS.y, lastS.z, 1);
    const rootS = sections[0];
    cap(rings[0], rootS.xc, rootS.y,
      Math.min(rootS.z, Math.sqrt(Math.max(0.06, 4.0 - rootS.xc * rootS.xc)) - 0.008), -1);

    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /* =====================================================================
   * 表背
   * =================================================================== */
  function buildCaseback(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();
    const SEG = 160;

    /* --- 底盖外圈：外侧抛光，内侧与底盖圆盘相接 --- */
    const rimProfile = [
      [-0.4805, 1.0000], [-0.4780, 1.1000], [-0.4745, 1.2000], [-0.4695, 1.3000],
      [-0.4625, 1.4000], [-0.4530, 1.4800], [-0.4410, 1.5600], [-0.4270, 1.6600],
      [-0.4160, 1.7600], [-0.4065, 1.8600], [-0.4010, 1.9250], [-0.4000, 1.9480]
    ];
    g.add(mesh(ctx.lathe(rimProfile, SEG), mats.backRim));

    /* --- 中央刻字圆盘（平面贴图） --- */
    const disc = new T.Mesh(new T.CircleGeometry(1.006, 128), mats.caseback);
    disc.rotation.x = Math.PI / 2; // 法线朝 -y
    disc.position.y = -0.4807;
    disc.receiveShadow = true;
    g.add(disc);

    /* --- 内侧：同心车削纹 + 机芯固定圈（拆解时朝上可见） --- */
    const innerFace = new T.Mesh(new T.RingGeometry(0.0200, 1.9480, 128, 1), mats.caseInner);
    innerFace.rotation.x = -Math.PI / 2;
    innerFace.position.y = -0.4002;
    innerFace.receiveShadow = true;
    g.add(innerFace);

    const retainer = mesh(ctx.lathe([
      [-0.4000, 1.3520], [-0.3720, 1.3440], [-0.3650, 1.3340], [-0.3650, 1.2460],
      [-0.3720, 1.2360], [-0.4000, 1.2300], [-0.4000, 1.3520]
    ], 128), mats.polishedDark);
    g.add(retainer);

    // 内侧两道细车削刻线
    [0.5600, 1.4700].forEach(function (r) {
      const groove = torusY(r, 0.0040, -0.3990, mats.caseBottom, 6, 128);
      g.add(groove);
    });

    /* --- 边缘高圈 --- */
    const rimRing = torusY(1.9120, 0.0075, -0.4055, mats.polished, 8, 128);
    g.add(rimRing);

    /* --- 表壳与底盖之间的防水橡胶圈 --- */
    g.add(torusY(1.9470, 0.0060, -0.4025, M.rubber, 8, 128));

    /* --- 6 枚凹槽螺丝 --- */
    const screwGroup = new T.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const r = 1.875;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      const head = new T.Mesh(new T.CylinderGeometry(0.058, 0.062, 0.020, 24), mats.screw);
      head.position.set(x, -0.4145, z);
      screwGroup.add(head);
      // 凹槽
      const slot = new T.Mesh(new T.BoxGeometry(0.105, 0.010, 0.016),
        new T.MeshStandardMaterial({ color: 0x11151a, roughness: 0.7, metalness: 0.2 }));
      slot.position.set(x, -0.4245, z);
      slot.rotation.y = a;
      screwGroup.add(slot);
      // 螺丝外圈
      const ring = torusY(0.058, 0.0055, -0.4235, mats.polishedDark, 6, 28);
      ring.position.x = x;
      ring.position.z = z;
      screwGroup.add(ring);
    }
    g.add(screwGroup);

    return g;
  }

  /* =====================================================================
   * 表圈
   * =================================================================== */
  function buildBezel(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();
    const SEG = 144;

    /* --- 表圈主体：底缘 -> 外侧壁 -> 顶部倒角 --- */
    g.add(mesh(ctx.lathe([
      [0.3980, 1.6900], [0.3980, 1.9500], [0.4040, 2.0000], [0.4420, 2.0000],
      [0.4620, 1.9995], [0.4780, 1.9930], [0.4920, 1.9750], [0.5000, 1.9450]
    ], SEG), mats.polished));

    /* --- 顶面：环形拉丝（压镜圈） --- */
    const topRing = new T.Mesh(new T.RingGeometry(1.7600, 1.9440, 144, 1), mats.bezelTop);
    topRing.rotation.x = -Math.PI / 2;
    topRing.position.y = 0.5002;
    topRing.receiveShadow = true;
    g.add(topRing);

    /* --- 顶面内缘的车削纹 --- */
    const machined = new T.Mesh(new T.RingGeometry(1.7020, 1.7580, 144, 1), mats.bezelMachined);
    machined.rotation.x = -Math.PI / 2;
    machined.position.y = 0.5004;
    machined.receiveShadow = true;
    g.add(machined);

    /* --- 内缘倒角 + 压镜槽 --- */
    g.add(mesh(ctx.lathe([
      [0.5002, 1.7600], [0.4940, 1.7240], [0.4870, 1.7030], [0.4750, 1.6900]
    ], 128), mats.polishedDark));

    g.add(mesh(ctx.lathe([
      [0.4750, 1.6900], [0.4620, 1.6820], [0.4540, 1.6820], [0.4480, 1.7060],
      [0.4300, 1.7060], [0.4190, 1.6840], [0.4020, 1.6800], [0.3980, 1.6900]
    ], 128), mats.polishedDark));

    /* --- 顶部外缘的抛光高光圈 --- */
    const edge = torusY(1.9690, 0.0060, 0.4930, mats.polished, 8, 144);
    g.add(edge);

    return g;
  }

  /* =====================================================================
   * 蓝宝石镜面
   * =================================================================== */
  function buildCrystal(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();

    // 平底 + 微拱顶：边缘压进表圈压镜槽
    const profile = [
      [0.4000, 0.0002], [0.4000, 1.6000], [0.4040, 1.6480], [0.4120, 1.6700],
      [0.4280, 1.6800], [0.4480, 1.6800], [0.4660, 1.6720], [0.4820, 1.6550],
      [0.4980, 1.6000], [0.5080, 1.5200], [0.5160, 1.4000], [0.5210, 1.2000],
      [0.5240, 0.9000], [0.5250, 0.5000], [0.5250, 0.0002]
    ];
    const dome = mesh(ctx.lathe(profile, 128), mats.sapphire);
    dome.castShadow = false;
    dome.receiveShadow = false;
    g.add(dome);

    // 边缘防反射镀膜（极淡的蓝色环）
    const arRing = new T.Mesh(ctx.lathe([[0.4120, 1.6805], [0.4460, 1.6805]], 128), mats.ar);
    arRing.castShadow = false;
    arRing.receiveShadow = false;
    g.add(arRing);

    // 镜面内侧的第二道镀膜（更淡）
    const arInner = new T.Mesh(ctx.lathe([[0.4300, 1.6400], [0.4620, 1.5520]], 128), mats.ar);
    arInner.castShadow = false;
    arInner.receiveShadow = false;
    g.add(arInner);

    return g;
  }

  /* =====================================================================
   * 表盘 + 日历窗
   * =================================================================== */
  function buildDial(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();

    // 盘片：0.4 mm 厚，顶面 0.16
    const plate = new T.Mesh(new T.CylinderGeometry(1.7200, 1.7200, 0.0800, 128, 1, false), M.dialDark);
    plate.position.y = 0.1200;
    plate.receiveShadow = true;
    g.add(plate);

    // 印刷面
    const face = new T.Mesh(new T.CircleGeometry(1.7200, 128), mats.dial);
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.1604;
    face.receiveShadow = true;
    g.add(face);

    // 日历窗（3 点方向）：白色日历盘 + 深色窗框
    const dateGroup = new T.Group();
    const datePlate = new T.Mesh(new T.PlaneGeometry(0.160, 0.200), mats.date);
    datePlate.geometry.rotateX(-Math.PI / 2);
    datePlate.position.set(1.1700, 0.1608, 0);
    datePlate.receiveShadow = true;
    dateGroup.add(datePlate);
    // 窗框（四边细条）
    const frameMat = new T.MeshStandardMaterial({ color: 0x05070a, roughness: 0.92, metalness: 0.0 });
    const fw = 0.013;
    const frameParts = [
      [0.160 + fw * 2, fw, 0, 0.1065],
      [0.160 + fw * 2, fw, 0, -0.1065],
      [fw, 0.200, 0.0865, 0],
      [fw, 0.200, -0.0865, 0]
    ];
    frameParts.forEach(function (p) {
      const bar = new T.Mesh(new T.BoxGeometry(p[0], 0.008, p[1]), frameMat);
      bar.position.set(1.1700 + p[2], 0.1632, p[3]);
      dateGroup.add(bar);
    });
    g.add(dateGroup);

    return g;
  }

  /* =====================================================================
   * 立体时标
   * =================================================================== */
  function buildIndices(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();

    function baton(length, width) {
      const s = new T.Shape();
      const hw = width / 2;
      const hl = length / 2;
      const c = 0.028;
      s.moveTo(-hw, -hl);
      s.lineTo(hw, -hl);
      s.lineTo(hw, hl - c);
      s.lineTo(hw - c * 0.55, hl);
      s.lineTo(-hw + c * 0.55, hl);
      s.lineTo(-hw, hl - c);
      s.closePath();
      const geo = new T.ExtrudeGeometry(s, {
        depth: 0.0300,
        bevelEnabled: true,
        bevelThickness: 0.0075,
        bevelSize: 0.0075,
        bevelSegments: 2,
        curveSegments: 4,
        steps: 1
      });
      geo.rotateX(-Math.PI / 2); // 长轴（shape 的 y）-> -z，挤出方向 -> +y
      geo.computeBoundingBox();
      geo.translate(0, -geo.boundingBox.min.y, 0); // 底面贴 0
      return geo;
    }

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const isTwelve = i === 0;
      const length = isTwelve ? 0.2600 : 0.1800;
      const width = isTwelve ? 0.0880 : 0.0760;
      const radius = isTwelve ? 1.3800 : 1.4200;

      const holder = new T.Group();
      holder.position.set(Math.sin(a) * radius, 0.1600, -Math.cos(a) * radius);
      holder.rotation.y = -a;

      const body = new T.Mesh(baton(length, width), M.steel);
      body.castShadow = true;
      body.receiveShadow = true;
      holder.add(body);

      // 顶面中脊（折面亮线）
      const crease = new T.Mesh(new T.BoxGeometry(0.0110, 0.0070, length * 0.82), M.chrome);
      crease.position.y = 0.0450;
      crease.castShadow = false;
      holder.add(crease);

      g.add(holder);
    }

    return g;
  }

  /* =====================================================================
   * 指针（剑形 / 蓝钢秒针）
   * =================================================================== */
  function tri(pos, a, b, c, want) {
    const ab = new T.Vector3().subVectors(b, a);
    const ac = new T.Vector3().subVectors(c, a);
    const n = ab.cross(ac);
    let ok;
    if (want === 'up') ok = n.y > 0;
    else if (want === 'down') ok = n.y < 0;
    else if (want === 'outx') ok = n.x > 0;
    else ok = n.x < 0;
    if (!ok) {
      const t = b;
      b = c;
      c = t;
    }
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  function ridgeHeight(z, L, tail, shoulderY, ridgeH) {
    let t;
    if (z <= 0) t = Math.max(0, (z + L) / L);
    else t = Math.max(0, 1 - z / tail);
    return shoulderY + ridgeH * Math.pow(t, 0.62);
  }

  // 剑形（dauphine）指针：平底 + 两侧折面 + 中脊
  function handGeometry(L, halfW, tail, thickness, ridgeH) {
    const half = [
      [0.000, tail],
      [halfW * 0.24, tail * 0.72],
      [halfW * 0.40, tail * 0.25],
      [halfW * 0.86, -L * 0.06],
      [halfW * 1.00, -L * 0.20],
      [halfW * 0.92, -L * 0.36],
      [halfW * 0.72, -L * 0.55],
      [halfW * 0.48, -L * 0.72],
      [halfW * 0.26, -L * 0.86],
      [halfW * 0.10, -L * 0.95],
      [0.000, -L]
    ];

    const loop = [];
    half.forEach(function (p) { loop.push([p[0], p[1]]); });
    for (let i = half.length - 2; i >= 1; i--) loop.push([-half[i][0], half[i][1]]);

    const shoulderY = thickness;
    const pos = [];
    const origin = new T.Vector3(0, 0, 0);

    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      tri(pos, origin, new T.Vector3(a[0], 0, a[1]), new T.Vector3(b[0], 0, b[1]), 'down');
    }

    [1, -1].forEach(function (sgn) {
      for (let i = 0; i < half.length - 1; i++) {
        const a = half[i], b = half[i + 1];
        const A = new T.Vector3(a[0] * sgn, 0, a[1]);
        const B = new T.Vector3(b[0] * sgn, 0, b[1]);
        const As = new T.Vector3(a[0] * sgn * 0.88, shoulderY, a[1]);
        const Bs = new T.Vector3(b[0] * sgn * 0.88, shoulderY, b[1]);
        const Ar = new T.Vector3(0, ridgeHeight(a[1], L, tail, shoulderY, ridgeH), a[1]);
        const Br = new T.Vector3(0, ridgeHeight(b[1], L, tail, shoulderY, ridgeH), b[1]);

        tri(pos, A, B, Bs, sgn > 0 ? 'outx' : 'inx');
        tri(pos, A, Bs, As, sgn > 0 ? 'outx' : 'inx');

        tri(pos, As, Bs, Br, 'up');
        if (i > 0 && i < half.length - 2) tri(pos, As, Br, Ar, 'up');
      }
    });

    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function buildHourHand(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();
    const baseY = 0.2120;

    const geo = handGeometry(0.9600, 0.0560, 0.0850, 0.0110, 0.0135);
    geo.translate(0, baseY, 0);
    const hand = mesh(geo, mats.hand);
    g.add(hand);

    // 中心轴套
    const collet = new T.Mesh(new T.CylinderGeometry(0.076, 0.092, 0.0400, 48), mats.polished);
    collet.position.y = baseY + 0.0040;
    g.add(collet);
    const colletRing = torusY(0.076, 0.0075, baseY + 0.0245, mats.polishedDark, 8, 48);
    g.add(colletRing);

    return g;
  }

  function buildMinuteHand(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();
    const baseY = 0.2420;

    const geo = handGeometry(1.5000, 0.0660, 0.0920, 0.0110, 0.0135);
    geo.translate(0, baseY, 0);
    const hand = mesh(geo, mats.hand);
    g.add(hand);

    const hub = new T.Mesh(new T.CylinderGeometry(0.052, 0.070, 0.0400, 48), mats.polished);
    hub.position.y = baseY + 0.0020;
    g.add(hub);
    const hubRing = torusY(0.053, 0.0065, baseY + 0.0225, mats.polishedDark, 8, 48);
    g.add(hubRing);
    // 中心冒头
    const cap = new T.Mesh(new T.CylinderGeometry(0.030, 0.040, 0.0240, 36), M.chrome);
    cap.position.y = baseY + 0.0220;
    g.add(cap);

    return g;
  }

  function buildSecondHand(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();

    const spin = new T.Group();
    spin.name = 'spin';
    spin.userData.spinKind = 'second';

    const baseY = 0.2720;

    /* --- 针尖：细长渐收的蓝钢针 --- */
    const needle = new T.Shape();
    const L = 1.6500;
    const tailZ = 0.2800;
    // shape 的 +y 经 rotateX(-90) 映射到 -z，故 u = -z
    needle.moveTo(0.0000, L);
    needle.lineTo(0.0080, L - 0.0600);
    needle.lineTo(0.0060, L * 0.42);
    needle.lineTo(0.0110, L * 0.12);
    needle.lineTo(0.0150, -tailZ * 0.25);
    needle.lineTo(0.0130, -tailZ * 0.85);
    needle.lineTo(0.0060, -tailZ);
    needle.lineTo(-0.0060, -tailZ);
    needle.lineTo(-0.0130, -tailZ * 0.85);
    needle.lineTo(-0.0150, -tailZ * 0.25);
    needle.lineTo(-0.0110, L * 0.12);
    needle.lineTo(-0.0060, L * 0.42);
    needle.lineTo(-0.0080, L - 0.0600);
    needle.lineTo(0.0000, L);
    const needleGeo = new T.ExtrudeGeometry(needle, {
      depth: 0.0090,
      bevelEnabled: true,
      bevelThickness: 0.0020,
      bevelSize: 0.0016,
      bevelSegments: 1,
      curveSegments: 2,
      steps: 1
    });
    needleGeo.rotateX(-Math.PI / 2);
    needleGeo.computeBoundingBox();
    needleGeo.translate(0, baseY - needleGeo.boundingBox.min.y, 0);
    const needleMesh = mesh(needleGeo, M.blued);
    spin.add(needleMesh);

    /* --- 尾部配重 --- */
    const tailBar = new T.Mesh(new T.BoxGeometry(0.0170, 0.0080, 0.1800), M.blued);
    tailBar.position.set(0, baseY + 0.0045, 0.1400);
    spin.add(tailBar);

    const weight = new T.Mesh(new T.CylinderGeometry(0.0760, 0.0760, 0.0105, 40), M.blued);
    weight.position.set(0, baseY + 0.0045, 0.2200);
    spin.add(weight);
    const weightRing = torusY(0.0620, 0.0035, baseY + 0.0100, mats.handHub, 6, 36);
    weightRing.position.z = 0.2200;
    spin.add(weightRing);

    /* --- 中心轴套 --- */
    const hub = new T.Mesh(new T.CylinderGeometry(0.0430, 0.0540, 0.0360, 40), mats.polished);
    hub.position.y = baseY + 0.0130;
    spin.add(hub);
    const hubRing = torusY(0.0440, 0.0055, baseY + 0.0300, mats.polishedDark, 8, 40);
    spin.add(hubRing);
    const cap = new T.Mesh(new T.CylinderGeometry(0.0230, 0.0320, 0.0120, 32), M.chrome);
    cap.position.y = baseY + 0.0330;
    spin.add(cap);

    g.add(spin);
    return g;
  }

  /* =====================================================================
   * 表冠（滚花 / 柄轴 / 密封圈）
   * =================================================================== */
  function buildCrown(ctx, mats) {
    const M = ctx.mats;
    const g = new T.Group();

    /* --- 滚花表冠头：车削后沿径向压出 20 道直纹 --- */
    const headGeo = ctx.lathe([
      [0.000, 0.0010], [0.000, 0.0980], [0.010, 0.1120], [0.020, 0.1280],
      [0.026, 0.1360], [0.040, 0.1400], [0.100, 0.1400], [0.112, 0.1385],
      [0.120, 0.1320], [0.128, 0.1200], [0.134, 0.1010], [0.138, 0.0700],
      [0.140, 0.0010]
    ], 72);
    headGeo.rotateZ(-Math.PI / 2);
    const posAttr = headGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      if (x < 0.030 || x > 0.116) continue;
      const y = posAttr.getY(i), z = posAttr.getZ(i);
      const r = Math.hypot(y, z);
      if (r < 0.02) continue;
      const a = Math.atan2(z, y);
      const k = 1 + 0.038 * Math.cos(a * 20);
      posAttr.setY(i, y * k);
      posAttr.setZ(i, z * k);
    }
    headGeo.computeVertexNormals();
    headGeo.translate(2.0950, 0.0100, 0);
    const head = mesh(headGeo, M.steel);
    g.add(head);

    /* --- 表冠顶面圆片（带 C 标记） --- */
    const cap = new T.Mesh(new T.CylinderGeometry(0.0700, 0.0700, 0.0120, 40), mats.crownTop);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(2.2360, 0.0100, 0);
    g.add(cap);
    const capRing = torusX(0.0705, 0.0060, 2.2400, mats.polished, 8, 40);
    capRing.position.y = 0.0100;
    g.add(capRing);

    /* --- 头部内侧的抛光凹槽 --- */
    [2.1100, 2.2280].forEach(function (x) {
      const groove = torusX(0.1385, 0.0060, x, mats.polished, 8, 48);
      groove.position.y = 0.0100;
      g.add(groove);
    });

    /* --- 柄轴 --- */
    const stem = new T.Mesh(new T.CylinderGeometry(0.0300, 0.0300, 0.4200, 20), mats.polishedDark);
    stem.rotation.z = Math.PI / 2;
    stem.position.set(1.8800, 0.0100, 0);
    g.add(stem);
    // 柄轴上的方榫段
    const stemSquare = new T.Mesh(new T.BoxGeometry(0.0700, 0.0480, 0.0480), mats.polishedDark);
    stemSquare.position.set(1.7350, 0.0100, 0);
    g.add(stemSquare);

    /* --- 表冠内侧的防水圈 --- */
    const oRing = torusX(0.0960, 0.0100, 2.0880, M.rubber, 10, 48);
    oRing.position.y = 0.0100;
    g.add(oRing);

    return g;
  }

  /* =====================================================================
   * 入口
   * =================================================================== */
  function build(ctx) {
    const TEX = makeTextures(ctx);
    const mats = makeMaterials(ctx, TEX);
    const out = {};

    out.case = buildCase(ctx, mats);
    out.caseback = buildCaseback(ctx, mats);
    out.bezel = buildBezel(ctx, mats);
    out.crystal = buildCrystal(ctx, mats);
    out.dial = buildDial(ctx, mats);
    out.indices = buildIndices(ctx, mats);
    out.hourHand = buildHourHand(ctx, mats);
    out.minuteHand = buildMinuteHand(ctx, mats);
    out.secondHand = buildSecondHand(ctx, mats);
    out.crown = buildCrown(ctx, mats);

    // 10:10 的指针位置（指针自身指向 12 点 = -z）
    out.hourHand.rotation.y = -(305 * Math.PI / 180);
    out.minuteHand.rotation.y = -(60 * Math.PI / 180);

    return out;
  }

  window.WatchExterior = { build: build };
})();
