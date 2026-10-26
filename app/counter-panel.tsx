"use client";
import {useEffect,useRef} from 'react';
import {BedDouble,Beer,Bike,BookOpen,Coffee,Flame,Flower2,Gem,HandCoins,Landmark,Mail,Pill,School,Scissors,Shield,Shirt,Store,Ticket,UtensilsCrossed,Wallet,Wrench,X,type LucideIcon} from 'lucide-react';
import type {MenuView} from './game/interact';
import {formatCash} from './game/weapons';

const ICONS:Record<string,LucideIcon>={coffee:Coffee,food:UtensilsCrossed,beer:Beer,store:Store,pill:Pill,gem:Gem,scissors:Scissors,shirt:Shirt,flower:Flower2,book:BookOpen,hotel:BedDouble,wrench:Wrench,post:Mail,police:Shield,bank:Landmark,ticket:Ticket,pagoda:Flame,school:School,bike:Bike};
/** Kinds whose rows are money moving, not things bought (the button shows the amount, not a price). */
const MONEY=new Set(['atm','bank']);

/**
 * A counter's menu (game.ts MenuView, design-real §2 CounterPanel): the vendor's line, items with prices, the
 * wallet (and savings at a bank or ATM), lottery tickets held, one "Trả giá" at market stalls and xe ôm. Number keys
 * 1-9 buy, H haggles, Esc closes. The street stays in view behind it (game.ts frames the counter).
 */
export default function CounterPanel({menu,message,onChoose,onClose}:{menu:MenuView;message:{text:string;ok:boolean}|null;onChoose:(id:string)=>void;onClose:()=>void}){
  const panel=useRef<HTMLElement>(null);
  const latest=useRef({menu,onChoose});
  useEffect(()=>{latest.current={menu,onChoose};});
  // Focus goes to the panel, not a buy button: Space (jump, brake, hold to pass time) must never buy the first item.
  useEffect(()=>{panel.current?.focus({preventScroll:true});},[menu.id]);
  useEffect(()=>{const keys=(event:KeyboardEvent)=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;const {menu:m,onChoose:choose}=latest.current;const n=Number(event.key);if(n>=1&&n<=9){const item=m.items[n-1];if(item&&!item.disabled){event.preventDefault();choose(item.id);}}else if(event.key.toLowerCase()==='h'&&m.haggle){event.preventDefault();choose('__haggle');}};window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);},[]);
  const Icon=ICONS[menu.icon]??Store,money=MONEY.has(menu.kind);
  return <div className="modal-backdrop shop-view"><section ref={panel} tabIndex={-1} className="help-modal store-modal shop-panel counter-panel" role="dialog" aria-modal="true" aria-labelledby="counter-title">
    <button className="modal-close icon-button" onClick={onClose} aria-label="Rời quầy"><X size={19}/></button>
    <div className="eyebrow counter-eyebrow"><Icon size={13}/> {menu.eyebrow}</div>
    <h2 id="counter-title">{menu.title}</h2>
    <p className="venue-intro">{menu.intro}</p>
    <div className="store-wallet"><Wallet size={15}/>Tiền mặt <b>{formatCash(menu.wallet.cash)}</b>{menu.wallet.bank!==undefined&&<span className="counter-bank"><Landmark size={13}/>Tiết kiệm <b>{formatCash(menu.wallet.bank)}</b></span>}</div>
    {menu.seated&&<div className="counter-seated">Đang ngồi ăn tại chỗ · món ăn hồi thêm 30% máu</div>}
    <div className="store-list">{menu.items.map((item,i)=><div key={item.id} className={`store-item counter-item${item.disabled?' off':''}`}><div><b><kbd>{i+1}</kbd>{item.name}</b><small>{item.desc}</small>{item.tag&&<span className="store-stats">{item.tag}</span>}</div><button disabled={item.disabled} onClick={()=>onChoose(item.id)}>{money?formatCash(item.price):item.price>0?formatCash(item.price):'Miễn phí'}</button></div>)}</div>
    {menu.haggle&&<button className="counter-haggle" onClick={()=>onChoose('__haggle')}><HandCoins size={15}/>Trả giá <kbd>H</kbd><small>Có thể được bớt 20%, cũng có thể bị đuổi về</small></button>}
    {menu.tickets&&menu.tickets.length>0&&<div className="counter-tickets"><Ticket size={13}/><span>Vé số đang giữ:</span>{menu.tickets.map((t,i)=><b key={`${t}${i}`}>{t}</b>)}</div>}
    {message&&message.text&&<p className={message.ok?'counter-ok':'inline-error'} role="status">{message.text}</p>}
    <p className="store-foot">{menu.foot} <span className="counter-keys">{menu.items.length>1?`Phím 1–${Math.min(9,menu.items.length)} để chọn`:'Phím 1 để chọn'} · Esc để rời quầy.</span></p>
  </section></div>;
}
