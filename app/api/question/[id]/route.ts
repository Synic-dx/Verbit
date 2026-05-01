import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import OpenAI from "openai";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { BadReportModel } from "@/models/BadReport";
import { invalidateBadPatternCache } from "@/lib/rag";

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

  // ── Fast path: repeated/duplicate ────────────────────────────────────────
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
    invalidateBadPatternCache();
    await QuestionModel.findByIdAndDelete(id);
    return NextResponse.json({
      ok: true,
      valid: false,
      analysis: "Removed — reported as a repeated question.",
      rule: "Do not regenerate questions that are too similar to previously served ones.",
    });
  }

  // ── AI evaluation (gpt-4.1 — stronger than mini, still cost-efficient) ──
  const snapshot = JSON.stringify(question, null, 2);
  const userHint = reason
    ? `\n\nThe user's stated reason for reporting: "${reason}". Consider this hint carefully when evaluating.`
    : "";

  const analysisResponse = await openai.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are a senior verbal aptitude exam reviewer. A user has flagged a CAT/IPMAT question as faulty. " +
          "Evaluate it STRICTLY and OBJECTIVELY. Set isValid=false if ANY of the following are true: " +
          "(1) the marked correct answer is wrong or misleading; " +
          "(2) more than one option is a plausible correct answer; " +
          "(3) two or more options are identical or near-identical; " +
          "(4) the question text is missing context, contains a blank where the target word/idiom should be, or is just an instruction without the actual sentence; " +
          "(5) the explanation contradicts the correct answer or is factually wrong; " +
          "(6) for Vocabulary Usage Incorrect-Usage questions: the option marked incorrect is actually correct (e.g. it uses an idiom, metaphor, or extended sense that is valid per standard dictionaries); " +
          "(7) for Sentence Completion: the sentence with blanks is absent from the question field; " +
          "(8) for Parajumbles: the stated correct order is logically indefensible; " +
          "(9) for Sentence Correction: the 'correct' option does not actually fix the identified error, or options are not all distinct. " +
          "If none of the above apply, set isValid=true. " +
          "Return JSON ONLY: { isValid: bool, analysis: string (2-3 sentences explaining the verdict), rule: string (if isValid=false: a 'Do not...' instruction for future generation; if isValid=true: empty string) }.",
      },
      { role: "user", content: snapshot + userHint },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(
    analysisResponse.choices[0]?.message?.content ??
      '{"isValid":false,"analysis":"Unknown issue","rule":"Do not generate low-quality questions."}'
  );

  const isValid = parsed.isValid === true;

  if (isValid) {
    return NextResponse.json({ ok: true, valid: true, analysis: parsed.analysis });
  }

  // Question is genuinely bad — save report, invalidate RAG cache, delete question
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

  // Immediately invalidate the bad-pattern cache so the new rule is picked
  // up by the very next question generation for this topic (no 20-min lag).
  invalidateBadPatternCache();

  await QuestionModel.findByIdAndDelete(id);

  return NextResponse.json({ ok: true, valid: false, analysis: parsed.analysis, rule: parsed.rule });
}
