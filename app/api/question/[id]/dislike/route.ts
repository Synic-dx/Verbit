import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { Types } from "mongoose";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await connectDb();
  const question = await QuestionModel.findById(id);
  if (!question) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Prevent duplicate dislikes by same user
  if (question.dislikedBy?.some((uid: any) => uid.equals?.(session.user?.id))) {
    return NextResponse.json({ error: "Already disliked" }, { status: 400 });
  }
  let delta = 0;
  // Remove like if user had liked
  if (question.likedBy?.some((uid: any) => uid.equals?.(session.user?.id))) {
    question.likedBy = question.likedBy.filter((uid: any) => !uid.equals?.(session.user?.id));
    question.likes = (question.likes || 0) - 1;
    delta -= 1;
  }
  // Add to dislikedBy and increment dislikes
  if (!question.dislikedBy?.some((uid: any) => uid.equals?.(session.user?.id))) {
    question.dislikedBy = question.dislikedBy || [];
    question.dislikedBy.push(new Types.ObjectId(session.user.id));
    question.dislikes = (question.dislikes || 0) + 1;
    delta -= 1;
  }
  await question.save();
  const netLikes = (question.likes || 0) - (question.dislikes || 0);
  return NextResponse.json({ ok: true, netLikes, delta });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  await connectDb();
  const question = await QuestionModel.findById(id);
  if (!question) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Remove dislike by user
  const userIdStr = session.user.id.toString();
  if (question.dislikedBy?.some((uid: any) => (uid.equals ? uid.equals(userIdStr) : uid.toString() === userIdStr))) {
    question.dislikedBy = question.dislikedBy.filter((uid: any) => (uid.equals ? !uid.equals(userIdStr) : uid.toString() !== userIdStr));
    question.dislikes = (question.dislikes || 1) - 1;
    await question.save();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Not disliked yet" }, { status: 400 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ disliked: false });
  }
  const { id } = await params;
  await connectDb();
  const question = await QuestionModel.findById(id).lean();
  if (!question || !session.user?.id) return NextResponse.json({ disliked: false });
  const disliked = Array.isArray(question.dislikedBy) && question.dislikedBy.some((uid: any) => uid?.toString() === session.user?.id);
  const netLikes = (question.likes || 0) - (question.dislikes || 0);
  return NextResponse.json({ disliked, netLikes });
}
