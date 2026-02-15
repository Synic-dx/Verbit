import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { SuggestionModel } from "@/models/Suggestion";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDb();

  const suggestions = await SuggestionModel.find()
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return NextResponse.json({
    suggestions: suggestions.map((s: any) => ({
      id: String(s._id),
      userName: s.userName,
      userEmail: s.userEmail,
      message: s.message,
      createdAt: s.createdAt?.toISOString?.() ?? s.createdAt,
    })),
  });
}
