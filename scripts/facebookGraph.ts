export type FacebookEventMapped = {
  sourceEventId: string;
  sourceUrl: string;

  title: string;
  description?: string;

  countryCode: string;
  city: string;
  place?: string;

  startAt: string; // ISO
  endAt?: string | null;

  lat: number;
  lng: number;

  raw: unknown;
};

type GraphPaging = {
  cursors?: { before?: string; after?: string };
  next?: string;
};

type GraphEvent = {
  id: string;
  name?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  event_times?: any; // у recurring бывает сложнее
  place?: {
    name?: string;
    location?: {
      city?: string;
      country?: string;
      country_code?: string;
      latitude?: number;
      longitude?: number;
      street?: string;
      zip?: string;
    };
  };
};

type GraphResponse = {
  data: GraphEvent[];
  paging?: GraphPaging;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

// Попробуем определить countryCode
function inferCountryCode(e: GraphEvent): string {
  const cc = e.place?.location?.country_code;
  if (cc && cc.length === 2) return cc.toUpperCase();
  // fallback: если нет — ставим PL или "XX"
  return "PL";
}

function inferCity(e: GraphEvent): string {
  return e.place?.location?.city ?? "Unknown";
}

function inferLatLng(e: GraphEvent): { lat: number; lng: number } | null {
  const lat = e.place?.location?.latitude;
  const lng = e.place?.location?.longitude;
  if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  return null;
}

function buildEventUrl(id: string) {
  return `https://www.facebook.com/events/${id}`;
}

/**
 * Fetch events from a Facebook Page using Graph API:
 * GET /{page-id}/events?fields=...&since=...&until=...&limit=...
 */
export async function fetchFacebookPageEvents(options?: {
  since?: Date; // optional
  until?: Date; // optional
  limit?: number; // page size
  maxPages?: number;
}): Promise<FacebookEventMapped[]> {
  const version = process.env.FACEBOOK_GRAPH_VERSION ?? "v24.0";
  const pageId = mustEnv("FACEBOOK_PAGE_ID");
  const token = mustEnv("FACEBOOK_PAGE_ACCESS_TOKEN");

  const limit = options?.limit ?? 50;
  const maxPages = options?.maxPages ?? 10;

  const fields = [
    "id",
    "name",
    "description",
    "start_time",
    "end_time",
    "place{ name, location{city,country,country_code,latitude,longitude,street,zip} }",
  ].join(",");

  const base = `https://graph.facebook.com/${version}/${pageId}/events`;
  const params = new URLSearchParams({
    access_token: token,
    fields,
    limit: String(limit),
  });

  if (options?.since) params.set("since", Math.floor(options.since.getTime() / 1000).toString());
  if (options?.until) params.set("until", Math.floor(options.until.getTime() / 1000).toString());

  let url = `${base}?${params.toString()}`;
  const out: FacebookEventMapped[] = [];

  for (let page = 0; page < maxPages; page++) {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Facebook Graph error ${res.status}: ${txt}`);
    }

    const json = (await res.json()) as GraphResponse;

    for (const e of json.data ?? []) {
      if (!e.id || !e.start_time) continue;

      const ll = inferLatLng(e);
      if (!ll) continue; 

      out.push({
        sourceEventId: e.id,
        sourceUrl: buildEventUrl(e.id),
        title: e.name ?? "(no title)",
        description: e.description,
        countryCode: inferCountryCode(e),
        city: inferCity(e),
        place: e.place?.name,
        startAt: new Date(e.start_time).toISOString(),
        endAt: e.end_time ? new Date(e.end_time).toISOString() : null,
        lat: ll.lat,
        lng: ll.lng,
        raw: e,
      });
    }

    const next = json.paging?.next;
    if (!next) break;
    url = next;
  }

  return out;
}
