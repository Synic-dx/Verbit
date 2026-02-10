import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined");
}

const globalCache = globalThis as typeof globalThis & {
  mongo?: { client: MongoClient | null; promise: Promise<MongoClient> | null };
};

const cached = globalCache.mongo ?? { client: null, promise: null };
globalCache.mongo = cached;

export async function getMongoClient() {
  if (cached.client) return cached.client;
  if (!cached.promise) {
    cached.promise = new MongoClient(MONGODB_URI).connect();
  }
  cached.client = await cached.promise;
  return cached.client;
}
