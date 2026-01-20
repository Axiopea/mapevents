import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

type FindManyArg = NonNullable<Parameters<PrismaClient["event"]["findMany"]>[0]>;
type Where = NonNullable<FindManyArg["where"]>;

type CreateEventBody = {
  title: string;
  city: string;
  place?: string | null;
  startAt: string; // ISO
  endAt?: string | null; // ISO | null
  lat: number;
  lng: number;
  sourceUrl?: string | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const from = searchParams.get("from"); // ISO string
  const to = searchParams.get("to");     // ISO string
  const city = searchParams.get("city"); // optional

  const where : Where = { status: "approved" };

  if (from || to) {
    where.startAt = {};
    if (from) where.startAt.gte = new Date(from);
    if (to) where.startAt.lte = new Date(to);
  }

  if (city) {
    where.city = city;
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: 2000, // ???
  });

  const items = events.map((e) => ({
    id: e.id,
    title: e.title,
    city: e.city,
    place: e.place,
    lat: Number(e.lat),
    lng: Number(e.lng),
    startAt: e.startAt.toISOString(),
    endAt: e.endAt ? e.endAt.toISOString() : null,
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

  const start = new Date(body.startAt);
  const end = body.endAt ? new Date(body.endAt) : null;

  const created = await prisma.event.create({
    data: {
      title: body.title.trim(),
      countryCode: "PL",
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
      city: created.city,
      place: created.place,
      lat: Number(created.lat),
      lng: Number(created.lng),
      startAt: created.startAt.toISOString(),
      endAt: created.endAt ? created.endAt.toISOString() : null,
      sourceUrl: created.sourceUrl,
    },
  });
}