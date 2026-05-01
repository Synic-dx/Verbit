/**
 * seed-pyqs.js
 *
 * Imports PYQ documents from extracted-pyqs.json into MongoDB.
 * Skips any entry whose (topic + summary/passageTitle) already exists.
 *
 * Usage:
 *   node scripts/seed-pyqs.js
 *
 * Requires MONGODB_URI in .env.local
 */

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const PYQExampleSchema = new mongoose.Schema({
  topic: String,
  difficulty: Number,
  percentile: Number,
  content: String,
  summary: String,
  source: { type: String, default: "PYQ" },
  embedding: [Number],
  createdAt: Date,
});
const PYQExample =
  mongoose.models.PYQExample || mongoose.model("PYQExample", PYQExampleSchema);

/** Derive a short summary from the content object for dedup + display. */
function deriveSummary(content) {
  if (content.passageTitle && content.passageTitle !== "PASSAGE 1") {
    return content.passageTitle.slice(0, 120);
  }
  if (content.passage) {
    return content.passage.replace(/<br\s*\/?>/gi, " ").slice(0, 120);
  }
  if (content.pjSentences) {
    return content.pjSentences[0]?.slice(0, 120) ?? "Parajumble";
  }
  return (content.question ?? "").slice(0, 120);
}

/** Map percentile → difficulty (verScore, 0-100). */
function percentileToDifficulty(percentile) {
  if (percentile >= 99) return 95;
  if (percentile >= 98) return 80;
  if (percentile >= 95) return 65;
  if (percentile >= 90) return 50;
  if (percentile >= 80) return 35;
  if (percentile >= 70) return 20;
  return 10;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI not set");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");

  const raw = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "extracted-pyqs.json"), "utf8")
  );
  console.log(`Loaded ${raw.length} entries from extracted-pyqs.json`);

  let inserted = 0;
  let skipped = 0;

  for (const entry of raw) {
    const contentObj =
      typeof entry.content === "string"
        ? JSON.parse(entry.content)
        : entry.content;

    const contentStr =
      typeof entry.content === "string"
        ? entry.content
        : JSON.stringify(entry.content);

    const summary = entry.summary ?? deriveSummary(contentObj);
    const percentile = entry.percentile ?? 60;
    const difficulty = entry.difficulty ?? percentileToDifficulty(percentile);

    // Dedup by topic + first 80 chars of summary
    const existing = await PYQExample.findOne({
      topic: entry.topic,
      summary: { $regex: "^" + summary.slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await PYQExample.create({
      topic: entry.topic,
      difficulty,
      percentile,
      content: contentStr,
      summary,
      source: entry.source ?? "PYQ",
      createdAt: new Date(),
    });

    inserted++;
    console.log(`[${inserted}] ✓ ${entry.topic}: ${summary.slice(0, 60)}`);
  }

  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} duplicates.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
