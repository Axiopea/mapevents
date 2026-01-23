import { prisma } from "@/lib/prisma";
import { ExternalEvent } from "@/lib/import/types";
import { EventStatus } from "@prisma/client";

export async function importEvents(externalEvents: ExternalEvent[], jobRunId: string, fetched: number, skipped: number) {
  let created = 0, updated = 0;

  for (const externalEvent of externalEvents) {
    console.info(externalEvent);
    const existing = await prisma.event.findUnique({
      where: {
        source_sourceId: {
          source: externalEvent.source,
          sourceId: externalEvent.sourceId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    const locked =
      existing?.status === EventStatus.approved ||
      existing?.status === EventStatus.rejected;

    const updateData = locked
      ? {
          sourceUrl: externalEvent.sourceUrl,
          title: externalEvent.title,
          description: externalEvent.description,
          rawPayload: externalEvent.rawPayload
        }
      : {
          ...externalEvent,
        };

    const saved = await prisma.event.upsert({
      where: { source_sourceId: { source: externalEvent.source, sourceId: externalEvent.sourceId } },
      create: { ...externalEvent, status: EventStatus.pending },
      update: updateData,
    });

    if (saved.createdAt.getTime() === saved.updatedAt.getTime()) created++;
    else updated++;
  }

  await prisma.syncRun.update({
      where: { id: jobRunId },
      data: {
        status: "success",
        finishedAt: new Date(),
        fetchedCount: fetched,
        createdCount: created,
        updatedCount: updated,
        skippedCount: skipped,
      },
    });

  return { created, updated };
}
