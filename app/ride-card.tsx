"use client";
import {Bus} from 'lucide-react';
import type {RideView} from './game/game';

/** Riding as a passenger (bus, waterbus, xe ôm): the line, the next stop and the stops ahead with ETAs. Not modal. */
export default function RideCard({ride}:{ride:RideView}){
  return <section className="ride-card" aria-label="Đang đi xe">
    <div className="ride-head"><Bus size={14}/><b>{ride.title}</b></div>
    {ride.next&&<p className="ride-next">Trạm tới: <b>{ride.next}</b></p>}
    {ride.stops.length>0&&<ol className="ride-stops">{ride.stops.slice(0,5).map(s=><li key={s.name}><span>{s.name}</span><small>{s.eta<60?`${Math.max(0,Math.round(s.eta))} giây`:`${Math.round(s.eta/60)} phút`}</small></li>)}</ol>}
    <p className="ride-hint"><kbd>E</kbd> {ride.hint}</p>
  </section>;
}
