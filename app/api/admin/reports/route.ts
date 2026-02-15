import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";
import { BadReportModel } from "@/models/BadReport";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDb();

  const caller = await UserModel.findById(session.user.id).lean() as any;
  if (!caller?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reports = await BadReportModel.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const formatted = (reports as any[]).map((r) => ({
    id: String(r._id),
    topic: r.topic,
    userEmail: r.userEmail ?? "—",
    userName: r.userName ?? "—",
    analysis: r.analysis,
    rule: r.rule,
    question: r.questionSnapshot?.question ?? r.questionSnapshot?.passageTitle ?? "—",
    snapshot: r.questionSnapshot,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ reports: formatted });
}
