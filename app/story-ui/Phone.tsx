"use client";
// Tín's phone: home screen (debt widget, lunar date), calls, SMS threads with reply bubbles, contacts, the delivery app's
// order cards, session photos, and the camera viewfinder (full screen over the over-the-shoulder camera; the engine pans
// with the pointer and zooms with the wheel). The burner skin (a cheap brick phone) keeps only calls, messages and contacts.
// CallWidget is the small card shown under the objective card while the phone is closed.
import { useRef } from 'react';
import { Bike, BookOpen, Camera, ChevronLeft, Image as ImageIcon, MessageSquare, Mic, Phone as PhoneIcon, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Star, Users, X, ZoomIn, ZoomOut } from 'lucide-react';
import { clamp01, lunarLabel, mmss, money } from './format';
import { Bar, Key, Portrait, useKeys, useModal } from './ui';
import type { CallView, CameraView, LunarView, PhoneApp, PhoneView, PortraitMap, StoryUiAction } from './types';

type Act = (a: StoryUiAction) => void;
const APPS: { app: PhoneApp; label: string; icon: typeof PhoneIcon; burner: boolean }[] = [
  { app: 'calls', label: 'Gọi điện', icon: PhoneIcon, burner: true }, { app: 'sms', label: 'Tin nhắn', icon: MessageSquare, burner: true },
  { app: 'contacts', label: 'Danh bạ', icon: Users, burner: true }, { app: 'camera', label: 'Máy ảnh', icon: Camera, burner: false },
  { app: 'orders', label: '', icon: Bike, burner: false }, { app: 'photos', label: 'Ảnh', icon: ImageIcon, burner: false },
];
const APP_TITLE: Record<PhoneApp, string> = { home: 'Màn hình chính', calls: 'Gọi điện', sms: 'Tin nhắn', contacts: 'Danh bạ', camera: 'Máy ảnh', orders: '', photos: 'Ảnh' };

function callStatus(c: CallView) { return c.state === 'ringing' ? 'Đang gọi đến…' : c.state === 'outgoing' ? 'Đang gọi…' : c.state === 'ended' ? 'Đã kết thúc' : mmss(c.secs); }

/** Compact call card for the HUD's left column while the phone is closed. */
export function CallWidget({ call, portraits, onAction }: { call: CallView; portraits?: PortraitMap; onAction: Act }) {
  return <section className={`st st-callw ${call.burner ? 'burner' : ''} ${call.state}`} aria-label={`Cuộc gọi: ${call.name}`} aria-live="polite">
    <Portrait who={call.who} name={call.name} color={call.color} portraits={portraits} size={36} />
    <div className="st-callw-text"><b>{call.name}{call.state === 'ringing' ? ' đang gọi' : ''}</b><span>{call.burner && <em>Máy cùi · </em>}{callStatus(call)}</span></div>
    <div className="st-callw-actions">
      {call.state === 'ringing' && call.canDecline !== false && <button type="button" className="decline" onClick={() => onAction({ type: 'phone', op: 'decline' })} aria-label="Từ chối"><PhoneOff size={15} /></button>}
      {call.state === 'ringing' && <button type="button" className="answer" onClick={() => onAction({ type: 'phone', op: 'answer' })} aria-label="Nghe máy"><PhoneIcon size={15} /></button>}
      {(call.state === 'talking' || call.state === 'outgoing') && <button type="button" className="decline" onClick={() => onAction({ type: 'phone', op: 'hangup' })} aria-label="Cúp máy"><PhoneOff size={15} /></button>}
    </div>
    {call.replies && call.replies.length > 0 && <div className="st-callw-replies" role="group" aria-label="Trả lời">{call.replies.map((r, i) => <button type="button" key={i} onClick={() => onAction({ type: 'phone', op: 'callReply', index: i })}><Key>{i + 1}</Key>{r}</button>)}</div>}
  </section>;
}

export default function Phone({ phone, portraits, lunar, onAction }: { phone: PhoneView; portraits?: PortraitMap; lunar?: LunarView | null; onAction: Act }) {
  if (!phone.open) return null;
  if (phone.app === 'camera' && phone.camera && phone.skin === 'smart') return <Viewfinder cam={phone.camera} onAction={onAction} />;
  return <PhoneFrame phone={phone} portraits={portraits} lunar={lunar} onAction={onAction} />;
}

