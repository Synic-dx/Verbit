import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { AttemptModel } from "@/models/Attempt";
import { ServedQuestionModel } from "@/models/ServedQuestion";
import { UserModel } from "@/models/User";
import { generateQuestion } from "@/lib/question-generator";
import {
  percentileToVerScore,
  verScoreToPercentile,
  getCalibrationConfig,
} from "@/lib/scoring";
import type { Topic } from "@/lib/topics";

// ── Daily limits per tier ────────────────────────────────────────────────────
const LIMITS = {
  free:    { rc: 1,  convo: 1,  pj: 3,  normal: 20 },
  pro:     { rc: 5,  convo: 5,  pj: 20, normal: 30 },
  cracker: { rc: 8,  convo: 8,  pj: 30, normal: Infinity },
} as const;

type Tier = keyof typeof LIMITS;

function getUserTier(sub: any): Tier {
  if (
    sub?.status === "active" &&
    sub.currentPeriodEnd &&
    new Date(sub.currentPeriodEnd) > new Date()
  ) {
    return sub.tier === "cracker" ? "cracker" : "pro";
  }
  return "free";
}

function getLimitForTopic(tier: Tier, topic: Topic): number {
  if (topic === "Reading Comprehension Sets") return LIMITS[tier].rc;
  if (topic === "Conversation Sets")          return LIMITS[tier].convo;
  if (topic === "Parajumbles")                return LIMITS[tier].pj;
  return LIMITS[tier].normal;
}

/** Get the start of today in IST (UTC+5:30). */
function getTodayStartIST(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istMidnight = new Date(istNow);
  istMidnight.setUTCHours(0, 0, 0, 0);
  return new Date(istMidnight.getTime() - istOffset);
}

