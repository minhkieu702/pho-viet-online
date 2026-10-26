"use client";
// SỔ TAY — Tín's notebook: Manh mối (evidence cards and open questions), Nhân vật (dossiers), Địa điểm, Nhật ký
// (chapter recaps in his voice) and Lương tâm & thành tích (knockouts, kills, medals per mission).
import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Award, BookOpen, Camera, Check, FileText, Film, Ghost, HandHeart, Lightbulb, MapPin, MessageSquareQuote, Mic, Package, Phone, Search, Timer, UserRound, Users } from 'lucide-react';
import { KIND_LABEL, MEDALS, STATUS_LABEL, chapterEyebrow, mmss } from './format';
import { CloseButton, Key, Portrait, useModal, type Css } from './ui';
import type { EvidenceCard, EvidenceKind, JournalTab, JournalView, MedalId, PortraitMap, StoryUiAction } from './types';

const TABS: { id: JournalTab; label: string }[] = [{ id: 'clues', label: 'Manh mối' }, { id: 'people', label: 'Nhân vật' }, { id: 'places', label: 'Địa điểm' }, { id: 'diary', label: 'Nhật ký' }, { id: 'conscience', label: 'Lương tâm' }];
export const KIND_ICON: Record<EvidenceKind, typeof Camera> = { photo: Camera, document: FileText, object: Package, plate: FileText, audio: Mic, video: Film, note: FileText, person: UserRound, place: MapPin, call: Phone, testimony: MessageSquareQuote, recording: Mic, 'call-log': Phone };
const MEDAL_ICON: Record<MedalId, typeof Camera> = { 'bong-ma': Ghost, 'luong-tam': HandHeart, 'than-toc': Timer, 'mat-cu': Search };

export function Medal({ id, on = true }: { id: MedalId; on?: boolean }) {
  const I = MEDAL_ICON[id];
  return <span className={`st-medal m-${id} ${on ? 'on' : ''}`} title={`${MEDALS[id].label}: ${MEDALS[id].hint}`} aria-label={`${MEDALS[id].label}${on ? '' : ' (chưa đạt)'}`}><I size={13} aria-hidden="true" /></span>;
}

/** Small art tile for an evidence card (the runner may pass procedural art as a data URL). */
export function EvidenceArt({ card }: { card: Pick<EvidenceCard, 'kind' | 'art' | 'title'> }) {
  const I = KIND_ICON[card.kind];
  return <span className={`st-ev-art k-${card.kind}`} style={card.art ? { backgroundImage: `url(${JSON.stringify(card.art)})` } : undefined} aria-hidden="true">{!card.art && (card.kind === 'plate' ? <b>{card.title.replace(/^Biển số\s*/i, '')}</b> : <I size={20} />)}</span>;
}

