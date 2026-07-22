import { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true },
    image: { type: String },
    passwordHash: { type: String },
    isAdmin: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    lastVerificationCode: { type: String },
    lastVerificationSentAt: { type: Date },
    lastOTP: { type: String },
    lastOTPtime: { type: Date },
    createdAt: { type: Date, default: Date.now },
    subscription: {
      status: {
        type: String,
        enum: ["active", "inactive", "cancelled", "halted"],
        default: "inactive",
      },
      tier: {
        type: String,
        enum: ["pro", "cracker"],
        default: "pro",
      },
      razorpaySubscriptionId: { type: String },
      currentPeriodEnd: { type: Date },
    },
  },
  { timestamps: false }
);

export const UserModel = models.User || model("User", UserSchema);
