"use client";
import {Eye,Siren} from 'lucide-react';
import type {PromptView} from './game/interact';
import {formatCash} from './game/weapons';

/**
 * What E does right here (game.ts focus, design-real C1): [key cap, or "Giữ E" with a ring that fills while held]
 * verb · label · price. Crimes are red with a siren, and an eye when someone is watching; a closed place is dim and
 * has no key. On touch screens the chip itself is the E button (pressed and held for "Giữ E").
 */
export default function PromptChip({prompt,onPress,onRelease}:{prompt:PromptView;onPress:()=>void;onRelease:()=>void}){
  const hold=prompt.key==='Giữ E',progress=prompt.progress??0;
  return <div className={`prompt-chip${prompt.crime?' crime':''}${prompt.dim?' dim':''}`} role="status" aria-live="polite"
    onPointerDown={e=>{if(prompt.dim)return;e.currentTarget.setPointerCapture(e.pointerId);onPress();}} onPointerUp={onRelease} onPointerCancel={onRelease}>
    {prompt.key&&<span className={`prompt-key${hold?' hold':''}`}>{hold&&<svg className="prompt-ring" viewBox="0 0 72 44" preserveAspectRatio="none" aria-hidden="true"><rect x="2" y="2" width="68" height="40" rx="20" pathLength={100} strokeDasharray="100" strokeDashoffset={100*(1-progress)} vectorEffect="non-scaling-stroke"/></svg>}<b>{hold?'Giữ E':'E'}</b></span>}
    {prompt.crime?<Siren size={15} className="prompt-icon"/>:null}
    <span className="prompt-text"><b>{prompt.verb}</b>{prompt.label&&<span className="prompt-label"> · {prompt.label}</span>}{prompt.price?<span className="prompt-price"> · {formatCash(prompt.price)}</span>:null}</span>
    {prompt.seen&&prompt.crime?<span className="prompt-seen" title="Có người đang nhìn"><Eye size={15}/></span>:null}
  </div>;
}
