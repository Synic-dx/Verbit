import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { AttemptModel } from "@/models/Attempt";
import { IDEAL_TIME_SECONDS, updateVerScore, verScoreToPercentile } from "@/lib/scoring";
import type { Topic } from "@/lib/topics";
import { generateQuestion } from "@/lib/question-generator";

type QuestionRecord = {
  _id: unknown;
  topic: string;
  correctIndex?: number;
  questions?: { correctIndex: number }[];
  pjCorrectOrder?: string;
  difficulty: number;
};

const bodySchema = z.object({
  questionId: z.string(),
  topic: z.string(),
  answer: z.any(),
  timeTaken: z.number().min(1),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = bodySchema.parse(await req.json());
  const topic = body.topic as Topic;

  await connectDb();
  const question = (await QuestionModel.findById(body.questionId).lean()) as
    | QuestionRecord
    | null;
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const aptitude = await UserAptitudeModel.findOneAndUpdate(
    { userId: session.user.id, topic },
    { $setOnInsert: { verScore: 0, lastUpdated: new Date() } },
    { upsert: true, new: true }
  );

  const verScore = aptitude?.verScore ?? 0;
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
    { userId: session.user.id, topic },
    { $set: { verScore: newVerScore, lastUpdated: new Date() } },
    { upsert: true }
  );

  await AttemptModel.create({
    userId: session.user.id,
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
        difficulty: generated.difficulty,
      });
    } catch {
      // Best-effort background generation.
    }
  })();

  return NextResponse.json({
    correct,
    newVerScore,
    percentile,
  });
}
