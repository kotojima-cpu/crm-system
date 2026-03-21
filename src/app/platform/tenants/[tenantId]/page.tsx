/**
 * /platform/tenants/[tenantId] — テナント詳細画面（platform_admin 専用）
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTenantDetail } from "@/features/platform-tenants";
import { toActorUserId } from "@/shared/types/helpers";
import { toTenantId } from "@/shared/types/helpers";
import { Header } from "@/components/header";
import { TenantStatusActions } from "./tenant-status-actions";
import { TenantContractorForm } from "./tenant-contractor-form";

type Props = { params: Promise<{ tenantId: string }> };

const statusLabel: Record<string, { text: string; className: string }> = {
  active: { text: "稼働中", className: "bg-green-100 text-green-800" },
  suspended: { text: "停止中", className: "bg-red-100 text-red-800" },
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default async function TenantDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user?.role !== "platform_master" && session.user?.role !== "platform_operator" && session.user?.role !== "platform_admin")) {
    redirect("/login");
  }

  const { tenantId: tenantIdStr } = await params;
  const tenantIdNum = Number(tenantIdStr);
  if (isNaN(tenantIdNum) || tenantIdNum <= 0) notFound();

  let tenant;
  try {
    tenant = await getTenantDetail(
      { actorUserId: toActorUserId(Number(session.user.id)), actorRole: session.user.role },
      toTenantId(tenantIdNum),
    );
  } catch {
    notFound();
  }

  const badge = statusLabel[tenant.status] ?? { text: tenant.status, className: "bg-gray-100 text-gray-800" };

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/platform/tenants" className="text-sm text-blue-600 hover:underline">
            &larr; テナント一覧に戻る
          </Link>
        </div>

        {/* 基本情報 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-xl font-semibold">{tenant.name}</h1>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
              {badge.text}
            </span>
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">テナントID</dt>
              <dd className="font-medium">{tenant.id}</dd>
            </div>
            <div>
              <dt className="text-gray-500">テナント名</dt>
              <dd className="font-medium">{tenant.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">作成日</dt>
              <dd>{formatDate(tenant.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">更新日</dt>
              <dd>{formatDate(tenant.updatedAt)}</dd>
            </div>
          </dl>
        </div>

        {/* テナント停止/再開 */}
        <TenantStatusActions tenantId={tenant.id} status={tenant.status} />

        {/* 契約者情報 */}
        <TenantContractorForm
          tenantId={tenant.id}
          initialData={{
            contractorName: tenant.contractorName ?? "",
            contactPerson: tenant.contactPerson ?? "",
            contactEmail: tenant.contactEmail ?? "",
            contactPhone: tenant.contactPhone ?? "",
            contactMobile: tenant.contactMobile ?? "",
            prefecture: tenant.prefecture ?? "",
          }}
        />
      </main>
    </>
  );
}
