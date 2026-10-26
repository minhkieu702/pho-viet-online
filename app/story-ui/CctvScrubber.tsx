"use client";
// The café's old CCTV recorder: play, pause, scrub the timeline, step frame by frame, change speed, zoom ×2 on a spot
// and mark a moment. Footage is deterministic, so playback runs here; the runner only judges `mark` actions and lists
// the moments found. Frames come from renderFrame (an engine render target or 2D canvas drawing); without one the
// monitor shows static.
import { useEffect, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Flag, Pause, Play, StepBack, StepForward, ZoomIn } from 'lucide-react';
import { clockLabel } from './format';
import { CloseButton, Key, useKeys, useModal } from './ui';
import type { CctvView, StoryUiAction } from './types';

export type CctvFrameRenderer = (ctx: CanvasRenderingContext2D, t: number, width: number, height: number) => void;
const SPEEDS = [-8, 1, 4, 16];

function staticNoise(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.fillStyle = '#1a1f1c'; ctx.fillRect(0, 0, w, h);
  let s = Math.floor(t * 7) * 9301 + 49297;
  for (let i = 0; i < 1400; i++) { s = (s * 9301 + 49297) % 233280; const v = s / 233280; ctx.fillStyle = `rgba(220,230,220,${v * 0.35})`; ctx.fillRect((i * 37) % w, ((i * 53 + s) % h), 2, 2); }
  ctx.fillStyle = '#d7e3d4'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('KHÔNG CÓ TÍN HIỆU', w / 2, h / 2);
}

