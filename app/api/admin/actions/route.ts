import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { AttemptModel } from "@/models/Attempt";
import { QuestionModel } from "@/models/Question";
import { ServedQuestionModel } from "@/models/ServedQuestion";
import { BadReportModel } from "@/models/BadReport";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  await connectDb();
  const caller = (await UserModel.findById(session.user.id).lean()) as any;
  if (!caller?.isAdmin) return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body as { action: string };

  /* ── Delete a user and ALL their data ──────────────────── */
  if (action === "deleteUser") {
    const { userId } = body as { userId: string };
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // Prevent self-deletion
    if (userId === session?.user?.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    const oid = new Types.ObjectId(userId);

    const [userDel, aptDel, attDel, servedDel] = await Promise.all([
      UserModel.deleteOne({ _id: oid }),
      UserAptitudeModel.deleteMany({ userId: oid }),
      AttemptModel.deleteMany({ userId: oid }),
      ServedQuestionModel.deleteMany({ userId: oid }),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: {
        user: userDel.deletedCount,
        aptitudes: aptDel.deletedCount,
        attempts: attDel.deletedCount,
        served: servedDel.deletedCount,
      },
    });
  }

  /* ── Reset question bank (per topic or all) ────────────── */
  if (action === "resetQuestions") {
    const { topic } = body as { topic?: string };
    const filter = topic && topic !== "all" ? { topic } : {};

    const [qDel, sDel] = await Promise.all([
      QuestionModel.deleteMany(filter),
      ServedQuestionModel.deleteMany(filter),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: {
        questions: qDel.deletedCount,
        served: sDel.deletedCount,
      },
    });
  }

  /* ── Reset a user's scores (per topic or all) ──────────── */
  if (action === "resetUserScores") {
    const { userId, topic } = body as { userId: string; topic?: string };
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const oid = new Types.ObjectId(userId);
    const filter: any = { userId: oid };
    if (topic && topic !== "all") filter.topic = topic;

    const [aptDel, attDel, servedDel] = await Promise.all([
      UserAptitudeModel.deleteMany(filter),
      AttemptModel.deleteMany(filter),
      ServedQuestionModel.deleteMany(filter),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: {
        aptitudes: aptDel.deletedCount,
        attempts: attDel.deletedCount,
        served: servedDel.deletedCount,
      },
    });
  }

  /* ── Delete a bad report ───────────────────────────────── */
  if (action === "deleteReport") {
    const { reportId } = body as { reportId: string };
    if (!reportId) {
      return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
    }

    const del = await BadReportModel.deleteOne({
      _id: new Types.ObjectId(reportId),
    });

    return NextResponse.json({ ok: true, deleted: del.deletedCount });
  }

  /* ── Clear ALL bad reports (per topic or all) ──────────── */
  if (action === "clearReports") {
    const { topic } = body as { topic?: string };
    const filter = topic && topic !== "all" ? { topic } : {};
    const del = await BadReportModel.deleteMany(filter);

    return NextResponse.json({ ok: true, deleted: del.deletedCount });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
