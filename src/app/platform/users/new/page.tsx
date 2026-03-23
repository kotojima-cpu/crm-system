/**
 * /platform/users/new — 運営担当者作成画面（platform_master 専用）
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { CreateOperatorForm } from "./create-operator-form";

export default async function NewPlatformUserPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "platform_master") {
    redirect("/platform/tenants");
  }

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">親担当者を追加</h1>
          <p className="text-sm text-gray-500">
            親担当者アカウントを作成します。
            子管理者アカウントの作成・停止のみが許可されます。
          </p>
        </div>
        <CreateOperatorForm />
      </main>
    </>
  );
}
