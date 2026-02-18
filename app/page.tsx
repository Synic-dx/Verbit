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
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">Unlimited</span> adaptive verbal aptitude training for <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">CAT</span> and <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">IPMAT</span>.
            </h1>
            <p className="text-lg text-white/60">
              Verbit generates fresh verbal questions with each click, tracks VerScore per topic, and adjusts difficulty in real time. Fast, modern, and built for serious aspirants.<br />
              <span className="text-white/40 text-xs block mt-2">Trained on 7 years of <a href="https://www.afterboards.in/past-year-questions" target="_blank" rel="noopener noreferrer" className="underline bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent hover:text-white">Official IPMAT Indore PYQs</a>.</span>
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/auth/sign-in">
                <Button size="lg">Practice for Free</Button>
              </Link>
            </div>
          </div>
          <div className="rounded-4xl border border-white/10 bg-linear-to-br from-white/5 via-white/5 to-cyan-500/10 p-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  Adaptive Score Example Snapshot
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode("verscore")}
                    className={
                      "transition hover:-translate-y-0.5" +
                      (viewMode === "verscore" ? "" : " opacity-60")
                    }
                  >
                    <Badge
                      className={
                        viewMode === "verscore"
                          ? "bg-blue-500/20 text-blue-200 border border-blue-400/40"
                          : "bg-blue-500/10 text-blue-200 border border-transparent"
                      }
                    >
                      VerScore
                    </Badge>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("percentile")}
                    className={
                      "transition hover:-translate-y-0.5" +
                      (viewMode === "percentile" ? "" : " opacity-60")
                    }
                  >
                    <Badge
                      className={
                        viewMode === "percentile"
                          ? "bg-purple-500/20 text-purple-200 border border-fuchsia-400/40"
                          : "bg-purple-500/10 text-purple-200 border border-transparent"
                      }
                    >
                      Percentile
                    </Badge>
                  </button>
                </div>
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
                      {item.score === 0 ? (
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-green-400 via-lime-200 to-yellow-50"
                          style={{ width: "100%", opacity: 0.7 }}
                        />
                      ) : ( (viewMode === "verscore" && item.score > 0) || (viewMode === "percentile" && verScoreToPercentile(item.score) > 0) ? (
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
                      ) : null )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-white/50">
                <span className="font-semibold text-white/80">VerScore</span> is a per-topic, anchor-based metric using a <span className="font-semibold text-white/80">logarithmic percentile scale</span> that represents actual examination patterns—so you know your true standing, not just a score. Every question is difficulty-rated live and <span className="font-semibold text-white/80">adaptively served</span> to match your VerScore, making each session elite and personalized. Experience real-exam rigor: <span className="font-semibold text-white/80">dual-pane RC</span>, parajumbles with free input, and a <span className="font-semibold text-white/80">fine-tuned question engine</span> modeled on PYQs and exam stats.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
