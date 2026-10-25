/** One in-game day lasts 24 real minutes: an hour of game time per real minute. Shared by the sky, weather and NPC schedules. */
export const SECONDS_PER_HOUR = 60;

/** Any hour value wrapped into 0..24. */
export const wrapHour = (hours: number) => ((hours % 24) + 24) % 24;

/** "HH:MM" for an hour of the day. */
export function clockText(hours: number) {
  const h = Math.floor(hours) % 24, m = Math.floor((hours % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type Clock = ReturnType<typeof createClock>;

/**
 * The game clock: the hour of day, run by real seconds, and a day counter. Time only runs forward, so a jump to an
 * earlier hour (sleeping past midnight, a debug jump) starts the next day.
 */
export function createClock(startHour: number) {
  let hours = startHour, day = 0;
  const listeners = new Set<(hour: number, day: number) => void>();
  function moved(before: number, days: number) {
    day += days;
    if (days > 0 || Math.floor(hours) !== Math.floor(before)) for (const cb of listeners) cb(Math.floor(hours), day);
    return hours;
  }
  return {
    get hours() { return hours; },
    get day() { return day; },
    /** Runs the clock by `dt` real seconds; returns the new hour. */
    advance(dt: number) {
      const before = hours, total = hours + dt / SECONDS_PER_HOUR;
      hours = total % 24;
      return moved(before, Math.floor(total / 24));
    },
    set(next: number) { const before = hours; hours = wrapHour(next); return moved(before, hours < before ? 1 : 0); },
    /** Calls `cb(hour, day)` whenever a new hour starts; returns a function that stops it. */
    onHour(cb: (hour: number, day: number) => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };
}
