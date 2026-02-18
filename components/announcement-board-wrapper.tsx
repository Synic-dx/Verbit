"use client";

import { useEffect, useState } from "react";
import type { Announcement } from "@/components/announcement-board";

export default function AnnouncementBoardWrapper() {
  // Always render the container and heading (SSR-safe)
  return (
    <section className="w-full mb-8">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur flex flex-col gap-4 w-full">
        <h2 className="text-lg font-semibold text-white mb-2">Updates</h2>
        <AnnouncementBoardClientOnly />
      </div>
    </section>
  );
}

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