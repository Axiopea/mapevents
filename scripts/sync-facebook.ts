import "dotenv/config";
import { EventSource } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ExternalEvent } from "@/lib/import/types";
import { importEvents } from "../scripts/import-from-external";
import { geocodeNominatim } from "@/lib/geocode/nominatim";
import { parseStartEndFromPolishText } from "@/lib/facebook/parseSnippet";

function extractEventId(url: string) {
  const m = url.match(/facebook\.com\/events\/(\d+)/i);
  return m?.[1] ?? null;
}

function inferTargetCityFromQuery(q: string): string | null {
  // query like: site:facebook.com/events (Radom) (January OR Jan) 2026
  const m = q.match(/\(([^)]+)\)/);
  if (!m?.[1]) return null;
  const city = m[1].trim();
  return city.length >= 2 ? city : null;
}

function decodeHtml(s: string) {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let m = html.match(new RegExp(`<meta[^>]+property=["']${k}["'][^>]+content=["']([^"']+)["']`, "i"));
  if (m?.[1]) return decodeHtml(m[1]);

  m = html.match(new RegExp(`<meta[^>]+name=["']${k}["'][^>]+content=["']([^"']+)["']`, "i"));
  if (m?.[1]) return decodeHtml(m[1]);

  return null;
}

function safeJsonParse<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function extractLdJsonBlocks(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[1] || "").trim();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    if (!parsed) continue;
    if (Array.isArray(parsed)) out.push(...parsed);
    else out.push(parsed);
  }
  return out;
}

function pickEventLdJson(blocks: any[]): any | null {
  for (const b of blocks) {
    const t = (b && (b["@type"] || b.type)) as string | undefined;
    if (typeof t === "string" && t.toLowerCase() === "event") return b;
  }
  for (const b of blocks) {
    const g = b?.["@graph"];
    if (Array.isArray(g)) {
      for (const n of g) {
        const t = (n && (n["@type"] || n.type)) as string | undefined;
        if (typeof t === "string" && t.toLowerCase() === "event") return n;
      }
    }
  }
  return null;
}

function extractLatLngFromHtml(html: string): { lat: number; lng: number } | null {
  // 0) Map/staticmap URL patterns (часто именно тут есть точка)
  const urlPatterns: RegExp[] = [
    // center=52.23,21.01
    /\bcenter=([0-9.+-]{4,})\s*,\s*([0-9.+-]{4,})\b/i,
    // markers=52.23,21.01 or marker=...
    /\bmarkers?=([0-9.+-]{4,})\s*,\s*([0-9.+-]{4,})\b/i,
    // ll=52.23,21.01 (Apple Maps / others)
    /\bll=([0-9.+-]{4,})\s*,\s*([0-9.+-]{4,})\b/i,
    // q=52.23,21.01 or query=52.23,21.01
    /\b(?:q|query)=([0-9.+-]{4,})\s*,\s*([0-9.+-]{4,})\b/i,
    // "latitude":52.23,"longitude":21.01 inside URL-encoded or plain
    /\blatitude%22%3A([0-9.+-]{4,}).{0,40}?longitude%22%3A([0-9.+-]{4,})/i,
  ];

  for (const re of urlPatterns) {
    const m = html.match(re);
    if (!m?.[1] || !m?.[2]) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // 1) JSON patterns
  const patterns: Array<[RegExp, RegExp]> = [
    [/"latitude"\s*:\s*([0-9.+-]+)/i, /"longitude"\s*:\s*([0-9.+-]+)/i],
    [/\b"lat"\s*:\s*([0-9.+-]+)/i, /\b"lng"\s*:\s*([0-9.+-]+)/i],
    [/\b"lat"\s*:\s*([0-9.+-]+)/i, /\b"lon"\s*:\s*([0-9.+-]+)/i],
  ];

  for (const [reLat, reLng] of patterns) {
    const mLat = html.match(reLat);
    const mLng = html.match(reLng);
    if (!mLat?.[1] || !mLng?.[1]) continue;
    const lat = Number(mLat[1]);
    const lng = Number(mLng[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}


function stripVisibleText(html: string): string {
  // remove scripts/styles
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // keep separators
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|li|h1|h2|h3|tr|td)>/gi, "\n");

  // remove tags
  t = t.replace(/<[^>]+>/g, " ");
  t = decodeHtml(t);

  // normalize
  t = t
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return t;
}

function extractAddressish(text: string): string | null {
  // polish-ish street patterns
  const t = (text || "").replace(/\s+/g, " ");
  const m = t.match(/\b(ul\.|al\.|aleja|pl\.|plac|rynek)\s+[A-Za-zÀ-ž\u0100-\u017F\.\-\s]{2,}?\s+\d+[A-Za-z]?\b/i);
  return m?.[0]?.trim() ?? null;
}

function extractVenueLine(text: string): string | null {
  // Heuristic: find a line with venue-ish keyword, not too long
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const candidates = lines.filter((l) =>
    /\b(Teatr|Filharmonia|Dom Kultury|Centrum|Klub|Sala|MOK|ROK|Biblioteka|Muzeum|Hotel|Restauracja)\b/i.test(l)
  );
  const best = candidates.find((l) => l.length >= 3 && l.length <= 120);
  return best ?? null;
}

async function fetchFacebookPage(id: string): Promise<{
  html: string;
  url: string;
  ogDescription?: string | null;
  ogTitle?: string | null;
  startMeta?: string | null;
  endMeta?: string | null;
  latMeta?: string | null;
  lngMeta?: string | null;
} | null> {
  const urls = [
    `https://m.facebook.com/events/${id}/`,
    `https://www.facebook.com/events/${id}/`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MapEventsBot/1.0)",
          "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      });

      if (!res.ok) continue;
      const html = await res.text();

      return {
        html,
        url,
        ogDescription: meta(html, "og:description"),
        ogTitle: meta(html, "og:title"),
        startMeta: meta(html, "event:start_time"),
        endMeta: meta(html, "event:end_time"),
        latMeta: meta(html, "place:location:latitude"),
        lngMeta: meta(html, "place:location:longitude"),
      };
    } catch {
      // try next
    }
  }

  return null;
}

