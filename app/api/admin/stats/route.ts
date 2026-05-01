import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

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

  const caller = await UserModel.findById(session.user.id).lean() as any;
  if (!caller?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const oneDay      = new Date(now.getTime() -  1 * 24 * 60 * 60 * 1000);
  const threeDays   = new Date(now.getTime() -  3 * 24 * 60 * 60 * 1000);
  const sevenDays   = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);
  const thirtyDays  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Single aggregation pass: all time-bucketed counts + active-user metric
  const [facetResult, users, aptitudes] = await Promise.all([
    AttemptModel.aggregate([
      {
        $facet: {
          counts1d: [
            { $match: { createdAt: { $gte: oneDay } } },
            { $group: { _id: "$userId", count: { $sum: 1 } } },
          ],
          counts3d: [
            { $match: { createdAt: { $gte: threeDays } } },
            { $group: { _id: "$userId", count: { $sum: 1 } } },
          ],
          counts7d: [
            { $match: { createdAt: { $gte: sevenDays } } },
            { $group: { _id: "$userId", count: { $sum: 1 } } },
          ],
          counts30d: [
            { $match: { createdAt: { $gte: thirtyDays } } },
            { $group: { _id: "$userId", count: { $sum: 1 } } },
          ],
          countsAll: [
            { $group: { _id: "$userId", count: { $sum: 1 } } },
          ],
          // users active on ≥3 distinct days in the last 7 days
          active7d3: [
            { $match: { createdAt: { $gte: sevenDays } } },
            { $project: { userId: 1, day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
            { $group: { _id: { userId: "$userId", day: "$day" } } },
            { $group: { _id: "$_id.userId", days: { $sum: 1 } } },
            { $match: { days: { $gte: 3 } } },
            { $count: "total" },
          ],
        },
      },
    ]),
    UserModel.find({}, { name: 1, email: 1, isAdmin: 1, createdAt: 1, lastLogin: 1 })
      .sort({ createdAt: -1 })
      .lean(),
    UserAptitudeModel.find({}, { userId: 1, topic: 1, verScore: 1, calibrated: 1 }).lean(),
  ]);

  const {
    counts1d,
    counts3d,
    counts7d,
    counts30d,
    countsAll,
    active7d3,
  } = facetResult[0] as any;

  const active7d3Count: number =
    Array.isArray(active7d3) && active7d3.length > 0 ? active7d3[0].total : 0;

  const toMap = (arr: any[]) => {
    const m = new Map<string, number>();
    for (const item of arr) m.set(String(item._id), item.count);
    return m;
  };

  const map1d   = toMap(counts1d);
  const map3d   = toMap(counts3d);
  const map7d   = toMap(counts7d);
  const map30d  = toMap(counts30d);
  const mapAll  = toMap(countsAll);

  const total1d  = counts1d.reduce((s: number, i: any) => s + i.count, 0);
  const total7d  = counts7d.reduce((s: number, i: any) => s + i.count, 0);
  const total30d = counts30d.reduce((s: number, i: any) => s + i.count, 0);
  const totalAll = countsAll.reduce((s: number, i: any) => s + i.count, 0);

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

  const userList = (users as any[]).map((u) => {
    const uid = String(u._id);
    const active = (map3d.get(uid) ?? 0) > 30;
    return {
      id: uid,
      name: u.name ?? "—",
      email: u.email,
      isAdmin: u.isAdmin ?? false,
      lastLogin: u.lastLogin ?? null,
      createdAt: u.createdAt ?? null,
      scores: aptitudeMap.get(uid) ?? [],
      attempts: {
        "1d":  map1d.get(uid)  ?? 0,
        "7d":  map7d.get(uid)  ?? 0,
        "30d": map30d.get(uid) ?? 0,
        all:   mapAll.get(uid) ?? 0,
      },
      active,
    };
  });

  return NextResponse.json({
    totalUsers: users.length,
    totalAttempts: { "1d": total1d, "7d": total7d, "30d": total30d, all: totalAll },
    users: userList,
    active7d3: active7d3Count,
  });
}
