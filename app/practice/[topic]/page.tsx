"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TOPICS } from "@/lib/topics";

type NormalQuestion = {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
  difficulty: number;
};

type RCQuestion = {
  id: string;
  topic: string;
  passage: string;
  passageTitle: string;
  questions: {
    text: string;
    options: string[];
    explanation: string;
  }[];
  difficulty: number;
};

type PJQuestion = {
  id: string;
  topic: string;
  pjSentences: string[];
  difficulty: number;
};

type Question = NormalQuestion | RCQuestion | PJQuestion;

type SubmitResponse = {
  correct: boolean;
  newVerScore: number;
  percentile: number;
  correctIndex: number | null;
  correctIndices: (number | null)[];
  pjCorrectOrder: string | null;
};

const isRC = (q: Question): q is RCQuestion =>
  "passage" in q && typeof q.passage === "string" && q.passage.length > 0;
const isPJ = (q: Question): q is PJQuestion =>
  "pjSentences" in q && Array.isArray(q.pjSentences) && q.pjSentences.length > 0;

export default function PracticePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const topic = useMemo(() => decodeURIComponent(String(params.topic ?? "")), [params]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [rcAnswers, setRcAnswers] = useState<number[]>(Array(6).fill(-1));
  const [pjInput, setPjInput] = useState("");
  const [submitted, setSubmitted] = useState<SubmitResponse | null>(null);
  const [explanations, setExplanations] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [removing, setRemoving] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/sign-in");
    }
  }, [status, router]);

  const loadQuestion = useCallback(async () => {
    if (!TOPICS.includes(topic as any)) return;

    setLoading(true);
    const res = await fetch(`/api/question?topic=${encodeURIComponent(topic)}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setQuestion(data);
    setSelected(null);
    setRcAnswers(Array(6).fill(-1));
    setPjInput("");
    setSubmitted(null);
    setExplanations([]);
    setReportFeedback(null);
    setStartTime(Date.now());
    setLoading(false);
  }, [topic]);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  const handleSubmit = async () => {
    if (!question) return;

    const timeTaken = Math.max(1, Math.round((Date.now() - startTime) / 1000));

    const answer = isRC(question)
      ? rcAnswers
      : isPJ(question)
      ? pjInput
      : selected;

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: question.id,
        topic,
        answer,
        timeTaken,
      }),
    });

    if (!res.ok) return;

    const data = (await res.json()) as SubmitResponse;
    setSubmitted(data);

    if (isRC(question)) {
      setExplanations(question.questions.map((q) => q.explanation));
    } else if (!isPJ(question)) {
      setExplanations([question.explanation ?? ""]);
    }
  };

  const removeBadQuestion = async () => {
    if (!question) return;
    setRemoving(true);
    const res = await fetch(`/api/question/${question.id}`, { method: "DELETE" });
    if (res.ok) {
      const data = await res.json();
      setReportFeedback(data.analysis ?? "Question removed.");
      setTimeout(() => loadQuestion(), 2500);
    } else {
      loadQuestion();
    }
    setRemoving(false);
  };

  if (!session?.user) {
    return <div className="min-h-screen bg-grid" />;
  }

  if (!TOPICS.includes(topic as any)) {
    return (
      <div className="min-h-screen bg-grid px-6 py-12">
        <Card className="mx-auto max-w-lg p-8 text-white/70">
          Unknown topic. Head back to the dashboard to choose a valid topic.
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Practice
            </p>
            <h1 className="text-2xl font-semibold text-white">{topic}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard">
              <Button size="sm" variant="secondary">
                Home
              </Button>
            </Link>
            {submitted ? (
              <Badge className={submitted.correct ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}>
                {submitted.correct ? "Correct" : "Incorrect"}
              </Badge>
            ) : null}
            {question && !loading ? (
              <button
                className="text-xs text-white/20 underline decoration-white/10 transition hover:text-white/40"
                onClick={removeBadQuestion}
                disabled={removing}
              >
                {removing ? "Removing…" : "Report bad question"}
              </button>
            ) : null}
          </div>
        </header>

        {loading || !question ? (
          <Card className="p-10 text-white/70">Loading question...</Card>
        ) : isRC(question) ? (
          <div className="grid h-screen grid-cols-1 gap-6 overflow-hidden lg:grid-cols-2">
            <Card className="flex h-full flex-col overflow-hidden">
              <div className="sticky top-0 z-10 border-b border-white/10 bg-black/80 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">
                  {question.passageTitle}
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto scroll-smooth px-6 py-4 text-white/80">
                {question.passage}
              </div>
            </Card>
            <Card className="flex h-full flex-col overflow-hidden">
              <div className="sticky top-0 z-10 border-b border-white/10 bg-black/80 px-6 py-4">
                <h3 className="text-lg font-semibold text-white">Questions</h3>
              </div>
              <div className="flex-1 space-y-6 overflow-y-auto scroll-smooth px-6 py-6">
                {question.questions.map((q, index) => (
                  <div key={q.text} className="space-y-3">
                    <p className="text-white">{index + 1}. {q.text}</p>
                    <div className="grid gap-2">
                      {q.options.map((opt, optIndex) => (
                        <button
                          key={opt}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            submitted
                              ? submitted.correctIndices[index] === optIndex
                                ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                                : rcAnswers[index] === optIndex
                                  ? "border-rose-500 bg-rose-500/15 text-rose-200"
                                  : "border-white/10 text-white/40"
                              : rcAnswers[index] === optIndex
                                ? "border-white bg-white/10"
                                : "border-white/10 hover:border-white/30"
                          }`}
                          onClick={() => {
                            const next = [...rcAnswers];
                            next[index] = optIndex;
                            setRcAnswers(next);
                          }}
                          disabled={Boolean(submitted)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {submitted ? (
                      <p className="text-xs text-white/50">{q.explanation}</p>
                    ) : null}
                  </div>
                ))}
                <div className="flex items-center justify-end gap-3 pt-4">
                  {!submitted ? (
                    <Button onClick={handleSubmit} disabled={rcAnswers.some((a) => a === -1)}>
                      Submit
                    </Button>
                  ) : (
                    <Button onClick={loadQuestion}>
                      Next →
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        ) : isPJ(question) ? (
          <Card className="space-y-6 p-8">
            <div className="flex items-center justify-between">
              <Badge>Parajumbles</Badge>
              <Badge>Difficulty {question.difficulty}</Badge>
            </div>
            <div className="space-y-3 text-white/80">
              {question.pjSentences.map((sentence, index) => (
                <p key={sentence}>
                  {String.fromCharCode(65 + index)}. {sentence}
                </p>
              ))}
            </div>
            <Input
              placeholder="Example: B D A C"
              value={pjInput}
              onChange={(event) => setPjInput(event.target.value)}
              disabled={Boolean(submitted)}
            />
            <div className="flex items-center justify-end gap-3">
              {!submitted ? (
                <Button onClick={handleSubmit} disabled={Boolean(submitted)}>
                  Submit
                </Button>
              ) : (
                <Button onClick={loadQuestion}>
                  Next →
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card className="space-y-6 p-8">
            <div className="flex items-center justify-between">
              <Badge>Difficulty {question.difficulty}</Badge>
              <Progress value={question.difficulty} className="max-w-45" />
            </div>
            <div className="space-y-4">
              <p className="text-lg text-white">{question.question}</p>
              <div className="grid gap-3">
                {question.options.map((option, index) => (
                  <button
                    key={option}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      submitted
                        ? submitted.correctIndex === index
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                          : selected === index
                            ? "border-rose-500 bg-rose-500/15 text-rose-200"
                            : "border-white/10 text-white/40"
                        : selected === index
                          ? "border-white bg-white/10"
                          : "border-white/10 hover:border-white/30"
                    }`}
                    onClick={() => setSelected(index)}
                    disabled={Boolean(submitted)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            {submitted ? (
              <p className="text-sm text-white/60">{explanations[0]}</p>
            ) : null}
            <div className="flex items-center justify-end gap-3">
              {!submitted ? (
                <Button onClick={handleSubmit} disabled={selected === null}>
                  Submit
                </Button>
              ) : (
                <Button onClick={loadQuestion}>
                  Next →
                </Button>
              )}
            </div>
          </Card>
        )}

        {submitted ? (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="text-sm text-white/60">Question VerScore</p>
              <p className="text-2xl font-semibold text-white">
                {question?.difficulty.toFixed(1)}
              </p>
            </div>
            <div>
              <p className="text-sm text-white/60">Your VerScore</p>
              <p className="text-2xl font-semibold text-white">
                {submitted.newVerScore.toFixed(1)}
              </p>
            </div>
          </Card>
        ) : null}

        {reportFeedback ? (
          <Card className="border-rose-500/30 bg-rose-500/5 p-6">
            <p className="text-xs uppercase tracking-widest text-rose-400">Bad Question Report</p>
            <p className="mt-2 text-sm text-white/70">{reportFeedback}</p>
            <p className="mt-1 text-xs text-white/40">This feedback has been saved — future questions will avoid this mistake.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
