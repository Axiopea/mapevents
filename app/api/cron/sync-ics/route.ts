import { NextResponse } from "next/server";
import { syncIcs } from "@/scripts/sync-ics";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const url = process.env.ICS_URL;
  const fetchLimit = Number.parseInt(process.env.ICS_JOB_FETCH_LIMIT ?? '0');
  if (!url) return new NextResponse("Missing ICS_URL", { status: 500 });

  const result = await syncIcs(url, fetchLimit);
  return NextResponse.json(result);
}