/** Extract the target word or idiom from a question's text for dedup. */
function extractTargetWord(questionText: string, topic: string): string | null {
  if (!questionText) return null;
  if (topic === "Idioms & Phrases") {
    const meaningMatch = questionText.match(/idiom\/phrase[:\s]+['"]?([^'"?]+?)['"]?\s*\?/i);
    if (meaningMatch) return meaningMatch[1].trim().toLowerCase();
    const usageMatch = questionText.match(/idiom\/phrase[:\s]+['"]?([^'"?]+?)['"]?\s+used/i);
    if (usageMatch) return usageMatch[1].trim().toLowerCase();
    const quoted = questionText.match(/['""''"]([^'"]+)['""''"]/);
    if (quoted) return quoted[1].trim().toLowerCase();
  }
  if (topic === "Vocabulary Usage") {
    const wordMatch = questionText.match(/the word[:\s]+['"]?([a-zA-Z]+)['"]?/i);
    if (wordMatch) return wordMatch[1].trim().toLowerCase();
  }
  return null;
}

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
  pjExplanation?: string;
  difficulty: number;
};

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
    pjExplanation: (generated as any).pjExplanation,
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
  const isAdmin = session.user.isAdmin === true;

  // ── Fetch user tier ──────────────────────────────────────────────────────
  const dbUser = await UserModel.findById(session.user.id, { subscription: 1 }).lean() as any;
  const tier: Tier = isAdmin ? "cracker" : getUserTier(dbUser?.subscription);

  // ── Daily limit check ─────────────────────────────────────────────────────
  const dailyLimit = getLimitForTopic(tier, topic);

  if (dailyLimit !== Infinity && !isAdmin) {
    const todayStart = getTodayStartIST();
    const todayCount = await ServedQuestionModel.countDocuments({
      userId,
      topic,
      createdAt: { $gte: todayStart },
    });

    if (todayCount >= dailyLimit) {
      const upgradeRequired = tier === "free";
      return NextResponse.json(
        {
          error: "daily_limit",
          message: `You have exhausted your daily limit of ${dailyLimit} ${topic}. ${
            upgradeRequired
              ? "Upgrade to Pro for more."
              : "Limit resets at 12:00 AM IST."
          }`,
          used: todayCount,
          limit: dailyLimit,
          tier,
          upgradeRequired,
        },
        { status: 429 }
      );
    }
  }

  const aptitude = await UserAptitudeModel.findOneAndUpdate(
    { userId, topic },
    { $setOnInsert: { verScore: 0, calibrated: false, calibrationAttempts: 0, lastUpdated: new Date() } },
    { upsert: true, new: true }
  ).lean();

  const isCalibrated =
    (aptitude as any).calibrated === true ||
    (aptitude as any).calibrated === undefined;
  const calibrationStep: number = (aptitude as any).calibrationAttempts ?? 0;

  const calConfig = getCalibrationConfig(topic);

  let targetDifficulty: number;
  let lower: number;
  let upper: number;

  if (!isCalibrated && calibrationStep < calConfig.total) {
    targetDifficulty = calConfig.difficulties[calibrationStep];
    const band = 5;
    lower = Math.max(0, targetDifficulty - band);
    upper = Math.min(100, targetDifficulty + band);
  } else {
    const verScore = aptitude?.verScore ?? 0;
    const userPercentile = verScoreToPercentile(verScore);
    const band = 10;
    lower = percentileToVerScore(userPercentile - band);
    upper = percentileToVerScore(userPercentile + band);
    targetDifficulty = verScore;
  }

  const [servedDocs, attemptedDocs] = await Promise.all([
    ServedQuestionModel.find({ userId, topic }, { questionId: 1 }).lean(),
    AttemptModel.find({ userId, topic }, { questionId: 1 }).lean(),
  ]);

  const seenSet = new Set<string>();
  for (const doc of servedDocs) seenSet.add(String((doc as any).questionId));
  for (const doc of attemptedDocs) seenSet.add(String((doc as any).questionId));
  const excludedIds = [...seenSet].map((id) => new Types.ObjectId(id));

  const matchFilter: Record<string, unknown> = {
    topic,
    difficulty: { $gte: lower, $lte: upper },
  };
  if (excludedIds.length > 0) matchFilter._id = { $nin: excludedIds };

  let avoidWords: string[] = [];
  if (topic === "Vocabulary Usage" || topic === "Idioms & Phrases") {
    if (excludedIds.length > 0) {
      const pastQs = await QuestionModel.find(
        { _id: { $in: excludedIds }, topic },
        { question: 1 }
      ).lean();
      avoidWords = pastQs
        .map((q: any) => extractTargetWord(q.question ?? "", topic))
        .filter((w): w is string => w !== null);
    }
  }

  let avoidPassageTitles: string[] = [];
  if (topic === "Reading Comprehension Sets" || topic === "Conversation Sets") {
    if (excludedIds.length > 0) {
      const pastPassages = await QuestionModel.find(
        { _id: { $in: excludedIds }, topic },
        { passageTitle: 1 }
      ).lean();
      avoidPassageTitles = pastPassages
        .map((q: any) => q.passageTitle as string)
        .filter((t): t is string => !!t);
    }
  }

  let question: QuestionRecord | null = null;
  const isSetTopic = topic === "Reading Comprehension Sets" || topic === "Conversation Sets";

  if (isSetTopic) {
    const candidates = await QuestionModel.aggregate<QuestionRecord>([
      { $match: matchFilter },
      { $sample: { size: 10 } },
    ]);
    for (const c of candidates) {
      const title = (c as any).passageTitle as string | undefined;
      if (!title || !avoidPassageTitles.includes(title)) { question = c; break; }
    }

    if (!question) {
      const widerFilter: Record<string, unknown> = { topic };
      if (excludedIds.length > 0) widerFilter._id = { $nin: excludedIds };
      const widerCandidates = await QuestionModel.aggregate<QuestionRecord>([
        { $match: widerFilter },
        { $sample: { size: 10 } },
      ]);
      for (const c of widerCandidates) {
        const title = (c as any).passageTitle as string | undefined;
        if (!title || !avoidPassageTitles.includes(title)) { question = c; break; }
      }
    }
  } else if (avoidWords.length > 0) {
    const candidates = await QuestionModel.aggregate<QuestionRecord>([
      { $match: matchFilter },
      { $sample: { size: 10 } },
    ]);
    for (const c of candidates) {
      const word = extractTargetWord(c.question ?? "", topic);
      if (!word || !avoidWords.includes(word)) { question = c; break; }
    }
  } else {
    const candidates = await QuestionModel.aggregate<QuestionRecord>([
      { $match: matchFilter },
      { $sample: { size: 1 } },
    ]);
    question = candidates[0] ?? null;
  }

  if (!question) {
    try {
      if (isSetTopic) {
        const gen = await generateQuestion(topic, targetDifficulty, avoidWords, avoidPassageTitles);
        const saved = await saveGenerated(gen);
        question = saved as unknown as QuestionRecord;
      } else {
        const [gen1, gen2] = await Promise.all([
          generateQuestion(topic, targetDifficulty, avoidWords, avoidPassageTitles),
          generateQuestion(topic, targetDifficulty, avoidWords, avoidPassageTitles),
        ]);
        const [saved1] = await Promise.all([saveGenerated(gen1), saveGenerated(gen2)]);
        question = saved1 as unknown as QuestionRecord;
      }
    } catch (genErr) {
      // Question bank exhausted (no unseen match) and AI generation failed.
      // Fall back to a previously attempted question so the user isn't interrupted.
      console.error("[question] generation failed, falling back to a repeat question", genErr);

      const fallbackInBand = await QuestionModel.aggregate<QuestionRecord>([
        { $match: { topic, difficulty: { $gte: lower, $lte: upper } } },
        { $sample: { size: 1 } },
      ]);
      question = fallbackInBand[0] ?? null;

      if (!question) {
        const fallbackAny = await QuestionModel.aggregate<QuestionRecord>([
          { $match: { topic } },
          { $sample: { size: 1 } },
        ]);
        question = fallbackAny[0] ?? null;
      }

      if (!question) {
        // No questions exist for this topic at all yet — nothing to fall back to.
        return NextResponse.json(
          { error: "no_questions_available", message: "No questions are available for this topic yet. Please try again shortly." },
          { status: 503 }
        );
      }
    }
  }

  const questionId = question._id instanceof Types.ObjectId
    ? question._id
    : new Types.ObjectId(String(question._id));

  await ServedQuestionModel.updateOne(
    { userId, topic, questionId },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true }
  );

  await QuestionModel.updateOne({ _id: questionId }, { $inc: { servedTo: 1 } });

  // ── Compute updated daily usage for frontend ─────────────────────────────
  let dailyUsed: number | undefined;
  let dailyLimitOut: number | undefined;
  if (dailyLimit !== Infinity && !isAdmin) {
    const todayStart = getTodayStartIST();
    dailyUsed = await ServedQuestionModel.countDocuments({
      userId,
      topic,
      createdAt: { $gte: todayStart },
    });
    dailyLimitOut = dailyLimit;
  }

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
    pjExplanation: question.pjExplanation,
    calibrating: !isCalibrated && calibrationStep < calConfig.total,
    calibrationStep: calibrationStep,
    calibrationTotal: calConfig.total,
    tier,
    ...(dailyUsed !== undefined && { dailyUsed, dailyLimit: dailyLimitOut }),
  });
}
