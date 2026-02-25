
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { UserModel } from "@/models/User";
import DashboardClient from "@/app/dashboard/DashboardClient";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  await connectDb();
  const [aptitudes, dbUser] = await Promise.all([
    UserAptitudeModel.find({ userId: session.user.id }).lean(),
    UserModel.findById(session.user.id).lean() as any,
  ]);
  const isAdmin = dbUser?.isAdmin === true;

  const scoreMap = new Map(aptitudes.map((a) => [a.topic, a.verScore]));
  const calibrationMap = new Map(
    aptitudes.map((a: any) => [
      a.topic,
      {
        calibrated: a.calibrated === true || a.calibrated === undefined,
        calibrationAttempts: a.calibrationAttempts ?? 0,
      },
    ])
  );

  return (
    <DashboardClient
      isAdmin={isAdmin}
      scoreMap={scoreMap}
      calibrationMap={calibrationMap}
      isVerified={dbUser?.isVerified === true}
      email={dbUser?.email || ""}
    />
  );
}
