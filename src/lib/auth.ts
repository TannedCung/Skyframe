import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { upsertUser } from "./db/queries/users";

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
        await upsertUser({
          email: profile.email,
          name: profile.name ?? null,
          googleId: profile.sub ?? null,
        });
      }
      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const { getUserByEmail } = await import("./db/queries/users");
        const dbUser = await getUserByEmail(session.user.email);
        if (dbUser && session.user) {
          (session.user as typeof session.user & { id: string }).id = dbUser.id;
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) token["userId"] = user.id;
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
