"use client";

import { useState } from "react";

interface Announcement {
  message: string;
  time: string;
}

const ANNOUNCEMENTS: Announcement[] = [
  {
    message: "Model Trained on all VA PYQs provided by AfterBoards (big thanks to Bhavesh Bhaiya)! You will now get better and more relevant questions. But continue reporting bad ones so we can improve further!",
    time: "2026-02-16 18:00 IST"
  }
];

export default function AnnouncementBoard() {
  const [announcements] = useState<Announcement[]>(ANNOUNCEMENTS);

  return (
    <div className="w-full max-w-3xl mx-auto my-6 p-0 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 shadow-sm flex items-center gap-3">
      <ul className="flex-1 space-y-0 divide-y divide-white/10">
        {announcements.map((a, i) => {
          const parts = a.message.split(/(AfterBoards)/);
          return (
            <li key={i} className="flex flex-col gap-1 px-5 py-3">
              <span className="text-sm text-white/90">
                {parts.map((part, idx) =>
                  part === "AfterBoards" ? (
                    <a
                      key={idx}
                      href="https://www.afterboards.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-300 hover:text-blue-200 transition-colors"
                    >
                      AfterBoards
                    </a>
                  ) : (
                    <span key={idx}>{part}</span>
                  )
                )}
              </span>
              <span className="text-xs text-white/40 font-mono tracking-wide">{a.time}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
