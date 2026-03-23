import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";
import { MobileNav } from "./mobile-nav";

export async function Header() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const role = session.user.role;
  const isPlatform = role === "platform_master" || role === "platform_operator";
  const isMaster = role === "platform_master";
  const isTenantAdmin = role === "tenant_admin";

  // ロールバッジの表示名
  const roleBadge = role === "platform_master"
    ? "運営マスター"
    : role === "platform_operator"
      ? "運営担当"
      : isTenantAdmin
        ? "管理者"
        : "営業";

  // ホームリンク先
  const homeHref = isPlatform ? "/platform/tenants" : "/customers";

  return (
    <header className="bg-white shadow-sm relative">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <Link href={homeHref} className="text-lg font-bold text-gray-800">
            OAフロント
          </Link>
          {/* デスクトップナビ */}
          <nav className="hidden md:flex gap-4">
            {isPlatform ? (
              <>
                <Link href="/platform/tenants" className="text-sm text-gray-600 hover:text-gray-900">
                  テナント管理
                </Link>
                {isMaster && (
                  <>
                    <Link href="/platform/outbox" className="text-sm text-gray-600 hover:text-gray-900">
                      Outbox管理
                    </Link>
                    <Link href="/platform/users" className="text-sm text-gray-600 hover:text-gray-900">
                      親担当者管理
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>
                <Link href="/customers" className="text-sm text-gray-600 hover:text-gray-900">
                  顧客一覧
                </Link>
                {isTenantAdmin && (
                  <Link href="/admin/users" className="text-sm text-gray-600 hover:text-gray-900">
                    ユーザー管理
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
        {/* デスクトップユーザー情報 */}
        <div className="hidden md:flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {session.user.name}
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
              {roleBadge}
            </span>
          </span>
          <SignOutButton />
        </div>
        {/* モバイルハンバーガー */}
        <MobileNav
          userName={session.user.name ?? ""}
          userRole={role ?? "sales"}
          isPlatform={isPlatform}
          isMaster={isMaster}
          isTenantAdmin={isTenantAdmin}
        />
      </div>
    </header>
  );
}
