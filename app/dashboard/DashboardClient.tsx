"use client";
import { useState } from "react";
import AnnouncementBoardWrapper from "@/components/AnnouncementBoardWrapper";
import SuggestionBox from "@/app/dashboard/suggestion-box";
import ScoreGrid, { ViewMode } from "@/app/dashboard/score-grid";
import { Logo } from "@/components/logo";
import Link from "next/link";
import SignOutButton from "@/components/sign-out-button";
import { TOPICS } from "@/lib/topics";

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
        <div className="flex flex-row gap-6 w-full mb-4 items-center">
          <div className="flex-1 min-w-0">
            <AnnouncementBoardWrapper />
          </div>
          <div className="flex-1 min-w-0">
            <SuggestionBox />
          </div>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs uppercase tracking-[0.3em] text-white/40">Score View</span>
            <button
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/20 border border-white/10"
              onClick={() => setViewMode(viewMode === "verscore" ? "percentile" : "verscore")}
            >
              {viewMode === "verscore" ? "Show Percentile" : "Show VerScore"}
            </button>
          </div>
        </div>
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