"use client";
// Shared pieces for the story UI: the stylesheet, portraits, meters, key caps, modal focus handling and hotkeys.
import './story.css';
import { useEffect, useEffectEvent, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { clamp01, initialOf } from './format';
import type { PortraitMap } from './types';

export type Css = CSSProperties & Record<`--${string}`, string | number>;

/** Round portrait; falls back to the speaker's initial on their colour. Decorative (names are always printed beside it). */
export function Portrait({ who, name, color, portraits, size = 40, className = '' }: { who?: string | null; name: string; color?: string; portraits?: PortraitMap; size?: number; className?: string }) {
  const src = who ? portraits?.[who] : undefined;
  const style: Css = { '--c': color ?? '#5f6e5a', width: size, height: size, fontSize: Math.round(size * 0.44) };
  if (src) style.backgroundImage = `url(${JSON.stringify(src)})`;
  return <span className={`st-portrait ${src ? 'img' : ''} ${className}`} style={style} aria-hidden="true">{src ? null : initialOf(name)}</span>;
}

/** A thin meter. `band` draws the good zone; `tone` picks the fill colour. */
export function Bar({ value, band, tone = 'ink', label, text }: { value: number; band?: [number, number]; tone?: 'ink' | 'orange' | 'red' | 'green' | 'gold' | 'blue'; label?: string; text?: string }) {
  const v = clamp01(value);
  return <span className={`st-bar tone-${tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label} aria-valuetext={text}>
    {band && <em style={{ left: `${band[0] * 100}%`, width: `${(band[1] - band[0]) * 100}%` }} />}
    <i style={{ width: `${v * 100}%` }} />
  </span>;
}

export function Key({ children, className = '' }: { children: ReactNode; className?: string }) { return <kbd className={`st-key ${className}`}>{children}</kbd>; }

const FOCUSABLE = 'button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
/** Open story dialogs, innermost last: only the top one answers Esc and traps Tab. */
const MODALS: symbol[] = [];
/** Dialog behaviour: focus the first control (or [data-autofocus]) on open, keep Tab inside, Esc closes, restore focus on
 *  close. Keys are caught on window in the capture phase, so they still work after focus falls out (a disabled button)
 *  and the page's own Esc/Tab shortcuts do not see them. */
export function useModal(ref: RefObject<HTMLElement | null>, onClose?: () => void, active = true) {
  const close = useEffectEvent(() => onClose?.());
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const me = Symbol('modal');
    MODALS.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.getClientRects().length > 0);
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0] ?? el).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (MODALS[MODALS.length - 1] !== me) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      event.stopPropagation();
      const list = items();
      if (!list.length) { event.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1], inside = el.contains(document.activeElement);
      if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      MODALS.splice(MODALS.indexOf(me), 1);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active, ref]);
}

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !(target instanceof HTMLInputElement && (target.type === 'range' || target.type === 'radio' || target.type === 'checkbox')));
/** Window-level key handler (down and up), ignored while typing in a text field. Disable when the engine owns the keys. */
export function useKeys(handler: (event: KeyboardEvent, down: boolean) => void, enabled = true) {
  const run = useEffectEvent((event: KeyboardEvent, down: boolean) => { if (!typing(event.target)) handler(event, down); });
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: KeyboardEvent) => run(e, true), onUp = (e: KeyboardEvent) => run(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [enabled]);
}

/** Close button used by every story dialog. */
export function CloseButton({ onClick, label, hint }: { onClick: () => void; label: string; hint?: string }) {
  return <button type="button" className="st-close" onClick={onClick} aria-label={label}>{hint && <Key>{hint}</Key>}<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg></button>;
}

/** The golden lotus mark: `petals` of `total` light up (chapters finished). */
export function LotusMark({ petals, total = 11, size = 64, className = '' }: { petals: number; total?: number; size?: number; className?: string }) {
  const n = Math.max(1, total), lit = Math.max(0, Math.min(n, petals));
  return <svg className={`st-lotus ${className}`} viewBox="-50 -50 100 100" width={size} height={size} role="img" aria-label={`${lit}/${n} cánh sen đã nở`}>
    {Array.from({ length: n }, (_, i) => {
      const a = (i - (n - 1) / 2) * (130 / Math.max(1, n - 1)), c = (n - 1) / 2, d = Math.abs(i - c), rank = d === 0 ? 0 : 2 * d - (i < c ? 1 : 0); // centre first, then left/right
      return <path key={i} className={rank < lit ? 'on' : ''} transform={`rotate(${a})`} d="M0 8C-9 -4 -8 -26 0 -40C8 -26 9 -4 0 8Z" />;
    })}
    <ellipse className="pod" cx="0" cy="12" rx="15" ry="5" />
  </svg>;
}
