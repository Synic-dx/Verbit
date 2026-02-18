"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TOPICS } from "@/lib/topics";
import SignOutButton from "@/components/sign-out-button";
import UserAccordion, { SortOption } from "./UserAccordion";

type UserScore = { topic: string; verScore: number; calibrated: boolean };
type UserAttempts = { "1d": number; "7d": number; "30d": number; all: number };

type UserEntry = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  lastLogin?: string | null;
  createdAt?: string | null;
  scores: UserScore[];
  attempts: UserAttempts;
  active?: boolean;
};

type StatsData = {
  totalUsers: number;
  totalAttempts: UserAttempts;
  users: UserEntry[];
  active7d3?: number;
};

type ReportEntry = {
  id: string;
  topic: string;
  userEmail: string;
  userName: string;
  analysis: string;
  rule: string;
  question: string;
  snapshot: any;
  createdAt: string;
};

type Tab = "overview" | "reports" | "suggestions" | "tools";

type SuggestionEntry = {
  id: string;
  userName: string;
  userEmail: string;
  message: string;
  createdAt: string;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("mostSolved");
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"1d" | "7d" | "30d" | "all">("7d");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/sign-in");
  }, [status, router]);

  // Helper for fetch with retries and error logging
  async function fetchWithRetry(url: string, options: RequestInit = {}, retries: number = 2): Promise<{ ok: boolean; data?: any; error?: string }> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) {
          const text = await res.text();
          console.error(`Fetch failed: ${url} [${res.status}]`, text);
          if (attempt === retries) return { ok: false, error: `Failed: ${url} [${res.status}]` };
        } else {
          return { ok: true, data: await res.json() };
        }
      } catch (err) {
        console.error(`Fetch error: ${url}`, err);
        if (attempt === retries) return { ok: false, error: `Network error: ${url}` };
      }
      await new Promise(r => setTimeout(r, 500)); // Wait before retry
    }
    return { ok: false, error: `Unknown error: ${url}` };
  }

  const reload = useCallback(async () => {
    if (!session?.user?.isAdmin) return;
    setLoading(true);
    setError(null);
    // Fetch endpoints in parallel
    const [stats, reports, suggestions] = await Promise.all([
      fetchWithRetry("/api/admin/stats"),
      fetchWithRetry("/api/admin/reports"),
      fetchWithRetry("/api/admin/suggestions"),
    ]);
    let errorMsg = "";
    if (!stats.ok) errorMsg += `Stats: ${stats.error}\n`;
    if (!reports.ok) errorMsg += `Reports: ${reports.error}\n`;
    if (!suggestions.ok) errorMsg += `Suggestions: ${suggestions.error}\n`;
    if (errorMsg) {
      setError(errorMsg.trim());
    } else {
      setStats(stats.data);
      setReports(reports.data?.reports ?? []);
      setSuggestions(suggestions.data?.suggestions ?? []);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Error tracking banner
  const errorBanner = error ? (
    <Card className="border-rose-500/30 bg-rose-500/5 p-4 mb-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-rose-200 whitespace-pre-line">{error}</p>
        <button className="text-xs text-rose-300/50 hover:text-rose-300" onClick={() => setError(null)}>×</button>
      </div>
    </Card>
  ) : null;

  // Extra console logging for reports/suggestions
  useEffect(() => {
    if (reports && reports.length === 0) {
      console.warn("No reports fetched.");
    } else {
      console.log("Fetched reports:", reports);
    }
    if (suggestions && suggestions.length === 0) {
      console.warn("No suggestions fetched.");
    } else {
      console.log("Fetched suggestions:", suggestions);
    }
  }, [reports, suggestions]);

  const runAction = async (body: Record<string, unknown>, confirmMsg: string) => {
    if (!confirm(confirmMsg)) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await fetch("/api/admin/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setActionResult(`Done. ${JSON.stringify(data.deleted ?? data)}`);
        await reload();
      } else {
        setActionResult(`Error: ${data.error}`);
      }
    } catch {
      setActionResult("Network error.");
    } finally {
      setActionLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-grid px-6 py-12">
        <Card className="mx-auto max-w-lg p-8 text-white/70">Loading admin dashboard…</Card>
      </div>
    );
  }

  if (!session?.user?.isAdmin) {
    return (
      <div className="min-h-screen bg-grid px-6 py-12">
        <Card className="mx-auto max-w-lg p-8 text-white/70">
          Access denied. You must be an admin.
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-grid px-6 py-12">
        <Card className="mx-auto max-w-lg p-8 text-rose-300">{error}</Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid px-6 py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Admin</p>
            <h1 className="text-2xl font-semibold text-white">Platform Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 p-1">
              <Link
                href="/dashboard"
                className="rounded-full px-4 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
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
              <Link
                href="/admin"
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-amber-200 shadow-sm transition hover:-translate-y-0.5"
              >
                Admin
              </Link>
            </nav>
            <SignOutButton />
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "overview" ? "default" : "secondary"}
            onClick={() => setTab("overview")}
          >
            Overview
          </Button>
          <Button
            size="sm"
            variant={tab === "reports" ? "default" : "secondary"}
            onClick={() => setTab("reports")}
          >
            Bad Reports ({reports.length})
          </Button>
          <Button
            size="sm"
            variant={tab === "suggestions" ? "default" : "secondary"}
            onClick={() => setTab("suggestions")}
          >
            Suggestions ({suggestions.length})
          </Button>
          <Button
            size="sm"
            variant={tab === "tools" ? "default" : "secondary"}
            onClick={() => setTab("tools")}
          >
            Admin Tools
          </Button>
        </div>

        {/* Error banner */}
        {errorBanner}
        {/* Action result banner */}
        {actionResult ? (
          <Card className="border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-amber-200">{actionResult}</p>
              <button className="text-xs text-amber-300/50 hover:text-amber-300" onClick={() => setActionResult(null)}>×</button>
            </div>
          </Card>
        ) : null}

        {tab === "reports" ? (
          <>
            <div className="grid gap-4 mt-4">
              {reports.length > 0 ? (
                reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    expanded={expandedReport === report.id}
                    onToggle={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                    onAction={runAction}
                    busy={actionLoading}
                  />
                ))
              ) : (
                <Card className="p-5 text-white/30 mt-4">No bad reports found.</Card>
              )}
            </div>
          </>
        ) : null}

        {tab === "suggestions" ? (
          <>
            <div className="grid gap-4 mt-4">
              {suggestions.length > 0 ? (
                suggestions.map((s) => (
                  <Card key={s.id} className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-cyan-500/20 text-cyan-300 text-[10px]">Suggestion</Badge>
                      <span className="text-xs text-white/30">{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-white/80 mb-1">{s.message}</p>
                    <p className="text-xs text-white/40">By {s.userName} ({s.userEmail})</p>
                  </Card>
                ))
              ) : (
                <Card className="p-5 text-white/30 mt-4">No suggestions found.</Card>
              )}
            </div>
          </>
        ) : null}


        {tab === "overview" && stats ? (
          <>
            {/* Global stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full">
              <StatCard label="Total Users" value={stats.totalUsers} />
              <StatCard label="Problems (24h)" value={stats.totalAttempts["1d"]} />
              <StatCard label="Problems (7d)" value={stats.totalAttempts["7d"]} />
              <StatCard label="Problems (30d)" value={stats.totalAttempts["30d"]} />
              <StatCard label="Active Users (last 3d >30)" value={stats.users.filter((u: any) => u.active).length} />
            </div>

            {/* Timeframe and sort picker */}
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-white/40">Timeframe:</span>
                {(["1d", "7d", "30d", "all"] as const).map((tf) => (
                  <button
                    key={tf}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      timeframe === tf
                        ? "bg-white/15 text-white"
                        : "text-white/40 hover:text-white/70"
                    }`}
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf === "all" ? "All time" : tf}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-white/40">Sort by:</span>
                <button
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${sortOption === "mostSolved" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"}`}
                  onClick={() => setSortOption("mostSolved")}
                >Most Solved</button>
                <button
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${sortOption === "lastLogin" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"}`}
                  onClick={() => setSortOption("lastLogin")}
                >Last Login</button>
                <button
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${sortOption === "newest" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"}`}
                  onClick={() => setSortOption("newest")}
                >Newest</button>
              </div>
            </div>

            {/* User table with accordion */}
            <Card className="overflow-hidden mt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/40">
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3 text-right">Problems ({timeframe === "all" ? "all" : timeframe})</th>
                      <th className="px-4 py-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats.users]
                      .sort((a, b) => {
                        if (sortOption === "mostSolved") {
                          return (b.attempts[timeframe] || 0) - (a.attempts[timeframe] || 0);
                        }
                        if (sortOption === "lastLogin") {
                          // fallback to 0 if missing
                          return (new Date(b.lastLogin || 0).getTime()) - (new Date(a.lastLogin || 0).getTime());
                        }
                        if (sortOption === "newest") {
                          return (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime());
                        }
                        return 0;
                      })
                      .map((u) => [
                        <tr
                          key={u.id}
                          className="cursor-pointer border-b border-white/5 transition hover:bg-white/5"
                          onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                        >
                          <td className="px-4 py-3 font-medium text-white">
                            {u.name}
                            {u.isAdmin ? (
                              <Badge className="ml-2 bg-amber-500/20 text-amber-300 text-[10px]">Admin</Badge>
                            ) : null}
                            {u.active ? (
                              <Badge className="ml-2 bg-emerald-500/20 text-emerald-300 text-[10px]">Active</Badge>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-white/60">{u.email}</td>
                          <td className="px-4 py-3 text-right text-white/80">{u.attempts[timeframe]}</td>
                          <td className="px-4 py-3 text-right text-white/40">{expandedUser === u.id ? "▲" : "▼"}</td>
                        </tr>,
                        expandedUser === u.id ? (
                          <UserAccordion key={u.id + "-accordion"} userId={u.id} onClose={() => setExpandedUser(null)} />
                        ) : null,
                      ])}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null}




        {tab === "tools" ? (
          <div className="space-y-6">
            {/* Post Announcement */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Post Update</h3>
              <p className="text-xs text-white/50 mb-2">Type your update and submit. The current date and time will be attached automatically.</p>
              <form
                className="flex flex-col gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const input = form.elements.namedItem("announcement") as HTMLInputElement;
                  const message = input.value.trim();
                  if (!message) return;
                  setActionLoading(true);
                  setActionResult(null);
                  try {
                    const res = await fetch("/api/announcements", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ message }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setActionResult("Update posted.");
                      input.value = "";
                    } else {
                      setActionResult(`Error: ${data.error}`);
                    }
                  } catch {
                    setActionResult("Network error.");
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                <textarea
                  name="announcement"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  placeholder="Enter update message..."
                  rows={2}
                  maxLength={500}
                  required
                  disabled={actionLoading}
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    variant="default"
                    disabled={actionLoading}
                  >
                    Post Update
                  </Button>
                </div>
              </form>
            </Card>
            {/* Question Bank Reset */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-white">Reset Question Bank</h3>
              <p className="mt-1 text-sm text-white/50">
                Delete all generated questions (and served-question records) for a specific topic or the entire bank.
                This forces fresh generation for all users.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                  disabled={actionLoading}
                  onClick={() => runAction({ action: "resetQuestions", topic: "all" }, "Delete ALL questions across every topic? This cannot be undone.")}
                >
                  Reset ALL Topics
                </Button>
                {TOPICS.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant="secondary"
                    disabled={actionLoading}
                    onClick={() => runAction({ action: "resetQuestions", topic: t }, `Delete all questions for \"${t}\"?`)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </Card>

            {/* Clear Bad Reports */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-white">Clear Bad Reports</h3>
              <p className="mt-1 text-sm text-white/50">
                Remove all bad-question reports &amp; their avoidance rules. Per-topic or all at once.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                  disabled={actionLoading}
                  onClick={() => runAction({ action: "clearReports", topic: "all" }, "Clear ALL bad-question reports?")}
                >
                  Clear All Reports
                </Button>
                {TOPICS.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant="secondary"
                    disabled={actionLoading}
                    onClick={() => runAction({ action: "clearReports", topic: t }, `Clear reports for "${t}"?`)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </Card>

            {/* Danger Zone */}
            <Card className="border-rose-500/20 p-6">
              <h3 className="text-lg font-semibold text-rose-300">Danger Zone</h3>
              <p className="mt-1 text-sm text-white/50">
                These actions are destructive and cannot be undone.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-sm text-white/70">Nuclear reset — wipe ALL questions, reports, attempts, scores, served records, and non-admin users. Your admin account is preserved.</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2 border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                    disabled={actionLoading}
                    onClick={() => runAction({ action: "nuclearReset" }, "NUCLEAR RESET: This will delete ALL questions, reports, attempts, scores, and non-admin users. Only admin accounts survive. This CANNOT be undone. Proceed?")}
                  >
                    Nuclear Reset
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value.toLocaleString()}</p>
    </Card>
  );
}

function UserRow({
  user,
  timeframe,
  expanded,
  onToggle,
  onAction,
  busy,
}: {
  user: UserEntry;
  timeframe: "1d" | "7d" | "30d" | "all";
  expanded: boolean;
  onToggle: () => void;
  onAction: (body: Record<string, unknown>, confirmMsg: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-white/5 transition hover:bg-white/5"
        onClick={onToggle}
      >
        <td className="px-4 py-3 font-medium text-white">
          {user.name}
          {user.isAdmin ? (
            <Badge className="ml-2 bg-amber-500/20 text-amber-300 text-[10px]">Admin</Badge>
          ) : null}
        </td>
        <td className="px-4 py-3 text-white/60">{user.email}</td>
        <td className="px-4 py-3 text-right text-white/80">{user.attempts[timeframe]}</td>
        <td className="px-4 py-3 text-right text-white/40">{expanded ? "▲" : "▼"}</td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={4} className="bg-white/2 px-4 py-4">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-widest text-white/40">VerScores by Topic</p>
              {user.scores.length === 0 ? (
                <p className="text-sm text-white/30">No scores yet</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {user.scores.map((s) => (
                    <div
                      key={s.topic}
                      className="rounded-xl border border-white/10 px-3 py-2"
                    >
                      <p className="text-xs text-white/50">{s.topic}</p>
                      <p className="text-lg font-semibold text-white">
                        {s.verScore.toFixed(1)}
                        {!s.calibrated ? (
                          <span className="ml-1 text-xs font-normal text-amber-300/70">cal</span>
                        ) : null}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-4 text-xs text-white/40">
                <div>
                  <span>24h: {user.attempts["1d"]}</span>
                  <span>7d: {user.attempts["7d"]}</span>
                  <span>30d: {user.attempts["30d"]}</span>
                  <span>All: {user.attempts.all}</span>
                </div>
              </div>
              {/* Admin actions for this user */}
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction(
                      { action: "resetUserScores", userId: user.id, topic: "all" },
                      `Reset ALL scores, attempts, and served-question history for ${user.name} (${user.email})?`
                    );
                  }}
                >
                  Reset All Scores
                </Button>
                {!user.isAdmin ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction(
                        { action: "deleteUser", userId: user.id },
                        `Permanently DELETE user ${user.name} (${user.email}) and ALL their data? This cannot be undone.`
                      );
                    }}
                  >
                    Delete User
                  </Button>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ReportCard({
  report,
  expanded,
  onToggle,
  onAction,
  busy,
}: {
  report: ReportEntry;
  expanded: boolean;
  onToggle: () => void;
  onAction: (body: Record<string, unknown>, confirmMsg: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <Card
      className="cursor-pointer border-rose-500/20 p-5 transition hover:border-rose-500/40"
      onClick={onToggle}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-rose-500/20 text-rose-300">{report.topic}</Badge>
            <span className="text-xs text-white/30">
              {new Date(report.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-white/80">{report.question}</p>
          <p className="text-xs text-white/40">
            Reported by {report.userName} ({report.userEmail})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-rose-500/30 px-2 py-1 text-xs text-rose-300 transition hover:bg-rose-500/10"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onAction(
                { action: "deleteReport", reportId: report.id },
                `Delete this report for "${report.question}"?`
              );
            }}
          >
            Delete
          </button>
          <span className="text-white/30">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-rose-300/60">AI Analysis</p>
            <p className="mt-1 text-sm text-white/70">{report.analysis}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-rose-300/60">Avoidance Rule</p>
            <p className="mt-1 text-sm text-white/70">{report.rule}</p>
          </div>
          {report.snapshot ? (
            <div>
              <p className="text-xs uppercase tracking-widest text-rose-300/60">Question Snapshot</p>
              <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-white/50">
                {JSON.stringify(report.snapshot, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
