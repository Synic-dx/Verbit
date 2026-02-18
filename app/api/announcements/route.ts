import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";
import { AnnouncementModel } from "@/models/Announcement";

export async function GET() {
  await connectDb();
  // Fetch latest 10 announcements from DB, newest first
  const announcements = await AnnouncementModel.find({})
    .sort({ time: -1 })
    .limit(10)
    .lean();
  // Format time as ISO string for compatibility
  const formatted = announcements.map((a) => ({
    message: a.message,
    time: a.time instanceof Date ? a.time.toISOString() : String(a.time),
  }));
  return NextResponse.json({ announcements: formatted });
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
  // Save to DB, keep only last 10
  await AnnouncementModel.create({ message: message.trim() });
  // Optionally, delete older announcements (keep only 10)
  const all = await AnnouncementModel.find({}).sort({ time: -1 });
  if (all.length > 10) {
    const toDelete = all.slice(10);
    const ids = toDelete.map((a) => a._id);
    await AnnouncementModel.deleteMany({ _id: { $in: ids } });
  }
  return NextResponse.json({ ok: true });
}
