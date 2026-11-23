// Stroke bench page: one row per bench stroke, the CPU sheet and the WebGPU sheet side by side, and a PNG of the sheet
// with its labels.
import { BENCH_STROKES, CELL_SIZES_MM, SPEEDS } from '../media/stroke-bench.js';
import { BENCH_PAPERS } from '../media/stroke-bench.js';

const query = new URLSearchParams(location.search);
const cellSelect = document.getElementById('cell'), runButton = document.getElementById('run'), exportButton = document.getElementById('export'), state = document.getElementById('state'), rows = document.getElementById('rows');
for (const mm of CELL_SIZES_MM) cellSelect.add(new Option(`${mm} mm`, mm));
cellSelect.value = CELL_SIZES_MM.includes(+query.get('cell')) ? query.get('cell') : '0.25';
const backends = query.get('backend') === 'cpu' ? ['cpu'] : ['cpu', 'gpu'];

const label = s => [s.tool, `load ${s.load}`, `pressure ${s.pressure}`, `speed ${s.speed}`, BENCH_PAPERS[s.paper].name];
const cells = new Map();
for (const s of BENCH_STROKES) {
  const tr = rows.insertRow();
  const th = document.createElement('th'); th.scope = 'row'; th.innerHTML = `<b></b><span></span>`; th.querySelector('b').textContent = s.title; th.querySelector('span').textContent = label(s).join(' · '); tr.append(th);
  for (const backend of ['cpu', 'gpu']) {
    const td = tr.insertCell(), canvas = document.createElement('canvas'), note = document.createElement('small');
    canvas.width = 1; canvas.height = 1; td.append(canvas, note); cells.set(`${s.id} ${backend}`, { canvas, note });
  }
}

const worker = new Worker(new URL('./bench-worker.js', import.meta.url), { type: 'module' });
let started = 0, gpuName = '';
worker.onmessage = ({ data }) => {
  if (data.type === 'caps') {
    gpuName = data.gpu ? data.gpuName : '';
    document.getElementById('gpu-head').textContent = data.gpu ? 'WebGPU' : 'WebGPU (none)';
    if (!data.gpu && backends.includes('gpu')) for (const s of BENCH_STROKES) cells.get(`${s.id} gpu`).note.textContent = data.gpuError || 'No WebGPU';
  } else if (data.type === 'stroke') {
    const { canvas, note } = cells.get(`${data.id} ${data.backend}`);
    if (data.error) { note.textContent = data.error; return; }
    canvas.width = data.w; canvas.height = data.h;
    canvas.getContext('2d').putImageData(new ImageData(data.rgba, data.w, data.h), 0, 0);
    note.textContent = `${data.w} × ${data.h} · ${(data.ms / 1000).toFixed(1)} s`;
    state.textContent = `${data.id} ${data.backend}`;
  } else if (data.type === 'done') {
    state.textContent = `Done in ${((performance.now() - started) / 1000).toFixed(0)} s`;
    document.body.dataset.state = 'done'; exportButton.disabled = false;
  }
};
worker.onerror = e => { state.textContent = `Worker error: ${e.message}`; document.body.dataset.state = 'error'; };

function start() {
  for (const { canvas, note } of cells.values()) { canvas.width = 1; canvas.height = 1; note.textContent = ''; }
  started = performance.now(); document.body.dataset.state = 'running'; exportButton.disabled = true; state.textContent = 'Painting';
  worker.postMessage({ type: 'run', mmPerCell: +cellSelect.value, backends });
}
runButton.onclick = start;
cellSelect.onchange = start;

// The sheet as one PNG: a column of labels, then the CPU and WebGPU strokes at 4 px a millimetre.
exportButton.onclick = () => {
  const PX = 4, LABEL = 330, GAP = 12, mm = +cellSelect.value, scale = PX * mm;
  const sizes = BENCH_STROKES.map(s => cells.get(`${s.id} cpu`).canvas).map(c => ({ w: c.width * scale, h: c.height * scale }));
  const colW = Math.max(...sizes.map(z => z.w)), H = 60 + sizes.reduce((a, z) => a + z.h + GAP, 0);
  const out = document.createElement('canvas'); out.width = LABEL + 2 * (colW + GAP); out.height = H;
  const c = out.getContext('2d'); c.fillStyle = '#f6f3eb'; c.fillRect(0, 0, out.width, out.height); c.fillStyle = '#39362f';
  c.font = '600 18px Georgia, serif'; c.fillText(`Paint Lab stroke bench · 0.4.0-rc.2 · cell ${mm} mm`, 12, 26);
  c.font = '15px Georgia, serif'; c.fillText('CPU', LABEL, 50); c.fillText(gpuName ? `WebGPU (${gpuName})` : 'WebGPU (none)', LABEL + colW + GAP, 50);
  let y = 60;
  BENCH_STROKES.forEach((s, i) => {
    c.font = '600 14px Georgia, serif'; c.fillText(s.title, 12, y + 18);
    c.font = '12px Georgia, serif'; label(s).forEach((t, j) => c.fillText(t, 12, y + 36 + j * 15));
    ['cpu', 'gpu'].forEach((b, k) => { const src = cells.get(`${s.id} ${b}`).canvas; if (src.width > 1) { c.imageSmoothingEnabled = true; c.drawImage(src, LABEL + k * (colW + GAP), y, src.width * scale, src.height * scale); } });
    y += Math.max(sizes[i].h, 100) + GAP;
  });
  out.toBlob(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `stroke-bench-${mm}mm.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }, 'image/png');
};
document.getElementById('speeds').textContent = Object.entries(SPEEDS).map(([k, v]) => `${k}: ${v} flow steps per mm`).join(' · ');
start();
