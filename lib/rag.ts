import type { Topic } from "@/lib/topics";
import { connectDb } from "@/lib/db";
import { PYQExampleModel } from "@/models/PYQExample";

export interface RAGExample {
  topic: string;
  difficulty: number;
  percentile: number;
  content: string; // JSON string
  summary: string;
}

/**
 * Retrieve the most relevant PYQ examples for a given topic and difficulty.
 *
 * Strategy: filter by topic, then sort by difficulty proximity (closest first).
 * No embeddings or API calls needed — purely local DB query, $0 cost.
 */
export async function retrieveExamples(
  topic: Topic,
  difficulty: number,
  topK = 3
): Promise<RAGExample[]> {
  await connectDb();

  // Fetch all examples for this topic, sorted by how close their difficulty is
  const docs = await PYQExampleModel.find(
    { topic },
    { content: 1, summary: 1, difficulty: 1, percentile: 1, topic: 1 }
  ).lean();

  if (docs.length === 0) return [];

  // Sort by difficulty proximity (closest to requested difficulty first)
  const sorted = (docs as any[])
    .map((doc) => ({
      topic: doc.topic as string,
      difficulty: doc.difficulty as number,
      percentile: doc.percentile as number,
      content: doc.content as string,
      summary: doc.summary as string,
      distance: Math.abs((doc.difficulty as number) - difficulty),
    }))
    .sort((a, b) => a.distance - b.distance);

  return sorted.slice(0, topK);
}

/**
 * Format retrieved examples into a prompt section for the LLM.
 */
export function formatExamplesForPrompt(examples: RAGExample[]): string {
  if (examples.length === 0) return "";

  const blocks = examples.map((ex, i) => {
    const parsed = JSON.parse(ex.content);
    // Truncate long passages to keep prompt size manageable
    const truncated = JSON.stringify(parsed, null, 2).slice(0, 1200);
    return (
      `--- Example ${i + 1} (Difficulty: ${ex.difficulty}, Percentile: ${ex.percentile}) ---\n` +
      truncated
    );
  });

  return (
    "\n\nHere are real PYQ examples at similar difficulty levels. " +
    "Match their style, complexity, and question quality:\n\n" +
    blocks.join("\n\n")
  );
}
