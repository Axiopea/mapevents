import { prisma } from "@/lib/prisma";

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function geocodeNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;

  const cached = await prisma.geoCache.findUnique({ where: { query: q } });
  if (cached?.lat && cached?.lng) {
    return { lat: Number(cached.lat), lng: Number(cached.lng) };
  }

  await sleep(1100);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", q);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "MapEvents/1.0 (cron; contact: r.bahirau@axiopea.com)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    await prisma.geoCache.upsert({
      where: { query: q },
      create: { query: q, raw: { error: `HTTP ${res.status}` } },
      update: { raw: { error: `HTTP ${res.status}` } },
    });
    return null;
  }

  const json = (await res.json()) as NominatimResult[];
  const first = json?.[0];
  if (!first?.lat || !first?.lon) {
    await prisma.geoCache.upsert({
      where: { query: q },
      create: { query: q, raw: json ?? null, lat: null, lng: null },
      update: { raw: json ?? null, lat: null, lng: null },
    });
    return null;
  }

  const lat = Number(first.lat);
  const lng = Number(first.lon);

  await prisma.geoCache.upsert({
    where: { query: q },
    create: { query: q, lat: lat.toFixed(6), lng: lng.toFixed(6), raw: first as any },
    update: { lat: lat.toFixed(6), lng: lng.toFixed(6), raw: first as any },
  });

  return { lat, lng };
}
