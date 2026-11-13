# Calibre 2824 — 3D teardown

一枚自动机械腕表的可交互真 3D 拆解页：**单文件 `index.html`（约 780 KB，零外部请求）**，Three.js 程序化建模，无任何模型/贴图文件。

打开 `index.html` 即可（需要 WebGL）。首次进入有一段引导页。

## 交互

| 操作 | 效果 |
|---|---|
| 左键拖拽 | 旋转视角（真 3D，可绕到表背） |
| 滚轮 / 双指 | 缩放 |
| 右键拖拽 / 双指 | 平移 |
| 点击部件 | 该部件独立飞出、高亮，右侧显示参数 |
| **拆解整机 / 一键组装** 按钮（或 `E`） | 19 个部件按顺序分层拆开 / 合回 |
| `R` | 重置视角 |
| `Esc` | 取消选中 / 退出拆解 |
| 左侧「部件清单」 | 19 个部件，点击定位；右侧「参数说明」是整机与单件规格 |

还带：自动旋转开关、部件标注（引线 + 标签）、拆解进度、FPS 显示、移动端抽屉式面板、加载页与 WebGL 失败提示。

## 19 个部件

蓝宝石镜面 · 表圈 · 秒针 · 分针 · 时针 · 立体时标 · 表盘 · 表壳与表耳 · 表背 · 表冠与柄轴 · 夹板组 · 摆轮与游丝 · 擒纵轮 · 擒纵叉 · 轮系 · 条盒轮与发条 · 棘轮与上链轮 · 主夹板 · 自动陀

## 真实参数（单一数据源 `js/data.js`）

40.0 mm 表壳 · 10.4 mm 厚 · 25.6 mm 机芯 · 28,800 vph（4 Hz / 8 beats·s⁻¹）· 25 颗宝石 · 38 h 动力储备 · 摆幅 270° · 15 齿擒纵轮（每 beat 12°）· 秒针每秒 8 跳。

页面里摆轮 4 Hz 摆动、秒针 8 次/秒跳动、擒纵轮每 beat 12°、自动陀缓慢摆动，均由 `js/model.js` 的 `update(t)` 驱动，参数与 `data.js` 同源。

## 构建

```sh
node build.mjs        # src/page.html + css + vendor + js → 单文件 index.html
```

## 目录

```
src/page.html         页面结构与文案（开发用，<script src> 形式）
css/style.css         HUD、面板、引导页、移动端
vendor/three/         three r147 (UMD) + OrbitControls / Bloom / RoundedBox
js/data.js            19 个部件的元数据：名称、类别、拆解向量、锚点、参数文案
js/model-mats.js      共享材质（钢/铬/金/黄铜/蓝宝石/红宝石…）与几何工具
js/model-exterior.js  表壳/表背/表圈/镜面/表盘/时标/指针/表冠
js/model-movement.js  主夹板/自动陀/条盒/轮系/擒纵/摆轮游丝/夹板/棘轮
js/model.js           注册表：把 data.js 与几何组装成可拆解部件，驱动自转
js/app.js             场景/相机/控制器/后期/交互/拆解动画/面板（复用 DJI 项目骨架）
build.mjs             内联打包
```

## 调试

- `index.html#nointro` 跳过引导页
- 控制台里 `__watch.only('case,dial')` 只显示指定部件，`__watch.all()` 恢复
- `__watch.byId.<id>.group` 直接拿到某个部件的 Group

## 验证

用无头 Chrome 驱动（`../watch-anatomy/scripts/drive.mjs`，本机沙箱下已加 `--no-sandbox`）：

```sh
node build.mjs
TMPDIR=$PWD/.tmp node ../watch-anatomy/scripts/drive.mjs "file://$PWD/index.html#nointro" \
  --actions .tmp/actions.json      # [["wait",4200],["shot","shots/x.png",null,1]]
```

已经检查过：桌面 1440 宽、移动端 390 宽、组装/拆解、悬停 tooltip、点击选中、自动旋转开关、控制台无报错。
