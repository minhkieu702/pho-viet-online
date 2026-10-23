/**
 * A small utility-AI "brain" layered over the residents' daily schedules (npcs.ts).
 *
 * Every resident keeps a few needs that drift with time and events, and fixed personality traits rolled
 * once from a seed. About once a second (on the NPC's staggered check) the brain scores a handful of
 * intents; following the schedule ("routine") is always worth a fixed baseline, so the schedule stays the
 * default and an override only takes over when it clearly wins:
 *
 *   needs      wet       0 dry .. 1 soaked: rises in the rain without cover or an umbrella, dries under a roof
 *              hunger    rises over the day, falls while eating (and at home around meal times)
 *              fatigue   rises while out, falls at home; late hours add to how tired someone feels
 *              social    loneliness: rises while alone, falls while chatting or in company
 *              fear      spikes on gunfire, explosions, bodies, fights; fades in about a minute (faster indoors)
 *              interest  curiosity about an incident; decays while watching
 *
 *   intents    routine   follow the schedule                                  baseline 0.30
 *              shelter   no umbrella in the rain: run for an awning, a bus    0.50 + 0.40 * wet
 *                        stop, a café or home; wait until it stops
 *              avoid     timid people keep away from danger                    fear * (1.6 - bravery)
 *              watch     curious people gather 8-14 m from an incident        1.25 * interest - fear * (1.1 - bravery)
 *              eat       hungry people detour to a café or food stall         (hunger - 0.55) * 1.6
 *              rest      tired people head home early                         (tiredness - 0.55) * 1.6
 *              chat      two people meeting on the sidewalk (started by npcs.ts in pairs, fixed duration)
 *
 *   hysteresis a challenger must beat the current intent's (re-scored) value by MARGIN, non-urgent switches
 *              wait DWELL seconds, and an override ends when its own score drops below RELEASE.
 *
 * The module is pure (no three.js, no allocation per tick); npcs.ts turns intents into routes and spots.
 */

export type IncidentKind = 'body' | 'fire' | 'crash' | 'fight' | 'shots';
export type Incident = { id: number; kind: IncidentKind; x: number; z: number; time: number; until: number; watchers: number };
export type Intent = 'routine' | 'shelter' | 'avoid' | 'watch' | 'eat' | 'rest' | 'chat';

/** How noticeable (salience), how frightening (danger), how long it stays interesting (life, s) and heard from how far (radius, m). */
export const INCIDENTS: Record<IncidentKind, { salience: number; danger: number; life: number; radius: number }> = {
  shots: { salience: 0.9, danger: 1.0, life: 30, radius: 70 },
  fire: { salience: 1.0, danger: 0.7, life: 75, radius: 60 },
  body: { salience: 0.85, danger: 0.45, life: 90, radius: 45 },
  crash: { salience: 0.75, danger: 0.25, life: 75, radius: 45 },
  fight: { salience: 0.7, danger: 0.55, life: 30, radius: 40 },
};

export const BRAIN = {
  /** Value of simply following the schedule. */
  ROUTINE: 0.3,
  /** A challenger must beat the current intent by this much. */
  MARGIN: 0.15,
  /** An override whose own score falls below this ends (back to the schedule). */
  RELEASE: 0.22,
  /** Seconds an intent is kept before a non-urgent switch. */
  DWELL: 5,
  /** Watchers stand this far from an incident. */
  WATCH_NEAR: 8,
  WATCH_FAR: 14,
} as const;

