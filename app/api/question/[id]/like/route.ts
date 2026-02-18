import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { QuestionModel } from "@/models/Question";
import { Types } from "mongoose";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  // Prevent duplicate likes by same user
  if (question.likedBy?.some((uid: any) => uid.equals?.(session.user?.id))) {
    return NextResponse.json({ error: "Already liked" }, { status: 400 });
  }
  // Remove dislike if user had disliked
  if (question.dislikedBy?.some((uid: any) => uid.equals?.(session.user?.id))) {
    question.dislikedBy = question.dislikedBy.filter((uid: any) => !uid.equals?.(session.user?.id));
    question.dislikes = (question.dislikes || 1) - 1;
  }
  question.likes = (question.likes || 0) + 1;
  question.likedBy = question.likedBy || [];
  question.likedBy.push(new Types.ObjectId(session.user.id));
  await question.save();
  return NextResponse.json({ ok: true });
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
  // Remove like by user
  if (question.likedBy?.some((uid: any) => uid.equals?.(session.user?.id))) {
    question.likedBy = question.likedBy.filter((uid: any) => !uid.equals?.(session.user?.id));
    question.likes = (question.likes || 1) - 1;
    await question.save();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Not liked yet" }, { status: 400 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ liked: false, likes: 0 });
  }
  const { id } = await params;
  await connectDb();
  const question = await QuestionModel.findById(id).lean();
  if (!question) return NextResponse.json({ liked: false, netLikes: 0 });
  const liked = Array.isArray(question.likedBy) && question.likedBy.some((uid: any) => uid?.toString() === session.user?.id);
  const netLikes = (question.likes || 0) - (question.dislikes || 0);
  return NextResponse.json({ liked, netLikes });
}
