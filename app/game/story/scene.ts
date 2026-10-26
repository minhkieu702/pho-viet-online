import type { Cond, TextRef } from './types.ts';
import type { ContractKind } from './contract.ts';

/**
 * Cutscene data schema for the cinematics director (story-system-cinematics.md: shot macros, cues, stage,
 * handoff): the authoring format of every cutscenes/chNN.ts. The director lane owns it and compiles a Scene into
 * its scene-timeline tracks (director-actors-extras.md §3 SceneDef); content batches only import it. The field
 * names follow the director's StageSpec and Handoff (§6, §4.8), so the compile is mechanical: `stage` is a
 * StageSpec, `handoff` a Handoff, and a Mark is the director's Mark/Target. A scene is a list of shots; each shot has
 * one camera move and timed cues (actors, lines, props, rides, sound, cards). Durations add up to `seconds`. Lines
 * are '@keys' of the chapter text table (text/vi/chNN.ts); `if` lines are kept only when the condition holds
 * (choice consequences). A skip must leave the `handoff` state. Slow motion (`slowmo`) is allowed only in a
 * `stage.freezeWorld` scene (input locked, player invulnerable, police frozen; director spec §3).
 *
 * Cast: scene actor id → a story cast id, 'tpl:<template>' for a one-off extra, or an Extra batch.
 * Marks: a site or spot of story/sites.ts ('cafe-co-ba.backStairs'), a set anchor 'set:<space>.<anchor>' (declared
 * in the content module's ANCHORS), a scene cast id or joint ('tin', 'tin.head'), 'prop:<id>' / 'ride:<id>' for a
 * prop or ride cue of the same scene, 'vehicle:<id>' for a story vehicle the mission has spawned (VehiclePort), or
 * { at, off } — an offset in metres from a mark: world axes (x east, y up, z south; y from the site's own height)
 * for sites, the own frame (x right, y up, z forward) for cast, ride and vehicle marks.
 * Safety conventions: captives use only dignified extra poses, violence cuts away, drug packets stay grey blocks.
 */

export type Ease = 'linear' | 'inQuad' | 'outQuad' | 'inOutQuad' | 'inCubic' | 'outCubic' | 'inOutCubic' | 'inOutSine' | 'inExpo' | 'outExpo' | 'outBack';
export type Mark = string | { at: string; off: [number, number, number] };
export type Fov = number | [number, number];
export type Cam =
  | { k: 'shot'; eye: Mark; look: Mark; fov: number; handheld?: number; roll?: number }
  | { k: 'move'; from: Mark; to: Mark; look: Mark | [Mark, Mark]; fov: Fov; ease?: Ease; handheld?: number }
  | { k: 'crane'; from: Mark; to: Mark; look: Mark; fov: Fov; ease?: Ease }
  | { k: 'rail'; points: Mark[]; look: Mark[]; fov: number[]; roll?: number[]; ease?: Ease }
  | { k: 'orbit'; center: Mark; radius: number; height: number; from: number; to: number; fov: number }
  | { k: 'follow'; target: Mark; offset: [number, number, number]; fov: number; lag?: number }
  /** Over the listener's shoulder onto the speaker: two different actors. */
  | { k: 'ots'; speaker: string; listener: string; side?: 'left' | 'right'; fov: number }
  | { k: 'twoShot'; a: string; b: string; fov: number }
  | { k: 'insert'; target: Mark; fov: number; dist?: number }
  | { k: 'snapZoom'; target: Mark; from: number; to: number }
  | { k: 'split'; left: Cam; right: Cam; divider: 'vertical' | 'diagonal'; names: [TextRef, TextRef] }
  | { k: 'black' };