export type Traits = {
  /** Carries an umbrella and opens it in the rain. */
  umbrella: boolean;
  /** Also opens it under a roof (market vendors under their stall canopy). */
  umbrellaUnderRoof: boolean;
  /** Index into the umbrella colour list. */
  umbrellaLook: number;
  /** 0 timid .. 1 brave. */
  bravery: number;
  /** 0 incurious .. 1 has to see everything. */
  curiosity: number;
  /** 0 quiet .. 1 stops everyone for a chat. */
  chattiness: number;
  /** Hunger and fatigue rate multipliers. */
  appetite: number;
  stamina: number;
  /** Seconds someone without an umbrella waits out the rain before running for it anyway. */
  patience: number;
  /** Seconds after the rain stops before sheltering people move on. */
  linger: number;
};
export type Needs = { wet: number; hunger: number; fatigue: number; social: number; fear: number; interest: number };
export type Mind = {
  traits: Traits;
  needs: Needs;
  intent: Intent;
  /** When the current intent started, and its last score. */
  since: number;
  score: number;
  /** Umbrella opening, 0 closed .. 1 open (animated by npcs.ts every frame). */
  umbrella: number;
  /** The incident this person is aware of, if any. */
  incident: Incident | null;
  /** Chat: partner's npc id, when it ends, when the next line is due, which line comes next, and when chatting is allowed again. */
  partner: number;
  until: number;
  lineAt: number;
  stage: number;
  cooldown: number;
  /** Seconds since the rain stopped (0 while it rains). */
  dryFor: number;
  /** Seconds spent waiting for the rain to pass (under a shelter or indoors). */
  waited: number;
  /** Gave up waiting and is running through the rain to the next destination. */
  dash: boolean;
  /** Time of the last tick. */
  last: number;
};

/** What the person perceives about themselves this tick, filled in by npcs.ts (one reused object). */
export type Sense = {
  hour: number;
  raining: boolean;
  /** Out on the street (drawn), not inside a building. */
  outdoors: boolean;
  /** Under a roof right now: inside, a shop awning, a stall canopy, a bus shelter. */
  covered: boolean;
  /** The schedule keeps them dry anyway (covered spot, or almost at an indoor destination). */
  routineCovered: boolean;
  /** The schedule's destination is indoors or covered. */
  destIndoor: boolean;
  /** Free time: may detour to eat or go home early. */
  detour: boolean;
  /** The schedule already has them on the way to (or at) a meal. */
  meal: boolean;
  /** May stop to watch an incident or keep away from it (not gang members, not vendors at their stall). */
  free: boolean;
  /** Eating now, at home now, running, with how many people within a few metres. */
  eating: boolean;
  atHome: boolean;
  running: boolean;
  company: number;
  /** Distance to the tracked incident (Infinity when none). */
  incident: number;
  /** Role name, for role-specific late-hour tiredness. */
  role: string;
};

