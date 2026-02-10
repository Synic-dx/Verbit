import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

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

  const passwordHash = await hash(password, 10);
  const created = await UserModel.create({
    email,
    name: name || email.split("@")[0],
    passwordHash,
    createdAt: new Date(),
  });

  return NextResponse.json({
    id: String(created._id),
    email: created.email,
    name: created.name,
  });
}
