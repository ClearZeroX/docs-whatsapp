/* =========================================================================
 * DJI Osmo Action 4 — 3D Teardown
 * js/model.js — 纯代码生成的三维模型（无任何外部模型/贴图文件）
 * 单位：1 unit ≈ 15 mm；机身 4.70 × 2.95 × 2.20
 * ========================================================================= */
(function () {
  'use strict';

  const T = THREE;
  const DIM = { w: 4.70, h: 2.95, d: 2.20, halfW: 2.35, halfH: 1.475, halfD: 1.10 };
  const BASE = {
    body:        [0, 0, 0],
    glass:       [1.02, 0.16, 1.35],
    lens:        [1.02, 0.16, 1.07],
    sensor:      [1.02, 0.16, 0.58],
    frontScreen: [-1.18, 0.10, 1.12],
    mainboard:   [0.00, 0.02, -0.10],
    heatsink:    [-0.28, 0.10, -0.34],
    battery:     [-0.08, 0.00, -0.68],
    rearScreen:  [0.28, 0.10, -1.12],
    mics:        [0.00, 1.435, 0.22],
    mount:       [0.00, -1.49, 0.00],
    door:        [2.335, -0.02, 0.05],
    buttons:     [0.00, 1.445, 0.10]
  };

  const PARTS_DATA = (window.ACTION4 && window.ACTION4.PARTS) || [];

  /* 拆解时额外旋转（让屏幕/镜片朝向观察者，便于阅读） */
  const EXPLODE_ROT = {
    frontScreen: [0, 0.55, 0],
    rearScreen: [0, -0.55, 0],
    glass: [0, 0.22, 0],
    lens: [0, 0.18, 0]
  };

  /* ---------------------------------------------------------------------
   * 纹理工厂（Canvas2D → CanvasTexture）
   * ------------------------------------------------------------------- */
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

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function spacedText(ctx, text, x, y, spacing) {
    let cx = x;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + spacing;
    }
  }

  /* ---------------------------------------------------------------------
   * 几何 / 材质工具
   * ------------------------------------------------------------------- */
  function rb(w, h, d, r, seg) {
    const safeR = Math.max(0.01, Math.min(r, w / 2.02, h / 2.02, d / 2.02));
    return new T.RoundedBoxGeometry(w, h, d, seg || 3, safeR);
  }

  function std(color, opt) {
    return new T.MeshStandardMaterial(Object.assign({
      color: color, roughness: 0.52, metalness: 0.32
    }, opt || {}));
  }

  function phys(color, opt) {
    return new T.MeshPhysicalMaterial(Object.assign({
      color: color, roughness: 0.4, metalness: 0.3,
      clearcoat: 0.4, clearcoatRoughness: 0.35
    }, opt || {}));
  }

  function mesh(geo, mat, pos, rot) {
    const m = new T.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function discZ(rTop, rBottom, h, mat, seg) {
    const m = new T.Mesh(new T.CylinderGeometry(rTop, rBottom, h, seg || 64), mat);
    m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function torusZ(r, tube, mat, seg) {
    return new T.Mesh(new T.TorusGeometry(r, tube, 16, seg || 64), mat);
  }

  function ringY(r, tube, mat) {
    return new T.Mesh(new T.TorusGeometry(r, tube, 12, 48), mat).rotateX(Math.PI / 2);
  }

  function plane(w, h, mat, pos, rot) {
    return mesh(new T.PlaneGeometry(w, h), mat, pos, rot);
  }

  function radialGlowTexture(inner, outer) {
    return makeTexture(256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, inner);
      g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.55)'));
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  /* ---------------------------------------------------------------------
   * 共用纹理
   * ------------------------------------------------------------------- */
  const TEX = {};

  function buildSharedTextures() {
    TEX.pcb = makeTexture(1024, 608, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#0a2a22');
      g.addColorStop(0.5, '#0d3329');
      g.addColorStop(1, '#08231d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // traces
      ctx.strokeStyle = 'rgba(196, 158, 82, 0.32)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        let x = Math.random() * w, y = Math.random() * h;
        ctx.moveTo(x, y);
        for (let s = 0; s < 3; s++) {
          x += (Math.random() - 0.5) * 220;
          y += (Math.random() - 0.5) * 160;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // vias
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(224, 190, 108, 0.5)' : 'rgba(130, 170, 155, 0.35)';
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 1.4 + Math.random() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // silkscreen
      ctx.fillStyle = 'rgba(226, 240, 232, 0.72)';
      ctx.font = '600 20px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('DJI  ACTION 4  MAINBOARD  V1.2', 44, 52);
      ctx.font = '500 15px "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = 'rgba(226, 240, 232, 0.45)';
      ctx.fillText('MADE IN CHINA  ·  2023.07  ·  ESD SENSITIVE', 44, 76);
      ctx.fillText('J6  CAM', 60, 250);
      ctx.fillText('J3  LCD', 820, 190);
      ctx.fillText('J1  BAT', 780, 470);
      ctx.strokeStyle = 'rgba(226, 240, 232, 0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        roundRect(ctx, 60 + i * 140, 520, 100, 48, 6);
        ctx.stroke();
      }
      // gold edge
      ctx.strokeStyle = 'rgba(205, 168, 96, 0.5)';
      ctx.lineWidth = 4;
      roundRect(ctx, 10, 10, w - 20, h - 20, 14);
      ctx.stroke();
    });

    TEX.sensorDie = makeTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#081018';
      ctx.fillRect(0, 0, w, h);
      const cell = 8;
      const colors = ['#1b4559', '#2d6a53', '#5a2b4e', '#173b52', '#3a6a45'];
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          ctx.fillStyle = colors[(x / cell + y / cell) % colors.length];
          ctx.fillRect(x, y, cell - 1, cell - 1);
        }
      }
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(150, 220, 255, 0.28)');
      g.addColorStop(0.7, 'rgba(60, 120, 200, 0.16)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });

    TEX.frontUI = makeTexture(512, 512, (ctx, w, h) => {
      // preview scene
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b2a33');
      sky.addColorStop(0.52, '#0f4a4a');
      sky.addColorStop(1, '#06151b');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // sun glow
      const sun = ctx.createRadialGradient(360, 160, 4, 360, 160, 110);
      sun.addColorStop(0, 'rgba(255, 210, 140, 0.9)');
      sun.addColorStop(0.25, 'rgba(255, 150, 90, 0.38)');
      sun.addColorStop(1, 'rgba(255, 120, 60, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(220, 20, 280, 280);

      // mountains
      ctx.fillStyle = '#08232b';
      ctx.beginPath();
      ctx.moveTo(0, 300);
      ctx.lineTo(70, 220);
      ctx.lineTo(150, 290);
      ctx.lineTo(230, 200);
      ctx.lineTo(320, 288);
      ctx.lineTo(400, 232);
      ctx.lineTo(512, 300);
      ctx.lineTo(512, 512);
      ctx.lineTo(0, 512);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#04161d';
      ctx.beginPath();
      ctx.moveTo(0, 360);
      ctx.lineTo(120, 310);
      ctx.lineTo(250, 370);
      ctx.lineTo(390, 320);
      ctx.lineTo(512, 372);
      ctx.lineTo(512, 512);
      ctx.lineTo(0, 512);
      ctx.closePath();
      ctx.fill();

      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo((w / 3) * i, 0);
        ctx.lineTo((w / 3) * i, h);
        ctx.moveTo(0, (h / 3) * i);
        ctx.lineTo(w, (h / 3) * i);
        ctx.stroke();
      }
      // corner brackets
      ctx.strokeStyle = 'rgba(120, 245, 255, 0.85)';
      ctx.lineWidth = 4;
      const m = 16, len = 32;
      [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p[0] + len * p[2], p[1]);
        ctx.lineTo(p[0], p[1]);
        ctx.lineTo(p[0], p[1] + len * p[3]);
        ctx.stroke();
      });

      // top HUD
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(42, 44, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 24px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('REC', 60, 52);
      ctx.font = '500 20px "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText('00:12:34', 124, 51);
      // battery
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      roundRect(ctx, 400, 32, 44, 20, 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(408, 36, 28, 12);
      ctx.fillRect(446, 38, 4, 8);

      // bottom chip
      ctx.fillStyle = 'rgba(3, 10, 14, 0.62)';
      roundRect(ctx, 24, h - 108, 168, 78, 12);
      ctx.fill();
      ctx.fillStyle = '#7ef2ff';
      ctx.font = '700 32px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('4K', 42, h - 62);
      ctx.font = '600 17px "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.fillText('60 FPS · 16:9', 42, h - 38);
      ctx.fillStyle = '#ffc857';
      ctx.font = '600 15px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('D-Log M', 202, h - 66);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '500 14px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('1/120  ISO 100', 202, h - 42);

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '500 13px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('155° ULTRA WIDE', w - 22, h - 26);
      ctx.textAlign = 'left';

      // bottom buttons
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(w / 2, h - 44, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a1a20';
      ctx.beginPath();
      ctx.arc(w / 2, h - 44, 15, 0, Math.PI * 2);
      ctx.fill();
    });

    TEX.rearUI = makeTexture(1024, 576, (ctx, w, h) => {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#071219');
      bg.addColorStop(1, '#04080d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // header
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 24px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('PLAYBACK', 36, 48);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '500 18px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('1 / 48', 172, 48);
      ctx.textAlign = 'right';
      ctx.fillText('4K · 120 FPS', w - 36, 48);
      ctx.textAlign = 'left';

      // thumbnails
      for (let i = 0; i < 5; i++) {
        const x = 36 + i * 190;
        const g = ctx.createLinearGradient(x, 84, x + 160, 200);
        g.addColorStop(0, i % 2 ? '#154b55' : '#1b3d5c');
        g.addColorStop(1, '#0a1b26');
        ctx.fillStyle = g;
        roundRect(ctx, x, 84, 160, 92, 8);
        ctx.fill();
        if (i === 0) {
          ctx.strokeStyle = '#5ce8ff';
          ctx.lineWidth = 3;
          roundRect(ctx, x, 84, 160, 92, 8);
          ctx.stroke();
        }
        ctx.fillStyle = '#8fd6de';
        ctx.beginPath();
        ctx.moveTo(x + 70, 112);
        ctx.lineTo(x + 70, 148);
        ctx.lineTo(x + 100, 130);
        ctx.closePath();
        ctx.fill();
      }

      // main preview
      const pv = ctx.createLinearGradient(280, 220, 800, 470);
      pv.addColorStop(0, '#0b2b35');
      pv.addColorStop(0.5, '#12525a');
      pv.addColorStop(1, '#07121a');
      ctx.fillStyle = pv;
      roundRect(ctx, 240, 210, 560, 260, 12);
      ctx.fill();
      ctx.fillStyle = '#0a1c21';
      ctx.beginPath();
      ctx.moveTo(240, 380);
      ctx.lineTo(330, 310);
      ctx.lineTo(420, 372);
      ctx.lineTo(520, 300);
      ctx.lineTo(640, 380);
      ctx.lineTo(720, 330);
      ctx.lineTo(800, 382);
      ctx.lineTo(800, 470);
      ctx.lineTo(240, 470);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(240 + (560 / 3) * i, 210);
        ctx.lineTo(240 + (560 / 3) * i, 470);
        ctx.stroke();
      }

      // side panel
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, 830, 210, 158, 260, 10);
      ctx.fill();
      const items = ['▣  EXPOSURE', '◈  COLOR', '⏱  TIMELAPSE', '⌁  STABILIZE'];
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '500 16px "Helvetica Neue", Arial, sans-serif';
      items.forEach((t, i) => ctx.fillText(t, 848, 250 + i * 48));

      // timeline
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      roundRect(ctx, 240, 496, 560, 6, 3);
      ctx.fill();
      ctx.fillStyle = '#62e7ff';
      roundRect(ctx, 240, 496, 210, 6, 3);
      ctx.fill();
      ctx.fillStyle = '#62e7ff';
      ctx.beginPath();
      ctx.arc(450, 499, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '500 16px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('00:12', 36, 512);
      ctx.fillText('01:48', 828, 512);

      // play controls
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(490, 532);
      ctx.lineTo(490, 556);
      ctx.lineTo(510, 544);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(528, 534, 4, 20);
      ctx.fillRect(540, 534, 4, 20);
    });

    TEX.battery = makeTexture(1024, 640, (ctx, w, h) => {
      ctx.fillStyle = '#1a1d22';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(255,255,255,0.06)');
      g.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#ff6a00';
      ctx.fillRect(0, 0, w, 16);
      ctx.fillStyle = 'rgba(255,106,0,0.14)';
      ctx.fillRect(0, 16, w, 120);

      ctx.fillStyle = '#f2f5f8';
      ctx.font = '800 74px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('DJI', 55, 120);
      ctx.font = '600 25px "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = 'rgba(240,245,250,0.82)';
      spacedText(ctx, 'EXTREME BATTERY', 58, 175, 4);

      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(55, 205);
      ctx.lineTo(w - 55, 205);
      ctx.stroke();

      ctx.fillStyle = '#ffb057';
      ctx.font = '700 84px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('1770', 55, 305);
      ctx.font = '600 30px "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('mAh', 250, 300);

      const rows = [
        ['ENERGY', '6.8 Wh'],
        ['VOLTAGE', '3.85 V'],
        ['TYPE', 'LiPo 1S'],
        ['MODEL', 'AB4 · 2023'],
        ['TEMP', '-20°C ~ 45°C']
      ];
      ctx.font = '500 20px "Helvetica Neue", Arial, sans-serif';
      rows.forEach((r, i) => {
        const y = 370 + i * 40;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(r[0], 58, y);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.fillText(r[1], 240, y);
      });

      // warning block
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      roundRect(ctx, 55, 560, 300, 52, 8);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '500 15px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('CAUTION · DO NOT PUNCTURE', 70, 592);

      // barcode
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      let bx = 740;
      for (let i = 0; i < 42; i++) {
        const bw = Math.random() > 0.5 ? 3 : 6;
        ctx.fillRect(bx, 360, bw, 150);
        bx += bw + 4;
      }
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '500 15px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('AB4-1770-6.8', 740, 545);
    });

    TEX.door = makeTexture(512, 640, (ctx, w, h) => {
      ctx.fillStyle = '#20242a';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.02)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // seal line
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 14;
      roundRect(ctx, 24, 24, w - 48, h - 48, 34);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 3;
      roundRect(ctx, 24, 24, w - 48, h - 48, 34);
      ctx.stroke();

      // USB-C
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, 150, 180, 190, 54, 26);
      ctx.fill();
      ctx.fillStyle = '#0a0c0f';
      roundRect(ctx, 158, 188, 174, 38, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(190, 205, 215, 0.5)';
      ctx.lineWidth = 2;
      roundRect(ctx, 158, 188, 174, 38, 20);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '600 18px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('USB-C', 206, 164);

      // microSD
      ctx.fillStyle = '#0a0c0f';
      roundRect(ctx, 150, 320, 190, 34, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160, 175, 185, 0.4)';
      ctx.lineWidth = 2;
      roundRect(ctx, 150, 320, 190, 34, 8);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '600 18px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('microSD', 206, 304);

      // latch
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      roundRect(ctx, 150, 440, 210, 70, 12);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(180, 458 + i * 10, 150, 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '600 15px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('PUSH TO OPEN', 188, 556);

      // DJI mark
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = '800 28px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('DJI', 30, 610);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = '500 14px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('ACTION 4', 84, 608);
    });

    TEX.grille = makeTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      for (let y = 18; y < h - 10; y += 22) {
        for (let x = 18; x < w - 10; x += 22) {
          ctx.beginPath();
          ctx.arc(x + ((y / 22) % 2) * 11, y, 5.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    TEX.logo = makeTexture(512, 160, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(235, 242, 248, 0.92)';
      ctx.font = '800 118px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DJI', w / 2, 124);
    });

    TEX.modelMark = makeTexture(1024, 128, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(190, 206, 220, 0.72)';
      ctx.font = '600 44px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      spacedText(ctx, 'OSMO ACTION 4', 300, 84, 9);
    });

    TEX.keyTop = makeTexture(256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#3a0d0d');
      g.addColorStop(1, '#120607');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255, 90, 90, 0.8)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ff3d3d';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 34, 0, Math.PI * 2);
      ctx.fill();
    });

    TEX.powerIcon = makeTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(230, 240, 250, 0.85)';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 + 10, 62, Math.PI * 0.32, Math.PI * 1.68);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w / 2, 50);
      ctx.lineTo(w / 2, 120);
      ctx.stroke();
    });
  }

  /* ---------------------------------------------------------------------
   * 部件构建
   * ------------------------------------------------------------------- */

  function buildBody() {
    const g = new T.Group();

    const shellMat = phys(0x171a1e, {
      roughness: 0.52, metalness: 0.42, clearcoat: 0.22, clearcoatRoughness: 0.5
    });
    const shell = mesh(rb(DIM.w, DIM.h, DIM.d, 0.24, 5), shellMat);
    g.add(shell);

    // 前后玻璃纤维面板
    const plateMat = phys(0x121519, {
      roughness: 0.44, metalness: 0.6, clearcoat: 0.28, clearcoatRoughness: 0.42
    });
    g.add(mesh(rb(4.56, 2.80, 0.09, 0.20, 4), plateMat, [0, 0, DIM.halfD + 0.005]));
    g.add(mesh(rb(4.56, 2.80, 0.09, 0.20, 4), plateMat, [0, 0, -DIM.halfD - 0.005]));

    // 顶部 / 底部金属饰条
    const trimMat = std(0x252a30, { roughness: 0.34, metalness: 0.85 });
    g.add(mesh(rb(4.35, 0.12, 1.86, 0.06, 3), trimMat, [0, DIM.halfH - 0.03, 0]));
    g.add(mesh(rb(4.20, 0.10, 1.80, 0.05, 3), trimMat, [0, -DIM.halfH + 0.03, 0]));

    // 侧面防滑橡胶条
    const rubberMat = std(0x0f1114, { roughness: 0.9, metalness: 0.05 });
    [-1, 1].forEach(s => {
      g.add(mesh(rb(0.10, 2.62, 1.62, 0.05, 3), rubberMat, [s * (DIM.halfW - 0.035), 0, 0]));
    });

    // 前部 DJI 标识与型号
    const logoMat = new T.MeshBasicMaterial({
      map: TEX.logo, transparent: true, opacity: 0.9, depthWrite: false
    });
    g.add(plane(0.82, 0.26, logoMat, [1.02, -1.13, DIM.halfD + 0.056]));

    const markMat = new T.MeshBasicMaterial({
      map: TEX.modelMark, transparent: true, opacity: 0.85, depthWrite: false
    });
    g.add(plane(1.72, 0.215, markMat, [-1.18, -1.06, DIM.halfD + 0.056]));

    // 前部状态指示灯
    const ledMat = new T.MeshBasicMaterial({ color: 0x5cffb0 });
    g.add(mesh(new T.CircleGeometry(0.045, 24), ledMat, [1.88, 1.13, DIM.halfD + 0.058]));

    // 侧边扬声器孔
    const grilleMat = new T.MeshBasicMaterial({
      map: TEX.grille, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide
    });
    g.add(plane(1.25, 0.62, grilleMat, [-DIM.halfW - 0.002, 0.28, 0.12], [0, -Math.PI / 2, 0]));
    g.add(plane(0.72, 0.3, grilleMat.clone(), [-0.55, 1.2, DIM.halfD + 0.056]));

    // 螺丝
    const screwMat = std(0x7c848c, { roughness: 0.3, metalness: 0.95 });
    const screwHole = std(0x0a0c0e, { roughness: 0.8, metalness: 0.2 });
    [[-1.92, -1.16], [1.98, -1.16], [-1.92, 1.16], [1.98, 1.16]].forEach(p => {
      const s = mesh(new T.CylinderGeometry(0.055, 0.055, 0.02, 20), screwMat, [p[0], p[1], DIM.halfD + 0.058]);
      s.rotation.x = Math.PI / 2;
      g.add(s);
      const h = mesh(new T.CircleGeometry(0.024, 12), screwHole, [p[0], p[1], DIM.halfD + 0.07]);
      g.add(h);
    });

    // 背面底部丝印
    const rearMark = makeTexture(1024, 160, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(150, 165, 180, 0.5)';
      ctx.font = '500 38px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      spacedText(ctx, 'DJI OSMO ACTION 4', 320, 96, 6);
    });
    g.add(plane(2.1, 0.32, new T.MeshBasicMaterial({
      map: rearMark, transparent: true, opacity: 0.7, depthWrite: false
    }), [0, -1.15, -DIM.halfD - 0.058], [0, Math.PI, 0]));

    return g;
  }

  function buildGlass() {
    const g = new T.Group();
    const glassMat = new T.MeshPhysicalMaterial({
      color: 0x8fc8ff, metalness: 0.1, roughness: 0.03,
      transparent: true, opacity: 0.14, side: T.DoubleSide,
      clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.0,
      depthWrite: false
    });
    const glass = discZ(1.0, 1.0, 0.045, glassMat, 72);
    g.add(glass);

    const rimMat = std(0x3c444d, { roughness: 0.28, metalness: 0.95 });
    const rim = torusZ(0.985, 0.028, rimMat, 72);
    rim.position.z = 0.024;
    g.add(rim);
    const innerRim = torusZ(0.9, 0.012, std(0x6a7783, { roughness: 0.25, metalness: 1 }), 64);
    innerRim.position.z = 0.03;
    g.add(innerRim);

    // 玻璃上的青色镀膜反光
    const flareTex = radialGlowTexture('rgba(120, 230, 255, 0.95)', 'rgba(120, 230, 255, 0)');
    const flare = new T.Sprite(new T.SpriteMaterial({
      map: flareTex, color: 0x8fe6ff, blending: T.AdditiveBlending,
      transparent: true, opacity: 0.28, depthWrite: false
    }));
    flare.scale.set(0.75, 0.75, 1);
    flare.position.set(-0.22, 0.24, 0.035);
    g.add(flare);
    return g;
  }

  function buildLens() {
    const g = new T.Group();

    // 外圈金属环
    const outerRing = std(0x2c3238, { roughness: 0.3, metalness: 0.95 });
    const barrel = discZ(1.0, 1.0, 0.20, outerRing, 72);
    barrel.position.z = 0.04;
    g.add(barrel);

    const bevelRing = torusZ(0.985, 0.04, std(0x515b64, { roughness: 0.22, metalness: 1 }), 72);
    bevelRing.position.z = 0.15;
    g.add(bevelRing);

    // 内圈黑色镜筒
    const blackMat = std(0x07090b, { roughness: 0.55, metalness: 0.4 });
    const inner = discZ(0.92, 0.82, 0.16, blackMat, 72);
    inner.position.z = 0.11;
    g.add(inner);

    // 同心镜片环
    const ringMat = std(0x171c22, { roughness: 0.25, metalness: 0.95 });
    [[0.78, 0.03, 0.19], [0.66, 0.022, 0.205], [0.52, 0.016, 0.213]].forEach(r => {
      const ring = torusZ(r[0], r[1], ringMat, 64);
      ring.position.z = r[2];
      g.add(ring);
    });

    // 镜片玻璃
    const lensMat = new T.MeshPhysicalMaterial({
      color: 0x050b16, metalness: 0.7, roughness: 0.035,
      clearcoat: 1, clearcoatRoughness: 0.02,
      emissive: 0x061523, emissiveIntensity: 0.3, envMapIntensity: 2.4
    });
    const glass = discZ(0.44, 0.5, 0.05, lensMat, 64);
    glass.position.z = 0.215;
    g.add(glass);

    // 镜片内部的蓝紫光学镀膜
    const irisMat = new T.MeshBasicMaterial({
      color: 0x2757ff, transparent: true, opacity: 0.38,
      blending: T.AdditiveBlending, depthWrite: false
    });
    const iris = mesh(new T.CircleGeometry(0.4, 48), irisMat, [0, 0, 0.245]);
    g.add(iris);
    const pupil = mesh(new T.CircleGeometry(0.2, 40), new T.MeshBasicMaterial({ color: 0x04060b }), [0, 0, 0.248]);
    g.add(pupil);

    // 高光反射
    const flareTex = radialGlowTexture('rgba(170, 215, 255, 1)', 'rgba(140, 120, 255, 0)');
    const flare = new T.Sprite(new T.SpriteMaterial({
      map: flareTex, color: 0xbcd8ff, blending: T.AdditiveBlending,
      transparent: true, opacity: 0.42, depthWrite: false
    }));
    flare.scale.set(0.5, 0.5, 1);
    flare.position.set(-0.17, 0.2, 0.27);
    g.add(flare);
    const flare2 = flare.clone();
    flare2.material = flare.material.clone();
    flare2.material.color.setHex(0x8b6bff);
    flare2.scale.set(0.28, 0.28, 1);
    flare2.position.set(0.12, -0.16, 0.27);
    flare2.material.opacity = 0.28;
    g.add(flare2);

    return g;
  }

  function buildSensor() {
    const g = new T.Group();

    const boardMat = std(0x0c1f2a, {
      map: TEX.pcb, roughness: 0.62, metalness: 0.3
    });
    g.add(mesh(rb(1.5, 1.5, 0.06, 0.04, 2), boardMat));

    const frameMat = std(0x242a30, { roughness: 0.35, metalness: 0.9 });
    g.add(mesh(rb(1.62, 1.62, 0.03, 0.04, 2), frameMat, [0, 0, -0.045]));

    // 传感器芯片基座
    g.add(mesh(rb(0.74, 0.74, 0.09, 0.02, 2), std(0x171b1f, { roughness: 0.5, metalness: 0.6 }), [0, 0, 0.055]));
    const dieMat = new T.MeshPhysicalMaterial({
      map: TEX.sensorDie, color: 0xffffff, metalness: 0.55, roughness: 0.22,
      clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x182a3a, emissiveIntensity: 0.55
    });
    g.add(plane(0.62, 0.62, dieMat, [0, 0, 0.101]));

    // 芯片保护玻璃
    const dieGlassMat = new T.MeshPhysicalMaterial({
      color: 0x7bd4ff, transparent: true, opacity: 0.16, roughness: 0.03,
      metalness: 0.2, clearcoat: 1, depthWrite: false, side: T.DoubleSide
    });
    g.add(plane(0.7, 0.7, dieGlassMat, [0, 0, 0.112]));

    // 金色触点 / 排线
    const goldMat = std(0xc9a256, { roughness: 0.3, metalness: 1 });
    [-1, 1].forEach(s => {
      g.add(mesh(rb(0.1, 1.16, 0.02, 0.01, 1), goldMat, [s * 0.66, 0, 0.035]));
    });

    const flexMat = std(0x3b2c18, { roughness: 0.7, metalness: 0.25 });
    const flex = mesh(rb(0.6, 0.66, 0.02, 0.02, 1), flexMat, [0.12, -1.05, 0.005]);
    flex.rotation.z = 0.16;
    g.add(flex);
    g.add(mesh(rb(0.44, 0.1, 0.03, 0.01, 1), goldMat, [0.12, -1.32, 0.005]));

    // 排线上的走线
    const traceTex = makeTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#2a2116';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(215, 175, 100, 0.85)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(20 + i * 18, 0);
        ctx.lineTo(20 + i * 18, h);
        ctx.stroke();
      }
    });
    g.add(plane(0.56, 0.6, new T.MeshBasicMaterial({ map: traceTex }), [0.12, -1.04, 0.019], [0, 0, 0.16]));

    // 小电容
    for (let i = 0; i < 5; i++) {
      g.add(mesh(new T.CylinderGeometry(0.035, 0.035, 0.1, 12), std(0x8c7a55, { metalness: 0.7, roughness: 0.4 }),
        [-0.62 + i * 0.1, 0.66, 0.055], [0, 0, 0]));
    }

    return g;
  }

  function buildFrontScreen() {
    const g = new T.Group();

    const bezelMat = std(0x0b0d10, { roughness: 0.3, metalness: 0.65 });
    g.add(mesh(rb(1.58, 1.58, 0.1, 0.1, 3), bezelMat));
    g.add(mesh(rb(1.66, 1.66, 0.04, 0.1, 3), std(0x252a30, { roughness: 0.3, metalness: 0.9 }), [0, 0, 0.055]));

    const screenMat = new T.MeshStandardMaterial({
      map: TEX.frontUI,
      emissiveMap: TEX.frontUI,
      emissive: 0xffffff,
      emissiveIntensity: 2.0,
      roughness: 0.22,
      metalness: 0.2
    });
    g.add(plane(1.38, 1.38, screenMat, [0, 0, 0.078]));

    const glassMat = new T.MeshPhysicalMaterial({
      color: 0xbfe9ff, transparent: true, opacity: 0.1,
      roughness: 0.02, metalness: 0.15, clearcoat: 1, depthWrite: false
    });
    g.add(plane(1.44, 1.44, glassMat, [0, 0, 0.086]));

    // 背部排线（拆解后可见）
    const ribbonMat = std(0x3a2a16, { roughness: 0.75, metalness: 0.2 });
    const rib = mesh(rb(0.52, 0.5, 0.02, 0.02, 1), ribbonMat, [0, -0.98, -0.06]);
    rib.rotation.z = -0.1;
    g.add(rib);
    g.add(mesh(rb(0.4, 0.08, 0.025, 0.01, 1), std(0xc9a256, { metalness: 1, roughness: 0.3 }), [0, -1.26, -0.06]));

    return g;
  }

  function buildMainboard() {
    const g = new T.Group();

    const boardMat = new T.MeshStandardMaterial({
      map: TEX.pcb, roughness: 0.58, metalness: 0.3
    });
    g.add(mesh(rb(3.9, 2.3, 0.07, 0.05, 2), boardMat));

    const chipMat = std(0x15181c, { roughness: 0.4, metalness: 0.55 });
    const canMat = std(0x9aa4ad, { roughness: 0.26, metalness: 1 });
    const goldMat = std(0xc9a256, { roughness: 0.3, metalness: 1 });

    // SoC + 屏蔽罩
    g.add(mesh(rb(0.78, 0.78, 0.05, 0.02, 2), chipMat, [-0.55, 0.18, 0.07]));
    g.add(mesh(rb(0.85, 0.85, 0.05, 0.02, 2), canMat, [-0.55, 0.18, 0.105]));
    const socLabel = makeTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#2c3238';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(220, 230, 238, 0.75)';
      ctx.font = '700 42px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DJI', w / 2, 108);
      ctx.font = '500 25px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('SoC', w / 2, 152);
      ctx.fillStyle = 'rgba(220,230,238,0.4)';
      ctx.font = '500 18px "Helvetica Neue", Arial, sans-serif';
      ctx.fillText('2023 · TW', w / 2, 190);
    });
    g.add(plane(0.8, 0.8, new T.MeshBasicMaterial({ map: socLabel }), [-0.55, 0.18, 0.132]));

    // 无线模块
    g.add(mesh(rb(0.95, 0.6, 0.04, 0.02, 2), chipMat, [1.28, -0.52, 0.06]));
    g.add(mesh(rb(1.0, 0.64, 0.04, 0.02, 2), canMat, [1.28, -0.52, 0.09]));
    const wifiLabel = makeTexture(256, 160, (ctx, w, h) => {
      ctx.fillStyle = '#333a41';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(230, 238, 244, 0.8)';
      ctx.font = '700 32px "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Wi-Fi / BLE', w / 2, 74);
      ctx.font = '500 22px "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = 'rgba(230,238,244,0.5)';
      ctx.fillText('2.4G · 5G', w / 2, 112);
    });
    g.add(plane(0.9, 0.56, new T.MeshBasicMaterial({ map: wifiLabel }), [1.28, -0.52, 0.113]));

    // 电源管理屏蔽罩
    g.add(mesh(rb(0.9, 0.55, 0.04, 0.02, 2), canMat, [0.85, 0.6, 0.06]));

    // 电感
    [[-1.42, -0.55], [-1.42, 0.42], [0.05, -0.75]].forEach(p => {
      g.add(mesh(rb(0.22, 0.22, 0.16, 0.02, 2), std(0x2b2f34, { roughness: 0.55, metalness: 0.5 }), [p[0], p[1], 0.08]));
    });

    // 电容
    for (let i = 0; i < 6; i++) {
      g.add(mesh(new T.CylinderGeometry(0.045, 0.045, 0.14, 10), std(0x8c7a55, { metalness: 0.75, roughness: 0.35 }),
        [-1.62 + i * 0.12, 1.0, 0.08], [0, 0, 0]));
    }

    // 排线连接器
    const connMat = std(0xd2a24a, { roughness: 0.4, metalness: 0.7 });
    [[-1.55, 0.5, 0.3], [-1.55, -0.2, 0.3], [0.35, 1.0, 0.0], [2.02, 0.4, -0.2]].forEach(p => {
      g.add(mesh(rb(0.22, 0.1, 0.06, 0.01, 1), connMat, [p[0], p[1], 0.075]));
    });

    // 屏蔽罩上的细纹
    for (let i = 0; i < 5; i++) {
      g.add(mesh(rb(0.01, 0.5, 0.01, 0.005, 1), std(0x6a747c, { metalness: 0.9, roughness: 0.4 }), [-0.9 + i * 0.18, 0.18, 0.135]));
    }

    // 螺丝
    [[-1.78, -1.0], [1.78, -1.0], [-1.78, 1.0], [1.78, 1.0]].forEach(p => {
      g.add(mesh(new T.CylinderGeometry(0.045, 0.045, 0.05, 12), goldMat, [p[0], p[1], 0.06], [Math.PI / 2, 0, 0]));
    });

    // 排线（向下连接）
    const rb1 = mesh(rb(0.78, 0.7, 0.015, 0.01, 1), std(0x2f2415, { roughness: 0.8 }), [0.3, -1.35, -0.01]);
    rb1.rotation.z = 0.08;
    g.add(rb1);

    return g;
  }

  function buildHeatsink() {
    const g = new T.Group();

    const copper = std(0xb06a38, { roughness: 0.3, metalness: 1, emissive: 0x2a1206, emissiveIntensity: 0.25 });
    g.add(mesh(rb(3.24, 1.72, 0.04, 0.04, 2), copper));

    // 石墨烯片
    g.add(mesh(rb(2.96, 1.5, 0.022, 0.03, 2), std(0x202429, { roughness: 0.92, metalness: 0.15 }), [0, 0, 0.035]));

    // 均热块
    g.add(mesh(rb(0.95, 0.9, 0.14, 0.03, 2), std(0x555b60, { roughness: 0.35, metalness: 0.95 }), [-0.55, 0.15, 0.1]));

    // 热管
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(-1.45, -0.55, 0.07),
      new T.Vector3(-0.6, -0.68, 0.09),
      new T.Vector3(0.5, -0.62, 0.09),
      new T.Vector3(1.42, -0.4, 0.07)
    ]);
    const tube = new T.Mesh(new T.TubeGeometry(curve, 40, 0.055, 10, false),
      std(0xb87a45, { roughness: 0.25, metalness: 1 }));
    tube.castShadow = true;
    g.add(tube);

    // 散热鳍片
    const finMat = std(0x8e979e, { roughness: 0.35, metalness: 0.95 });
    for (let i = 0; i < 9; i++) {
      g.add(mesh(rb(0.035, 0.95, 0.05, 0.01, 1), finMat, [1.35, 0.12, -0.62 + i * 0.155]));
    }

    return g;
  }

  function buildBattery() {
    const g = new T.Group();

    const caseMat = std(0x24272c, { roughness: 0.62, metalness: 0.35 });
    g.add(mesh(rb(3.48, 2.3, 0.58, 0.1, 3), caseMat));

    // 正面标签（朝后）
    const labelMat = new T.MeshStandardMaterial({
      map: TEX.battery, roughness: 0.65, metalness: 0.15
    });
    g.add(plane(3.24, 2.05, labelMat, [0, 0, -0.296], [0, Math.PI, 0]));

    // 橙色拉带
    g.add(mesh(rb(1.05, 0.1, 0.02, 0.02, 1), std(0xff6a00, { roughness: 0.5, metalness: 0.2, emissive: 0x3a1400, emissiveIntensity: 0.6 }),
      [0.95, -1.12, -0.3]));

    // 触点
    const goldMat = std(0xc9a256, { roughness: 0.25, metalness: 1 });
    for (let i = 0; i < 4; i++) {
      g.add(mesh(rb(0.16, 0.32, 0.05, 0.01, 1), goldMat, [-1.15 + i * 0.42, 1.16, -0.02]));
    }

    // 侧边卡扣
    const latchMat = std(0x3a4047, { roughness: 0.4, metalness: 0.8 });
    [-1, 1].forEach(s => {
      g.add(mesh(rb(0.08, 0.6, 0.26, 0.03, 1), latchMat, [s * 1.75, -0.35, 0]));
    });

    // 背面纹理条
    g.add(mesh(rb(3.2, 0.04, 0.02, 0.01, 1), std(0x111317, { roughness: 0.9 }), [0, 0.95, -0.3]));

    return g;
  }

  function buildRearScreen() {
    const g = new T.Group();

    const bezelMat = std(0x0b0d10, { roughness: 0.3, metalness: 0.65 });
    g.add(mesh(rb(2.78, 1.68, 0.1, 0.09, 3), bezelMat));
    g.add(mesh(rb(2.86, 1.76, 0.04, 0.09, 3), std(0x252a30, { roughness: 0.3, metalness: 0.9 }), [0, 0, -0.055]));

    const screenMat = new T.MeshStandardMaterial({
      map: TEX.rearUI, emissiveMap: TEX.rearUI, emissive: 0xffffff,
      emissiveIntensity: 1.05, roughness: 0.22, metalness: 0.2
    });
    g.add(plane(2.5, 1.4, screenMat, [0, 0, -0.078], [0, Math.PI, 0]));

    const glassMat = new T.MeshPhysicalMaterial({
      color: 0xbfe9ff, transparent: true, opacity: 0.1, roughness: 0.02,
      metalness: 0.15, clearcoat: 1, depthWrite: false
    });
    g.add(plane(2.56, 1.46, glassMat, [0, 0, -0.086], [0, Math.PI, 0]));

    // 排线
    g.add(mesh(rb(0.7, 0.4, 0.02, 0.02, 1), std(0x3a2a16, { roughness: 0.75 }), [0, 1.03, 0.055]));
    g.add(mesh(rb(0.5, 0.08, 0.025, 0.01, 1), std(0xc9a256, { metalness: 1, roughness: 0.3 }), [0, 1.25, 0.055]));

    return g;
  }

  function buildMics() {
    const g = new T.Group();
    const portMat = std(0x101316, { roughness: 0.8, metalness: 0.4 });
    const rimMat = std(0x6d777f, { roughness: 0.3, metalness: 1 });
    const positions = [[-1.15, 0.035, 0.32], [0.1, 0.035, 0.32], [1.3, 0.035, 0.32]];
    positions.forEach(p => {
      const port = mesh(new T.CylinderGeometry(0.1, 0.1, 0.09, 24), portMat, p);
      g.add(port);
      const rim = mesh(new T.TorusGeometry(0.1, 0.016, 10, 28), rimMat, [p[0], p[1] + 0.045, p[2]]);
      rim.rotation.x = Math.PI / 2;
      g.add(rim);
      const meshGrille = mesh(new T.CircleGeometry(0.08, 20), new T.MeshBasicMaterial({ color: 0x05070a }), [p[0], p[1] + 0.046, p[2]]);
      meshGrille.rotation.x = -Math.PI / 2;
      g.add(meshGrille);
    });

    // 内部排线
    g.add(mesh(rb(2.9, 0.05, 0.18, 0.01, 1), std(0x2f2415, { roughness: 0.85 }), [0.06, -0.06, 0.05]));

    return g;
  }

  function buildMount() {
    const g = new T.Group();

    const plateMat = std(0x242a30, { roughness: 0.3, metalness: 0.9 });
    g.add(mesh(rb(2.5, 0.14, 1.6, 0.07, 3), plateMat));
    g.add(mesh(rb(2.66, 0.05, 1.72, 0.06, 2), std(0x343b42, { roughness: 0.26, metalness: 1 }), [0, 0.08, 0]));

    // 磁吸环
    const magnetMat = std(0x6f7a83, { roughness: 0.4, metalness: 0.95 });
    [-0.62, 0.62].forEach(x => {
      const ring = mesh(new T.TorusGeometry(0.3, 0.075, 12, 40), magnetMat, [x, -0.075, 0]);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const inner = mesh(new T.CylinderGeometry(0.24, 0.24, 0.02, 32), std(0x0d0f12, { roughness: 0.8, metalness: 0.3 }), [x, -0.082, 0]);
      g.add(inner);
    });

    // 中央锁扣槽
    g.add(mesh(rb(0.34, 0.04, 0.72, 0.06, 2), std(0x0f1215, { roughness: 0.5, metalness: 0.6 }), [0, -0.083, 0]));
    g.add(mesh(rb(0.2, 0.05, 0.2, 0.04, 1), std(0xc9a256, { roughness: 0.35, metalness: 1 }), [0, -0.08, 0]));

    // 1/4 螺纹
    const thread = mesh(new T.TorusGeometry(0.17, 0.035, 12, 32), std(0x4a535b, { roughness: 0.35, metalness: 1 }), [0, -0.084, 0]);
    thread.rotation.x = Math.PI / 2;
    g.add(thread);

    // 螺丝
    [[-1.0, 0.55], [1.0, 0.55], [-1.0, -0.55], [1.0, -0.55]].forEach(p => {
      g.add(mesh(new T.CylinderGeometry(0.04, 0.04, 0.03, 12), std(0x858f98, { metalness: 1, roughness: 0.3 }), [p[0], -0.08, p[1]]));
    });

    return g;
  }

  function buildDoor() {
    const g = new T.Group();

    const panelMat = std(0x23272d, { roughness: 0.48, metalness: 0.5 });
    g.add(mesh(rb(0.12, 2.52, 1.98, 0.07, 3), panelMat));
    g.add(mesh(rb(0.16, 2.34, 1.82, 0.06, 2), std(0x101316, { roughness: 0.85 }), [-0.035, 0, 0]));

    // 面板丝印（含 USB-C / microSD 细节）
    const texMat = new T.MeshStandardMaterial({
      map: TEX.door, roughness: 0.5, metalness: 0.35
    });
    g.add(plane(1.86, 2.38, texMat, [0.062, 0, 0], [0, Math.PI / 2, 0]));

    // USB-C / SD 立体凹槽（与面板丝印位置对齐）
    const slotMat = std(0x05070a, { roughness: 0.8, metalness: 0.2 });
    const rimMat = std(0x6d777f, { roughness: 0.3, metalness: 1 });
    const usb = mesh(rb(0.035, 0.19, 0.64, 0.09, 3), slotMat, [0.071, 0.42, 0.04]);
    g.add(usb);
    const usbRim = mesh(rb(0.025, 0.24, 0.7, 0.11, 3), rimMat, [0.066, 0.42, 0.04]);
    g.add(usbRim);
    const usbInner = mesh(rb(0.03, 0.15, 0.56, 0.07, 3), slotMat, [0.086, 0.42, 0.04]);
    g.add(usbInner);

    const sd = mesh(rb(0.035, 0.12, 0.62, 0.03, 2), slotMat, [0.071, -0.06, 0.04]);
    g.add(sd);

    // 锁扣
    const latch = mesh(rb(0.1, 0.28, 0.62, 0.06, 2), std(0x3b424a, { roughness: 0.4, metalness: 0.85 }), [0.03, -0.58, 0]);
    g.add(latch);
    for (let i = 0; i < 4; i++) {
      g.add(mesh(rb(0.02, 0.2, 0.012, 0.005, 1), std(0x8e989f, { roughness: 0.4, metalness: 0.9 }), [0.085, -0.58, -0.1 + i * 0.07]));
    }

    // 铰链
    [-0.94, 0.94].forEach(z => {
      g.add(mesh(new T.CylinderGeometry(0.045, 0.045, 0.24, 14), std(0x4d555d, { roughness: 0.3, metalness: 1 }),
        [0, 1.22, z], [Math.PI / 2, 0, 0]));
    });

    return g;
  }

  function buildButtons() {
    const g = new T.Group();

    // 录制键
    const recBase = mesh(new T.CylinderGeometry(0.31, 0.33, 0.12, 40), std(0x2a2f35, { roughness: 0.35, metalness: 0.85 }),
      [1.5, 0.015, 0.05]);
    g.add(recBase);

    const redRing = mesh(new T.TorusGeometry(0.29, 0.028, 12, 40), new T.MeshBasicMaterial({ color: 0xff2e2e }), [1.5, 0.085, 0.05]);
    redRing.rotation.x = Math.PI / 2;
    g.add(redRing);

    const recTop = mesh(new T.CylinderGeometry(0.255, 0.255, 0.06, 40), new T.MeshStandardMaterial({
      map: TEX.keyTop, emissiveMap: TEX.keyTop, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.5
    }), [1.5, 0.1, 0.05]);
    g.add(recTop);

    // 电源键
    const powerRing = mesh(new T.CylinderGeometry(0.18, 0.19, 0.08, 32), std(0x2f353c, { roughness: 0.4, metalness: 0.85 }),
      [-1.22, 0.005, 0.05]);
    g.add(powerRing);
    const powerTop = mesh(new T.CylinderGeometry(0.14, 0.14, 0.06, 32), new T.MeshStandardMaterial({
      map: TEX.powerIcon, transparent: true, roughness: 0.35, metalness: 0.4,
      emissive: 0x8fa6b8, emissiveIntensity: 0.3
    }), [-1.22, 0.08, 0.05]);
    g.add(powerTop);

    // 密封圈
    [-1, 1].forEach(s => {
      g.add(mesh(new T.TorusGeometry(0.36, 0.02, 10, 36), std(0x0e1114, { roughness: 0.9 }), [s * 1.36, -0.045, 0.05]));
    });

    // 按键排线
    g.add(mesh(rb(2.5, 0.04, 0.16, 0.01, 1), std(0x2f2415, { roughness: 0.85 }), [0.2, -0.08, 0.05]));

    return g;
  }

  const BUILDERS = {
    body: buildBody,
    glass: buildGlass,
    lens: buildLens,
    sensor: buildSensor,
    frontScreen: buildFrontScreen,
    mainboard: buildMainboard,
    heatsink: buildHeatsink,
    battery: buildBattery,
    rearScreen: buildRearScreen,
    mics: buildMics,
    mount: buildMount,
    door: buildDoor,
    buttons: buildButtons
  };

  /* ---------------------------------------------------------------------
   * 对外接口
   * ------------------------------------------------------------------- */
  function build(scene) {
    buildSharedTextures();

    const root = new T.Group();
    root.name = 'Action4Root';
    scene.add(root);

    const parts = [];
    const byId = {};

    PARTS_DATA.forEach((info, index) => {
      const builder = BUILDERS[info.id];
      if (!builder) return;
      const group = builder();
      group.name = 'part_' + info.id;

      const base = BASE[info.id] || [0, 0, 0];
      group.position.set(base[0], base[1], base[2]);
      group.userData.partId = info.id;
      group.userData.partIndex = index;

      const materials = [];
      const meshes = [];
      group.traverse(obj => {
        if (obj.isMesh || obj.isSprite) {
          obj.userData.partId = info.id;
          meshes.push(obj);
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => {
              if (m && materials.indexOf(m) === -1) materials.push(m);
            });
          }
        }
      });

      // 记录材质原始自发光，用于高亮
      materials.forEach(m => {
        m.userData.baseEmissive = m.emissive ? m.emissive.getHex() : 0x000000;
        m.userData.baseEmissiveIntensity = m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1;
      });

      const part = {
        id: info.id,
        info: info,
        group: group,
        index: index,
        base: new T.Vector3(base[0], base[1], base[2]),
        baseRot: group.rotation.clone(),
        explodeRot: new T.Vector3(
          (EXPLODE_ROT[info.id] || [0, 0, 0])[0],
          (EXPLODE_ROT[info.id] || [0, 0, 0])[1],
          (EXPLODE_ROT[info.id] || [0, 0, 0])[2]
        ),
        explodeOffset: new T.Vector3(info.explode[0], info.explode[1], info.explode[2]).multiplyScalar(0.74),
        anchor: new T.Vector3(info.anchor[0], info.anchor[1], info.anchor[2]),
        materials: materials,
        meshes: meshes,
        t: 0,
        target: 0,
        delay: 0,
        animStart: 0,
        highlighted: false
      };
      group.userData.part = part;
      byId[info.id] = part;
      parts.push(part);
      root.add(group);
    });

    // 装配状态下的包围盒
    const box = new T.Box3().setFromObject(root);

    return { root: root, parts: parts, byId: byId, box: box };
  }

  window.Action4Model = { build: build, DIM: DIM, BASE: BASE, TEX: TEX };
})();
