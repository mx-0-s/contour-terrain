window.addEventListener('error', (e) => {
    const msg = e.message || '未知错误';
    const errDiv = document.getElementById('errorOverlay');
    if (errDiv) {
        errDiv.style.display = 'block';
        errDiv.textContent = '加载错误: ' + msg + '\n\n提示: 请使用 start.bat 启动本地服务器访问，不要直接双击打开 index.html';
    }
});

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DrawingBoard } from './drawing.js';
import { computeHeightField, elevationColor } from './heightfield.js';
import { renderFieldView } from './fieldview.js';

const state = {
    interval: 50,
    area: 25,
    wireframe: false,
    showGrid: true,
};

function areaSideKm() { return Math.sqrt(state.area); }

const statusText = document.getElementById('statusText');
function setStatus(t) { statusText.textContent = t; }
const themeToggle = document.getElementById('themeToggle');

const drawCanvas = document.getElementById('drawCanvas');
const fieldCanvas = document.getElementById('fieldCanvas');
const algoSel = document.getElementById('algo');
const resolutionSel = document.getElementById('resolution');
const iterationsVal = document.getElementById('iterationsValue');

const canvas = document.getElementById('glCanvas');
const viewport = document.querySelector('.viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeaf3f9);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
camera.position.set(7, 5, 7);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

scene.add(new THREE.AmbientLight(0xffffff, 0.65));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(6, 10, 7);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0x8bbbd8, 0.35);
dirLight2.position.set(-6, -3, -6);
scene.add(dirLight2);

const baseGroup = new THREE.Group();
scene.add(baseGroup);
let terrainMesh = null;
let currentField = null;
let genTimer = null;

function rebuildBase() {
    while (baseGroup.children.length) {
        const c = baseGroup.children.pop();
        c.geometry?.dispose();
        c.material?.dispose();
    }
    const side = areaSideKm();
    const dark = document.documentElement.dataset.theme === 'dark';
    const grid = new THREE.GridHelper(
        side,
        10,
        dark ? 0x637c6e : 0x79a9c5,
        dark ? 0x35413b : 0xc3d8e5,
    );
    grid.material.transparent = true;
    grid.material.opacity = 0.6;
    grid.visible = state.showGrid;
    grid.userData.isGrid = true;
    baseGroup.add(grid);

    const plate = new THREE.Mesh(
        new THREE.BoxGeometry(side, 0.15, side),
        new THREE.MeshStandardMaterial({
            color: dark ? 0x252e2a : 0xd3e5ef,
            roughness: 0.9,
        })
    );
    plate.position.y = -0.078;
    baseGroup.add(plate);
}

function setTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    themeToggle.textContent = dark ? '☀ 浅色' : '☾ 深色';
    themeToggle.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
    themeToggle.title = dark ? '切换到浅色模式' : '切换到深色模式';
    themeToggle.setAttribute('aria-pressed', String(dark));
    scene.background.set(dark ? 0x151a18 : 0xeaf3f9);
    localStorage.setItem('contour-terrain-theme', dark ? 'dark' : 'light');
    rebuildBase();
}

function buildTerrain(field) {
    disposeTerrain();
    if (!field) return;

    const N = field.N;
    const side = areaSideKm();
    const span = field.max - field.min || 1;
    const seg = N - 1;

    const geo = new THREE.PlaneGeometry(side, side, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const gx = ((x + side / 2) / side) * (N - 1);
        const gz = ((z + side / 2) / side) * (N - 1);
        const h = sampleBilinear(field.data, N, gx, gz);
        const t = (h - field.min) / span;
        pos.setY(i, (h - field.min) / 1000);
        const [r, g, b] = elevationColor(t);
        colors[i * 3] = r / 255;
        colors[i * 3 + 1] = g / 255;
        colors[i * 3 + 2] = b / 255;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.0,
        wireframe: state.wireframe,
        flatShading: false,
    });
    terrainMesh = new THREE.Mesh(geo, mat);
    scene.add(terrainMesh);

}

