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

  // Parse optional reason from request body
  let reason = "";
  try {
    const body = await _req.json();
    reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  } catch { /* no body is fine */ }

  await connectDb();
  const question = await QuestionModel.findById(id).lean();
  if (!question) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Fast path: if user says it's a repeated question, delete immediately ──
  const isRepeated = /repeat|duplicate|same q|already (seen|done|answered)/i.test(reason);
  if (isRepeated) {
    await BadReportModel.create({
      userId: new Types.ObjectId(session.user.id),
      userEmail: session.user.email ?? "",
      userName: session.user.name ?? "",
      topic: (question as any).topic,
      questionSnapshot: question,
      analysis: "User reported this as a repeated/duplicate question.",
      rule: "Do not regenerate questions that are too similar to previously served ones.",
      createdAt: new Date(),
      questionId: question._id,
    });
    await QuestionModel.findByIdAndDelete(id);
    return NextResponse.json({
      ok: true,
      valid: false,
      analysis: "Removed — reported as a repeated question.",
      rule: "Do not regenerate questions that are too similar to previously served ones.",
    });
  }

  // ── AI evaluation with user's reason as a hint ──
  const snapshot = JSON.stringify(question, null, 2);
  const userHint = reason
    ? `\n\nThe user's stated reason for reporting: "${reason}". Consider this hint carefully when evaluating.`
    : "";

  const analysisResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You review flagged exam questions. OBJECTIVELY set isValid false if any: wrong/misleading answer, >1 plausible answer, duplicate options, missing stem/context, placeholder/missing options, illogical/contradictory answer, misleading explanation, unclear/incomplete/missing instructions, illogical sequence (parajumbles), no clear fix (correction), or grammatically wrong correct answer. Else, set isValid true. Return JSON: isValid (bool), analysis (2-3 sentences: why valid/invalid), rule (if false: 'Do not...'; if true: empty).",
      },
      { role: "user", content: snapshot + userHint },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(
    analysisResponse.choices[0]?.message?.content ?? '{"isValid":false,"analysis":"Unknown issue","rule":"Do not generate low-quality questions."}'
  );

  const isValid = parsed.isValid === true;

  if (isValid) {
    // Question is fine — don't delete, don't save rule
    return NextResponse.json({
      ok: true,
      valid: true,
      analysis: parsed.analysis,
    });
  }

  // Save bad report with questionId for direct lookup
  await BadReportModel.create({
    userId: new Types.ObjectId(session.user.id),
    userEmail: session.user.email ?? "",
    userName: session.user.name ?? "",
    topic: (question as any).topic,
    questionSnapshot: question,
    analysis: parsed.analysis,
    rule: parsed.rule,
    createdAt: new Date(),
    questionId: question._id,
  });

  // Question is genuinely bad — save report, create avoidance rule, delete question
  await BadReportModel.create({
    userId: new Types.ObjectId(session.user.id),
    userEmail: session.user.email ?? "",
    userName: session.user.name ?? "",
    topic: (question as any).topic,
    questionSnapshot: question,
    analysis: parsed.analysis,
    rule: parsed.rule,
    createdAt: new Date(),
  });

  await QuestionModel.findByIdAndDelete(id);

  return NextResponse.json({ ok: true, valid: false, analysis: parsed.analysis, rule: parsed.rule });
}
