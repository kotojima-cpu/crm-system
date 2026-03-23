/**
 * /platform/users — 運営担当者管理画面（platform_master 専用）
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { prisma } from "@/shared/db";
import { ToggleActiveButton } from "./toggle-active-button";

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const roleLabel: Record<string, string> = {
  platform_master: "運営マスター",
  platform_operator: "運営担当",
};

export default async function PlatformUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "platform_master") {
    redirect("/platform/tenants");
  }

  const users = await prisma.user.findMany({
    where: {
      tenantId: null,
      role: { in: ["platform_master", "platform_operator"] },
    },
    select: {
      id: true,
      loginId: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const currentUserId = Number(session.user.id);

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">親担当者管理</h1>
            <p className="text-sm text-gray-500">
              親運営アカウント一覧 — 全 {users.length} 件
            </p>
          </div>
          <Link
            href="/platform/users/new"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            親担当者を追加
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">名前</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ログインID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">権限</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">状態</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">作成日</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    親運営アカウントはまだ登録されていません
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.loginId}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        u.role === "platform_master"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {roleLabel[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive ? (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">有効</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">無効</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {u.role === "platform_operator" && u.id !== currentUserId && (
                        <ToggleActiveButton userId={u.id} isActive={u.isActive} />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
