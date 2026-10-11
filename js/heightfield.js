export function computeHeightField(strokes, opts) {
    const { N, mode = 'poisson', iterations = 250, penWidth = 3, cssW, cssH } = opts;
    const active = strokes.filter(s => s.elevation !== null && s.elevation !== undefined && s.points.length > 1);
    if (!active.length) return null;

    const total = N * N;
    const data = new Float32Array(total);
    const fixed = new Uint8Array(total);
    const bestDist = new Float32Array(total).fill(Infinity);

    const sx = N / cssW;
    const sy = N / cssH;
    const scale = Math.max(sx, sy);
    const radius = Math.max(1.0, (penWidth * 0.75 + 0.5) * scale);

    for (const s of active) {
        const z = s.elevation;
        const pts = s.points;
        for (let i = 0; i < pts.length - 1; i++) {
            {
                const ax = pts[i].x * sx, ay = pts[i].y * sy;
                const bx = pts[i + 1].x * sx, by = pts[i + 1].y * sy;
                const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 1));
                const maxX = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + radius + 1));
                const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius - 1));
                const maxY = Math.min(N - 1, Math.ceil(Math.max(ay, by) + radius + 1));
                const dx = bx - ax, dy = by - ay;
                const len2 = dx * dx + dy * dy;
                for (let gy = minY; gy <= maxY; gy++) {
                    for (let gx = minX; gx <= maxX; gx++) {
                        const px = gx + 0.5 - ax, py = gy + 0.5 - ay;
                        let t = len2 ? (px * dx + py * dy) / len2 : 0;
                        t = t < 0 ? 0 : (t > 1 ? 1 : t);
                        const ex = px - t * dx, ey = py - t * dy;
                        const d = Math.sqrt(ex * ex + ey * ey);
                        if (d > radius) continue;
                        const idx = gy * N + gx;
                        if (d < bestDist[idx]) {
                            bestDist[idx] = d;
                            data[idx] = z;
                            fixed[idx] = 1;
                        }
                    }
                }
            }
        }
    }

    if (mode === 'idw') {
        idwFill(data, fixed, N, total);
    } else {
        poissonFill(data, fixed, N, iterations);
    }

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < total; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
    }
    return { N, data, min, max };
}

function poissonFill(data, fixed, N, iterations) {
    const total = N * N;
    smoothInit(data, fixed, N);

    for (let it = 0; it < iterations; it++) {
        for (let y = 0; y < N; y++) {
            const row = y * N;
            const yUp = (y > 0 ? row - N : row);
            const yDn = (y < N - 1 ? row + N : row);
            for (let x = 0; x < N; x++) {
                const i = row + x;
                if (fixed[i]) continue;
                const l = x > 0 ? data[i - 1] : (x < N - 1 ? data[i + 1] : data[i]);
                const r = x < N - 1 ? data[i + 1] : (x > 0 ? data[i - 1] : data[i]);
                const u = y > 0 ? data[i - N] : (y < N - 1 ? data[i + N] : data[i]);
                const d = y < N - 1 ? data[i + N] : (y > 0 ? data[i - N] : data[i]);
                data[i] = (u + d + l + r) * 0.25;
            }
        }
    }
}

