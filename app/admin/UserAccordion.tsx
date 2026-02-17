import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TOPICS } from "@/lib/topics";

export type UserDetail = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  lastLogin: string;
  attempts: {
    "1d": number;
    "7d": number;
    "30d": number;
    all: number;
  };
  scores: { topic: string; verScore: number; calibrated: boolean }[];
  lastAttemptTimes?: Record<string, string | null>;
  // Add more fields as needed
};

export type SortOption = "mostSolved" | "lastLogin" | "newest";

export default function UserAccordion({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/user/${userId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!data.user || !data.user.id) {
          setError("User data missing or malformed.");
          setLoading(false);
          return;
        }
        setUser(data.user);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load user data. " + (err?.message || ""));
        setLoading(false);
      });
  }, [userId]);

  if (loading) {
    return (
      <tr>
        <td colSpan={4} className="bg-white/2 px-4 py-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded bg-white/10" />
            <div className="h-4 w-1/2 rounded bg-white/10" />
            <div className="h-8 w-full rounded bg-white/10" />
          </div>
        </td>
      </tr>
    );
  }
  if (error || !user) {
    return (
      <tr>
        <td colSpan={4} className="bg-white/2 px-4 py-4 text-rose-300">{error || "No data."}</td>
      </tr>
    );
  }
  return (
    <tr>
      <td colSpan={4} className="bg-white/2 px-4 py-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-white">{user.name}</span>
            {user.isAdmin && <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">Admin</Badge>}
            <span className="ml-2 text-xs text-white/40">{user.email}</span>
          </div>
          <div className="flex gap-4 text-xs text-white/40">
            <span><strong>Account Created:</strong> {new Date(user.createdAt).toLocaleString()}</span>
            <span><strong>Last Login:</strong> {new Date(user.lastLogin).toLocaleString()}</span>
            <span>24h: {user.attempts["1d"]}</span>
            <span>7d: {user.attempts["7d"]}</span>
            <span>30d: {user.attempts["30d"]}</span>
            <span>All: {user.attempts.all}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {user.scores.map((s) => (
              <div key={s.topic} className="rounded-xl border border-white/10 px-3 py-2">
                <p className="text-xs text-white/50">{s.topic}</p>
                <p className="text-lg font-semibold text-white">
                  {s.verScore.toFixed(1)}
                  {!s.calibrated && <span className="ml-1 text-xs font-normal text-amber-300/70">cal</span>}
                </p>
                <p className="text-xs text-white/40 mt-1">
                  Last Attempt: {user.lastAttemptTimes && user.lastAttemptTimes[s.topic] ? new Date(user.lastAttemptTimes[s.topic]!).toLocaleString() : "No data"}
                </p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
            {/* Add more admin actions here */}
          </div>
        </div>
      </td>
    </tr>
  );
}
