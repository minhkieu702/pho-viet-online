"use client";
// The single mount point for the story UI (page.tsx renders <StoryLayer view={…} onAction={…}/> once).
// It composes the objective card, call widget and toasts (left column), the stealth HUD, the story prompt chip,
// the cinema layer, touch buttons and the modal screens (phone, SỔ TAY, BẢNG MANH MỐI, CCTV, interrogation, menu,
// pause, result). Everything is driven by StoryView; every input goes back as a StoryUiAction.
import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from 'react';
import { BookOpen, Check, ClipboardCheck, Clock3, Flag, Info, Save, TriangleAlert } from 'lucide-react';
import CinemaOverlay from './CinemaOverlay';
import CctvScrubber, { type CctvFrameRenderer } from './CctvScrubber';
import DeductionBoard from './DeductionBoard';
import Interrogation from './Interrogation';
import Journal, { Medal } from './Journal';
import LunarStrip from './LunarStrip';
import Phone, { CallWidget } from './Phone';
import StealthHud from './StealthHud';
import StoryMenu from './ChapterSelect';
import TouchStory from './TouchStory';
import { chapterEyebrow, clamp01, mmss, money } from './format';
import type { StoryStore } from './store';
import { Bar, Key, useModal, type Css } from './ui';
import type { MeterView, ObjectiveView, PauseView, PortraitMap, ResultView, StoryPrompt, StorySettings, StoryUiAction, StoryUiView, ToastView } from './types';

type Act = (a: StoryUiAction) => void;

/** Subscribe to a story store (see store.ts). */
export function useStoryView<T extends object = StoryUiView>(store: StoryStore<T>): T { return useSyncExternalStore(store.subscribe, store.get, store.get); }

/** Class names page.tsx can add to .app-shell to hide the free-roam HUD (mirrors .in-shop). */
export function storyShellClass(view: StoryUiView | null) {
  if (!view) return '';
  const modal = !!(view.journal || view.board || view.cctv || view.interrogation || view.menu || view.pause || view.result || (view.phone?.open));
  return ['in-story', view.cine?.mode ? 'in-cine' : '', modal ? 'in-story-modal' : ''].filter(Boolean).join(' ');
}

const METER_TONE: Record<MeterView['kind'], 'ink' | 'orange' | 'red' | 'green' | 'gold' | 'blue'> = { suspicion: 'red', tail: 'green', eavesdrop: 'blue', detection: 'red', pressure: 'orange', carry: 'ink', breath: 'blue', progress: 'orange', debt: 'gold' };

export function ObjectiveCard({ o }: { o: ObjectiveView }) {
  return <section className="st st-objective" aria-label="Mục tiêu cốt truyện">
    <header><small>{chapterEyebrow(o.chapter)} · {o.chapterTitle}</small><b>{o.mission}</b>
      {o.timer && <span className={`st-otimer ${o.timer.urgent ? 'urgent' : ''}`} aria-label={`${o.timer.label}: ${mmss(o.timer.seconds)}`}><Clock3 size={12} aria-hidden="true" />{mmss(o.timer.seconds)}</span>}</header>
    <p className="st-oobj">{o.objective}</p>
    {o.checklist.length > 0 && <ul className="st-ocheck">{o.checklist.map((c, i) => <li key={i} className={`${c.done ? 'done' : ''} ${c.optional ? 'opt' : ''}`}><i aria-hidden="true">{c.done && <Check size={10} />}</i>{c.text}{c.optional && <em> (tùy chọn)</em>}{c.done && <span className="st-sr"> — xong</span>}</li>)}</ul>}
    {o.meters.length > 0 && <div className="st-ometers">{o.meters.map((m) => <div key={m.id} className={`st-ometer k-${m.kind}`}><span>{m.label}</span><Bar value={m.value} band={m.band} tone={METER_TONE[m.kind]} label={m.label} text={m.text} /><small>{m.text ?? `${Math.round(clamp01(m.value) * 100)}%`}</small></div>)}</div>}
    {(o.chips?.length || o.tally) && <p className="st-ochips">{o.chips?.map((c) => <span key={c}>{c}</span>)}{o.tally && <span className="tally">Hạ gục {o.tally.knockouts} · Giết {o.tally.kills}</span>}</p>}
    {o.lunar && <LunarStrip lunar={o.lunar} compact />}
  </section>;
}

function Toast({ t, onAction }: { t: ToastView; onAction: Act }) {
  const dismiss = useEffectEvent(() => onAction({ type: 'toast', seq: t.seq }));
  useEffect(() => { const id = setTimeout(() => dismiss(), 4500); return () => clearTimeout(id); }, [t.seq]);
  const I = t.kind === 'evidence' ? ClipboardCheck : t.kind === 'checkpoint' ? Save : t.kind === 'journal' ? BookOpen : t.kind === 'warn' ? TriangleAlert : Info;
  return <li className={`st-toast k-${t.kind}`}><I size={16} aria-hidden="true" /><div><b>{t.title}</b>{t.text && <span>{t.text}</span>}</div></li>;
}

