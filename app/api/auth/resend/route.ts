import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";
import { sendVerificationEmail } from "@/lib/send-verification-email";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    await connectDb();
    const user = await UserModel.findOne({ email: email.toLowerCase() });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.isVerified) {
      return NextResponse.json({ error: "User is already verified." }, { status: 400 });
    }

    const now = new Date();
    if (user.lastVerificationSentAt) {
      const timeDiff = now.getTime() - user.lastVerificationSentAt.getTime();
      
      // If requested less than 2 minutes ago, error out
      if (timeDiff < 2 * 60 * 1000) {
        const remaining = Math.ceil((2 * 60 * 1000 - timeDiff) / 1000);
        return NextResponse.json({ error: `Please wait ${remaining} seconds before resending the code.` }, { status: 429 });
      }

      // If requested between 2 and 5 minutes ago, send the existing code and update sent time
      if (timeDiff < 5 * 60 * 1000 && user.lastVerificationCode) {
        user.lastVerificationSentAt = now;
        await user.save();
        await sendVerificationEmail({ to: user.email, code: user.lastVerificationCode });
        return NextResponse.json({ success: true, message: "Existing code resent." });
      }
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.lastVerificationCode = code;
    user.lastVerificationSentAt = now;
    user.lastOTP = code;
    user.lastOTPtime = now;
    await user.save();

    await sendVerificationEmail({ to: user.email, code });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
