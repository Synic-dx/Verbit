import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, tier } =
    await req.json();

  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return NextResponse.json({ error: "Missing payment details" }, { status: 400 });
  }

  const isValid = verifyPaymentSignature(
    razorpay_payment_id,
    razorpay_subscription_id,
    razorpay_signature
  );

  if (!isValid) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  await connectDb();

  const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const selectedTier: "pro" | "cracker" = tier === "cracker" ? "cracker" : "pro";

  await UserModel.updateOne(
    { _id: session.user.id },
    {
      $set: {
        "subscription.status": "active",
        "subscription.tier": selectedTier,
        "subscription.razorpaySubscriptionId": razorpay_subscription_id,
        "subscription.currentPeriodEnd": currentPeriodEnd,
      },
    }
  );

  return NextResponse.json({ ok: true, tier: selectedTier });
}
