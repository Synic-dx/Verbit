import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { AttemptModel } from "@/models/Attempt";
import { ServedQuestionModel } from "@/models/ServedQuestion";
import { generateQuestion } from "@/lib/question-generator";
import {
  percentileToVerScore,
  verScoreToPercentile,
  CALIBRATION_DIFFICULTIES,
  CALIBRATION_TOTAL,
} from "@/lib/scoring";
import type { Topic } from "@/lib/topics";

type QuestionRecord = {
  _id: unknown;
  topic: string;
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  passage?: string;
  passageTitle?: string;
  questions?: {
    text: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }[];
  pjSentences?: string[];
  pjCorrectOrder?: string;
  difficulty: number;
};

/** Helper to persist a generated question to the DB. */
async function saveGenerated(generated: Awaited<ReturnType<typeof generateQuestion>>) {
  return QuestionModel.create({
    topic: (generated as any).topic,
    question: (generated as any).question,
    options: (generated as any).options,
    correctIndex: (generated as any).correctIndex,
    explanation: (generated as any).explanation,
    passage: (generated as any).passage,
    passageTitle: (generated as any).passageTitle,
    questions: (generated as any).questions,
    pjSentences: (generated as any).pjSentences,
    pjCorrectOrder: (generated as any).pjCorrectOrder,
    difficulty: generated.difficulty,
  });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const topic = searchParams.get("topic") as Topic | null;
  if (!topic) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }

  await connectDb();

  const userId = new Types.ObjectId(session.user.id);

  const aptitude = await UserAptitudeModel.findOneAndUpdate(
    { userId, topic },
    { $setOnInsert: { verScore: 0, calibrated: false, calibrationAttempts: 0, lastUpdated: new Date() } },
    { upsert: true, new: true }
  ).lean();

  // Determine if user is still in calibration phase.
  // Existing users without the `calibrated` field are treated as already calibrated.
  const isCalibrated =
    (aptitude as any).calibrated === true ||
    (aptitude as any).calibrated === undefined;
  const calibrationStep: number = (aptitude as any).calibrationAttempts ?? 0;

  let targetDifficulty: number;
  let lower: number;
  let upper: number;

  if (!isCalibrated && calibrationStep < CALIBRATION_TOTAL) {
    // Calibration: use the next predetermined difficulty
    targetDifficulty = CALIBRATION_DIFFICULTIES[calibrationStep];
    const band = 5;
    lower = Math.max(0, targetDifficulty - band);
    upper = Math.min(100, targetDifficulty + band);
  } else {
    // Normal adaptive flow
    const verScore = aptitude?.verScore ?? 0;
    const userPercentile = verScoreToPercentile(verScore);
    const band = 6;
    lower = percentileToVerScore(userPercentile - band);
    upper = percentileToVerScore(userPercentile + band);
    targetDifficulty = verScore;
  }

  // ── Strict exclusion: collect ALL question IDs ever served OR attempted ──
  const [servedDocs, attemptedDocs] = await Promise.all([
    ServedQuestionModel.find({ userId, topic }, { questionId: 1 }).lean(),
    AttemptModel.find({ userId, topic }, { questionId: 1 }).lean(),
  ]);

  const seenSet = new Set<string>();
  for (const doc of servedDocs) {
    seenSet.add(String((doc as any).questionId));
  }
  for (const doc of attemptedDocs) {
    seenSet.add(String((doc as any).questionId));
  }
  const excludedIds = [...seenSet].map((id) => new Types.ObjectId(id));

  // Pick a random unseen question in the difficulty band
  const matchFilter: Record<string, unknown> = {
    topic,
    difficulty: { $gte: lower, $lte: upper },
  };
  if (excludedIds.length > 0) {
    matchFilter._id = { $nin: excludedIds };
  }

  const candidates = await QuestionModel.aggregate<QuestionRecord>([
    { $match: matchFilter },
    { $sample: { size: 1 } },
  ]);

  let question: QuestionRecord | null = candidates[0] ?? null;

  if (!question) {
    // Generate TWO fresh questions, save both, serve the first
    const [gen1, gen2] = await Promise.all([
      generateQuestion(topic, targetDifficulty),
      generateQuestion(topic, targetDifficulty),
    ]);

    const [saved1] = await Promise.all([
      saveGenerated(gen1),
      saveGenerated(gen2),
    ]);

    question = saved1 as unknown as QuestionRecord;
  }

  // ── Record that this question has been served (prevents re-serving) ──
  const questionId = question._id instanceof Types.ObjectId
    ? question._id
    : new Types.ObjectId(String(question._id));

  await ServedQuestionModel.updateOne(
    { userId, topic, questionId },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );

  const safeQuestions = (question?.questions ?? []).map((item) => ({
    text: item.text,
    options: item.options,
    explanation: item.explanation,
  }));

  return NextResponse.json({
    id: String(question._id),
    topic: question.topic,
    question: question.question,
    options: question.options,
    explanation: question.explanation,
    passage: question.passage,
    passageTitle: question.passageTitle,
    questions: safeQuestions,
    pjSentences: question.pjSentences,
    difficulty: question.difficulty,
    calibrating: !isCalibrated && calibrationStep < CALIBRATION_TOTAL,
    calibrationStep: calibrationStep,
    calibrationTotal: CALIBRATION_TOTAL,
  });
}
