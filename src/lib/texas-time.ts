/**
 * DST-aware America/Chicago (Texas) time helpers.
 *
 * Why this exists:
 *   The previous code used `new Date(now.toLocaleString("en-US", { timeZone }))`
 *   to "convert" a Date to Texas time. That returns a string parsed by the
 *   runtime's local timezone, which is only coincidentally correct on UTC
 *   servers and silently wrong everywhere else. It also can't honour DST
 *   when synthesising "8am Texas tomorrow" — the old code hardcoded 14:00
 *   UTC, which is 8am CST in winter but 9am CDT in summer.
 *
 *   Everything in this file uses `Intl.DateTimeFormat` against an explicit
 *   timeZone, which is the only reliable way in vanilla JS.
 */

const TZ = "America/Chicago";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  weekday: "short",
});

export interface ChicagoParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;
  second: number;
  /** "Mon" | "Tue" | ... */
  weekday: string;
  /** YYYY-MM-DD in Chicago wall-clock */
  dateStr: string;
}

export function chicagoParts(d: Date = new Date()): ChicagoParts {
  const parts = partsFmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // Intl returns "24" for midnight in en-US 24-hour mode on some engines.
  const rawHour = parseInt(get("hour"), 10);
  const hour = rawHour === 24 ? 0 : rawHour;
  const year = parseInt(get("year"), 10);
  const month = parseInt(get("month"), 10);
  const day = parseInt(get("day"), 10);
  return {
    year,
    month,
    day,
    hour,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
    weekday: get("weekday"),
    dateStr: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/**
 * Returns the UTC instant that corresponds to the given wall-clock moment in
 * America/Chicago. Handles DST correctly by measuring how the timezone shifts
 * a guessed UTC instant, then correcting.
 */
export function chicagoWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,   // 1-31
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const observed = chicagoParts(guess);
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const observedMs = Date.UTC(
    observed.year,
    observed.month - 1,
    observed.day,
    observed.hour,
    observed.minute,
    observed.second,
  );
  // observedMs - wantedMs is how much the timezone shifted the guess.
  // Subtract that from the guess to land on the intended Chicago wall clock.
  return new Date(guess.getTime() - (observedMs - wantedMs));
}

/** UTC instant for 00:00 (start of day) in Chicago for the given Chicago date. */
export function chicagoMidnightUtc(d: Date = new Date()): Date {
  const p = chicagoParts(d);
  return chicagoWallClockToUtc(p.year, p.month, p.day, 0, 0, 0);
}

/** Add `days` calendar days in Chicago (handles DST in months that change clocks). */
function addChicagoDays(year: number, month: number, day: number, days: number) {
  // Use UTC arithmetic for a stable date math, then re-derive Chicago parts.
  const tmp = new Date(Date.UTC(year, month - 1, day));
  tmp.setUTCDate(tmp.getUTCDate() + days);
  return { year: tmp.getUTCFullYear(), month: tmp.getUTCMonth() + 1, day: tmp.getUTCDate() };
}

/** Weekday short label for a given Chicago calendar date. */
function chicagoWeekdayFor(year: number, month: number, day: number): string {
  // Use noon Chicago to avoid DST edge weirdness.
  const utc = chicagoWallClockToUtc(year, month, day, 12, 0, 0);
  return chicagoParts(utc).weekday;
}

/**
 * Returns the next 08:00 America/Chicago instant, skipping weekends.
 * If today's Chicago time is already ≥ 08:00, rolls to the next day.
 */
export function nextBusinessDay8amChicago(now: Date = new Date()): Date {
  const today = chicagoParts(now);
  let { year, month, day } = today;
  if (today.hour >= 8) {
    ({ year, month, day } = addChicagoDays(year, month, day, 1));
  }
  // Skip Sat/Sun in Chicago, not in server local time (the previous bug).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const wd = chicagoWeekdayFor(year, month, day);
    if (wd !== "Sat" && wd !== "Sun") break;
    ({ year, month, day } = addChicagoDays(year, month, day, 1));
  }
  return chicagoWallClockToUtc(year, month, day, 8, 0, 0);
}
