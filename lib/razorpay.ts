import Razorpay from "razorpay";
import crypto from "crypto";

export const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

/** Verify the signature sent by Razorpay after a successful subscription payment. */
export function verifyPaymentSignature(
  razorpay_payment_id: string,
  razorpay_subscription_id: string,
  razorpay_signature: string
): boolean {
  const body = `${razorpay_payment_id}|${razorpay_subscription_id}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest("hex");
  return expected === razorpay_signature;
}

/** Verify the signature on incoming webhook requests. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}