function sampleBilinear(data, N, gx, gz) {
    gx = Math.max(0, Math.min(N - 1, gx));
    gz = Math.max(0, Math.min(N - 1, gz));
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const x1 = Math.min(N - 1, x0 + 1), z1 = Math.min(N - 1, z0 + 1);
    const fx = gx - x0, fz = gz - z0;
    const v00 = data[z0 * N + x0], v10 = data[z0 * N + x1];
    const v01 = data[z1 * N + x0], v11 = data[z1 * N + x1];
    return (v00 * (1 - fx) + v10 * fx) * (1 - fz) + (v01 * (1 - fx) + v11 * fx) * fz;
}

function resizeRenderer() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

function disposeTerrain() {
    if (terrainMesh) {
        scene.remove(terrainMesh);
        terrainMesh.geometry.dispose();
        terrainMesh.material.dispose();
        terrainMesh = null;
    }
}

function scheduleGenerate(immediate = false) {
    clearTimeout(genTimer);
    if (immediate) { generate(); return; }
    genTimer = setTimeout(generate, 300);
}

function generate() {
    const strokes = board.strokes;
    const withElev = strokes.filter(s => s.elevation !== null);
    if (!withElev.length) {
        currentField = null;
        disposeTerrain();
        updateFieldPreview();
        setStatus('尚无带高程的等高线');
        return;
    }
    setStatus('计算高度场…');
    requestAnimationFrame(() => setTimeout(() => {
        const rect = drawCanvas.getBoundingClientRect();
        currentField = computeHeightField(withElev, {
            N: parseInt(resolutionSel.value, 10),
            mode: algoSel.value,
            iterations: parseInt(iterationsVal.textContent, 10),
            penWidth: board.penWidth,
            cssW: rect.width,
            cssH: rect.height,
        });
        updateFieldPreview();
        buildTerrain(currentField);
        const warnN = board.unclosed.length;
        setStatus(`完成：${withElev.length} 条等高线` +
                  (currentField ? ` · 高度场 ${currentField.N}×${currentField.N}` : '') +
                  (warnN ? ` · ⚠ ${warnN} 条未闭合` : ''));
    }, 0));
}

function updateFieldPreview() {
    const rect = fieldCanvas.getBoundingClientRect();
    renderFieldView(fieldCanvas, currentField, {
        cssW: rect.width, cssH: rect.height,
    });
    const fr = document.getElementById('fieldRange');
    fr.textContent = currentField ? `${currentField.min} ~ ${currentField.max} m` : '';
}

function rebuildAllOnResize() {
    board.resize();
    updateFieldPreview();
    resizeRenderer();
}

const board = new DrawingBoard(drawCanvas, {
    onStrokesChanged(strokes) {
        updateWarningList(strokes);
        scheduleGenerate();
    },
    onElevationPrompt(stroke, suggested, commit) {
        openElevDialog(suggested, commit);
    },
    onSelect(s) {
        const editor = document.getElementById('selEditor');
        const hint = document.getElementById('selSection');
        if (s) {
            editor.hidden = false;
            hint.hidden = true;
            document.getElementById('selElevation').value = s.elevation;
            document.getElementById('selElevation').step = state.interval;
        } else {
            editor.hidden = true;
            hint.hidden = false;
        }
    },
});

const elevDialog = document.getElementById('elevDialog');
const elevInput = document.getElementById('elevInput');
const elevHint = document.getElementById('elevHint');
let elevCommit = null;

function openElevDialog(suggested, commit) {
    elevCommit = commit;
    elevHint.textContent = `等高距 ${state.interval} m：输入值将吸附为 ${state.interval} 的整数倍。输入 0 或负数可作谷地/基准。`;
    elevInput.step = state.interval;
    elevInput.value = suggested;
    elevDialog.hidden = false;
    elevInput.focus();
    elevInput.select();
}

function closeElevDialog(accepted) {
    const commit = elevCommit;
    elevCommit = null;
    elevDialog.hidden = true;
    if (!commit) return;
    if (accepted) {
        const v = parseFloat(elevInput.value);
        commit(isNaN(v) ? null : v);
    } else {
        commit(null);
    }
    scheduleGenerate();
}

document.getElementById('elevConfirm').addEventListener('click', () => closeElevDialog(true));
document.getElementById('elevCancel').addEventListener('click', () => closeElevDialog(false));
elevInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') closeElevDialog(true);
    if (e.key === 'Escape') closeElevDialog(false);
});

