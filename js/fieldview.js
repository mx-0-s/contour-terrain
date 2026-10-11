import { elevationColor } from './heightfield.js';

export function renderFieldView(canvas, field, strokes, opts) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = opts.cssW, cssH = opts.cssH;
    if (!cssW || !cssH) return;

    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!field) {
        ctx.fillStyle = '#7070a0';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('绘制等高线并标记高程后，这里显示高度场', cssW / 2, cssH / 2);
        ctx.textAlign = 'left';
        return;
    }

    const N = field.N;
    const span = field.max - field.min || 1;

    const off = document.createElement('canvas');
    off.width = N;
    off.height = N;
    const octx = off.getContext('2d');
    const img = octx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
        const t = (field.data[i] - field.min) / span;
        const [r, g, b] = elevationColor(t);
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, cssW, cssH);

    if (opts.showContours !== false && strokes) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const s of strokes) {
            if (s.elevation === null || s.points.length < 2) continue;
            ctx.strokeStyle = 'rgba(20,20,20,0.65)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(s.points[0].x, s.points[0].y);
            for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
            ctx.stroke();
        }
    }

    const barW = Math.min(140, cssW * 0.35);
    const barH = 8;
    const bx = cssW - barW - 10;
    const by = cssH - barH - 8;
    const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
    for (let k = 0; k <= 10; k++) {
        const [r, g, b] = elevationColor(k / 10);
        grad.addColorStop(k / 10, `rgb(${r},${g},${b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, barW, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '10px sans-serif';
    ctx.fillText(field.min + ' m', bx, by - 3);
    ctx.textAlign = 'right';
    ctx.fillText(field.max + ' m', bx + barW, by - 3);
    ctx.textAlign = 'left';
}