function PhoneFrame({ phone, portraits, lunar, onAction }: { phone: PhoneView; portraits?: PortraitMap; lunar?: LunarView | null; onAction: Act }) {
  const ref = useRef<HTMLElement>(null);
  const close = () => onAction({ type: 'phone', op: 'close' });
  useModal(ref, close);
  const burner = phone.skin === 'burner', go = (app: PhoneApp) => onAction({ type: 'phone', op: 'app', app });
  const call = phone.call && phone.call.state !== 'ended' ? phone.call : null;
  const thread = phone.app === 'sms' && phone.thread ? phone.threads.find((t) => t.id === phone.thread) ?? null : null;
  const title = call ? phone.call!.name : thread ? thread.name : phone.app === 'orders' ? phone.appName : APP_TITLE[phone.app];
  const unread = phone.threads.reduce((n, t) => n + t.unread, 0), missed = phone.recents.filter((r) => r.dir === 'missed').length;
  return <div className="st st-phone-wrap">
    <section ref={ref} className={`st-phone ${burner ? 'burner' : 'smart'} app-${phone.app}`} role="dialog" aria-label={`Điện thoại — ${title}`} tabIndex={-1}>
      <header className="st-phone-status" aria-hidden="true"><b>{phone.clock}</b><span className="sig">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= phone.signal ? 'on' : ''} />)}</span><span className="bat"><i style={{ width: `${clamp01(phone.battery) * 100}%` }} /></span></header>
      {phone.app !== 'home' && !call && <nav className="st-phone-bar"><button type="button" onClick={() => (thread ? onAction({ type: 'phone', op: 'thread', thread: null }) : go('home'))} aria-label="Quay lại"><ChevronLeft size={18} /></button><b>{title}</b></nav>}
      <div className="st-phone-screen">
        {call ? <CallScreen call={call} portraits={portraits} onAction={onAction} />
          : phone.app === 'home' ? <Home phone={phone} lunar={lunar} unread={unread} missed={missed} go={go} onAction={onAction} />
          : phone.app === 'calls' ? <ul className="st-list">{phone.recents.map((r) => { const I = r.dir === 'in' ? PhoneIncoming : r.dir === 'out' ? PhoneOutgoing : PhoneMissed; return <li key={r.id} className={r.dir}><Portrait who={r.who} name={r.name} portraits={portraits} size={30} /><div><b>{r.name}</b><small><I size={11} aria-hidden="true" />{r.dir === 'in' ? 'Cuộc gọi đến' : r.dir === 'out' ? 'Cuộc gọi đi' : 'Gọi nhỡ'} · {r.time}</small></div>{r.evidence && <span className="st-tag">Manh mối</span>}</li>; })}</ul>
          : phone.app === 'sms' ? (thread ? <Thread thread={thread} portraits={portraits} onAction={onAction} /> : <ul className="st-list">{phone.threads.map((t) => <li key={t.id}><button type="button" onClick={() => onAction({ type: 'phone', op: 'thread', thread: t.id })}><Portrait who={t.who} name={t.name} color={t.color} portraits={portraits} size={34} /><div><b>{t.name}</b><small>{t.messages[t.messages.length - 1]?.text ?? ''}</small></div>{t.unread > 0 && <span className="st-badge" aria-label={`${t.unread} tin chưa đọc`}>{t.unread}</span>}</button></li>)}</ul>)
          : phone.app === 'contacts' ? <ul className="st-list">{phone.contacts.map((c) => <li key={c.id}><Portrait who={c.id} name={c.name} color={c.color} portraits={portraits} size={34} /><div><b>{c.name}</b>{c.note && <small>{c.note}</small>}</div>{c.callable && <button type="button" className="st-round green" onClick={() => onAction({ type: 'phone', op: 'call', contact: c.id })} aria-label={`Gọi ${c.name}`}><PhoneIcon size={15} /></button>}</li>)}</ul>
          : phone.app === 'orders' ? <Orders phone={phone} onAction={onAction} />
          : phone.app === 'photos' ? <div className="st-photos">{phone.photos.length ? phone.photos.map((p) => <figure key={p.id} className={p.evidence ? 'ev' : ''}><span className="st-photo-art" style={p.src ? { backgroundImage: `url(${JSON.stringify(p.src)})` } : undefined} aria-hidden="true"><Camera size={18} /></span><figcaption><b>{p.caption}</b><small>{p.time}{p.evidence ? ' · Manh mối' : ''}</small></figcaption></figure>) : <p className="st-empty">Chưa có ảnh nào.</p>}</div>
          : <p className="st-empty">Máy này không có máy ảnh.</p>}
      </div>
      <footer className="st-phone-home"><button type="button" onClick={close} aria-label="Cất điện thoại"><i /></button></footer>
    </section>
  </div>;
}

