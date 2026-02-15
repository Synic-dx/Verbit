import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import OpenAI from "openai";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { BadReportModel } from "@/models/BadReport";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await connectDb();
  const question = await QuestionModel.findById(id).lean();
  if (!question) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Ask the LLM to analyze what's wrong and produce a short avoidance rule
  const snapshot = JSON.stringify(question, null, 2);
  const analysisResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a question-quality reviewer. A user reported the following question as bad. " +
          "Analyze what is wrong with it (factual errors, ambiguity, wrong answer, poor options, etc). " +
          "Return JSON with two keys: " +
          '"analysis" (2-3 sentence explanation of the problem) and ' +
          '"rule" (a single concise sentence starting with "Do not..." that future question generation should follow to avoid this mistake).',
      },
      { role: "user", content: snapshot },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(
    analysisResponse.choices[0]?.message?.content ?? '{"analysis":"Unknown issue","rule":"Do not generate low-quality questions."}'
  );

  await BadReportModel.create({
    userId: new Types.ObjectId(session.user.id),
    topic: (question as any).topic,
    questionSnapshot: question,
    analysis: parsed.analysis,
    rule: parsed.rule,
    createdAt: new Date(),
  });

  await QuestionModel.findByIdAndDelete(id);

  return NextResponse.json({ ok: true, analysis: parsed.analysis, rule: parsed.rule });
}