function updateWarningList(strokes) {
    const ul = document.getElementById('warningList');
    ul.innerHTML = '';
    if (!strokes.length) {
        const li = document.createElement('li');
        li.className = 'ok';
        li.textContent = '暂无线条';
        ul.appendChild(li);
        return;
    }
    strokes.forEach((s, i) => {
        const li = document.createElement('li');
        if (s.closed || !s.issues.length) {
            li.className = 'ok';
            li.textContent = `第 ${i + 1} 条：闭合 ✓（${s.elevation} m）`;
        } else {
            li.textContent = `第 ${i + 1} 条：${s.issues.length} 个未闭合端点（${s.elevation} m）`;
        }
        li.title = '点击定位到该线';
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => board.select(s));
        ul.appendChild(li);
    });
}

document.getElementById('intervalGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-interval]');
    if (!btn) return;
    document.querySelectorAll('#intervalGroup .mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.interval = parseInt(btn.dataset.interval, 10);
    board.setIntervalValue(state.interval);
    updateWarningList(board.strokes);
    scheduleGenerate(true);
    setStatus(`等高距已切换为 ${state.interval} m，高程已重新吸附`);
});

document.getElementById('areaGroup').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-area]');
    if (!btn) return;
    document.querySelectorAll('#areaGroup .mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.area = parseInt(btn.dataset.area, 10);
    rebuildBase();
    setStatus(`地图范围切换为 ${state.area} km²（${areaSideKm()}×${areaSideKm()} km）`);
});

const penWidthInput = document.getElementById('penWidth');
penWidthInput.addEventListener('input', () => {
    document.getElementById('penWidthValue').textContent = penWidthInput.value;
    board.setPenWidth(parseInt(penWidthInput.value, 10));
});
document.getElementById('btnUndo').addEventListener('click', () => board.undo());
document.getElementById('btnClear').addEventListener('click', () => {
    board.clear();
    currentField = null;
    disposeTerrain();
    updateFieldPreview();
    setStatus('已清空');
});
document.getElementById('btnForceClose').addEventListener('click', () => {
    const n = board.forceCloseAll();
    setStatus(n ? `已强制闭合 ${n} 条线` : '没有需要闭合的线');
    updateWarningList(board.strokes);
    scheduleGenerate(true);
});

document.getElementById('selApply').addEventListener('click', () => {
    const s = board.selected;
    if (!s) return;
    const v = parseFloat(document.getElementById('selElevation').value);
    if (isNaN(v)) return;
    s.elevation = Math.round(v / state.interval) * state.interval;
    document.getElementById('selElevation').value = s.elevation;
    board.reanalyzeAll();
    board.render();
    updateWarningList(board.strokes);
    scheduleGenerate(true);
    setStatus(`高程已更新为 ${s.elevation} m`);
});
document.getElementById('selDelete').addEventListener('click', () => {
    board.deleteSelected();
    scheduleGenerate(true);
});

algoSel.addEventListener('change', () => scheduleGenerate(true));
resolutionSel.addEventListener('change', () => scheduleGenerate(true));
const iterationsInput = document.getElementById('iterations');
iterationsInput.addEventListener('input', () => {
    iterationsVal.textContent = iterationsInput.value;
});
iterationsInput.addEventListener('change', () => scheduleGenerate(true));
document.getElementById('btnGenerate').addEventListener('click', () => scheduleGenerate(true));

document.getElementById('wireframe').addEventListener('change', (e) => {
    state.wireframe = e.target.checked;
    if (terrainMesh) terrainMesh.material.wireframe = state.wireframe;
});
document.getElementById('showGrid').addEventListener('change', (e) => {
    state.showGrid = e.target.checked;
    baseGroup.children.forEach(c => { if (c.userData.isGrid) c.visible = state.showGrid; });
});

themeToggle.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
setTheme(localStorage.getItem('contour-terrain-theme') === 'dark' ? 'dark' : 'light');
updateWarningList([]);
window.addEventListener('resize', () => {
    clearTimeout(genTimer);
    genTimer = setTimeout(rebuildAllOnResize, 150);
});
requestAnimationFrame(() => {
    rebuildAllOnResize();
    setStatus('就绪：在左上绘图区手绘等高线');
});

function tick() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}
resizeRenderer();
tick();