function Home({ phone, lunar, unread, missed, go, onAction }: { phone: PhoneView; lunar?: LunarView | null; unread: number; missed: number; go: (a: PhoneApp) => void; onAction: Act }) {
  const burner = phone.skin === 'burner';
  return <div className="st-phone-home-screen">
    <div className="st-phone-clock"><b>{phone.clock}</b>{lunar && <span>{lunarLabel(lunar)}</span>}</div>
    {phone.debt && !burner && <div className="st-debt" aria-label="Sổ nợ"><small>SỔ NỢ</small><b>{money(phone.debt.paid)} <span>/ {money(phone.debt.total)}</span></b><Bar value={phone.debt.paid / Math.max(1, phone.debt.total)} tone="orange" label="Đã trả" /></div>}
    <div className="st-apps">{APPS.filter((a) => !burner || a.burner).map(({ app, label, icon: I }) => {
      const badge = app === 'sms' ? unread : app === 'calls' ? missed : app === 'orders' ? phone.orders.filter((o) => o.state === 'offer').length : 0;
      return <button type="button" key={app} className={`app-${app}`} onClick={() => go(app)}><span><I size={22} aria-hidden="true" />{badge > 0 && <em aria-label={`${badge} mới`}>{badge}</em>}</span>{app === 'orders' ? phone.appName : label}</button>;
    })}
      {!burner && <button type="button" className="app-journal" onClick={() => onAction({ type: 'pause', item: 'journal' })}><span><BookOpen size={22} aria-hidden="true" /></span>Sổ tay</button>}
    </div>
  </div>;
}

function CallScreen({ call, portraits, onAction }: { call: CallView; portraits?: PortraitMap; onAction: Act }) {
  return <div className={`st-call ${call.state}`}>
    <Portrait who={call.who} name={call.name} color={call.color} portraits={portraits} size={96} />
    <h3>{call.name}</h3><p aria-live="polite">{callStatus(call)}</p>
    {call.replies && call.replies.length > 0 && <div className="st-call-replies" role="group" aria-label="Trả lời">{call.replies.map((r, i) => <button type="button" key={i} onClick={() => onAction({ type: 'phone', op: 'callReply', index: i })}>{r}</button>)}</div>}
    <div className="st-call-actions">
      {call.state === 'ringing' ? <>{call.canDecline !== false && <button type="button" className="st-round red big" onClick={() => onAction({ type: 'phone', op: 'decline' })} aria-label="Từ chối"><PhoneOff size={22} /></button>}<button type="button" className="st-round green big" onClick={() => onAction({ type: 'phone', op: 'answer' })} aria-label="Nghe máy" data-autofocus><PhoneIcon size={22} /></button></>
        : <><span className="st-round ghost big" aria-hidden="true"><Mic size={20} /></span><button type="button" className="st-round red big" onClick={() => onAction({ type: 'phone', op: 'hangup' })} aria-label="Cúp máy"><PhoneOff size={22} /></button></>}
    </div>
  </div>;
}

function Thread({ thread, portraits, onAction }: { thread: NonNullable<PhoneView['threads'][number]>; portraits?: PortraitMap; onAction: Act }) {
  return <div className="st-thread">
    <ol className="st-bubbles" aria-live="polite">{thread.messages.map((m) => <li key={m.id} className={m.from}>{m.from === 'them' && <Portrait who={thread.who} name={thread.name} color={thread.color} portraits={portraits} size={22} />}<p>{m.text}<small>{m.time}</small></p></li>)}
      {thread.typing && <li className="them typing" aria-label={`${thread.name} đang soạn tin`}><p><i /><i /><i /></p></li>}</ol>
    {thread.replies && thread.replies.length > 0 && <div className="st-replies" role="group" aria-label="Chọn câu trả lời">{thread.replies.map((r, i) => <button type="button" key={i} onClick={() => onAction({ type: 'phone', op: 'reply', thread: thread.id, index: i })}>{r}</button>)}</div>}
  </div>;
}

