import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EventSource, EventStatus } from "@prisma/client";

export const runtime = "nodejs";

function extractEventId(url: string) {
  const m = url.match(/facebook\.com\/events\/(\d+)/i);
  return m?.[1] ?? null;
}

function warsawCenter() {
  return { lat: 52.2297, lng: 21.0122 };
}

async function searchIndexedFacebookEventsWarsaw(limit = 10) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("Missing SERPAPI_KEY");

  const q = [
    "site:facebook.com/events",
    '(Warsaw OR Warszawa)',
    '(January OR Jan OR stycznia)',
    "2026",
  ].join(" ");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", q);
  url.searchParams.set("num", String(Math.min(30, limit * 3)));
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const organic = (json.organic_results ?? []) as any[];

  const out: { id: string; url: string; title?: string; snippet?: string; raw: any }[] = [];
  const seen = new Set<string>();

  for (const r of organic) {
    const link = r.link as string | undefined;
    if (!link) continue;
    const id = extractEventId(link);
    if (!id || seen.has(id)) continue;

    seen.add(id);
    out.push({
      id,
      url: `https://www.facebook.com/events/${id}/`,
      title: r.title,
      snippet: r.snippet,
      raw: r,
    });

    if (out.length >= limit) break;
  }

  return { q, results: out, raw: json };
}

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "10");
  const { q, results } = await searchIndexedFacebookEventsWarsaw(Math.min(100, Math.max(1, limit)));

  const run = await prisma.syncRun.create({
    data: { source: "other" },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  const { lat, lng } = warsawCenter();

  for (const r of results) {
    const startAt = new Date();
    startAt.setDate(startAt.getDate() + 7);

    const title = r.title?.trim() || "(Facebook event)";
    const city = "Warsaw";
    const countryCode = "PL";

    const saved = await prisma.event.upsert({
      where: { source_sourceId: { source: EventSource.facebook, sourceId: r.id } },
      create: {
        source: EventSource.facebook,
        sourceId: r.id,
        sourceUrl: r.url,

        title,
        description: r.snippet ?? null,

        countryCode,
        city,
        place: null,

        startAt,
        endAt: null,

        lat: lat.toFixed(6),
        lng: lng.toFixed(6),

        rawPayload: {
          query: q,
          indexed: r.raw,
        } as any,

        status: EventStatus.pending,
      },
      update: {
        sourceUrl: r.url,
        title,
        description: r.snippet ?? null,
        rawPayload: {
          query: q,
          indexed: r.raw,
        } as any,
      },
    });

    if (saved.createdAt.getTime() === saved.updatedAt.getTime()) created++;
    else updated++;
  }

  skipped = Math.max(0, results.length - (created + updated));

  await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        fetchedCount: results.length,
        createdCount: created,
        updatedCount: updated,
        skippedCount: skipped,
      },
    });

    console.info("Facebook search import finished");

  return NextResponse.json({
    ok: true,
    query: q,
    fetched: results.length,
    created,
    updated,
    skipped,
  });
}
