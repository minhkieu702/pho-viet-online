"use client";
// Touch buttons for the story keys (shown on coarse pointers only unless `force`). Hold buttons send key down on
// pointer down and key up on release, so hold-E (khóa cổ, kéo người) and hold-T (quan sát) work; tap buttons send both.
import { BookOpen, Camera, Eye, Footprints, Hand, Lightbulb, Megaphone, Undo2, Users, VenetianMask } from 'lucide-react';
import { clamp01 } from './format';
import type { StoryKey, StoryUiAction, TouchButton } from './types';

const ICON: Record<StoryKey, typeof Eye> = { e: Hand, x: Footprints, g: Undo2, t: Eye, p: Camera, l: Lightbulb, b: Users, k: Megaphone, u: VenetianMask, m: BookOpen, j: BookOpen, ' ': Hand };

export default function TouchStory({ buttons, force = false, onAction }: { buttons: TouchButton[]; force?: boolean; onAction: (a: StoryUiAction) => void }) {
  const send = (key: StoryKey, down: boolean) => onAction({ type: 'key', key, down });
  return <div className={`st st-touch ${force ? 'force' : ''}`} role="toolbar" aria-label="Nút cốt truyện">
    {buttons.map((b) => {
      const I = ICON[b.key], p = b.progress != null ? clamp01(b.progress) : null;
      return <button type="button" key={b.key} className={`st-tbtn k-${b.key === ' ' ? 'space' : b.key} ${b.active ? 'on' : ''} ${b.hold ? 'hold' : ''}`} disabled={b.disabled} aria-pressed={b.active ?? undefined}
        aria-label={`${b.label}${b.hold ? ' (giữ)' : ''}`}
        onPointerDown={(e) => { if (!b.hold) return; e.currentTarget.setPointerCapture(e.pointerId); send(b.key, true); }}
        onPointerUp={() => { if (b.hold) send(b.key, false); }} onPointerCancel={() => { if (b.hold) send(b.key, false); }}
        onClick={() => { if (!b.hold) { send(b.key, true); send(b.key, false); } }} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (b.hold && (e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); send(b.key, true); } }} onKeyUp={(e) => { if (b.hold && (e.key === 'Enter' || e.key === ' ')) send(b.key, false); }}>
        {p != null && <svg className="prog" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" pathLength={1} style={{ strokeDasharray: `${p} 1` }} /></svg>}
        <I size={18} aria-hidden="true" /><small>{b.label}</small>
      </button>;
    })}
  </div>;
}
