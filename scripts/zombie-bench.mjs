// Headless zombie-mode perf bench (design.md §7.4). Not part of npm test: it needs a running dev server, Chrome and a
// GPU, and its numbers move with machine load (other builders share the machine: compare with the same run's city).
//   node scripts/zombie-bench.mjs [url] [--runs=default,high] [--quality=gpu|high|low] [--scenes=city,zsolo,znight,zonline,zdrive]
//        [--seconds=10] [--out=dir] [--ports=9921,9922] [--profile=dir] [--label=name] [--gate] [--no-shots]
// Scenes (each measured for --seconds after settling, in one Chrome per run):
//   city     the perf-bench 'spawn' scene: idle where a solo game starts, 10:00 (this run's baseline)
//   zsolo    solo zombie mode, wave 10, 16:30: ~60 zombies of every kind around the player and two mutants
//   znight   the same at 21:00 (fog, glowing eyes, the flashlight)
//   zonline  the host of a zombie room: ~110 zombies and three mutants, snapshots published to the room
//   zdrive   a bike at full throttle along the riverside road through the ruins
// Per scene: fps, p50/p95/max frame time, draw calls, triangles, heap; for zombie scenes the coordinator's own time per
// frame (coop.update). Gates (--gate exits 1 on a failure): discrete GPU ≥ 120 fps in every scene; Intel at Low ≥ 38 fps
// (on a quiet machine) and every zombie scene ≥ 0.88 × this run's city fps; draw calls ≤ 190; triangles ≤ 1.15 M at
// Low, ≤ 2.0 M at High; coop.update ≤ 4 ms a frame; heap growth ≤ 60 MB over the run. The page's Vite HMR socket is
// stubbed so edits landing during a run cannot reload it.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : true;
};
const URL_ARG = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5174/';
const LABEL = String(flag('label', `zbench-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`));
const GATE = flag('gate', false) === true;
const RUNS = String(flag('runs', 'default,high')).split(',');
const QUALITY = String(flag('quality', 'gpu'));
const SCENES = String(flag('scenes', 'city,zsolo,znight,zonline,zdrive')).split(',');
const SECONDS = Number(flag('seconds', 10));
const OUT = String(flag('out', existsSync('E:/pvo-work') ? 'E:/pvo-work/zombie-online/bench' : join(tmpdir(), 'pvo-zbench')));
const PORTS = String(flag('ports', '9921,9922')).split(',').map(Number);
const PROFILE = String(flag('profile', existsSync('E:/') ? 'E:/pvo-chrome-z-mode-bench' : join(tmpdir(), 'pvo-zbench-chrome')));
const CHROME = String(flag('chrome', process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'));
const SHOTS = !flag('no-shots', false);
const GATES = { discreteFps: 120, intelLowFps: 38, relative: 0.88, calls: 190, trisLow: 1.15e6, trisHigh: 2.0e6, coopMs: 4, heapMB: 60 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

async function launch(run, port) {
  const profile = `${PROFILE}-${run}`;
  rmSync(profile, { recursive: true, force: true });
  const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1366,768',
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', ...(run === 'high' ? ['--force_high_performance_gpu'] : []), 'about:blank'];
  const chrome = spawn(CHROME, flags, { stdio: 'ignore', env: { ...process.env, TEMP: 'E:/pvo-tmp', TMP: 'E:/pvo-tmp' } });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
    if (!target) await sleep(200);
  }
  if (!target) { chrome.kill(); throw new Error(`Chrome did not open its debugging port ${port}`); }
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
  const close = async () => {
    await Promise.race([send('Browser.close').catch(() => {}), sleep(3000)]);
    try { ws.close(); } catch { /* gone */ }
    chrome.kill();
    await sleep(800);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch (e) { console.log(`could not delete ${profile}: ${e.message}`); }
  };
  return { send, evaluate, key, close, on: (fn) => listeners.push(fn) };
}

const BOOT = (quality) => `
try { ${quality ? `localStorage.setItem('pvo-quality', ${JSON.stringify(quality)});` : ''} } catch {}
{
  const Native = window.WebSocket;
  window.WebSocket = new Proxy(Native, { construct(target, a) {
    const p = a[1];
    if (p === 'vite-hmr' || p === 'vite-ping' || (Array.isArray(p) && p.includes('vite-hmr'))) {
      return { readyState: 0, CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, addEventListener() {}, removeEventListener() {}, send() {}, close() {} };
    }
    return Reflect.construct(target, a);
  } });
}`;
// Frame times, calls, triangles and the coordinator's own time (coop.update wrapped for the measurement).
const MEASURE = (ms) => `new Promise((resolve) => {
  const pvo = window.__pvo, render = pvo.renderer.info.render, coop = pvo.coop;
  const dt = [], calls = [], tris = [], coopMs = [];
  let coopFrame = 0;
  const original = coop && coop.update;
  if (coop) coop.update = function (...a) { const t = performance.now(); const r = original.apply(this, a); coopFrame += performance.now() - t; return r; };
  let start = 0, last = 0;
  const step = (t) => {
    if (!start) { start = last = t; coopFrame = 0; requestAnimationFrame(step); return; }
    dt.push(t - last); last = t;
    calls.push(render.calls); tris.push(render.triangles); coopMs.push(coopFrame); coopFrame = 0;
    if (t - start < ${ms}) requestAnimationFrame(step); else { if (coop) coop.update = original; resolve({ dt, calls, tris, coopMs, elapsed: t - start }); }
  };
  requestAnimationFrame(step);
})`;
const GPU_NAME = `(() => { const gl = window.__pvo ? __pvo.renderer.getContext() : document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'no webgl'; const x = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(x ? x.UNMASKED_RENDERER_WEBGL : gl.RENDERER)); })()`;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
const r1 = (v) => Math.round(v * 10) / 10;
const median = (l) => [...l].sort((a, b) => a - b)[l.length >> 1] ?? 0;
function summarise(m) {
  const sorted = [...m.dt].sort((a, b) => a - b), coop = [...m.coopMs].sort((a, b) => a - b);
  return {
    fps: r1(m.dt.length / (m.elapsed / 1000)), p50: r1(pct(sorted, 0.5)), p95: r1(pct(sorted, 0.95)), max: r1(sorted.at(-1) ?? 0),
    calls: median(m.calls), triangles: median(m.tris), coopMs: r1(pct(coop, 0.5) * 10) / 10, coopP95: r1(pct(coop, 0.95)),
  };
}
function cpuBusy(before) {
  const now = cpus().map((c) => c.times);
  let idle = 0, total = 0;
  now.forEach((t, i) => { const b = before[i]; for (const k of Object.keys(t)) total += t[k] - b[k]; idle += t.idle - b.idle; });
  return total ? Math.round((1 - idle / total) * 100) : 0;
}
const integrated = (gpu) => /intel|uhd|iris|radeon\(tm\) graphics|vega \d+ graphics/i.test(gpu) && !/nvidia|geforce|rtx|gtx|radeon rx|radeon pro/i.test(gpu);
const KINDS = ['walker', 'walker', 'walker', 'runner', 'brute', 'crawler', 'spitter', 'bloater', 'riot', 'shipper', 'screamer', 'hunter', 'stalker'];

async function runOne(run, port) {
  const cpu0 = cpus().map((c) => c.times);
  const page = await launch(run, port);
  const result = { run, scenes: {}, errors: [], warnings: [] };
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') result.errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
  });
  const P = 'window.__pvo';
  try {
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    const probe = await page.evaluate(GPU_NAME);
    const quality = QUALITY === 'gpu' ? (integrated(probe) ? 'low' : 'high') : QUALITY;
    result.quality = quality;
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: BOOT(quality) });
    await page.send('Page.navigate', { url: URL_ARG });
    const button = (label) => `[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(label)}) && !b.disabled)`;
    for (let i = 0; i < 360 && !(await page.evaluate(`!!${button('Dạo phố một mình')}`).catch(() => false)); i++) await sleep(500);
    await page.evaluate(`${button('Dạo phố một mình')}.click()`);
    for (let i = 0; i < 40 && !(await page.evaluate('!!window.__pvo')); i++) await sleep(250);
    result.gpu = await page.evaluate(GPU_NAME);
    const heap0 = (await page.send('Runtime.getHeapUsage')).usedSize;
    const shot = async (scene) => {
      if (!SHOTS) return;
      const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
      writeFileSync(join(OUT, `${LABEL}-${run}-${scene}.jpg`), Buffer.from(r.data, 'base64'));
    };
    const measure = async (scene) => {
      const raw = await page.evaluate(MEASURE(SECONDS * 1000));
      const heap = await page.send('Runtime.getHeapUsage');
      const z = scene === 'city' ? null : await page.evaluate(`({ s: ${P}.z.state(), d: ${P}.z.draw(), r: ${P}.z.ruins() })`);
      result.scenes[scene] = { ...summarise(raw), heapMB: r1(heap.usedSize / 1048576), ...(z ? { alive: z.s.alive, mutants: z.s.mutants, drawn: z.d.near + z.d.far, ruinTris: z.r.triangles } : {}) };
      await shot(scene);
      const s = result.scenes[scene];
      console.log(`  ${run.padEnd(8)}${scene.padEnd(9)}${String(s.fps).padStart(7)} fps  p95 ${s.p95} ms  ${s.calls} calls  ${(s.triangles / 1e6).toFixed(2)} M tris${z ? `  coop ${s.coopMs}/${s.coopP95} ms  ${s.alive} alive ${s.mutants} mutants ${s.drawn} drawn` : ''}`);
    };
    // A horde around (x, z): topped up to `count` zombies standing, 12-45 m away, and the given mutants about 42 m away.
    const horde = async (x, z, count, mutants) => {
      await page.evaluate(`(() => { const k = ${JSON.stringify(KINDS)}; let n = ${P}.z.state().alive;
        for (let i = 0; i < ${count} * 3 && n < ${count}; i++) { const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 33;
          if (${P}.z.spawn(k[i % k.length], ${x} + Math.cos(a) * d, ${z} + Math.sin(a) * d, 'door') >= 0) n++; }
        ${JSON.stringify(mutants)}.forEach((m, i) => { const a = i * 2.1; ${P}.z.mutant(m, ${x} + Math.cos(a) * 42, ${z} + Math.sin(a) * 42, false); });
        return n; })()`);
    };
    await page.evaluate(`${P}.hours(10)`);
    await sleep(3000);
    if (SCENES.includes('city')) { await sleep(1000); await measure('city'); }
    const wantsSolo = SCENES.includes('zsolo') || SCENES.includes('znight') || SCENES.includes('zdrive');
    if (wantsSolo) {
      await page.evaluate(`document.querySelector('[aria-label="Rời phố"]')?.click()`);
      await sleep(800);
      await page.evaluate(`${button('Chế độ Zombie')}.click()`);
      await sleep(4000);
      await page.evaluate(`${P}.z.god(true); ${P}.hours(16.5); ${P}.tp(12.6, 12.4, Math.PI / 2); ${P}.view(-2.2, 0.35, 30); ${P}.z.wave(10)`);
      await sleep(1500);
      await horde(12.6, 12.4, 60, ['colossus', 'leaper']);
      await sleep(5000);
      if (SCENES.includes('zsolo')) await measure('zsolo');
      if (SCENES.includes('znight')) { await page.evaluate(`${P}.hours(21)`); await sleep(2500); await measure('znight'); await page.evaluate(`${P}.hours(16.5)`); }
      if (SCENES.includes('zdrive')) {
        await page.evaluate(`${P}.z.clear(); ${P}.ride(-128, -102.6, Math.PI / 2); ${P}.view(-Math.PI / 2, 0.22, 9)`);
        await sleep(800);
        await page.key('keyDown', 'w', 'KeyW', 87);
        await sleep(4000);
        await measure('zdrive');
        await page.key('keyUp', 'w', 'KeyW', 87);
      }
    }
    if (SCENES.includes('zonline')) {
      await page.evaluate(`document.querySelector('[aria-label="Rời phố"]')?.click()`);
      await sleep(800);
      await page.evaluate(`${button('Tạo phòng Zombie')}.click()`);
      await sleep(5000);
      const s = await page.evaluate(`${P}.z.state()`);
      if (!s.online || !s.host) result.warnings.push(`zonline: not hosting a room (${JSON.stringify(s)})`);
      await page.evaluate(`${P}.z.god(true); ${P}.hours(16.5); ${P}.tp(12.6, 12.4, Math.PI / 2); ${P}.view(-2.2, 0.35, 30); ${P}.z.wave(10)`);
      await sleep(1500);
      await horde(12.6, 12.4, 120, ['colossus', 'leaper', 'matriarch']);
      await sleep(5000);
      await measure('zonline');
      result.net = await page.evaluate(`${P}.z.net()`);
    }
    result.heapGrowthMB = r1(((await page.send('Runtime.getHeapUsage')).usedSize - heap0) / 1048576);
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
    const city = r.scenes.city?.fps;
    for (const [name, s] of Object.entries(r.scenes)) {
      if (name === 'city') continue;
      if (city) out.push({ gate: `${r.run} ${name} ≥ ${GATES.relative} × city`, ok: s.fps >= GATES.relative * city, value: `${s.fps} vs ${city}` });
      if (!integrated(r.gpu)) out.push({ gate: `${r.run} ${name} discrete ≥ ${GATES.discreteFps} fps`, ok: s.fps >= GATES.discreteFps, value: `${s.fps}` });
      else if (r.quality === 'low') out.push({ gate: `${r.run} ${name} Intel Low ≥ ${GATES.intelLowFps} fps (quiet machine)`, ok: s.fps >= GATES.intelLowFps, value: `${s.fps}` });
      out.push({ gate: `${r.run} ${name} calls ≤ ${GATES.calls}`, ok: s.calls <= GATES.calls, value: `${s.calls}` });
      const tris = r.quality === 'low' ? GATES.trisLow : GATES.trisHigh;
      out.push({ gate: `${r.run} ${name} triangles ≤ ${tris / 1e6} M`, ok: s.triangles <= tris, value: `${(s.triangles / 1e6).toFixed(2)} M` });
      out.push({ gate: `${r.run} ${name} coop.update ≤ ${GATES.coopMs} ms`, ok: s.coopMs <= GATES.coopMs, value: `${s.coopMs} ms (p95 ${s.coopP95})` });
    }
    out.push({ gate: `${r.run} heap growth ≤ ${GATES.heapMB} MB`, ok: (r.heapGrowthMB ?? 0) <= GATES.heapMB, value: `${r.heapGrowthMB} MB` });
  }
  return out;
}

console.log(`zombie bench ${LABEL} at ${URL_ARG}: runs ${RUNS.join(', ')}, scenes ${SCENES.join(', ')}, ${SECONDS} s each`);
const runs = [];
for (const [i, run] of RUNS.entries()) runs.push(await runOne(run, PORTS[i % PORTS.length]));
for (const r of runs) {
  console.log(`\n${r.run}: ${r.gpu} (quality ${r.quality}), CPU busy ${r.cpuBusyPercent}%${r.errors.length ? `, ${r.errors.length} page errors` : ''}`);
  for (const e of r.errors.slice(0, 5)) console.log(`  error: ${e}`);
  for (const w of r.warnings) console.log(`  warning: ${w}`);
}
const checks = gates(runs);
console.log('\ngates:');
for (const g of checks) console.log(`  ${g.ok ? 'ok  ' : 'FAIL'} ${g.gate}: ${g.value}`);
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify({ label: LABEL, url: URL_ARG, at: new Date().toISOString(), runs, gates: checks }, null, 2));
console.log(`\nwrote ${join(OUT, `${LABEL}.json`)}`);
if (GATE && checks.some((g) => !g.ok)) process.exit(1);
