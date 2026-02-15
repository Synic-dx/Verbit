import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { AttemptModel } from "@/models/Attempt";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDb();

  // Check admin
  const caller = await UserModel.findById(session.user.id).lean() as any;
  if (!caller?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDays = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all users
  const users = await UserModel.find({}, { name: 1, email: 1, isAdmin: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean();

  const userIds = users.map((u: any) => u._id);

  // Fetch all aptitudes
  const aptitudes = await UserAptitudeModel.find(
    { userId: { $in: userIds } },
    { userId: 1, topic: 1, verScore: 1, calibrated: 1 }
  ).lean();

  // Build per-user aptitude map
  const aptitudeMap = new Map<string, { topic: string; verScore: number; calibrated: boolean }[]>();
  for (const a of aptitudes as any[]) {
    const uid = String(a.userId);
    if (!aptitudeMap.has(uid)) aptitudeMap.set(uid, []);
    aptitudeMap.get(uid)!.push({
      topic: a.topic,
      verScore: a.verScore,
      calibrated: a.calibrated ?? true,
    });
  }

  // Attempt counts per user per timeframe
  const [counts1d, counts7d, counts30d, countsAll] = await Promise.all([
    AttemptModel.aggregate([
      { $match: { createdAt: { $gte: oneDay } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]),
    AttemptModel.aggregate([
      { $match: { createdAt: { $gte: sevenDays } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]),
    AttemptModel.aggregate([
      { $match: { createdAt: { $gte: thirtyDays } } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]),
    AttemptModel.aggregate([
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]),
  ]);

  const toMap = (arr: any[]) => {
    const m = new Map<string, number>();
    for (const item of arr) m.set(String(item._id), item.count);
    return m;
  };

  const map1d = toMap(counts1d);
  const map7d = toMap(counts7d);
  const map30d = toMap(counts30d);
  const mapAll = toMap(countsAll);

  // Global totals
  const total1d = counts1d.reduce((s: number, i: any) => s + i.count, 0);
  const total7d = counts7d.reduce((s: number, i: any) => s + i.count, 0);
  const total30d = counts30d.reduce((s: number, i: any) => s + i.count, 0);
  const totalAll = countsAll.reduce((s: number, i: any) => s + i.count, 0);

  const userList = users.map((u: any) => {
    const uid = String(u._id);
    return {
      id: uid,
      name: u.name ?? "—",
      email: u.email,
      isAdmin: u.isAdmin ?? false,
      scores: aptitudeMap.get(uid) ?? [],
      attempts: {
        "1d": map1d.get(uid) ?? 0,
        "7d": map7d.get(uid) ?? 0,
        "30d": map30d.get(uid) ?? 0,
        all: mapAll.get(uid) ?? 0,
      },
    };
  });

  return NextResponse.json({
    totalUsers: users.length,
    totalAttempts: { "1d": total1d, "7d": total7d, "30d": total30d, all: totalAll },
    users: userList,
  });
}
