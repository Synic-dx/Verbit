import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, code } = body;

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
    }

    await connectDb();
    const user = await UserModel.findOne({ email: email.toLowerCase() });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.isVerified) {
      return NextResponse.json({ error: "User is already verified." }, { status: 400 });
    }

    if (user.lastVerificationCode !== code) {
      return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
    }

    user.isVerified = true;
    user.lastVerificationCode = undefined;
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
