import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

/** Check whether an email is already registered. */
export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };
  if (!email) {
    return NextResponse.json({ exists: false });
  }

  await connectDb();
  const user = await UserModel.findOne(
    { email: email.toLowerCase() },
    { _id: 1 }
  ).lean();

  return NextResponse.json({ exists: !!user });
}
