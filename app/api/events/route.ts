import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

type FindManyArg = NonNullable<Parameters<PrismaClient["event"]["findMany"]>[0]>;
type Where = NonNullable<FindManyArg["where"]>;

type CreateEventBody = {
  title: string;
  countryCode?: string; // ISO-3166 alpha-2
  city: string;
  place?: string | null;
  startAt: string; // ISO
  endAt?: string | null; // ISO | null
  lat: number;
  lng: number;
  sourceUrl?: string | null;
};

function normalizeCountryCode(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (!/^[A-Z]{2}$/.test(s)) return null;
  return s;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const from = searchParams.get("from"); // ISO string
  const to = searchParams.get("to");     // ISO string
  const city = searchParams.get("city"); // optional
  const country = normalizeCountryCode(searchParams.get("country"));

  const mode = searchParams.get("statusMode") ?? "approved";

  const where: Where = {};

  if (mode === "approved") where.status = "approved";
  else where.status = { not: "approved" };

  if (from || to) {
    where.startAt = {};
    if (from) where.startAt.gte = new Date(from);
    if (to) where.startAt.lte = new Date(to);
  }

  if (city) {
    where.city = city;
  }

  if (country) {
    where.countryCode = country;
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: 2000, // ???
  });

  const items = events.map((e) => ({
    id: e.id,
    title: e.title,
    countryCode: e.countryCode,
    city: e.city,
    place: e.place,
    lat: Number(e.lat),
    lng: Number(e.lng),
    startAt: e.startAt.toISOString(),
    endAt: e.endAt ? e.endAt.toISOString() : null,
    status: e.status,
    sourceUrl: e.sourceUrl,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreateEventBody;

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!body.city?.trim()) {
    return NextResponse.json({ error: "city is required" }, { status: 400 });
  }
  if (!body.startAt) {
    return NextResponse.json({ error: "startAt is required" }, { status: 400 });
  }
  if (typeof body.lat !== "number" || typeof body.lng !== "number") {
    return NextResponse.json({ error: "lat/lng are required" }, { status: 400 });
  }

  const countryCode = normalizeCountryCode(body.countryCode) ?? "PL";

  const start = new Date(body.startAt);
  const end = body.endAt ? new Date(body.endAt) : null;

  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "startAt is invalid" }, { status: 400 });
  }

  if (end) {
    if (Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "endAt is invalid" }, { status: 400 });
    }
    if (end.getTime() <= start.getTime()) {
      return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });
    }
  }

  const created = await prisma.event.create({
    data: {
      title: body.title.trim(),
      countryCode,
      city: body.city.trim(),
      place: body.place?.trim() || null,
      startAt: start,
      endAt: end,
      lat: body.lat as any, 
      lng: body.lng as any,
      source: "manual",
      sourceUrl: body.sourceUrl?.trim() || null,
      status: "approved",
    },
  });

  return NextResponse.json({
    item: {
      id: created.id,
      title: created.title,
      countryCode: created.countryCode,
      city: created.city,
      place: created.place,
      lat: Number(created.lat),
      lng: Number(created.lng),
      startAt: created.startAt.toISOString(),
      endAt: created.endAt ? created.endAt.toISOString() : null,
      status: created.status,
      sourceUrl: created.sourceUrl,
    },
  });
}