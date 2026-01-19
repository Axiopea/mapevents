// app/api/cron/sync-facebook/route.ts
import { NextResponse } from "next/server";
import { syncFacebook } from "@/scripts/sync-facebook";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await syncFacebook();
  return NextResponse.json(result);
}