function buildPlaceQueryFromPage(args: {
  targetCity?: string | null;
  ogDescription?: string | null;
  visibleText?: string;
}): string | null {
  const { targetCity, ogDescription, visibleText } = args;

  const addr1 = ogDescription ? extractAddressish(ogDescription) : null;
  const addr2 = visibleText ? extractAddressish(visibleText) : null;
  const venue = visibleText ? extractVenueLine(visibleText) : null;

  // Prefer explicit address
  const addr = addr1 || addr2;
  if (addr) {
    if (targetCity) return `${addr}, ${targetCity}, Poland`;
    return `${addr}, Poland`;
  }

  // Next: venue + city
  if (venue) {
    if (targetCity) return `${venue}, ${targetCity}, Poland`;
    return `${venue}, Poland`;
  }

  // Last resort: city only
  if (targetCity) return `${targetCity}, Poland`;
  return null;
}

async function searchIndexedFacebookEvents(q: string, limit = 10) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("Missing SERPAPI_KEY");

  const targetCity = inferTargetCityFromQuery(q);

  const results: ExternalEvent[] = [];
  const seen = new Set<string>();

  const stats = {
    scanned: 0,
    accepted: 0,
    noDate: 0,
    noGeo: 0,
    duplicate: 0,
  };

  const pageSize = 10;
  const maxScanned = Math.max(30, limit + 80); // allow some headroom, but not 150+ forever

  for (let start = 0; results.length < limit && stats.scanned < maxScanned; start += pageSize) {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", q);
    url.searchParams.set("start", String(start));
    url.searchParams.set("num", String(pageSize));
    url.searchParams.set("api_key", apiKey);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`SerpAPI error ${res.status}: ${await res.text()}`);

    const json = await res.json();
    const organic = (json.organic_results ?? []) as any[];
    if (!organic.length) break;

    for (const r of organic) {
      if (results.length >= limit) break;
      if (stats.scanned >= maxScanned) break;

      const link = r.link as string | undefined;
      if (!link) continue;

      const id = extractEventId(link);

      // Если id не распарсился — это не duplicate, просто пропускаем
      if (!id) continue;

      // Duplicate считаем только когда реально повторился id
      if (seen.has(id)) {
        stats.duplicate++;
        continue;
      }

      stats.scanned++;
      seen.add(id);

      // Fetch page and parse from it (NOT from snippet)
      const page = await fetchFacebookPage(id);
      if (!page) {
        stats.noDate++;
        continue;
      }

      const visibleText = stripVisibleText(page.html);

      // 1) Datetime sources in priority:
      //    a) JSON-LD
      //    b) OG meta
      //    c) visible text (Polish parser)
      let startAt: Date | undefined;
      let endAt: Date | null = null;

      const blocks = extractLdJsonBlocks(page.html);
      const ev = pickEventLdJson(blocks);

      if (ev?.startDate) {
        const d = new Date(ev.startDate);
        if (!isNaN(d.getTime())) startAt = d;
      }
      if (ev?.endDate) {
        const d = new Date(ev.endDate);
        if (!isNaN(d.getTime())) endAt = d;
      }

      if (!startAt && page.startMeta) {
        const d = new Date(page.startMeta);
        if (!isNaN(d.getTime())) startAt = d;
      }
      if (endAt == null && page.endMeta) {
        const d = new Date(page.endMeta);
        if (!isNaN(d.getTime())) endAt = isNaN(d.getTime()) ? null : d;
      }

      if (!startAt) {
        const parsed = parseStartEndFromPolishText(visibleText, { query: q });
        startAt = parsed.startAt;
        endAt = parsed.endAt ?? null;
      }

      if (!startAt) {
        stats.noDate++;
        continue;
      }

      // 2) Geo sources in priority:
      //    a) OG meta lat/lng
      //    b) JSON patterns in HTML
      //    c) geocode from placeQuery built from page
      let lat: number | null = null;
      let lng: number | null = null;

      if (page.latMeta && page.lngMeta) {
        const la = Number(page.latMeta);
        const ln = Number(page.lngMeta);
        if (Number.isFinite(la) && Number.isFinite(ln)) {
          lat = la;
          lng = ln;
        }
      }

      if (lat == null || lng == null) {
        const ll = extractLatLngFromHtml(page.html);
        if (ll) {
          lat = ll.lat;
          lng = ll.lng;
        }
      }

      let placeQuery = buildPlaceQueryFromPage({
        targetCity,
        ogDescription: page.ogDescription,
        visibleText,
      });

      if ((lat == null || lng == null) && placeQuery) {
        const geo = await geocodeNominatim(placeQuery);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
        }
      }

      if (lat == null || lng == null) {
        stats.noGeo++;
        continue;
      }

      stats.accepted++;

      results.push({
        title: page.ogTitle?.trim() || r.title?.trim() || "(Facebook event)",
        description: page.ogDescription ?? null,
        countryCode: "PL",
        city: targetCity ?? "Unknown",
        place: placeQuery ?? (targetCity ? `${targetCity}, Poland` : "Poland"),
        startAt,
        endAt,
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
        source: EventSource.facebook,
        sourceId: id,
        sourceUrl: `https://www.facebook.com/events/${id}/`,
        rawPayload: {
          query: q,
          serp: { title: r.title ?? null, link: r.link ?? null },
          facebook: {
            pageUrl: page.url,
            ogTitle: page.ogTitle ?? null,
            ogDescription: page.ogDescription ?? null,
            meta: {
              start: page.startMeta ?? null,
              end: page.endMeta ?? null,
              lat: page.latMeta ?? null,
              lng: page.lngMeta ?? null,
            },
            ldEvent: ev ?? null,
          },
          extracted: {
            placeQuery,
            visibleTextSample: visibleText.slice(0, 1200),
          },
        },
      });
    }
  }

  return { q, results, stats };
}

export async function syncFacebook(q: string, limit = 10) {
  const run = await prisma.syncRun.create({
    data: { source: "facebook" },
  });

  const { results, stats } = await searchIndexedFacebookEvents(q, Math.min(100, Math.max(1, limit)));

  const fetchedCount = stats.scanned;
  const skippedCount = Math.max(0, stats.scanned - stats.accepted);

  const { created, updated } = await importEvents(results, run.id, fetchedCount, skippedCount);

  return {
    ok: true,
    query: q,
    limit,
    scanned: stats.scanned,
    accepted: stats.accepted,
    fetched: fetchedCount,
    skipped: skippedCount,
    created,
    updated,
    skipBreakdown: {
      noDate: stats.noDate,
      noGeo: stats.noGeo,
      duplicate: stats.duplicate,
    },
  };
}
