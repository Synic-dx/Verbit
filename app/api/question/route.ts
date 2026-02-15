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
  getCalibrationConfig,
} from "@/lib/scoring";
import type { Topic } from "@/lib/topics";

/** Extract the target word or idiom from a question's text for dedup. */
function extractTargetWord(questionText: string, topic: string): string | null {
  if (!questionText) return null;
  if (topic === "Idioms & Phrases") {
    // Format A: "What is the meaning of the idiom/phrase: [IDIOM]?"
    const meaningMatch = questionText.match(/idiom\/phrase[:\s]+['"]?([^'"?]+?)['"]?\s*\?/i);
    if (meaningMatch) return meaningMatch[1].trim().toLowerCase();
    // Format B: "In which sentence is the idiom/phrase used correctly?"
    // The idiom is typically in the options/sentences — extract from question if embedded
    const usageMatch = questionText.match(/idiom\/phrase[:\s]+['"]?([^'"?]+?)['"]?\s+used/i);
    if (usageMatch) return usageMatch[1].trim().toLowerCase();
    // Fallback: look for quoted text
    const quoted = questionText.match(/['“”‘’"]([^'"]+)['“”‘’"]/); 
    if (quoted) return quoted[1].trim().toLowerCase();
  }
  if (topic === "Vocabulary Usage") {
    // Format A: "...contains the word [WORD] used incorrectly..."
    const wordMatch = questionText.match(/the word[:\s]+['"]?([a-zA-Z]+)['"]?/i);
    if (wordMatch) return wordMatch[1].trim().toLowerCase();
    // Format B: fill-in-the-blank — no single target word, skip
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
    pjExplanation: (generated as any).pjExplanation,
    difficulty: generated.difficulty,
  });
}

/** Max RC/Conversation sets per user per day. */
const DAILY_SET_LIMIT = 5;

/** Get the start of today in IST (UTC+5:30). */
function getTodayStartIST(): Date {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istMidnight = new Date(istNow);
  istMidnight.setUTCHours(0, 0, 0, 0);
  // Convert back to UTC
  return new Date(istMidnight.getTime() - istOffset);
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

  // ── Daily limit check for RC / Conversation Sets ──
  const isSetTopic = topic === "Reading Comprehension Sets" || topic === "Conversation Sets";
  if (isSetTopic) {
    const todayStart = getTodayStartIST();
    const todayCount = await ServedQuestionModel.countDocuments({
      userId,
      topic,
      createdAt: { $gte: todayStart },
    });
    if (todayCount >= DAILY_SET_LIMIT) {
      return NextResponse.json(
        { error: "daily_limit", message: `You have exhausted your daily limit of ${DAILY_SET_LIMIT} ${topic} sets. Wait for 12:00 AM IST to attempt more.`, used: todayCount, limit: DAILY_SET_LIMIT },
        { status: 429 }
      );
    }
  }

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

  const calConfig = getCalibrationConfig(topic);

  let targetDifficulty: number;
  let lower: number;
  let upper: number;

  if (!isCalibrated && calibrationStep < calConfig.total) {
    // Calibration: use the next predetermined difficulty
    targetDifficulty = calConfig.difficulties[calibrationStep];
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

  // For Vocab/Idioms, collect past words so we can avoid repeats even from the pool
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

  // For RC/Conversation, collect past passage titles so we avoid repeating the same passage topic
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

  if (topic === "Reading Comprehension Sets" || topic === "Conversation Sets") {
    // RC/Conversation: always prefer existing DB questions to avoid unnecessary generation.
    // Step 1: Try within difficulty band
    const candidates = await QuestionModel.aggregate<QuestionRecord>([
      { $match: matchFilter },
      { $sample: { size: 10 } },
    ]);
    for (const c of candidates) {
      const title = (c as any).passageTitle as string | undefined;
      if (!title || !avoidPassageTitles.includes(title)) {
        question = c;
        break;
      }
    }

    // Step 2: If nothing in-band, try ANY unseen question for this topic (ignore difficulty band)
    if (!question) {
      const widerFilter: Record<string, unknown> = { topic };
      if (excludedIds.length > 0) {
        widerFilter._id = { $nin: excludedIds };
      }
      const widerCandidates = await QuestionModel.aggregate<QuestionRecord>([
        { $match: widerFilter },
        { $sample: { size: 10 } },
      ]);
      for (const c of widerCandidates) {
        const title = (c as any).passageTitle as string | undefined;
        if (!title || !avoidPassageTitles.includes(title)) {
          question = c;
          break;
        }
      }
    }
  } else if (avoidWords.length > 0) {
    // Sample several candidates and pick the first whose word hasn't been used
    const candidates = await QuestionModel.aggregate<QuestionRecord>([
      { $match: matchFilter },
      { $sample: { size: 10 } },
    ]);
    for (const c of candidates) {
      const word = extractTargetWord(c.question ?? "", topic);
      if (!word || !avoidWords.includes(word)) {
        question = c;
        break;
      }
    }
  } else {
    const candidates = await QuestionModel.aggregate<QuestionRecord>([
      { $match: matchFilter },
      { $sample: { size: 1 } },
    ]);
    question = candidates[0] ?? null;
  }

  if (!question) {
    if (isSetTopic) {
      // RC/Conversation: generate only ONE set to conserve tokens
      const gen = await generateQuestion(topic, targetDifficulty, avoidWords, avoidPassageTitles);
      const saved = await saveGenerated(gen);
      question = saved as unknown as QuestionRecord;
    } else {
      // Other topics: generate TWO fresh questions, save both, serve the first
      const [gen1, gen2] = await Promise.all([
        generateQuestion(topic, targetDifficulty, avoidWords, avoidPassageTitles),
        generateQuestion(topic, targetDifficulty, avoidWords, avoidPassageTitles),
      ]);

      const [saved1] = await Promise.all([
        saveGenerated(gen1),
        saveGenerated(gen2),
      ]);

      question = saved1 as unknown as QuestionRecord;
    }
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

  // Compute daily usage for RC/Conversation so frontend can display it
  let dailyUsed: number | undefined;
  let dailyLimit: number | undefined;
  if (isSetTopic) {
    const todayStart = getTodayStartIST();
    // Count after the new served record was inserted
    dailyUsed = await ServedQuestionModel.countDocuments({
      userId,
      topic,
      createdAt: { $gte: todayStart },
    });
    dailyLimit = DAILY_SET_LIMIT;
  }

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
    ...(dailyUsed !== undefined && { dailyUsed, dailyLimit }),
  });
}
