"use client";
import {Clock,Cloud,CloudRain,MapIcon,MapPin,Navigation,Sun} from 'lucide-react';
import type {Area,Street} from './game/map/districts';

const WEATHER_ICON={'Nắng':Sun,'Nhiều mây':Cloud,'Mưa':CloudRain};
/** The engine's clock line ("10:33 · Nhiều mây") as the time and a weather icon, so it fits beside a street name. */
function GameClock({clock}:{clock:string}){
  const [time,weather='']=clock.split(' · '),Icon=WEATHER_ICON[weather as keyof typeof WEATHER_ICON];
  return <span className="map-clock" aria-label={clock}><Clock size={10}/>{time}{Icon?<Icon size={11} aria-label={weather}/>:weather&&<small>{weather}</small>}</span>;
}
/**
 * The top of the minimap card: the district (or water) on the title line with the big-map button; the street and
 * the clock below; the named area on its own line under a street (with neither, the area's description, on up to two
 * lines). Narrow screens keep the clock on the title line.
 */
export default function AreaHeader({area,street,clock,onOpenMap}:{area:Area;street:Street|null;clock:string;onOpenMap:()=>void}){
  const main=street?.short??area.zone,sub=street?area.zone:'';
  return <>
    <div className="map-title"><Navigation size={11}/><span className="map-name">{area.title}</span>{clock&&<GameClock clock={clock}/>}<button className="map-open" onClick={onOpenMap} aria-label="Mở bản đồ thành phố (phím N)" title="Bản đồ thành phố (N)"><MapIcon size={11}/></button></div>
    <div className="map-street"><MapPin size={9}/>{main?<b>{main}</b>:<span className="map-sub">{area.subtitle}</span>}{clock&&<GameClock clock={clock}/>}</div>
    {sub&&<div className="map-zone">{sub}</div>}
  </>;
}
