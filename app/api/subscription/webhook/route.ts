import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const eventType: string = event.event;
  const subscriptionId: string | undefined =
    event.payload?.subscription?.entity?.id;

  if (!subscriptionId) {
    return NextResponse.json({ ok: true });
  }

  await connectDb();

  if (eventType === "subscription.charged") {
    const chargeAt: number | undefined =
      event.payload?.payment?.entity?.created_at;
    const base = chargeAt ? new Date(chargeAt * 1000) : new Date();
    const currentPeriodEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Determine tier from notes (set at subscription creation)
    const notes = event.payload?.subscription?.entity?.notes ?? {};
    const tier: "pro" | "cracker" = notes.tier === "cracker" ? "cracker" : "pro";

    await UserModel.updateOne(
      { "subscription.razorpaySubscriptionId": subscriptionId },
      {
        $set: {
          "subscription.status": "active",
          "subscription.tier": tier,
          "subscription.currentPeriodEnd": currentPeriodEnd,
        },
      }
    );
  } else if (eventType === "subscription.cancelled") {
    await UserModel.updateOne(
      { "subscription.razorpaySubscriptionId": subscriptionId },
      { $set: { "subscription.status": "cancelled" } }
    );
  } else if (eventType === "subscription.halted") {
    await UserModel.updateOne(
      { "subscription.razorpaySubscriptionId": subscriptionId },
      { $set: { "subscription.status": "halted" } }
    );
  } else if (eventType === "subscription.activated") {
    await UserModel.updateOne(
      { "subscription.razorpaySubscriptionId": subscriptionId },
      { $set: { "subscription.status": "active" } }
    );
  }

  return NextResponse.json({ ok: true });
}