export default function Journal({ journal, portraits, onAction }: { journal: JournalView; portraits?: PortraitMap; onAction: (a: StoryUiAction) => void }) {
  const ref = useRef<HTMLElement>(null);
  const close = () => onAction({ type: 'journal', op: 'close' });
  useModal(ref, close);
  const [picked, setPicked] = useState<string | null>(null);
  const tab = journal.tab, setTab = (t: JournalTab) => onAction({ type: 'journal', op: 'tab', tab: t });
  const onTabKey = (e: ReactKeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab), d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = TABS[(i + d + TABS.length) % TABS.length].id;
    setTab(next);
    ref.current?.querySelector<HTMLElement>(`#jt-${next}`)?.focus();
  };
  const card = journal.evidence.find((c) => c.id === picked) ?? null;
  return <div className="st st-modal-backdrop">
    <section ref={ref} className="st-journal" role="dialog" aria-modal="true" aria-labelledby="st-journal-title">
      <header className="st-journal-head">
        <div><small className="st-eyebrow"><i />SỔ TAY CỦA TÍN</small><h2 id="st-journal-title">{TABS.find((t) => t.id === tab)?.label}</h2></div>
        <span className="st-tokens" title="Gợi ý dùng trên bảng manh mối"><Lightbulb size={14} aria-hidden="true" />{journal.hintTokens} gợi ý</span>
        <CloseButton onClick={close} label="Đóng sổ tay" hint="J" />
      </header>
      <nav className="st-journal-tabs" role="tablist" aria-orientation="vertical" aria-label="Mục trong sổ" onKeyDown={onTabKey}>
        {TABS.map((t) => <button type="button" key={t.id} id={`jt-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="st-journal-page" tabIndex={tab === t.id ? 0 : -1} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>
      <div id="st-journal-page" className={`st-journal-page tab-${tab}`} role="tabpanel" aria-labelledby={`jt-${tab}`} tabIndex={0}>
        {tab === 'clues' && <>
          {journal.questions.length > 0 && <div className="st-questions"><b>Câu hỏi còn bỏ ngỏ</b>{journal.questions.map((q) => <span key={q}>{q}</span>)}
            {journal.canOpenBoard && <button type="button" onClick={() => onAction({ type: 'journal', op: 'board' })}><BookOpen size={14} aria-hidden="true" />Mở bảng manh mối</button>}</div>}
          <div className="st-clues">
            <ul className="st-ev-grid" aria-label="Manh mối đã thu thập">{journal.evidence.map((c) => <li key={c.id}><button type="button" className={`st-ev ${picked === c.id ? 'on' : ''}`} aria-pressed={picked === c.id} onClick={() => setPicked(picked === c.id ? null : c.id)}>
              <EvidenceArt card={c} /><span><b>{c.title}</b><small>{c.sub ?? KIND_LABEL[c.kind]}</small></span>{c.isNew && <em className="st-new">MỚI</em>}</button></li>)}</ul>
            <aside className={`st-ev-detail ${card ? 'open' : ''}`} aria-live="polite">{card ? <><EvidenceArt card={card} /><small className="st-eyebrow"><i />{KIND_LABEL[card.kind]} · {chapterEyebrow(card.chapter)}</small><h3>{card.title}</h3>{card.sub && <p className="sub">{card.sub}</p>}<p>{card.text}</p></>
              : <p className="st-empty">Chọn một manh mối để đọc ghi chép.</p>}</aside>
          </div>
        </>}
        {tab === 'people' && <ul className="st-dossiers">{journal.people.map((p) => <li key={p.id} className={`st-dossier s-${p.status}`} style={{ '--c': p.color } as Css}>
          <Portrait who={p.id} name={p.name} color={p.color} portraits={portraits} size={52} />
          <div><b>{p.name}</b><small>{p.role}{p.age ? ` · ${p.age} tuổi` : ''}</small><span className="st-status">{STATUS_LABEL[p.status]}</span>
            <ul>{p.lines.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
        </li>)}</ul>}
        {tab === 'places' && <ul className="st-places">{journal.places.map((p) => <li key={p.id} className={p.visited ? 'visited' : ''}><MapPin size={16} aria-hidden="true" /><div><b>{p.name}</b><small>{p.district} · {chapterEyebrow(p.chapter).toLowerCase().replace(/^c/, 'C')}</small><p>{p.note}</p></div>{p.visited && <span className="st-check" aria-label="Đã tới"><Check size={14} /></span>}</li>)}</ul>}
        {tab === 'diary' && <div className="st-diary">{journal.diary.map((d) => <article key={d.chapter}><small className="st-eyebrow"><i />{chapterEyebrow(d.chapter)}{d.lunar ? ` · ${d.lunar}` : ''}</small><h3>{d.title}</h3><p>{d.text}</p></article>)}</div>}
        {tab === 'conscience' && <Conscience journal={journal} />}
      </div>
      <footer className="st-journal-foot"><span><Users size={13} aria-hidden="true" />Ghi chép tự cập nhật theo câu chuyện</span><span><Key>J</Key> / <Key>Esc</Key> đóng sổ</span></footer>
    </section>
  </div>;
}

function Conscience({ journal }: { journal: JournalView }) {
  const c = journal.conscience;
  return <div className="st-conscience">
    <div className={`st-pledge ${c.kills ? 'broken' : ''}`}><HandHeart size={22} aria-hidden="true" /><div><b>{c.kills ? `Đã có ${c.kills} người chết dưới tay mình` : 'Chưa lấy mạng ai'}</b><p>{c.kills ? '“Mày giết người là mày thành tụi nó.” Vẫn còn kịp sống khác đi.' : '“Khóa cổ, đếm tới năm, nó ngủ. Không giết ai.” — Ông Tư'}</p></div></div>
    <dl className="st-stats"><div><dt>Hạ gục</dt><dd>{c.knockouts}</dd></div><div><dt>Lấy mạng</dt><dd className={c.kills ? 'bad' : ''}>{c.kills}</dd></div><div><dt>Bị phát hiện</dt><dd>{c.detections}</dd></div><div><dt>Báo động</dt><dd>{c.alarms}</dd></div></dl>
    <table className="st-records"><caption className="st-sr">Thành tích từng nhiệm vụ</caption><thead><tr><th scope="col">Nhiệm vụ</th><th scope="col">Hạng</th><th scope="col">Huy hiệu</th><th scope="col">Tốt nhất</th></tr></thead>
      <tbody>{c.records.map((r) => <tr key={r.id}><th scope="row"><small>C{r.chapter}</small>{r.title}</th><td><span className={`st-grade g-${r.grade ?? 'none'}`}>{r.grade ?? '—'}</span></td><td>{(Object.keys(MEDALS) as MedalId[]).map((m) => <Medal key={m} id={m} on={r.medals.includes(m)} />)}</td><td>{r.best != null ? mmss(r.best) : '—'}</td></tr>)}</tbody></table>
    <p className="st-medal-key"><Award size={13} aria-hidden="true" />{(Object.keys(MEDALS) as MedalId[]).map((m) => <span key={m}><Medal id={m} />{MEDALS[m].label}: {MEDALS[m].hint.toLowerCase()}</span>)}</p>
  </div>;
}
