import { Schema, model, models } from "mongoose";

const QuestionSchema = new Schema({
  topic: { type: String, required: true, index: true },
  question: { type: String },
  options: [{ type: String }],
  correctIndex: { type: Number },
  explanation: { type: String },
  passage: { type: String },
  passageTitle: { type: String },
  questions: [
    {
      text: { type: String },
      options: [{ type: String }],
      correctIndex: { type: Number },
      explanation: { type: String },
    },
  ],
  pjSentences: [{ type: String }],
  pjCorrectOrder: { type: String },
  pjExplanation: { type: String },
  difficulty: { type: Number, required: true, min: 0, max: 100 },
  attemptCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  servedTo: { type: Number, default: 0 },
});

export const QuestionModel = models.Question || model("Question", QuestionSchema);
