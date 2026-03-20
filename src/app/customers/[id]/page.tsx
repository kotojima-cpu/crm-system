import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { DeleteCustomerButton } from "@/components/delete-customer-button";
import { PwaHide } from "@/components/pwa-hide";
import { resolveRemainingCount } from "@/lib/contract-utils";

type Props = { params: Promise<{ id: string }> };

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const statusLabels: Record<string, { text: string; className: string }> = {
  active: { text: "有効", className: "bg-green-100 text-green-700" },
  expiring_soon: { text: "満了間近", className: "bg-yellow-100 text-yellow-700" },
  expired: { text: "満了", className: "bg-gray-100 text-gray-600" },
  cancelled: { text: "解約", className: "bg-red-100 text-red-700" },
};

export default async function CustomerDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const customerId = Number(id);
  if (isNaN(customerId)) notFound();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, isDeleted: false },
    include: {
      creator: { select: { id: true, name: true } },
      leaseContracts: {
        orderBy: { contractStartDate: "desc" },
      },
    },
  });

  if (!customer) notFound();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-4">
          <Link href="/customers" className="text-sm text-blue-600 hover:underline">
            &larr; 一覧に戻る
          </Link>
          <PwaHide>
            <div className="flex items-center gap-2">
              <Link
                href={`/customers/${customer.id}/edit`}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                編集
              </Link>
              <DeleteCustomerButton customerId={customer.id} companyName={customer.companyName} />
            </div>
          </PwaHide>
        </div>

        {/* 顧客情報 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
          <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">{customer.companyName}</h2>
          {customer.companyNameKana && (
            <p className="text-sm text-gray-500 mb-4">{customer.companyNameKana}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
            <InfoRow label="郵便番号" value={customer.zipCode} />
            <InfoRow label="電話番号" value={customer.phone} />
            <InfoRow label="住所" value={customer.address} />
            <InfoRow label="FAX" value={customer.fax} />
          </div>

          <hr className="my-4" />
          <p className="text-sm font-medium text-gray-700 mb-3">担当者情報</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
            <InfoRow label="担当者名" value={customer.contactName} />
            <InfoRow label="電話番号" value={customer.contactPhone} />
            <InfoRow label="メール" value={customer.contactEmail} />
          </div>

          {customer.notes && (
            <>
              <hr className="my-4" />
              <p className="text-sm font-medium text-gray-700 mb-1">備考</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{customer.notes}</p>
            </>
          )}

          <hr className="my-4" />
          <div className="text-xs text-gray-400">
            登録者: {customer.creator.name} | 登録日: {formatDate(customer.createdAt)} | 更新日: {formatDate(customer.updatedAt)}
          </div>
        </div>

        {/* リース契約一覧 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-gray-800">リース契約一覧</h3>
            <PwaHide>
              <Link
                href={`/customers/${customer.id}/contracts/new`}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                契約を追加
              </Link>
            </PwaHide>
          </div>

          {customer.leaseContracts.length === 0 ? (
            <p className="text-sm text-gray-500">契約はまだ登録されていません。</p>
          ) : (
            <>
              {/* モバイル: 契約カードUI */}
              <div className="md:hidden space-y-3">
                {customer.leaseContracts.map((contract) => {
                  const calc = resolveRemainingCount({
                    contractStartDate: contract.contractStartDate,
                    contractMonths: contract.contractMonths,
                    billingBaseDay: contract.billingBaseDay,
                    manualOverrideRemainingCount: contract.manualOverrideRemainingCount,
                  });
                  const status = statusLabels[calc.contractStatus] || statusLabels.active;
                  const isWarning = calc.contractStatus === "expiring_soon";
                  return (
                    <Link
                      key={contract.id}
                      href={`/contracts/${contract.id}`}
                      className={`block rounded-lg border p-3 active:bg-gray-50 ${isWarning ? "border-yellow-300 bg-yellow-50" : "border-gray-200"}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {contract.productName}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>
                          {status.text}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mb-1">
                        {contract.contractNumber || "\u2014"} | {formatDate(contract.contractStartDate)}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">残回数</span>
                        <span className={`text-sm font-bold ${isWarning ? "text-yellow-700" : "text-gray-900"}`}>
                          {calc.remainingCount} / {contract.contractMonths}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* デスクトップ: テーブルUI */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">契約番号</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">商品名</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">開始日</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">残回数</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">ステータス</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.leaseContracts.map((contract) => {
                      const calc = resolveRemainingCount({
                        contractStartDate: contract.contractStartDate,
                        contractMonths: contract.contractMonths,
                        billingBaseDay: contract.billingBaseDay,
                        manualOverrideRemainingCount: contract.manualOverrideRemainingCount,
                      });
                      const status = statusLabels[calc.contractStatus] || statusLabels.active;
                      const isWarning = calc.contractStatus === "expiring_soon";
                      return (
                        <tr key={contract.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isWarning ? "bg-yellow-50" : ""}`}>
                          <td className="px-3 py-2 text-sm text-gray-900">
                            <Link href={`/contracts/${contract.id}`} className="hover:text-blue-600 hover:underline">
                              {contract.contractNumber || "\u2014"}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600">{contract.productName}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{formatDate(contract.contractStartDate)}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">
                            <span className={isWarning ? "font-semibold text-yellow-700" : ""}>
                              {calc.remainingCount} / {contract.contractMonths}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>
                              {status.text}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Link href={`/contracts/${contract.id}`} className="text-sm text-blue-600 hover:underline">
                              詳細
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="text-gray-900">{value || "\u2014"}</span>
    </div>
  );
}
