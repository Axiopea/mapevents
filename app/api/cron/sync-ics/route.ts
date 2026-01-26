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

  const futureOnly = (process.env.ICS_FUTURE_ONLY ?? '').toLowerCase() === 'true';

  const result = await syncIcs(url, fetchLimit, futureOnly);
  return NextResponse.json(result);
}
