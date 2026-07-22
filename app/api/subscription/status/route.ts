import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDb();
  const user = await UserModel.findById(session.user.id, { subscription: 1 }).lean() as any;

  const sub = user?.subscription ?? {};
  const isActive =
    sub.status === "active" &&
    sub.currentPeriodEnd &&
    new Date(sub.currentPeriodEnd) > new Date();

  return NextResponse.json({
    isSubscribed: isActive,
    status: sub.status ?? "inactive",
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
  });
}
