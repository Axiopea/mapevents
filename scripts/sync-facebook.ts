import "dotenv/config";
import { EventSource } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ExternalEvent } from "@/lib/import/types";
import { importEvents } from "../scripts/import-from-external";
import { reverseGeocodeNominatimCity } from "@/lib/geocode/nominatim";

const DEFAULT_ACTOR_ID = "apify~facebook-events-scraper";

function asDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function pickString(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pickNumber(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseDurationToMs(raw: any): number | null {
  // Apify Facebook Events Scraper examples: "3 hr", "2 hrs", "1 day", "2 days".
  if (raw == null) return null;
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  if (!s) return null;

  // Some variants might look like: "3 hr", "3h", "3 hours", "1 day", "2 days", "90 min"
  const m = s.match(
    /^(\d+(?:[\.,]\d+)?)\s*(hr|hrs|hour|hours|h|day|days|d|min|mins|minute|minutes|m)\b/i
  );
  if (!m) return null;

  const value = Number(String(m[1]).replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = m[2].toLowerCase();
  const msPerMinute = 60_000;
  const msPerHour = 60 * msPerMinute;
  const msPerDay = 24 * msPerHour;

  if (unit === "min" || unit === "mins" || unit === "minute" || unit === "minutes" || unit === "m") {
    return Math.round(value * msPerMinute);
  }
  if (unit === "day" || unit === "days" || unit === "d") {
    return Math.round(value * msPerDay);
  }
  // Default: hours
  return Math.round(value * msPerHour);
}

async function runApifyFacebookEventsScraper(params: { query: string; maxEvents: number }) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Missing APIFY_TOKEN");

  const actorId = process.env.APIFY_FACEBOOK_ACTOR_ID || DEFAULT_ACTOR_ID;
  const timeoutSecs = Math.min(295, Math.max(30, Number(process.env.APIFY_TIMEOUT_SECS || 240)));

  const url = new URL(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`);
  url.searchParams.set("token", token);
  url.searchParams.set("format", "json");
  url.searchParams.set("clean", "true");
  url.searchParams.set("timeout", String(timeoutSecs));

  const input = {
    searchQueries: [params.query],
    startUrls: [],
    maxEvents: Math.max(1, Math.min(200, params.maxEvents)),
  };

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify error ${res.status}: ${text || "Unknown error"}`);
  }

  const json = await res.json();
  const items = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
  return items as any[];
}

async function apifyItemsToExternalEvents(items: any[]) {
  const results: ExternalEvent[] = [];
  const seen = new Set<string>();

  const stats = {
    scanned: 0,
    accepted: 0,
    noDate: 0,
    noGeo: 0,
    duplicate: 0,
  };

  for (const it of items) {
    stats.scanned++;

    const sourceId =
      pickString(it?.id) ||
      pickString(it?.eventId) ||
      (pickString(it?.url)?.match(/facebook\.com\/events\/(\d+)/i)?.[1] ?? null);

    if (!sourceId) continue;

    if (seen.has(sourceId)) {
      stats.duplicate++;
      continue;
    }
    seen.add(sourceId);

    const startAt =
      asDate(it?.utcStartDate) ||
      asDate(it?.startDate) ||
      asDate(it?.startTime) ||
      asDate(it?.startTimestamp);

    if (!startAt) {
      stats.noDate++;
      continue;
    }

    const endAt =
      asDate(it?.utcEndDate) ||
      asDate(it?.endDate) ||
      asDate(it?.endTime) ||
      asDate(it?.endTimestamp);

    // If Apify didn't provide end date/time, derive it from duration when possible.
    // Example: duration: "3 hr" -> endAt = startAt + 3 hours.
    let finalEndAt = endAt;
    if (!finalEndAt) {
      const ms = parseDurationToMs(it?.duration);
      if (ms != null) {
        const t = startAt.getTime();
        if (Number.isFinite(t)) {
          finalEndAt = new Date(t + ms);
        }
      }
    }

    const title = pickString(it?.name) || pickString(it?.title) || "Unnamed event";

    const description = pickString(it?.description) || null;
    const url = pickString(it?.url) || null;

    const loc = it?.location ?? it?.place ?? null;

    const lat =
      pickNumber(loc?.latitude) ??
      pickNumber(loc?.lat) ??
      pickNumber(loc?.location?.latitude) ??
      pickNumber(loc?.location?.lat) ??
      null;

    const lng =
      pickNumber(loc?.longitude) ??
      pickNumber(loc?.lng) ??
      pickNumber(loc?.location?.longitude) ??
      pickNumber(loc?.location?.lng) ??
      null;

    const placeName =
      pickString(loc?.name) ||
      pickString(loc?.title) ||
      pickString(loc?.locationName) ||
      pickString(it?.placeName) ||
      null;

    if (!Number.isFinite(lat ?? NaN) || !Number.isFinite(lng ?? NaN)) {
      stats.noGeo++;
      continue;
    }

    let city = pickString(loc?.city) || pickString(loc?.location?.city) || null;

    if (!city && lat && lng) {
      const cityFromCoords = await reverseGeocodeNominatimCity(lat, lng).catch(() => null);
      city = cityFromCoords?.city ? cityFromCoords.city : null;
    }

    if (!city) {
      stats.noGeo++;
      continue;
    }

    const countryCode =
      pickString(loc?.countryCode) || pickString(loc?.location?.countryCode) || "PL";

    results.push({
      title,
      description,
      countryCode: countryCode,
      city,
      place: placeName,
      startAt,
      endAt: finalEndAt,
      lat: String(lat),
      lng: String(lng),
      source: EventSource.facebook,
      sourceId,
      sourceUrl: url,
      rawPayload: it,
    });

    stats.accepted++;
  }

  return { results, stats };
}

export async function syncFacebook(q: string, limit = 10, countryCode?: string | null) {
  const run = await prisma.syncRun.create({ data: { source: "facebook" } });

  const apifyItems = await runApifyFacebookEventsScraper({
    query: q,
    maxEvents: Math.min(200, Math.max(1, limit)),
  });

  const { results, stats } = await apifyItemsToExternalEvents(apifyItems);

  const wanted = (countryCode || "").toUpperCase().trim();
  const filtered = wanted ? results.filter((e) => (e.countryCode || "").toUpperCase() === wanted) : results;
  const filteredOut = Math.max(0, results.length - filtered.length);

  const fetchedCount = stats.scanned;
  const skippedCount = Math.max(0, stats.scanned - stats.accepted) + filteredOut;

  const { created, updated } = await importEvents(filtered, run.id, fetchedCount, skippedCount);

  return {
    ok: true,
    query: q,
    limit,
    actor: process.env.APIFY_FACEBOOK_ACTOR_ID || DEFAULT_ACTOR_ID,
    scanned: stats.scanned,
    accepted: filtered.length,
    fetched: fetchedCount,
    skipped: skippedCount,
    filteredOutCount: filteredOut,
    countryCode: wanted || null,
    created,
    updated,
    skipBreakdown: {
      noDate: stats.noDate,
      noGeo: stats.noGeo,
      duplicate: stats.duplicate,
    },
  };
}
