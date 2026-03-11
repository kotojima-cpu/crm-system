import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Header } from "@/components/header";
import { CustomerSearch } from "@/components/customer-search";
import { Pagination } from "@/components/pagination";
import { PwaHide } from "@/components/pwa-hide";
import { normalizePhone } from "@/lib/phone";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function CustomerList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const limit = 20;
  const companyName = typeof params.companyName === "string" ? params.companyName : "";
  const address = typeof params.address === "string" ? params.address : "";
  const phone = typeof params.phone === "string" ? params.phone : "";

  const where: Record<string, unknown> = { isDeleted: false };
  const andConditions: Record<string, unknown>[] = [];

  if (companyName) {
    andConditions.push({ companyName: { contains: companyName } });
  }
  if (address) {
    andConditions.push({ address: { contains: address } });
  }
  if (phone) {
    const normalized = normalizePhone(phone);
    if (normalized) {
      andConditions.push({ phoneNumberNormalized: { contains: normalized } });
    }
  }
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        companyName: true,
        address: true,
        phone: true,
        contactName: true,
        updatedAt: true,
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      {customers.length === 0 ? (
        <p className="text-gray-500 py-8 text-center">
          {companyName || address || phone
            ? "検索条件に一致する顧客が見つかりません"
            : "顧客データはまだ登録されていません"}
        </p>
      ) : (
        <>
          {/* モバイル: カードUI */}
          <div className="md:hidden space-y-3">
            {customers.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 active:bg-gray-50"
              >
                <div className="font-medium text-gray-900 mb-1">{customer.companyName}</div>
                {customer.address && (
                  <div className="text-xs text-gray-500 mb-1">{customer.address}</div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{customer.phone || "\u2014"}</span>
                  <span>{customer.contactName || "\u2014"}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1 text-right">
                  {formatDate(customer.updatedAt)}
                </div>
              </Link>
            ))}
          </div>

          {/* デスクトップ: テーブルUI */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full bg-white rounded-lg shadow-sm border border-gray-200">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    顧客名
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    住所
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    電話番号
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    担当者名
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                    最終更新日
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {customer.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {customer.address || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {customer.phone || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {customer.contactName || "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(customer.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} limit={limit} />
        </>
      )}
    </>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">顧客一覧</h2>
          <PwaHide>
            <Link
              href="/customers/new"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              新規登録
            </Link>
          </PwaHide>
        </div>

        <Suspense>
          <CustomerSearch />
        </Suspense>

        <div className="mt-4">
          <Suspense fallback={<p className="text-gray-500">読み込み中...</p>}>
            <CustomerList searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
