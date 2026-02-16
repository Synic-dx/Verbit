import Link from "next/link";
import AnnouncementBoardWrapper from "@/components/announcement-board-wrapper";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { connectDb } from "@/lib/db";
import { TOPICS } from "@/lib/topics";
import { UserAptitudeModel } from "@/models/UserAptitude";
import { UserModel } from "@/models/User";
import { Logo } from "@/components/logo";
import ScoreGrid from "@/app/dashboard/score-grid";
import SuggestionBox from "@/app/dashboard/suggestion-box";
import SignOutButton from "@/components/sign-out-button";

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
    <div className="min-h-screen bg-grid">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
        <header className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 p-1">
            <Link
              href="/dashboard"
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
            >
              Dashboard
            </Link>
            <Link
              href="/analytics"
              className="rounded-full px-4 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              Analytics
            </Link>
            <Link
              href="/about"
              className="rounded-full px-4 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              About
            </Link>
            {isAdmin ? (
              <Link
                href="/admin"
                className="rounded-full px-4 py-2 text-xs font-medium text-amber-300/70 transition hover:bg-amber-500/10 hover:text-amber-200"
              >
                Admin
              </Link>
            ) : null}
            </nav>
            <SignOutButton />
          </div>
        </header>

        {/* Client-side only announcement board */}
        {/* eslint-disable-next-line @next/next/no-async-client-component */}
        <AnnouncementBoardWrapper />
        <SuggestionBox />

        <ScoreGrid
          items={TOPICS.map((topic) => {
            const cal = calibrationMap.get(topic);
            return {
              topic,
              verScore: scoreMap.get(topic) ?? 0,
              calibrated: cal?.calibrated ?? false,
              calibrationAttempts: cal?.calibrationAttempts ?? 0,
            };
          })}
        />
      </div>
    </div>
  );
}
