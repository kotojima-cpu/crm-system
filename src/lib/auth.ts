import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "./prisma";

/** ログイン試行制限の設定 */
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

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

        // ロック中判定: lockedUntil が未来ならログイン拒否
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null;
        }

        // ロック期限切れの場合はリセット（メモリ上の値も更新）
        let currentFailedCount = user.loginFailedCount;
        if (user.lockedUntil && user.lockedUntil <= new Date()) {
          await prisma.user.update({
            where: { id: user.id },
            data: { loginFailedCount: 0, lockedUntil: null },
          });
          currentFailedCount = 0;
        }

        const isPasswordValid = await compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          // 失敗回数を加算
          const newCount = currentFailedCount + 1;
          const updateData: { loginFailedCount: number; lockedUntil?: Date } = {
            loginFailedCount: newCount,
          };

          // 閾値到達でロック
          if (newCount >= MAX_LOGIN_ATTEMPTS) {
            updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
          }

          await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });

          return null;
        }

        // ログイン成功: 失敗回数をリセット
        if (currentFailedCount > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { loginFailedCount: 0, lockedUntil: null },
          });
        }

        return {
          id: String(user.id),
          name: user.name,
          loginId: user.loginId,
          role: user.role,
          tenantId: user.tenantId != null ? String(user.tenantId) : undefined,
          tenantStatus: user.tenant?.status ?? undefined,
          authVersion: 1,
          mustChangePassword: user.mustChangePassword,
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
        token.mustChangePassword = (user as unknown as { mustChangePassword?: boolean }).mustChangePassword;
      } else if (token.id) {
        // 既存セッション更新時: DB から最新の role / mustChangePassword を再取得
        const dbUser = await prisma.user.findUnique({
          where: { id: Number(token.id) },
          select: { role: true, isActive: true, mustChangePassword: true, tenantId: true, tenant: { select: { status: true } } },
        });
        if (dbUser && dbUser.isActive) {
          token.role = dbUser.role;
          token.tenantId = dbUser.tenantId != null ? String(dbUser.tenantId) : undefined;
          token.tenantStatus = dbUser.tenant?.status ?? undefined;
          token.mustChangePassword = dbUser.mustChangePassword;
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
        session.user.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
