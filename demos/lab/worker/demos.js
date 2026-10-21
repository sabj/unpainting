// The lab's demonstrations: canonical strokes laid over time, one per swatch in Figure 1 of Computer-Generated Watercolor and for the pen.
// Positions are fractions of the sheet (units of 1/320 of its shorter side); brush and nib sizes are physical (millimetres),
// so the same demonstration on a sheet of another resolution is the same strokes made with the same brushes.
const UNIT_MM = (6 * 25.4) / 320; // a demo unit is 1/320 of a six-inch sheet: the brush sizes below are radii in these units
const dia = units => 2 * units * UNIT_MM;
const band = (x0, y0, x1, y1, n = 60, bow = 8, p = 1) => Array.from({ length: n + 1 }, (_, j) => { const u = j / n, nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny); return { x: x0 + (x1 - x0) * u + (nx / L) * bow * Math.sin(Math.PI * u), y: y0 + (y1 - y0) * u + (ny / L) * bow * Math.sin(Math.PI * u), p }; });

/** Play one demonstration through `api` ({ W, H, begin, move, end, pauseFor, alive, dryAll, caption = () => {} }). Resolves to whether it ran to the end. */
export async function playDemo(name, { W, H, begin, move, end, pauseFor, alive, dryAll, caption = () => {} }) {
  const S = Math.min(W, H) / 320, cx = W / 2, cy = H / 2;
  const P = (x, y) => ({ x: cx + x * S, y: cy + y * S });
  const lay = async (t, path, perTick = 4) => { if (!alive()) return; await begin(path[0], t); for (let j = 1; j < path.length; j++) { if (!alive()) return; await move(path[j]); if (j % perTick === 0) await pauseFor(16); } await end(); };
  const B = (a, b, n, bow) => band(P(...a).x, P(...a).y, P(...b).x, P(...b).y, n, bow);
  const captions = { 'dry-brush': 'Dry brush on dry paper', wash: 'First wash on dry paper', glaze: 'First wash on dry paper', 'wet-in-wet': 'Wet the paper with clean water', backrun: 'First wash on dry paper', pen: 'Vary pressure along the pen stroke' };
  caption(captions[name] ?? 'Painting');
  if (name === 'dry-brush') await lay({ tool: 'flat', sizeMm: dia(30), water: 0.4, pigment: 'rose', amount: 0.3 }, B([-85, 120], [85, -110], 110, 22));
  if (name === 'wash') await lay({ tool: 'flat', sizeMm: dia(30), water: 1, pigment: 'rose', amount: 0.2 }, B([-90, 115], [85, -105], 90, 16));
  if (name === 'glaze') for (const [pg, a, b] of [['hansa', [-60, 130], [70, -130]], ['cerulean', [-10, 140], [40, -140]], ['rose', [-100, 20], [110, -10]]]) { caption(pg === 'hansa' ? 'First wash on dry paper' : 'Glaze on dry paper'); await lay({ tool: 'flat', sizeMm: dia(22), water: 1, pigment: pg, amount: 0.3 }, B(a, b, 70, 6)); caption('Let it dry'); await dryAll(); }
  if (name === 'wet-in-wet') { for (let r = 0; r < 4; r++) await lay({ tool: 'water', sizeMm: dia(30), water: 1.3 }, B([-100, -80 + r * 55], [100, -75 + r * 55], 40, 0), 8); caption('Add color, wet in wet'); for (let q = 0; q < 5; q++) await lay({ tool: 'round', sizeMm: dia(12), water: 1.4, pigment: 'rose', amount: 0.9 }, B([-30, -20 + q * 10], [30, q * 10], 12, 0)); }
  if (name === 'backrun') { await lay({ tool: 'flat', sizeMm: dia(26), water: 1, pigment: 'ultramarine', amount: 0.35 }, B([-80, 125], [75, -115], 80, 4)); caption('Let the first wash settle'); await pauseFor(2500); caption('Add clean water to the damp wash'); await lay({ tool: 'water', sizeMm: dia(20), water: 1.4 }, B([-75, 110], [-35, 65], 20, 0)); }
  if (name === 'pen') { const path = []; for (let j = 0; j <= 240; j++) { const u = j / 240; path.push({ x: P(-130 + 260 * u, 0).x, y: P(0, 60 * Math.sin(u * 7)).y, p: 0.3 + 0.5 * Math.max(0, Math.sin(u * 9)), v: 0.6 + 1.5 * (0.5 + 0.5 * Math.sin(u * 11)) }); } await lay({ tool: 'pen', sizeMm: dia(2), amount: 0.6 }, path, 3); }
  // Two tiny, real instrument plans: change the order of ink, water and drying,
  // then hand back the actual sheet. No pre-rendered result or drawn-on blur.
  if (name === 'ink-wash' || name === 'wash-ink') {
    const line = async points => {
      const path = [];
      for (let i = 1; i < points.length; i++) {
        const a = P(...points[i-1]), b = P(...points[i]);
        const n = Math.max(2, Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/(4*S)));
        for (let j = 0; j <= n; j++) path.push({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n,p:.24+.12*Math.sin(j/n*Math.PI),v:1.5});
      }
      await lay({tool:'pen',sizeMm:1.1,amount:.2},path,6);
    };
    const draw = async () => {
      await line([[-5,95],[0,42],[3,-18],[12,-83]]);
      await line([[0,43],[-55,11],[-43,-37],[3,-18]]);
      await line([[3,-18],[54,-32],[47,-70],[12,-83]]);
    };
    const wash = async () => {
      await lay({tool:'round',sizeMm:18,water:2,pigment:'hansa',amount:.24},B([-37,-17],[-5,28],22,5),6);
      await lay({tool:'round',sizeMm:14,water:2,pigment:'ultramarine',amount:.22},B([12,-60],[37,-41],16,3),6);
    };
    if (name === 'ink-wash') {
      caption('Plan: draw loose leaves, then pull fresh ink with water');
      await draw();
      caption('Clean water crosses one ink edge');
      await lay({tool:'water',sizeMm:16,water:2},B([-52,-27],[-20,17],20,3),6);
      caption('Charge the wet leaf with color');
      await wash();
    } else {
      caption('Plan: connected leaf washes, dry, then add crisp ink');
      await wash();
      caption('Dry the wash before drawing');
      await dryAll();
      caption('Draw the stem and selected leaf edges on dry paper');
      await draw();
    }
  }
  return alive();
}
