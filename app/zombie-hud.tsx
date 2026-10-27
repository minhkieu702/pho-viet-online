"use client";
import {Bandage,Biohazard,ChevronRight,Crown,Dog,DoorOpen,HeartCrack,Megaphone,PawPrint,Play,RotateCcw,Skull,TriangleAlert,Users} from 'lucide-react';
import type {ZombieHudView} from './game/zombie-coop';
import './zombie-hud.css';

/**
 * Zombie mode's HUD (design.md §4.2): the wave card (solo and online, with the waiting room of a new online room), the
 * team panel with each teammate's health, dog and downed state, the giant mutants' boss bars (one compact row each,
 * docked at the top edge, never over the middle of the screen; the weak-point hint is a one-time notice), the kill
 * feed, the dog card, threat arrows at the
 * screen's edges for what is off screen, the downed, revive and spectate overlays, the dread vignettes and the online
 * game-over card. Pure view of game.ts' Hud.zombie.
 */
type DogCmd='call'|'attack'|'heal';
const clock=(s:number)=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.max(0,Math.ceil(s))%60).padStart(2,'0')}`;
const pct=(v:number,max:number)=>`${Math.max(0,Math.min(100,(v/Math.max(1,max))*100))}%`;
const bearingStyle=(bearing:number)=>{
  // Screen-edge position for a bearing (0 ahead, ± to the sides, π behind): an ellipse around the screen centre.
  const a=bearing;const x=50+Math.sin(a)*44,y=50-Math.cos(a)*40;
  return {left:`${x}%`,top:`${y}%`,transform:`translate(-50%,-50%) rotate(${a}rad)`};
};

export function ZombieLobbyButton({disabled,onClick}:{disabled:boolean;onClick:()=>void}){
  return <button className="zombie-start zombie-coop-start" disabled={disabled} onClick={onClick}><Users size={17}/><span><b>Tạo phòng Zombie cùng bạn bè</b><small>Đông hơn, khó hơn · Quái đột biến khổng lồ · Mỗi người một chú chó</small></span><ChevronRight size={16}/></button>;
}

export default function ZombieHud({view,online,code,onLeave,onRestart,onStart,onDog}:{view:ZombieHudView;online:boolean;code?:string;onLeave:()=>void;onRestart:()=>void;onStart?:()=>void;onDog:(cmd:DogCmd)=>void}){
  const phase=view.phase??(view.breakLeft>0?'rest':'wave');
  const resting=phase==='rest'||phase==='prep';
  const title=phase==='prep'?'Chuẩn bị':phase==='rest'?`Hết đợt ${view.wave}`:phase==='over'?'Toàn đội đã gục':`Đợt ${view.wave}`;
  const pill=resting?`Đợt ${view.wave+1} sau ${view.breakLeft}s`:phase==='over'?'Đang bắt đầu lại':`Còn ${view.left} zombie`;
  const self=view.self,dog=view.dog,dread=view.dread;
  const team=view.team??[];
  const bosses=view.bosses??[];
  // A new online room waits for the team before wave 1 (prep): the code to share and "Bắt đầu".
  const waiting=online&&phase==='prep'&&view.wave===0;
  return <>
    {dread&&(dread.vignette>0.02||dread.tint!=='none')&&<div className={`zhud-vignette tint-${dread.tint}`} style={{opacity:Math.min(1,0.25+dread.vignette)}} aria-hidden="true"/>}
    <section className="mission-card zombie-card zhud-card" aria-label="Chế độ Zombie">
      <div className="zombie-head"><Skull size={15}/><b>{title}</b><span className={`zombie-left ${resting?'rest':''}`}>{pill}</span></div>
      {view.bossWave&&phase==='wave'&&<div className="zhud-boss-chip"><Biohazard size={12}/>ĐỢT QUÁI ĐỘT BIẾN</div>}
      {waiting&&<div className="zhud-wait"><span><b>{team.length?'Đồng đội đã vào · sắp bắt đầu':'Đang chờ đồng đội'}</b>{code&&<small>Mã phòng <em>{code}</em></small>}</span>{onStart&&<button onClick={onStart} title="Bắt đầu đợt 1 sau 3 giây"><Play size={12}/> Bắt đầu</button>}</div>}
      <div className="zombie-stats"><span><b>{view.kills}</b> đã hạ</span><span>Kỷ lục: <b>đợt {view.best}</b></span>{view.bandages!==undefined&&<span title="Cuộn băng (X)"><Bandage size={12}/> <b>{view.bandages}</b></span>}<button onClick={onLeave} title={online?'Rời phòng Zombie':'Rời chế độ Zombie, về khu phố bình thường'}>{online?<><DoorOpen size={12}/> Rời phòng</>:'Về phố'}</button></div>
      {online&&team.length>0&&<div className="zhud-team" aria-label="Đồng đội">
        {team.map(m=><div key={m.slot} className={`zhud-mate ${m.state}`}>
          <i style={{background:m.color}}/>
          <span className="zhud-mate-name">{m.name}{m.host&&<Crown size={10} className="zhud-host" aria-label="Máy chủ"/>}</span>
          {m.state==='up'?<span className="zhud-bar"><i style={{width:`${m.hp}%`,background:m.hp<30?'#e0563d':'#8fb84a'}}/></span>
            :m.state==='down'?<span className="zhud-badge blink">{m.reviving?'Đang được cứu…':`GỤC · cần cứu ${clock(m.bleed)}`}</span>
            :<span className="zhud-badge dead">TỬ TRẬN · hồi sinh khi hết đợt</span>}
          {m.dogHp!==null&&<span className="zhud-paw" title="Chó"><PawPrint size={10}/>{m.dogHp}</span>}
          <span className="zhud-dist" style={{transform:`rotate(${m.bearing}rad)`}} aria-hidden="true">↑</span><small>{m.dist} m</small>
        </div>)}
      </div>}
    </section>
    {bosses.length>0&&<div className={`zhud-bosses n${bosses.length}`} role="status">
      {bosses.map((b,i)=><div key={`${b.kind}${i}`} className="zhud-bossbar" title={`${b.name} · ${Math.ceil(b.hp)} / ${b.max}`}>
        <Skull size={12}/><b>{b.name}</b>
        <span className="zhud-boss-hp"><i style={{width:pct(b.hp,b.max)}}/><em style={{left:'25%'}}/><em style={{left:'50%'}}/><em style={{left:'75%'}}/></span>
        <span className="zhud-weak">{b.weak.map((on,k)=><span key={k} className={on?'on':''} title={on?'Điểm yếu còn nguyên':'Đã phá'}/>)}</span>
      </div>)}
    </div>}
    {!!view.feed?.length&&<ul className="zhud-feed" aria-live="polite">{view.feed.map(f=><li key={f.id} className={`tone-${f.tone}`}>{f.text}</li>)}</ul>}
    {dog&&<section className={`zhud-dog state-${dog.state}`} aria-label={`Chó ${dog.name}`}>
      <div className="zhud-dog-head"><Dog size={15} style={{color:dog.coat}}/><b>Chó · {dog.name}</b><span>{dog.label}{dog.reviveIn!==null?` · ${dog.reviveIn}s`:''}</span></div>
      <div className="zhud-bar dog"><i style={{width:`${dog.hp}%`,background:dog.hp<40?'#e0563d':'#d0a04a'}}/></div>
      <div className="zhud-dog-keys"><small>{dog.hint}</small><span className="zhud-dog-touch"><button onClick={()=>onDog('call')} aria-label="Gọi hoặc bảo chó ngồi"><PawPrint size={14}/></button><button onClick={()=>onDog('attack')} aria-label="Bảo chó cắn">Cắn</button><button onClick={()=>onDog('heal')} aria-label="Băng bó"><Bandage size={14}/></button></span></div>
    </section>}
    {view.threats?.map((t,i)=><span key={`${t.kind}${i}`} className={`zhud-threat ${t.kind}`} style={bearingStyle(t.bearing)} aria-hidden="true">{t.kind==='mutant'?<Skull size={18}/>:t.kind==='screamer'?<Megaphone size={15}/>:<PawPrint size={14}/>}</span>)}
    {self&&!view.over&&self.state==='down'&&<div className="zhud-self down" role="alert"><HeartCrack size={22}/><b>BẠN ĐÃ GỤC</b><span>{online?`Đồng đội có thể cứu bạn · ${clock(self.bleed)}`:self.rescue===false?`Không ai tới cứu · ${clock(self.bleed)}`:`Chó của bạn đang tới · ${clock(self.bleed)}`}</span><small>Lết chậm bằng WASD · vẫn bắn được súng lục</small>{self.revivedBy&&<em>{self.revivedBy} đang cứu bạn…</em>}</div>}
    {self&&!view.over&&(self.state==='dead'||self.state==='spectate')&&<div className="zhud-self dead" role="status"><Skull size={18}/><b>{self.watching?`Đang xem ${self.watching}`:'Bạn đã tử trận'}</b><span>Hồi sinh khi hết đợt{self.watching?' · Q/E đổi người':''}</span></div>}
    {view.over&&<div className="zhud-over" role="dialog" aria-label="Toàn đội đã gục">
      <div className="zhud-over-head"><TriangleAlert size={18}/><b>TOÀN ĐỘI ĐÃ GỤC Ở ĐỢT {view.over.wave}</b></div>
      <table><thead><tr><th>Tên</th><th>Hạ</th><th>Sát thương</th><th>Cứu</th><th>Gục</th></tr></thead>
        <tbody>{view.over.rows.map((r,i)=><tr key={i}><td>{r.name}</td><td>{r.kills}</td><td>{r.damage}</td><td>{r.revives}</td><td>{r.downs}</td></tr>)}</tbody></table>
      <div className="zhud-over-foot"><button onClick={onRestart}><RotateCcw size={14}/> Chơi lại ngay</button><small>Tự bắt đầu lại sau {view.over.restartIn}s</small></div>
    </div>}
  </>;
}

/**
 * The minimap's zombie-mode marks (design.md §4.2), drawn inside the minimap's own SVG with its own projection: a giant
 * mutant (pulsing red ring), the quake warning where one will break out, downed teammates (blinking cross), loot crates
 * and the dogs (paw dots).
 */
export function ZombieMapMarks({marks,mx,mz}:{marks:NonNullable<ZombieHudView['marks']>;mx:(x:number)=>number;mz:(z:number)=>number}){
  return <g className="zmap-marks" aria-hidden="true">{marks.map((m,i)=>{const x=mx(m.x),y=mz(m.z),k=`zm${i}`;
    if(m.kind==='mutant')return <g key={k}><circle className="zmap-pulse" cx={x} cy={y} r="7" fill="none" stroke="#ff3b2a" strokeWidth="1.6"/><circle cx={x} cy={y} r="3.6" fill="#c0261a" stroke="white" strokeWidth="1"/></g>;
    if(m.kind==='quake')return <circle key={k} className="zmap-pulse slow" cx={x} cy={y} r="11" fill="rgba(255,90,42,.15)" stroke="#ff5a2a" strokeWidth="1.4" strokeDasharray="3 2"/>;
    if(m.kind==='down')return <path key={k} className="zmap-blink" d={`M${x-3.2} ${y}h6.4M${x} ${y-3.2}v6.4`} stroke="#ff4d4d" strokeWidth="2.4" strokeLinecap="round"/>;
    if(m.kind==='loot')return <rect key={k} x={x-2.8} y={y-2.2} width="5.6" height="4.4" rx="1" fill="#e8c34a" stroke="#4f3a10" strokeWidth=".9"/>;
    return <circle key={k} cx={x} cy={y} r="1.9" fill="#d0a04a" stroke="#3a2a10" strokeWidth=".7"/>;
  })}</g>;
}
