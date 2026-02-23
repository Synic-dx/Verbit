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
  const existing = await UserModel.findOne({ email }).lean();
  if (existing) {
    return NextResponse.json({ error: "Email already in use." }, { status: 409 });
  }

  // Generate OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date();
  const passwordHash = await hash(password, 10);
  const created = await UserModel.create({
    email,
    name: name || email.split("@")[0],
    passwordHash,
    isVerified: false,
    lastVerificationCode: code,
    lastVerificationSentAt: now,
    createdAt: now,
  });

  // Send verification email
  await sendVerificationEmail({ to: created.email, code });

  return NextResponse.json({
    id: String(created._id),
    email: created.email,
    name: created.name,
    needsVerification: true,
  });
}
