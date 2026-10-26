"use client";
// Stealth HUD: per-guard awareness pips (with bearing ticks), the stance chip (Rón rén…), the light icon, a noise ring
// sized to the current noise radius, the detection and alarm labels, the cover badge, items, radio and breath timers,
// and the takedown prompt / hold ring / chokehold bar. Per-guard head icons stay in the engine's DOM overlay.
// Over-squeezing a chokehold never kills: the bar warns 'Nhẹ thôi!' (noise / the guard may wake).
import { Bug, Cable, Cctv, Coins, Cookie, Eye, EyeOff, Footprints, Hand, Key as KeyIcon, KeyRound, Locate, Megaphone, Moon, Nut, PersonStanding, Radio, Scissors, Shirt, Smartphone, Sun, SunDim, Waves, Wine } from 'lucide-react';
import { ALARM_LABEL, DETECTION_LABEL, ITEM_LABEL, STANCE_LABEL, ZONE_LABEL, clamp01, countPhrase, lightLabel, mmss } from './format';
import { Bar, Key, type Css } from './ui';
import type { GuardPip, Stance, StealthItemId, StealthView, StorySettings, TakedownView } from './types';

const STANCE_ICON: Record<Stance, typeof Eye> = { stand: PersonStanding, crouch: Footprints, hidden: EyeOff, float: Waves, dive: Waves, drag: Hand, carry: Hand };
const ITEM_ICON: Record<StealthItemId, typeof Eye> = {
  bolt: Nut, coin: Coins, bottle: Wine, food: Cookie, zipTie: Cable, whistle: Megaphone, burner: Smartphone, radio: Radio, keycard: KeyRound,
  key: KeyIcon, boltCutters: Scissors, tracker: Locate, bug: Bug, clipCam: Cctv,
};
const PIP_GLYPH: Record<GuardPip['state'], string> = { unaware: '', suspicious: '?', search: '?', alert: '!', down: 'Zz', tied: 'Zz' };
const PIP_LABEL: Record<GuardPip['state'], string> = { unaware: 'chưa thấy gì', suspicious: 'nghi ngờ', search: 'đang lùng sục', alert: 'đã phát hiện', down: 'bất tỉnh', tied: 'bị trói' };

export default function StealthHud({ stealth: s, settings }: { stealth: StealthView; settings?: Pick<StorySettings, 'noiseRing' | 'reduceFlash'> }) {
  const StanceIcon = STANCE_ICON[s.stance], LightIcon = s.light < 0.34 ? Moon : s.light < 0.67 ? SunDim : Sun;
  const live = s.guards.filter((g) => g.state !== 'down' && g.state !== 'tied').sort((a, b) => b.awareness - a.awareness);
  const asleep = s.guards.length - live.length, pips = live.slice(0, 6);
  return <div className={`st st-stealth det-${s.detection}`}>
    {!!s.flash && !settings?.reduceFlash && <div key={s.flash} className="st-edge" aria-hidden="true" />}
    {(pips.length > 0 || asleep > 0) && <div className="st-pips" role="list" aria-label="Mức cảnh giác của lính canh">
      {pips.map((g) => <Pip key={g.id} g={g} />)}
      {live.length > pips.length && <span className="st-pip-more" role="listitem">+{live.length - pips.length}</span>}
      {asleep > 0 && <span className="st-pip-asleep" role="listitem" aria-label={`${asleep} người đã bị hạ`}>Zz {asleep}</span>}
    </div>}
    <div className="st-stealth-strip" role="status" aria-live="polite">
      <span className={`st-chip stance-${s.stance}`}><StanceIcon size={15} aria-hidden="true" />{STANCE_LABEL[s.stance]}</span>
      <span className={`st-chip light ${s.light < 0.34 ? 'dark' : s.light < 0.67 ? 'dim' : 'lit'}`}><LightIcon size={15} aria-hidden="true" />{lightLabel(s.light)}</span>
      {settings?.noiseRing !== false && <NoiseRing noise={s.noise} max={s.noiseMax} />}
      <span className={`st-det det-${s.detection}`}>{DETECTION_LABEL[s.detection]}</span>
      <span className={`st-alarm a${s.alarm}`}>{ALARM_LABEL[s.alarm]}{s.reinforce != null && <small>Tiếp viện tới sau {mmss(s.reinforce)}</small>}</span>
    </div>
    <aside className="st-stealth-side" aria-label="Đồ nghề và trạng thái">
      {s.cover && <div className={`st-cover zone-${s.cover.zone}`}><b><Shirt size={13} aria-hidden="true" />{s.cover.label}</b><Bar value={s.cover.integrity} tone={s.cover.integrity < 0.35 ? 'red' : 'green'} label="Độ tin của vỏ bọc" /><small>{ZONE_LABEL[s.cover.zone]}</small></div>}
      {s.items.length > 0 && <ul className="st-items">{s.items.map((it) => { const I = ITEM_ICON[it.id]; return <li key={it.id} className={it.count ? '' : 'empty'}><I size={13} aria-hidden="true" /><span>{ITEM_LABEL[it.id]}</span>{it.count > 1 && <b>×{it.count}</b>}</li>; })}</ul>}
      {s.radioIn != null && <p className={`st-radio ${s.radioIn < 10 ? 'urgent' : ''}`}><Radio size={13} aria-hidden="true" />Bộ đàm gọi sau <b>{mmss(s.radioIn)}</b></p>}
      {s.breath != null && <p className="st-breath"><Waves size={13} aria-hidden="true" />Hơi thở<Bar value={s.breath} tone={s.breath < 0.3 ? 'red' : 'blue'} label="Hơi thở còn lại" /></p>}
      <p className="st-tally">Hạ gục <b>{s.knockouts}</b> · Giết <b className={s.kills ? 'bad' : ''}>{s.kills}</b></p>
    </aside>
    {s.takedown && <Takedown t={s.takedown} />}
  </div>;
}

