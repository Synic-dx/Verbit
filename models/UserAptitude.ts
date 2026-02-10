import { Schema, model, models, Types } from "mongoose";

const UserAptitudeSchema = new Schema({
  userId: { type: Types.ObjectId, required: true, index: true },
  topic: { type: String, required: true, index: true },
  verScore: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
});

UserAptitudeSchema.index({ userId: 1, topic: 1 }, { unique: true });

export const UserAptitudeModel =
  models.UserAptitude || model("UserAptitude", UserAptitudeSchema);
