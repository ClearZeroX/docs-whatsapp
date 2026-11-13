/* =========================================================================
 * Mechanical Watch — 3D Teardown
 * js/model.js — 注册表：把 data.js 的部件元数据与各模块生成的几何组装起来
 * ========================================================================= */
(function () {
  'use strict';

  const T = THREE;
  const KIT = window.WatchKit;
  const DATA = window.WATCH || { PARTS: [] };

  let root = null;
  let parts = [];
  let byId = {};
  const spinners = [];

  function build(scene) {
    const ctx = Object.assign({}, KIT, {
      makeTexture: KIT.makeTexture,
      mats: KIT.MATS
    });

    const built = {};
    if (window.WatchExterior && window.WatchExterior.build) Object.assign(built, window.WatchExterior.build(ctx));
    if (window.WatchMovement && window.WatchMovement.build) Object.assign(built, window.WatchMovement.build(ctx));

    root = new T.Group();
    root.name = 'watch';
    scene.add(root);

    parts = [];
    byId = {};
    spinners.length = 0;

    DATA.PARTS.forEach((info, index) => {
      const group = built[info.id];
      if (!group) return;
      group.name = 'part_' + info.id;
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

      materials.forEach(m => {
        m.userData.baseEmissive = m.emissive ? m.emissive.getHex() : 0x000000;
        m.userData.baseEmissiveIntensity = m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1;
      });

      // 旋转动画：组内名为 spin 的子组单独转动，避免与拆解旋转冲突
      group.traverse(obj => {
        if (obj.userData && obj.userData.spinKind) {
          spinners.push({ object: obj, kind: obj.userData.spinKind });
        }
      });

      const part = {
        id: info.id,
        info: info,
        group: group,
        index: index,
        base: group.position.clone(),
        baseRot: group.rotation.clone(),
        explodeOffset: new T.Vector3(info.explode[0], info.explode[1], info.explode[2]),
        explodeRot: new T.Vector3(0, 0, 0),
        anchor: new T.Vector3(info.anchor[0], info.anchor[1], info.anchor[2]),
        materials: materials,
        meshes: meshes,
        centerLocal: new T.Vector3(),
        t: 0,
        target: 0,
        delay: 0,
        animStart: 0,
        glow: 0,
        highlighted: false
      };
      // 部件包围盒中心（局部坐标，用于标签、光晕与引线锚点）
      const box = new T.Box3().setFromObject(group);
      box.getCenter(part.centerLocal);
      group.worldToLocal(part.centerLocal);
      part.anchor.copy(part.centerLocal);

      group.userData.part = part;
      byId[info.id] = part;
      parts.push(part);
      root.add(group);
    });

    return { root: root, parts: parts, byId: byId, box: new T.Box3().setFromObject(root) };
  }

  // t: 页面时间（秒）。摆轮 4 Hz、秒针 8 次/秒、擒纵轮每 beat 12°、自动陀缓慢摆动。
  function update(t) {
    for (const spin of spinners) {
      const object = spin.object;
      switch (spin.kind) {
        case 'balance':
          // 振幅 ±135°（总摆幅 270°），4 Hz
          object.rotation.y = Math.sin(Math.PI * 2 * 4 * t) * (135 * Math.PI / 180);
          break;
        case 'second': {
          const steps = Math.floor(t * 8);
          object.rotation.y = -steps * (0.75 * Math.PI / 180);
          break;
        }
        case 'escape': {
          const steps = Math.floor(t * 8);
          object.rotation.y = -steps * (12 * Math.PI / 180);
          break;
        }
        case 'rotor':
          object.rotation.y = Math.sin((Math.PI * 2 * t) / 7) * 0.62;
          break;
        case 'trainFourth': {
          // 四番车 1 转/分钟（拆开后可见）
          object.rotation.y = -t * (Math.PI * 2 / 60);
          break;
        }
        case 'trainThird': {
          // 三番车 1 转/7.5 分钟
          object.rotation.y = -t * (Math.PI * 2 / 450);
          break;
        }
        default:
          break;
      }
    }
  }

  window.WatchModel = {
    build: build,
    update: update,
    get byId() { return byId; }
  };
})();
