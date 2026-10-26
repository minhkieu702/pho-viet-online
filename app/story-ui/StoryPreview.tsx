"use client";
// Localhost-only gallery for the story UI (app/story-preview). Renders StoryLayer over a painted stand-in for the
// game scene with mock data; actions go through mockReduce so every screen is clickable. ?c=<scene>&chrome=0&touch=1.
import { useState } from 'react';
import StoryLayer from './StoryLayer';
import LunarStrip from './LunarStrip';
import { gradeFilter } from './format';
import type { CctvFrameRenderer } from './CctvScrubber';
import { SCENES, mockPortraits, mockReduce, mockScene, type SceneId } from './mock';
import type { LunarView, StoryUiAction } from './types';

const PORTRAITS = mockPortraits();
const NIGHT = new Set<SceneId>(['stealth', 'stealth-alert', 'cine', 'bluff', 'qte', 'camera', 'note', 'hud', 'sms', 'phone', 'phone-sms', 'phone-call', 'phone-orders', 'burner', 'lunar']);

/** A painted stand-in for the 3D street: sky, skyline with lit windows, street and a few lamps (deterministic). */
function Backdrop({ night, filter }: { night: boolean; filter: string }) {
  const b: { x: number; w: number; h: number }[] = [];
  let s = 7;
  for (let x = -2; x < 102;) { s = (s * 9301 + 49297) % 233280; const w = 4 + (s % 7), h = 18 + ((s >> 3) % 34); b.push({ x, w, h }); x += w + 0.4; }
  return <svg className="st-pv-scene" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ filter }}>
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">{night ? <><stop offset="0" stopColor="#0d1a24" /><stop offset=".6" stopColor="#1f3442" /><stop offset="1" stopColor="#3b4a4a" /></> : <><stop offset="0" stopColor="#9cc7d8" /><stop offset=".7" stopColor="#e9e2c8" /><stop offset="1" stopColor="#f2dcb6" /></>}</linearGradient>
      <radialGradient id="lamp"><stop offset="0" stopColor="#ffd98a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="100" height="60" fill="url(#sky)" />
    {night && <circle cx="80" cy="9" r="2.6" fill="#f6e7b0" opacity=".9" />}
    {b.map((r, i) => <g key={i}><rect x={r.x} y={40 - r.h * 0.55} width={r.w} height={r.h} fill={night ? (i % 3 ? '#16232a' : '#1b2b30') : (i % 3 ? '#c9b89c' : '#b7a588')} />
      {Array.from({ length: Math.floor(r.h / 4) }, (_, j) => <rect key={j} x={r.x + 0.8} y={40 - r.h * 0.55 + 1.5 + j * 3} width={r.w - 1.6} height="1" fill={night ? ((i + j) % 4 ? '#e9c46a33' : '#e9c46acc') : '#ffffff40'} />)}</g>)}
    <rect y="40" width="100" height="20" fill={night ? '#1d2422' : '#8d8d84'} />
    <rect y="40" width="100" height="2.2" fill={night ? '#2c3532' : '#bdb8a8'} />
    {[12, 38, 64, 90].map((x) => <g key={x}><rect x={x} y="28" width=".35" height="12" fill={night ? '#3a4440' : '#5d625c'} /><circle cx={x + 0.2} cy="28.4" r={night ? 7 : 0} fill="url(#lamp)" /></g>)}
    {[22, 50, 78].map((x) => <rect key={x} x={x} y="49.5" width="5" height=".5" fill={night ? '#e9e2c855' : '#f4f1e6'} />)}
  </svg>;
}

