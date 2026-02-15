import { NextResponse } from "next/server";
import { z } from "zod";

import { generateQuestion } from "@/lib/question-generator";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import type { Topic } from "@/lib/topics";

const bodySchema = z.object({
  topic: z.string(),
  difficulty: z.number().min(0).max(100),
});

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  const topic = body.topic as Topic;
  const difficulty = body.difficulty;

  const generated = await generateQuestion(topic, difficulty);

  await connectDb();
  const created = await QuestionModel.create({
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

  return NextResponse.json({
    id: String(created._id),
    ...generated,
  });
}
