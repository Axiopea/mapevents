import type { EventItem } from "./types";

export function toFullCalendarEvents(items: EventItem[]) {
  return items.map((e) => ({
    id: e.id,
    title: `${e.city}: ${e.place} ${e.title}`,
    start: e.startAt,
    end: e.endAt ?? undefined,
//    url: e.sourceUrl ?? undefined,
    extendedProps: e,
  }));
}

export function isoDayStart(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function isoDayEnd(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}