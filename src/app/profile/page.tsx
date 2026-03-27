/**
 * /profile — マイページ（本人情報の表示・編集）
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ProfileForm } from "./profile-form";
import { prisma } from "@/lib/prisma";

const roleLabel: Record<string, string> = {
  platform_master: "親管理者",
  platform_operator: "親担当者",
  tenant_admin: "子管理者",
  sales: "子担当者",
};

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: {
      id: true,
      loginId: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      tenantId: true,
      tenant: { select: { name: true } },
      createdAt: true,
    },
  });

  if (!user) redirect("/login");

  const isMaster = user.role === "platform_master";

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-xl font-semibold text-gray-800">マイページ</h1>

        {/* 表示のみの情報 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">アカウント情報</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">ログインID</dt>
              <dd className="font-medium font-mono">{user.loginId}</dd>
            </div>
            <div>
              <dt className="text-gray-500">ロール</dt>
              <dd className="font-medium">{roleLabel[user.role] ?? user.role}</dd>
            </div>
            {user.tenant && (
              <div>
                <dt className="text-gray-500">所属テナント</dt>
                <dd className="font-medium">{user.tenant.name}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">登録日</dt>
              <dd>{new Date(user.createdAt).toLocaleDateString("ja-JP")}</dd>
            </div>
          </dl>
        </div>

        {/* 編集可能な情報 */}
        <ProfileForm
          isMaster={isMaster}
          initialData={{
            name: user.name,
            email: user.email ?? "",
            phone: user.phone ?? "",
          }}
        />
      </main>
    </>
  );
}
