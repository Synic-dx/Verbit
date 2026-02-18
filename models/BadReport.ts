import { Schema, model, models, Types } from "mongoose";


const BadReportSchema = new Schema({
  userId: { type: Types.ObjectId, required: true, index: true },
  userEmail: { type: String, default: "" },
  userName: { type: String, default: "" },
  topic: { type: String, required: true, index: true },
  questionSnapshot: { type: Schema.Types.Mixed, required: true },
  analysis: { type: String, required: true },
  rule: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
  questionId: { type: Types.ObjectId, required: false, index: true }, // ADDED for direct lookup
});

BadReportSchema.index({ topic: 1, createdAt: -1 });
BadReportSchema.index({ questionId: 1 });

export const BadReportModel =
  models.BadReport || model("BadReport", BadReportSchema);
