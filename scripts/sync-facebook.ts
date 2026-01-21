import "dotenv/config"; // to take URL connection from .env
import { fetchFacebookPageEvents, FacebookEventMapped } from "@/scripts/facebookGraph";
import { EventSource, EventStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

function isoPlusDays(daysFromNow: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString(); // ok for MVP; later we need to preserve +01:00 formatting
}

export async function syncFacebook() {
  const running = await prisma.syncRun.findFirst({
    where: { source: "facebook", status: "running" },
  });
  if (running) {
    return { skipped: true, reason: "sync already running" };
  }

  const run = await prisma.syncRun.create({
    data: { source: "facebook" },
  });

  let fetched = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const until = new Date();
    until.setDate(until.getDate() + 90);

    const events: FacebookEventMapped[] = await fetchFacebookPageEvents({ since, until, limit: 50, maxPages: 20 });

    fetched = events.length;

    for (const e of events) {
      const res = await prisma.event.upsert({
        where: {
          source_sourceId: {
            source: EventSource.facebook,
            sourceId: e.sourceEventId ? e.sourceEventId : "",
          },
        },
        create: {
          source: EventSource.facebook,
          sourceId: e.sourceEventId,
          sourceUrl: e.sourceUrl,

          title: e.title,
          startAt: new Date(e.startAt),
          endAt: e.endAt ? new Date(e.endAt) : null,

          lat: e.lat.toFixed(6),
          lng: e.lng.toFixed(6),

          city: e.city,
          countryCode: e.countryCode,
          place: e.place,

          rawPayload: e.raw ? e.raw : "",
          status: EventStatus.pending,
        },
        update: {
          title: e.title,
          startAt: new Date(e.startAt),
          endAt: e.endAt ? new Date(e.endAt) : null,
          lat: e.lat.toFixed(6),
          lng: e.lng.toFixed(6),
          city: e.city,
          countryCode: e.countryCode,
          place: e.place,
          rawPayload: e.raw ? e.raw : "",
        },
      });

      if (res.createdAt.getTime() === res.updatedAt.getTime()) {
        created++;
      } else {
        updated++;
      }
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        fetchedCount: fetched,
        createdCount: created,
        updatedCount: updated,
        skippedCount: skipped,
      },
    });

    console.info("Facebook sync finished");

    return { ok: true, fetched, created, updated };
  } catch (err: any) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: err?.stack ?? String(err),
      },
    });

    console.warn("Facebook sync failed");

    throw err;
  }
}

async function main() {
    await syncFacebook();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
