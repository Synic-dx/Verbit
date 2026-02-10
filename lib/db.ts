import mongoose, { type Mongoose } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined");
}

const globalCache = globalThis as typeof globalThis & {
  mongoose?: { conn: Mongoose | null; promise: Promise<Mongoose> | null };
};

const cached = globalCache.mongoose ?? { conn: null, promise: null };
globalCache.mongoose = cached;

export async function connectDb() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
