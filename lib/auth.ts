import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import { compare } from "bcryptjs";
import { ObjectId } from "mongodb";

import { getMongoClient } from "@/lib/mongodb";
import { connectDb } from "@/lib/db";
import { UserModel } from "@/models/User";

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(getMongoClient()),
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase();
        const password = credentials?.password ?? "";

        if (!email || !password) return null;

        await connectDb();
        const user = await UserModel.findOne({ email });
        if (!user?.passwordHash) return null;

        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

        // Update lastLogin
        user.lastLogin = new Date();
        await user.save();

        return {
          id: String(user._id),
          name: user.name ?? email.split("@")[0],
          email: user.email,
          image: user.image ?? null,
        };
      },
    }),
  ],
  pages: {
    signIn: "/auth/sign-in",
  },
  callbacks: {
    async signIn({ user, account }) {
      // When signing in with Google, merge into existing credentials-based account
      if (account?.provider === "google" && user.email) {
        const client = await getMongoClient();
        const db = client.db();
        const existingUser = await db.collection("users").findOne({
          email: user.email.toLowerCase(),
        });

        if (existingUser) {
          // Check if a Google account link already exists for this user
          const existingAccount = await db.collection("accounts").findOne({
            userId: existingUser._id,
            provider: "google",
          });

          if (!existingAccount) {
            // Link the Google account to the existing user
            await db.collection("accounts").insertOne({
              userId: existingUser._id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
              expires_at: account.expires_at,
            });
          }

          // Update user profile with Google image/name if missing
          const updates: Record<string, unknown> = {};
          if (!existingUser.image && user.image) updates.image = user.image;
          if (!existingUser.name && user.name) updates.name = user.name;
          // Always update lastLogin
          updates.lastLogin = new Date();
          await db.collection("users").updateOne(
            { _id: existingUser._id },
            { $set: updates },
          );

          // Override the user.id so the JWT uses the existing user's ID
          user.id = String(existingUser._id);
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (token.sub && !token.isAdmin) {
        await connectDb();
        const dbUser = await UserModel.findById(token.sub).lean() as any;
        token.isAdmin = dbUser?.isAdmin === true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.isAdmin = token.isAdmin === true;
      }
      return session;
    },
  },
};
