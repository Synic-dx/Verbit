import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true },
    image: { type: String },
    passwordHash: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export const UserModel = models.User || model("User", UserSchema);
