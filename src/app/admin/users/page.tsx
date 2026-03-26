/**
 * /admin/users — テナントユーザー一覧画面（tenant_admin 専用）
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { listTenantUsers } from "@/features/tenant-users";
import { toTenantId, toActorUserId } from "@/shared/types/helpers";
import { TenantResetPasswordButton } from "./reset-password-button";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const roleLabel: Record<string, string> = {
  tenant_admin: "管理者",
  sales: "営業",
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "tenant_admin") {
    redirect("/customers");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/customers");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const limit = 20;

  const result = await listTenantUsers(
    {
      tenantId: toTenantId(Number(tenantId)),
      actorUserId: toActorUserId(Number(session.user.id)),
      actorRole: session.user.role,
    },
    {
      tenantId: toTenantId(Number(tenantId)),
      page,
      limit,
    },
  );

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">ユーザー管理</h1>
            <p className="text-sm text-gray-500">
              テナント内ユーザー — 全 {result.pagination.total} 件
            </p>
          </div>
          <Link
            href="/admin/users/new"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            ユーザー追加
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">名前</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ログインID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">メール</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">権限</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">状態</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">作成日</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    ユーザーはまだ登録されていません
                  </td>
                </tr>
              ) : (
                result.data.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.loginId}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{user.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                        {roleLabel[user.role] ?? user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.isActive ? (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">有効</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">無効</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {user.id !== Number(session.user.id) && (
                        <TenantResetPasswordButton
                          tenantId={tenantId}
                          userId={user.id}
                          loginId={user.loginId}
                        />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {result.pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: result.pagination.totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/admin/users?page=${p}`}
                className={`px-3 py-1.5 text-sm rounded border ${
                  p === page
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {p}
              </a>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
