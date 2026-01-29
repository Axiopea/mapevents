import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  const url =
    `https://nominatim.openstreetmap.org/reverse?` +
    new URLSearchParams({
      lat,
      lon: lng,
      format: "jsonv2",
      addressdetails: "1",
      zoom: "18",
    });

  const res = await fetch(url, {
    headers: {
      "User-Agent": "mapevents/1.0 (contact: r.bahirau@axiopea.com)",
      "Accept-Language": "pl,en",
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "geocode failed" }, { status: 502 });
  }

  const data: any = await res.json();

  const addr = data?.address ?? {};
  // Nominatim returns ISO-3166 alpha-2 in lowercase (e.g. "pl").
  const countryCodeRaw = (addr.country_code || "") as string;
  const countryCode = countryCodeRaw ? String(countryCodeRaw).toUpperCase() : "";
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    "";

  const road = addr.road || "";
  const house = addr.house_number || "";
  const place = [road, house].filter(Boolean).join(" ");

  return NextResponse.json({
    city,
    place,
    countryCode,
    displayName: data?.display_name ?? "",
    raw: data,
  });
}