export type Channel = 'scene' | 'phone' | 'radio' | 'overheard' | 'inner' | 'tv';
export type Expr = 'neutral' | 'smile' | 'cold-smile' | 'worried' | 'angry' | 'cry' | 'shock' | 'pain' | 'determined' | 'eyes-closed';
/** `t`: seconds into the shot; `if`: played only when the condition holds (runner.test, so mission vars work too). */
export type Cue = { t?: number; if?: Cond } & (
  | { k: 'place'; who: string; at: Mark; pose?: string; yaw?: number }
  | { k: 'walk'; who: string; path: Mark[]; pace?: 'walk' | 'run' | 'sneak' | 'shuffle' }
  | { k: 'anim'; who: string; clip: string; loop?: boolean }
  | { k: 'pair'; clip: string; a: string; b: string }
  | { k: 'expr'; who: string; e: Expr }
  | { k: 'look'; who: string; at: Mark | null }
  /** `dur` overrides the subtitle time, clamp(1.4 + 0.065·chars, 1.8, 7.5) s (director spec §5.2). */
  | { k: 'say'; who: string; text: TextRef; ch?: Channel; as?: TextRef; if?: Cond; dur?: number }
  | { k: 'card'; kind: 'time' | 'title' | 'location' | 'intro'; text: TextRef; sub?: TextRef; who?: string }
  | { k: 'prop'; id: string; kind: string; at?: Mark; attach?: string; text?: TextRef; lines?: TextRef[]; variant?: string; remove?: boolean }
  | { k: 'ride'; id: string; model: string; path: Mark[]; speed: number; plate?: string; paint?: string; driver?: string; passengers?: string[] }
  | { k: 'phoneScreen'; who: string; text: TextRef; sub?: TextRef }
  | { k: 'hide'; mesh: string; on?: boolean }
  | { k: 'sfx'; id: string; at?: Mark } | { k: 'music'; id: string | null; fade?: number } | { k: 'ambience'; id: string }
  | { k: 'fx'; kind: string; at?: Mark } | { k: 'grade'; id: string } | { k: 'slowmo'; scale: number; seconds: number }
  | { k: 'letterbox'; on: boolean } | { k: 'fade'; to: 'black' | 'clear'; ms: number }
);
export type Shot = { dur: number; label?: string; cam: Cam; cues?: Cue[]; note?: string };
/** Background people drawn as an instanced batch (dignified pose presets only for captives). */
export type Extra = { template: string; count: number; area: Mark; size: [number, number]; poses: string[] };
/** The director's StageSpec (director-actors-extras.md §6). */
export type Stage = {
  at: Mark; radius: number;
  crowd: 'hide' | 'keep'; traffic: 'hold' | 'hide' | 'keep'; police: 'pause' | 'keep';
  /** Input locked, player invulnerable, police and guards frozen: required for `slowmo`. */
  freezeWorld?: boolean;
  env?: { hours?: number; weather?: 'clear' | 'cloudy' | 'rain'; freezeClock?: boolean };
};
/**
 * The director's Handoff (§4.8): where gameplay resumes, also the end state of a skip. `speed` puts a riding
 * player back in motion: metres per second, or 'cruise' for the cruise speed of the vehicle `at` is offset from.
 */
export type Handoff = {
  player: { at: Mark; yaw?: number; vehicle?: 'foot' | 'bike' | 'boat' | 'swim'; crouch?: boolean; outfit?: string; space?: string; speed?: number | 'cruise' };
  bikeAt?: Mark; camera: 'blend' | 'cut'; ms?: number;
};
export type Scene = {
  id: string; mission: string; title: TextRef; kind: 'cutscene' | 'action'; seconds: number; skippable: boolean;
  stage: Stage;
  /** Off-map sets (SPACES ids) the scene uses; built behind the opening card. */
  sets?: string[];
  /** Scene actor id → cast id (story cast) or an extras batch. */
  cast: Record<string, string | Extra>;
  shots: Shot[];
  /** Where gameplay resumes (also the end state of a skip); omitted, the player stays where the scene found him. */
  handoff?: Handoff;
  notes?: string;
};
export const POSES_DIGNIFIED = ['sit-hug-knees', 'sit', 'stand-head-down', 'walk-led', 'hold-hands', 'shield-younger', 'hum'] as const;

/**
 * Every engine id a scene names, as [contract kind, id, where]: the cutscene half of the engine contract
 * (story/contract.ts). Extras templates and 'tpl:' cast count as templates, ride models as rideModels or models.
 */
export function sceneVocab(s: Scene): [ContractKind | 'rides', string, string][] {
  const out: [ContractKind | 'rides', string, string][] = [];
  for (const [k, v] of Object.entries(s.cast)) {
    if (typeof v === 'string') { if (v.startsWith('tpl:')) out.push(['templates', v.slice(4), `cast ${k}`]); }
    else { out.push(['templates', v.template, `cast ${k}`]); for (const p of v.poses) out.push(['scenePoses', p, `cast ${k}`]); }
  }
  s.shots.forEach((sh, i) => {
    const at = `shot ${i + 1}`;
    for (const c of sh.cues ?? []) {
      switch (c.k) {
        case 'anim': out.push(['clips', c.clip, at]); break;
        case 'pair': out.push(['pairClips', c.clip, at]); break;
        case 'place': if (c.pose) out.push(['scenePoses', c.pose, at]); break;
        case 'prop': if (!c.remove) out.push(['sceneProps', c.kind, at]); break;
        case 'ride': out.push(['rides', c.model, at]); break;
        case 'fx': out.push(['fx', c.kind, at]); break;
        case 'sfx': out.push(['sfx', c.id, at]); break;
        case 'grade': out.push(['grades', c.id, at]); break;
        case 'hide': out.push(['meshes', c.mesh, at]); break;
        case 'ambience': out.push(['ambience', c.id, at]); break;
        case 'music': if (c.id) out.push(['music', c.id, at]); break;
      }
    }
  });
  if (s.handoff?.player.outfit) out.push(['outfits', s.handoff.player.outfit, 'handoff']);
  return out;
}
