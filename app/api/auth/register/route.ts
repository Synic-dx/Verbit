import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";
import { sendVerificationEmail } from "@/lib/send-verification-email";

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email ?? "").toLowerCase();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  await connectDb();
  let existing = await UserModel.findOne({ email }).lean() as any;
  if (existing && existing.isVerified) {
    return NextResponse.json({ error: "Email already in use." }, { status: 409 });
  }

  const now = new Date();
  let code = "";

  if (existing) {
    // Check if the user requested an OTP recently (< 5 mins)
    if (existing.lastOTPtime && existing.lastOTP) {
      const timeDiff = now.getTime() - new Date(existing.lastOTPtime).getTime();
      if (timeDiff < 5 * 60 * 1000) {
        code = existing.lastOTP; // Reuse the persistent OTP
      }
    }
    
    if (!code) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    }
    
    // Update the existing unverified user document
    const passwordHash = await hash(password, 10);
    existing = await UserModel.findOneAndUpdate(
      { email },
      {
        $set: {
          passwordHash,
          name: name || existing.name || email.split("@")[0],
          lastVerificationCode: code,
          lastVerificationSentAt: now,
          lastOTP: code,
          lastOTPtime: now,
        }
      },
      { new: true }
    );
  } else {
    // Generate new OTP for new user
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const passwordHash = await hash(password, 10);
    existing = await UserModel.create({
      email,
      name: name || email.split("@")[0],
      passwordHash,
      isVerified: false,
      lastVerificationCode: code,
      lastVerificationSentAt: now,
      lastOTP: code,
      lastOTPtime: now,
      createdAt: now,
    });
  }

  // Send verification email
  await sendVerificationEmail({ to: existing.email, code });

  return NextResponse.json({
    id: String(existing._id),
    email: existing.email,
    name: existing.name,
    needsVerification: true,
  });
}
