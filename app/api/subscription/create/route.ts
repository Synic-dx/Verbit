import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { razorpay } from "@/lib/razorpay";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tier } = await req.json().catch(() => ({ tier: "pro" }));
  const selectedTier: "pro" | "cracker" = tier === "cracker" ? "cracker" : "pro";

  const planId =
    selectedTier === "cracker"
      ? process.env.RAZORPAY_PLAN_ID_CRACKER
      : process.env.RAZORPAY_PLAN_ID_PRO;

  if (!planId) {
    return NextResponse.json({ error: "Subscription plan not configured" }, { status: 503 });
  }

  await connectDb();
  const user = await UserModel.findById(session.user.id).lean() as any;

  if (user?.subscription?.status === "active" && user.subscription.currentPeriodEnd > new Date()) {
    return NextResponse.json({ error: "Already subscribed" }, { status: 409 });
  }

  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    quantity: 1,
    total_count: 120,
    notes: { email: user?.email ?? "", userId: String(user?._id), tier: selectedTier },
  });

  return NextResponse.json({
    subscriptionId: subscription.id,
    keyId: process.env.RAZORPAY_KEY_ID,
    tier: selectedTier,
  });
}
