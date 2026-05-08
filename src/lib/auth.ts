import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { upsertUser } from "./db/queries/users";
import logger from "./logger";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
    }),
    // Test-only credentials provider — disabled in production
    ...(process.env["NODE_ENV"] !== "production"
      ? [
          CredentialsProvider({
            id: "test-credentials",
            name: "Test User",
            credentials: {
              email: { label: "Email", type: "text" },
              name: { label: "Name", type: "text" },
            },
            async authorize(credentials) {
              if (!credentials?.email) return null;
              const user = await upsertUser({
                email: credentials.email,
                name: credentials.name ?? "Test User",
              });
              return { id: user.id, email: user.email, name: user.name };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        try {
          await upsertUser({
            email: profile.email,
            name: profile.name ?? null,
            googleId: profile.sub ?? null,
          });
        } catch (err) {
          // Log but don't block sign-in — user record will be created on next request
          logger.error({ err, email: profile.email }, "Failed to upsert user on Google sign-in");
        }
      }
      return true;
    },
    async session({ session, token }) {
      // Attach the DB user id to the session so API routes can use it
      if (session.user) {
        // Prefer the id stored in the JWT (set on first sign-in)
        const idFromToken = token["userId"] as string | undefined;
        if (idFromToken) {
          (session.user as typeof session.user & { id: string }).id = idFromToken;
        } else if (session.user.email) {
          // Fallback: look up from DB (handles tokens minted before id was stored)
          try {
            const { getUserByEmail } = await import("./db/queries/users");
            const dbUser = await getUserByEmail(session.user.email);
            if (dbUser) {
              (session.user as typeof session.user & { id: string }).id = dbUser.id;
              token["userId"] = dbUser.id;
            }
          } catch (err) {
            logger.error({ err }, "Failed to fetch user id for session");
          }
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      // Persist the DB user id into the JWT on first sign-in
      if (user?.id) token["userId"] = user.id;
      return token;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
