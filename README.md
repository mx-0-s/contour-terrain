# 手绘等高线 → 三维地形生成器
# Hand-Drawn Contours → 3D Terrain Generator

将手绘等高线转换为高度场，并使用 Three.js 渲染为三维地形。

Convert hand-drawn contour lines into a height field and render a 3D terrain using Three.js.

## 运行 | Run

双击 `start.bat` 启动本地服务器并打开 <http://localhost:8000/>，或在项目目录运行：

Double-click `start.bat` to start the local server and open <http://localhost:8000/>, or run this command from the project directory:

```powershell
python -m http.server 8000
```

然后在浏览器中访问 <http://localhost:8000/>。

Then open <http://localhost:8000/> in a browser.

必须通过 HTTP 访问；直接打开 `index.html` 无法加载 ES Modules 和 import map。项目通过 **unpkg CDN** 加载 Three.js `0.160.0` 及其 addons，因此运行时需要联网并能够访问 `https://unpkg.com`。

Serve the project over HTTP; opening `index.html` directly will not load ES modules and the import map. The project loads Three.js `0.160.0` and its addons from the **unpkg CDN**, so an internet connection and access to `https://unpkg.com` are required at runtime.

## 第三方许可证 | Third-party license

本项目使用的 Three.js `0.160.0` 由 three.js authors 按 **MIT License** 发布。许可证全文及版权声明见 [Three.js r160 LICENSE](https://github.com/mrdoob/three.js/blob/r160/LICENSE)（Copyright © 2010–2023 three.js authors）。该许可说明仅针对 Three.js，不代表本项目自身的许可证。

Three.js `0.160.0`, used by this project, is distributed by the three.js authors under the **MIT License**. See the [Three.js r160 LICENSE](https://github.com/mrdoob/three.js/blob/r160/LICENSE) for the full license text and copyright notice (Copyright © 2010–2023 three.js authors). This notice applies to Three.js only and does not specify a license for this project.

## 使用 | Usage

1. **绘制等高线 | Draw contours**：在左上绘图区用鼠标或触控绘制；画完后输入高程。输入值会吸附到等高距的整数倍。
   Draw contours in the upper-left canvas with a mouse or touch input. Enter an elevation after each line; values snap to multiples of the contour interval.
2. **检查未闭合线 | Check open contours**：首尾相接的线视为闭合；端点位于画布边缘时视为合法的出图边界。其他未闭合端点会以红点标记，并显示在警告列表中。
   A line whose endpoints meet is closed. Endpoints on the canvas border are treated as valid map-boundary exits. Other open endpoints are marked in red and listed in the warning panel.
3. **设置范围 | Set map options**：
   - 等高距 | Contour interval：50 m 或 100 m；切换后现有高程会重新吸附。
     Choose 50 m or 100 m; existing elevations are resnapped when changed.
   - 地图面积 | Map area：25 km²（5 × 5 km）或 100 km²（10 × 10 km）。
     Choose 25 km² (5 × 5 km) or 100 km² (10 × 10 km).
4. **查看高度场 | View the height field**：左下预览显示插值后的热力图、色标和原始等高线。
   The lower-left preview shows the interpolated heatmap, color scale, and original contours.
5. **查看三维地形 | View the 3D terrain**：右侧视图支持拖拽旋转、滚轮缩放和线框模式。地形按真实比例渲染：1 个场景单位为 1 km，高程米数换算为千米。
   The right-hand view supports drag-to-rotate, wheel-to-zoom, and wireframe mode. Terrain uses real-world proportions: one scene unit represents 1 km, and elevations in meters are converted to kilometers.

## 插值算法 | Interpolation

- **调和插值（泊松） | Harmonic (Poisson) interpolation**：将等高线作为固定高程约束，对空白区域进行迭代插值。
  Treats contours as fixed-elevation constraints and iteratively interpolates the remaining area.
- **IDW | Inverse distance weighting**：使用反距离平方加权，可作为替代插值模式。
  Uses inverse-square distance weighting as an alternative interpolation mode.

## 项目文件 | Project files

- `js/drawing.js` — 绘图、逐线高程标记和闭合检测 | Drawing, per-contour elevation input, and closure checks
- `js/heightfield.js` — 高度场栅格化、插值和分层设色 | Height-field rasterization, interpolation, and elevation coloring
- `js/fieldview.js` — 高度场二维预览 | 2D height-field preview
- `js/main.js` — Three.js 场景和界面总控 | Three.js scene and UI
- `test/` — 数值与绘图验证脚本 | Numerical and drawing validation scripts

## 测试 | Tests

在项目目录运行以下命令：

Run these commands from the project directory:

```powershell
node test/heightfield.test.mjs
node test/drawing.test.mjs
```
