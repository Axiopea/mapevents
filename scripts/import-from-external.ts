import { prisma } from "@/lib/prisma";
import { ExternalEvent } from "@/lib/import/types";
import { EventStatus } from "@prisma/client";

export async function importEvents(externalEvents: ExternalEvent[], jobRunId: string, fetched: number, skipped: number) {
  let created = 0, updated = 0;

  for (const externalEvent of externalEvents) {
    const saved = await prisma.event.upsert({
      where: { source_sourceId: { source: externalEvent.source, sourceId: externalEvent.sourceId } },
      create: { ...externalEvent, status: EventStatus.pending },
      update: { ...externalEvent },
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
