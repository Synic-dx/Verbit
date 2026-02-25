import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { AttemptModel } from "@/models/Attempt";
import { IDEAL_TIME_SECONDS, updateVerScore, verScoreToPercentile, computeCalibrationScore, getCalibrationConfig, updateQuestionDifficulty } from "@/lib/scoring";
import { BadReportModel } from "@/models/BadReport";
import type { Topic } from "@/lib/topics";
import { generateQuestion } from "@/lib/question-generator";

type QuestionRecord = {
  _id: unknown;
  topic: string;
  correctIndex?: number;
  questions?: { correctIndex: number }[];
  pjCorrectOrder?: string;
  pjExplanation?: string;
  difficulty: number;
  attemptCount?: number;
};

const bodySchema = z.object({
  questionId: z.string(),
  topic: z.string(),
  answer: z.any(),
  timeTaken: z.number().min(1),
  skip: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = session.user.isAdmin === true;

  const body = bodySchema.parse(await req.json());
  const topic = body.topic as Topic;

  await connectDb();

  /* ── Skip / unattempted: question is already in ServedQuestion, treat as actual=0, correct=false ── */
  let skipTriggered = body.skip === true;

  const question = (await QuestionModel.findById(body.questionId).lean()) as
    | QuestionRecord
    | null;
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }


  // Check if this question has a bad report (faulty)
  const badReport = await BadReportModel.findOne({ questionId: question._id });

  const aptitude = await UserAptitudeModel.findOneAndUpdate(
    { userId: new Types.ObjectId(session.user.id), topic },
    { $setOnInsert: { verScore: 0, calibrated: false, calibrationAttempts: 0, lastUpdated: new Date() } },
    { upsert: true, new: true }
  );

  const verScore = aptitude?.verScore ?? 0;
  const isCalibrated =
    (aptitude as any).calibrated === true ||
    (aptitude as any).calibrated === undefined;
  const calibrationStep: number = (aptitude as any).calibrationAttempts ?? 0;
  const calConfig = getCalibrationConfig(topic);

  let actual = 0;
  let correct = false;

  if (topic === "Reading Comprehension Sets" || topic === "Conversation Sets") {
    const answers = Array.isArray(body.answer) ? body.answer : [];
    const correctCount =
      question.questions?.reduce(
        (
          count: number,
          item: { correctIndex?: number },
          index: number
        ) => {
          return count + (answers[index] === item.correctIndex ? 1 : 0);
        },
        0
      ) ?? 0;
    actual = correctCount / 6;
    correct = actual >= 0.7;
  } else if (topic === "Parajumbles") {
    const normalized = String(body.answer ?? "")
      .replace(/\s+/g, "")
      .toUpperCase();
    actual = normalized === question.pjCorrectOrder ? 1 : 0;
    correct = actual === 1;
  } else {
    actual = body.answer === question.correctIndex ? 1 : 0;
    correct = actual === 1;
  }

  if (skipTriggered) {
    actual = 0;
    correct = false;
  }

  // If question is faulty, do not update verScore or calibration, return previous state
  if (badReport) {
    const correctIndex = question.correctIndex ?? null;
    const correctIndices = (question.questions ?? []).map(
      (q: { correctIndex?: number }) => q.correctIndex ?? null
    );
    const pjCorrectOrder = question.pjCorrectOrder ?? null;
    return NextResponse.json({
      correct: false,
      faulty: true,
      calibrating: !isCalibrated && calibrationStep < calConfig.total,
      calibrationComplete: isCalibrated,
      calibrationStep,
      calibrationTotal: calConfig.total,
      newVerScore: verScore,
      percentile: verScoreToPercentile(verScore),
      correctIndex,
      correctIndices,
      pjCorrectOrder,
      pjExplanation: question.pjExplanation ?? null,
      error: "This question was found faulty and will not affect your score/calibration."
    });
  }

  /* ── Calibration branch ──────────────────────────────────── */
  if (!isCalibrated && calibrationStep < calConfig.total) {
    const newStep = calibrationStep + 1;
    const idealTimeForDiff = IDEAL_TIME_SECONDS[topic] ?? 60;

    // Record the attempt (verScore stays 0 during calibration)
    await AttemptModel.create({
      userId: new Types.ObjectId(session.user.id),
      topic,
      questionId: question._id,
      correct,
      actual,
      timeTaken: body.timeTaken,
      difficulty: question.difficulty,
      verScoreBefore: 0,
      verScoreAfter: 0,
      percentileAfter: 50,
      createdAt: new Date(),
    });

    // Dynamic question difficulty update (IRT)
    const updatedDiff = updateQuestionDifficulty({
      currentDifficulty: question.difficulty,
      solverVerScore: verScore, // 0 during calibration — still informative
      actual,
      timeTaken: body.timeTaken,
      idealTime: idealTimeForDiff,
      attemptCount: question.attemptCount ?? 0,
    });
    await QuestionModel.updateOne(
      { _id: question._id },
      { $set: { difficulty: updatedDiff }, $inc: { attemptCount: 1 } }
    );

    if (newStep >= calConfig.total) {
      // ── Final calibration question: compute initial verScore ──
      const allAttempts = await AttemptModel.find(
        { userId: new Types.ObjectId(session.user.id), topic },
        { difficulty: 1, actual: 1, timeTaken: 1 }
      )
        .sort({ createdAt: 1 })
        .limit(calConfig.total)
        .lean();

      const idealTime = IDEAL_TIME_SECONDS[topic] ?? 60;
      const calibrationData = allAttempts.map((a: any) => ({
        difficulty: a.difficulty as number,
        actual: a.actual as number,
        timeTaken: a.timeTaken as number | undefined,
        idealTime,
      }));

      const initialVerScore = computeCalibrationScore(calibrationData);
      const percentile = verScoreToPercentile(initialVerScore);

      await UserAptitudeModel.updateOne(
        { userId: new Types.ObjectId(session.user.id), topic },
        {
          $set: {
            verScore: initialVerScore,
            calibrated: true,
            calibrationAttempts: newStep,
            lastUpdated: new Date(),
          },
        }
      );

      // Fire-and-forget: pre-generate a question at the new level
      void (async () => {
        try {
          const generated = await generateQuestion(topic, initialVerScore);
          await QuestionModel.create({
            topic,
            question: (generated as any).question,
            options: (generated as any).options,
            correctIndex: (generated as any).correctIndex,
            explanation: (generated as any).explanation,
            passage: (generated as any).passage,
            passageTitle: (generated as any).passageTitle,
            questions: (generated as any).questions,
            pjSentences: (generated as any).pjSentences,
            pjCorrectOrder: (generated as any).pjCorrectOrder,
            pjExplanation: (generated as any).pjExplanation,
            difficulty: generated.difficulty,
          });
        } catch { /* best-effort */ }
      })();

      const correctIndex = question.correctIndex ?? null;
      const correctIndices = (question.questions ?? []).map(
        (q: { correctIndex?: number }) => q.correctIndex ?? null
      );
      const pjCorrectOrder = question.pjCorrectOrder ?? null;

      return NextResponse.json({
        correct,
        calibrating: false,
        calibrationComplete: true,
        calibrationStep: newStep,
        calibrationTotal: calConfig.total,
        newVerScore: initialVerScore,
        percentile,
        correctIndex,
        correctIndices,
        pjCorrectOrder,
        pjExplanation: question.pjExplanation ?? null,
      });
    }

    // Still calibrating — not the last question
    await UserAptitudeModel.updateOne(
      { userId: new Types.ObjectId(session.user.id), topic },
      { $set: { calibrationAttempts: newStep, lastUpdated: new Date() } }
    );

    const correctIndex = question.correctIndex ?? null;
    const correctIndices = (question.questions ?? []).map(
      (q: { correctIndex?: number }) => q.correctIndex ?? null
    );
    const pjCorrectOrder = question.pjCorrectOrder ?? null;

    return NextResponse.json({
      correct,
      calibrating: true,
      calibrationComplete: false,
      calibrationStep: newStep,
      calibrationTotal: calConfig.total,
      newVerScore: 0,
      percentile: 50,
      correctIndex,
      correctIndices,
      pjCorrectOrder,
      pjExplanation: question.pjExplanation ?? null,
    });
  }

  /* ── Normal (post-calibration) scoring ───────────────────── */
  const idealTime = IDEAL_TIME_SECONDS[topic] ?? 60;
  const updated = updateVerScore({
    verScore,
    difficulty: question.difficulty,
    actual,
    timeTaken: body.timeTaken,
    idealTime,
  });

  const newVerScore = updated.next;
  const percentile = verScoreToPercentile(newVerScore);

  await UserAptitudeModel.updateOne(
    { userId: new Types.ObjectId(session.user.id), topic },
    { $set: { verScore: newVerScore, lastUpdated: new Date() } },
    { upsert: true }
  );

  await AttemptModel.create({
    userId: new Types.ObjectId(session.user.id),
    topic,
    questionId: question._id,
    correct,
    actual,
    timeTaken: body.timeTaken,
    difficulty: question.difficulty,
    verScoreBefore: verScore,
    verScoreAfter: newVerScore,
    percentileAfter: percentile,
    createdAt: new Date(),
  });

  // Dynamic question difficulty update (IRT)
  if (!isAdmin) {
    const updatedDiffNormal = updateQuestionDifficulty({
      currentDifficulty: question.difficulty,
      solverVerScore: verScore,
      actual,
      timeTaken: body.timeTaken,
      idealTime,
      attemptCount: question.attemptCount ?? 0,
    });
    await QuestionModel.updateOne(
      { _id: question._id },
      { $set: { difficulty: updatedDiffNormal }, $inc: { attemptCount: 1 } }
    );
  } else {
    // Admin attempts: only increment attemptCount, do not change difficulty
    await QuestionModel.updateOne(
      { _id: question._id },
      { $inc: { attemptCount: 1 } }
    );
  }

  void (async () => {
    try {
      const generated = await generateQuestion(topic, newVerScore);
      await QuestionModel.create({
        topic,
        question: (generated as any).question,
        options: (generated as any).options,
        correctIndex: (generated as any).correctIndex,
        explanation: (generated as any).explanation,
        passage: (generated as any).passage,
        passageTitle: (generated as any).passageTitle,
        questions: (generated as any).questions,
        pjSentences: (generated as any).pjSentences,
        pjCorrectOrder: (generated as any).pjCorrectOrder,
        pjExplanation: (generated as any).pjExplanation,
        difficulty: generated.difficulty,
      });
    } catch {
      // Best-effort background generation.
    }
  })();

  // Return correct-answer data so the client can highlight answers
  const correctIndex = question.correctIndex ?? null;
  const correctIndices = (question.questions ?? []).map(
    (q: { correctIndex?: number }) => q.correctIndex ?? null
  );
  const pjCorrectOrder = question.pjCorrectOrder ?? null;

  return NextResponse.json({
    correct,
    calibrating: false,
    calibrationComplete: false,
    calibrationStep: calConfig.total,
    calibrationTotal: calConfig.total,
    newVerScore,
    percentile,
    correctIndex,
    correctIndices,
    pjCorrectOrder,
    pjExplanation: question.pjExplanation ?? null,
  });
}
