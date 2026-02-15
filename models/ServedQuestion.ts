import { Schema, model, models, Types } from "mongoose";

const ServedQuestionSchema = new Schema({
  userId: { type: Types.ObjectId, required: true, index: true },
  topic: { type: String, required: true, index: true },
  questionId: { type: Types.ObjectId, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

// Unique compound index — one record per user+topic+question
ServedQuestionSchema.index(
  { userId: 1, topic: 1, questionId: 1 },
  { unique: true }
);

export const ServedQuestionModel =
  models.ServedQuestion || model("ServedQuestion", ServedQuestionSchema);