export function createSense(): Sense {
  return {
    hour: 12, raining: false, outdoors: false, covered: true, routineCovered: true, destIndoor: true, detour: false, meal: false, free: false,
    eating: false, atHome: true, running: false, company: 0, incident: Infinity, role: '',
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Rolls a personality for a role; `random` should be a seeded generator so the city is the same every visit. */
export function createMind(random: () => number, role: string, hour = 12): Mind {
  const umbrellaOdds = role === 'gang' || role === 'thief' ? 0 : role === 'retiree' ? 0.75 : role === 'student' || role === 'owl' ? 0.5 : 0.6;
  const bravery = clamp01(role === 'gang' ? 0.75 + random() * 0.25 : role === 'retiree' ? 0.15 + random() * 0.55 : 0.25 + random() * 0.65);
  const curiosity = clamp01((role === 'retiree' ? 0.35 : role === 'student' ? 0.4 : 0.2) + random() * 0.6);
  const traits: Traits = {
    umbrella: random() < umbrellaOdds,
    umbrellaUnderRoof: random() < 0.5,
    umbrellaLook: Math.floor(random() * 64),
    bravery,
    curiosity,
    chattiness: clamp01((role === 'retiree' ? 0.3 : 0.1) + random() * 0.8),
    appetite: 0.8 + random() * 0.45,
    stamina: 0.8 + random() * 0.5,
    patience: 50 + random() * 100,
    linger: 2 + random() * 9,
  };
  const late = hour >= 20 || hour < 5;
  return {
    traits,
    needs: { wet: 0, hunger: 0.1 + random() * 0.35, fatigue: late ? 0.5 : 0.1 + random() * 0.25, social: random() * 0.6, fear: 0, interest: 0 },
    intent: 'routine', since: -99, score: BRAIN.ROUTINE, umbrella: 0, incident: null,
    partner: -1, until: 0, lineAt: 0, stage: 0, cooldown: 20 + random() * 60,
    dryFor: 999, waited: 0, dash: false, last: 0,
  };
}

/** Late-evening sleepiness on top of fatigue; owls and gangs stay up much later. */
function lateness(hour: number, role: string) {
  const start = role === 'retiree' ? 18 : role === 'owl' ? 23 : role === 'gang' ? 30 : 20;
  const h = hour < 6 ? hour + 24 : hour;
  return h <= start ? 0 : Math.min(0.45, (h - start) * 0.1);
}
export function tiredness(mind: Mind, hour: number, role: string) {
  return mind.needs.fatigue + lateness(hour, role);
}
const mealTime = (hour: number) => (hour >= 6 && hour < 8.5) || (hour >= 11 && hour < 13.5) || (hour >= 17 && hour < 20.5);

/** Moves every need on by `dt` seconds (one game hour is 60 s). */
export function drift(mind: Mind, s: Sense, dt: number) {
  const n = mind.needs, t = mind.traits;
  // Soaked in the rain without cover; an open umbrella keeps almost all of it off. Dries under a roof.
  if (s.raining && s.outdoors && !s.covered) n.wet = clamp01(n.wet + dt * (mind.umbrella > 0.5 ? 0.002 : 0.04));
  else n.wet = clamp01(n.wet - dt * (s.outdoors ? 0.006 : 0.012));
  // About five game hours from full to hungry; a meal takes ~40 game minutes.
  if (s.eating) n.hunger -= dt * 0.025;
  else if (s.atHome && !s.outdoors) n.hunger -= dt * (mealTime(s.hour) ? 0.015 : 0.002);
  else n.hunger += dt * 0.003 * t.appetite * (s.hour < 5 ? 0.4 : 1);
  n.hunger = clamp01(n.hunger);
  // Out and about tires; home (and sleep at night) restores.
  if (s.atHome && !s.outdoors) n.fatigue -= dt * (s.hour >= 22 || s.hour < 6 ? 0.004 : 0.0015);
  else n.fatigue += dt * 0.0011 * t.stamina * (s.running ? 2 : 1);
  n.fatigue = clamp01(n.fatigue);
  // Loneliness.
  if (mind.intent === 'chat') n.social -= dt * 0.06;
  else if (s.company > 0 && !s.running) n.social -= dt * 0.004 * Math.min(3, s.company);
  else if (s.atHome && !s.outdoors) n.social -= dt * 0.002;
  else n.social += dt * 0.0035 * (0.5 + t.chattiness);
  n.social = clamp01(n.social);
  // Fear and curiosity fade; watching satisfies curiosity faster.
  n.fear = clamp01(n.fear - dt * (s.outdoors ? 0.006 : 0.012));
  n.interest = clamp01(n.interest - dt * (mind.intent === 'watch' && s.incident < BRAIN.WATCH_FAR + 3 ? 0.005 : 0.004));
  // Rain bookkeeping: how long it has been dry, how long they have been waiting it out.
  if (s.raining) {
    mind.dryFor = 0;
    // (npcs.ts also counts the time someone indoors postpones leaving.)
    if (mind.intent === 'shelter') mind.waited += dt;
  } else {
    mind.dryFor += dt;
    if (mind.dryFor > 20) { mind.waited = 0; mind.dash = false; }
  }
}

/** Hearing or seeing an incident `distance` metres away: fear by danger and bravery, interest by curiosity. */
export function perceive(mind: Mind, incident: Incident, distance: number) {
  const spec = INCIDENTS[incident.kind];
  const falloff = Math.max(0.35, Math.min(1, 1 - (distance - 15) / Math.max(1, spec.radius - 15)));
  const n = mind.needs, t = mind.traits;
  n.fear = clamp01(n.fear + spec.danger * falloff * (1.2 - t.bravery));
  const interest = t.curiosity * spec.salience * falloff;
  // Keep track of the most interesting thing going on.
  if (!mind.incident || mind.incident === incident || interest >= n.interest || mind.incident.until < incident.time) {
    mind.incident = incident;
    n.interest = Math.max(n.interest, interest);
  }
}

/** Score of one intent (0 = not wanted at all). */
export function score(mind: Mind, intent: Intent, s: Sense, time: number) {
  const n = mind.needs, t = mind.traits;
  switch (intent) {
    case 'routine':
      return BRAIN.ROUTINE;
    case 'shelter': {
      const wet = s.raining || (mind.intent === 'shelter' && mind.dryFor < t.linger);
      if (!wet || t.umbrella || mind.dash) return 0;
      // Already dry thanks to the schedule (inside, under an awning, a stall canopy or a bus shelter).
      if (mind.intent !== 'shelter' && s.routineCovered) return 0;
      if (mind.intent !== 'shelter' && !s.outdoors) return 0;
      let value = 0.5 + 0.4 * n.wet;
      // Waited long enough and the next destination is indoors: give up and run for it.
      if (mind.intent === 'shelter' && mind.waited > t.patience && s.destIndoor && s.raining) value -= 0.6;
      return value;
    }
    case 'avoid': {
      if (!s.free || n.fear < 0.15) return 0;
      return n.fear * (1.6 - t.bravery);
    }
    case 'watch': {
      const inc = mind.incident;
      if (!inc || !s.free || !s.outdoors || time > inc.until || s.incident > 70) return 0;
      if (mind.intent !== 'watch' && inc.watchers >= 10) return 0;
      if (s.raining && mind.umbrella < 0.5 && !s.covered) return 0;
      return n.interest * 1.25 - n.fear * (1.1 - t.bravery);
    }
    case 'eat': {
      if (mind.intent === 'eat') return n.hunger > 0.2 ? 0.55 : 0;
      if (!s.detour || s.meal || s.hour < 6 || s.hour > 21.5) return 0;
      return (n.hunger - 0.55) * 1.6;
    }
    case 'rest': {
      const tired = tiredness(mind, s.hour, s.role);
      if (mind.intent === 'rest') return tired > 0.35 ? 0.5 : 0;
      if (!s.detour || s.role === 'gang') return 0;
      return (tired - 0.55) * 1.6;
    }
    case 'chat':
      // A downpour without an umbrella ends the chat.
      return mind.intent === 'chat' && time < mind.until && !(s.raining && !t.umbrella) ? 0.7 : 0;
  }
}

const CHALLENGERS: Intent[] = ['shelter', 'avoid', 'watch', 'eat', 'rest'];
const URGENT: Record<Intent, boolean> = { routine: false, shelter: true, avoid: true, watch: false, eat: false, rest: false, chat: false };

/**
 * Picks what to do now. The current intent is re-scored; the best challenger replaces it only when it
 * wins by MARGIN (urgent ones skip the dwell time), and an override that is no longer worth it ends.
 * Does not change the mind; call `engage` with the result.
 */
export function decide(mind: Mind, s: Sense, time: number): Intent {
  const current = mind.intent;
  const hold = score(mind, current, s, time);
  mind.score = hold;
  let challenger: Intent = 'routine', best = 0;
  for (const intent of CHALLENGERS) {
    if (intent === current) continue;
    const value = score(mind, intent, s, time);
    if (value > best) { best = value; challenger = intent; }
  }
  const wins = challenger !== 'routine' && best > Math.max(hold, BRAIN.ROUTINE) + BRAIN.MARGIN;
  if (current === 'routine') return wins ? challenger : 'routine';
  if (hold < BRAIN.RELEASE) return best > BRAIN.ROUTINE + BRAIN.MARGIN ? challenger : 'routine';
  if (wins && (URGENT[challenger] || time - mind.since >= BRAIN.DWELL)) return challenger;
  return current;
}

export function engage(mind: Mind, intent: Intent, time: number) {
  mind.intent = intent;
  mind.since = time;
}

/** Recent incidents in a small ring; a new report close to a live one of the same kind refreshes it instead. */
export function createIncidents(size = 8) {
  const list: Incident[] = [];
  let next = 1;
  return {
    list,
    report(x: number, z: number, kind: IncidentKind, time: number) {
      const spec = INCIDENTS[kind];
      for (const inc of list) {
        if (inc.kind === kind && time < inc.until && (inc.x - x) ** 2 + (inc.z - z) ** 2 < 36) {
          inc.until = Math.max(inc.until, time + spec.life);
          inc.time = time;
          return inc;
        }
      }
      const inc: Incident = { id: next++, kind, x, z, time, until: time + spec.life, watchers: 0 };
      if (list.length >= size) {
        // Replace the one that ended first.
        let oldest = 0;
        for (let i = 1; i < list.length; i++) if (list[i].until < list[oldest].until) oldest = i;
        list[oldest] = inc;
      } else list.push(inc);
      return inc;
    },
  };
}
