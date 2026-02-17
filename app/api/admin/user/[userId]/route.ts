
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";
import { AttemptModel } from "@/models/Attempt";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const params = await context.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDb();
  const userAdmin = await UserModel.findById(session.user.id).lean();
  if (!userAdmin?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await UserModel.findById(params.userId).lean();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Fetch attempts and scores
  const attemptsAgg = await AttemptModel.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: null,
        "1d": {
          $sum: {
            $cond: [
              { $gte: ["$createdAt", new Date(Date.now() - 24 * 60 * 60 * 1000)] },
              1,
              0,
            ],
          },
        },
        "7d": {
          $sum: {
            $cond: [
              { $gte: ["$createdAt", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
              1,
              0,
            ],
          },
        },
        "30d": {
          $sum: {
            $cond: [
              { $gte: ["$createdAt", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
              1,
              0,
            ],
          },
        },
        all: { $sum: 1 },
      },
    },
  ]);
  const attempts = attemptsAgg[0] || { "1d": 0, "7d": 0, "30d": 0, all: 0 };
  // Scores by topic
  const scores = user.scores || [];

  // Get last attempt timings per topic
  const topics = scores.map((s: { topic: string }) => s.topic);
  const lastAttemptTimes: Record<string, Date | null> = {};
  if (topics.length > 0) {
    const lastAttempts = await AttemptModel.aggregate([
      { $match: { userId: user._id, topic: { $in: topics } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$topic",
          lastAttempt: { $first: "$createdAt" },
        },
      },
    ]);
    for (const a of lastAttempts) {
      lastAttemptTimes[a._id] = a.lastAttempt;
    }
    // Fill missing topics with null
    for (const t of topics) {
      if (!(t in lastAttemptTimes)) lastAttemptTimes[t] = null;
    }
  }

  // Add lastLogin and createdAt
  return NextResponse.json({
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt ?? null,
      lastLogin: user.lastLogin ?? null,
      attempts,
      scores,
      lastAttemptTimes,
    },
  });
}
