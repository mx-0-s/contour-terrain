const BORDER_TOL = 6;
const CLOSE_TOL = 10;
const SELECT_TOL = 6;

export class DrawingBoard {
    constructor(canvas, callbacks = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.callbacks = callbacks;
        this.strokes = [];
        this.selected = null;
        this.interval = 50;
        this.penWidth = 3;
        this.cssW = 0;
        this.cssH = 0;

        this._drawing = null;
        this._draft = null;
        this._moved = false;
        this._nextId = 1;
        this._bind();
        this.resize();
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dpr = window.devicePixelRatio || 1;
        this.cssW = rect.width;
        this.cssH = rect.height;
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.render();
    }

    _pos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    _isBorder(p) {
        return p.x <= BORDER_TOL || p.x >= this.cssW - BORDER_TOL ||
               p.y <= BORDER_TOL || p.y >= this.cssH - BORDER_TOL;
    }

    _analyzeStroke(s) {
        const pts = s.points;
        s.issues = [];
        if (pts.length < 3) { s.closed = false; return s; }
        const a = pts[0], b = pts[pts.length - 1];
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        if (gap <= CLOSE_TOL) { s.closed = true; return s; }
        s.closed = false;
        if (!this._isBorder(a)) s.issues.push({ x: a.x, y: a.y, atStart: true });
        if (!this._isBorder(b)) s.issues.push({ x: b.x, y: b.y, atStart: false });
        return s;
    }

    reanalyzeAll() {
        this.strokes.forEach(s => this._analyzeStroke(s));
    }

    get unclosed() {
        return this.strokes.filter(s => !s.closed && s.issues.length > 0);
    }

    _bind() {
        const c = this.canvas;
        c.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            c.setPointerCapture(e.pointerId);
            const p = this._pos(e);
            this._drawing = { id: this._nextId++, points: [p], elevation: null, closed: false, issues: [] };
            this._moved = false;
            this._downPos = p;
        });
        c.addEventListener('pointermove', (e) => {
            if (!this._drawing) return;
            const p = this._pos(e);
            const pts = this._drawing.points;
            const last = pts[pts.length - 1];
            if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
            if (Math.hypot(p.x - this._downPos.x, p.y - this._downPos.y) > 4) this._moved = true;
            pts.push(p);
            this.render();
        });
        c.addEventListener('pointerup', (e) => {
            if (!this._drawing) return;
            const stroke = this._drawing;
            this._drawing = null;
            if (!this._moved || stroke.points.length < 3) {
                this._draft = null;
                this._clickSelect(this._pos(e));
                this.render();
                return;
            }
            this._commitStroke(stroke);
        });
        c.addEventListener('pointercancel', () => { this._drawing = null; this.render(); });
    }

    _commitStroke(stroke) {
        this._analyzeStroke(stroke);
        this._draft = stroke;
        this.render();
        const suggested = this._suggestElevation();
        this.callbacks.onElevationPrompt?.(stroke, suggested, (value) => {
            this._draft = null;
            if (value === null || value === undefined) {
                this.render();
                return;
            }
            stroke.elevation = this._snap(value);
            this.strokes.push(stroke);
            this.reanalyzeAll();
            this._notify();
            this.select(stroke);
        });
    }

    _suggestElevation() {
        const vals = this.strokes.map(s => s.elevation).filter(v => v !== null);
        const max = vals.length ? Math.max(...vals) : 0;
        return max + this.interval;
    }

    _snap(v) {
        return Math.round(v / this.interval) * this.interval;
    }

    _notify() {
        this.callbacks.onStrokesChanged?.(this.strokes);
    }

    _clickSelect(p) {
        let best = null, bestD = SELECT_TOL;
        for (const s of this.strokes) {
            const d = this._distToStroke(p, s.points);
            if (d < bestD) { bestD = d; best = s; }
        }
        this.select(best);
    }

    _distToStroke(p, pts) {
        let min = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
            const d = this._distSeg(p, pts[i], pts[i + 1]);
            if (d < min) min = d;
        }
        return min;
    }

    _distSeg(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    select(s) {
        this.selected = s;
        this.callbacks.onSelect?.(s);
        this.render();
    }

    undo() {
        if (!this.strokes.length) return;
        const removed = this.strokes.pop();
        if (this.selected === removed) this.select(null);
        this.reanalyzeAll();
        this._notify();
        this.render();
    }

    clear() {
        this.strokes = [];
        this._draft = null;
        this.select(null);
        this._notify();
        this.render();
    }

    deleteSelected() {
        if (!this.selected) return;
        const idx = this.strokes.indexOf(this.selected);
        if (idx >= 0) this.strokes.splice(idx, 1);
        this.select(null);
        this.reanalyzeAll();
        this._notify();
    }

    forceCloseAll() {
        let n = 0;
        for (const s of this.strokes) {
            if (!s.closed && s.issues.length) {
                s.points.push({ ...s.points[0] });
                this._analyzeStroke(s);
                n++;
            }
        }
        if (n) { this._notify(); this.render(); }
        return n;
    }

    setIntervalValue(v) {
        this.interval = v;
        for (const s of this.strokes) s.elevation = this._snap(s.elevation);
        this._notify();
        this.render();
    }

    setPenWidth(w) { this.penWidth = w; this.render(); }

    render() {
        const ctx = this.ctx;
        const w = this.cssW, h = this.cssH;
        if (!w || !h) return;
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#f6f3ea';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#dfddd2';
        ctx.lineWidth = 1;
        const step = 40;
        ctx.beginPath();
        for (let x = step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for (let y = step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(104,145,112,0.38)';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(BORDER_TOL, BORDER_TOL, w - BORDER_TOL * 2, h - BORDER_TOL * 2);
        ctx.setLineDash([]);

        for (const s of this.strokes) this._drawStroke(s, s === this.selected);
        if (this._draft) this._drawStroke(this._draft, false, true);
        if (this._drawing) this._drawStroke(this._drawing, false, true);
    }

    _drawStroke(s, selected, draft = false) {
        const ctx = this.ctx;
        const pts = s.points;
        if (pts.length < 2) return;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = this.penWidth + (selected ? 2 : 0);
        ctx.strokeStyle = draft ? '#5b9470' : (selected ? '#bd704f' : '#2b2b2b');
        if (draft) ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (s.elevation !== null && pts.length >= 2) {
            const mid = pts[Math.floor(pts.length / 2)];
            const label = s.elevation + ' m';
            ctx.font = 'bold 12px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            ctx.fillRect(mid.x + 6, mid.y - 16, tw + 8, 17);
            ctx.strokeStyle = '#c9c2b0';
            ctx.lineWidth = 1;
            ctx.strokeRect(mid.x + 6, mid.y - 16, tw + 8, 17);
            ctx.fillStyle = '#426b4b';
            ctx.fillText(label, mid.x + 10, mid.y - 4);
        }

        if (!draft && !s.closed) {
            for (const iss of s.issues) {
                ctx.beginPath();
                ctx.arc(iss.x, iss.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(220,50,50,0.25)';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#d83232';
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(iss.x, iss.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#d83232';
                ctx.fill();
            }
        }
    }
}
