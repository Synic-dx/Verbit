import { Schema, model, models } from "mongoose";

const AnnouncementSchema = new Schema({
  message: { type: String, required: true },
  time: { type: Date, default: Date.now },
});

export const AnnouncementModel = models.Announcement || model("Announcement", AnnouncementSchema);
