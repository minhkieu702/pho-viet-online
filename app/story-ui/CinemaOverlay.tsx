"use client";
// The cinema layer: letterbox bars (gradients on portrait phones), subtitles with speaker names, portraits and channel
// icons, the hold-to-skip ring, chapter/title/time/location/intro/objective cards, choices (scene, SMS, licence plates,
// a guard's bluff question), the QTE prompt, the paper examine view and the split-call divider.
// Subtitles render outside cutscenes too (gameplay lines sit above the interaction hint).
import { useRef, useState } from 'react';
import { Ear, MessageSquare, Phone, Radio, StickyNote, Tv } from 'lucide-react';
import QtePrompt from './QtePrompt';
import { plateRows } from './format';
import { CloseButton, Key, Portrait, useKeys, useModal, type Css } from './ui';
import type { CardView, Channel, ChoiceOptionView, ChoiceView, CinemaView, NoteView, PortraitMap, StorySettings, StoryUiAction, SubtitleLine } from './types';

const CHANNEL_ICON: Partial<Record<Channel, typeof Phone>> = { phone: Phone, radio: Radio, overheard: Ear, tv: Tv, sms: MessageSquare, note: StickyNote };
const optText = (o: ChoiceOptionView) => (typeof o === 'string' ? o : o.text);
const optId = (o: ChoiceOptionView) => (typeof o === 'string' ? undefined : o.id);
/** Petals light from the centre outwards, one per finished chapter. */
export const PETAL_ORDER = [5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10];
const CHANNEL_LABEL: Partial<Record<Channel, string>> = { phone: 'qua điện thoại', radio: 'qua bộ đàm', overheard: 'nghe lén', tv: 'trên TV', sms: 'tin nhắn', note: 'ghi chú' };

type Props = {
  cine: CinemaView | null; talk: SubtitleLine[]; portraits?: PortraitMap;
  settings?: Pick<StorySettings, 'subtitleSize' | 'subtitleBg'>;
  /** show the touch skip button and tappable choices */ touch?: boolean;
  /** false when the engine already handles Space/E/Enter/1-3/QTE keys (cine.key) */ hotkeys?: boolean;
  onAction: (a: StoryUiAction) => void;
};

export default function CinemaOverlay({ cine, talk, portraits, settings, touch = false, hotkeys = true, onAction }: Props) {
  const bars = cine?.bars ?? 0, blocking = !!(cine?.choice || cine?.qte || cine?.note);
  const canAdvance = cine?.mode === 'scene' && !blocking && !cine.paused;
  useKeys((e, down) => {
    if (!cine || cine.paused) return;
    if ((e.code === 'Space' || e.key === ' ') && cine.skippable && !blocking) { e.preventDefault(); if (!e.repeat) onAction({ type: 'skipHold', down }); return; }
    if (down && !e.repeat && canAdvance && (e.key === 'Enter' || e.code === 'KeyE')) { e.preventDefault(); onAction({ type: 'advance' }); }
  }, hotkeys && !!cine);
  const style: Css = { '--bars': bars, '--sub-bg': settings?.subtitleBg ?? 0.35 };
  return <div className={`st st-cine ${cine?.mode ? 'on' : ''} ${bars ? 'boxed' : ''} sub-${settings?.subtitleSize ?? 'M'} ${cine?.grade ? `g-${cine.grade}` : ''}`} style={style}>
    {cine?.grade && cine.grade !== 'none' && <div className="st-vignette" aria-hidden="true" />}
    {cine?.mode && <div className="st-bars" aria-hidden="true"><i className="top" /><i className="bot" /></div>}
    {canAdvance && <button type="button" className="st-advance" aria-label="Lời thoại tiếp theo" onClick={() => onAction({ type: 'advance' })} />}
    {cine?.split && <div className="st-split" aria-hidden="true"><span>{cine.split.left}</span><i /><span>{cine.split.right}</span></div>}
    <Subtitles lines={talk} portraits={portraits} />
    {cine?.card && <Card key={cine.card.seq} card={cine.card} />}
    {cine?.choice && <Choice key={cine.choice.seq} choice={cine.choice} portraits={portraits} hotkeys={hotkeys} onAction={onAction} />}
    {cine?.qte && <QtePrompt key={cine.qte.seq} qte={cine.qte} hotkeys={hotkeys} onAction={onAction} />}
    {cine?.note && <Note key={cine.note.seq} note={cine.note} onClose={() => onAction({ type: 'closeNote', seq: cine.note!.seq })} />}
    {cine?.skippable && !blocking && <SkipRing hold={cine.skipHold} hint={cine.skipHint} touch={touch} onHold={(down) => onAction({ type: 'skipHold', down })} />}
  </div>;
}

