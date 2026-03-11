import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";
import { MobileNav } from "./mobile-nav";

export async function Header() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isAdmin = session.user.role === "admin";

  return (
    <header className="bg-white shadow-sm relative">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <Link href="/customers" className="text-lg font-bold text-gray-800">
            OA顧客管理
          </Link>
          {/* デスクトップナビ */}
          <nav className="hidden md:flex gap-4">
            <Link
              href="/customers"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              顧客一覧
            </Link>
            {isAdmin && (
              <Link
                href="/admin/users"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                ユーザー管理
              </Link>
            )}
          </nav>
        </div>
        {/* デスクトップユーザー情報 */}
        <div className="hidden md:flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {session.user.name}
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
              {isAdmin ? "管理者" : "営業"}
            </span>
          </span>
          <SignOutButton />
        </div>
        {/* モバイルハンバーガー */}
        <MobileNav
          userName={session.user.name ?? ""}
          userRole={session.user.role ?? "sales"}
          isAdmin={isAdmin}
        />
      </div>
    </header>
  );
}
