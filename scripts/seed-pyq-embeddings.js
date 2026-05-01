/**
 * seed-pyq-embeddings.js
 *
 * Generates text-embedding-3-small vectors for every PYQExample document
 * that does not yet have an embedding, then writes them back to MongoDB.
 *
 * Usage:
 *   node scripts/seed-pyq-embeddings.js
 *
 * Requires MONGODB_URI and OPENAI_API_KEY in .env.local
 */

const mongoose = require("mongoose");
const OpenAI = require("openai").default;
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

// ─── Inline schema (avoids TS compilation) ────────────────────────────────────
const PYQExampleSchema = new mongoose.Schema({
  topic: String,
  difficulty: Number,
  percentile: Number,
  content: String,
  summary: String,
  source: String,
  embedding: [Number],
  createdAt: Date,
});
const PYQExample =
  mongoose.models.PYQExample || mongoose.model("PYQExample", PYQExampleSchema);

// ─── Same text-building logic as lib/rag.ts ───────────────────────────────────
function pyqEmbeddingText(content, summary, topic) {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;

    if (parsed.passage) {
      const passageSnippet = String(parsed.passage)
        .replace(/<br\s*\/?>/gi, " ")
        .slice(0, 700);
      const qTypes = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .map((q) => (q.text || "").slice(0, 80))
        .join(" | ");
      return `[${topic}] Title: ${parsed.passageTitle || ""}\nSummary: ${summary}\nPassage: ${passageSnippet}\nQuestions: ${qTypes}`;
    }

    if (parsed.pjSentences) {
      return `[${topic}] Summary: ${summary}\nSentences: ${parsed.pjSentences.join(" ")}`;
    }

    const question = String(parsed.question || "").slice(0, 500);
    const opts = (Array.isArray(parsed.options) ? parsed.options : [])
      .slice(0, 4)
      .join(" | ");
    return `[${topic}] Summary: ${summary}\nQuestion: ${question}\nOptions: ${opts}`;
  } catch {
    return `[${topic}] ${summary}`;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI not set");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Find PYQs that either have no embedding or have an empty embedding array
  const docs = await PYQExample.find({
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
    ],
  }).lean();

  console.log(`Found ${docs.length} PYQs without embeddings`);
  if (docs.length === 0) {
    console.log("Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Process in batches to stay under OpenAI rate limits
  const BATCH = 20;
  let done = 0;

  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (doc) => {
        try {
          const text = pyqEmbeddingText(doc.content, doc.summary, doc.topic);
          const resp = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text.slice(0, 8000),
          });
          const embedding = resp.data[0].embedding;
          await PYQExample.updateOne({ _id: doc._id }, { $set: { embedding } });
          done++;
          console.log(
            `[${done}/${docs.length}] ✓ ${doc.topic}: ${String(doc.summary).slice(0, 60)}`
          );
        } catch (err) {
          console.error(`  ✗ Failed for ${doc._id}:`, err.message);
        }
      })
    );

    // Brief pause between batches to avoid rate-limit spikes
    if (i + BATCH < docs.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\nDone. Embedded ${done}/${docs.length} PYQs.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
