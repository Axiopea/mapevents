import { NextResponse } from "next/server";

const demo = [
  {
    id: "krk-001",
    title: "Koncert: ACJATON + VIPER TOUCH",
    city: "Krakow",
    place: "Pub pod Ziemia",
    lat: 50.0516,
    lng: 19.9449,
    startAt: "2026-01-13T14:00:00.000Z",
    endAt: "2026-01-13T16:00:00.000Z",
    sourceUrl: "https://facebook.com/",
  },
  {
    id: "krk-002",
    title: "Koncert: B-2",
    city: "Krakow",
    place: "Pub nad Ziemia",
    lat: 50.0516,
    lng: 19.9449,
    startAt: "2026-01-14T18:00:00.000Z",
    endAt: "2026-01-14T20:00:00.000Z",
    sourceUrl: "https://facebook.com/",
  },
  {
    id: "krk-003",
    title: "Koncert: Akwarium",
    city: "Krakow",
    place: "Pub nad Ziemia",
    lat: 50.0516,
    lng: 19.9449,
    startAt: "2026-01-16T19:00:00.000Z",
    endAt: "2026-01-16T21:00:00.000Z",
    sourceUrl: "https://facebook.com/",
  },
  {
    id: "waw-001",
    title: "Jazz Night",
    city: "Warszawa",
    place: "Klub X",
    lat: 52.2297,
    lng: 21.0122,
    startAt: "2026-01-15T17:00:00.000Z",
    endAt: "2026-01-15T18:00:00.000Z",
    sourceUrl: "https://example.com/",
  },
  {
    id: "waw-002",
    title: "Jazz Light",
    city: "Warszawa",
    place: "Klub Y",
    lat: 52.2297,
    lng: 21.0122,
    startAt: "2026-01-17T22:00:00.000Z",
    endAt: "2026-01-17T23:00:00.000Z",
    sourceUrl: "https://example.com/",
  },
  {
    id: "wrc-001",
    title: "Jazz Wow",
    city: "Wraclaw",
    place: "Pub Crawl",
    lat: 51.110249,
    lng: 17.027740,
    startAt: "2026-01-15T17:00:00.000Z",
    endAt: "2026-01-15T18:00:00.000Z",
    sourceUrl: "https://example.com/",
  },
 {
    id: "gdn-001",
    title: "Pop Rock",
    city: "Gdansk",
    place: "Red Light",
    lat: 54.3493062,
    lng: 18.6521693,
    startAt: "2026-01-18T22:30:00.000Z",
    endAt: "2026-01-18T23:30:00.000Z",
    sourceUrl: "https://example.com/",
  },
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // filter by time (as example)
  const items = demo.filter((e) => {
    if (!from || !to) return true;
    return e.startAt >= from && e.startAt <= to;
  });

  return NextResponse.json({ items });
}