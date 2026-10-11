// 临时验证脚本：等高线 → 高度场 数值正确性
import { computeHeightField } from '../js/heightfield.js';

// 梯田检测：只统计“两条等高线之间”的环带（该区域必须是平滑坡道）。
// 若残留阶梯初值，环带内会出现大片近似常数的平台；平滑初值后应≈0%。
// 注意：最外圈之外、峰顶圈之内为常数是调和解的正确结果（平顶），不计入。
function plateauRatio(f) {
    const N = f.N, span = f.max - f.min || 1;
    const eps = span * 0.005;
    // 测试用同心方形：外圈 r=150px、中圈 r=90px → 换算到 N 网格的环带
    const scale = N / 400;
    const rIn = 98 * scale, rOut = 142 * scale;
    const c = N / 2;
    let flat = 0, band = 0;
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const r = Math.hypot(x + 0.5 - c, y + 0.5 - c);
            if (r < rIn || r > rOut) continue;
            const i = y * N + x;
            const v = f.data[i];
            const dv = Math.abs(v - f.data[i - 1]) + Math.abs(v - f.data[i + 1]) +
                       Math.abs(v - f.data[i - N]) + Math.abs(v - f.data[i + N]);
            if (dv < eps) flat++;
            band++;
        }
    }
    return band ? flat / band : 0;
}

function squarePts(cx, cy, r) {
    return [
        { x: cx - r, y: cy - r }, { x: cx + r, y: cy - r },
        { x: cx + r, y: cy + r }, { x: cx - r, y: cy + r },
        { x: cx - r, y: cy - r },
    ];
}
const strokes = [
    { points: squarePts(200, 200, 150), elevation: 50 },
    { points: squarePts(200, 200, 90), elevation: 250 },
    { points: squarePts(200, 200, 40), elevation: 500 },
];

for (const mode of ['poisson', 'idw']) {
    const t0 = Date.now();
    const f = computeHeightField(strokes, { N: 128, mode, iterations: 250, penWidth: 3, cssW: 400, cssH: 400 });
    const ms = Date.now() - t0;
    const center = f.data[((128 / 2) | 0) * 128 + ((128 / 2) | 0)];
    const corner = f.data[0];
    let inRange = true;
    for (let i = 0; i < f.data.length; i++) {
        if (f.data[i] < 50 - 1e-3 || f.data[i] > 500 + 1e-3) { inRange = false; break; }
    }
    const plateau = plateauRatio(f);
    console.log(`[${mode}] ${ms}ms  min=${f.min.toFixed(1)} max=${f.max.toFixed(1)} ` +
        `center=${center.toFixed(1)} corner=${corner.toFixed(1)} ` +
        `最大值原理=${inRange} 平坦平台占比=${(plateau * 100).toFixed(1)}%`);
}

// 扫描线剖面：从边缘(≈50)到中心(500)应单调平滑上升，无阶梯平台
const f = computeHeightField(strokes, { N: 128, mode: 'poisson', iterations: 250, penWidth: 3, cssW: 400, cssH: 400 });
const N = 128, row = (N / 2) | 0;
const profile = [];
for (let x = 6; x < N / 2; x += 6) profile.push(f.data[row * N + x].toFixed(0));
console.log('边缘→中心剖面:', profile.join(' '));
let maxBack = 0;
for (let x = 6; x < N / 2; x++) {
    const d = f.data[row * N + x] - f.data[row * N + x - 1];
    if (d < maxBack) maxBack = d;   // 单调上升序列中不应出现下降段
}
console.log('剖面最大反向跳跃:', maxBack.toFixed(3), '(应≈0，即严格单调)');

// 单线（开放边界场景）：一条从边界到边界的 100m 线，全部区域应保持 ≈100（Neumann 边界）
const f2 = computeHeightField([
    { points: [{ x: 200, y: 0 }, { x: 200, y: 400 }], elevation: 100 },
], { N: 64, mode: 'poisson', iterations: 300, penWidth: 3, cssW: 400, cssH: 400 });
console.log(`[单线] min=${f2.min.toFixed(1)} max=${f2.max.toFixed(1)}（Neumann 边界，应全部≈100）`);
