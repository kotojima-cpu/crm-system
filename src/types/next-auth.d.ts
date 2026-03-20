import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      loginId: string;
      role: string;
      // マルチテナント拡張フィールド（Phase 1 スキーマ移行後に JWT に含まれる）
      tenantId?: string;
      tenantStatus?: string;
      authVersion?: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    loginId: string;
    role: string;
    // マルチテナント拡張フィールド
    tenantId?: string;
    tenantStatus?: string;
    authVersion?: number;
  }
}