/** Mock café CCTV: a high-angle porch at night; Quang on a stool; the collar grab (03:36) and the phone call (03:41). */
const drawCctv: CctvFrameRenderer = (g, t, w, h) => {
  g.fillStyle = '#222624'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2e3330'; g.fillRect(0, h * 0.58, w, h * 0.42);
  g.fillStyle = '#3a3f3a'; g.fillRect(0, h * 0.5, w, h * 0.09);
  g.fillStyle = '#4a4436'; g.fillRect(w * 0.06, 0, w * 0.5, h * 0.5);
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#6c5b45' : '#8b7a5c'; g.fillRect(w * 0.06 + i * w * 0.05, h * 0.06, w * 0.05, h * 0.07); }
  g.fillStyle = '#d9d2bd'; g.font = `bold ${Math.round(h * 0.045)}px Arial`; g.textAlign = 'left'; g.fillText('CÀ PHÊ CÔ BA · TỪ 1998', w * 0.1, h * 0.2);
  const lamp = g.createRadialGradient(w * 0.7, h * 0.45, 2, w * 0.7, h * 0.45, w * 0.28); lamp.addColorStop(0, '#fff3c855'); lamp.addColorStop(1, '#fff3c800'); g.fillStyle = lamp; g.fillRect(0, 0, w, h);
  g.fillStyle = '#5d6b8a'; for (let i = 0; i < 4; i++) g.fillRect(w * (0.12 + i * 0.1), h * 0.4, w * 0.035, h * 0.05);
  const person = (x: number, y: number, body: string, head = '#c99068', s = 1) => { g.fillStyle = body; g.beginPath(); g.ellipse(x, y, w * 0.022 * s, h * 0.05 * s, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = head; g.beginPath(); g.arc(x, y - h * 0.06 * s, h * 0.022 * s, 0, Math.PI * 2); g.fill(); };
  // passing scooters, deterministic
  for (let k = 0; k < 6; k++) { const p = ((t * 0.9 + k * 157) % 220) / 220; if (p < 0.6) { const x = w * (p / 0.6) * 1.1 - w * 0.05, y = h * (0.66 + (k % 3) * 0.08); g.fillStyle = '#111'; g.fillRect(x - w * 0.03, y, w * 0.06, h * 0.025); person(x, y - h * 0.01, ['#486', '#844', '#668', '#a84'][k % 4], '#b98260', 0.7); g.fillStyle = '#fff6d0'; g.fillRect(x + w * 0.03, y + h * 0.005, w * 0.008, h * 0.012); } }
  const quang = t >= 300 && t <= 780;
  if (quang) {
    const stand = (t >= 368 && t <= 405) || (t >= 652 && t <= 706);
    const qx = w * 0.32, qy = stand ? h * 0.44 : h * 0.47;
    person(qx, qy, '#e77641', '#c48a62', stand ? 1 : 0.9);
    if (t >= 652 && t <= 706) { g.fillStyle = '#cfe8ff'; g.fillRect(qx + w * 0.012, qy - h * 0.085, w * 0.008, h * 0.02); g.fillStyle = '#cfe8ff55'; g.beginPath(); g.arc(qx + w * 0.016, qy - h * 0.075, h * 0.03, 0, Math.PI * 2); g.fill(); }
  }
  if (t >= 350 && t <= 430) {
    const arrive = Math.min(1, (t - 350) / 15), leave = t > 415 ? (t - 415) / 15 : 0;
    const rx = w * (0.95 - arrive * 0.55 + leave * 0.6), ry = h * 0.62;
    g.fillStyle = '#0b0b0b'; g.fillRect(rx - w * 0.035, ry, w * 0.07, h * 0.03);
    if (t >= 366 && t <= 410) { person(w * 0.37, h * 0.45, '#1d1d20', '#b07a58'); g.strokeStyle = '#b07a58'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.36, h * 0.43); g.lineTo(w * 0.335, h * 0.41); g.stroke(); }
    else person(rx, ry - h * 0.01, '#1d1d20', '#b07a58', 0.8);
  }
  const n = Math.floor(t * 5);
  for (let i = 0; i < 260; i++) { const v = ((n * 131 + i * 977) % 1000) / 1000; g.fillStyle = `rgba(255,255,255,${v * 0.06})`; g.fillRect((i * 53 + n * 7) % w, (i * 97 + n * 13) % h, 2, 1); }
};

export default function StoryPreview({ initial, chrome, touch }: { initial: SceneId; chrome: boolean; touch: boolean }) {
  const [scene, setScene] = useState<SceneId>(initial);
  const [view, setView] = useState(() => mockScene(initial));
  const [log, setLog] = useState('');
  const go = (id: SceneId) => {
    setScene(id); setView(mockScene(id)); setLog('');
    try { const u = new URL(location.href); u.searchParams.set('c', id); history.replaceState(null, '', u); } catch { /* sandboxed */ }
  };
  const onAction = (a: StoryUiAction) => { setLog(JSON.stringify(a)); setView((v) => mockReduce(v, a)); };
  const night = NIGHT.has(scene);
  return <main className={`app-shell st-pv ${night ? 'night' : ''}`}>
    <Backdrop night={night} filter={gradeFilter(view.cine?.grade)} />
    {!view.cine?.mode && !view.menu && !(view.phone?.open && view.phone.app === 'camera') && <><div className="map-card st-pv-map" aria-hidden="true"><div className="map-title">AN HÒA</div><svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#e7e3cf" /><path d="M0 40H100M0 72H100M30 0V100M70 0V100" stroke="#fffdf4" strokeWidth="8" /><circle cx="52" cy="56" r="4" fill="#253c32" /><circle cx="78" cy="22" r="4" fill="#db683f" /></svg></div>
      <div className="hud-stack" aria-hidden="true"><div className="hud-pill cash-pill"><span className="pill-text"><small>Ví</small><b>1.350.000đ</b></span></div></div></>}
    {scene === 'lunar' && <section className="st st-pv-lunar" aria-label="Dải lịch âm">{([{ month: 7, day: 27 }, { month: 8, day: 1 }, { month: 8, day: 10 }, { month: 8, day: 14 }, { month: 8, day: 15 }] as LunarView[]).map((l) => <LunarStrip key={`${l.month}-${l.day}`} lunar={l} />)}</section>}
    <StoryLayer view={view} portraits={PORTRAITS} onAction={onAction} renderCctvFrame={drawCctv} touch={touch} />
    {chrome && <nav className="st-pv-bar" aria-label="Chọn màn hình xem thử">
      <b>STORY UI</b>
      <select value={scene} onChange={(e) => go(e.target.value as SceneId)} aria-label="Màn hình">{SCENES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      <button type="button" onClick={() => go(scene)}>Đặt lại</button>
      <code title={log}>{log || 'Chưa có hành động'}</code>
    </nav>}
  </main>;
}
