import { prisma } from "@/lib/prisma";
import { EventSource, EventStatus } from "@prisma/client";
// @ts-ignore
import ical from "ical";
import { geocodeNominatim } from "@/lib/geocode/nominatim";

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

export async function syncIcs(icsUrl: string, fetchLimit: number) {
  // fetch ICS
  const res = await fetch(icsUrl);
  if (!res.ok) throw new Error(`ICS fetch failed ${res.status}`);

  const text = await res.text();

  const run = await prisma.syncRun.create({
    data: { source: "other" },
  });

  // parse
  const parsed = ical.parseICS(text);

  let fetched = 0, created = 0, updated = 0, skipped = 0, geocoded = 0;

  for (const k of Object.keys(parsed)) {
    const item: any = (parsed as any)[k];
    if (!item || item.type !== "VEVENT") continue;

    const uid = normalizeText(item.uid) || k;
    const title = normalizeText(item.summary) || "(no title)";
    const description = normalizeText(item.description) || null;

    const startAt = item.start ? new Date(item.start) : null;
    if (!startAt || Number.isNaN(startAt.getTime())) { skipped++; continue; }

    const endAt = item.end ? new Date(item.end) : null;

    const location = normalizeText(item.location);
    if (!location) { skipped++; console.log("No location"); console.log(item); continue; }

    fetched++;

    const geo = await geocodeNominatim(location);
    if (!geo) { skipped++; console.log("No geocode"); continue; }
    geocoded++;

    const { city, countryCode } = pickCityCountry(location);

    const sourceId = eventSourceIdFrom(uid, startAt);
    const sourceUrl = icsUrl;

    const baseData: any = {
      title,
      description,
      countryCode,
      city,
      place: location,
      startAt,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      lat: geo.lat.toFixed(6),
      lng: geo.lng.toFixed(6),
      source: EventSource.other,
      sourceId,
      sourceUrl,
      rawPayload: item,
    };

    const saved = await prisma.event.upsert({
      where: { source_sourceId: { source: EventSource.other, sourceId } },
      create: { ...baseData, status: EventStatus.pending },
      update: { ...baseData },
    });

    if (saved.createdAt.getTime() === saved.updatedAt.getTime()) created++;
    else updated++;

    if (fetched >= fetchLimit)
        break;
  }

  await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        fetchedCount: fetched,
        createdCount: created,
        updatedCount: updated,
        skippedCount: skipped,
      },
    });

    console.info("ICS sync finished");

  return { ok: true, fetched, geocoded, created, updated, skipped };
}
