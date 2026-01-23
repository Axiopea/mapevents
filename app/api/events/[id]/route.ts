import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type PatchBody =
  | { status: "approved" | "rejected" }
  | {
      title?: string;
      place?: string | null;
      startAt?: string; // ISO
      endAt?: string | null; // ISO|null (null = очистить)
    };

function isStatusPatch(body: any): body is { status: "approved" | "rejected" } {
  return body?.status === "approved" || body?.status === "rejected";
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as PatchBody | null;

  if (!body) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const current = await prisma.event.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 1) Старое поведение: approve/reject (только draft/pending)
  if (isStatusPatch(body)) {
    if (current.status !== "draft" && current.status !== "pending") {
      return NextResponse.json(
        { error: `cannot change status from ${current.status}` },
        { status: 409 }
      );
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { status: body.status },
    });

    return NextResponse.json({ item: { id: updated.id, status: updated.status } });
  }

  // 2) Редактирование полей (только draft/pending)
  if (current.status !== "draft" && current.status !== "pending") {
    return NextResponse.json(
      { error: `cannot edit event in status ${current.status}` },
      { status: 409 }
    );
  }

  const data: any = {};

  if ("title" in body) {
    const t = (body.title ?? "").trim();
    if (!t) return NextResponse.json({ error: "title is required" }, { status: 400 });
    data.title = t;
  }

  if ("place" in body) {
    const p = body.place;
    data.place = p === null ? null : String(p ?? "").trim() || null;
  }

  let nextStart = current.startAt;
  let nextEnd = current.endAt;

  if ("startAt" in body) {
    if (!body.startAt) {
      return NextResponse.json({ error: "startAt is required" }, { status: 400 });
    }
    const d = new Date(body.startAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "startAt is invalid" }, { status: 400 });
    }
    nextStart = d;
    data.startAt = d;
  }

  if ("endAt" in body) {
    const endAt = body.endAt;

    if (endAt === null || endAt === "" || endAt === undefined) {
      nextEnd = null;
      data.endAt = null;
    } else {
      const d = new Date(endAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "endAt is invalid" }, { status: 400 });
      }
      nextEnd = d;
      data.endAt = d;
    }
  }

  // валидация start/end после вычисления
  if (nextEnd && nextEnd.getTime() <= nextStart.getTime()) {
    return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const updated = await prisma.event.update({ where: { id }, data });

  return NextResponse.json({
    item: {
      id: updated.id,
      title: updated.title,
      place: updated.place,
      startAt: updated.startAt.toISOString(),
      endAt: updated.endAt ? updated.endAt.toISOString() : null,
      status: updated.status,
    },
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const current = await prisma.event.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
