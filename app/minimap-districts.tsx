"use client";
import {memo,useEffect,useState} from 'react';

type Layer={land:string;water:string;green:string;bands:{d:string;w:number}[];roads:{d:string;w:number}[]};
const path=(p:number[])=>{let d='';for(let i=0;i<p.length;i+=2)d+=`${i?'L':'M'}${p[i]} ${p[i+1]}`;return d;};
/**
 * The wired districts on the minimap, in world units under its transform (page.tsx draws it inside the map's <g>):
 * their land, waters and greens, then their streets (sidewalk band, carriageway) grouped by width into a few paths.
 * The drawable city comes from map/mapdata.ts with a dynamic import on the client (never in the SSR bundle). It is
 * drawn once: the minimap moves it with its transform, nothing here re-renders.
 */
function MinimapDistricts(){
  const [layer,setLayer]=useState<Layer|null>(null);
  useEffect(()=>{
    if(import.meta.env.SSR)return;
    let live=true;
    import('./game/map/mapdata').then(m=>{
      if(!live)return;
      const data=m.mapData();
      if(!data.open.length)return;
      const group=(list:{pts:number[];w:number}[])=>{const by=new Map<number,string>();for(const l of list){const w=Math.round(l.w*2)/2;by.set(w,(by.get(w)??'')+path(l.pts));}return [...by].map(([w,d])=>({w,d}));};
      setLayer({
        land:data.open.map(path).join('Z')+'Z',
        water:data.waters.map(path).join('Z')+(data.waters.length?'Z':''),
        green:data.greens.filter(g=>!g.paved).map(g=>path(g.poly)).join('Z')+'Z',
        bands:group(data.lines.filter(l=>l.cls!=='hem').map(l=>({pts:l.pts,w:2*(l.half+l.sidewalk)}))),
        roads:group(data.lines.map(l=>({pts:l.pts,w:l.cls==='hem'?Math.max(2.4,2*l.half):2*l.half}))),
      });
    }).catch(e=>console.error(e));
    return()=>{live=false;};
  },[]);
  if(!layer)return null;
  return <g aria-hidden="true">
    <path d={layer.land} fill="#c9d1ad"/>
    {layer.water&&<path d={layer.water} fill="#76aaa9"/>}
    <path d={layer.green} fill="#9fbf8a"/>
    {layer.bands.map(b=><path key={`b${b.w}`} d={b.d} stroke="#dcd8c6" strokeWidth={b.w} fill="none" strokeLinejoin="round"/>)}
    {layer.roads.map(r=><path key={`r${r.w}`} d={r.d} stroke="#eee9d9" strokeWidth={r.w} fill="none" strokeLinecap="round" strokeLinejoin="round"/>)}
  </g>;
}
export default memo(MinimapDistricts);
