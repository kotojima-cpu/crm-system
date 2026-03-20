import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        loginId: { label: "ログインID", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.loginId || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { loginId: credentials.loginId },
          include: { tenant: { select: { status: true } } },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const isPasswordValid = await compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: String(user.id),
          name: user.name,
          loginId: user.loginId,
          role: user.role,
          tenantId: user.tenantId != null ? String(user.tenantId) : undefined,
          tenantStatus: user.tenant?.status ?? undefined,
          authVersion: 1,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24時間
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.loginId = (user as unknown as { loginId: string }).loginId;
        token.role = (user as unknown as { role: string }).role;
        token.tenantId = (user as unknown as { tenantId?: string }).tenantId;
        token.tenantStatus = (user as unknown as { tenantStatus?: string }).tenantStatus;
        token.authVersion = (user as unknown as { authVersion?: number }).authVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.loginId = token.loginId as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId;
        session.user.tenantStatus = token.tenantStatus;
        session.user.authVersion = token.authVersion;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
