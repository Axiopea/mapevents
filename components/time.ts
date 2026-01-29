import tzLookup from "tz-lookup";

type HasCoords = { lat: number; lng: number };

export function getEventTimeZone(e: Partial<HasCoords> | null | undefined): string {
  const lat = Number((e as any)?.lat);
  const lng = Number((e as any)?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "UTC";

  try {
    return tzLookup(lat, lng) || "UTC";
  } catch {
    return "UTC";
  }
}

function zonedParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Returns timezone offset (ms) for the given UTC instant.
 * Positive means tz is ahead of UTC.
 */
function tzOffsetMs(utcMs: number, timeZone: string) {
  const d = new Date(utcMs);
  const p = zonedParts(d, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcMs;
}

/**
 * Convert ISO (UTC instant) -> "fake UTC" ISO that renders as event local wall time when displayed in UTC.
 *
 * We keep FullCalendar in UTC, but shift each event so it displays in its own local timezone.
 */
export function isoAsEventLocalWallTimeUtcIso(iso: string, timeZone: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const p = zonedParts(d, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)).toISOString();
}

/**
 * Convert <input type="datetime-local"> value (YYYY-MM-DDTHH:mm) in event local timezone -> UTC ISO.
 */
export function localInputInTimeZoneToUtcIso(local: string, timeZone: string) {
  // local is like "2026-01-29T18:30"
  const m = String(local).match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})/);
  if (!m) return new Date(local).toISOString();

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);

  // Initial guess: interpret the wall time as UTC.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Iterate once to account for DST boundaries.
  let utc = guessUtc;
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMs(utc, timeZone);
    utc = guessUtc - off;
  }

  return new Date(utc).toISOString();
}

/**
 * Convert ISO (UTC instant) -> value for <input type="datetime-local"> in event local timezone.
 */
export function isoToLocalInputValueInTimeZone(iso: string, timeZone: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const p = zonedParts(d, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
