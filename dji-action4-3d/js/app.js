/* =========================================================================
 * DJI Osmo Action 4 — 3D Teardown
 * js/app.js — 场景、交互、拆解动画、标注与 HUD 控制
 * ========================================================================= */
(function () {
  'use strict';

  const A = window.ACTION4;
  const PARTS = A.PARTS;
  const DEVICE = A.DEVICE;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DEBUG = new URLSearchParams(location.search).has('debug');

  /* 标注行的简短参数（避免把长句塞进标签） */
  const LABEL_SPEC = {
    body: '70.5 × 44.2 × 32.8 mm',
    glass: '可更换 · 疏水镀膜',
    lens: '155° FOV · f/2.8',
    sensor: '1/1.3" · 4K/120',
    frontScreen: '1.4" · 320 × 320',
    mainboard: 'SoC · Wi-Fi 5 · BLE 5.0',
    heatsink: '石墨烯 + 金属均热板',
    battery: '1770 mAh · 6.8 Wh',
    rearScreen: '2.25" · 360 × 640',
    mics: '3 麦克风 · 48 kHz',
    mount: '磁吸快拆 · 横竖拍',
    door: 'USB-C · microSD',
    buttons: '录制 / 电源 · IP68'
  };

  const els = {};
  const state = {
    exploded: false,
    selectedId: null,
    hoveredId: null,
    autoRotate: true,
    showLabels: true,
    started: false,
    dragging: false
  };

  let renderer, scene, camera, controls, composer, bloomPass, finalPass, clock;
  let paused = false;
  let root, parts, byId, haloGroup, selectionHelper, selectionPart = null;
  let raycaster, pointerNDC, bgGroup, dustGroup;
  let hoveredPart = null;
  let cameraTween = null;
  let labelItems = [];
  let labelWidth = 196;
  let layoutBounds = { left: 380, right: 1220, top: 96, bottom: 900 };
  let lastPointer = { x: 0, y: 0 };
  let pointerDown = null;
  let labelSvg, labelHost;
  const frameState = { last: 0, count: 0, fps: 60, t: 0 };
  let shellOpacity = 1;
  let lastMeterText = '';

  const DEFAULT_CAM = { pos: [7.6, 5.0, 10.2], target: [0, 0.12, 0] };

/* 按视口宽高比自适应相机距离：桌面保持原构图，窄屏自动后退 */
function responsiveDistance(base) {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  return base * Math.pow(Math.max(1, 1.6 / aspect), 0.65);
}

function defaultCameraPosition(scale) {
  const dir = new THREE.Vector3(DEFAULT_CAM.pos[0], DEFAULT_CAM.pos[1], DEFAULT_CAM.pos[2]).normalize();
  return dir.multiplyScalar(responsiveDistance(13.62) * (scale || 1));
}

  /* =====================================================================
   * 启动
   * =================================================================== */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();

    let ok = true;
    try {
      initScene();
    } catch (err) {
      console.error(err);
      showFatal(err);
      ok = false;
    }

    if (!ok) return;

    buildPartList();
    buildLabelDOM();
    bindUI();
    renderOverview();
    computeLayoutBounds();

    // 加载进度动画（场景为同步构建，这里只做视觉过渡）
    animateLoader();

    requestAnimationFrame(loop);
  }

  function cacheElements() {
    els.canvas = document.getElementById('webgl');
    els.partList = document.getElementById('part-list');
    els.specContent = document.getElementById('spec-content');
    els.panelLeft = document.getElementById('panel-left');
    els.panelRight = document.getElementById('panel-right');
    els.fps = document.getElementById('fps-value');
    els.tooltip = document.getElementById('tooltip');
    els.tooltipName = els.tooltip.querySelector('.tooltip__name');
    els.tooltipHint = els.tooltip.querySelector('.tooltip__hint');
    els.modeText = document.getElementById('mode-text');
    els.percent = document.getElementById('explode-percent');
    els.meterFill = document.getElementById('meter-fill');
    els.btnExplode = document.getElementById('btn-explode');
    els.explodeBtnText = document.getElementById('explode-btn-text');
    els.btnReset = document.getElementById('btn-reset');
    els.btnFullscreen = document.getElementById('btn-fullscreen');
    els.toggleRotate = document.getElementById('toggle-rotate');
    els.toggleLabels = document.getElementById('toggle-labels');
    els.onboarding = document.getElementById('onboarding');
    els.btnEnter = document.getElementById('btn-enter');
    els.loader = document.getElementById('loader');
    els.loaderFill = document.getElementById('loader-fill');
    els.loaderPercent = document.getElementById('loader-percent');
    els.specScroll = document.querySelector('.spec-scroll');
    els.labels = document.getElementById('labels');
    els.leaderSvg = document.getElementById('leader-svg');
    els.btnOpenLeft = document.getElementById('btn-open-left');
    els.btnOpenRight = document.getElementById('btn-open-right');
    els.btnAssemble = document.getElementById('btn-assemble');
    els.btnResetView = document.getElementById('btn-reset-view');
    els.btnCloseRight = document.getElementById('btn-close-right');
    els.btnCloseLeft = document.getElementById('btn-close-left');
    els.body = document.body;
    labelSvg = els.leaderSvg;
    labelHost = els.labels;
  }

  /* =====================================================================
   * Three.js 场景
   * =================================================================== */
  function initScene() {
    clock = new THREE.Clock();

    renderer = new THREE.WebGLRenderer({
      canvas: els.canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x04070a, 1);
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('useLegacyLights' in renderer) renderer.useLegacyLights = true;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04070a, 0.0085);

    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 160);
    const introPos = defaultCameraPosition(1.55);
    camera.position.copy(introPos);

    controls = new THREE.OrbitControls(camera, els.canvas);
    controls.target.set(DEFAULT_CAM.target[0], DEFAULT_CAM.target[1], DEFAULT_CAM.target[2]);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.85;
    controls.panSpeed = 0.7;
    controls.minDistance = 4.0;
    controls.maxDistance = 90;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.79;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.65;
    controls.enabled = false; // 引导相机动画结束后启用
    controls.update();

    buildEnvironment();
    addLights();
    addBackdrop();
    addParticles();

    // 程序化模型
    const model = Action4Model.build(scene);
    root = model.root;
    parts = model.parts;
    byId = model.byId;

    preparePartVisuals();
    tuneMaterialEnvironment();
    setupPostProcessing();
    setupPicking();

    window.addEventListener('resize', onResize);
    onResize();

    // 调试接口（?debug=1 时暴露，便于自动化验证，不影响正常使用）
    if (DEBUG) window.__A4 = {
      scene: scene, camera: camera, controls: controls, renderer: renderer,
      composer: composer, bloomPass: bloomPass, parts: parts, byId: byId,
      root: root, bgGroup: bgGroup, dustGroup: dustGroup, state: state,
      THREE: THREE,
      step: function (dt) { step(dt || 1 / 60, performance.now() / 1000); },
      setPaused: function (v) { paused = !!v; },
      setExposure: function (v) { finalPass.uniforms.exposure.value = v; },
      setBloom: function (v) { bloomPass.enabled = !!v; },
      setLightScale: function (k) {
        scene.traverse(function (o) {
          if (o.isLight) {
            if (o.userData.baseIntensity === undefined) o.userData.baseIntensity = o.intensity;
            o.intensity = o.userData.baseIntensity * k;
          }
        });
      },
      setEnvScale: function (k) {
        parts.forEach(function (part) {
          part.materials.forEach(function (m) {
            if (m && m.envMapIntensity !== undefined) {
              if (m.userData.baseEnv === undefined) m.userData.baseEnv = m.envMapIntensity;
              m.envMapIntensity = m.userData.baseEnv * k;
            }
          });
        });
      },
      setBloomStrength: function (v) { bloomPass.strength = v; },
      renderNow: function () { composer.render(); },
      directRender: function () { renderer.render(scene, camera); },
      skipIntro: function () {
        cameraTween = null;
        controls.enabled = true;
        camera.position.copy(defaultCameraPosition());
        controls.target.set(DEFAULT_CAM.target[0], DEFAULT_CAM.target[1], DEFAULT_CAM.target[2]);
        controls.update();
      }
    };

    // 开场相机动画
    cameraTween = {
      fromPos: camera.position.clone(),
      toPos: defaultCameraPosition(),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(DEFAULT_CAM.target[0], DEFAULT_CAM.target[1], DEFAULT_CAM.target[2]),
      t: 0,
      duration: 2.1
    };
  }

  function buildEnvironment() {
    // 程序化 equirect 环境贴图：暗色空间 + 冷色环形灯带
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 0, 512);
    bg.addColorStop(0, '#020406');
    bg.addColorStop(0.42, '#071018');
    bg.addColorStop(0.55, '#0a1a22');
    bg.addColorStop(0.7, '#050b10');
    bg.addColorStop(1, '#020305');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 512);

    // 顶部冷光带
    const topGlow = ctx.createLinearGradient(0, 40, 0, 210);
    topGlow.addColorStop(0, 'rgba(120, 210, 255, 0)');
    topGlow.addColorStop(0.55, 'rgba(150, 230, 255, 0.85)');
    topGlow.addColorStop(1, 'rgba(80, 150, 220, 0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 40, 1024, 170);

    // 侧向暖色光斑
    const warm = ctx.createRadialGradient(830, 300, 10, 830, 300, 190);
    warm.addColorStop(0, 'rgba(255, 160, 100, 0.8)');
    warm.addColorStop(1, 'rgba(255, 120, 60, 0)');
    ctx.fillStyle = warm;
    ctx.fillRect(600, 110, 460, 380);

    // 冷色光斑
    const cool = ctx.createRadialGradient(210, 320, 10, 210, 320, 210);
    cool.addColorStop(0, 'rgba(80, 200, 255, 0.6)');
    cool.addColorStop(1, 'rgba(40, 120, 200, 0)');
    ctx.fillStyle = cool;
    ctx.fillRect(0, 110, 440, 420);

    // 细光条
    ctx.fillStyle = 'rgba(200, 250, 255, 0.9)';
    ctx.fillRect(0, 222, 1024, 2);
    ctx.fillStyle = 'rgba(120, 200, 255, 0.25)';
    ctx.fillRect(0, 240, 1024, 1);

    const envTexture = new THREE.CanvasTexture(canvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    envTexture.encoding = THREE.sRGBEncoding;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envRT = pmrem.fromEquirectangular(envTexture);
    scene.environment = envRT.texture;
    envTexture.dispose();
    pmrem.dispose();
  }

  function addLights() {
    scene.add(new THREE.HemisphereLight(0x6fc0e8, 0x04070a, 0.22));

    const key = new THREE.DirectionalLight(0xfff6ec, 1.45);
    key.position.set(6, 9.5, 7);
    key.castShadow = true;
    const shadowSize = window.innerWidth < 720 ? 1024 : 2048;
    key.shadow.mapSize.set(shadowSize, shadowSize);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x5fc8ff, 0.3);
    fill.position.set(-8, 3.5, 6);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x5270d8, 0.55);
    rim.position.set(-4, 5, -8);
    scene.add(rim);

    const warm = new THREE.PointLight(0xff8c4d, 0.55, 26, 2);
    warm.position.set(5, -1.5, -5);
    scene.add(warm);

    const spot = new THREE.SpotLight(0xbceaff, 0.6, 34, 0.62, 0.75, 1.4);
    spot.position.set(-2, 11, 3.5);
    spot.target.position.set(0, 0, 0);
    scene.add(spot);
    scene.add(spot.target);
  }

  function addBackdrop() {
    bgGroup = new THREE.Group();
    scene.add(bgGroup);

    const floorY = -4.45;

    // 环形发光刻度
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2ba7bd, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(5.9, 0.012, 6, 180), ringMat);
    ring1.name = 'ring1';
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = floorY;
    bgGroup.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.007, 6, 160), ringMat.clone());
    ring2.material.opacity = 0.24;
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = floorY;
    bgGroup.add(ring2);

    const ring3 = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.005, 6, 140), ringMat.clone());
    ring3.material.opacity = 0.16;
    ring3.rotation.x = -Math.PI / 2;
    ring3.position.y = floorY;
    bgGroup.add(ring3);

    // 刻度线
    const tickGeom = new THREE.PlaneGeometry(0.018, 0.24);
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0x54d7e8, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    for (let i = 0; i < 72; i++) {
      const tick = new THREE.Mesh(tickGeom, tickMat);
      const a = (i / 72) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 5.9, floorY, Math.sin(a) * 5.9);
      tick.rotation.x = -Math.PI / 2;
      tick.rotation.z = -a;
      tick.scale.y = i % 6 === 0 ? 1.9 : 1;
      bgGroup.add(tick);
    }

    // 地面光晕
    const glowTex = makeRadialTexture(
      'rgba(39, 145, 170, 0.55)',
      'rgba(24, 92, 120, 0.18)',
      'rgba(0, 0, 0, 0)'
    );
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.32
    });
    const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), glowMat);
    floorGlow.name = 'floorGlow';
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = floorY - 0.005;
    bgGroup.add(floorGlow);

    // 接触阴影
    const shadowTex = makeRadialTexture(
      'rgba(0, 0, 0, 0.72)',
      'rgba(0, 0, 0, 0.28)',
      'rgba(0, 0, 0, 0)'
    );
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 9.5), new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, depthWrite: false, opacity: 0.7
    }));
    shadow.name = 'contactShadow';
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = floorY + 0.002;
    bgGroup.add(shadow);

    // 垂直光柱（远处）
    const beamTex = makeVerticalBeamTexture();
    const beamMat = new THREE.MeshBasicMaterial({
      map: beamTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.14, side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(6, 13), beamMat);
    beam.position.set(-7.5, 0.5, -9);
    beam.rotation.y = 0.3;
    bgGroup.add(beam);

    const beam2 = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 11), beamMat.clone());
    beam2.material.opacity = 0.08;
    beam2.position.set(7.5, 0.2, -8);
    beam2.rotation.y = -0.4;
    bgGroup.add(beam2);
  }

  function addParticles() {
    // 星域
    const count = 1300;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = 15 + Math.random() * 34;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.65;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const pick = Math.random();
      if (pick < 0.55) color.setHex(0x7fdcff);
      else if (pick < 0.82) color.setHex(0x4a7ec8);
      else color.setHex(0xffffff);
      const dim = 0.35 + Math.random() * 0.65;
      colors[i * 3] = color.r * dim;
      colors[i * 3 + 1] = color.g * dim;
      colors[i * 3 + 2] = color.b * dim;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.055, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.82, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const stars = new THREE.Points(geom, mat);
    scene.add(stars);
    bgGroup.userData.stars = stars;

    // 模型周围尘埃
    const dustCount = 340;
    const dPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 3.2 + Math.random() * 6.5;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 6.2;
      dPos[i * 3] = r * Math.cos(theta);
      dPos[i * 3 + 1] = y;
      dPos[i * 3 + 2] = r * Math.sin(theta);
    }
    const dGeom = new THREE.BufferGeometry();
    dGeom.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    const dMat = new THREE.PointsMaterial({
      color: 0x67d8ee, size: 0.035, sizeAttenuation: true,
      transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    dustGroup = new THREE.Points(dGeom, dMat);
    scene.add(dustGroup);
  }

  function preparePartVisuals() {
    const glowTex = makeRadialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0)');
    haloGroup = new THREE.Group();
    haloGroup.name = 'halos';
    scene.add(haloGroup);

    parts.forEach(part => {
      // 部件中心（用于光晕 / 选择框）
      const box = new THREE.Box3().setFromObject(part.group);
      const centerWorld = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      part.centerLocal = part.group.worldToLocal(centerWorld.clone());

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(part.info.color),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      const s = Math.max(1.15, Math.min(3.4, Math.max(size.x, size.y, size.z) * 1.45));
      halo.scale.set(s, s, 1);
      haloGroup.add(halo);
      part.halo = halo;
      part.glow = 0;
    });

    // 高亮材质缓存
    parts.forEach(part => {
      part.materials.forEach(mat => {
        if (mat && mat.emissive && mat.emissiveMap) mat.userData.skipHighlight = true;
      });
    });

    refreshHighlights();
  }

  function tuneMaterialEnvironment() {
    parts.forEach(part => {
      part.materials.forEach(mat => {
        if (!mat || mat.envMapIntensity === undefined) return;
        const shiny = mat.roughness !== undefined && mat.roughness < 0.35;
        mat.envMapIntensity = shiny
          ? Math.min(2.0, Math.max(mat.envMapIntensity, 0.65))
          : Math.min(mat.envMapIntensity, 0.28);
      });
    });
  }

  function setupPostProcessing() {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));

    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.4, 0.45, 0.87
    );
    composer.addPass(bloomPass);

    // 自定义输出：ACES filmic tone mapping + sRGB OETF
    const finalShader = {
      uniforms: {
        tDiffuse: { value: null },
        exposure: { value: 0.92 }
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D tDiffuse;',
        'uniform float exposure;',
        'varying vec2 vUv;',
        'vec3 acesFilm(vec3 x) {',
        '  x *= exposure;',
        '  float a = 2.51; float b = 0.03; float c = 2.43; float d = 0.59; float e = 0.14;',
        '  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);',
        '}',
        'vec3 linearToSRGB(vec3 c) {',
        '  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, 12.92 * c, step(c, vec3(0.0031308)));',
        '}',
        'void main() {',
        '  vec4 texel = texture2D(tDiffuse, vUv);',
        '  vec3 col = acesFilm(texel.rgb);',
        '  gl_FragColor = vec4(linearToSRGB(col), texel.a);',
        '}'
      ].join('\n')
    };
    finalPass = new THREE.ShaderPass(finalShader);
    composer.addPass(finalPass);
  }

  function setupPicking() {
    raycaster = new THREE.Raycaster();
    pointerNDC = new THREE.Vector2();

    els.canvas.addEventListener('pointermove', onPointerMove);
    els.canvas.addEventListener('pointerdown', onPointerDown);
    els.canvas.addEventListener('pointerup', onPointerUp);
    els.canvas.addEventListener('pointerleave', onPointerLeave);
    els.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  /* =====================================================================
   * 纹理小工具
   * =================================================================== */
  function makeRadialTexture(inner, mid, outer) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, inner);
    g.addColorStop(0.42, mid);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeVerticalBeamTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 512, 0, 0);
    g.addColorStop(0, 'rgba(90, 220, 255, 0)');
    g.addColorStop(0.45, 'rgba(90, 220, 255, 0.34)');
    g.addColorStop(1, 'rgba(160, 240, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 512);
    const side = ctx.createLinearGradient(0, 0, 128, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.28, 'rgba(0,0,0,0)');
    side.addColorStop(0.72, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, 128, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* =====================================================================
   * 部件交互
   * =================================================================== */
  function pickPart(ev) {
    const rect = els.canvas.getBoundingClientRect();
    pointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);

    const hits = raycaster.intersectObjects(root.children, true);
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (!hit.object.isMesh) continue;
      let obj = hit.object;
      while (obj && !obj.userData.partId) obj = obj.parent;
      if (obj && byId[obj.userData.partId]) return byId[obj.userData.partId];
    }
    return null;
  }

  function onPointerMove(ev) {
    lastPointer.x = ev.clientX;
    lastPointer.y = ev.clientY;

    if (pointerDown) {
      const dist = Math.hypot(ev.clientX - pointerDown.x, ev.clientY - pointerDown.y);
      if (dist > 6) {
        if (!state.dragging) {
          state.dragging = true;
          els.canvas.classList.add('is-dragging');
          hideTooltip();
          if (state.autoRotate) setAutoRotate(false);
        }
      }
      if (state.dragging) return;
    }

    const part = pickPart(ev);
    if (part !== hoveredPart) {
      hoveredPart = part;
      state.hoveredId = part ? part.id : null;
      refreshHighlights();
      if (part) showTooltip(part); else hideTooltip();
      els.canvas.classList.toggle('is-hovering', !!part);
    } else if (part) {
      positionTooltip(ev.clientX, ev.clientY);
    }
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    pointerDown = { x: ev.clientX, y: ev.clientY };
    state.dragging = false;
    hideTooltip();
  }

  function onPointerUp(ev) {
    if (!pointerDown) return;
    const moved = Math.hypot(ev.clientX - pointerDown.x, ev.clientY - pointerDown.y);
    pointerDown = null;
    els.canvas.classList.remove('is-dragging');

    if (moved <= 6) {
      const part = pickPart(ev);
      if (part) selectPart(part.id);
      else deselect();
    }
    // 恢复 hover 检测（若指针仍在模型上）
    const part = pickPart(ev);
    if (part !== hoveredPart) {
      hoveredPart = part;
      state.hoveredId = part ? part.id : null;
      refreshHighlights();
      if (part) showTooltip(part); else hideTooltip();
    }
  }

  function onPointerLeave() {
    pointerDown = null;
    hoveredPart = null;
    state.hoveredId = null;
    hideTooltip();
    els.canvas.classList.remove('is-hovering', 'is-dragging');
    refreshHighlights();
  }

  function selectPart(id, fromList) {
    const part = byId[id];
    if (!part) return;

    if (state.selectedId === id) {
      deselect();
      return;
    }

    state.selectedId = id;

    if (!state.exploded) {
      parts.forEach(p => {
        const target = p.id === id ? 1 : 0;
        if (p.target !== target) {
          p.target = target;
          p.animStart = performance.now() / 1000 + (p.id === id ? 0.02 : 0);
        }
      });
    }

    refreshHighlights();
    scrollListTo(id);
    updateActiveRow();
    renderPart(part);
    setAutoRotate(false);

    if (state.exploded && window.innerWidth > 980) {
      els.panelRight.classList.add('is-open');
      els.panelLeft.classList.remove('is-open');
      computeLayoutBounds();
      setTimeout(computeLayoutBounds, 620);
    }

    // 移动端：收起左侧清单，直接打开右侧详情
    if (window.innerWidth <= 980) {
      els.panelLeft.classList.remove('is-open');
      els.panelRight.classList.add('is-open');
      computeLayoutBounds();
      setTimeout(computeLayoutBounds, 620);
    }

    if (!fromList) {
      // 从 3D 视图选中时也保持左侧列表可见
      const item = els.partList.querySelector('[data-id="' + id + '"]');
      if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function deselect() {
    if (!state.selectedId) return;
    state.selectedId = null;

    if (!state.exploded) {
      parts.forEach(p => {
        if (p.target !== 0) {
          p.target = 0;
          p.animStart = performance.now() / 1000;
        }
      });
    }

    refreshHighlights();
    updateActiveRow();
    renderOverview();
    removeSelectionHelper();

    if (state.exploded && window.innerWidth > 980) {
      els.panelRight.classList.remove('is-open');
      computeLayoutBounds();
      setTimeout(computeLayoutBounds, 500);
    }
  }

  function refreshHighlights() {
    parts.forEach(part => {
      const isSelected = part.id === state.selectedId;
      const isHovered = part.id === state.hoveredId;
      const mode = isSelected ? 2 : (isHovered ? 1 : 0);
      if (part.highlightMode === mode) return;
      part.highlightMode = mode;
      part.highlighted = mode > 0;

      part.materials.forEach(mat => {
        if (!mat || !mat.emissive || mat.userData.skipHighlight) return;
        const baseEmissive = mat.userData.baseEmissive || 0;
        const baseIntensity = mat.userData.baseEmissiveIntensity !== undefined
          ? mat.userData.baseEmissiveIntensity : 1;

        // 恢复为材质原本的自发光
        if (mode === 0) {
          mat.emissive.setHex(baseEmissive);
          mat.emissiveIntensity = baseIntensity;
          return;
        }

        // 机身骨架面积太大，整面自发光会直接过曝：只用选择框 + 光晕标记
        if (part.id === 'body') {
          mat.emissive.setHex(baseEmissive);
          mat.emissiveIntensity = baseIntensity;
          return;
        }

        // 已带自发光/发光贴图的材质（屏幕、镜片等）保持原样，交给描边和光晕
        if (baseEmissive !== 0) {
          mat.emissiveIntensity = baseIntensity;
          return;
        }

        // 深色结构件：极低强度冷色自发光，只提亮边缘，不改变明暗关系
        const accent = new THREE.Color(part.info.color).multiplyScalar(0.55);
        mat.emissive.copy(accent);
        mat.emissiveIntensity = mode === 2 ? 0.16 : 0.09;
      });
    });

    // 选择框（统一使用 HUD 青色，避免浅色部件边框发白）
    const selected = byId[state.selectedId];
    if (selected) {
      if (!selectionHelper || selectionPart !== selected.id) {
        removeSelectionHelper();
        selectionHelper = new THREE.BoxHelper(selected.group, 0x58e6ff);
        selectionHelper.material.transparent = true;
        selectionHelper.material.opacity = 0.62;
        selectionHelper.material.depthTest = false;
        selectionHelper.material.blending = THREE.AdditiveBlending;
        selectionHelper.renderOrder = 999;
        scene.add(selectionHelper);
        selectionPart = selected.id;
      }
    } else {
      removeSelectionHelper();
    }
  }

  function removeSelectionHelper() {
    if (!selectionHelper) return;
    scene.remove(selectionHelper);
    selectionHelper.geometry.dispose();
    selectionHelper.material.dispose();
    selectionHelper = null;
    selectionPart = null;
  }

  /* =====================================================================
   * 拆解
   * =================================================================== */
  function setExploded(on) {
    if (state.exploded === on) return;
    state.exploded = on;
    state.selectedId = null;
    state.hoveredId = null;
    hoveredPart = null;
    hideTooltip();
    removeSelectionHelper();
    els.body.classList.toggle('is-teardown', on);
    els.panelLeft.classList.remove('is-open');
    els.panelRight.classList.remove('is-open');
    computeLayoutBounds();

    const now = performance.now() / 1000;
    const n = parts.length;
    parts.forEach(p => {
      const target = on ? 1 : 0;
      if (p.target !== target) {
        p.target = target;
        const delay = on ? p.index * 0.035 : (n - p.index) * 0.028;
        p.animStart = now + delay;
      }
    });

    refreshHighlights();
    updateActiveRow();
    renderOverview();
    setAutoRotate(false);
    hideTooltip();
    frameExploded(on);
    els.btnExplode.setAttribute('aria-pressed', String(on));
    els.explodeBtnText.textContent = on ? '一键组装' : '拆解整机';
    if (on) showToast('拆解模式 · 两侧面板已收起，点击部件查看参数');
  }

  function toggleExplode() {
    setExploded(!state.exploded);
  }

  /* =====================================================================
   * 相机
   * =================================================================== */
  function resetView() {
    const toTarget = new THREE.Vector3(0, state.exploded ? -0.35 : 0.12, 0);
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = responsiveDistance(state.exploded ? 15.8 : 13.62);
    cameraTween = {
      fromPos: camera.position.clone(),
      toPos: toTarget.clone().add(dir.multiplyScalar(dist)),
      fromTarget: controls.target.clone(),
      toTarget: toTarget,
      t: 0,
      duration: 1.1
    };
    controls.enabled = false;
  }

  function frameExploded(on) {
    const toTarget = new THREE.Vector3(0, on ? -0.35 : 0.12, 0);
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = responsiveDistance(on ? 15.8 : 13.62);
    cameraTween = {
      fromPos: camera.position.clone(),
      toPos: toTarget.clone().add(dir.multiplyScalar(dist)),
      fromTarget: controls.target.clone(),
      toTarget: toTarget,
      t: 0,
      duration: 1.2
    };
    controls.enabled = false;
  }

  function updateCameraTween(dt) {
    if (!cameraTween) return;
    cameraTween.t += dt;
    const raw = Math.min(1, cameraTween.t / cameraTween.duration);
    const k = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, k);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, k);
    if (raw >= 1) {
      cameraTween = null;
      controls.enabled = true;
      if (state.started && state.autoRotate) controls.autoRotate = true;
      controls.update();
    }
  }

  function setAutoRotate(on) {
    state.autoRotate = on;
    controls.autoRotate = on && state.started;
    els.toggleRotate.checked = on;
  }

  /* =====================================================================
   * 标注系统
   * =================================================================== */
  function buildLabelDOM() {
    labelItems = parts.map(part => {
      const info = part.info;
      const el = document.createElement('div');
      el.className = 'part-label';
      el.dataset.id = part.id;
      el.style.setProperty('--c', info.color);
      el.innerHTML =
        '<div class="part-label__top">' +
          '<span class="part-label__no">' + info.no + '</span>' +
          '<span class="part-label__cat">' + info.category + '</span>' +
        '</div>' +
        '<span class="part-label__name">' + info.name + '</span>' +
        '<span class="part-label__spec">' + (LABEL_SPEC[part.id] || '') + '</span>';
      labelHost.appendChild(el);

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('stroke', info.color);
      path.style.stroke = info.color;
      path.style.display = 'none';
      labelSvg.appendChild(path);

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', '2.4');
      dot.setAttribute('fill', info.color);
      dot.style.display = 'none';
      labelSvg.appendChild(dot);

      const item = { part: part, el: el, path: path, dot: dot, h: 48 };
      requestAnimationFrame(() => {
        item.h = el.offsetHeight || 48;
      });
      return item;
    });
  }

  function computeLayoutBounds() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const mobile = w <= 980;
    const topbarH = mobile ? 64 : 76;
    const bottomH = mobile ? 68 : 78;

    labelWidth = w <= 620 ? 142 : (mobile ? 164 : 196);

    let left = 16;
    let right = w - 16;

    if (!mobile) {
      const teardown = els.body.classList.contains('is-teardown');
      if (teardown) {
        left = 24;
        right = w - 24;
        if (els.panelLeft.classList.contains('is-open')) {
          left = els.panelLeft.getBoundingClientRect().right + 16;
        }
        if (els.panelRight.classList.contains('is-open')) {
          right = els.panelRight.getBoundingClientRect().left - 16;
        }
      } else {
        const lr = els.panelLeft.getBoundingClientRect();
        const rr = els.panelRight.getBoundingClientRect();
        left = lr.right + 20;
        right = rr.left - 20;
      }
    } else {
      if (els.panelLeft.classList.contains('is-open')) {
        left = Math.min(w - 24, els.panelLeft.getBoundingClientRect().right + 10);
      }
      if (els.panelRight.classList.contains('is-open')) {
        right = Math.max(24, els.panelRight.getBoundingClientRect().left - 10);
      }
    }

    layoutBounds = {
      left: left,
      right: right,
      top: topbarH + 22,
      bottom: h - bottomH - 16,
      width: w,
      height: h
    };

    if (labelSvg) {
      labelSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      labelSvg.setAttribute('width', w);
      labelSvg.setAttribute('height', h);
    }

    labelItems.forEach(item => {
      item.h = item.el.offsetHeight || 48;
    });
  }

  function updateLabels() {
    if (!labelItems.length) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const mobileTiny = w < 760;
    const selectedPart = state.selectedId ? byId[state.selectedId] : null;
    const showAll = state.showLabels && state.exploded;
    const showSelected = state.showLabels && selectedPart;
    const visibleIds = new Set();

    if (showAll && !mobileTiny) {
      parts.forEach(p => visibleIds.add(p.id));
    } else if (showSelected) {
      visibleIds.add(selectedPart.id);
    }

    const groups = { left: [], right: [] };
    const anchorVec = new THREE.Vector3();
    const projected = new THREE.Vector3();

    labelItems.forEach(item => {
      const part = item.part;
      const visible = visibleIds.has(part.id);
      item.el.classList.toggle('is-visible', visible);
      item.el.classList.toggle('is-active', part.id === state.selectedId);

      if (!visible) {
        item.path.style.display = 'none';
        item.dot.style.display = 'none';
        item.anchorX = null;
        return;
      }

      // 世界坐标 → 屏幕坐标
      anchorVec.copy(part.anchor);
      part.group.localToWorld(anchorVec);
      projected.copy(anchorVec).project(camera);
      const behind = projected.z > 1 || projected.z < -1;
      const sx = (projected.x * 0.5 + 0.5) * w;
      const sy = (-projected.y * 0.5 + 0.5) * h;
      if (behind || sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) {
        item.el.classList.remove('is-visible');
        item.path.style.display = 'none';
        item.dot.style.display = 'none';
        return;
      }

      item.anchorX = sx;
      item.anchorY = sy;
      const side = part.info.labelSide || 'left';
      groups[side].push(item);
    });

    // 单侧标签自动避让（保持贴合当前锚点、但不重叠）
    const top = layoutBounds.top;
    const bottom = layoutBounds.bottom;
    const gap = 7;

    ['left', 'right'].forEach(side => {
      const items = groups[side];
      if (!items.length) return;

      const available = Math.max(80, bottom - top);
      let g = gap;
      const totalH = items.reduce((s, it) => s + it.h, 0);
      if (items.length > 1 && totalH + gap * (items.length - 1) > available) {
        g = Math.max(2, (available - totalH) / (items.length - 1));
      }

      items.sort((a, b) => a.anchorY - b.anchorY);
      let cursor = top;
      items.forEach(item => {
        const targetY = Math.max(top, Math.min(bottom - item.h, item.anchorY - item.h / 2));
        item.y = Math.max(targetY, cursor);
        cursor = item.y + item.h + g;
      });

      const overflow = cursor - g - bottom;
      if (overflow > 0) items.forEach(item => { item.y -= overflow; });
      if (items.length && items[0].y < top) {
        const push = top - items[0].y;
        items.forEach(item => { item.y += push; });
      }

      const colX = side === 'left' ? layoutBounds.left : layoutBounds.right - labelWidth;

      items.forEach(item => {
        item.x = colX;
        item.el.style.transform = 'translate3d(' + Math.round(colX) + 'px,' + Math.round(item.y) + 'px,0)';
        item.el.style.width = labelWidth + 'px';

        // 连接线
        const x1 = side === 'left' ? colX + labelWidth : colX;
        const y1 = item.y + item.h / 2;
        const mx = side === 'left' ? x1 + 30 : x1 - 30;
        const ax = item.anchorX;
        const ay = item.anchorY;
        const d = 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
          ' L ' + mx.toFixed(1) + ' ' + y1.toFixed(1) +
          ' L ' + ax.toFixed(1) + ' ' + ay.toFixed(1);
        item.path.setAttribute('d', d);
        item.path.style.display = '';
        item.dot.setAttribute('cx', ax.toFixed(1));
        item.dot.setAttribute('cy', ay.toFixed(1));
        item.dot.style.display = '';
      });
    });
  }

  /* =====================================================================
   * HUD：部件清单 / 参数
   * =================================================================== */
  function buildPartList() {
    const frag = document.createDocumentFragment();
    PARTS.forEach(part => {
      const btn = document.createElement('button');
      btn.className = 'part-item';
      btn.dataset.id = part.id;
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.style.setProperty('--c', part.color);
      btn.innerHTML =
        '<span class="part-item__no">' + part.no + '</span>' +
        '<span class="part-item__swatch"></span>' +
        '<span class="part-item__name">' +
          '<strong>' + part.name + '</strong>' +
          '<small>' + part.en + '</small>' +
        '</span>' +
        '<span class="part-item__arrow" aria-hidden="true">↗</span>';
      btn.addEventListener('click', () => selectPart(part.id, true));
      btn.addEventListener('mouseenter', () => {
        state.hoveredId = part.id;
        hoveredPart = byId ? byId[part.id] : null;
        refreshHighlights();
      });
      btn.addEventListener('mouseleave', () => {
        if (state.selectedId !== part.id) {
          state.hoveredId = null;
          hoveredPart = null;
          refreshHighlights();
        }
      });
      frag.appendChild(btn);
    });
    els.partList.appendChild(frag);
  }

  function updateActiveRow() {
    const rows = els.partList.querySelectorAll('.part-item');
    rows.forEach(row => {
      const on = row.dataset.id === state.selectedId;
      row.classList.toggle('is-active', on);
      row.setAttribute('aria-pressed', String(on));
    });
  }

  function scrollListTo(id) {
    const row = els.partList.querySelector('[data-id="' + id + '"]');
    if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderOverview() {
    const chips = DEVICE.chips.map(c =>
      '<div class="spec-chip"><strong>' + c.label + '</strong><span>' + c.value + '</span></div>'
    ).join('');
    const rows = DEVICE.overview.map(row =>
      '<div class="spec-row"><dt>' + row[0] + '</dt><dd>' + row[1] + '</dd></div>'
    ).join('');
    const highlights = DEVICE.highlights.map(h => '<li>' + h + '</li>').join('');

    els.specContent.innerHTML =
      '<div class="device-head">' +
        '<span class="device-head__kicker">DJI / ACTION CAMERA</span>' +
        '<h3>' + DEVICE.name + '<span>' + DEVICE.cnName + ' · ' + DEVICE.generated + '</span></h3>' +
        '<span class="device-head__badge">13 PARTS</span>' +
      '</div>' +
      '<div class="chip-grid">' + chips + '</div>' +
      '<div class="spec-section-title">CORE SPECS / 核心规格</div>' +
      '<dl class="spec-table">' + rows + '</dl>' +
      '<div class="spec-section-title">HIGHLIGHTS / 产品特性</div>' +
      '<ul class="highlight-list">' + highlights + '</ul>' +
      '<div class="spec-footnote">SPEC SOURCE // DJI OSMO ACTION 4<br />' +
        '3D MODEL // PROCEDURAL THREE.JS GEOMETRY<br />' +
        '本页面为交互式可视化演示，模型为艺术化还原。</div>';

    els.specScroll.scrollTop = 0;
    removeSelectionHelper();
  }

  function renderPart(part) {
    const info = part.info;
    const specs = info.specs.map(row =>
      '<div class="spec-row"><dt>' + row[0] + '</dt><dd>' + row[1] + '</dd></div>'
    ).join('');
    const details = info.details.map(d => '<li>' + d + '</li>').join('');

    els.specContent.innerHTML =
      '<button class="part-detail__back" id="btn-back-overview" type="button">← 返回整机参数</button>' +
      '<div class="part-detail" style="--c:' + info.color + '">' +
        '<div class="part-detail__head">' +
          '<span class="part-detail__cat">' + info.category + '</span>' +
          '<span class="part-detail__index">' + info.no + '</span>' +
        '</div>' +
        '<h3>' + info.name + '</h3>' +
        '<div class="part-detail__en">' + info.en + '</div>' +
        '<p class="part-detail__summary">' + info.summary + '</p>' +
        '<p class="part-detail__desc">' + info.desc + '</p>' +
        '<div class="spec-section-title">TECHNICAL DATA / 技术参数</div>' +
        '<dl class="spec-table">' + specs + '</dl>' +
        '<div class="spec-section-title">DESIGN NOTES / 设计说明</div>' +
        '<ul class="highlight-list">' + details + '</ul>' +
        '<div class="part-detail__footer">' +
          '<span>MODULE ' + info.no + ' / 13</span>' +
          '<span>' + info.category + '</span>' +
        '</div>' +
      '</div>';

    const back = document.getElementById('btn-back-overview');
    if (back) back.addEventListener('click', deselect);
    els.specScroll.scrollTop = 0;
  }

  /* =====================================================================
   * 工具提示
   * =================================================================== */
  function showTooltip(part) {
    els.tooltipName.textContent = part.info.no + ' · ' + part.info.name;
    els.tooltipHint.textContent = state.exploded ? '点击查看参数' : '点击拆解 · 查看参数';
    els.tooltip.classList.add('is-visible');
    positionTooltip(lastPointer.x, lastPointer.y);
  }

  function positionTooltip(x, y) {
    const pad = 16;
    const tw = els.tooltip.offsetWidth || 160;
    const th = els.tooltip.offsetHeight || 48;
    let px = x + pad;
    let py = y + pad;
    if (px + tw > window.innerWidth - 10) px = x - tw - pad;
    if (py + th > window.innerHeight - 10) py = y - th - pad;
    els.tooltip.style.transform = 'translate3d(' + Math.max(8, px) + 'px,' + Math.max(8, py) + 'px,0)';
  }

  function hideTooltip() {
    els.tooltip.classList.remove('is-visible');
  }

  /* =====================================================================
   * 事件绑定
   * =================================================================== */
  function bindUI() {
    els.btnExplode.addEventListener('click', toggleExplode);
    els.btnReset.addEventListener('click', resetView);
    els.btnFullscreen.addEventListener('click', toggleFullscreen);

    els.toggleRotate.addEventListener('change', () => setAutoRotate(els.toggleRotate.checked));
    els.toggleLabels.addEventListener('change', () => {
      state.showLabels = els.toggleLabels.checked;
      if (!state.showLabels) {
        labelItems.forEach(item => {
          item.el.classList.remove('is-visible');
          item.path.style.display = 'none';
          item.dot.style.display = 'none';
        });
      }
    });

    els.btnAssemble.addEventListener('click', () => setExploded(false));
    els.btnResetView.addEventListener('click', resetView);
    els.btnEnter.addEventListener('click', enterExperience);
    els.onboarding.addEventListener('click', e => {
      if (e.target === els.onboarding) enterExperience();
    });

    els.btnOpenLeft.addEventListener('click', () => {
      const open = !els.panelLeft.classList.contains('is-open');
      closeDrawers();
      els.panelLeft.classList.toggle('is-open', open);
      computeLayoutBounds();
      setTimeout(computeLayoutBounds, 620);
    });
    els.btnOpenRight.addEventListener('click', () => {
      const open = !els.panelRight.classList.contains('is-open');
      closeDrawers();
      els.panelRight.classList.toggle('is-open', open);
      computeLayoutBounds();
      setTimeout(computeLayoutBounds, 620);
    });
    els.btnCloseRight.addEventListener('click', () => {
      els.panelRight.classList.remove('is-open');
      computeLayoutBounds();
      setTimeout(computeLayoutBounds, 500);
    });
    if (els.btnCloseLeft) {
      els.btnCloseLeft.addEventListener('click', () => {
        els.panelLeft.classList.remove('is-open');
        computeLayoutBounds();
        setTimeout(computeLayoutBounds, 500);
      });
    }

    // 点击画布时关闭移动端抽屉
    els.canvas.addEventListener('pointerdown', () => {
      if (window.innerWidth <= 980) closeDrawers();
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) clock.getDelta();
    });
  }

  function closeDrawers() {
    els.panelLeft.classList.remove('is-open');
    els.panelRight.classList.remove('is-open');
    computeLayoutBounds();
  }

  function enterExperience() {
    if (state.started) return;
    state.started = true;
    els.onboarding.classList.add('is-hidden');
    els.onboarding.setAttribute('aria-hidden', 'true');
    if (state.autoRotate) controls.autoRotate = true;
    // 相机开场动画结束后由 updateCameraTween 启用 controls
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => console.warn(err));
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(err => console.warn(err));
    }
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function onKeyDown(ev) {
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (ev.key) {
      case 'e':
      case 'E':
        ev.preventDefault();
        toggleExplode();
        break;
      case 'r':
      case 'R':
        ev.preventDefault();
        resetView();
        break;
      case 'l':
      case 'L':
        ev.preventDefault();
        els.toggleLabels.checked = !els.toggleLabels.checked;
        els.toggleLabels.dispatchEvent(new Event('change'));
        break;
      case ' ':
        ev.preventDefault();
        setAutoRotate(!state.autoRotate);
        break;
      case 'Escape':
        if (!els.onboarding.classList.contains('is-hidden') && state.started) {
          enterExperience();
        } else if (state.selectedId) {
          deselect();
        } else if (state.exploded) {
          setExploded(false);
        } else if (window.innerWidth <= 980) {
          closeDrawers();
        }
        break;
      default:
        break;
    }
  }

  /* =====================================================================
   * 每帧更新
   * =================================================================== */
  function loop(now) {
    requestAnimationFrame(loop);

    const dt = Math.min(clock.getDelta(), 0.05);
    if (paused) return;
    step(dt, now / 1000);
    composer.render();
  }

  function step(dt, t) {
    updateCameraTween(dt);
    updateShell(dt);
    controls.update();

    // 拆解插值
    let sum = 0;
    parts.forEach(part => {
      if (part.target !== part.t) {
        if (t >= part.animStart) {
          const factor = 1 - Math.exp(-6.2 * dt);
          part.t += (part.target - part.t) * factor;
          if (Math.abs(part.target - part.t) < 0.0008) part.t = part.target;
        }
      }
      const k = part.t * part.t * (3 - 2 * part.t); // smoothstep
      part.group.position.copy(part.base).addScaledVector(part.explodeOffset, k);
      part.group.rotation.set(
        part.baseRot.x + part.explodeRot.x * k,
        part.baseRot.y + part.explodeRot.y * k,
        part.baseRot.z + part.explodeRot.z * k
      );
      sum += part.t;

      // 光晕
      let wantGlow = (part.id === state.selectedId ? 0.24 : 0) + (part.id === state.hoveredId ? 0.12 : 0);
      if (part.id === 'body') wantGlow *= 0.4;
      part.glow += (wantGlow - part.glow) * Math.min(1, dt * 8);
      if (part.glow > 0.005) {
        const c = part.group.localToWorld(part.centerLocal.clone());
        part.halo.position.copy(c);
        const pulse = 0.88 + Math.sin(t * 3.2 + part.index) * 0.12;
        part.halo.material.opacity = part.glow * pulse;
        part.halo.visible = true;
      } else {
        part.halo.material.opacity = 0;
        part.halo.visible = false;
      }
    });

    // 选择框跟随部件
    if (selectionHelper && selectionPart && byId[selectionPart]) {
      selectionHelper.setFromObject(byId[selectionPart].group);
    }

    // 环境运动
    if (bgGroup && bgGroup.userData.stars) {
      bgGroup.userData.stars.rotation.y += dt * 0.006;
      bgGroup.userData.stars.rotation.x += dt * 0.0015;
    }
    if (dustGroup) {
      dustGroup.rotation.y -= dt * 0.014;
      dustGroup.rotation.x += dt * 0.004;
    }

    updateLabels();
    updateMeter(sum / (parts.length || 1));
    updateFPS(dt);
  }

  function updateShell(dt) {
    if (!byId || !byId.body) return;
    const target = state.exploded ? 0.14 : 1;
    shellOpacity += (target - shellOpacity) * Math.min(1, dt * 5.5);
    if (Math.abs(shellOpacity - target) < 0.002) shellOpacity = target;

    byId.body.materials.forEach(mat => {
      if (!mat) return;
      const base = mat.userData.baseOpacity !== undefined ? mat.userData.baseOpacity : 1;
      mat.opacity = base * shellOpacity;
      const transparent = shellOpacity < 0.985 || base < 1;
      if (mat.userData.ghosted !== transparent) {
        mat.userData.ghosted = transparent;
        mat.transparent = transparent;
        mat.depthWrite = shellOpacity > 0.7 ? (mat.userData.baseDepthWrite !== false) : false;
        mat.needsUpdate = true;
      }
    });
  }

  function updateMeter(averageT) {
    let value;
    let mode;
    if (state.selectedId && !state.exploded) {
      const p = byId[state.selectedId];
      value = p ? Math.round(p.t * 100) : 0;
      mode = '拆解 · ' + (p ? p.info.name : '');
    } else if (state.exploded) {
      value = Math.round(averageT * 100);
      mode = '整机拆解';
    } else {
      value = Math.round(averageT * 100);
      mode = '整机装配';
    }

    const key = mode + '|' + value;
    if (key !== lastMeterText) {
      lastMeterText = key;
      els.modeText.textContent = mode;
      els.percent.textContent = value + '%';
      els.meterFill.style.width = value + '%';
    }
  }

  function updateFPS(dt) {
    frameState.count++;
    frameState.t += dt;
    if (frameState.t >= 0.6) {
      const fps = Math.round(frameState.count / frameState.t);
      frameState.fps = fps;
      els.fps.textContent = String(Math.min(240, fps));
      frameState.count = 0;
      frameState.t = 0;
    }
  }

  /* =====================================================================
   * 尺寸 / 加载 / 错误
   * =================================================================== */
  function onResize() {
    if (!renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    composer.setSize(w, h);
    computeLayoutBounds();

    // 屏幕宽高比变化时，若用户尚未手动缩放，则重新适配相机距离
    if (state.started && !cameraTween) {
      const desired = responsiveDistance(state.exploded ? 15.8 : 13.62);
      const current = camera.position.distanceTo(controls.target);
      if (Math.abs(current - desired) > desired * 0.35) {
        const dir = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(dir, desired);
        controls.update();
      }
    }
  }

  function animateLoader() {
    let value = 0;
    const tick = () => {
      value = Math.min(100, value + 8 + Math.random() * 16);
      const v = Math.round(value);
      els.loaderFill.style.width = v + '%';
      els.loaderPercent.textContent = v + '%';
      if (value < 100) {
        setTimeout(tick, 70 + Math.random() * 60);
      } else {
        setTimeout(() => {
          els.loader.classList.add('is-hidden');
        }, 320);
      }
    };
    tick();
  }

  function showFatal(err) {
    const fatal = document.getElementById('fatal');
    const msg = document.getElementById('fatal-message');
    if (fatal) fatal.hidden = false;
    if (els.loader) els.loader.classList.add('is-hidden');
    if (msg && err && err.message) {
      msg.textContent = '当前浏览器或设备无法初始化 WebGL 场景：' + err.message;
    }
  }
})();
