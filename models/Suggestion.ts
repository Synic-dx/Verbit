import { Schema, model, models, Types } from "mongoose";

const SuggestionSchema = new Schema({
  userId: { type: Types.ObjectId, required: true, index: true },
  userName: { type: String, default: "" },
  userEmail: { type: String, default: "" },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

SuggestionSchema.index({ createdAt: -1 });

export const SuggestionModel =
  models.Suggestion || model("Suggestion", SuggestionSchema);
