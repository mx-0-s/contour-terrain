// DrawingBoard 闭合检测逻辑测试（mock canvas）
globalThis.window = { devicePixelRatio: 1 };
const mockCtx = new Proxy({}, {
    get: (t, p) => {
        if (p === 'measureText') return () => ({ width: 20 });
        return () => {};
    },
    set: () => true,
});
const mockCanvas = {
    width: 0, height: 0,
    getContext: () => mockCtx,
    getBoundingClientRect: () => ({ width: 400, height: 300 }),
    addEventListener: () => {},
    setPointerCapture: () => {},
};
const { DrawingBoard } = await import('../js/drawing.js');
const board = new DrawingBoard(mockCanvas, {});
console.log('canvas size:', board.cssW, 'x', board.cssH);

function mk(pts, elev = 100) { return { id: 99, points: pts, elevation: elev, closed: false, issues: [] }; }

// 1) 闭合环（首尾重合）
board.strokes = [mk([
    { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 100 },
])];
board.reanalyzeAll();
console.log('闭合环 → closed =', board.strokes[0].closed, '(期望 true)，issues =', board.strokes[0].issues.length, '(期望 0)');

// 2) 两端都在边界（山脊线横穿地图）
board.strokes = [mk([{ x: 0, y: 150 }, { x: 200, y: 140 }, { x: 400, y: 150 }])];
board.reanalyzeAll();
const s2 = board.strokes[0];
console.log('边界→边界 → closed =', s2.closed, '(期望 false)，issues =', s2.issues.length, '(期望 0：两端均在边界，合法)');

// 3) 中间断线（两端都不在边界）
board.strokes = [mk([{ x: 100, y: 100 }, { x: 200, y: 120 }, { x: 300, y: 100 }])];
board.reanalyzeAll();
const s3 = board.strokes[0];
console.log('中间断线 → closed =', s3.closed, '(期望 false)，issues =', s3.issues.length, '(期望 2，红点标记)');

// 4) 一端边界一端悬空（≥3 点，与真实笔画一致）
board.strokes = [mk([{ x: 0, y: 150 }, { x: 80, y: 148 }, { x: 150, y: 150 }])];
board.reanalyzeAll();
const s4 = board.strokes[0];
console.log('边界→悬空 → issues =', s4.issues.length, '(期望 1：仅悬空端标记)');

// 5) 强制闭合
board.strokes = [mk([{ x: 100, y: 100 }, { x: 200, y: 120 }, { x: 300, y: 100 }])];
board.reanalyzeAll();
const n = board.forceCloseAll();
const s5 = board.strokes[0];
console.log('强制闭合 → 修复', n, '条，closed =', s5.closed, '(期望 true)');

// 6) 挡位切换吸附
board.strokes = [{ id: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], elevation: 230, closed: true, issues: [] }];
board.setIntervalValue(50);
console.log('230 吸附 50 →', board.strokes[0].elevation, '(期望 250)');
board.setIntervalValue(100);
console.log('再吸附 100 →', board.strokes[0].elevation, '(期望 300：250/100=2.5 四舍五入)');
board.strokes[0].elevation = 230;
board.setIntervalValue(50);
console.log('230 吸附 50 →', board.strokes[0].elevation, '(期望 250)');
