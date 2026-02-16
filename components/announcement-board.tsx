"use client";

import { useState } from "react";

interface Announcement {
  message: string;
  time: string;
}

const ANNOUNCEMENTS: Announcement[] = [
  {
    message: "Model Trained on all VA PYQs provided by AfterBoards (big thanks to Bhavesh Bhaiya)! You will now get better and more relevant questions.",
    time: "2026-02-16 18:00 IST"
  }
];

export default function AnnouncementBoard() {
  const [announcements] = useState<Announcement[]>(ANNOUNCEMENTS);

  return (
    <div className="w-full max-w-2xl mx-auto my-6 p-4 rounded-lg bg-blue-900/80 border border-blue-400/30 shadow-lg">
      <h2 className="text-lg font-bold text-blue-200 mb-3">Announcements</h2>
      <ul className="space-y-3">
        {announcements.map((a, i) => {
          // Replace 'AfterBoards' with a hyperlink in the message
          const parts = a.message.split(/(AfterBoards)/);
          return (
            <li key={i} className="bg-blue-800/60 rounded-md p-3 flex flex-col gap-1">
              <span className="text-white text-sm">
                {parts.map((part, idx) =>
                  part === "AfterBoards" ? (
                    <a
                      key={idx}
                      href="https://www.afterboards.in/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-300 hover:text-blue-200"
                    >
                      AfterBoards
                    </a>
                  ) : (
                    <span key={idx}>{part}</span>
                  )
                )}
              </span>
              <span className="text-xs text-blue-300">{a.time}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
