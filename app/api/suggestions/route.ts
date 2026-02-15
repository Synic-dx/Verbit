import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { SuggestionModel } from "@/models/Suggestion";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const message = String(body.message ?? "").trim();
  if (!message || message.length > 2000) {
    return NextResponse.json(
      { error: "Message is required (max 2000 chars)." },
      { status: 400 }
    );
  }

  await connectDb();

  await SuggestionModel.create({
    userId: new Types.ObjectId(session.user.id),
    userName: session.user.name ?? "",
    userEmail: session.user.email ?? "",
    message,
  });

  return NextResponse.json({ ok: true });
}
