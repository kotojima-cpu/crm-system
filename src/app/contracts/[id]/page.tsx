import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { DeleteContractButton } from "@/components/delete-contract-button";
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

function formatCurrency(amount: number | null): string {
  if (amount === null) return "\u2014";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
}

const statusConfig: Record<string, { text: string; className: string }> = {
  active: { text: "有効", className: "bg-green-100 text-green-700" },
  expiring_soon: { text: "満了間近", className: "bg-yellow-100 text-yellow-700" },
  expired: { text: "満了", className: "bg-gray-200 text-gray-600" },
  cancelled: { text: "解約", className: "bg-red-100 text-red-700" },
};

export default async function ContractDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;
  const contractId = Number(id);
  if (isNaN(contractId)) notFound();

  const contract = await prisma.leaseContract.findUnique({
    where: { id: contractId },
    include: {
      customer: { select: { id: true, companyName: true, isDeleted: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  if (!contract) notFound();

  const calc = resolveRemainingCount({
    contractStartDate: contract.contractStartDate,
    contractMonths: contract.contractMonths,
    billingBaseDay: contract.billingBaseDay,
    manualOverrideRemainingCount: contract.manualOverrideRemainingCount,
  });

  const remainingCount = calc.remainingCount;
  const status = statusConfig[calc.contractStatus] || statusConfig.active;
  const progressPercent = contract.contractMonths > 0
    ? Math.round(((contract.contractMonths - remainingCount) / contract.contractMonths) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-4">
          <Link href={`/customers/${contract.customer.id}`}
            className="text-sm text-blue-600 hover:underline">
            &larr; {contract.customer.companyName} に戻る
          </Link>
          <PwaHide>
            <div className="flex items-center gap-2">
              <Link href={`/contracts/${contract.id}/edit`}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
                編集
              </Link>
              <DeleteContractButton
                contractId={contract.id}
                customerId={contract.customer.id}
                productName={contract.productName}
              />
            </div>
          </PwaHide>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
          <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4">
            <h2 className="text-lg md:text-xl font-bold text-gray-900">
              {contract.contractNumber || "（契約番号なし）"}
            </h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.className}`}>
              {status.text}
            </span>
          </div>

          {/* 残回数表示 */}
          <div className="bg-gray-50 rounded-lg p-3 md:p-4 mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm text-gray-600">残回数</span>
              <span className="text-xl md:text-2xl font-bold text-gray-900">
                {remainingCount} <span className="text-xs md:text-sm font-normal text-gray-500">/ {contract.contractMonths} ヶ月</span>
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
                  calc.contractStatus === "expired" ? "bg-gray-400"
                  : calc.contractStatus === "expiring_soon" ? "bg-yellow-400"
                  : "bg-blue-500"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>経過: {calc.elapsedCount} ヶ月</span>
              <span>{progressPercent}%</span>
            </div>
            {calc.overrideApplied && (
              <p className="text-xs text-amber-600 mt-2">* 残回数は手動で上書きされています</p>
            )}
          </div>

          {/* 契約情報 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
            <InfoRow label="商品名" value={contract.productName} />
            <InfoRow label="リース会社" value={contract.leaseCompanyName} />
            <InfoRow label="契約開始日" value={formatDate(contract.contractStartDate)} />
            <InfoRow label="契約終了日" value={formatDate(contract.contractEndDate)} />
            <InfoRow label="契約月数" value={`${contract.contractMonths} ヶ月`} />
            <InfoRow label="月額" value={formatCurrency(contract.monthlyFee ? Number(contract.monthlyFee) : null)} />
            <InfoRow label="カウンター基本料金" value={formatCurrency(contract.counterBaseFee != null ? Number(contract.counterBaseFee) : null)} />
            <InfoRow label="モノクロ単価" value={contract.monoCounterRate != null ? `${Number(contract.monoCounterRate).toLocaleString()}円/枚` : "\u2014"} />
            <InfoRow label="カラー単価" value={contract.colorCounterRate != null ? `${Number(contract.colorCounterRate).toLocaleString()}円/枚` : "\u2014"} />
            <InfoRow label="更新基準日" value={contract.billingBaseDay ? `毎月${contract.billingBaseDay}日` : "\u2014"} />
            <InfoRow label="終了予定日" value={formatDate(calc.expectedEndDate)} />
          </div>

          {contract.notes && (
            <>
              <hr className="my-4" />
              <p className="text-sm font-medium text-gray-700 mb-1">備考</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{contract.notes}</p>
            </>
          )}

          <hr className="my-4" />
          <div className="text-xs text-gray-400">
            登録者: {contract.creator.name} | 登録日: {formatDate(contract.createdAt)} | 更新日: {formatDate(contract.updatedAt)}
          </div>
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
