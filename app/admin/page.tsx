"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TOPICS } from "@/lib/topics";

type UserScore = { topic: string; verScore: number; calibrated: boolean };
type UserAttempts = { "1d": number; "7d": number; "30d": number; all: number };

type UserEntry = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  scores: UserScore[];
  attempts: UserAttempts;
};

type StatsData = {
  totalUsers: number;
  totalAttempts: UserAttempts;
  users: UserEntry[];
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

type Tab = "overview" | "reports" | "tools";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<"1d" | "7d" | "30d" | "all">("7d");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/sign-in");
  }, [status, router]);

  const reload = useCallback(async () => {
    if (!session?.user?.isAdmin) return;
    setLoading(true);
    try {
      const [statsRes, reportsRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/reports"),
      ]);
      if (!statsRes.ok || !reportsRes.ok) {
        setError("Failed to load admin data.");
        return;
      }
      const s = await statsRes.json();
      const r = await reportsRes.json();
      setStats(s);
      setReports(r.reports ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

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
          <Link href="/dashboard">
            <Button size="sm" variant="secondary">Back to Dashboard</Button>
          </Link>
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
            variant={tab === "tools" ? "default" : "secondary"}
            onClick={() => setTab("tools")}
          >
            Admin Tools
          </Button>
        </div>

        {/* Action result banner */}
        {actionResult ? (
          <Card className="border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-amber-200">{actionResult}</p>
              <button className="text-xs text-amber-300/50 hover:text-amber-300" onClick={() => setActionResult(null)}>×</button>
            </div>
          </Card>
        ) : null}

        {tab === "overview" && stats ? (
          <>
            {/* Global stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Users" value={stats.totalUsers} />
              <StatCard label="Problems (24h)" value={stats.totalAttempts["1d"]} />
              <StatCard label="Problems (7d)" value={stats.totalAttempts["7d"]} />
              <StatCard label="Problems (30d)" value={stats.totalAttempts["30d"]} />
            </div>

            {/* Timeframe picker */}
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

            {/* User table */}
            <Card className="overflow-hidden">
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
                    {stats.users.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        timeframe={timeframe}
                        expanded={expandedUser === u.id}
                        onToggle={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                        onAction={runAction}
                        busy={actionLoading}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : null}

        {tab === "reports" ? (
          <div className="space-y-4">
            {reports.length === 0 ? (
              <Card className="p-8 text-white/50">No bad question reports yet.</Card>
            ) : (
              reports.map((r) => (
                <ReportCard
                  key={r.id}
                  report={r}
                  expanded={expandedReport === r.id}
                  onToggle={() => setExpandedReport(expandedReport === r.id ? null : r.id)}
                  onAction={runAction}
                  busy={actionLoading}
                />
              ))
            )}
          </div>
        ) : null}

        {tab === "tools" ? (
          <div className="space-y-6">
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
                    onClick={() => runAction({ action: "resetQuestions", topic: t }, `Delete all questions for "${t}"?`)}
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
                <span>24h: {user.attempts["1d"]}</span>
                <span>7d: {user.attempts["7d"]}</span>
                <span>30d: {user.attempts["30d"]}</span>
                <span>All: {user.attempts.all}</span>
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
