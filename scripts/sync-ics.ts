import { prisma } from "@/lib/prisma";
import { EventSource } from "@prisma/client";
// @ts-ignore
import ical from "ical";
import { geocodeNominatimDetailed, reverseGeocodeNominatimCityCountry } from "@/lib/geocode/nominatim";
import { ExternalEvent } from "@/lib/import/types";
import { importEvents } from "../scripts/import-from-external";

function normalizeText(x: unknown): string {
  if (!x) return "";
  if (typeof x === "string") return x.trim();
  return String(x).trim();
}

function extractCityFromAddress(addr: Record<string, unknown> | null | undefined): string | null {
  if (!addr) return null;
  const pick = (k: string) => (typeof (addr as any)[k] === "string" ? ((addr as any)[k] as string) : null);
  return (
    pick("city") ||
    pick("town") ||
    pick("village") ||
    pick("municipality") ||
    pick("county") ||
    pick("state_district") ||
    pick("state") ||
    null
  );
}

function extractCountryCodeFromAddress(addr: Record<string, unknown> | null | undefined): string | null {
  if (!addr) return null;
  const raw = typeof (addr as any).country_code === "string" ? ((addr as any).country_code as string) : null;
  if (!raw) return null;
  const cc = raw.trim();
  return cc.length === 2 ? cc.toUpperCase() : null;
}

function pickCityFallback(location: string): string {
  // Location in ICS is usually a venue/building name. Keep it only as a last resort.
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[0] ?? "Unknown";
}

function eventSourceIdFrom(uid: string, startAt: Date): string {
  return `${uid}#${startAt.toISOString()}`;
}

async function fetchICSEventsFrom(icsUrl: string, fetchLimit: number, futureOnly: boolean) {
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
    if (!startAt || Number.isNaN(startAt.getTime())) {
      skipped++;
      continue;
    }

    if (futureOnly) {
      const now = new Date();
      if (startAt.getTime() < now.getTime()) {
        skipped++;
        continue;
      }
    }

    const endAt = item.end ? new Date(item.end) : null;

    const location = normalizeText(item.location);
    if (!location) {
      skipped++;
      continue;
    }

    // 1) Prefer explicit GEO field (lat;lon) if present.
    //    ical parses GEO into { lat, lon } (strings) or { lat, lon } numbers depending on version.
    const geoFromIcs =
      item.geo && (item.geo.lat ?? item.geo.latitude) && (item.geo.lon ?? item.geo.lng ?? item.geo.longitude);

    let lat: number | null = null;
    let lng: number | null = null;
    let city: string | null = null;
    let countryCode: string | null = null;

    if (geoFromIcs) {
      const rawLat = item.geo.lat ?? item.geo.latitude;
      const rawLng = item.geo.lon ?? item.geo.lng ?? item.geo.longitude;
      const nLat = Number(rawLat);
      const nLng = Number(rawLng);
      if (Number.isFinite(nLat) && Number.isFinite(nLng)) {
        lat = nLat;
        lng = nLng;

        const rev = await reverseGeocodeNominatimCityCountry(lat, lng);
        city = rev?.city ?? null;
        countryCode = rev?.countryCode ?? null;
      }
    }

    // 2) If no GEO, forward geocode the LOCATION and use Nominatim address metadata.
    if (lat === null || lng === null) {
      const geo = await geocodeNominatimDetailed(location);
      if (!geo) {
        skipped++;
        continue;
      }
      geocoded++;
      lat = geo.lat;
      lng = geo.lng;
      city = extractCityFromAddress(geo.address) ?? city;
      countryCode = extractCountryCodeFromAddress(geo.address) ?? countryCode;
    } else {
      geocoded++;
    }

    // If we still don't know country (2-letter), skip to avoid importing wrong data.
    if (!countryCode || countryCode.length !== 2) {
      skipped++;
      continue;
    }

    if (!city) city = pickCityFallback(location);

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
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
      source: EventSource.other,
      sourceId: sourceId,
      sourceUrl: sourceUrl,
      rawPayload: item,
    });

    if (fetched >= fetchLimit) break;
  }

  return { results: out, fetchedCount: fetched, skippedCount: skipped, geocodedCount: geocoded };
}

export async function syncIcs(icsUrl: string, fetchLimit: number, futureOnly: boolean = false, countryCode?: string | null) {
  const run = await prisma.syncRun.create({
    data: { source: "other" },
  });

  const { results, fetchedCount, skippedCount, geocodedCount } = await fetchICSEventsFrom(icsUrl, fetchLimit, futureOnly);

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
