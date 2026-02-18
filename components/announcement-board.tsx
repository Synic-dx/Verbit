"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

export interface Announcement {
  message: string;
  time: string;
}




export default function AnnouncementBoard() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    fetch("/api/announcements")
      .then((res) => res.json())
      .then((data) => setAnnouncements(data.announcements || []));
  }, []);

  return (
    <section className="w-full mb-8">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur flex flex-col gap-4 w-full">
        <h2 className="text-lg font-semibold text-white mb-2">Updates</h2>
        <div className="max-h-40 overflow-y-auto flex flex-col gap-3 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
          {announcements.length > 0 ? (
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
      </div>
    </section>
  );
}
