// app/api/cron/sync-facebook/route.ts
import { NextResponse } from "next/server";
import { syncFacebook } from "@/scripts/sync-facebook";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const q = process.env.FB_SEARCH_QUERY;
  if (!q) throw new Error("Missing FB_SEARCH_QUERY");

  const result = await syncFacebook(q);
  return NextResponse.json(result);
}
