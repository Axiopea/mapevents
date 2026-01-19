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

async function fetchMockFacebook(): Promise<FacebookEventMapped[]> {
  const warsaw = { lat: 52.2297, lng: 21.0122 };

    return [
    {
      sourceEventId: "fb_mock_001",
      sourceUrl: "https://facebook.com/events/fb_mock_001",
      title: "Tech Meetup: MapEvents (Mock)",
      description: "Mock Facebook event for pipeline testing.",
      countryCode: "PL",
      city: "Warsaw",
      place: "Centrum, Warsaw",
      startAt: isoPlusDays(1, 18, 0),
      endAt: null,
      lat: warsaw.lat,
      lng: warsaw.lng,
      raw: {
        id: "fb_mock_001",
        provider: "facebook",
        fetchedAt: new Date().toISOString(),
        note: "This is mock payload",
      },
    },
    {
      sourceEventId: "fb_mock_002",
      sourceUrl: "https://facebook.com/events/fb_mock_002",
      title: "Open Air Concert (Mock)",
      description: "Bring a blanket. Mock data.",
      countryCode: "PL",
      city: "Warsaw",
      place: "Lazienki Park",
      startAt: isoPlusDays(2, 20, 0),
      endAt: isoPlusDays(2, 22, 0),
      lat: 52.2153,
      lng: 21.0359,
      raw: {
        id: "fb_mock_002",
        fetchedAt: new Date().toISOString(),
        tags: ["music", "outdoor"],
      },
    },
    {
      sourceEventId: "fb_mock_003",
      sourceUrl: "https://facebook.com/events/fb_mock_003",
      title: "Art Exhibition Opening (Mock)",
      countryCode: "PL",
      city: "Warsaw",
      place: "Art Gallery",
      startAt: isoPlusDays(5, 19, 0),
      endAt: null,
      lat: 52.2405,
      lng: 21.0074,
      raw: {
        id: "fb_mock_003",
        fetchedAt: new Date().toISOString(),
        organizer: { name: "Mock Gallery" },
      },
    },
  ];
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
    //const events: FacebookEventMapped[] = await fetchMockFacebook();

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
