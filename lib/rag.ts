import OpenAI from "openai";
import { Types } from "mongoose";
import type { Topic } from "@/lib/topics";
import { connectDb } from "@/lib/db";
import { PYQExampleModel } from "@/models/PYQExample";
import { BadReportModel } from "@/models/BadReport";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RAGExample {
  topic: string;
  difficulty: number;
  percentile: number;
  content: string;
  summary: string;
  distance: number;
}

export interface BadPattern {
  rule: string;
  analysis: string;
  questionType: "rc" | "pj" | "normal";
  snippet: string;
}

// ─── Embedding cache (module-level, persists for process lifetime) ─────────────

interface CachedEntry {
  id: string;
  topic: string;
  difficulty: number;
  percentile: number;
  embedding: number[];
}

let _embCache: Map<string, CachedEntry[]> | null = null;
let _embCacheExpiry = 0;
const EMB_CACHE_TTL = 20 * 60 * 1000; // 20 min

// ─── Math helpers ─────────────────────────────────────────────────────────────

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

// ─── Embedding generation ─────────────────────────────────────────────────────

/** Embed a text string with text-embedding-3-small (1536 dims). */
async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

/**
 * Build a rich text representation of a PYQ for embedding.
 * We want the embedding to capture topic domain + question style + difficulty cues.
 */
export function pyqEmbeddingText(
  content: string,
  summary: string,
  topic: string
): string {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;

    // RC / Conversation: embed title + passage excerpt + question types
    if (parsed.passage) {
      const passageSnippet = (parsed.passage as string)
        .replace(/<br\s*\/?>/gi, " ")
        .slice(0, 700);
      const qTypes = ((parsed.questions ?? []) as any[])
        .map((q: any) => q.text?.slice(0, 80) ?? "")
        .join(" | ");
      return `[${topic}] Title: ${parsed.passageTitle ?? ""}\nSummary: ${summary}\nPassage: ${passageSnippet}\nQuestions: ${qTypes}`;
    }

    // Parajumbles: embed all sentences
    if (parsed.pjSentences) {
      return `[${topic}] Summary: ${summary}\nSentences: ${(parsed.pjSentences as string[]).join(" ")}`;
    }

    // MCQ-type questions
    const question = (parsed.question ?? "").slice(0, 500);
    const opts = ((parsed.options ?? []) as string[]).slice(0, 4).join(" | ");
    return `[${topic}] Summary: ${summary}\nQuestion: ${question}\nOptions: ${opts}`;
  } catch {
    return `[${topic}] ${summary}`;
  }
}

// ─── Cache loading ────────────────────────────────────────────────────────────

async function loadEmbeddingCache(): Promise<Map<string, CachedEntry[]>> {
  await connectDb();
  const docs = await PYQExampleModel.find(
    // "embedding.0" exists ⟹ array is non-empty
    { "embedding.0": { $exists: true } },
    { topic: 1, difficulty: 1, percentile: 1, embedding: 1 }
  ).lean();

  const map = new Map<string, CachedEntry[]>();
  for (const doc of docs as any[]) {
    const t = doc.topic as string;
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push({
      id: String(doc._id),
      topic: t,
      difficulty: doc.difficulty as number,
      percentile: doc.percentile as number,
      embedding: doc.embedding as number[],
    });
  }
  return map;
}

// ─── PYQ retrieval (semantic + difficulty-weighted) ───────────────────────────

/**
 * Retrieve top-K PYQs for a generation context.
 *
 * When embeddings are available: uses semantic similarity (65%) + difficulty
 * proximity (35%) to find PYQs that are topically AND difficulty-relevant.
 *
 * Falls back to difficulty-only sort when embeddings haven't been seeded yet.
 *
 * @param queryContext - short string describing what's being generated
 *   (e.g., "Reading Comprehension Sets 95th percentile passage about policy")
 */
