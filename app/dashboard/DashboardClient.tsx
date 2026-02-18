"use client";
import { useEffect, useState } from "react";
import type { Announcement } from "@/components/announcement-board";
import SuggestionBox from "@/app/dashboard/suggestion-box";
import ScoreGrid, { ViewMode } from "@/app/dashboard/score-grid";
import { Logo } from "@/components/logo";
import Link from "next/link";
import SignOutButton from "@/components/sign-out-button";
import { TOPICS } from "@/lib/topics";

function AnnouncementBoardClientOnly() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/announcements")
      .then((res) => res.json())
      .then((data) => setAnnouncements(data.announcements || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-h-40 overflow-y-auto flex flex-col gap-3 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-3 rounded-xl bg-white/10 flex flex-col gap-1 animate-pulse">
            <span className="h-4 w-3/4 bg-white/20 rounded mb-1" />
            <span className="h-3 w-1/3 bg-white/10 rounded" />
          </div>
        ))
      ) : announcements.length > 0 ? (
        announcements.slice(0, 10).map((a, i) => (
          <div key={i} className="p-3 rounded-xl bg-white/5 text-white/90 flex flex-col gap-1">
            <span className="text-sm">{a.message}</span>
            <span className="text-xs text-white/40">{new Date(a.time).toLocaleString()}</span>
          </div>
        ))
      ) : (
        <div className="text-white/50 text-sm">No updates yet.</div>
      )}
    </div>
  );
}

export default function DashboardClient({ isAdmin, scoreMap, calibrationMap }: {
  isAdmin: boolean;
  scoreMap: Map<string, number>;
  calibrationMap: Map<string, { calibrated: boolean; calibrationAttempts: number }>;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("verscore");
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
        {/* Announcement container always rendered, only updates list is hydrated */}
        <section className="w-full mb-8">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur flex flex-col gap-4 w-full">
            <h2 className="text-lg font-semibold text-white mb-2">Updates</h2>
            <AnnouncementBoardClientOnly />
          </div>
        </section>
        {/* SuggestionBox below announcements, above topic cards, minimal gap */}
        <div className="mt-[-32px] mb-1"><SuggestionBox /></div>
        {/* Score view toggler below logo removed */}
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
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      </div>
    </div>
  );
}