import type { Topic } from "@/lib/topics";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const IDEAL_TIME_SECONDS: Record<Topic, number> = {
  "Reading Comprehension Sets": 420,
  "Conversation Sets": 240,
  Parajumbles: 90,
  "Vocabulary Usage": 50,
  Paracompletions: 75,
  "Sentence Completions": 60,
  "Idioms & Phrases": 50,
};

export function verScoreToPercentile(verScore: number) {
  const bounded = clamp(verScore, 0, 100);
  const curve = 0.255;
  const scaled =
    Math.log10(1 + curve * bounded) / Math.log10(1 + curve * 100);
  const percentile = 50 + 50 * scaled;
  return Math.round(percentile * 10) / 10;
}

export function percentileToVerScore(percentile: number) {
  const bounded = clamp(percentile, 50, 100);
  const curve = 0.255;
  const ratio = (bounded - 50) / 50;
  const maxBase = 1 + curve * 100;
  const base = Math.pow(maxBase, ratio);
  const verScore = (base - 1) / curve;
  return Math.round(clamp(verScore, 0, 100) * 10) / 10;
}


export function updateVerScore({
  verScore,
  difficulty,
  actual,
  timeTaken,
  idealTime,
}: {
  verScore: number;
  difficulty: number;
  actual: number;
  timeTaken: number;
  idealTime: number;
}) {
  const userPercentile = verScoreToPercentile(verScore);
  const questionPercentile = verScoreToPercentile(difficulty);
  const expected =
    1 / (1 + Math.pow(10, (questionPercentile - userPercentile) / 10));
  const rawTimeFactor = idealTime / Math.max(timeTaken, 1);
  const timeFactor = clamp(rawTimeFactor, 0.75, 1.25);
  const adjustedActual = clamp(actual * timeFactor, 0, 1);
  const gap = Math.abs(questionPercentile - userPercentile);
  const gapScale = 1 + Math.log1p(gap) / Math.log(51);
  const K = 4.5;
  const nextPercentile = clamp(
    userPercentile + K * gapScale * (adjustedActual - expected),
    50,
    100
  );
  const next = percentileToVerScore(nextPercentile);

  return {
    expected,
    adjustedActual,
    timeFactor,
    next,
  };
}