export function Subtitles({ lines, portraits }: { lines: SubtitleLine[]; portraits?: PortraitMap }) {
  const shown = lines.slice(-2);
  return <div className="st-subs" role="log" aria-live="polite" aria-relevant="additions text">
    {shown.map((l) => {
      const Icon = CHANNEL_ICON[l.ch], inner = l.ch === 'inner' || l.ch === 'narrate' || l.italic;
      return <p key={l.id} className={`st-sub ch-${l.ch} ${inner ? 'inner' : ''}`} style={{ '--c': l.color } as Css}>
        {!inner && l.who && <Portrait who={l.who} name={l.name} color={l.color} portraits={portraits} size={40} />}
        <span className="st-sub-body">
          {!inner && <b className="st-sub-name">{l.name}{Icon && <Icon size={13} aria-label={CHANNEL_LABEL[l.ch]} />}</b>}
          <span className="st-sub-text">{inner ? <span className="st-sr">{l.name} nghĩ: </span> : null}{l.text}{l.cut ? '—' : ''}</span>
          {l.ch === 'overheard' && l.heard != null && <i className="st-sub-heard" style={{ width: `${Math.round(l.heard * 100)}%` }} aria-hidden="true" />}
        </span>
      </p>;
    })}
  </div>;
}

function Typewriter({ text, step = 0.045, delay = 0 }: { text: string; step?: number; delay?: number }) {
  const chars = [...text.normalize('NFC')];
  return <span className="st-type" aria-label={text}>{chars.map((c, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${delay + i * step}s` }}>{c}</span>)}</span>;
}

export function Card({ card }: { card: CardView }) {
  const style: Css = { '--c': card.color ?? '#db683f' };
  switch (card.kind) {
    case 'chapter': case 'title': return <section className={`st-card st-card-${card.kind}`} style={style} role="status" aria-live="polite">
      <ChapterLotus petals={card.petals ?? 0} />
      {card.eyebrow && <small>{card.eyebrow}</small>}
      <h2><Typewriter text={card.title} delay={0.5} /></h2>
      {card.sub && <p style={{ animationDelay: `${0.7 + [...card.title].length * 0.045}s` }}>{card.sub}</p>}
    </section>;
    case 'time': return <section className="st-card st-card-time" role="status" aria-live="polite"><h2><Typewriter text={card.title} step={0.07} /></h2>{card.sub && <p>{card.sub}</p>}</section>;
    case 'location': case 'place': return <section className="st-card st-card-location" style={style} role="status" aria-live="polite"><i /><div><b>{card.title}</b>{card.sub && <span>{card.sub}</span>}</div></section>;
    case 'intro': return <section className="st-card st-card-intro" style={style} role="status" aria-live="polite">{card.eyebrow && <small>{card.eyebrow}</small>}<h2>{card.title}</h2><i />{card.sub && <p>{card.sub}</p>}</section>;
    default: return <section className="st-card st-card-objective" role="status" aria-live="polite"><small>{card.eyebrow ?? 'MỤC TIÊU MỚI'}</small><b>{card.title}</b>{card.sub && <span>{card.sub}</span>}</section>;
  }
}

/** The chapter card lotus: 11 petals, one per chapter; lit petals bloom one after another. */
function ChapterLotus({ petals }: { petals: number }) {
  return <svg className="st-card-lotus" viewBox="-60 -64 120 80" aria-label={petals ? `${petals}/11 cánh sen` : undefined} aria-hidden={petals ? undefined : true} role={petals ? 'img' : undefined}>
    {Array.from({ length: 11 }, (_, i) => {
      const order = PETAL_ORDER.indexOf(i), on = order < petals;
      return <path key={i} className={on ? 'on' : ''} style={on ? { animationDelay: `${0.3 + order * 0.12}s` } : undefined} transform={`rotate(${(i - 5) * 12})`} d="M0 10C-8 -2 -8 -30 0 -52C8 -30 8 -2 0 10Z" />;
    })}
  </svg>;
}

function Choice({ choice, portraits, hotkeys, onAction }: { choice: ChoiceView; portraits?: PortraitMap; hotkeys: boolean; onAction: (a: StoryUiAction) => void }) {
  const [picked, setPicked] = useState<number | null>(choice.picked ?? null);
  const pick = (i: number) => { if (picked != null || i < 0 || i >= choice.options.length) return; setPicked(i); onAction({ type: 'choose', seq: choice.seq, index: i, id: optId(choice.options[i]) }); };
  useKeys((e, down) => { if (!down || e.repeat) return; const n = Number(e.key); if (n >= 1 && n <= choice.options.length) { e.preventDefault(); pick(n - 1); } }, hotkeys && picked == null);
  const sp = choice.speaker;
  return <section className={`st st-choice style-${choice.style} ${picked != null ? 'picked' : ''}`} aria-label={choice.prompt ?? 'Lựa chọn'}>
    {choice.style === 'bluff' && sp && <header className="st-choice-speaker" style={{ '--c': sp.color } as Css}><Portrait who={sp.id} name={sp.name} color={sp.color} portraits={portraits} size={34} /><div><b>{sp.name}</b>{choice.line && <p>“{choice.line}”</p>}</div></header>}
    {choice.style === 'sms' && sp && choice.line && <div className="st-sms-in" style={{ '--c': sp.color } as Css}><b>{sp.name}</b><p>{choice.line}</p></div>}
    {choice.prompt && <p className="st-choice-prompt">{choice.prompt}</p>}
    <div className="st-choice-list" role="group">
      {choice.options.map((raw, i) => { const o = optText(raw); return <button type="button" key={optId(raw) ?? i} className={picked === i ? 'on' : ''} disabled={picked != null && picked !== i} aria-pressed={picked === i} onClick={() => pick(i)}>
        <Key>{i + 1}</Key>
        {choice.style === 'plate' ? <span className="st-plate" aria-label={`Biển số ${o}`}>{plateRows(o).map((r, j) => <span key={j}>{r}</span>)}</span> : <span>{o}</span>}
      </button>; })}
    </div>
    {choice.timer ? <span className="st-timer" aria-hidden="true"><i style={{ animationDuration: `${choice.timer}s`, animationPlayState: picked != null ? 'paused' : 'running' }} /></span> : null}
  </section>;
}

function Note({ note, onClose }: { note: NoteView; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useModal(ref, onClose);
  // E puts the paper away from anywhere; Enter only when nothing is focused (a focused button handles its own Enter).
  useKeys((e, down) => { if (down && !e.repeat && (e.code === 'KeyE' || (e.key === 'Enter' && e.target === document.body))) { e.preventDefault(); onClose(); } });
  return <div className="st st-note-wrap">
    <section ref={ref} className={`st-note kind-${note.kind}`} role="dialog" aria-modal="true" aria-labelledby={`note-${note.seq}`} tabIndex={-1}>
      <h2 id={`note-${note.seq}`}>{note.title}</h2>
      <div className="st-note-lines">{note.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      {note.hand && <p className="st-note-hand">{note.hand}</p>}
      <CloseButton onClick={onClose} label="Đóng tờ giấy" hint="E" />
    </section>
    {note.caption && <p className="st-note-caption">{note.caption}</p>}
  </div>;
}

function SkipRing({ hold, hint, touch, onHold }: { hold: boolean; hint: boolean; touch: boolean; onHold: (down: boolean) => void }) {
  const visible = hold || hint || touch;
  const ring = <svg viewBox="0 0 36 36" aria-hidden="true"><circle className="track" cx="18" cy="18" r="15" /><circle key={hold ? 'h' : 'n'} className={`fill ${hold ? 'run' : ''}`} cx="18" cy="18" r="15" /></svg>;
  if (touch) return <button type="button" className={`st-skip touch ${hold ? 'hold' : ''}`} aria-label="Giữ để bỏ qua cảnh"
    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onHold(true); }} onPointerUp={() => onHold(false)} onPointerCancel={() => onHold(false)} onContextMenu={(e) => e.preventDefault()}>{ring}<span>Giữ để bỏ qua</span></button>;
  return <div className={`st-skip ${visible ? 'show' : ''} ${hold ? 'hold' : ''}`} aria-hidden={!visible}>{ring}<span>Giữ <Key>SPACE</Key> để bỏ qua</span></div>;
}
