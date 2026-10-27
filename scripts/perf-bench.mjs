// Headless perf bench (plan decision 6; critique "Perf gates"). Not part of npm test: it needs a running dev server,
// Chrome and a GPU, and its numbers move with machine load.
//   node scripts/perf-bench.mjs [url] [--label=name] [--gate] [--runs=default,high] [--quality=gpu|auto|high|medium|low]
//        [--scenes=spawn,overview,drive,night] [--seconds=10] [--out=dir] [--ports=9470,9471] [--profile=dir]
//        [--chrome=path] [--no-shots] [--no-freeze] [--note=text]
// Two runs, one Chrome each: the default GPU (headless Chrome picks the integrated one) and --force_high_performance_gpu.
// Each names its GPU (WEBGL_debug_renderer_info). --quality=gpu (default) uses Low on an integrated GPU and High on a
// discrete one, which is what the gates are stated for. Scenes, each measured for --seconds after settling:
//   spawn     idle where a solo game starts, 10:00
//   overview  the camera 420 m out over the whole map
//   drive     the sport bike (bought in the bike shop) held at full throttle along the riverside road, about 25 m/s
//   night     downtown plaza at 21:00
//   district  on foot at 19:00 in a street of the newest wired P1 slice (--district=<slice key> picks another), the
//             default camera (skipped when nothing is wired)
//   ddrive    the sport bike at full throttle along a long street of that slice (Bến Vân Đồn, Điện Biên Phủ, Võ Văn
//             Kiệt, Trần Hưng Đạo, Vòng Cung)
// Two more, only when --scenes names them (night plan §10.3): the heaviest night light, and the lamps on the road.
//   nightdistrict  on foot in Bùi Viện at 21:30: festoons, neon, signs, open fronts, the crowd and the light pools
//   nightdrive     the drive at 21:00: head-lamp beams, tail lamps and lamp pools streaming past (gated like drive)
// With districts wired, the frames from the start of a solo game until every district tile is built are recorded too
// ("build": max frame, frames over 50 ms), and --gate checks no frame over 50 ms there and draw calls <= 250 (median,
// every scene).
// Per scene: in-page fps from requestAnimationFrame deltas, p50/p95/p99/max frame time, draw calls and triangles
// (renderer.info.render, median), JS heap. Per run: textures referenced by the scene (count, estimated MB with
// mips, sign/plate textures separately), render targets, page-load long tasks. Writes <out>/<label>.json and a
// screenshot per scene, prints a table. --gate checks: discrete GPU >= 120 fps, Intel at Low >= 38 fps (every
// scene), p95 <= 33 ms while driving, sign textures <= 10 MB; exits 1 when one fails.
// The page's Vite HMR socket is stubbed (--no-freeze keeps it) so edits landing during a run cannot reload it.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const URL_ARG = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5174/';
const LABEL = String(flag('label', `bench-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`));
const GATE = flag('gate', false) === true;
const RUNS = String(flag('runs', 'default,high')).split(',');
const QUALITY = String(flag('quality', 'gpu'));
const SCENES = String(flag('scenes', 'spawn,overview,drive,night,district,ddrive')).split(',');
const SECONDS = Number(flag('seconds', 10));
const OUT = String(flag('out', process.env.PVO_BENCH_OUT ?? (existsSync('E:/pvo-work') ? 'E:/pvo-work/engine/bench' : join(tmpdir(), 'pvo-bench'))));
const PORTS = String(flag('ports', '9470,9471')).split(',').map(Number);
const PROFILE = String(flag('profile', process.env.PVO_BENCH_PROFILE ?? (existsSync('E:/') ? 'E:/pvo-chrome-eng-tests' : join(tmpdir(), 'pvo-bench-chrome'))));
const CHROME = String(flag('chrome', process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'));
const SHOTS = !flag('no-shots', false);
const FREEZE = !flag('no-freeze', false);
const NOTE = flag('note', '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATES = { discreteFps: 120, intelLowFps: 38, driveP95: 33, signMB: 10, buildMax: 50, calls: 250 };
const DISTRICT = flag('district', '');
/**
 * Per P1 slice: a street to stand in at 19:00 (x, z, the player's facing; the camera sits behind) and a straight run
 * to ride (x, z, heading). Bùi Viện's stand (also the nightdistrict scene) is in the walking street looking west along
 * it, Thủ Thiêm's on Trần Bạch Đằng's east sidewalk looking north (they stood in a Phạm Ngũ Lão block and on a lawn).
 */
const DISTRICT_SPOTS = {
  'quan-4': { name: 'Vĩnh Khánh', stand: [535, 6, -2.4], ride: [446.5, -95, 0] },
  'binh-thanh': { name: 'Hàng Xanh', stand: [-390, 12, 2.2], ride: [-235, -5.5, -Math.PI / 2] },
  'quan-3': { name: 'Võ Thị Sáu', stand: [-120, 168, 1.2], ride: [-370, 430.5, Math.PI / 2] },
  'quan-1-south': { name: 'Bùi Viện', stand: [340, 250, -Math.PI / 2], ride: [-100, 390.5, Math.PI / 2] },
  'thu-thiem': { name: 'Thủ Thiêm', stand: [-145.5, -388, 0], ride: [-400, -314.5, Math.PI / 2] },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Chrome over CDP ----
async function launch(run, port) {
  const profile = `${PROFILE}-${run}`;
  rmSync(profile, { recursive: true, force: true });
  const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1366,768',
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', ...(run === 'high' ? ['--force_high_performance_gpu'] : []), 'about:blank'];
  // (Chrome's temporary files go to PVO_TEMP, or E:/pvo-tmp on the shared bench machine, whose disk C: is nearly full.)
  const temp = process.env.PVO_TEMP ?? (existsSync('E:/pvo-tmp') ? 'E:/pvo-tmp' : null);
  const chrome = spawn(CHROME, flags, { stdio: 'ignore', env: temp ? { ...process.env, TEMP: temp, TMP: temp } : process.env });
  let spawnError = null;
  chrome.on('error', (e) => { spawnError = e; });
  let target;
  for (let i = 0; i < 100 && !target && !spawnError; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
    if (!target) await sleep(200);
  }
  if (!target) { chrome.kill(); throw new Error(spawnError ? `cannot start ${CHROME}: ${spawnError.message}` : `Chrome did not open its debugging port ${port}`); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0;
  const pending = new Map(), listeners = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) for (const l of listeners) l(m);
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`.slice(0, 400));
    return r.result?.value;
  };
  const key = (type, k, code, vk) => send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk });
  const exited = new Promise((r) => chrome.once('exit', r));
  const close = async () => {
    await Promise.race([send('Browser.close').catch(() => {}), sleep(3000)]);
    try { ws.close(); } catch { /* gone */ }
    await Promise.race([exited, sleep(5000)]);
    chrome.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { console.log(`could not delete ${profile}: ${e.message}`); }
  };
  return { send, evaluate, key, close, on: (fn) => listeners.push(fn), flags };
}

// ---- In-page helpers, installed before the app's scripts ----
const BOOT = (quality, freeze) => `
try { ${quality ? `localStorage.setItem('pvo-quality', ${JSON.stringify(quality)});` : ''} } catch {}
window.__bench = { longTasks: [], readyAt: 0 };
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __bench.longTasks.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch {}
${freeze ? `{
  const Native = window.WebSocket;
  window.WebSocket = new Proxy(Native, { construct(target, a) {
    const p = a[1];
    if (p === 'vite-hmr' || p === 'vite-ping' || (Array.isArray(p) && p.includes('vite-hmr'))) {
      return { readyState: 0, CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, addEventListener() {}, removeEventListener() {}, send() {}, close() {} };
    }
    return Reflect.construct(target, a);
  } });
}` : ''}`;
const MEASURE = (ms) => `new Promise((resolve) => {
  const pvo = window.__pvo, render = pvo.renderer.info.render;
  const dt = [], calls = [], tris = [], track = [];
  let start = 0, last = 0, lastTrack = -1e9;
  const step = (t) => {
    if (!start) { start = last = t; requestAnimationFrame(step); return; }
    dt.push(t - last); last = t;
    calls.push(render.calls); tris.push(render.triangles);
    if (t - lastTrack > 100) { const p = pvo.info(); track.push([t - start, p.x, p.z]); lastTrack = t; }
    if (t - start < ${ms}) requestAnimationFrame(step); else resolve({ dt, calls, tris, track, elapsed: t - start });
  };
  requestAnimationFrame(step);
})`;
const GPU_NAME = `(() => { const gl = window.__pvo ? __pvo.renderer.getContext() : document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'no webgl'; const x = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); })()`;
// Textures referenced by any material in the scene (hidden objects too), with an estimate of their GPU size. Uniforms
// added in onBeforeCompile live only in the compiled program, so renderer.properties' copy is walked as well.
const TEXTURES = `(() => {
  const { scene, renderer } = window.__pvo;
  const channels = { 1021: 1, 1023: 4, 1024: 1, 1025: 2, 1026: 4, 1027: 4, 1028: 1, 1029: 1, 1030: 2, 1031: 2, 1033: 4 };
  const bytes = { 1009: 1, 1010: 1, 1011: 2, 1012: 2, 1013: 4, 1014: 4, 1015: 4, 1016: 2, 1020: 4 };
  const found = new Map();
  const visit = (t, m, o) => { if (t && t.isTexture && !found.has(t)) found.set(t, { m, o }); };
  scene.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m) continue;
      for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture) visit(v, m, o); }
      for (const uniforms of [m.uniforms, renderer.properties.get(m).uniforms]) {
        if (uniforms) for (const u of Object.values(uniforms)) for (const v of [u && u.value].flat()) visit(v, m, o);
      }
    }
  });
  visit(scene.background, null, null); visit(scene.environment, null, null);
  const list = [];
  for (const [t, { m, o }] of found) {
    if (t.isRenderTargetTexture) continue;
    const img = Array.isArray(t.image) ? t.image[0] : t.image;
    const w = img?.width ?? img?.videoWidth ?? 0, h = img?.height ?? img?.videoHeight ?? 0, d = img?.depth ?? 1;
    const faces = Array.isArray(t.image) ? t.image.length : 1;
    const mips = t.generateMipmaps && t.minFilter >= 1004 && t.minFilter !== 1006 ? 1.33 : 1;
    const mb = (w * h * d * faces * (channels[t.format] ?? 4) * (bytes[t.type] ?? 1) * mips) / 1048576;
    // Signs and number plates: a texture or mesh named for them (map/signs.ts: 'Sign glyphs'), or (the canvas atlases
    // of the original world.ts) a canvas used as both map and emissiveMap.
    const sign = /sign|glyph|plate|atlas/i.test(t.name) || /sign|glyph|plate/i.test(o?.name ?? '')
      || (!!m && m.map === t && m.emissiveMap === t && !!img && typeof img.getContext === 'function');
    const props = renderer.properties.get(t);
    list.push({ name: t.name || (o?.name ? o.name + ' ' : '') + t.constructor.name, w, h, mb, sign, uploaded: !!props.__webglTexture });
  }
  const targets = [];
  scene.traverse((o) => { const rt = o.isLight && o.shadow && o.shadow.map; if (rt) targets.push({ name: 'shadow ' + o.type, mb: rt.width * rt.height * (4 + (rt.depthBuffer ? 4 : 0)) / 1048576 }); });
  const gl = renderer.getContext(), c = renderer.domElement, aa = gl.getContextAttributes().antialias ? 4 : 1;
  targets.push({ name: 'drawing buffer', mb: c.width * c.height * 8 * aa / 1048576 });
  const sum = (l) => Math.round(l.reduce((s, x) => s + x.mb, 0) * 10) / 10;
  const up = list.filter((t) => t.uploaded);
  return {
    count: list.length, uploaded: up.length, gpuTextures: renderer.info.memory.textures,
    mb: sum(list), uploadedMB: sum(up), signs: list.filter((t) => t.sign).length, signMB: sum(list.filter((t) => t.sign)),
    renderTargetMB: sum(targets), targets: targets.map((t) => ({ ...t, mb: Math.round(t.mb * 10) / 10 })),
    largest: list.sort((a, b) => b.mb - a.mb).slice(0, 8).map((t) => ({ ...t, mb: Math.round(t.mb * 10) / 10 })),
  };
})()`;

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const r1 = (v) => Math.round(v * 10) / 10;
function summarise(m) {
  const sorted = [...m.dt].sort((a, b) => a - b);
  const median = (l) => [...l].sort((a, b) => a - b)[l.length >> 1] ?? 0;
  let path = 0;
  for (let i = 1; i < m.track.length; i++) path += Math.hypot(m.track[i][1] - m.track[i - 1][1], m.track[i][2] - m.track[i - 1][2]);
  const span = m.track.length > 1 ? (m.track.at(-1)[0] - m.track[0][0]) / 1000 : 0;
  return {
    fps: r1(m.dt.length / (m.elapsed / 1000)), frames: m.dt.length, seconds: r1(m.elapsed / 1000),
    p50: r1(pct(sorted, 0.5)), p95: r1(pct(sorted, 0.95)), p99: r1(pct(sorted, 0.99)), max: r1(sorted.at(-1) ?? 0),
    over33: m.dt.filter((d) => d > 33).length, over50: m.dt.filter((d) => d > 50).length,
    calls: median(m.calls), triangles: median(m.tris),
    speed: span > 0 ? r1(path / span) : 0, from: m.track[0]?.slice(1).map(r1), to: m.track.at(-1)?.slice(1).map(r1),
  };
}
function cpuBusy(before) {
  const now = cpus().map((c) => c.times);
  let idle = 0, total = 0;
  now.forEach((t, i) => {
    const b = before[i];
    for (const k of Object.keys(t)) total += t[k] - b[k];
    idle += t.idle - b.idle;
  });
  return total ? Math.round((1 - idle / total) * 100) : 0;
}
const integrated = (gpu) => /intel|uhd|iris|radeon\(tm\) graphics|vega \d+ graphics|apple m\d(?! (pro|max|ultra))/i.test(gpu) && !/nvidia|geforce|rtx|gtx|radeon rx|radeon pro/i.test(gpu);

async function runOne(run, port) {
  const cpu0 = cpus().map((c) => c.times);
  let page;
  try { page = await launch(run, port); } catch (e) {
    console.log(`  ${run}: FAILED ${e.message}`);
    return { run, port, failed: e.message, scenes: {}, errors: [], warnings: [] };
  }
  // The dev server may be serving a checkout that others are editing, so the code state is taken per run.
  const result = { run, port, code: codeState(), flags: page.flags.filter((f) => !f.startsWith('--user-data-dir') && f !== 'about:blank'), scenes: {}, errors: [], warnings: [] };
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') result.errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') result.errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  });
  try {
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    const probe = await page.evaluate(GPU_NAME);
    const quality = QUALITY === 'gpu' ? (integrated(probe) ? 'low' : 'high') : QUALITY;
    result.quality = quality;
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT(quality, FREEZE) });
    const t0 = Date.now();
    await page.send('Page.navigate', { url: URL_ARG });
    const solo = `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Dạo phố một mình') && !b.disabled)`;
    let ready = false;
    for (let i = 0; i < 360 && !ready; i++) { await sleep(500); ready = await page.evaluate(`!!${solo}`).catch(() => false); }
    if (!ready) throw new Error(`the solo button never became ready at ${URL_ARG}`);
    result.load = { readyMs: Date.now() - t0, ...(await page.evaluate(`({ longTasks: __bench.longTasks.slice().sort((a, b) => b - a).slice(0, 6), longTaskTotal: __bench.longTasks.reduce((s, x) => s + x, 0) })`)) };
    await page.evaluate(`${solo}.click(); window.__benchToken = 1`);
    for (let i = 0; i < 40 && !(await page.evaluate('!!window.__pvo')); i++) await sleep(250);
    // The district build after the start: every frame until the last tile is up (and 2 s more).
    const wired = await page.evaluate('window.__pvo.world.districts().wired').catch(() => []);
    result.wired = wired;
    if (wired.length) {
      // The window opens when the builder starts (world.ts holds it for the first drawn frames: today's street compiling
      // and uploading, measured apart as "startup").
      result.build = await page.evaluate(`new Promise((resolve) => {
        const pvo = window.__pvo, dt = [], pre = []; let last = 0, start = 0, readyAt = 0, began = 0;
        const step = (t) => {
          const d = pvo.world.districts();
          if (!began) { if (last) pre.push(t - last); last = t; if (d.ms > 0) { began = t; start = t; } requestAnimationFrame(step); return; }
          dt.push(t - last); last = t;
          if (d.ready && !readyAt) readyAt = t;
          if ((readyAt && t - readyAt > 2000) || t - start > 30000) {
            const s = [...dt].sort((a, b) => a - b);
            resolve({ frames: dt.length, seconds: Math.round((t - start) / 100) / 10, ready: !!readyAt, buildMs: d.ms, longestStepMs: d.longestStepMs, longestStep: d.longestStep, tiles: d.tiles,
              startup: { frames: pre.length, max: Math.round(Math.max(0, ...pre)) },
              p95: Math.round((s[Math.floor(s.length * 0.95)] ?? 0) * 10) / 10, max: Math.round((s.at(-1) ?? 0) * 10) / 10, over50: dt.filter((x) => x > 50).length });
          } else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      })`);
      console.log(`  ${run.padEnd(8)}build    ${result.build.tiles} tiles in ${result.build.seconds} s (${result.build.buildMs} ms of work, longest step ${result.build.longestStepMs} ms): frames p95 ${result.build.p95} ms, max ${result.build.max} ms, ${result.build.over50} over 50 ms (startup before it: ${result.build.startup.frames} frames, max ${result.build.startup.max} ms)`);
    }
    result.gpu = await page.evaluate(GPU_NAME);
    if (result.gpu !== probe) result.warnings.push(`GPU probe on about:blank said ${probe}`);
    const P = 'window.__pvo';
    const shot = async (scene) => {
      if (!SHOTS) return;
      const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
      writeFileSync(join(OUT, `${LABEL}-${run}-${scene}.jpg`), Buffer.from(r.data, 'base64'));
    };
    const measure = async (scene) => {
      if (!(await page.evaluate('window.__benchToken === 1'))) throw new Error(`the page reloaded before ${scene}`);
      const wanted = await page.evaluate(`${P}.info().wanted`);
      if (wanted > 0) result.warnings.push(`${scene}: wanted (${wanted} star) when the measurement started, police are on their way`);
      const raw = await page.evaluate(MEASURE(SECONDS * 1000));
      const heap = await page.send('Runtime.getHeapUsage');
      const after = await page.evaluate(`({ textures: ${P}.stats().textures, wanted: ${P}.info().wanted, down: ${P}.info().down })`);
      result.scenes[scene] = { ...summarise(raw), heapMB: r1(heap.usedSize / 1048576), gpuTextures: after.textures, wanted: after.wanted, down: after.down || undefined };
      if (after.down) result.warnings.push(`${scene}: the player was ${after.down} during the measurement`);
      await shot(scene);
      const s = result.scenes[scene];
      console.log(`  ${run.padEnd(8)}${scene.padEnd(9)}${String(s.fps).padStart(7)} fps  p95 ${s.p95} ms  max ${s.max} ms  ${s.calls} calls  ${(s.triangles / 1e6).toFixed(2)} M tris${scene === 'drive' ? `  ${s.speed} m/s` : ''}`);
    };
    await page.evaluate(`${P}.hours(10)`);
    await sleep(3000);
    if (SCENES.includes('spawn')) { await sleep(1000); await measure('spawn'); }
    if (SCENES.includes('overview')) {
      // The camera 420 m out, south of the map's middle and 57° up: every block and the river are in the frustum
      // (fog ends at 260 m, so the picture is mostly haze; it is a GPU load, not a view).
      await page.evaluate(`${P}.police.reset(); ${P}.tp(120, 20, 0); ${P}.view(0, 1.0, 420)`);
      await sleep(3000);
      await measure('overview');
    }
    if (SCENES.includes('drive')) {
      // The sport bike (top 27 m/s) from the bike shop, then the riverside road (z = -108) eastbound in the moto lane.
      await page.evaluate(`${P}.police.reset(); ${P}.cash(100000); ${P}.tp(20, -10.9, 0)`);
      await sleep(600);
      await page.key('keyDown', 'e', 'KeyE', 69); await sleep(80); await page.key('keyUp', 'e', 'KeyE', 69);
      await sleep(1200);
      const bought = await page.evaluate(`(() => { const b = document.querySelector('#product-sport button'); if (!b || b.disabled) return false; b.click(); return true; })()`);
      await sleep(400);
      await page.evaluate(`document.querySelector('[aria-label="Đóng cửa hàng xe"]')?.click()`);
      if (!bought) result.warnings.push('could not buy the sport bike: driving the default scooter (top 19 m/s)');
      await sleep(800);
      // Traffic turning in at the T junctions would end the run in a crash, so lane vehicles that enter the bike's
      // lane up to 70 m ahead are sent back to the pool (vehicles.ts respawns them elsewhere).
      await page.evaluate(`${P}.ride(-128, -102.6, Math.PI / 2); ${P}.view(-Math.PI / 2, 0.22, 9);
        window.__benchClear = true;
        (function clear() {
          if (!window.__benchClear) return;
          const p = ${P}.info();
          for (const c of ${P}.vehicles.cars) if (c.mode !== 'off' && c.mode !== 'player' && c.x - p.x > -4 && c.x - p.x < 70 && Math.abs(c.z + 102.6) < 4.5) c.mode = 'off';
          requestAnimationFrame(clear);
        })();`);
      await sleep(800);
      await page.key('keyDown', 'w', 'KeyW', 87);
      await sleep(5500);
      await measure('drive');
      await page.key('keyUp', 'w', 'KeyW', 87);
      // Red lights run in front of a patrol raise the wanted level; clear it so the next scene is not an arrest.
      await page.evaluate(`window.__benchClear = false; ${P}.police.reset()`);
      if (result.scenes.drive.speed < 20) result.warnings.push(`drive averaged ${result.scenes.drive.speed} m/s (crash or blocked?)`);
    }
    if (SCENES.includes('nightdrive')) {
      // The same run at 21:00 (the bike bought for drive, else the scooter): the vehicles' lamps and the street lamps.
      await page.evaluate(`${P}.police.reset(); ${P}.hours(21); ${P}.ride(-128, -102.6, Math.PI / 2); ${P}.view(-Math.PI / 2, 0.22, 9);
        window.__benchClear = true;
        (function clear() {
          if (!window.__benchClear) return;
          const p = ${P}.info();
          for (const c of ${P}.vehicles.cars) if (c.mode !== 'off' && c.mode !== 'player' && c.x - p.x > -4 && c.x - p.x < 70 && Math.abs(c.z + 102.6) < 4.5) c.mode = 'off';
          requestAnimationFrame(clear);
        })();`);
      await sleep(800);
      await page.key('keyDown', 'w', 'KeyW', 87);
      await sleep(5500);
      await measure('nightdrive');
      await page.key('keyUp', 'w', 'KeyW', 87);
      await page.evaluate(`window.__benchClear = false; ${P}.police.reset()`);
      if (result.scenes.nightdrive.speed < 18) result.warnings.push(`night drive averaged ${result.scenes.nightdrive.speed} m/s (crash or blocked?)`);
    }
    if (SCENES.includes('night')) {
      await page.evaluate(`${P}.police.reset(); ${P}.hours(21); ${P}.tp(243, 44, Math.PI); ${P}.view(-2.6, 0.2, 70)`);
      await sleep(4000);
      await measure('night');
    }
    if (SCENES.includes('nightdistrict') && result.wired?.includes('quan-1-south')) {
      // Bùi Viện at 21:30, standing (night plan §10.3 step 4): the walking street with everything lit.
      const [x, z, yaw] = DISTRICT_SPOTS['quan-1-south'].stand;
      await page.evaluate(`${P}.police.reset(); ${P}.hours(21.5); ${P}.tp(${x}, ${z}, ${yaw}); ${P}.view(${yaw} + Math.PI, 0.32, 12)`);
      await sleep(5000);
      await measure('nightdistrict');
    }
    // The newest wired slice (or --district): a street at 19:00 on foot, then a straight run on the sport bike.
    const slice = DISTRICT || result.wired?.at(-1);
    const spot = slice ? DISTRICT_SPOTS[slice] : null;
    if (spot) result.district = { slice, name: spot.name };
    if (spot && SCENES.includes('district')) {
      const [x, z, yaw] = spot.stand;
      await page.evaluate(`${P}.police.reset(); ${P}.hours(19); ${P}.tp(${x}, ${z}, ${yaw}); ${P}.view(${yaw} + Math.PI, 0.32, 12)`);
      await sleep(5000);
      await measure('district');
    }
    if (spot && SCENES.includes('ddrive')) {
      const [x, z, heading] = spot.ride;
      await page.evaluate(`${P}.police.reset(); ${P}.hours(10); ${P}.ride(${x}, ${z}, ${heading}); ${P}.view(${heading} - Math.PI, 0.22, 9);
        window.__benchClear = true;
        (function clear() {
          if (!window.__benchClear) return;
          const p = ${P}.info(), hx = Math.sin(${heading}), hz = Math.cos(${heading});
          for (const c of ${P}.vehicles.cars) {
            if (c.mode === 'off' || c.mode === 'player') continue;
            const ax = c.x - p.x, az = c.z - p.z, ahead = ax * hx + az * hz, side = Math.abs(-ax * hz + az * hx);
            if (ahead > -4 && ahead < 70 && side < 6) c.mode = 'off';
          }
          requestAnimationFrame(clear);
        })();`);
      await sleep(800);
      await page.key('keyDown', 'w', 'KeyW', 87);
      await sleep(4500);
      await measure('ddrive');
      await page.key('keyUp', 'w', 'KeyW', 87);
      await page.evaluate(`window.__benchClear = false; ${P}.police.reset()`);
      if (result.scenes.ddrive.speed < 20) result.warnings.push(`district drive averaged ${result.scenes.ddrive.speed} m/s (crash or blocked?)`);
    }
    result.textures = await page.evaluate(TEXTURES);
  } catch (e) {
    result.failed = e.message;
    console.log(`  ${run}: FAILED ${e.message}`);
  } finally {
    await page.close();
  }
  result.cpuBusyPercent = cpuBusy(cpu0);
  return result;
}

