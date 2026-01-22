import "dotenv/config";
import { EventSource, EventStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ExternalEvent } from "@/lib/import/types";
import { importEvents } from "../scripts/import-from-external";

function extractEventId(url: string) {
  const m = url.match(/facebook\.com\/events\/(\d+)/i);
  return m?.[1] ?? null;
}

async function searchIndexedFacebookEvents(limit = 10) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("Missing SERPAPI_KEY");

  const q = process.env.FB_SEARCH_QUERY;
  if (!q) throw new Error("Missing FB_SEARCH_QUERY");

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

    seen.add(id);
    out.push({
      title: r.title?.trim() || "(Facebook event)",
      description: r.snippet,
      countryCode: "PL", // TODO: remove hardcode, take location directly
      city: "Warsaw", // TODO: remove hardcode, take location directly
      place: null, // TODO: remove hardcode, take location directly
      startAt: new Date(), // TODO: remove hardcode, take start date/time directly
      endAt: null, // TODO: remove hardcode, take end date/time directly
      lat: (52.2297).toFixed(6), // TODO: remove hardcode, take location directly
      lng: (21.0122).toFixed(6), // TODO: remove hardcode, take location directly
      source: EventSource.facebook,
      sourceId: id,
      sourceUrl: `https://www.facebook.com/events/${id}/`,
      rawPayload: {
          query: q,
          indexed: r,
        }
    });

    if (out.length >= limit) break;
  }

  return { q, results: out, raw: json, fetchedCount: fetched, skippedCount: skipped };
}

export async function syncFacebook(limit = 10) {
  const run = await prisma.syncRun.create({
    data: { source: "other" },
  });

  let { q, results, fetchedCount, skippedCount } = await searchIndexedFacebookEvents(Math.min(100, Math.max(1, limit)));

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
