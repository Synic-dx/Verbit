"use client";

import React, { useEffect, useMemo, useState } from "react";
// ── AnalyticsChart: SVG with axes, labels, tooltips ─────────────
function AnalyticsChart({ chart, viewMode }: { chart: any; viewMode: "verscore" | "percentile" }) {
  const [hovered, setHovered] = React.useState<number | null>(null);
  return (
    <div className="overflow-x-auto">
      <svg
        width="100%"
        height={chart.height + 40}
        viewBox={`0 0 ${chart.width} ${chart.height + 40}`}
        style={{ minWidth: 400 }}
      >
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={viewMode === "verscore" ? "#60a5fa" : "#c084fc"} />
            <stop offset="100%" stopColor={viewMode === "verscore" ? "#22d3ee" : "#818cf8"} />
          </linearGradient>
        </defs>
        {/* Axes */}
        <line x1={28} y1={chart.height - 28} x2={chart.width - 28} y2={chart.height - 28} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
        <line x1={28} y1={28} x2={28} y2={chart.height - 28} stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} />
        {/* Y ticks and labels */}
        {chart.yTicks.map((tick: any, i: number) => (
          <g key={i}>
            <line x1={24} y1={tick.y} x2={28} y2={tick.y} stroke="#fff" strokeWidth={1} />
            <text x={12} y={tick.y + 4} fontSize={11} fill="#fff" textAnchor="end">{tick.value}</text>
          </g>
        ))}
        {/* X ticks and labels: time (top), date (bottom) */}
        {chart.xTicks.map((tick: any, i: number) => (
          <g key={i}>
            <line x1={tick.x} y1={chart.height - 28} x2={tick.x} y2={chart.height - 24} stroke="#fff" strokeWidth={1} />
            <text x={tick.x} y={chart.height - 18} fontSize={11} fill="#fff" textAnchor="middle">{tick.label.time}</text>
            <text x={tick.x} y={chart.height - 6} fontSize={10} fill="#fff" textAnchor="middle">{tick.label.date}</text>
          </g>
        ))}
        {/* Axis labels */}
        <text x={chart.width / 2} y={chart.height + 18} fontSize={13} fill="#fff" textAnchor="middle">Time</text>
        <text
          x={-32}
          y={chart.height / 2}
          fontSize={13}
          fill="#fff"
          textAnchor="middle"
          fontWeight="600"
          transform={`rotate(-90 -32,${chart.height / 2})`}
        >
          {viewMode === "verscore" ? "VerScore" : "Percentile"}
        </text>
        {/* Chart line */}
        <path d={chart.path} fill="none" stroke="url(#lineGradient)" strokeWidth="3" />
        {/* Dots and tooltips */}
        {chart.dots.map((point: any, index: number) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r={hovered === index ? 7 : 4}
              fill={viewMode === "verscore" ? "#7dd3fc" : "#d8b4fe"}
              stroke="#fff"
              strokeWidth={hovered === index ? 2 : 0}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setHovered(index)}
            />
            {hovered === index && (
              <foreignObject
                x={point.x - 70}
                y={point.y - 60}
                width={140}
                height={60}
                style={{ pointerEvents: "none" }}
              >
                <div
                  style={{
                    background: "#222",
                    border: "1px solid #fff",
                    borderRadius: 8,
                    opacity: 0.95,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    padding: "7px 12px 4px 12px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <span style={{ whiteSpace: "nowrap" }}>
                    {viewMode === "verscore"
                      ? `VerScore: ${point.value.toFixed(1)}`
                      : `Percentile: ${point.value.toFixed(1)}`}
                  </span>
                  <span style={{ fontWeight: 400, fontSize: 11, marginTop: 2 }}>
                    {point.label.time}
                  </span>
                  <span style={{ fontWeight: 400, fontSize: 11, marginTop: 0 }}>
                    {point.label.date}
                  </span>
                </div>
              </foreignObject>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
import Link from "next/link";
import { useSession } from "next-auth/react";

import { TOPICS, Topic } from "@/lib/topics";
import {
  percentileToVerScore,
  verScoreToPercentile,
} from "@/lib/scoring";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import SignOutButton from "@/components/sign-out-button";

type AttemptPoint = {
  id: string;
  createdAt: string;
  verScore: number;
  percentile: number;
  correct: boolean;
  timeTaken: number;
  difficulty: number;
};

type Summary = {
  total: number;
  correct: number;
  accuracy: number;
  avgTime: number;
  lastVerScore: number;
  lastPercentile: number;
};

type AnalyticsResponse = {
  summary: Summary;
  attempts: AttemptPoint[];
};

const DEFAULT_TOPIC = TOPICS[0];

export default function AnalyticsClient() {
  const { data: session } = useSession();
  const [topic, setTopic] = useState<Topic>(DEFAULT_TOPIC);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [viewMode, setViewMode] = useState<"verscore" | "percentile">(
    "verscore"
  );
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isActive = true;
    const fetchAnalytics = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("topic", topic);
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (!res.ok) {
        setData(null);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as AnalyticsResponse;
      if (isActive) {
        setData(json);
        setLoading(false);
      }
    };

    fetchAnalytics();

    return () => {
      isActive = false;
    };
  }, [topic, start, end]);

  const points = data?.attempts ?? [];

  const chart = useMemo(() => {
    const width = 640;
    const height = 240;
    const padding = 28;
    if (!points.length) {
      return { width, height, path: "", dots: [], xTicks: [], yTicks: [], xLabels: [], yLabels: [] };
    }

    const scaledValues = points.map((item) => {
      const value = viewMode === "verscore" ? item.verScore : item.percentile;
      return value;
    });

    const maxValue = 100;
    const usableWidth = width - padding * 2;
    const usableHeight = height - padding * 2;

    // X axis: time (hour:minute AM/PM) and date
    const xLabels = points.map((item) => {
      const d = new Date(item.createdAt);
      return {
        time: d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
        date: d.toLocaleDateString()
      };
    });

    const dots = scaledValues.map((value, index) => {
      const x =
        points.length === 1
          ? width / 2
          : padding + (index / (points.length - 1)) * usableWidth;
      const y = padding + (1 - value / maxValue) * usableHeight;
      return { x, y, value, label: xLabels[index], raw: points[index] };
    });

    const path = dots
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
      .join(" ");

    // X ticks: 5 evenly spaced
    const xTicks = Array.from({ length: Math.min(5, points.length) }, (_, i) => {
      const idx = Math.round((i / 4) * (points.length - 1));
      const x =
        points.length === 1
          ? width / 2
          : padding + (idx / (points.length - 1)) * usableWidth;
      return { x, label: xLabels[idx] };
    });

    // Y ticks: 5 evenly spaced
    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const value = maxValue - (i * maxValue) / 4;
      const y = padding + (1 - value / maxValue) * usableHeight;
      return { y, value: Math.round(value) };
    });

    return { width, height, path, dots, xTicks, yTicks };
  }, [points, viewMode]);

  const summary = data?.summary;
  const displayValue = viewMode === "verscore" ? summary?.lastVerScore ?? 0 : summary?.lastPercentile ?? 0;
  const altValue =
    viewMode === "verscore"
      ? summary
        ? verScoreToPercentile(summary.lastVerScore)
        : 0
      : summary
        ? percentileToVerScore(summary.lastPercentile)
        : 0;

  return (
    <div className="min-h-screen bg-grid">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Logo />
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
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
              >
                Analytics
              </Link>
              <Link
                href="/about"
                className="rounded-full px-4 py-2 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                About
              </Link>
              {session?.user?.isAdmin ? (
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

        <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-[0.3em] text-white/40">
                Topic
              </span>
              <select
                value={topic}
                onChange={(event) => setTopic(event.target.value as Topic)}
                className="rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white"
              >
                {TOPICS.map((item) => (
                  <option key={item} value={item} className="text-black">
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-[0.3em] text-white/40">
                Start date
              </span>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-[0.3em] text-white/40">
                End date
              </span>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setViewMode((prev) =>
                    prev === "verscore" ? "percentile" : "verscore"
                  )
                }
                className="transition hover:-translate-y-0.5"
              >
                <Badge
                  className={
                    viewMode === "verscore"
                      ? "bg-blue-500/20 text-blue-200"
                      : "bg-purple-500/20 text-purple-200"
                  }
                >
                  {viewMode === "verscore" ? "VerScore" : "Percentile"}
                </Badge>
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Attempts
            </p>
            <p className="text-2xl font-semibold text-white">
              {summary?.total ?? 0}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Accuracy
            </p>
            <p className="text-2xl font-semibold text-white">
              {summary?.accuracy ?? 0}%
            </p>
            <p className="text-xs text-white/50">
              {summary?.correct ?? 0} correct
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Avg time
            </p>
            <p className="text-2xl font-semibold text-white">
              {summary?.avgTime ?? 0}s
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Latest
            </p>
            <p className="text-2xl font-semibold text-white">
              {displayValue.toFixed(1)}
              {viewMode === "percentile" ? "%" : ""}
            </p>
            <p className="text-xs text-white/50">
              {viewMode === "verscore"
                ? `Percentile ${altValue.toFixed(1)}%ile`
                : `VerScore ${altValue.toFixed(1)}`}
            </p>
          </Card>
        </section>

        <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {viewMode === "verscore" ? "VerScore movement" : "Percentile movement"}
              </h2>
              <p className="text-sm text-white/50">
                {topic} · {points.length} attempts
              </p>
            </div>
            {loading ? <Badge>Loading</Badge> : null}
          </div>
          {points.length === 0 && !loading ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-white/60">
              No attempts in this range yet. Try a wider date range.
            </div>
          ) : (
            <AnalyticsChart chart={chart} viewMode={viewMode} />
          )}
        </section>
      </div>
    </div>
  );
}