function smoothInit(data, fixed, N) {
    const total = N * N;

    const valueSet = new Set();
    for (let i = 0; i < total; i++) if (fixed[i]) valueSet.add(data[i]);
    if (valueSet.size === 0) {
        for (let i = 0; i < total; i++) data[i] = 0;
        return;
    }

    const d1 = new Float32Array(total).fill(Infinity);
    const z1 = new Float32Array(total);
    const ax1 = new Float32Array(total), ay1 = new Float32Array(total);
    const d2 = new Float32Array(total).fill(Infinity);
    const z2 = new Float32Array(total);
    const ax2 = new Float32Array(total), ay2 = new Float32Array(total);

    const dist = new Float32Array(total);
    const srcX = new Float32Array(total);
    const srcY = new Float32Array(total);

    for (const z of valueSet) {
        const D = dist, SX = srcX, SY = srcY;
        for (let y = 0; y < N; y++) {
            const row = y * N;
            for (let x = 0; x < N; x++) {
                const i = row + x;
                if (fixed[i] && data[i] === z) { D[i] = 0; SX[i] = x; SY[i] = y; }
                else { D[i] = Infinity; }
            }
        }
        for (let y = 0; y < N; y++) {
            const row = y * N;
            for (let x = 0; x < N; x++) {
                const i = row + x;
                let d = D[i], sx = SX[i], sy = SY[i];
                if (y > 0) {
                    if (D[i - N] + 1 < d) { d = D[i - N] + 1; sx = SX[i - N]; sy = SY[i - N]; }
                    if (x > 0 && D[i - N - 1] + SQRT2 < d) { d = D[i - N - 1] + SQRT2; sx = SX[i - N - 1]; sy = SY[i - N - 1]; }
                    if (x < N - 1 && D[i - N + 1] + SQRT2 < d) { d = D[i - N + 1] + SQRT2; sx = SX[i - N + 1]; sy = SY[i - N + 1]; }
                }
                if (x > 0 && D[i - 1] + 1 < d) { d = D[i - 1] + 1; sx = SX[i - 1]; sy = SY[i - 1]; }
                D[i] = d; SX[i] = sx; SY[i] = sy;
            }
        }
        for (let y = N - 1; y >= 0; y--) {
            const row = y * N;
            for (let x = N - 1; x >= 0; x--) {
                const i = row + x;
                let d = D[i], sx = SX[i], sy = SY[i];
                if (y < N - 1) {
                    if (D[i + N] + 1 < d) { d = D[i + N] + 1; sx = SX[i + N]; sy = SY[i + N]; }
                    if (x < N - 1 && D[i + N + 1] + SQRT2 < d) { d = D[i + N + 1] + SQRT2; sx = SX[i + N + 1]; sy = SY[i + N + 1]; }
                    if (x > 0 && D[i + N - 1] + SQRT2 < d) { d = D[i + N - 1] + SQRT2; sx = SX[i + N - 1]; sy = SY[i + N - 1]; }
                }
                if (x < N - 1 && D[i + 1] + 1 < d) { d = D[i + 1] + 1; sx = SX[i + 1]; sy = SY[i + 1]; }
                D[i] = d; SX[i] = sx; SY[i] = sy;
            }
        }

        for (let i = 0; i < total; i++) {
            const di = D[i];
            if (di < d1[i]) {
                if (z1[i] !== z) {
                    d2[i] = d1[i]; z2[i] = z1[i]; ax2[i] = ax1[i]; ay2[i] = ay1[i];
                }
                d1[i] = di; z1[i] = z; ax1[i] = SX[i]; ay1[i] = SY[i];
            } else if (z !== z1[i] && di < d2[i]) {
                d2[i] = di; z2[i] = z; ax2[i] = SX[i]; ay2[i] = SY[i];
            }
        }
    }

    for (let i = 0; i < total; i++) {
        if (fixed[i]) continue;
        const dd1 = d1[i], dd2 = d2[i];
        if (dd1 === Infinity) { data[i] = 0; continue; }
        if (dd2 === Infinity) { data[i] = z1[i]; continue; }
        const x = i % N, y = (i / N) | 0;
        const dot = (ax1[i] - x) * (ax2[i] - x) + (ay1[i] - y) * (ay2[i] - y);
        if (dot > 0) {
            data[i] = z1[i];
        } else {
            data[i] = (z1[i] * dd2 + z2[i] * dd1) / (dd1 + dd2);
        }
    }
}

const SQRT2 = Math.SQRT2;

function idwFill(data, fixed, N, total) {
    const samples = [];
    for (let i = 0; i < total; i++) if (fixed[i]) samples.push(i);
    if (!samples.length) return;
    const stride = Math.max(1, Math.floor(samples.length / 4000));
    const pts = [];
    for (let k = 0; k < samples.length; k += stride) pts.push(samples[k]);

    for (let i = 0; i < total; i++) {
        if (fixed[i]) continue;
        const x = i % N + 0.5, y = ((i / N) | 0) + 0.5;
        let sumW = 0, sumV = 0;
        for (let k = 0; k < pts.length; k++) {
            const j = pts[k];
            const jx = j % N + 0.5, jy = ((j / N) | 0) + 0.5;
            const dx = x - jx, dy = y - jy;
            const d2 = dx * dx + dy * dy;
            if (d2 < 1e-6) { sumW = 1e6; sumV = 1e6 * data[j]; break; }
            const w = 1 / d2;
            sumW += w;
            sumV += w * data[j];
        }
        data[i] = sumW > 0 ? sumV / sumW : 0;
    }
}

export function elevationColor(t) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const stops = [
        [0.00, 58, 120, 70],
        [0.30, 130, 178, 96],
        [0.50, 230, 210, 110],
        [0.70, 196, 140, 84],
        [0.88, 150, 108, 82],
        [1.00, 250, 250, 250],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1];
        if (t <= b[0]) {
            const f = (t - a[0]) / (b[0] - a[0] || 1);
            return [
                Math.round(a[1] + (b[1] - a[1]) * f),
                Math.round(a[2] + (b[2] - a[2]) * f),
                Math.round(a[3] + (b[3] - a[3]) * f),
            ];
        }
    }
    return [250, 250, 250];
}
