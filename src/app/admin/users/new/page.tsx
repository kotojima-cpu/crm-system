/**
 * /admin/users/new — テナントユーザー作成画面（tenant_admin 専用）
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { CreateUserForm } from "./create-user-form";

export default async function NewUserPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "tenant_admin") {
    redirect("/customers");
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    redirect("/customers");
  }

  return (
    <>
      <Header />
      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <Link href="/admin/users" className="text-sm text-blue-600 hover:underline">
          &larr; ユーザー一覧に戻る
        </Link>

        <h1 className="text-xl font-semibold">ユーザー追加</h1>

        <CreateUserForm tenantId={tenantId} />
      </main>
    </>
  );
}
