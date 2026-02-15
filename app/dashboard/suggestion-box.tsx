"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function SuggestionBox() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (res.ok) {
        setStatus("sent");
        setMessage("");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/25"
        placeholder="Make any suggestions for improvements, report any platform-wide issue…"
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        maxLength={2000}
        disabled={status === "sending"}
      />
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={!message.trim() || status === "sending"}
      >
        {status === "sending" ? "Sending…" : status === "sent" ? "Sent ✓" : "Submit"}
      </Button>
    </div>
  );
}
