import { NextResponse } from "next/server";
import { syncFacebook } from "@/scripts/sync-facebook";
import { syncIcs } from "@/scripts/sync-ics";
import { syncExcel } from "@/scripts/sync-excel";

export const runtime = "nodejs";

function parsePositiveInt(x: unknown, fallback: number) {
  const n = typeof x === "string" ? Number.parseInt(x, 10) : typeof x === "number" ? x : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function validateHttpUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false as const, error: "Invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false as const, error: "URL must start with http:// or https://" };
  }
  return { ok: true as const, url };
}

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";

  try {
    // Excel: multipart/form-data
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
      }
      const limit = parsePositiveInt(fd.get("limit"), 500);

      const buf = Buffer.from(await file.arrayBuffer());
      const result = await syncExcel({ buffer: buf, filename: file.name, fetchLimit: limit });
      return NextResponse.json(result);
    }

    // JSON: facebook / ics
    const body = await req.json();

    const type = body?.type;
    if (type === "facebook") {
      const query = String(body?.query ?? "").trim();
      if (!query) return NextResponse.json({ ok: false, error: "Missing query" }, { status: 400 });
      const limit = parsePositiveInt(body?.limit, 50);
      const result = await syncFacebook(query, limit);
      return NextResponse.json(result);
    }

    if (type === "ics") {
      const rawUrl = String(body?.url ?? "").trim();
      if (!rawUrl) return NextResponse.json({ ok: false, error: "Missing ICS URL" }, { status: 400 });

      const v = validateHttpUrl(rawUrl);
      if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

      const limit = parsePositiveInt(body?.limit, 200);
      const futureOnly = Boolean(body?.futureOnly);

      // lightweight server-side validation hint
      const urlLooksLikeIcs = v.url.pathname.toLowerCase().endsWith(".ics");

      const result = await syncIcs(v.url.toString(), limit, futureOnly);

      return NextResponse.json({
        ...result,
        url: v.url.toString(),
        warning: urlLooksLikeIcs ? null : "URL does not end with .ics (continuing anyway)",
        futureOnly,
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown import type" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Import failed" }, { status: 500 });
  }
}