function gates(runs) {
  const out = [];
  for (const r of runs) {
    if (r.failed) { out.push({ gate: `${r.run} run completed`, ok: false, value: r.failed }); continue; }
    const scenes = Object.entries(r.scenes);
    const minFps = Math.min(...scenes.map(([, s]) => s.fps));
    const worst = scenes.find(([, s]) => s.fps === minFps)?.[0];
    if (!integrated(r.gpu)) out.push({ gate: `${r.run}: discrete GPU (${r.gpu}) >= ${GATES.discreteFps} fps in every scene`, ok: minFps >= GATES.discreteFps, value: `${minFps} fps (${worst}), quality ${r.quality}` });
    else if (/intel/i.test(r.gpu) && r.quality === 'low') out.push({ gate: `${r.run}: Intel at Low (${r.gpu}) >= ${GATES.intelLowFps} fps in every scene`, ok: minFps >= GATES.intelLowFps, value: `${minFps} fps (${worst})` });
    if (r.scenes.drive) out.push({ gate: `${r.run}: p95 <= ${GATES.driveP95} ms while driving`, ok: r.scenes.drive.p95 <= GATES.driveP95, value: `${r.scenes.drive.p95} ms at ${r.scenes.drive.speed} m/s` });
    if (r.scenes.nightdrive) out.push({ gate: `${r.run}: p95 <= ${GATES.driveP95} ms while driving at night`, ok: r.scenes.nightdrive.p95 <= GATES.driveP95, value: `${r.scenes.nightdrive.p95} ms at ${r.scenes.nightdrive.speed} m/s` });
    if (r.scenes.ddrive) out.push({ gate: `${r.run}: p95 <= ${GATES.driveP95} ms while driving in ${r.district?.name}`, ok: r.scenes.ddrive.p95 <= GATES.driveP95, value: `${r.scenes.ddrive.p95} ms at ${r.scenes.ddrive.speed} m/s` });
    if (r.build) out.push({ gate: `${r.run}: no frame over ${GATES.buildMax} ms while the districts build`, ok: r.build.max <= GATES.buildMax && r.build.ready, value: `max ${r.build.max} ms, ${r.build.over50} over 50 ms${r.build.ready ? '' : ', NOT finished in 30 s'}` });
    if (scenes.length) { const most = Math.max(...scenes.map(([, s]) => s.calls)), at = scenes.find(([, s]) => s.calls === most)[0]; out.push({ gate: `${r.run}: draw calls <= ${GATES.calls} (median, every scene)`, ok: most <= GATES.calls, value: `${most} (${at})` }); }
    if (r.textures) out.push({ gate: `${r.run}: sign textures <= ${GATES.signMB} MB`, ok: r.textures.signMB <= GATES.signMB, value: `${r.textures.signMB} MB in ${r.textures.signs} textures` });
  }
  return out;
}

