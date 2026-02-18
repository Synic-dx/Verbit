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
    <div className="flex items-center gap-2 mt-0 mb-2">
      <input
        type="text"
        className="flex-1 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
        placeholder="Send any suggestions you have or mention any site-wide issue you are facing. I'll fix them"
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
        variant="secondary"
        size="sm"
        className="h-9 px-4 bg-emerald-500 text-white hover:bg-emerald-600 border-none shadow-sm"
        onClick={handleSubmit}
        disabled={!message.trim() || status === "sending"}
        style={{ minWidth: 70 }}
      >
        {status === "sending" ? "Sending…" : status === "sent" ? "Sent ✓" : "Send"}
      </Button>
    </div>
  );
}