function Pip({ g }: { g: GuardPip }) {
  const a = Math.round(clamp01(g.awareness / 100) * 100);
  const style: Css = { '--a': `${a}%`, '--dir': `${(g.dir * 180) / Math.PI}deg` };
  return <span role="listitem" className={`st-pip s-${g.state} ${g.tagged ? 'tagged' : ''}`} style={style} aria-label={`Lính canh cách ${Math.round(g.dist)} m, ${PIP_LABEL[g.state]}, cảnh giác ${a}%`}>
    <i className="dir" aria-hidden="true" /><b aria-hidden="true">{PIP_GLYPH[g.state]}</b>
  </span>;
}

function NoiseRing({ noise, max }: { noise: number; max: number }) {
  const f = clamp01(noise / Math.max(1, max)), r = 3 + f * 13, tone = f < 0.35 ? 'low' : f < 0.7 ? 'mid' : 'high';
  return <span className={`st-noise ${tone}`} role="meter" aria-label="Tiếng động" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(noise)} aria-valuetext={`${Math.round(noise)} mét`}>
    <svg viewBox="0 0 40 40" aria-hidden="true"><circle className="max" cx="20" cy="20" r="17" /><circle className="now" cx="20" cy="20" r={r.toFixed(1)} /><circle className="me" cx="20" cy="20" r="2.4" /></svg>
    <b>{noise < 0.5 ? 'Im' : `${Math.round(noise)} m`}</b>
  </span>;
}

function Takedown({ t }: { t: TakedownView }) {
  if (t.phase === 'prompt') return <div className="st-takedown prompt" role="status"><Key>E</Key><span>{t.label}</span></div>;
  if (t.phase === 'choke') {
    const p = clamp01(t.pressure ?? 0), band = t.band ?? [0.45, 0.75], count = t.count ?? 0;
    return <div className={`st-takedown choke ${t.warn ?? ''}`} role="status" aria-live="polite">
      <b className="st-count">{count ? countPhrase(count) : t.label}</b>
      <span className="st-choke" role="meter" aria-label="Lực siết" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
        <em style={{ left: `${band[0] * 100}%`, width: `${(band[1] - band[0]) * 100}%` }} /><i style={{ left: `${p * 100}%` }} />
      </span>
      <small>{t.warn === 'over' ? 'Nhẹ thôi! Siết quá tay là nó giãy ầm lên.' : t.warn === 'slip' ? 'Lỏng tay — nó sắp vùng ra!' : <>Giữ <Key>E</Key> để siết · thả để nới</>}</small>
    </div>;
  }
  const p = clamp01(t.progress), C = 2 * Math.PI * 26;
  return <div className={`st-takedown ring ${t.phase}`} role="status">
    <svg viewBox="0 0 64 64" aria-hidden="true"><circle className="track" cx="32" cy="32" r="26" /><circle className="fill" cx="32" cy="32" r="26" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - p)).toFixed(1)} /></svg>
    <Key>E</Key><span>{t.label}</span>
  </div>;
}
