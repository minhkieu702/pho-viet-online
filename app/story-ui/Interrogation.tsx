"use client";
// Present-evidence interrogation (c8-m1 Diễm), the UI over the runner's interrogation table (app/game/story/
// interrogation.ts). The subject makes statements one at a time; for each, pick an evidence card and either accuse
// ('Vạch trần', settles a lie) or show understanding ('Thấu hiểu', settles a truth). 'Nói rõ hơn đi' presses (raises
// pressure, may open a hidden statement); the bluff claims proof you do not show. A wrong card makes the subject go
// silent for a few seconds (a time cost, never a fail). The runner judges; this view only presents.
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Drama, HandHeart, MessageCircleQuestion, MessageSquareQuote, Scale } from 'lucide-react';
import { EvidenceArt } from './Journal';
import { CloseButton, Bar, Portrait, useModal, type Css } from './ui';
import type { Approach, InterrogationView, PortraitMap, StoryUiAction } from './types';

type Act = (a: StoryUiAction) => void;

/** Seconds left of a silence, counted locally from its seq (render with key={shut.seq}). */
function ShutCountdown({ seconds, name, onDone }: { seconds: number; name: string; onDone: () => void }) {
  const [left, setLeft] = useState(Math.max(1, Math.ceil(seconds)));
  const done = useEffectEvent(onDone);
  useEffect(() => { const id = setTimeout(() => (left <= 1 ? done() : setLeft(left - 1)), 1000); return () => clearTimeout(id); }, [left]);
  return <div className="st-shut" role="status" aria-live="polite"><b>{name} im lặng, quay mặt đi…</b><span>{left}</span></div>;
}

export default function Interrogation({ view, portraits, onAction }: { view: InterrogationView; portraits?: PortraitMap; onAction: Act }) {
  const ref = useRef<HTMLElement>(null), log = useRef<HTMLOListElement>(null);
  const close = () => onAction({ type: 'interrogation', op: 'close' });
  useModal(ref, close);
  const [pick, setPick] = useState<string | null>(null);
  const [shutDone, setShutDone] = useState<number | null>(null);
  const shut = view.shut && shutDone !== view.shut.seq ? view.shut : null;
  const current = view.statements.find((s) => s.state === 'current') ?? null, sp = view.subject;
  const present = (approach: Approach) => { if (pick && !shut) { onAction({ type: 'interrogation', op: 'present', evidence: pick, approach }); setPick(null); } };
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [view.lines.length]);
  const markDone = (seq: number) => () => setShutDone(seq);
  return <div className="st st-modal-backdrop">
    <section ref={ref} className={`st-interro ${shut ? 'is-shut' : ''}`} role="dialog" aria-modal="true" aria-labelledby="st-interro-title" style={{ '--c': sp.color } as Css}>
      <header className="st-interro-head"><div><small>ĐỐI CHẤT · {view.place}</small><h2 id="st-interro-title">{view.topic}</h2></div><CloseButton onClick={close} label="Rời cuộc nói chuyện" hint="Esc" /></header>
      <aside className="st-subject">
        <Portrait who={sp.id} name={sp.name} color={sp.color} portraits={portraits} size={88} />
        <b>{sp.name}</b>{sp.role && <small>{sp.role}</small>}
        <div className="st-composure"><span>Phòng thủ</span><Bar value={view.composure} tone={view.composure > 0.66 ? 'red' : view.composure > 0.33 ? 'orange' : 'green'} label="Mức phòng thủ" text={view.composure > 0.66 ? 'Rất dè chừng' : view.composure > 0.33 ? 'Đang lung lay' : 'Đã mở lòng'} /></div>
        {view.pressure != null && <div className="st-composure"><span>Sức ép</span><Bar value={view.pressure} tone="blue" label="Sức ép" /></div>}
        <ol className="st-statements" aria-label="Những lời khai">{view.statements.map((s, i) => <li key={s.id} className={s.state}><i aria-hidden="true">{i + 1}</i><span>{s.state === 'pending' ? 'Chưa nói tới' : s.text}</span><em>{s.state === 'broken' ? 'Đã vạch trần' : s.state === 'true' ? 'Sự thật' : s.state === 'current' ? 'Đang nói' : ''}</em></li>)}</ol>
      </aside>
      <div className="st-interro-main">
        <ol ref={log} className="st-interro-log" aria-live="polite">{view.lines.map((l) => <li key={l.id} className={l.who}>
          {l.who === 'subject' && <Portrait who={sp.id} name={sp.name} color={sp.color} portraits={portraits} size={26} />}
          <p>{l.card && <span className="st-shown">Đưa ra: {l.card}</span>}{l.text}</p></li>)}</ol>
        {current && !view.outcome && <blockquote className="st-claim"><MessageSquareQuote size={18} aria-hidden="true" /><p>“{current.text}”</p></blockquote>}
        {view.feedback && <p key={view.feedback.seq} className={`st-interro-feedback ${view.feedback.kind}`} role="status">{view.feedback.text}</p>}
        {view.outcome === 'talks' ? <div className="st-interro-end"><b>{sp.name} chịu nói rồi.</b><button type="button" className="st-primary" onClick={close} data-autofocus>Tiếp tục</button></div> : <>
          <p className="st-interro-ask" id="st-ev-label">Đưa ra bằng chứng nào?</p>
          <ul className="st-interro-ev" role="listbox" aria-labelledby="st-ev-label">{view.evidence.map((c) => <li key={c.id} role="option" aria-selected={pick === c.id}>
            <button type="button" className={pick === c.id ? 'on' : ''} disabled={!!shut} onClick={() => setPick(pick === c.id ? null : c.id)}><EvidenceArt card={c} /><span><b>{c.title}</b>{c.sub && <small>{c.sub}</small>}</span></button></li>)}</ul>
          <div className="st-interro-actions">
            <button type="button" className="accuse" disabled={!pick || !!shut} onClick={() => present('accuse')}><Scale size={16} aria-hidden="true" /><span><b>Vạch trần</b><small>Chỉ ra chỗ không thật</small></span></button>
            <button type="button" className="empathy" disabled={!pick || !!shut} onClick={() => present('empathy')}><HandHeart size={16} aria-hidden="true" /><span><b>Thấu hiểu</b><small>Đưa ra nhẹ nhàng, nói thật lòng</small></span></button>
          </div>
          {(view.canPress !== false || view.canBluff !== false) && <div className="st-interro-more">
            {view.canPress !== false && <button type="button" disabled={!!shut} onClick={() => onAction({ type: 'interrogation', op: 'press' })}><MessageCircleQuestion size={14} aria-hidden="true" />Nói rõ hơn đi</button>}
            {view.canBluff !== false && <button type="button" disabled={!!shut} onClick={() => onAction({ type: 'interrogation', op: 'bluff' })} title="Làm như đã có bằng chứng. Chỉ ăn thua khi người kia đã bị dồn đủ."><Drama size={14} aria-hidden="true" />Nói như đã có bằng chứng</button>}
          </div>}
        </>}
        {shut && <ShutCountdown key={shut.seq} seconds={shut.seconds} name={sp.name} onDone={markDone(shut.seq)} />}
      </div>
    </section>
  </div>;
}
