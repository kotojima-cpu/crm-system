/**
 * /platform/tenants/new — テナント新規作成画面（platform_admin 専用）
 *
 * テナント名 + 初期管理者情報を入力して作成する。
 * middleware で platform_admin 以外はブロック済み。
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { CreateTenantForm } from "./create-tenant-form";

export default async function NewTenantPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user?.role !== "platform_master" && session.user?.role !== "platform_operator" && session.user?.role !== "platform_admin")) {
    redirect("/login");
  }

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">テナント新規作成</h1>
          <p className="text-sm text-gray-500">
            テナントと初期管理者アカウントを同時に作成します
          </p>
        </div>
        <CreateTenantForm />
      </main>
    </>
  );
}