export function PromptChip({ p }: { p: StoryPrompt }) {
  const C = 2 * Math.PI * 11, prog = p.progress != null ? clamp01(p.progress) : null;
  return <div className={`st st-prompt ${p.dim ? 'dim' : ''}`} role="status">
    {p.key && <span className="k">{prog != null && <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - prog)).toFixed(1)} /></svg>}<Key>{p.key === 'Giữ E' ? 'E' : p.key}</Key></span>}
    <span>{p.key === 'Giữ E' && <em>Giữ · </em>}<b>{p.verb}</b> {p.label}</span>
  </div>;
}

const SEG = <K extends keyof StorySettings>(k: K, opts: [StorySettings[K], string][], s: StorySettings, onAction: Act, label: string) =>
  <div className="st-setting"><span id={`set-${String(k)}`}>{label}</span><span className="st-seg" role="radiogroup" aria-labelledby={`set-${String(k)}`}>{opts.map(([v, l]) => <button type="button" key={String(v)} role="radio" aria-checked={s[k] === v} className={s[k] === v ? 'on' : ''} onClick={() => onAction({ type: 'settings', patch: { [k]: v } as Partial<StorySettings> })}>{l}</button>)}</span></div>;

export function PauseSheet({ pause, settings, onAction }: { pause: PauseView; settings: StorySettings; onAction: Act }) {
  const ref = useRef<HTMLElement>(null);
  useModal(ref, () => onAction({ type: 'pause', item: 'resume' }));
  const toggle = (k: 'reduceShake' | 'reduceFlash' | 'autoChoke' | 'noiseRing', label: string) => <label className="st-toggle"><input type="checkbox" checked={settings[k]} onChange={(e) => onAction({ type: 'settings', patch: { [k]: e.target.checked } })} /><i aria-hidden="true" />{label}</label>;
  return <div className="st st-modal-backdrop">
    <section ref={ref} className="st-pause" role="dialog" aria-modal="true" aria-labelledby="st-pause-title">
      <h2 id="st-pause-title">Tạm dừng</h2>
      <div className="st-pause-items">
        <button type="button" className="st-primary" onClick={() => onAction({ type: 'pause', item: 'resume' })} data-autofocus>Tiếp tục <Key>Esc</Key></button>
        {pause.context === 'scene' && pause.canSkip && <button type="button" className="st-secondary" onClick={() => onAction({ type: 'pause', item: 'skipScene' })}>Bỏ qua cảnh này</button>}
        {pause.context !== 'scene' && <><button type="button" className="st-secondary" onClick={() => onAction({ type: 'pause', item: 'journal' })}>Sổ tay <Key>J</Key></button><button type="button" className="st-secondary" onClick={() => onAction({ type: 'pause', item: 'board' })}>Bảng manh mối</button></>}
        {pause.canRetry && <button type="button" className="st-secondary" onClick={() => onAction({ type: 'pause', item: 'retry' })}>Thử lại từ điểm lưu</button>}
        <button type="button" className="st-secondary quiet" onClick={() => onAction({ type: 'pause', item: 'quit' })}>Về menu chính</button>
      </div>
      <h3>Cài đặt</h3>
      {SEG('subtitleSize', [['S', 'Nhỏ'], ['M', 'Vừa'], ['L', 'Lớn']], settings, onAction, 'Cỡ phụ đề')}
      {SEG('readSpeed', [['slow', 'Chậm'], ['normal', 'Vừa'], ['fast', 'Nhanh']], settings, onAction, 'Tốc độ đọc')}
      {SEG('actionCams', [['on', 'Bật'], ['less', 'Ít'], ['off', 'Tắt']], settings, onAction, 'Cảnh quay hành động')}
      {SEG('cones', [['always', 'Luôn'], ['observe', 'Khi quan sát'], ['off', 'Tắt']], settings, onAction, 'Hiện tầm nhìn lính canh')}
      <div className="st-toggles">{toggle('reduceShake', 'Giảm rung')}{toggle('reduceFlash', 'Giảm nhấp nháy')}{toggle('autoChoke', 'Khóa cổ tự động')}{toggle('noiseRing', 'Vòng tiếng động')}</div>
    </section>
  </div>;
}

