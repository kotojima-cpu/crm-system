import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** platform ロール判定（middleware は auth/ を import できないため自前で判定）
 *  platform_admin は旧ロール名。migration 移行期間中は古い JWT cookie に
 *  残っている可能性があるため互換として含める。 */
function isPlatformRole(role: unknown): boolean {
  return role === "platform_master" || role === "platform_operator" || role === "platform_admin";
}

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;



  // ログインページは未認証でもアクセス可
  if (pathname === "/login") {
    if (token) {
      // ログイン済みならロールに応じたトップへ
      const dest = isPlatformRole(token.role) ? "/platform/tenants" : "/customers";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  // 認証不要なAPIルートはスルー
  if (pathname.startsWith("/api/auth") || pathname === "/api/health") {
    return NextResponse.next();
  }

  // 未認証の場合はログインページへリダイレクト
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /platform/users* と /platform/outbox* は platform_master のみ許可
  if (pathname.startsWith("/platform/users") || pathname.startsWith("/platform/outbox")) {
    if (token.role !== "platform_master") {
      return NextResponse.redirect(new URL("/platform/tenants", request.url));
    }
  }

  // /platform/* は platform ロールのみ許可
  if (pathname.startsWith("/platform")) {
    if (!isPlatformRole(token.role)) {
      return NextResponse.redirect(new URL("/customers", request.url));
    }
  }

  // /admin/* は platform ロールまたは tenant_admin のみ許可
  if (pathname.startsWith("/admin")) {
    if (!isPlatformRole(token.role) && token.role !== "tenant_admin") {
      return NextResponse.redirect(new URL("/customers", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js).*)",
  ],
};
