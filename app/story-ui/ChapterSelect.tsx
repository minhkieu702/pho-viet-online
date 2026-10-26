"use client";
// The story menu ('Cốt truyện: Sen Trong Bùn'): continue, a new game (slot, then difficulty, overwrite warning), the
// one-time content note, and ChapterSelect — chapters locked until reached (titles hidden, no spoilers), missions with
// medals, grades and best times, 'Chơi lại' for a mission and 'Chơi lại chương'.
import { useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Clock3, Lock, Play, RotateCcw, ShieldAlert } from 'lucide-react';
import { Medal } from './Journal';
import { DIFFICULTY_LABEL, MEDALS, chapterEyebrow, mmss } from './format';
import { CloseButton, LotusMark, useModal } from './ui';
import type { ChapterEntry, Difficulty, MedalId, SlotView, StoryMenuView, StoryUiAction } from './types';

type Act = (a: StoryUiAction) => void;
const playTime = (s?: number) => (s == null ? '' : s < 3600 ? `${Math.max(1, Math.round(s / 60))} phút` : `${Math.floor(s / 3600)} giờ ${Math.round((s % 3600) / 60)} phút`);

export function ChapterSelect({ chapters, onAction }: { chapters: ChapterEntry[]; onAction: Act }) {
  const current = chapters.find((c) => c.state === 'current')?.n ?? null;
  const [open, setOpen] = useState<number | null>(current);
  return <ol className="st-chapters">{chapters.map((c) => {
    const locked = c.state === 'locked', expanded = open === c.n && !locked;
    return <li key={c.n} className={`st-chapter ${c.state} ${expanded ? 'open' : ''}`}>
      <button type="button" className="st-chapter-head" disabled={locked} aria-expanded={locked ? undefined : expanded} aria-controls={`ch-${c.n}`} onClick={() => setOpen(expanded ? null : c.n)}>
        <span className="num">{String(c.n).padStart(2, '0')}</span>
        <span className="t"><small>{chapterEyebrow(c.n)} · {locked ? '???' : c.lunar}</small><b>{locked ? 'Chưa mở' : c.title}</b></span>
        {locked ? <Lock size={15} aria-label="Chưa mở" /> : <><span className="medals" aria-label="Huy hiệu đã đạt">{c.missions.reduce((n, m) => n + m.medals.length, 0)}/{c.missions.length * 4}</span><ChevronDown size={16} className="chev" aria-hidden="true" /></>}
      </button>
      {expanded && <div id={`ch-${c.n}`} className="st-chapter-body">
        <p>{c.summary}</p>
        <ul>{c.missions.map((m) => <li key={m.id} className={m.state}>
          <div><b>{m.title}</b><small><Clock3 size={11} aria-hidden="true" />{m.minutes} phút{m.best != null ? ` · tốt nhất ${mmss(m.best)}` : ''}</small></div>
          <span className="medals">{(Object.keys(MEDALS) as MedalId[]).map((id) => <Medal key={id} id={id} on={m.medals.includes(id)} />)}</span>
          <span className={`st-grade g-${m.grade ?? 'none'}`} aria-label={m.grade ? `Hạng ${m.grade}` : 'Chưa xếp hạng'}>{m.grade ?? '—'}</span>
          <button type="button" disabled={m.state === 'locked'} onClick={() => onAction({ type: 'menu', op: 'replay', mission: m.id })}><RotateCcw size={13} aria-hidden="true" />Chơi lại</button>
        </li>)}</ul>
        <button type="button" className="st-primary" onClick={() => onAction({ type: 'menu', op: 'replayChapter', chapter: c.n })}><Play size={14} aria-hidden="true" />Chơi lại chương {c.n}</button>
        <small className="st-replay-note">Chơi lại không đổi tiến độ chính — chỉ giữ huy hiệu và thời gian tốt nhất.</small>
      </div>}
    </li>;
  })}</ol>;
}

function Slot({ s, picked, onPick }: { s: SlotView; picked?: boolean; onPick?: () => void }) {
  const body = <><span className="n">{s.index + 1}</span><span className="t"><b>{s.empty ? 'Ô trống' : s.label}</b><small>{s.empty ? 'Chưa có tiến độ' : `${s.percent ?? 0}% · ${playTime(s.playSeconds)}${s.difficulty ? ` · ${DIFFICULTY_LABEL[s.difficulty].label}` : ''}${s.updated ? ` · ${s.updated}` : ''}`}</small></span></>;
  return onPick ? <button type="button" role="radio" aria-checked={picked} className={`st-slot ${s.empty ? 'empty' : ''} ${picked ? 'on' : ''}`} onClick={onPick}>{body}</button> : <div className={`st-slot ${s.empty ? 'empty' : ''}`}>{body}</div>;
}