function codeState() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'app', 'lib'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    return { checkout: ROOT, head, dirty };
  } catch { return { checkout: ROOT, head: 'unknown', dirty: [] }; }
}

mkdirSync(OUT, { recursive: true });
console.log(`perf-bench ${LABEL}: ${URL_ARG}, runs ${RUNS.join('+')}, ${SECONDS} s per scene${FREEZE ? '' : ', HMR live'}`);
const report = {
  label: LABEL, url: URL_ARG, date: new Date().toISOString(), note: NOTE || undefined,
  machine: { cpu: cpus()[0]?.model, threads: cpus().length },
  viewport: '1366x768 DPR 1', secondsPerScene: SECONDS, gates: [], runs: [],
};
for (const [i, run] of RUNS.entries()) report.runs.push(await runOne(run, PORTS[i] ?? PORTS[0] + i));
report.gates = gates(report.runs);
const file = join(OUT, `${LABEL}.json`);
writeFileSync(file, `${JSON.stringify(report, null, 1)}\n`);

console.log(`\n${'run'.padEnd(8)}${'gpu'.padEnd(34)}${'quality'.padEnd(8)}${'scene'.padEnd(9)}${'fps'.padStart(7)}${'p95'.padStart(7)}${'max'.padStart(7)}${'calls'.padStart(7)}${'Mtris'.padStart(7)}${'heapMB'.padStart(8)}`);
for (const r of report.runs) {
  for (const [scene, s] of Object.entries(r.scenes)) {
    console.log(`${r.run.padEnd(8)}${String(r.gpu ?? '?').replace(/^ANGLE \(|, Direct3D.*$/g, '').slice(0, 33).padEnd(34)}${String(r.quality).padEnd(8)}${scene.padEnd(9)}${String(s.fps).padStart(7)}${String(s.p95).padStart(7)}${String(s.max).padStart(7)}${String(s.calls).padStart(7)}${(s.triangles / 1e6).toFixed(2).padStart(7)}${String(s.heapMB).padStart(8)}`);
  }
  if (r.textures) console.log(`${''.padEnd(8)}textures ${r.textures.count} (${r.textures.mb} MB est., signs ${r.textures.signMB} MB in ${r.textures.signs}), render targets ${r.textures.renderTargetMB} MB, page ready ${r.load?.readyMs} ms, longest task ${r.load?.longTasks?.[0] ?? '?'} ms, CPU busy ${r.cpuBusyPercent}%`);
  for (const w of r.warnings) console.log(`${''.padEnd(8)}warning: ${w}`);
  if (r.errors.length) console.log(`${''.padEnd(8)}${r.errors.length} page errors, first: ${r.errors[0]}`);
}
console.log(`\ngates${GATE ? '' : ' (informational; --gate enforces them)'}:`);
for (const g of report.gates) console.log(`  ${g.ok ? 'PASS' : 'FAIL'}  ${g.gate}: ${g.value}`);
console.log(`\nwrote ${file}`);
if (GATE && report.gates.some((g) => !g.ok)) process.exit(1);
