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

        // 停止テナントのユーザーはログイン不可（親運営は tenantId null なので通過）
        if (user.tenantId != null && user.tenant?.status === "suspended") {
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
        // 初回ログイン時: authorize() の返り値を JWT に焼き込む
        token.id = user.id;
        token.loginId = (user as unknown as { loginId: string }).loginId;
        token.role = (user as unknown as { role: string }).role;
        token.tenantId = (user as unknown as { tenantId?: string }).tenantId;
        token.tenantStatus = (user as unknown as { tenantStatus?: string }).tenantStatus;
        token.authVersion = (user as unknown as { authVersion?: number }).authVersion;
      } else if (token.id) {
        // 既存セッション更新時: DB から最新の role を再取得
        // migration でロール名が変わった場合でも、再ログインなしで反映される
        const dbUser = await prisma.user.findUnique({
          where: { id: Number(token.id) },
          select: { role: true, isActive: true, tenantId: true, tenant: { select: { status: true } } },
        });
        if (dbUser && dbUser.isActive) {
          token.role = dbUser.role;
          token.tenantId = dbUser.tenantId != null ? String(dbUser.tenantId) : undefined;
          token.tenantStatus = dbUser.tenant?.status ?? undefined;
        }
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
