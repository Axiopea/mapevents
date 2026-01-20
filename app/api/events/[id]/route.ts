import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type PatchBody = {
  status: "approved" | "rejected";
};

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  const nextStatus = body?.status;

  if (nextStatus !== "approved" && nextStatus !== "rejected") {
    return NextResponse.json(
      { error: "status must be approved or rejected" },
      { status: 400 }
    );
  }

  const current = await prisma.event.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (current.status !== "draft" && current.status !== "pending") {
    return NextResponse.json(
      { error: `cannot change status from ${current.status}` },
      { status: 409 }
    );
  }

  const updated = await prisma.event.update({
    where: { id },
    data: { status: nextStatus },
  });

  return NextResponse.json({ item: { id: updated.id, status: updated.status } });
}
