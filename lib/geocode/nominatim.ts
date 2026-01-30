import { prisma } from "@/lib/prisma";

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  address?: Record<string, unknown>;
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
  url.searchParams.set("addressdetails", "1");
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
      create: { query: q, raw: json ? ({ results: json } as any) : null, lat: null, lng: null },
      update: { raw: json ? ({ results: json } as any) : null, lat: null, lng: null },
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

export type NominatimDetails = {
  lat: number;
  lng: number;
  displayName?: string;
  class?: string;
  type?: string;
  address?: Record<string, unknown>;
  /** True if Nominatim result looks like city/region centroid (low precision). */
  cityLevel?: boolean;
  raw?: unknown;
};

function looksCityLevel(first: NominatimResult): boolean {
  const cls = (first.class ?? "").toLowerCase();
  const tp = (first.type ?? "").toLowerCase();

  if (cls === "boundary") return true;
  if (
    cls === "place" &&
    ["city", "town", "village", "hamlet", "municipality", "county", "state", "region", "country"].includes(tp)
  )
    return true;
  if (["city", "town", "village", "municipality", "county", "state", "region", "country", "administrative"].includes(tp))
    return true;

  return false;
}

/**
 * Same as geocodeNominatim(), but also returns Nominatim metadata (class/type/address) to judge precision.
 * This function reuses the same GeoCache table.
 */
export async function geocodeNominatimDetailed(query: string): Promise<NominatimDetails | null> {
  const q = query.trim();
  if (!q) return null;

  const cached = await prisma.geoCache.findUnique({ where: { query: q } });
  if (cached?.lat && cached?.lng) {
    const raw = cached.raw as any;
    const first: NominatimResult | null = raw && typeof raw === "object" ? (raw as any) : null;
    const lat = Number(cached.lat);
    const lng = Number(cached.lng);
    return {
      lat,
      lng,
      displayName: first?.display_name,
      class: first?.class,
      type: first?.type,
      address: first?.address,
      cityLevel: first ? looksCityLevel(first) : undefined,
      raw,
    };
  }

  await sleep(1100);

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
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
      create: { query: q, raw: json ? ({ results: json } as any) : null, lat: null, lng: null },
      update: { raw: json ? ({ results: json } as any) : null, lat: null, lng: null },
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

  return {
    lat,
    lng,
    displayName: first.display_name,
    class: first.class,
    type: first.type,
    address: first.address,
    cityLevel: looksCityLevel(first),
    raw: first as any,
  };
}

type NominatimReverseResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, unknown>;
};

/**
 * Reverse geocode coordinates -> best-effort city/town/village name.
 *
 * Uses the same GeoCache table by storing entries under a synthetic query key:
 *   rev:<latRounded>,<lngRounded>
 */
export async function reverseGeocodeNominatimCity(
  lat: number,
  lng: number
): Promise<{ city: string | null; raw?: unknown } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // ~11m precision; good enough for city lookup and keeps cache effective.
  const key = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;

  const cached = await prisma.geoCache.findUnique({ where: { query: key } });
  if (cached) {
    const raw = cached.raw as any;
    const city = typeof raw?.city === "string" ? raw.city : null;
    return { city, raw };
  }

  await sleep(1100);

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "10");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "MapEvents/1.0 (cron; contact: r.bahirau@axiopea.com)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    await prisma.geoCache.upsert({
      where: { query: key },
      create: { query: key, raw: { error: `HTTP ${res.status}` } },
      update: { raw: { error: `HTTP ${res.status}` } },
    });
    return null;
  }

  const json = (await res.json().catch(() => null)) as NominatimReverseResult | null;
  const addr = (json?.address ?? {}) as Record<string, unknown>;

  const city =
    (typeof addr.city === "string" ? (addr.city as string) : null) ||
    (typeof addr.town === "string" ? (addr.town as string) : null) ||
    (typeof addr.village === "string" ? (addr.village as string) : null) ||
    (typeof addr.municipality === "string" ? (addr.municipality as string) : null) ||
    (typeof addr.county === "string" ? (addr.county as string) : null) ||
    null;

  await prisma.geoCache.upsert({
    where: { query: key },
    create: { query: key, raw: { city, address: addr, result: json } as any },
    update: { raw: { city, address: addr, result: json } as any },
  });

  return { city, raw: { address: addr, result: json } };
}

/**
 * Reverse geocode coordinates -> best-effort city/town/village + 2-letter country code.
 *
 * Uses the same GeoCache table by storing entries under a synthetic query key:
 *   revcc:<latRounded>,<lngRounded>
 */
export async function reverseGeocodeNominatimCityCountry(
  lat: number,
  lng: number
): Promise<{ city: string | null; countryCode: string | null; raw?: unknown } | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // ~11m precision; good enough for city/country lookup and keeps cache effective.
  const key = `revcc:${lat.toFixed(4)},${lng.toFixed(4)}`;

  const cached = await prisma.geoCache.findUnique({ where: { query: key } });
  if (cached) {
    const raw = cached.raw as any;
    const city = typeof raw?.city === "string" ? raw.city : null;
    const cc = typeof raw?.countryCode === "string" ? raw.countryCode : null;
    return { city, countryCode: cc, raw };
  }

  await sleep(1100);

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "10");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "MapEvents/1.0 (cron; contact: r.bahirau@axiopea.com)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    await prisma.geoCache.upsert({
      where: { query: key },
      create: { query: key, raw: { error: `HTTP ${res.status}` } },
      update: { raw: { error: `HTTP ${res.status}` } },
    });
    return null;
  }

  const json = (await res.json().catch(() => null)) as NominatimReverseResult | null;
  const addr = (json?.address ?? {}) as Record<string, unknown>;

  const city =
    (typeof addr.city === "string" ? (addr.city as string) : null) ||
    (typeof addr.town === "string" ? (addr.town as string) : null) ||
    (typeof addr.village === "string" ? (addr.village as string) : null) ||
    (typeof addr.municipality === "string" ? (addr.municipality as string) : null) ||
    (typeof addr.county === "string" ? (addr.county as string) : null) ||
    null;

  const countryCodeRaw = typeof addr.country_code === "string" ? (addr.country_code as string) : null;
  const countryCode = countryCodeRaw && countryCodeRaw.length === 2 ? countryCodeRaw.toUpperCase() : null;

  await prisma.geoCache.upsert({
    where: { query: key },
    create: { query: key, raw: { city, countryCode, address: addr, result: json } as any },
    update: { raw: { city, countryCode, address: addr, result: json } as any },
  });

  return { city, countryCode, raw: { address: addr, result: json } };
}