export function ResultCard({ r, onAction }: { r: ResultView; onAction: Act }) {
  const ref = useRef<HTMLElement>(null);
  useModal(ref, () => onAction({ type: 'result', op: r.kind === 'complete' ? 'continue' : 'retry' }));
  const ok = r.kind === 'complete';
  return <div className="st st-modal-backdrop">
    <section ref={ref} className={`st-result ${r.kind}`} role="dialog" aria-modal="true" aria-labelledby="st-result-title">
      <small className="st-eyebrow"><i />{ok ? 'HOÀN THÀNH' : 'CHƯA XONG'}</small>
      <h2 id="st-result-title">{r.mission}</h2>
      {!ok && r.reason && <p className="st-result-reason">{r.reason}</p>}
      {ok && r.grade && <span className={`st-grade big g-${r.grade}`} aria-label={`Hạng ${r.grade}`}>{r.grade}</span>}
      <dl className="st-stats">{r.seconds != null && <div><dt>Thời gian</dt><dd>{mmss(r.seconds)}</dd></div>}<div><dt>Bị phát hiện</dt><dd>{r.detections}</dd></div><div><dt>Hạ gục</dt><dd>{r.knockouts}</dd></div><div><dt>Lấy mạng</dt><dd className={r.kills ? 'bad' : ''}>{r.kills}</dd></div></dl>
      {ok && r.medals.length > 0 && <p className="st-result-medals">{r.medals.map((m) => <Medal key={m} id={m} />)}</p>}
      {ok && r.reward ? <p className="st-result-reward">+{money(r.reward)}</p> : null}
      {r.clues.length > 0 && <ul className="st-result-clues">{r.clues.map((c) => <li key={c}><Flag size={12} aria-hidden="true" />{c}</li>)}</ul>}
      <div className="st-result-actions">
        {ok ? <button type="button" className="st-primary" onClick={() => onAction({ type: 'result', op: 'continue' })} data-autofocus>Tiếp tục</button>
          : <button type="button" className="st-primary" onClick={() => onAction({ type: 'result', op: 'retry' })} data-autofocus>Thử lại từ điểm lưu</button>}
        {ok && r.canRetry && <button type="button" className="st-secondary" onClick={() => onAction({ type: 'result', op: 'retry' })}>Chơi lại</button>}
        <button type="button" className="st-secondary quiet" onClick={() => onAction({ type: 'result', op: 'quit' })}>Về menu chính</button>
      </div>
    </section>
  </div>;
}

type Props = {
  view: StoryUiView; portraits?: PortraitMap; onAction: Act;
  /** draws CCTV footage frames (engine render target or 2D drawing) */ renderCctvFrame?: CctvFrameRenderer;
  /** true when the engine handles cinema keys itself (Space hold, E/Enter advance, 1-3, QTE keys) */ engineKeys?: boolean;
  /** touch layout: long-press skip, story touch buttons (default: detected by CSS pointer:coarse) */ touch?: boolean;
};

export default function StoryLayer({ view, portraits, onAction, renderCctvFrame, engineKeys = false, touch = false }: Props) {
  const cine = view.cine?.mode ? view.cine : null;
  const modal = !!(view.journal || view.board || view.cctv || view.interrogation || view.menu || view.pause || view.result);
  const call = view.phone?.call && !view.phone.open ? view.phone.call : null;
  return <div className={`st st-layer ${cine ? 'cine' : ''} ${view.stealth && !cine ? 'has-stealth' : ''} ${view.talk.length && !cine ? 'talking' : ''}`} style={{ '--sub-scale': view.settings.subtitleSize === 'S' ? 0.86 : view.settings.subtitleSize === 'L' ? 1.2 : 1 } as Css}>
    {!cine && <div className="st-left">
      {view.objective && <ObjectiveCard o={view.objective} />}
      {call && <CallWidget call={call} portraits={portraits} onAction={onAction} />}
    </div>}
    {!cine && view.toasts.length > 0 && <ul className="st-toasts" aria-live="polite">{view.toasts.slice(-3).map((t) => <Toast key={t.seq} t={t} onAction={onAction} />)}</ul>}
    {!cine && view.stealth && <StealthHud stealth={view.stealth} settings={view.settings} />}
    {!cine && view.prompt && <PromptChip p={view.prompt} />}
    <CinemaOverlay cine={view.cine} talk={view.talk} portraits={portraits} settings={view.settings} touch={touch} hotkeys={!engineKeys && !modal} onAction={onAction} />
    {!cine && !modal && view.touch && view.touch.length > 0 && <TouchStory buttons={view.touch} force={touch} onAction={onAction} />}
    {view.phone?.open && !modal && <Phone phone={view.phone} portraits={portraits} lunar={view.objective?.lunar} onAction={onAction} />}
    {view.journal && <Journal journal={view.journal} portraits={portraits} onAction={onAction} />}
    {view.board && <DeductionBoard board={view.board} onAction={onAction} />}
    {view.cctv && <CctvScrubber cctv={view.cctv} renderFrame={renderCctvFrame} onAction={onAction} />}
    {view.interrogation && <Interrogation view={view.interrogation} portraits={portraits} onAction={onAction} />}
    {view.result && <ResultCard r={view.result} onAction={onAction} />}
    {view.pause && <PauseSheet pause={view.pause} settings={view.settings} onAction={onAction} />}
    {view.menu && <StoryMenu menu={view.menu} onAction={onAction} />}
  </div>;
}
