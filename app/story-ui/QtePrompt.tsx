"use client";
// Quick-time prompt: a big key glyph, the label and a ring that shrinks onto the key over the window.
// Mash prompts show pips. Failing only loops the beat (the runner decides); the touch glyph is a hold-capable button.
import { useState } from 'react';
import { Key, useKeys, type Css } from './ui';
import type { QteView, StoryUiAction } from './types';

/** SPACE by code or key; letters by physical key (KeyG…) or the typed letter, so other layouts still work. */
const keyMatch = (k: QteView['key'], e: KeyboardEvent) => (k === 'SPACE' ? e.code === 'Space' || e.key === ' ' : e.code === `Key${k}` || e.key.toLowerCase() === k.toLowerCase());

/** Render with key={qte.seq} so the ring restarts for each prompt. */
export default function QtePrompt({ qte, hotkeys = true, onAction }: { qte: QteView; hotkeys?: boolean; onAction: (a: StoryUiAction) => void }) {
  const [down, setDown] = useState(false);
  const press = (d: boolean) => { if (d === down) return; setDown(d); onAction({ type: 'qte', seq: qte.seq, down: d }); };
  useKeys((e, d) => { if (!keyMatch(qte.key, e) || (d && e.repeat)) return; e.preventDefault(); press(d); }, hotkeys && !qte.result);
  const mash = qte.mash ?? 0, count = Math.min(mash, qte.count ?? 0);
  const style: Css = { '--win': `${Math.max(0.2, qte.window)}s` };
  return <div className={`st st-qte ${qte.result ?? ''} ${down ? 'down' : ''}`} style={style} role="group" aria-label="Phản xạ nhanh">
    <button type="button" className="st-qte-key" aria-label={`${mash ? 'Bấm liên tục' : 'Nhấn'} ${qte.key}: ${qte.label}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); press(true); }} onPointerUp={() => press(false)} onPointerCancel={() => press(false)}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) press(true); }} onKeyUp={(e) => { if (e.key === 'Enter') press(false); }}>
      <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="track" cx="60" cy="60" r="44" /><circle className="shrink" cx="60" cy="60" r="44" /></svg>
      <Key className={qte.key === 'SPACE' ? 'wide' : ''}>{qte.key}</Key>
    </button>
    <b aria-live="assertive">{qte.result === 'hit' ? 'Đẹp!' : qte.result === 'miss' ? 'Hụt rồi — làm lại' : qte.label}</b>
    {mash > 0 && <span className="st-qte-pips" aria-label={`${count}/${mash}`}>{Array.from({ length: mash }, (_, i) => <i key={i} className={i < count ? 'on' : ''} />)}</span>}
  </div>;
}
