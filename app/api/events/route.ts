import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";

type FindManyArg = NonNullable<Parameters<PrismaClient["event"]["findMany"]>[0]>;
type Where = NonNullable<FindManyArg["where"]>;

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
