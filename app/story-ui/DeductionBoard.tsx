"use client";
// BẢNG MANH MỐI — the chalk wall in the attic, the UI over the runner's board (app/game/story/deduction.ts).
// Evidence cards sit in lotus-template slots; drag a red string from one card to another (or click/Enter one card,
// then another) to propose a link. The runner accepts it (it appears in links) or rejects it (shake + a hint token).
// Accepted strings slowly draw the golden lotus. Hypotheses ('giả thuyết') are proven by picking the cards that
// support them. When the board is solved the deduction question opens. Wrong answers cost a token, never a fail.
// Portrait screens transpose the layout.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Lightbulb, Link2, Lock } from 'lucide-react';
import { EvidenceArt } from './Journal';
import { LOTUS_OUTLINE, boardPoint, cardSpot, linkKey, stringPath } from './format';
import { CloseButton, Key, useKeys, useModal, type Css } from './ui';
import type { BoardCard, BoardView, DeductionView, StoryUiAction } from './types';

type Act = (a: StoryUiAction) => void;
type Drag = { from: string; x: number; y: number; sx: number; sy: number; moved: boolean };

export default function DeductionBoard({ board, onAction }: { board: BoardView; onAction: Act }) {
  const ref = useRef<HTMLElement>(null), area = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [proving, setProving] = useState<{ hyp: string; cards: string[] } | null>(null);
  const [geo, setGeo] = useState({ portrait: false, pin: 7 });
  const close = () => onAction({ type: 'board', op: 'close' });
  useModal(ref, () => { if (sel || drag || proving) { setSel(null); setDrag(null); setProving(null); } else close(); });
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect(), card = el.querySelector<HTMLElement>('.st-bcard');
      const portrait = r.height > r.width * 1.1, pin = card && r.height ? ((card.offsetHeight / 2 - 4) / r.height) * 100 : 7;
      setGeo((g) => (g.portrait === portrait && Math.abs(g.pin - pin) < 0.2 ? g : { portrait, pin }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const spot = new Map(board.cards.map((c, i) => [c.id, cardSpot(c, i)]));
  const byId = new Map(board.cards.map((c) => [c.id, c]));
  const made = new Set(board.links.map((l) => linkKey(l.a, l.b)));
  const at = (c: BoardCard) => { const [sx, sy] = spot.get(c.id) ?? [0.5, 0.5], [x, y] = boardPoint(sx, sy, geo.portrait); return [x * 100, y * 100] as const; };
  const editable = !board.readOnly && !board.solved;
  const usable = (id: string) => byId.get(id)?.visible !== false;
  const link = (a: string, b: string) => { if (a !== b && usable(a) && usable(b) && !made.has(linkKey(a, b))) onAction({ type: 'board', op: 'link', a, b }); };
  const choose = (id: string) => {
    if (proving) { if (usable(id)) setProving({ ...proving, cards: proving.cards.includes(id) ? proving.cards.filter((c) => c !== id) : [...proving.cards, id] }); return; }
    if (!editable || !usable(id)) return;
    if (!sel) setSel(id); else if (sel === id) setSel(null); else { link(sel, id); setSel(null); }
  };
  const local = (e: { clientX: number; clientY: number }) => { const r = area.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }; };
  const down = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if ((!editable && !proving) || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: id, ...local(e), sx: e.clientX, sy: e.clientY, moved: false });
  };
  const move = (e: ReactPointerEvent) => { if (drag && !proving) setDrag({ ...drag, ...local(e), moved: drag.moved || Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6 }); };
  const up = (e: ReactPointerEvent) => {
    if (!drag) return;
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-card]')?.dataset.card;
    if (drag.moved) { if (target && target !== drag.from) link(drag.from, target); setSel(null); } else choose(drag.from);
    setDrag(null);
  };
  const prove = () => { if (proving?.cards.length) { onAction({ type: 'board', op: 'propose', hyp: proving.hyp, cards: proving.cards }); setProving(null); } };
  const ok = board.links.length, from = drag ? byId.get(drag.from) : null;
  const hyp = proving ? board.hypotheses?.find((h) => h.id === proving.hyp) : null;
  const status = proving ? `Đang chọn thẻ cho giả thuyết: ${hyp?.text ?? ''}. Đã chọn ${proving.cards.length} thẻ.` : sel ? `Đã chọn “${byId.get(sel)?.title}”. Chọn thẻ thứ hai để nối chỉ.` : drag?.moved ? 'Thả lên thẻ khác để nối.' : '';
  const shake = new Set(board.shake?.ids ?? []);
  return <div className="st st-modal-backdrop board">
    <section ref={ref} className={`st-board ${board.solved ? 'solved' : ''} ${board.readOnly ? 'readonly' : ''} ${proving ? 'proving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="st-board-title" aria-describedby="st-board-help">
      <header className="st-board-head">
        <div><small>BẢNG MANH MỐI</small><h2 id="st-board-title">{board.title}</h2>{board.question && <p>{board.question}</p>}</div>
        <span className="st-board-count" aria-live="polite"><Link2 size={14} aria-hidden="true" />Đã nối {Math.min(ok, board.needed)}/{board.needed}</span>
        {!board.readOnly && <button type="button" className="st-hint-btn" disabled={!editable || board.hintTokens <= 0} onClick={() => onAction({ type: 'board', op: 'hint' })}><Lightbulb size={14} aria-hidden="true" />Gợi ý<b>{board.hintTokens}</b></button>}
        <CloseButton onClick={close} label="Đóng bảng manh mối" hint="Esc" />
      </header>
      <div ref={area} className={`st-board-area ${geo.portrait ? 'portrait' : ''}`} style={{ '--pin': `${geo.pin}%` } as Css} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
        <svg className="st-board-strings" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="st-board-lotus" d={LOTUS_OUTLINE} transform={geo.portrait ? 'matrix(0 1 1 0 0 0)' : undefined} vectorEffect="non-scaling-stroke" />
          {board.links.map((l) => { const a = byId.get(l.a), b = byId.get(l.b); if (!a || !b) return null; const [ax, ay] = at(a), [bx, by] = at(b); return <path key={linkKey(l.a, l.b)} className={`st-string ${l.state}`} d={stringPath(ax, ay - geo.pin, bx, by - geo.pin)} vectorEffect="non-scaling-stroke" />; })}
          {from && drag?.moved && (() => { const [ax, ay] = at(from); return <path className="st-string live" d={stringPath(ax, ay - geo.pin, drag.x, drag.y, 0.06)} vectorEffect="non-scaling-stroke" />; })()}
        </svg>
        <ul className="st-board-cards" aria-label="Các thẻ manh mối">{board.cards.map((c) => {
          const [x, y] = at(c), shaking = shake.has(c.id), hidden = c.visible === false, picked = !!proving?.cards.includes(c.id);
          const links = board.links.filter((l) => l.a === c.id || l.b === c.id).map((l) => byId.get(l.a === c.id ? l.b : l.a)?.title).filter(Boolean);
          return <li key={`${c.id}:${shaking ? board.shake?.seq : 0}`} style={{ left: `${x}%`, top: `${y}%`, '--rot': `${c.rot ?? 0}deg` } as Css}>
            <button type="button" data-card={c.id} className={`st-bcard ${sel === c.id || drag?.from === c.id ? 'on' : ''} ${picked ? 'picked' : ''} ${shaking ? 'shake' : ''} ${c.isNew ? 'new' : ''} ${hidden ? 'blank' : ''}`}
              aria-pressed={proving ? picked : sel === c.id} aria-disabled={hidden || undefined}
              aria-label={hidden ? 'Manh mối chưa tìm thấy' : `${c.title}${c.sub ? `, ${c.sub}` : ''}${links.length ? `. Đã nối với ${links.join(', ')}` : ''}`}
              onPointerDown={(e) => down(e, c.id)} onClick={(e) => { if (e.detail === 0) choose(c.id); }}>
              <i className="pin" aria-hidden="true" />{hidden ? <b className="q" aria-hidden="true">?</b> : <><EvidenceArt card={c} /><b>{c.title}</b>{c.sub && <small>{c.sub}</small>}</>}
            </button>
          </li>;
        })}</ul>
        {board.solved && !board.deduction && <p className="st-board-done" role="status">Sợi chỉ cuối cùng đã nối. Bông sen hiện ra.</p>}
      </div>
      {board.hypotheses && board.hypotheses.length > 0 && <div className="st-hyps" role="group" aria-label="Giả thuyết">
        <small>GIẢ THUYẾT</small>
        {proving ? <div className="st-hyp-pick"><span><b>{hyp?.text}</b> — chọn các thẻ chứng minh ({proving.cards.length})</span>
          <button type="button" className="go" disabled={!proving.cards.length} onClick={prove}>Chứng minh</button><button type="button" onClick={() => setProving(null)}>Hủy</button></div>
          : board.hypotheses.map((h) => <button type="button" key={h.id} className={`st-hyp ${h.state}`} disabled={h.state !== 'open' || board.readOnly} onClick={() => { setSel(null); setProving({ hyp: h.id, cards: [] }); }}>
            {h.state === 'proven' ? <Check size={13} aria-hidden="true" /> : h.state === 'locked' ? <Lock size={12} aria-hidden="true" /> : null}{h.state === 'locked' ? 'Cần thêm manh mối' : h.text}</button>)}
      </div>}
      <footer className="st-board-foot" id="st-board-help">
        {board.shake && <p key={board.shake.seq} className="st-board-miss" role="status">Không khớp. Còn {board.hintTokens} gợi ý — sai không bao giờ thua.</p>}
        <span>{board.readOnly ? 'Chỉ xem — mở bảng ở bức tường trên gác để nối thêm.' : proving ? 'Bấm vào các thẻ để chọn hoặc bỏ chọn, rồi bấm “Chứng minh”.' : 'Kéo một sợi chỉ từ thẻ này sang thẻ kia. Nối sai chỉ mất một gợi ý, không bao giờ thua.'}</span>
        {editable && !proving && <span className="keys"><Key>Enter</Key> chọn thẻ · <Key>Enter</Key> thẻ thứ hai để nối · <Key>Esc</Key> bỏ chọn</span>}
        <span className="st-sr" role="status" aria-live="polite">{status}</span>
      </footer>
      {board.deduction && <Deduction d={board.deduction} onAction={onAction} />}
    </section>
  </div>;
}

function Deduction({ d, onAction }: { d: DeductionView; onAction: Act }) {
  const ref = useRef<HTMLDivElement>(null);
  const wrong = d.wrong ?? [];
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, [d.id]);
  useKeys((e, down) => { const n = Number(e.key), o = d.options[n - 1]; if (!down || e.repeat || !o || d.answered || wrong.includes(o.id)) return; e.preventDefault(); onAction({ type: 'board', op: 'deduce', id: d.id, option: o.id }); });
  return <div className="st-deduce-wrap"><div ref={ref} className="st-deduce" role="group" aria-labelledby={`dd-${d.id}`}>
    <small>SUY LUẬN</small><h3 id={`dd-${d.id}`}>{d.prompt}</h3>
    <div className="st-deduce-opts">{d.options.map((o, i) => {
      const bad = wrong.includes(o.id), right = d.answered === o.id;
      return <button type="button" key={o.id} className={bad ? 'wrong' : right ? 'right' : ''} disabled={bad || !!d.answered} onClick={() => onAction({ type: 'board', op: 'deduce', id: d.id, option: o.id })}>
        <Key>{i + 1}</Key><span>{o.text}{bad && <small>Không phải — mất một gợi ý</small>}{right && <small>Đúng vậy.</small>}</span></button>;
    })}</div>
  </div></div>;
}
