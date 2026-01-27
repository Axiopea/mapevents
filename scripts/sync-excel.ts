import { prisma } from "@/lib/prisma";
import { EventSource } from "@prisma/client";
import { ExternalEvent } from "@/lib/import/types";
import { importEvents } from "@/scripts/import-from-external";
import { geocodeNominatim } from "@/lib/geocode/nominatim";
import * as XLSX from "xlsx";
import crypto from "crypto";

type SyncExcelInput = {
  buffer: Buffer;
  filename?: string;
  fetchLimit: number;
};

function asText(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function asNullableText(v: unknown): string | null {
  const t = asText(v);
  return t ? t : null;
}

function parseExcelDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, (d.m ?? 1) - 1, d.d ?? 1, d.H ?? 0, d.M ?? 0, d.S ?? 0));
  }
  const s = asText(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function hashId(parts: string[]): string {
  const h = crypto.createHash("sha1");
  h.update(parts.join("|"), "utf8");
  return h.digest("hex");
}

function pickRow(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const hit = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (hit) return (row as any)[hit];
  }
  return undefined;
}

export async function syncExcel(input: SyncExcelInput) {
  const run = await prisma.syncRun.create({
    data: { source: "other" },
  });

  const wb = XLSX.read(input.buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel has no sheets");

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const fetchLimit = Math.min(5000, Math.max(1, input.fetchLimit || rows.length || 1));

  const out: ExternalEvent[] = [];

  let fetched = 0;
  let skipped = 0;
  let geocoded = 0;

  for (const row of rows) {
    if (fetched >= fetchLimit) break;
    fetched++;

    const title = asText(pickRow(row, ["title", "name"]));
    const description = asNullableText(pickRow(row, ["description", "details"]));

    const startAt = parseExcelDate(pickRow(row, ["startAt", "start", "date"]));
    const endAt = parseExcelDate(pickRow(row, ["endAt", "end"]));

    const place = asText(pickRow(row, ["place", "location", "address", "venue"]));
    const city = asText(pickRow(row, ["city"])) || "Unknown";
    const countryCode = (asText(pickRow(row, ["countryCode", "country"])) || "PL").toUpperCase();

    const latRaw = pickRow(row, ["lat", "latitude"]);
    const lngRaw = pickRow(row, ["lng", "lon", "longitude"]);

    const sourceUrl = asNullableText(pickRow(row, ["sourceUrl", "url", "link"]));

    const explicitSourceId = asNullableText(pickRow(row, ["sourceId", "id"]));

    if (!title || !startAt || !place) {
      skipped++;
      continue;
    }

    let lat: number | null = null;
    let lng: number | null = null;

    if (asText(latRaw) && asText(lngRaw)) {
      const la = Number(asText(latRaw).replace(",", "."));
      const ln = Number(asText(lngRaw).replace(",", "."));
      if (Number.isFinite(la) && Number.isFinite(ln)) {
        lat = la;
        lng = ln;
      }
    }

    let geo: { lat: number; lng: number } | null = null;

    if (lat == null || lng == null) {
      geo = await geocodeNominatim(place);
      if (!geo) {
        skipped++;
        continue;
      }
      geocoded++;
      lat = geo.lat;
      lng = geo.lng;
    }

    const stableSourceId =
      explicitSourceId ??
      `excel:${hashId([title, startAt.toISOString(), place, city, countryCode, input.filename ?? "unknown"])}`;

    out.push({
      title,
      description,
      countryCode,
      city,
      place,
      startAt,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      lat: lat!.toFixed(6),
      lng: lng!.toFixed(6),
      source: EventSource.other,
      sourceId: stableSourceId,
      sourceUrl: sourceUrl ?? null,
      rawPayload: {
        file: input.filename ?? null,
        row,
        geocode: geo ?? null,
      },
    });
  }

  const { created, updated } = await importEvents(out, run.id, fetched, skipped);

  return {
    ok: true,
    fetchedCount: fetched,
    geocodedCount: geocoded,
    created,
    updated,
    skippedCount: skipped,
    acceptedCount: out.length,
  };
}
