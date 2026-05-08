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
          logger.error({ err, email: profile.email }, "Failed to upsert user on Google sign-in");
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        const idFromToken = token["userId"] as string | undefined;
        // Only trust the stored id if it looks like a real DB UUID.
        // Stale tokens from before this fix carry the Google OAuth sub instead.
        const isUuid =
          !!idFromToken &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idFromToken);

        if (isUuid) {
          (session.user as typeof session.user & { id: string }).id = idFromToken!;
        } else if (session.user.email) {
          try {
            const { getUserByEmail } = await import("./db/queries/users");
            const dbUser = await getUserByEmail(session.user.email);
            if (dbUser) {
              (session.user as typeof session.user & { id: string }).id = dbUser.id;
            }
          } catch (err) {
            logger.error({ err }, "Failed to fetch user id for session");
          }
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const storedId = token["userId"] as string | undefined;
      // Resolve the real DB UUID when: first sign-in (user present) OR stale token (non-UUID stored).
      // token.email is always populated by NextAuth for both cases.
      const email = (user?.email ?? token["email"]) as string | undefined;
      if (email && (!storedId || !UUID_RE.test(storedId))) {
        try {
          const { getUserByEmail } = await import("./db/queries/users");
          const dbUser = await getUserByEmail(email);
          if (dbUser) token["userId"] = dbUser.id;
        } catch {
          if (user?.id) token["userId"] = user.id;
        }
      }
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