export default function CctvScrubber({ cctv, renderFrame, onAction }: { cctv: CctvView; renderFrame?: CctvFrameRenderer; onAction: (a: StoryUiAction) => void }) {
  const ref = useRef<HTMLElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const close = () => onAction({ type: 'cctv', op: 'close' });
  useModal(ref, close);
  const fps = cctv.fps ?? 5, dur = Math.max(1, cctv.duration);
  const [t, setTime] = useState(0);
  const tRef = useRef(0);
  const setT = (v: number) => { tRef.current = v; setTime(v); };
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState<{ on: boolean; x: number; y: number }>({ on: false, x: 0.5, y: 0.5 });
  const seek = (v: number) => setT(Math.max(0, Math.min(dur, v)));
  // Playback clock: rAF advances t while playing; stops at either end.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const n = Math.max(0, Math.min(dur, tRef.current + dt * speed));
      tRef.current = n; setTime(n);
      if (n <= 0 || n >= dur) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, dur]);
  // Draw the frame for the quantised time (CCTV runs at a few frames per second).
  const frame = Math.floor(t * fps) / fps;
  useEffect(() => {
    const c = canvas.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.save();
    if (renderFrame) renderFrame(ctx, frame, c.width, c.height); else staticNoise(ctx, c.width, c.height, frame);
    ctx.restore();
  }, [frame, renderFrame]);
  const step = (n: number) => { setPlaying(false); seek(frame + n / fps); };
  /** Play from the start again when parked at the end (or from the end when rewinding at 0). */
  const play = (on: boolean, s = speed) => { if (on && s > 0 && tRef.current >= dur - 0.01) setT(0); else if (on && s < 0 && tRef.current <= 0.01) setT(dur); setPlaying(on); };
  const mark = () => onAction({ type: 'cctv', op: 'mark', t: frame, zoom: zoom.on ? { x: zoom.x, y: zoom.y } : null });
  useKeys((e, down) => {
    if (!down) return;
    const k = e.key;
    if (k === ' ' || e.code === 'Space') { if (!(e.target instanceof HTMLButtonElement)) { e.preventDefault(); play(!playing); } }
    else if (k === ',') { e.preventDefault(); step(-1); } else if (k === '.') { e.preventDefault(); step(1); }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setPlaying(false); seek(frame + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1)); }
    else if (e.code === 'KeyM' && !e.repeat) { e.preventDefault(); mark(); }
    else if (e.code === 'KeyZ' && !e.repeat) { e.preventDefault(); setZoom((z) => ({ ...z, on: !z.on })); }
  });
  const now = cctv.start + frame, found = cctv.found.length;
  return <div className="st st-modal-backdrop dark">
    <section ref={ref} className="st-cctv" role="dialog" aria-modal="true" aria-labelledby="st-cctv-title">
      <header className="st-cctv-head">
        <div><small>ĐẦU GHI CAMERA · {cctv.place}</small><h2 id="st-cctv-title">{cctv.title}</h2><p>{cctv.goal}</p></div>
        <span className={`st-cctv-count ${found >= cctv.needed ? 'done' : ''}`} aria-live="polite"><Flag size={14} aria-hidden="true" />Đã tìm {found}/{cctv.needed}</span>
        <CloseButton onClick={close} label="Đóng đầu ghi" hint="Esc" />
      </header>
      <div className={`st-monitor ${zoom.on ? 'zoomed' : ''}`} onClick={(e) => { if (!zoom.on) return; const r = e.currentTarget.getBoundingClientRect(); setZoom({ on: true, x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }); }}>
        <canvas ref={canvas} width={640} height={360} style={zoom.on ? { transform: 'scale(2)', transformOrigin: `${zoom.x * 100}% ${zoom.y * 100}%` } : undefined} role="img" aria-label={`Khung hình camera lúc ${clockLabel(now)}`} />
        <span className="st-osd tl">{cctv.camera}</span>
        <span className="st-osd tr">{playing ? <><i className="rec" />PLAY {speed < 0 ? `◀◀ ${-speed}×` : `${speed}×`}</> : 'II PAUSE'}{zoom.on ? ' · ×2' : ''}</span>
        <span className="st-osd br">{clockLabel(now)}</span>
        {cctv.feedback && <p key={cctv.feedback.seq} className={`st-cctv-feedback ${cctv.feedback.ok ? 'ok' : 'no'}`} role="status">{cctv.feedback.text}</p>}
      </div>
      <div className="st-scrub">
        <div className="st-timeline">
          <input type="range" min={0} max={dur} step={1 / fps} value={frame} onChange={(e) => { setPlaying(false); seek(+e.target.value); }} aria-label="Dòng thời gian" aria-valuetext={clockLabel(now)} />
          {cctv.found.map((m) => <i key={m.id} className="st-tick" style={{ left: `${(m.t / dur) * 100}%` }} title={`${clockLabel(cctv.start + m.t)} — ${m.label}`} />)}
          <span className="ends" aria-hidden="true"><small>{clockLabel(cctv.start)}</small><small>{clockLabel(cctv.start + dur)}</small></span>
        </div>
        <div className="st-transport">
          <button type="button" onClick={() => { setPlaying(false); seek(frame - 10); }} aria-label="Lùi 10 giây"><ChevronsLeft size={18} /></button>
          <button type="button" onClick={() => step(-1)} aria-label="Lùi một khung"><StepBack size={18} /></button>
          <button type="button" className="play" onClick={() => play(!playing)} aria-label={playing ? 'Tạm dừng' : 'Phát'}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
          <button type="button" onClick={() => step(1)} aria-label="Tới một khung"><StepForward size={18} /></button>
          <button type="button" onClick={() => { setPlaying(false); seek(frame + 10); }} aria-label="Tới 10 giây"><ChevronsRight size={18} /></button>
          <span className="st-speeds" role="radiogroup" aria-label="Tốc độ phát">{SPEEDS.map((s) => <button type="button" key={s} role="radio" aria-checked={speed === s} className={speed === s ? 'on' : ''} onClick={() => { setSpeed(s); play(true, s); }}>{s < 0 ? `◀◀${-s}×` : `${s}×`}</button>)}</span>
          <button type="button" className={`zoom ${zoom.on ? 'on' : ''}`} aria-pressed={zoom.on} onClick={() => setZoom((z) => ({ ...z, on: !z.on }))}><ZoomIn size={16} aria-hidden="true" />×2</button>
          <button type="button" className="mark" onClick={mark}><Flag size={16} aria-hidden="true" />Đánh dấu</button>
        </div>
        <ul className="st-found">{cctv.found.map((m) => <li key={m.id}><button type="button" onClick={() => { setPlaying(false); seek(m.t); }}><b>{clockLabel(cctv.start + m.t)}</b>{m.label}</button></li>)}
          {found < cctv.needed && <li className="todo">{cctv.hint ?? 'Còn khoảnh khắc chưa tìm ra…'}</li>}</ul>
        <p className="st-cctv-keys"><Key>Space</Key> phát/dừng · <Key>,</Key> <Key>.</Key> từng khung · <Key>←</Key> <Key>→</Key> 1 giây · <Key>Z</Key> phóng to (bấm lên hình để chọn chỗ) · <Key>M</Key> đánh dấu</p>
      </div>
    </section>
  </div>;
}
