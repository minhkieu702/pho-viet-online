"use client";
// The lunar strip: 'MÙNG 10 THÁNG TÁM · CÒN 5 NGÀY TỚI RẰM' with fifteen moons from mùng 1 to Rằm tháng Tám.
// Narrative only, never a real-time fail. Compact form for the objective card; full form for cards and the journal.
import { countdownLabel, lunarLabel, moonPath } from './format';
import type { LunarView } from './types';

export function Moon({ day, size = 14, className = '' }: { day: number; size?: number; className?: string }) {
  const r = size / 2 - 1, d = moonPath(day, r);
  return <svg className={`st-moon ${className}`} width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true"><circle r={r} className="dark" />{d && <path d={d} className="lit" />}</svg>;
}

export default function LunarStrip({ lunar, compact = false }: { lunar: LunarView; compact?: boolean }) {
  const label = lunarLabel(lunar), left = countdownLabel(lunar), target = lunar.target ?? 15;
  const before = lunar.month < 8, idx = before ? 0 : lunar.day;
  if (compact) return <p className="st-lunar compact" aria-label={`${label}. ${left}`}><Moon day={lunar.month === 8 ? lunar.day : 29} size={14} /><b>{label.toLocaleUpperCase('vi')}</b>{left && <span>{left.toLocaleUpperCase('vi')}</span>}</p>;
  return <div className="st-lunar" role="img" aria-label={`${label}. ${left}`}>
    <p><b>{label.toLocaleUpperCase('vi')}</b>{left && <span>{left.toLocaleUpperCase('vi')}</span>}</p>
    <ol aria-hidden="true">
      {before && <li className="prev now"><Moon day={lunar.day} size={16} /><small>T.{lunar.month}</small></li>}
      {Array.from({ length: target }, (_, i) => i + 1).map((d) => <li key={d} className={`${d < idx ? 'past' : ''} ${d === idx ? 'now' : ''} ${d === target ? 'ram' : ''}`}><Moon day={d} size={d === target ? 20 : 14} /><small>{d === target ? 'Rằm' : d}</small></li>)}
    </ol>
  </div>;
}