function Orders({ phone, onAction }: { phone: PhoneView; onAction: Act }) {
  return <div className="st-orders">
    <div className="st-orders-head"><b>Đơn quanh bạn</b>{phone.rating != null && <span aria-label={`Đánh giá ${phone.rating.toFixed(1)} sao`}><Star size={12} aria-hidden="true" />{phone.rating.toFixed(1)}</span>}</div>
    {phone.orders.map((o) => <article key={o.id} className={`st-order ${o.state} ${o.customer === '' || o.customer === '(trống)' ? 'blank' : ''}`}>
      <header><b>{o.title}</b>{o.code && <code>{o.code}</code>}</header>
      <p><span>Lấy</span>{o.from}</p><p><span>Giao</span>{o.to}</p>
      {o.customer != null && <p><span>Khách</span><em>{o.customer || '(trống)'}</em></p>}
      <footer><b>{money(o.fee)}</b><small>{o.distance}{o.eta ? ` · ${o.eta}` : ''}</small>
        {o.state === 'offer' ? <span className="st-order-act"><button type="button" onClick={() => onAction({ type: 'phone', op: 'order', order: o.id, accept: false })}>Bỏ qua</button><button type="button" className="go" onClick={() => onAction({ type: 'phone', op: 'order', order: o.id, accept: true })}>Nhận đơn</button></span>
          : <span className={`st-tag ${o.state}`}>{o.state === 'active' ? 'Đang giao' : o.state === 'done' ? 'Đã giao' : 'Người khác đã nhận'}</span>}
      </footer>
    </article>)}
  </div>;
}

/** Full-screen camera overlay. Pointer events pass through except on the controls so the engine can pan the camera. */
function Viewfinder({ cam, onAction }: { cam: CameraView; onAction: Act }) {
  const zoom = (v: number) => onAction({ type: 'phone', op: 'zoom', value: Math.max(cam.zoomMin, Math.min(cam.zoomMax, +v.toFixed(2))) });
  useKeys((e, down) => {
    if (!down || e.repeat) return;
    if (e.key === 'Escape' || e.code === 'KeyP') { e.preventDefault(); onAction({ type: 'phone', op: 'close' }); }
    else if (e.key === 'Enter' || e.code === 'KeyF') { e.preventDefault(); onAction({ type: 'phone', op: 'shutter' }); }
    else if (e.key === '+' || e.key === '=') zoom(cam.zoom + 0.5); else if (e.key === '-') zoom(cam.zoom - 0.5);
  });
  const q = clamp01(cam.quality), good = q >= 0.6;
  return <div className={`st st-viewfinder ${cam.mode}`} role="region" aria-label="Máy ảnh điện thoại">
    {!!cam.flash && <i key={cam.flash} className="st-flash" aria-hidden="true" />}
    <div className="st-vf-frame" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="st-vf-grid" aria-hidden="true" />
    <div className={`st-vf-focus ${good ? 'ok' : ''}`} aria-hidden="true" />
    {cam.targets.map((t) => <div key={t.id} className={`st-vf-target ${t.state}`} style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.w * 100}%`, height: `${t.h * 100}%` }}><span>{t.label ?? ''}</span></div>)}
    <header className="st-vf-top"><b>{cam.mode === 'clip' ? 'CAMERA KẸP ÁO' : 'MÁY ẢNH'}</b><span>{cam.zoom.toFixed(1)}×</span><span>{cam.shots} ảnh</span>
      {cam.record && <span className="st-rec"><i />{cam.record.label} {Math.round(clamp01(cam.record.progress) * 100)}%</span>}</header>
    <div className="st-vf-zoom" role="group" aria-label="Thu phóng">
      <button type="button" onClick={() => zoom(cam.zoom + 0.5)} aria-label="Phóng to"><ZoomIn size={18} /></button>
      <input type="range" min={cam.zoomMin} max={cam.zoomMax} step={0.1} value={cam.zoom} onChange={(e) => zoom(+e.target.value)} aria-label="Mức thu phóng" aria-valuetext={`${cam.zoom.toFixed(1)} lần`} />
      <button type="button" onClick={() => zoom(cam.zoom - 0.5)} aria-label="Thu nhỏ"><ZoomOut size={18} /></button>
    </div>
    <footer className="st-vf-bottom">
      <div className="st-vf-quality"><small>Độ nét</small><Bar value={q} band={[0.6, 1]} tone={good ? 'green' : 'orange'} label="Độ nét ảnh" text={good ? 'Đủ nét' : 'Chưa đủ nét'} /><span aria-live="polite">{cam.hint ?? (good ? 'Ảnh ổn rồi — bấm chụp' : 'Giữ yên tay, đưa mục tiêu vô khung')}</span></div>
      <button type="button" className={`st-shutter ${good ? 'ready' : ''}`} onClick={() => onAction({ type: 'phone', op: 'shutter' })} aria-label="Chụp ảnh"><i /></button>
      <button type="button" className="st-vf-close" onClick={() => onAction({ type: 'phone', op: 'close' })}><X size={16} aria-hidden="true" />Thoát <Key>P</Key></button>
    </footer>
  </div>;
}

