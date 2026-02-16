"use client";


import Link from "next/link";
import { useEffect, useState } from "react";
import Head from "next/head";
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
    <>
      <Head>
        <title>Verbit | Free IPMAT & CAT Verbal Ability Practice, PYQs, Adaptive AI</title>
        <meta name="description" content="Practice IPMAT Indore Verbal Ability with 274 official PYQs, adaptive AI question generator, and real-time VerScore. Free, modern, and built for CAT/IPMAT aspirants. No coaching, no paywall. Provided by AfterBoards." />
        <meta name="keywords" content="IPMAT verbal ability, IPMAT Indore PYQ, CAT verbal practice, free IPMAT questions, AI question generator, adaptive verbal aptitude, IPMAT 2026, IIM Indore entrance, IPMAT English, IPMAT mock test, IPMAT solved papers, AfterBoards, RAG model, online verbal practice, IPMAT study material, IPMAT tips, IPMAT coaching alternative" />
        <meta property="og:title" content="Verbit | Free IPMAT & CAT Verbal Ability Practice" />
        <meta property="og:description" content="Practice with 274 official IPMAT Indore VA PYQs, adaptive AI, and real exam patterns. 100% free. Provided by AfterBoards." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://verbit.afterboards.in/" />
      </Head>
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
              <Badge>IPMAT Indore VA PYQ • AI Verbal Practice • Free</Badge>
              <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
                Adaptive Verbal Ability Practice for <span className="text-amber-300">IPMAT Indore</span> &amp; <span className="text-amber-300">CAT</span>
              </h1>
              <p className="text-lg text-white/60">
                Practice with <b>274 official IPMAT Indore Verbal Ability PYQs</b> (provided by <a href="https://www.afterboards.in/past-year-questions" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-100">AfterBoards</a>), plus unlimited AI-generated questions. Adaptive scoring, real exam patterns, and instant feedback. 100% free. No coaching, no paywall.
              </p>
              <ul className="list-disc pl-5 text-white/70 text-base space-y-1">
                <li>All <b>official IPMAT Indore VA PYQs</b> (2019–2025) included</li>
                <li>Adaptive AI question generator (RAG model)</li>
                <li>Topic-wise VerScore &amp; percentile tracking</li>
                <li>Real exam-style MCQs, parajumbles, RC, idioms, and more</li>
                <li>Mobile-friendly, fast, and distraction-free</li>
              </ul>
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
    </>
  );
}
