import { Schema, model, models } from "mongoose";

const PYQExampleSchema = new Schema({
  /** Which verbal topic this PYQ belongs to */
  topic: { type: String, required: true, index: true },

  /** Difficulty on a 0-100 verScore scale (logarithmic percentile mapped) */
  difficulty: { type: Number, required: true, min: 0, max: 100 },

  /** The percentile (50-100) that the difficulty maps to */
  percentile: { type: Number, required: true },

  /** Full question content as a JSON-serialised string (schema varies by topic) */
  content: { type: String, required: true },

  /** Short human-readable summary used for display / debug */
  summary: { type: String, required: true },

  /** Source exam / year if known */
  source: { type: String, default: "PYQ" },

  createdAt: { type: Date, default: Date.now },
});

PYQExampleSchema.index({ topic: 1, difficulty: 1 });

export const PYQExampleModel =
  models.PYQExample || model("PYQExample", PYQExampleSchema);
