import { NextResponse } from "next/server";

const demo = [
  {
    id: "krk-001",
    title: "Koncert: ACJATON + VIPER TOUCH",
    city: "Krakow",
    place: "Pub pod Ziemia",
    lat: 50.0516,
    lng: 19.9449,
    startAt: "2026-01-10T20:00:00.000Z",
    endAt: "2026-01-10T23:00:00.000Z",
    sourceUrl: "https://facebook.com/",
  },
  {
    id: "waw-001",
    title: "Jazz Night",
    city: "Warszawa",
    place: "Klub X",
    lat: 52.2297,
    lng: 21.0122,
    startAt: "2026-01-11T18:00:00.000Z",
    endAt: "2026-01-11T20:00:00.000Z",
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