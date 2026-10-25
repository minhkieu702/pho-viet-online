"use client";
import {useEffect,useRef,useState,type ComponentType,type KeyboardEvent as ReactKeyboardEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {Anchor,BedDouble,Bike,Briefcase,Building2,Coffee,Crosshair,Expand,Flag,Flower2,Hospital,Landmark,Layers,LocateFixed,Mail,Martini,Mic,Minus,Music,Plus,School,Shield,Ship,ShoppingBag,Store,Theater,UtensilsCrossed,Banknote,X,type LucideProps} from 'lucide-react';
import {CITY_BOUNDS,DISTRICTS,DISTRICT_BY_ID,WATERS,type Area} from './game/map/districts';
import {LAND,RIVER,VENUE_LOOKS,type Rect,type VenueKind} from './game/map/consts';
import type {MapData,MapLayer,MapPoi,MapPoiKind,BlockTone} from './game/map/mapdata';
import type {Hud} from './game/game';
import type {PeerState} from '../lib/multiplayer-protocol';

type View={cx:number;cz:number;k:number};
type LayerKey='districts'|MapLayer|'missions'|'friends';
type Icon=ComponentType<LucideProps>;
const LAYERS:[LayerKey,string,[Icon|null,string][]][]=[
  ['districts','Khu vực',[[null,DISTRICT_BY_ID.D1.color],[null,DISTRICT_BY_ID.D2.color]]],
  ['landmarks','Địa danh',[[Building2,'#7d5ba6'],[Theater,'#8e2b20']]],
  ['services','Dịch vụ · bến tàu',[[Hospital,'#e05a5a'],[Ship,'#2f86c6']]],
  ['food','Ăn uống · mua sắm',[[Coffee,'#8a5a3a'],[UtensilsCrossed,'#d9822b']]],
  ['nightlife','Phố đêm (18+)',[[Martini,'#ff3d7f'],[Mic,'#b04dff']]],
  ['missions','Nhiệm vụ · việc phụ',[[Flag,'#db683f'],[Briefcase,'#f2c84b']]],
  ['friends','Bạn bè',[[null,'#df724a']]],
];
// The layers the viewer switched off are remembered on this device, like the other HUD preferences.
const LAYERS_KEY='pvo-map-layers';
/** The legend card starts closed on small screens, where it would cover much of the map, until the viewer opens it. */
const LEGEND_KEY='pvo-map-legend';
function savedLegend(){try{const v=localStorage.getItem(LEGEND_KEY);if(v==='0'||v==='1')return v==='1';}catch{/* storage blocked */}return innerWidth>=1100&&innerHeight>=700;}
function savedLayers():Record<LayerKey,boolean>{const all=Object.fromEntries(LAYERS.map(([id])=>[id,true])) as Record<LayerKey,boolean>;try{for(const id of (localStorage.getItem(LAYERS_KEY)??'').split(','))if(id in all)all[id as LayerKey]=false;}catch{/* storage blocked */}return all;}
const POI_LOOK:Record<MapPoiKind,[Icon,string]>={
  cafe:[Coffee,'#8a5a3a'],food:[UtensilsCrossed,'#d9822b'],shop:[ShoppingBag,'#7a5aa6'],market:[Store,'#c46a2c'],hotel:[BedDouble,'#4f7ea8'],
  mall:[ShoppingBag,'#b5223b'],theatre:[Theater,'#8e2b20'],school:[School,'#2c5d8f'],pagoda:[Flower2,'#b8862b'],post:[Mail,'#c08a2a'],tower:[Building2,'#7d5ba6'],
  hospital:[Hospital,'#e05a5a'],police:[Shield,'#1f4fa8'],bank:[Landmark,'#2f7a3a'],atm:[Banknote,'#2f7a3a'],dock:[Ship,'#2f86c6'],boat:[Anchor,'#2f86c6'],
  gun:[Crosshair,'#3f6f9f'],bike:[Bike,'#5e927c'],venue:[Music,'#ff4f8b'],
};
const VENUE_ICON:Record<VenueKind,Icon>={bar:Martini,karaoke:Mic,motel:BedDouble,club:Music,spa:Flower2,beer:Martini};
/** Kinds worth a name next to the icon once the map is zoomed in (the rest show it on hover). */
const NAMED=new Set<MapPoiKind>(['tower','theatre','mall','hospital','police','bank','school','pagoda','market','dock','boat','gun','bike','post']);
const TONE:Record<BlockTone,string>={house:'#e5cda5',shop:'#ebbf94',midrise:'#cbc6bb',tower:'#9aa2aa',civic:'#d8cbac'};
const EXTRA_LABELS=[{text:'QUẬN 1 · BẾN THÀNH',x:262,z:300,color:DISTRICT_BY_ID.D2.color}];
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

function mix(a:string,b:string,t:number){const p=(s:string,i:number)=>parseInt(s.slice(1+i*2,3+i*2),16);return `rgb(${[0,1,2].map(i=>Math.round(p(a,i)*(1-t)+p(b,i)*t)).join(',')})`;}
const patterns=new WeakMap<CanvasRenderingContext2D,Map<string,CanvasPattern|null>>();
/** Diagonal hatching for districts still to come (one small tile per colour, cached per canvas). */
function hatch(ctx:CanvasRenderingContext2D,color:string){let cache=patterns.get(ctx);if(!cache)patterns.set(ctx,cache=new Map());if(!cache.has(color)){const c=document.createElement('canvas');c.width=c.height=8;const g=c.getContext('2d')!;g.strokeStyle=color;g.lineWidth=1.2;g.beginPath();g.moveTo(-2,10);g.lineTo(10,-2);g.moveTo(-2,2);g.lineTo(2,-2);g.moveTo(6,10);g.lineTo(10,6);g.stroke();cache.set(color,ctx.createPattern(c,'repeat'));}return cache.get(color)??null;}

/** Draws the base map (everything except the markers) for the view. */
function drawMap(ctx:CanvasRenderingContext2D,w:number,h:number,v:View,data:MapData|null,showDistricts:boolean){
  const X=(x:number)=>w/2+(x-v.cx)*v.k,Z=(z:number)=>h/2+(z-v.cz)*v.k,k=v.k;
  const rect=(b:Rect)=>ctx.rect(X(b.minX),Z(b.minZ),(b.maxX-b.minX)*k,(b.maxZ-b.minZ)*k);
  const fillRect=(b:Rect,fill:string)=>{ctx.fillStyle=fill;ctx.fillRect(X(b.minX),Z(b.minZ),(b.maxX-b.minX)*k,(b.maxZ-b.minZ)*k);};
  const poly=(p:number[])=>{ctx.beginPath();for(let i=0;i<p.length;i+=2)ctx[i?'lineTo':'moveTo'](X(p[i]),Z(p[i+1]));ctx.closePath();};
  const visible=(x:number,y:number,m:number)=>x>-m&&x<w+m&&y>-m&&y<h+m;
  ctx.fillStyle='#cfcbbb';ctx.fillRect(0,0,w,h);
  const ground='#e1ddcf';
  fillRect(CITY_BOUNDS,ground);
  // Districts still to come: tinted and hatched, with a dashed outline round each district (the seams inside are
  // painted over by the district's own fill).
  for(const d of DISTRICTS){
    const parts=d.parts.filter(p=>p.phase!=='P0');if(!parts.length)continue;
    ctx.beginPath();parts.forEach(p=>rect(p.rect));
    ctx.setLineDash([7,5]);ctx.lineWidth=2.5;ctx.strokeStyle=showDistricts?mix(ground,d.color,0.6):'#bdb7a6';ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=mix(ground,d.color,showDistricts?(d.phase==='P2'?0.09:0.14):0.03);ctx.fill();
    const pattern=hatch(ctx,showDistricts?mix(ground,d.color,0.3):'#cdc7b6');
    if(pattern){pattern.setTransform(new DOMMatrix().translate(X(0)%8,Z(0)%8));ctx.fillStyle=pattern;ctx.fill();}
  }
  // Water: the rivers and canals still to come pale, today's river (between the buoy lines) full colour.
  for(const water of WATERS){poly(water.poly);ctx.fillStyle='#a8c8c3';ctx.fill();}
  // Today's land, tinted by district.
  fillRect({minX:LAND.minX,maxX:LAND.maxX,minZ:-137.6,maxZ:LAND.maxZ},'#ebe7d4');
  if(showDistricts)for(const d of DISTRICTS)for(const p of d.parts)if(p.phase==='P0')fillRect(p.rect,`${d.color}24`);
  fillRect(RIVER,'#78aeb0');
  if(data){
    fillRect({...data.promenade,minX:LAND.minX,maxX:LAND.maxX,maxZ:-118},'#e6d9ba');
    for(const p of data.parks)fillRect(p.rect,p.paved?'#ebe2cd':'#a9c98f');
    // Roads: the sidewalk band, then the carriageway (and its centre line when close).
    const band=(s:MapData['roads'][number],half:number,start=0):Rect=>s.z1===s.z2?{minX:s.x1,maxX:s.x2,minZ:s.z1-half,maxZ:s.z1+half}:{minX:s.x1-half,maxX:s.x1+half,minZ:s.z1-start,maxZ:s.z2};
    for(const s of data.roads)fillRect(band(s,12.5),'#f3eee1');
    for(const s of data.roads)fillRect(band(s,7,7),'#fdfcf8');
    if(k>=2.6){ctx.setLineDash([3*k,3*k]);ctx.strokeStyle='#e4ddca';ctx.lineWidth=Math.max(1,0.2*k);ctx.beginPath();for(const s of data.roads){ctx.moveTo(X(s.x1),Z(s.z1));ctx.lineTo(X(s.x2),Z(s.z2));}ctx.stroke();ctx.setLineDash([]);}
    for(const b of data.blocks)fillRect(b.rect,TONE[b.tone]);
    if(k>=1.4){ctx.strokeStyle='#5a4a2a26';ctx.lineWidth=1;ctx.beginPath();for(const b of data.blocks)rect(b.rect);ctx.stroke();}
    for(const d of data.docks){fillRect(d.pier,'#8a6a4c');fillRect(d.steps,'#b79e7c');}
  }
  // Buoy lines close today's river at both ends; a thin line marks today's fences.
  ctx.setLineDash([3,4]);ctx.strokeStyle='#e8893a';ctx.lineWidth=2;ctx.beginPath();for(const x of [RIVER.minX,RIVER.maxX]){ctx.moveTo(X(x),Z(RIVER.minZ));ctx.lineTo(X(x),Z(RIVER.maxZ));}ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#4a5a4c59';ctx.lineWidth=1.5;ctx.strokeRect(X(LAND.minX),Z(-137.6),(LAND.maxX-LAND.minX)*k,(LAND.maxZ+137.6)*k);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
  const text=(t:string,x:number,y:number,font:string,fill:string,halo='#ffffffd9',spacing='0px',angle=0)=>{ctx.save();ctx.translate(x,y);if(angle)ctx.rotate(angle);ctx.font=font;ctx.letterSpacing=spacing;ctx.lineWidth=3.5;ctx.strokeStyle=halo;ctx.strokeText(t,0,0);ctx.fillStyle=fill;ctx.fillText(t,0,0);ctx.restore();};
  // Water names.
  const wsize=clamp(9+3*Math.sqrt(k),10,14);
  for(const water of WATERS)for(const l of water.labels){
    const x=X(l.x),y=Z(l.z);if(!visible(x,y,200)||(water.phase!=='P0'&&k>2.2))continue;
    text(water.name,x,y,`italic 700 ${wsize}px Arial`,water.phase==='P0'?'#2c6b70':'#5f8f8c','#ffffff99','3px',l.vertical?-Math.PI/2:0);
  }
  // Street names between junctions, once the map is close enough to read them (the short form where space is tight).
  if(data&&k>=1.1){
    const size=clamp(8+2*k,10,13),font=`600 ${size}px Arial`;ctx.font=font;ctx.letterSpacing='0.3px';
    for(const s of data.roads){
      const hz=s.z1===s.z2,tw=ctx.measureText(s.label).width,sw=ctx.measureText(s.short).width;
      const cross=hz?data.roads.filter(o=>o.z1!==o.z2).map(o=>o.x1):data.roads.filter(o=>o.z1===o.z2&&o.z1>s.z1).map(o=>o.z1);
      const stops=[hz?s.x1:s.z1,...cross,hz?s.x2:s.z2].sort((a,b)=>a-b);
      let last=-Infinity;
      for(let i=0;i<stops.length-1;i++){
        const gap=(stops[i+1]-stops[i]-14)*k,mid=(stops[i]+stops[i+1])/2;
        const x=hz?X(mid):X(s.x1),y=hz?Z(s.z1):Z(mid),along=hz?x:y;
        const name=gap>=tw+12?s.label:gap>=sw+10?s.short:'';
        if(!name||along-last<tw+220||!visible(x,y,60))continue;
        last=along;text(name,x,y,font,'#5b6656','#ffffff','0.3px',hz?0:-Math.PI/2);
      }
    }
  }
  // District names: the open ones over today's land, the rest marked "Sắp mở". Bold (700) at most: heavier Arial
  // weights resolve to Arial Black, which lacks the precomposed Vietnamese letters (Ậ, Ế, Ủ… fall back to a serif).
  // A name that would overlap one already drawn loses its ward (open districts) or is left out.
  if(showDistricts){
    const near=k>=0.8,size=near?clamp(9+8*Math.sqrt(k),16,26):12,placed:number[][]=[];
    const room=(x:number,y:number,w:number,h:number)=>{const b=[x-w/2-6,y-h/2-3,x+w/2+6,y+h/2+3];if(placed.some(p=>b[0]<p[2]&&p[0]<b[2]&&b[1]<p[3]&&p[1]<b[3]))return false;placed.push(b);return true;};
    const width=(t:string,font:string,spacing:string)=>{ctx.font=font;ctx.letterSpacing=spacing;return ctx.measureText(t).width;};
    ctx.globalAlpha=k<1.2?1:k<2?0.75:0.45;
    for(const d of DISTRICTS){
      const ward=d.parts.find(p=>p.phase==='P0'&&p.ward)?.ward;if(!d.parts.some(p=>p.phase==='P0'))continue;
      const x=X(d.label.x),y=Z(d.label.z)-(near?size*0.35:0);if(!visible(x,y,300))continue;
      const font=`700 ${size}px Arial`,spacing=near?'2px':'1px',name=[ward?`${d.name} · ${ward}`:d.name,d.name].find(t=>room(x,y,width(t,font,spacing),size));
      if(!name)continue;
      text(name,x,y,font,mix('#000000',d.color,0.6),'#ffffffd9',spacing);
      if(near)text(d.subtitle,x,y+size*0.95,`600 ${Math.max(10,size*0.45)}px Arial`,'#3d4c42','#ffffffd9');
    }
    ctx.globalAlpha=1;
    const soonLabel=(t:string,x:number,y:number,color:string)=>{
      if(!visible(x,y,300))return;
      const s=clamp(8+6*Math.sqrt(k),11,20),font=`700 ${s}px Arial`,chip=`700 ${Math.max(10,s*0.55)}px Arial`,ph=Math.max(14,s*0.85),pw=width('Sắp mở',chip,'0.3px')+14;
      if(!room(x,y+s*0.15,Math.max(width(t,font,'1.5px'),pw),s*1.9))return;
      text(t,x,y-s*0.3,font,mix('#7a766a',color,0.4),'#ffffffb3','1.5px');
      const py=y+s*0.65;
      ctx.fillStyle='#f9f7eee6';ctx.strokeStyle=mix('#9b9583',color,0.4);ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-pw/2,py-ph/2,pw,ph,ph/2);ctx.fill();ctx.stroke();
      ctx.font=chip;ctx.letterSpacing='0.3px';ctx.fillStyle='#6d695d';ctx.fillText('Sắp mở',x+0.15,py+0.5);
    };
    for(const d of DISTRICTS)if(d.phase!=='P0')soonLabel(d.name,X(d.label.x),Z(d.label.z),d.color);
    for(const l of EXTRA_LABELS)soonLabel(l.text,X(l.x),Z(l.z),l.color);
  }
}

