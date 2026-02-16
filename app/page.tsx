"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { verScoreToPercentile } from "@/lib/scoring";

export default function Home() {
  const snapshots = [
    [
      { label: "Reading Comprehension Sets", score: 66 },
      { label: "Parajumbles", score: 58 },
      { label: "Sentence Completions", score: 69 },
      { label: "Idioms & Phrases", score: 56 },
    ],
    [
      { label: "Conversation Sets", score: 62 },
      { label: "Vocabulary Usage", score: 71 },
      { label: "Paracompletions", score: 64 },
      { label: "Sentence Correction", score: 60 },
    ],
    [
      { label: "Sentence Completions", score: 73 },
      { label: "Idioms & Phrases", score: 59 },
      { label: "Parajumbles", score: 55 },
      { label: "Vocabulary Usage", score: 68 },
    ],
  ];

  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [viewMode, setViewMode] = useState<"verscore" | "percentile">(
    "verscore"
  );

  useEffect(() => {
    let swapId: ReturnType<typeof setTimeout> | null = null;
    const timer = setInterval(() => {
      setIsFading(true);
      swapId = setTimeout(() => {
        setSnapshotIndex((prev) => (prev + 1) % snapshots.length);
        setIsFading(false);
      }, 420);
    }, 5000);
    return () => {
      clearInterval(timer);
      if (swapId) clearTimeout(swapId);
    };
  }, [snapshots.length]);

  return (
    <div className="min-h-screen bg-grid">
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-16 px-6 py-12">
        <header className="flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-4">
            <Link href="/about" className="text-sm text-white/50 transition hover:text-white/80">
              About
            </Link>
            <Link href="/auth/sign-in">
              <Button size="sm">Sign in</Button>
            </Link>
          </nav>
        </header>

        <section className="grid gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <Badge>LLM-powered verbal practice</Badge>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Unlimited adaptive verbal aptitude training for CAT and IPMAT.
            </h1>
            <p className="text-lg text-white/60">
              Verbit generates fresh verbal questions with each click, tracks VerScore per topic,
              and adjusts difficulty in real time. Fast, modern, and built for
              serious aspirants.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/auth/sign-in">
                <Button size="lg">Start Practicing</Button>
              </Link>
            </div>
          </div>
          <div className="rounded-4xl border border-white/10 bg-linear-to-br from-white/5 via-white/5 to-cyan-500/10 p-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Adaptive Score Example Snapshot
                </h2>
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
              <div
                className="space-y-4"
                style={{ opacity: isFading ? 0 : 1, transition: "opacity 300ms ease" }}
              >
                {snapshots[snapshotIndex].map((item, index) => (
                  <div
                    key={item.label}
                    className="space-y-2"
                    style={{
                      opacity: isFading ? 0 : 1,
                      transition: "opacity 300ms ease",
                      transitionDelay: `${index * 70}ms`,
                    }}
                  >
                    <div className="flex items-center justify-between text-sm text-white/70">
                      <span>{item.label}</span>
                      <span>
                        {viewMode === "verscore"
                          ? item.score.toFixed(0)
                          : `${verScoreToPercentile(item.score).toFixed(1)}%ile`}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div
                        className={
                          viewMode === "verscore"
                            ? "h-2 rounded-full bg-linear-to-r from-blue-400 via-sky-400 to-cyan-400"
                            : "h-2 rounded-full bg-linear-to-r from-purple-400 via-fuchsia-400 to-indigo-400"
                        }
                        style={{
                          width: `${
                            viewMode === "verscore"
                              ? item.score
                              : verScoreToPercentile(item.score)
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-white/50">
                VerScore uses a logarithmic scale: 0 maps to the 50th percentile,
                50 maps to about the 90th, and 100 maps to the 100th. Each update
                converts your VerScore to a live percentile so you see your
                standing instantly.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
