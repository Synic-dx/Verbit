import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { AttemptModel } from "@/models/Attempt";
import { verScoreToPercentile } from "@/lib/scoring";

const DEFAULT_RANGE_DAYS = 30;

function parseDate(value: string | null, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const topic = searchParams.get("topic") ?? "";
  if (!topic) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const endDate = parseDate(endParam, true) ?? new Date();
  const startDate =
    parseDate(startParam) ??
    new Date(endDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

  await connectDb();

  const attempts = await AttemptModel.find({
    userId: session.user.id,
    topic,
    createdAt: { $gte: startDate, $lte: endDate },
  })
    .sort({ createdAt: 1 })
    .lean();

  const total = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;
  const accuracy = total ? Math.round((correct / total) * 1000) / 10 : 0;
  const avgTime = total
    ? Math.round(
        (attempts.reduce((sum, a) => sum + (a.timeTaken ?? 0), 0) / total) *
          10
      ) / 10
    : 0;

  const lastAttempt = attempts[attempts.length - 1] ?? null;
  const lastVerScore = lastAttempt?.verScoreAfter ?? 0;
  const lastPercentile = lastAttempt?.percentileAfter ?? verScoreToPercentile(lastVerScore);

  return NextResponse.json({
    summary: {
      total,
      correct,
      accuracy,
      avgTime,
      lastVerScore,
      lastPercentile,
    },
    attempts: attempts.map((attempt) => ({
      id: String(attempt._id),
      createdAt: attempt.createdAt,
      verScore: attempt.verScoreAfter,
      percentile: attempt.percentileAfter,
      correct: attempt.correct,
      timeTaken: attempt.timeTaken,
      difficulty: attempt.difficulty,
    })),
  });
}
