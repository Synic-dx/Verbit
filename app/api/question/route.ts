import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { generateQuestion } from "@/lib/question-generator";
import { percentileToVerScore, verScoreToPercentile } from "@/lib/scoring";
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

  const aptitude = await UserAptitudeModel.findOneAndUpdate(
    { userId: session.user.id, topic },
    { $setOnInsert: { verScore: 0, lastUpdated: new Date() } },
    { upsert: true, new: true }
  ).lean();

  const verScore = aptitude?.verScore ?? 0;
  const userPercentile = verScoreToPercentile(verScore);
  const band = 6;
  const lower = percentileToVerScore(userPercentile - band);
  const upper = percentileToVerScore(userPercentile + band);

  let question = (await QuestionModel.findOne({
    topic,
    difficulty: { $gte: lower, $lte: upper },
  }).lean()) as QuestionRecord | null;

  if (!question) {
    const generated = await generateQuestion(topic, verScore);
    question = (await QuestionModel.create({
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
      difficulty: generated.difficulty,
    })) as QuestionRecord;
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
  });
}
