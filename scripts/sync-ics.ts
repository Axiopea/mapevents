import { prisma } from "@/lib/prisma";
import { EventSource, EventStatus } from "@prisma/client";
// @ts-ignore
import ical from "ical";
import { geocodeNominatim } from "@/lib/geocode/nominatim";
import { ExternalEvent } from "@/lib/import/types";
import { importEvents } from "../scripts/import-from-external";

function normalizeText(x: unknown): string {
  if (!x) return "";
  if (typeof x === "string") return x.trim();
  return String(x).trim();
}

function pickCityCountry(location: string): { city: string; countryCode: string } {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  const city = parts[0] ?? "Unknown";
  const last = parts[parts.length - 1] ?? "";
  const cc = last.length === 2 ? last.toUpperCase() : "PL";
  return { city, countryCode: cc };
}

function eventSourceIdFrom(uid: string, startAt: Date): string {
  return `${uid}#${startAt.toISOString()}`;
}

async function fetchICSEventsFrom(icsUrl: string, fetchLimit: number, futureOnly: boolean)
{
  const out: ExternalEvent[] = [];

  let fetched = 0;
  let skipped = 0;
  let geocoded = 0;

  const res = await fetch(icsUrl);
  if (!res.ok) throw new Error(`ICS fetch failed ${res.status}`);

  const text = await res.text();

  const parsed = ical.parseICS(text);

  for (const k of Object.keys(parsed)) {
    const item: any = (parsed as any)[k];
    if (!item || item.type !== "VEVENT") continue;

    fetched++;

    const uid = normalizeText(item.uid) || k;
    const title = normalizeText(item.summary) || "(no title)";
    const description = normalizeText(item.description) || null;

    const startAt = item.start ? new Date(item.start) : null;
    if (!startAt || Number.isNaN(startAt.getTime())) { skipped++; continue; }

    if (futureOnly) {
      const now = new Date();
      if (startAt.getTime() < now.getTime()) { skipped++; continue; }
    }

    const endAt = item.end ? new Date(item.end) : null;

    const location = normalizeText(item.location);
    if (!location) { skipped++; continue; }

    const geo = await geocodeNominatim(location);
    if (!geo) { skipped++; continue; }
    geocoded++;

    const { city, countryCode } = pickCityCountry(location);

    const sourceId = eventSourceIdFrom(uid, startAt);
    const sourceUrl = icsUrl;

    out.push({
      title: title,
      description: description,
      countryCode: countryCode,
      city: city,
      place: location,
      startAt: startAt, 
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null, 
      lat: geo.lat.toFixed(6), 
      lng: geo.lng.toFixed(6), 
      source: EventSource.other,
      sourceId: sourceId,
      sourceUrl: sourceUrl,
      rawPayload: item
    });

    if (fetched >= fetchLimit)
        break;
  }

  return { results: out, fetchedCount: fetched, skippedCount: skipped, geocodedCount: geocoded };
}

export async function syncIcs(
  icsUrl: string,
  fetchLimit: number,
  futureOnly: boolean = false,
  countryCode?: string | null
) {
  const run = await prisma.syncRun.create({
    data: { source: "other" },
  });

  const { results, fetchedCount, skippedCount, geocodedCount } = await fetchICSEventsFrom(
    icsUrl,
    fetchLimit,
    futureOnly
  );

  const wanted = (countryCode || "").toUpperCase().trim();
  const filtered = wanted ? results.filter((e) => (e.countryCode || "").toUpperCase() === wanted) : results;
  const filteredOut = Math.max(0, results.length - filtered.length);

  const { created, updated } = await importEvents(filtered, run.id, fetchedCount, skippedCount + filteredOut);

  console.info("ICS sync finished");

  return {
    ok: true,
    fetchedCount,
    geocodedCount,
    created,
    updated,
    skippedCount: skippedCount + filteredOut,
    acceptedCount: filtered.length,
    filteredOutCount: filteredOut,
    countryCode: wanted || null,
  };
}