export async function retrieveExamples(
  topic: Topic,
  difficulty: number,
  topK = 5,
  queryContext?: string
): Promise<RAGExample[]> {
  await connectDb();

  // Refresh embedding cache if stale
  const now = Date.now();
  if (!_embCache || now > _embCacheExpiry) {
    try {
      _embCache = await loadEmbeddingCache();
    } catch {
      _embCache = new Map();
    }
    _embCacheExpiry = now + EMB_CACHE_TTL;
  }

  const cached = _embCache.get(topic) ?? [];

  // ── Semantic search path ──────────────────────────────────────────────────
  if (cached.length >= topK && queryContext) {
    try {
      const qEmb = await embed(queryContext);

      const scored = cached
        .map((c) => ({
          id: c.id,
          difficulty: c.difficulty,
          score:
            0.65 * cosineSim(qEmb, c.embedding) +
            0.35 * (1 - Math.abs(c.difficulty - difficulty) / 100),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      const ids = scored.map((s) => new Types.ObjectId(s.id));
      const docs = await PYQExampleModel.find(
        { _id: { $in: ids } },
        { content: 1, summary: 1, difficulty: 1, percentile: 1, topic: 1 }
      ).lean();

      const docMap = new Map((docs as any[]).map((d) => [String(d._id), d]));
      const results = scored
        .map((s) => docMap.get(s.id))
        .filter(Boolean)
        .map((doc: any) => ({
          topic: doc.topic as string,
          difficulty: doc.difficulty as number,
          percentile: doc.percentile as number,
          content: doc.content as string,
          summary: doc.summary as string,
          distance: 0,
        }));

      if (results.length > 0) return results;
    } catch (err) {
      console.warn("[RAG] Semantic search failed, using difficulty fallback:", err);
    }
  }

  // ── Difficulty-proximity fallback ─────────────────────────────────────────
  const docs = await PYQExampleModel.find(
    { topic },
    { content: 1, summary: 1, difficulty: 1, percentile: 1, topic: 1 }
  ).lean();

  if (docs.length === 0) return [];

  return (docs as any[])
    .map((d) => ({
      topic: d.topic as string,
      difficulty: d.difficulty as number,
      percentile: d.percentile as number,
      content: d.content as string,
      summary: d.summary as string,
      distance: Math.abs((d.difficulty as number) - difficulty),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topK);
}

// ─── Prompt formatters ────────────────────────────────────────────────────────

/**
 * Format retrieved PYQ examples into the system prompt.
 * Each example is shown with difficulty, percentile, and full content (up to 1500 chars).
 */
export function formatExamplesForPrompt(examples: RAGExample[]): string {
  if (examples.length === 0) return "";

  const blocks = examples.map((ex, i) => {
    let parsed: unknown;
    try {
      parsed = typeof ex.content === "string" ? JSON.parse(ex.content) : ex.content;
    } catch {
      parsed = ex.content;
    }
    const truncated = JSON.stringify(parsed, null, 2).slice(0, 1500);
    return (
      `--- PYQ Example ${i + 1} | Topic: ${ex.topic} | Difficulty: ${ex.difficulty} | Percentile: ${ex.percentile} ---\n` +
      truncated
    );
  });

  return (
    "\n\nREAL PAST-YEAR EXAM EXAMPLES (highest relevance to what you are generating). " +
    "Closely study their style, depth, vocabulary, question construction, and answer logic:\n\n" +
    blocks.join("\n\n")
  );
}

// ─── Bad-pattern RAG ─────────────────────────────────────────────────────────

/**
 * Retrieve bad-report patterns for a topic, preferring same question type,
 * deduplicated by rule prefix so the prompt isn't flooded with repeats.
 */
export async function retrieveBadPatterns(
  topic: Topic,
  schemaName: "rc" | "pj" | "normal",
  topK = 10
): Promise<BadPattern[]> {
  await connectDb();

  const reports = await BadReportModel.find(
    { topic, rule: { $exists: true, $ne: "" } },
    { rule: 1, analysis: 1, questionSnapshot: 1 }
  )
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();

  if (reports.length === 0) return [];

  const typed = (reports as any[]).map((r) => {
    const snap = r.questionSnapshot ?? {};
    const qType: "rc" | "pj" | "normal" =
      snap.passage || snap.passageTitle
        ? "rc"
        : snap.pjSentences
        ? "pj"
        : "normal";

    let snippet = "";
    if (qType === "rc") snippet = (snap.passageTitle ?? "").slice(0, 100);
    else if (qType === "pj")
      snippet = ((snap.pjSentences as string[] | undefined)?.[0] ?? "").slice(0, 100);
    else snippet = (snap.question ?? "").slice(0, 100);

    return { rule: r.rule as string, analysis: r.analysis as string, questionType: qType, snippet };
  });

  // Same-type first
  const ordered = [
    ...typed.filter((r) => r.questionType === schemaName),
    ...typed.filter((r) => r.questionType !== schemaName),
  ];

  const seenKeys = new Set<string>();
  const deduped: BadPattern[] = [];
  for (const r of ordered) {
    const key = r.rule.toLowerCase().replace(/\s+/g, " ").slice(0, 55);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(r);
    if (deduped.length >= topK) break;
  }

  return deduped;
}

export function formatBadPatternsForPrompt(patterns: BadPattern[]): string {
  if (patterns.length === 0) return "";

  const typeLabel = (t: BadPattern["questionType"]) =>
    t === "rc" ? "RC/Conversation" : t === "pj" ? "Parajumbles" : "MCQ";

  const blocks = patterns.map((p, i) => {
    const snippetLine = p.snippet ? `\n   Bad example: "${p.snippet}..."` : "";
    return (
      `${i + 1}. [${typeLabel(p.questionType)}]\n` +
      `   Rule: ${p.rule}\n` +
      `   Why flagged: ${p.analysis.slice(0, 200)}` +
      snippetLine
    );
  });

  return (
    "\n\nCRITICAL — These exact mistakes were found in previously generated questions. " +
    "Do NOT repeat any of these patterns:\n\n" +
    blocks.join("\n\n")
  );
}

// ─── Cache invalidation ───────────────────────────────────────────────────────

/**
 * Force-invalidate the bad-pattern in-process cache.
 * Call this immediately after a new BadReport is written so the next
 * generation call picks up the new rule without waiting for TTL expiry.
 *
 * Note: only invalidates the current process instance. In a multi-replica
 * deployment, other replicas drain naturally within EMB_CACHE_TTL (20 min).
 */
export function invalidateBadPatternCache(): void {
  // Bad patterns come from BadReportModel, not the embedding cache.
  // They are fetched fresh on every call (no module-level cache), so no
  // explicit invalidation is needed there — this function is a no-op kept
  // for forward compatibility and clarity at the call site.
}

// ─── Utility: generate and store embedding for a single PYQ ──────────────────

/**
 * Generate and store an embedding for a PYQ document.
 * Call this when seeding new PYQs, or from the seed script.
 */
export async function generateAndStorePYQEmbedding(docId: string): Promise<void> {
  await connectDb();
  const doc = await PYQExampleModel.findById(docId).lean();
  if (!doc) return;
  const text = pyqEmbeddingText(
    (doc as any).content as string,
    (doc as any).summary as string,
    (doc as any).topic as string
  );
  const embedding = await embed(text);
  await PYQExampleModel.updateOne({ _id: docId }, { $set: { embedding } });
  // Invalidate cache so the next retrieval picks up the new embedding
  _embCache = null;
}
