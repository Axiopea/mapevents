// scripts/import-events.ts
import "dotenv/config"; // to take URL connection from .env
import fs from "node:fs";
import readline from "node:readline";
import { EventSource, EventStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import Decimal from "decimal.js";

//import { parse } from "pg-connection-string";
//console.log("DATABASE_URL =", process.env.DATABASE_URL);
//console.log(parse(process.env.DATABASE_URL!)); // debug DB connection info

type RawFileEvent = {
  source: "manual" | "facebook" | "other";
  sourceEventId?: string;

  title: string;
  description?: string;

  countryCode: string;
  city: string;
  place?: string;

  startAt: string;
  endAt?: string | null;

  lat: number;
  lng: number;

  sourceUrl?: string;
  raw?: unknown;  // rawPayLoad
};

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

function mapSource(s: RawFileEvent["source"]): EventSource {
  if (s === "facebook") return EventSource.facebook;
  if (s === "other")    return EventSource.other;
  
  return EventSource.manual;
}

function toDecimal(n: number): Decimal {
  return new Decimal(n);
}

function toJsonField(x: unknown): Json | undefined {
  if (x === undefined) return undefined;
 
  return x as Json;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) throw new Error("Usage: node scripts/import-events.ts <path-to-ndjson>");

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let ok = 0;
  let bad = 0;

  for await (const line of rl) {
    const s = line.trim();
    if (!s) continue;

    let rec: RawFileEvent;
    try {
      rec = JSON.parse(s);
    } 
    catch {
      bad++;
      continue;
    }

    // validation
    if (!rec.title || !rec.countryCode || !rec.city || !rec.startAt) { 
      bad++; 
      continue; 
    }
    if (typeof rec.lat !== "number" || typeof rec.lng !== "number")  {
      bad++; 
      continue; 
    }

    const source   = rec.source as EventSource;
    const sourceId = rec.sourceEventId ?? null;

    // Facebook source requires sourceEventId to insert/update
    if (source !== EventSource.manual && !sourceId) { 
      bad++; continue; 
    }

    const startAt = new Date(rec.startAt);
    const endAt = rec.endAt ? new Date(rec.endAt) : null;

    // Data to create/update (without status)
    const baseData = {
      title: rec.title,
      description: rec.description ?? null,

      countryCode: rec.countryCode,
      city: rec.city,
      place: rec.place ?? null,

      startAt,
      endAt,

      lat: toDecimal(rec.lat),
      lng: toDecimal(rec.lng),

      source,
      sourceId,
      sourceUrl: rec.sourceUrl ?? null,

      rawPayload: toJsonField(rec.raw),
    };

    if (sourceId) {
      // upsert by @@unique([source, sourceId])
      const createData: any = {
       ...baseData,
       status: EventStatus.pending,
      };
      if (rec.raw !== undefined) createData.rawPayload = rec.raw;

      const updateData: any = {
        ...baseData,
      };
      if (rec.raw !== undefined) updateData.rawPayload = rec.raw;

      await prisma.event.upsert({
        where: { source_sourceId: { source, sourceId } },
        create: createData,
        update: updateData,
      });
    } else {
      // manual without sourceId — create as draft
      const createData: any = {
       ...baseData,
       status: EventStatus.draft,
      };
      if (rec.raw !== undefined) createData.rawPayload = rec.raw;
      
      await prisma.event.create({
        data: createData,
      });
    }

    ok++;
  }

  console.log({ ok, bad });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());