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


// Anchor points for VerScore to Percentile mapping
const ANCHORS: [number, number][] = [
  [0, 50],
  [50, 90],
  [65, 95],
  [75, 98],
  [85, 99],
  [95, 99.8],
  [100, 100],
];

/**
 * Piecewise linear mapping from VerScore (0-100) to percentile using anchor points.
 */
export function verScoreToPercentile(verScore: number): number {
  const v = clamp(verScore, 0, 100);
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [v0, p0] = ANCHORS[i];
    const [v1, p1] = ANCHORS[i + 1];
    if (v >= v0 && v <= v1) {
      // Linear interpolation
      const t = (v - v0) / (v1 - v0);
      return Math.round((p0 + t * (p1 - p0)) * 10) / 10;
    }
  }
  return 100;
}

/**
 * Inverse piecewise linear mapping from percentile (50-100) to VerScore using anchor points.
 */
export function percentileToVerScore(percentile: number): number {
  const p = clamp(percentile, 50, 100);
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const [v0, p0] = ANCHORS[i];
    const [v1, p1] = ANCHORS[i + 1];
    if (p >= p0 && p <= p1) {
      // Linear interpolation
      const t = (p - p0) / (p1 - p0);
      return Math.round((v0 + t * (v1 - v0)) * 10) / 10;
    }
  }
  return 100;
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
  const timeFactor = clamp(rawTimeFactor, 0.6, 1.4);
  const gap = Math.abs(questionPercentile - userPercentile);
  const gapScale = 1 + Math.log1p(gap) / Math.log(51);
  const K = 4.5;
  const delta = K * gapScale * (actual - expected);
  const speedAdjustedDelta = delta * timeFactor;
  const nextPercentile = clamp(
    userPercentile + speedAdjustedDelta,
    50,
    100
  );
  const next = percentileToVerScore(nextPercentile);

  return {
    expected,
    adjustedActual: actual,
    timeFactor,
    next,
  };
}

/* ── Calibration ────────────────────────────────────────────── */

/** Ten predetermined difficulty levels spanning the full range. */
export const CALIBRATION_DIFFICULTIES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export const CALIBRATION_TOTAL = CALIBRATION_DIFFICULTIES.length;

/** RC/Conversation sets use only 3 calibration sets at varied difficulties. */
export const CALIBRATION_DIFFICULTIES_RC = [30, 60, 90] as const;
export const CALIBRATION_TOTAL_RC = CALIBRATION_DIFFICULTIES_RC.length;

/** Returns the calibration config for a given topic. */
export function getCalibrationConfig(topic: Topic): { difficulties: readonly number[]; total: number } {
  if (topic === "Reading Comprehension Sets" || topic === "Conversation Sets") {
    return { difficulties: CALIBRATION_DIFFICULTIES_RC, total: CALIBRATION_TOTAL_RC };
  }
  return { difficulties: CALIBRATION_DIFFICULTIES, total: CALIBRATION_TOTAL };
}

/* ── Dynamic question difficulty (IRT-inspired) ────────────── */

/**
 * Adjust a question's stored difficulty after each attempt using an
 * Item Response Theory–inspired update.
 *
 * Sigmoid models the expected probability of success:
 *   P = 1 / (1 + exp(-(θ − b) / s))
 * where θ = solver verScore, b = question difficulty, s = scale.
 *
 * The "surprise" (actual − expected) is speed-adjusted, then applied
 * with a learning rate that decays with sqrt(attemptCount) so that
 * well-tested questions stabilise.
 */
export function updateQuestionDifficulty({
  currentDifficulty,
  solverVerScore,
  actual,
  timeTaken,
  idealTime,
  attemptCount,
}: {
  currentDifficulty: number;
  solverVerScore: number;
  actual: number;       // 0-1 (partial for RC/Conversation)
  timeTaken: number;    // seconds
  idealTime: number;    // seconds
  attemptCount: number; // how many times this question has been attempted
}): number {
  const SCALE = 15;        // sigmoid spread
  const BASE_RATE = 2.5;   // base learning rate

  // IRT expected probability of success
  const exponent = -(solverVerScore - currentDifficulty) / SCALE;
  const expectedP = 1 / (1 + Math.exp(exponent));

  // Surprise: positive = user did better than expected (question is easier)
  const surprise = actual - expectedP;

  // Speed adjustment — fast success amplifies ease signal, slow amplifies hard
  const rawTimeFactor = idealTime / Math.max(timeTaken, 1);
  const timeFactor = clamp(rawTimeFactor, 0.6, 1.4);
  const speedSurprise = surprise * timeFactor;

  // Learning rate decays with more data → question rating stabilises
  const effectiveRate = BASE_RATE / (1 + 0.3 * Math.sqrt(Math.max(attemptCount, 0)));

  // Negative surprise → harder than rated → increase difficulty; and vice versa
  const delta = -effectiveRate * speedSurprise;
  const newDifficulty = clamp(
    Math.round((currentDifficulty + delta) * 10) / 10,
    1,
    100,
  );

  return newDifficulty;
}

/**
 * Compute an initial verScore from calibration results.
 * Uses a blend of difficulty-weighted accuracy (60 %) and raw accuracy (40 %)
 * so that getting hard questions right yields a higher score than easy ones.
 * When time data is provided, speed adjusts the effective accuracy.
 */
export function computeCalibrationScore(
  attempts: { difficulty: number; actual: number; timeTaken?: number; idealTime?: number }[]
): number {
  if (attempts.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;
  let rawSum = 0;

  for (const { difficulty, actual, timeTaken, idealTime } of attempts) {
    let effectiveActual = actual;
    if (timeTaken && idealTime && timeTaken > 0) {
      const rawTF = idealTime / timeTaken;
      const tf = clamp(rawTF, 0.6, 1.4);
      effectiveActual = clamp(actual * tf, 0, 1);
    }
    weightedSum += effectiveActual * difficulty;
    weightTotal += difficulty;
    rawSum += effectiveActual;
  }

  const weightedAccuracy = weightedSum / weightTotal; // 0-1
  const rawAccuracy = rawSum / attempts.length; // 0-1
  const blended = 0.6 * weightedAccuracy + 0.4 * rawAccuracy;

  return Math.round(clamp(blended * 100, 0, 100) * 10) / 10;
}
