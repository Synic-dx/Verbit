import { Schema, model, models, Types } from "mongoose";

const AttemptSchema = new Schema({
  userId: { type: Types.ObjectId, required: true, index: true },
  topic: { type: String, required: true, index: true },
  questionId: { type: Types.ObjectId, required: true, index: true },
  correct: { type: Boolean, required: true },
  actual: { type: Number, required: true, min: 0, max: 1 },
  timeTaken: { type: Number, required: true },
  difficulty: { type: Number, required: true, min: 0, max: 100 },
  verScoreBefore: { type: Number, required: true, min: 0, max: 100 },
  verScoreAfter: { type: Number, required: true, min: 0, max: 100 },
  percentileAfter: { type: Number, required: true, min: 50, max: 100 },
  createdAt: { type: Date, default: Date.now, index: true },
});

AttemptSchema.index({ userId: 1, topic: 1, createdAt: -1 });

export const AttemptModel = models.Attempt || model("Attempt", AttemptSchema);
