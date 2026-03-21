/**
 * /platform/tenants — テナント一覧画面（platform_admin 専用）
 *
 * GET /api/platform/tenants を呼び出してテナント一覧を表示する。
 * middleware で platform_admin 以外はブロック済み。
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { listTenants } from "@/features/platform-tenants";
import { toActorUserId } from "@/shared/types/helpers";
import { Header } from "@/components/header";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const statusLabel: Record<string, { text: string; className: string }> = {
  active: { text: "稼働中", className: "bg-green-100 text-green-800" },
  suspended: { text: "停止", className: "bg-red-100 text-red-800" },
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user?.role !== "platform_master" && session.user?.role !== "platform_operator" && session.user?.role !== "platform_admin")) {
    redirect("/login");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const limit = 20;

  const result = await listTenants(
    { actorUserId: toActorUserId(Number(session.user.id)), actorRole: session.user.role },
    { page, limit },
  );

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">テナント管理</h1>
            <p className="text-sm text-gray-500">
              登録テナント一覧 — 全 {result.pagination.total} 件
            </p>
          </div>
          <Link href="/platform/tenants/new"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
            新規テナント作成
          </Link>
        </div>

        {/* テナント一覧テーブル */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">テナント名</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ステータス</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">作成日</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">更新日</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {result.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    テナントはまだ登録されていません
                  </td>
                </tr>
              ) : (
                result.data.map((tenant) => {
                  const badge = statusLabel[tenant.status] ?? {
                    text: tenant.status,
                    className: "bg-gray-100 text-gray-800",
                  };
                  return (
                    <tr key={tenant.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{tenant.id}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link href={`/platform/tenants/${tenant.id}`} className="hover:text-blue-600 hover:underline">
                          {tenant.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(tenant.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(tenant.updatedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/platform/tenants/${tenant.id}`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          詳細
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ページネーション */}
        {result.pagination.totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: result.pagination.totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/platform/tenants?page=${p}`}
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