type Marker={id:string;x:number;z:number;cls:string;icon:Icon|null;color:string;name:string;note?:string;label?:boolean;square?:boolean};
function poiMarker(p:MapPoi,k:number):Marker{
  const [icon,color]=p.venue?[VENUE_ICON[p.venue],VENUE_LOOKS[p.venue].neon]:POI_LOOK[p.kind];
  // Cafés, food and shops: plain dots at mid zoom, small icons up close.
  const minor=p.layer==='food'&&p.kind!=='market';
  return {id:p.id,x:p.x,z:p.z,cls:minor?(k<2.6?'dot':'small'):'',icon:minor&&k<2.6?null:icon,color,name:p.name,note:p.note,label:k>=2.2&&NAMED.has(p.kind),square:p.kind==='gun'||p.kind==='bike'||p.kind==='hospital'||p.kind==='police'};
}

type Props={hud:Hud;peers:PeerState[];area:Area;street:string;heading:number;onClose:()=>void};
/** Full-screen city map: districts (open and still to come), water, streets, places and the HUD's markers. */
export default function BigMap({hud,peers,area,street,heading,onClose}:Props){
  const root=useRef<HTMLElement>(null),canvas=useRef<HTMLCanvasElement>(null),pointers=useRef(new Map<number,{x:number;y:number}>()),pinch=useRef<{d:number;k:number}|null>(null);
  const [size,setSize]=useState({w:0,h:0});
  const [view,setView]=useState<View|null>(null);
  const [data,setData]=useState<MapData|null>(null);
  const [layers,setLayers]=useState(savedLayers);
  const [legendOpen,setLegendOpen]=useState(savedLegend),[dragging,setDragging]=useState(false);
  const fitAll=(w:number,h:number)=>Math.min(w/(CITY_BOUNDS.maxX-CITY_BOUNDS.minX),h/(CITY_BOUNDS.maxZ-CITY_BOUNDS.minZ));
  const limits=(w:number,h:number)=>[fitAll(w,h)*0.6,5];
  const settle=(v:View,w:number,h:number):View=>{const [a,b]=limits(w,h);return {k:clamp(v.k,a,b),cx:clamp(v.cx,CITY_BOUNDS.minX,CITY_BOUNDS.maxX),cz:clamp(v.cz,CITY_BOUNDS.minZ,CITY_BOUNDS.maxZ)};};
  // The drawable city comes from a lazily loaded module (client only: the guard keeps it out of the SSR bundle).
  useEffect(()=>{if(import.meta.env.SSR)return;let live=true;import('./game/map/mapdata').then(m=>{if(live)setData(m.mapData());}).catch(e=>console.error(e));return()=>{live=false;};},[]);
  useEffect(()=>{const el=root.current;if(!el)return;const previous=document.activeElement as HTMLElement|null;el.focus();
    const ro=new ResizeObserver(([entry])=>{const w=Math.round(entry.contentRect.width),h=Math.round(entry.contentRect.height);setSize({w,h});setView(v=>v?settle(v,w,h):settle({cx:hud.x,cz:hud.z,k:clamp(Math.min(w/560,h/400),1.2,2.6)},w,h));});
    ro.observe(el);return()=>{ro.disconnect();previous?.focus?.();};
  // Once per opening: the first view centres on where the player stands.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{const c=canvas.current;if(!c||!view||!size.w)return;const dpr=Math.min(2,window.devicePixelRatio||1);
    if(c.width!==Math.round(size.w*dpr)||c.height!==Math.round(size.h*dpr)){c.width=Math.round(size.w*dpr);c.height=Math.round(size.h*dpr);}
    const ctx=c.getContext('2d');if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);drawMap(ctx,size.w,size.h,view,data,layers.districts);},[view,size,data,layers.districts]);
  /** Zooms by `factor` (or to `to` pixels per metre) keeping the world point under (sx, sy) in place. */
  const zoomAt=(factor:number,sx:number,sy:number,to?:number)=>setView(v=>{if(!v)return v;const [a,b]=limits(size.w,size.h);const k=clamp(to??v.k*factor,a,b);const wx=v.cx+(sx-size.w/2)/v.k,wz=v.cz+(sy-size.h/2)/v.k;return settle({k,cx:wx-(sx-size.w/2)/k,cz:wz-(sy-size.h/2)/k},size.w,size.h);});
  const panBy=(dx:number,dy:number)=>setView(v=>v&&settle({...v,cx:v.cx-dx/v.k,cz:v.cz-dy/v.k},size.w,size.h));
  useEffect(()=>{const el=root.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const box=el.getBoundingClientRect();zoomAt(Math.exp(-clamp(e.deltaY,-120,120)*0.0022),e.clientX-box.left,e.clientY-box.top);};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);});
  function down(e:ReactPointerEvent){if((e.target as HTMLElement).closest('button,.bm-card'))return;e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});setDragging(true);if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={d:Math.hypot(a.x-b.x,a.y-b.y),k:view?.k??1};}}
  function move(e:ReactPointerEvent){const p=pointers.current.get(e.pointerId);if(!p)return;const box=e.currentTarget.getBoundingClientRect();
    if(pointers.current.size===2&&pinch.current){const before=[...pointers.current.values()];const mid0={x:(before[0].x+before[1].x)/2,y:(before[0].y+before[1].y)/2};pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const [a,b]=[...pointers.current.values()];const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      panBy(mid.x-mid0.x,mid.y-mid0.y);zoomAt(1,mid.x-box.left,mid.y-box.top,pinch.current.k*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.current.d));return;}
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});panBy(e.clientX-p.x,e.clientY-p.y);}
  function up(e:ReactPointerEvent){pointers.current.delete(e.pointerId);if(pointers.current.size<2)pinch.current=null;if(!pointers.current.size)setDragging(false);}
  function toggle(key:LayerKey){const next={...layers,[key]:!layers[key]};setLayers(next);try{localStorage.setItem(LAYERS_KEY,LAYERS.map(([id])=>id).filter(id=>!next[id]).join(','));}catch{/* storage blocked */}}
  function locate(){setView(v=>v&&settle({...v,cx:hud.x,cz:hud.z,k:Math.max(v.k,1.6)},size.w,size.h));}
  /** The whole city, fitted into the part of the screen the cards and buttons leave free. */
  function overview(){
    const el=root.current;if(!el)return;const box=el.getBoundingClientRect();
    const card=(s:string)=>{const e=el.querySelector(s);return e&&getComputedStyle(e).display!=='none'?e.getBoundingClientRect():null;};
    const head=card('.bm-head'),left=12,top=(head?head.bottom-box.top:0)+12;let right=size.w-12,bottom=size.h-40;
    // A column of buttons or the legend on the right narrows the free area; a row of buttons at the bottom lowers it.
    for(const r of [legendOpen?card('.bm-legend'):null,card('.bm-zoom')])if(r){if(r.height>=r.width)right=Math.min(right,r.left-box.left-12);else bottom=Math.min(bottom,r.top-box.top-8);}
    const bw=CITY_BOUNDS.maxX-CITY_BOUNDS.minX,bh=CITY_BOUNDS.maxZ-CITY_BOUNDS.minZ,k=Math.max(0.01,Math.min((right-left)/bw,(bottom-top)/bh));
    setView(()=>settle({k,cx:(CITY_BOUNDS.minX+CITY_BOUNDS.maxX)/2-((left+right)/2-size.w/2)/k,cz:(CITY_BOUNDS.minZ+CITY_BOUNDS.maxZ)/2-((top+bottom)/2-size.h/2)/k},size.w,size.h));
  }
  function toggleLegend(){const next=!legendOpen;setLegendOpen(next);try{localStorage.setItem(LEGEND_KEY,next?'1':'0');}catch{/* storage blocked */}}
  function key(e:ReactKeyboardEvent){const step=90,k=e.key.toLowerCase();
    // Tab stays inside the map; Space and Enter on a focused button press that button.
    if(k==='tab'){const items=[...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])].filter(b=>b.offsetParent!==null);if(!items.length)return;const first=items[0],last=items[items.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
    if((k===' '||k==='enter')&&(e.target as HTMLElement).closest('button'))return;
    if(k==='+'||k==='=')zoomAt(1.35,size.w/2,size.h/2);else if(k==='-'||k==='_')zoomAt(1/1.35,size.w/2,size.h/2);
    else if(k==='arrowleft'||k==='a')panBy(step,0);else if(k==='arrowright'||k==='d')panBy(-step,0);else if(k==='arrowup'||k==='w')panBy(0,step);else if(k==='arrowdown'||k==='s')panBy(0,-step);
    else if(k==='c'||k===' ')locate();else return;e.preventDefault();}

  const k=view?.k??1,sx=(x:number)=>size.w/2+(x-(view?.cx??0))*k,sy=(z:number)=>size.h/2+(z-(view?.cz??0))*k;
  const markers:Marker[]=[];
  // Places: none in the city-wide view, cafés/food/shops only from street level.
  if(data&&k>=0.8)for(const p of data.pois)if(layers[p.layer]&&(p.layer!=='food'||p.kind==='market'||k>=1.45))markers.push(poiMarker(p,k));
  if(layers.missions){
    if(hud.zombie)hud.zombie.dots.forEach((d,i)=>markers.push({id:`z${i}`,x:d.x,z:d.z,cls:'bm-zombie',icon:null,color:'',name:'Zombie'}));
    else{
      hud.offers.forEach((o,i)=>markers.push({id:`o${i}`,x:o.x,z:o.z,cls:'bm-offer',icon:Briefcase,color:'',name:'Việc phụ',note:'Lại gần để nhận việc'}));
      if(Math.hypot(hud.targetX-hud.x,hud.targetZ-hud.z)>2)markers.push({id:'target',x:hud.targetX,z:hud.targetZ,cls:'bm-target',icon:Flag,color:'',name:hud.targetName||'Điểm đến',note:hud.missionInfo.title,label:true});
    }
    hud.police.forEach((p,i)=>markers.push({id:`p${i}`,x:p.x,z:p.z,cls:'bm-police',icon:null,color:i%2?'#2a6bff':'#ff2a2a',name:'Cảnh sát'}));
  }
  if(layers.friends)peers.forEach(p=>markers.push({id:`peer${p.id}`,x:p.x,z:p.z,cls:'bm-peer',icon:null,color:p.color,name:p.name,label:true}));
  if(hud.vehicle==='foot')markers.push({id:'bike',x:hud.bikeX,z:hud.bikeZ,cls:`bm-bike${hud.bikeBroken?' broken':''}`,icon:Bike,color:'',name:'Xe của bạn',note:hud.bikeBroken?'Đã hỏng':'Đang đậu ở đây'});
  const onScreen=(m:{x:number;z:number})=>{const x=sx(m.x),y=sy(m.z);return x>-40&&x<size.w+40&&y>-40&&y<size.h+40;};
  // Named markers last, so their names are never hidden under a neighbour's icon.
  const shown=markers.filter(onScreen).sort((a,b)=>Number(!!a.label)-Number(!!b.label));
  const scaleM=[10,20,50,100,200,500,1000].find(m=>m*k>=70)??1000;
  const open=DISTRICTS.filter(d=>d.phase==='P0');
  const [kMin,kMax]=view?limits(size.w,size.h):[0,0];
  return <section ref={root} className={`big-map${dragging?' dragging':''}`} role="dialog" aria-modal="true" aria-labelledby="big-map-title" tabIndex={-1} onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <canvas ref={canvas} role="img" aria-label={`Bản đồ thành phố: ${open.length} khu vực đã mở, ${DISTRICTS.length-open.length} khu vực sắp mở`}/>
    {view&&<div className="bm-markers">
      {layers.missions&&!hud.zombie&&hud.gangs.map((g,i)=>{const r=(g.anger?34:26)*k;return onScreen(g)&&<i key={`g${i}`} className="bm-gang" style={{left:sx(g.x)-r,top:sy(g.z)-r,width:r*2,height:r*2,borderColor:i?'#d8a020':'#c0392b',background:i?'#d8a02018':'#c0392b14'}} title={g.name}/>;})}
      {shown.map(m=>{const I=m.icon;return <div key={m.id} className={`bm-marker ${m.cls}${m.square?' square':''}`} style={{transform:`translate(${sx(m.x)}px,${sy(m.z)}px)`}} aria-label={m.name}>
        <i style={m.color?{background:m.color}:undefined}>{I&&<I size={m.cls==='bm-target'?15:m.cls==='small'?9:11} strokeWidth={2.4}/>}</i>
        {m.label&&<b>{m.name}</b>}{m.cls!=='bm-police'&&m.cls!=='bm-zombie'&&<span className="bm-tip"><b>{m.name}</b>{m.note&&<small>{m.note}</small>}</span>}
      </div>;})}
      <div className="bm-player" style={{transform:`translate(${sx(hud.x)}px,${sy(hud.z)}px)`}} aria-label="Vị trí của bạn"><svg width="30" height="30" viewBox="-15 -15 30 30" style={{transform:`rotate(${Math.PI-heading}rad)`}}><path d="M0 -12 L9 10 L0 5 L-9 10 Z" fill="#253c32" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round"/></svg></div>
    </div>}
    {!data&&<div className="bm-loading">Đang vẽ bản đồ…</div>}
    <div className="bm-card bm-head"><div className="eyebrow"><i/> BẢN ĐỒ THÀNH PHỐ</div><h2 id="big-map-title">{area.title||'Ngoài thành phố'}</h2><p>{[street,area.zone].filter(Boolean).join(' · ')||area.subtitle}</p><p><b>{open.length}/{DISTRICTS.length}</b> khu vực đã mở · phần gạch chéo là <b>sắp mở</b></p></div>
    <div className="bm-close"><kbd>N · Esc</kbd><button className="icon-button" onClick={onClose} aria-label="Đóng bản đồ"><X size={19}/></button></div>
    <section className={`bm-card bm-legend${legendOpen?'':' closed'}`} aria-label="Lớp bản đồ"><h3>LỚP BẢN ĐỒ</h3>
      {LAYERS.filter(([id])=>id!=='friends'||peers.length>0).map(([id,label,swatch])=><button key={id} className="bm-layer" aria-pressed={layers[id]} onClick={()=>toggle(id)}>
        <span className="bm-swatch">{swatch.map(([I,color],i)=><i key={i} style={{background:color,borderRadius:I?undefined:3}}>{I&&<I size={9} strokeWidth={2.6}/>}</i>)}</span>{label}{id==='food'&&k<1.45&&<small>phóng to</small>}</button>)}
      <div className="bm-status"><span><i className="open"/>Đã mở: {open.map(d=>d.name==='QUẬN 1'?'Quận 1 · Bến Nghé':d.name==='AN HÒA'?'An Hòa':d.name).join(', ')}</span><span><i className="soon"/>Sắp mở: thành phố sẽ lớn dần</span></div>
    </section>
    <div className="bm-zoom">
      <button className="bm-legend-toggle" onClick={toggleLegend} aria-expanded={legendOpen} aria-label="Lớp bản đồ"><Layers size={17}/></button>
      <button onClick={()=>zoomAt(1.4,size.w/2,size.h/2)} disabled={k>=kMax-1e-3} aria-label="Phóng to"><Plus size={17}/></button>
      <button onClick={()=>zoomAt(1/1.4,size.w/2,size.h/2)} disabled={k<=kMin+1e-3} aria-label="Thu nhỏ"><Minus size={17}/></button>
      <button onClick={locate} aria-label="Về vị trí của bạn"><LocateFixed size={17}/></button>
      <button onClick={overview} aria-label="Xem toàn thành phố"><Expand size={16}/></button>
    </div>
    <div className="bm-scale" aria-hidden="true">{scaleM>=1000?`${scaleM/1000} km`:`${scaleM} m`}<i style={{width:scaleM*k}}/></div>
    <div className="bm-hint">Kéo để di chuyển · lăn chuột hoặc chụm hai ngón để phóng to · C về vị trí của bạn</div>
  </section>;
}
