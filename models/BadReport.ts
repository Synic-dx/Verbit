import { Schema, model, models, Types } from "mongoose";

const BadReportSchema = new Schema({
  userId: { type: Types.ObjectId, required: true, index: true },
  topic: { type: String, required: true, index: true },
  questionSnapshot: { type: Schema.Types.Mixed, required: true },
  analysis: { type: String, required: true },
  rule: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

BadReportSchema.index({ topic: 1, createdAt: -1 });

export const BadReportModel =
  models.BadReport || model("BadReport", BadReportSchema);
