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
  "Sentence Correction": 60,
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

/* ── Calibration ────────────────────────────────────────────── */

/** Ten predetermined difficulty levels spanning the full range. */
export const CALIBRATION_DIFFICULTIES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export const CALIBRATION_TOTAL = CALIBRATION_DIFFICULTIES.length;

/**
 * Compute an initial verScore from calibration results.
 * Uses a blend of difficulty-weighted accuracy (60 %) and raw accuracy (40 %)
 * so that getting hard questions right yields a higher score than easy ones.
 */
export function computeCalibrationScore(
  attempts: { difficulty: number; actual: number }[]
): number {
  if (attempts.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;
  let rawSum = 0;

  for (const { difficulty, actual } of attempts) {
    weightedSum += actual * difficulty;
    weightTotal += difficulty;
    rawSum += actual;
  }

  const weightedAccuracy = weightedSum / weightTotal; // 0-1
  const rawAccuracy = rawSum / attempts.length; // 0-1
  const blended = 0.6 * weightedAccuracy + 0.4 * rawAccuracy;

  return Math.round(clamp(blended * 100, 0, 100) * 10) / 10;
}
