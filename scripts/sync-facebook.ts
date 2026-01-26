import "dotenv/config";
import { EventSource } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ExternalEvent } from "@/lib/import/types";
import { importEvents } from "../scripts/import-from-external";
import { geocodeNominatim } from "@/lib/geocode/nominatim";
import { parseStartEndFromPolishText, parsePlaceQueryFromSnippetV2 } from "@/lib/facebook/parseSnippet";

function extractEventId(url: string) {
  const m = url.match(/facebook\.com\/events\/(\d+)/i);
  return m?.[1] ?? null;
}

async function searchIndexedFacebookEvents(q: string, limit = 10) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("Missing SERPAPI_KEY");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", q);
  url.searchParams.set("num", String(Math.min(30, limit * 3)));
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const organic = (json.organic_results ?? []) as any[];

  const out: ExternalEvent[] = [];
  const seen = new Set<string>();

  let fetched = 0;
  let skipped = 0

  for (const r of organic) {
    fetched++;

    const link = r.link as string | undefined;

    if (!link) {
      skipped++;
      continue;
    } 

    const id = extractEventId(link);

    if (!id || seen.has(id)) {
      skipped++;
      continue;
    }

    const { city, countryCode, placeQuery } = parsePlaceQueryFromSnippetV2({ title: r.title, snippet: r.snippet, query: q });

    const { startAt, endAt } = parseStartEndFromPolishText(`${r.title ?? ""} ${r.snippet ?? ""}`);
    const start = startAt ?? new Date();
    const end = endAt ?? null;

    const geo = await geocodeNominatim(placeQuery);

    if (!geo)
    {
      skipped++;
      continue;
    }

    const lat = (geo.lat).toFixed(6);
    const lng = (geo.lng).toFixed(6);

    seen.add(id);
    out.push({
      title: r.title?.trim() || "(Facebook event)",
      description: r.snippet ?? null,
      countryCode: countryCode,
      city: city,
      place: placeQuery,
      startAt: start, 
      endAt: end, 
      lat: lat, 
      lng: lng, 
      source: EventSource.facebook,
      sourceId: id,
      sourceUrl: `https://www.facebook.com/events/${id}/`,
      rawPayload: {
          query: q,
          indexed: r,
          extracted: {
            placeQuery,
            startAt: startAt?.toISOString() ?? null,
            endAt: endAt ? endAt.toISOString() : null,
            city,
            countryCode
          },
          geocode: geo ?? null
        }
    });

    if (out.length >= limit) break;
  }

  return { q, results: out, raw: json, fetchedCount: fetched, skippedCount: skipped };
}

export async function syncFacebook(q: string, limit = 10) {
  const run = await prisma.syncRun.create({
    data: { source: "other" },
  });

  let { results, fetchedCount, skippedCount } = await searchIndexedFacebookEvents(q, Math.min(100, Math.max(1, limit)));

  let { created, updated } = await importEvents(results, run.id, fetchedCount, skippedCount);

  console.info("Facebook search import finished");
  
  return {
    ok: true,
    query: q,
    fetched: fetchedCount,
    created,
    updated,
    skipped: skippedCount,
  };
}
