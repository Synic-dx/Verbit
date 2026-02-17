import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

let ANNOUNCEMENTS: { message: string; time: string }[] = [];

export async function GET() {
  // In production, fetch from DB. For now, use in-memory.
  return NextResponse.json({ announcements: ANNOUNCEMENTS.slice(0, 3) });
}

export async function POST(req: Request) {
  // Only allow admin
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await connectDb();
  const user = await UserModel.findById(session.user.id).lean();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message } = await req.json();
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  ANNOUNCEMENTS.unshift({ message: message.trim(), time: new Date().toISOString() });
  ANNOUNCEMENTS = ANNOUNCEMENTS.slice(0, 10); // keep last 10
  return NextResponse.json({ ok: true });
}
