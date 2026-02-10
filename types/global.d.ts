import type { Mongoose } from "mongoose";
import type { MongoClient } from "mongodb";

declare global {
  var mongoose: { conn: Mongoose | null; promise: Promise<Mongoose> | null } | undefined;
  var mongo:
    | { client: MongoClient | null; promise: Promise<MongoClient> | null }
    | undefined;
}

export {};