export default function StoryMenu({ menu, onAction }: { menu: StoryMenuView; onAction: Act }) {
  const ref = useRef<HTMLElement>(null);
  const close = () => (menu.screen === 'main' ? onAction({ type: 'menu', op: 'close' }) : onAction({ type: 'menu', op: 'screen', screen: 'main' }));
  useModal(ref, close);
  const last = menu.lastSlot != null ? menu.slots.find((s) => s.index === menu.lastSlot && !s.empty) : null;
  const [slot, setSlot] = useState(() => menu.slots.find((s) => s.empty)?.index ?? 0);
  const [diff, setDiff] = useState<Difficulty>('thuong');
  const target = menu.slots.find((s) => s.index === slot);
  const back = <button type="button" className="st-back" onClick={() => onAction({ type: 'menu', op: 'screen', screen: 'main' })}><ArrowLeft size={15} aria-hidden="true" />Quay lại</button>;
  return <div className="st st-modal-backdrop">
    <section ref={ref} className={`st-menu screen-${menu.screen}`} role="dialog" aria-modal="true" aria-labelledby="st-menu-title">
      <CloseButton onClick={() => onAction({ type: 'menu', op: 'close' })} label="Đóng menu cốt truyện" hint="Esc" />
      <header className="st-menu-head"><LotusMark petals={menu.petals} size={58} /><div><small className="st-eyebrow"><i />CỐT TRUYỆN</small><h2 id="st-menu-title">{menu.screen === 'chapters' ? 'Chọn chương' : menu.screen === 'new' ? 'Chơi mới' : 'Sen Trong Bùn'}</h2>{menu.screen === 'main' && <p>Một cậu shipper, một tờ hóa đơn lúc nửa đêm.</p>}</div></header>
      {!menu.contentNote ? <div className="st-content-note" role="note">
        <ShieldAlert size={20} aria-hidden="true" />
        <div><b>Trước khi bắt đầu</b><p>Câu chuyện hư cấu có đề cập tới nạn buôn người, ma túy và bạo lực. Không có cảnh bạo lực tình dục, không có hình ảnh ghê rợn và không hướng dẫn phạm pháp. Các nạn nhân luôn được đối xử tôn trọng. Mọi nhân vật, công ty, tổ chức trong truyện đều là hư cấu.</p>
          <button type="button" className="st-primary" onClick={() => onAction({ type: 'menu', op: 'acceptNote' })} data-autofocus>Tôi hiểu, tiếp tục</button></div>
      </div> : menu.screen === 'main' ? <>
        <div className="st-menu-actions">
          {last && <button type="button" className="st-primary big" onClick={() => onAction({ type: 'menu', op: 'continue' })} data-autofocus><Play size={16} aria-hidden="true" /><span><b>Tiếp tục</b><small>{last.label} · {last.percent ?? 0}%</small></span></button>}
          <button type="button" className={last ? 'st-secondary' : 'st-primary big'} onClick={() => onAction({ type: 'menu', op: 'screen', screen: 'new' })}><span><b>Chơi mới</b><small>Chọn ô lưu và độ khó</small></span></button>
          <button type="button" className="st-secondary" onClick={() => onAction({ type: 'menu', op: 'screen', screen: 'chapters' })}><span><b>Chọn chương</b><small>Chơi lại nhiệm vụ đã qua, săn huy hiệu</small></span></button>
        </div>
        <div className="st-slots" aria-label="Ô lưu">{menu.slots.map((s) => <Slot key={s.index} s={s} />)}</div>
      </> : menu.screen === 'new' ? <>
        {back}
        <fieldset className="st-fieldset"><legend>Ô lưu</legend><div role="radiogroup" className="st-slots">{menu.slots.map((s) => <Slot key={s.index} s={s} picked={slot === s.index} onPick={() => setSlot(s.index)} />)}</div></fieldset>
        <fieldset className="st-fieldset"><legend>Độ khó</legend><div role="radiogroup" className="st-diffs">{(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => <button type="button" key={d} role="radio" aria-checked={diff === d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}><b>{DIFFICULTY_LABEL[d].label}</b><small>{DIFFICULTY_LABEL[d].hint}</small></button>)}</div></fieldset>
        {target && !target.empty && <p className="st-warn" role="alert">Ô {slot + 1} đang có “{target.label}”. Bắt đầu sẽ ghi đè tiến độ này.</p>}
        <button type="button" className="st-primary big" onClick={() => onAction({ type: 'menu', op: 'new', slot, difficulty: diff })}><Play size={16} aria-hidden="true" /><span><b>{target && !target.empty ? 'Ghi đè và bắt đầu' : 'Bắt đầu'}</b><small>Chương 1 · Lên Phố</small></span></button>
      </> : <>{back}<ChapterSelect chapters={menu.chapters} onAction={onAction} /></>}
      {menu.storageBlocked && <p className="st-warn">Trình duyệt chặn lưu trữ: tiến độ chỉ giữ trong phiên này.</p>}
    </section>
  </div>;
}
