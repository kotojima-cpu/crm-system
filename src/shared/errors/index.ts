/**
 * 共通エラー型定義
 *
 * ドメイン固有のエラークラス。
 * HTTP レスポンスコードとエラーコードのマッピングを含む。
 */

/** アプリケーションエラーの基底クラス */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** 認証エラー（401） */
export class UnauthorizedError extends AppError {
  constructor(message = "認証が必要です") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

/** セッション失効エラー（401） */
export class SessionExpiredError extends AppError {
  constructor(message = "セッションが無効です。再ログインしてください") {
    super("SESSION_EXPIRED", message, 401);
    this.name = "SessionExpiredError";
  }
}

/** 権限不足エラー（403） */
export class ForbiddenError extends AppError {
  constructor(message = "権限がありません", code = "FORBIDDEN") {
    super(code, message, 403);
    this.name = "ForbiddenError";
  }
}

/** テナント停止エラー（403） */
export class TenantSuspendedError extends ForbiddenError {
  constructor() {
    super("テナントが停止されています", "TENANT_SUSPENDED");
    this.name = "TenantSuspendedError";
  }
}

/** リソース未検出エラー（404） */
export class NotFoundError extends AppError {
  constructor(resource = "リソース") {
    super("NOT_FOUND", `${resource}が見つかりません`, 404);
    this.name = "NotFoundError";
  }
}

/** バリデーションエラー（400） */
export class ValidationError extends AppError {
  constructor(
    message = "リクエストが不正です",
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super("VALIDATION_ERROR", message, 400);
    this.name = "ValidationError";
  }
}

/** テナント所有権エラー（403） */
export class TenantOwnershipError extends ForbiddenError {
  constructor() {
    super("このリソースへのアクセス権がありません", "TENANT_OWNERSHIP_ERROR");
    this.name = "TenantOwnershipError";
  }
}

/** テナント文脈不整合エラー（内部エラー） */
export class TenantContextMismatchError extends AppError {
  constructor(expected: number, actual: number | undefined) {
    super(
      "TENANT_CONTEXT_MISMATCH",
      `Tenant mismatch: expected=${expected}, actual=${actual}`,
      500,
    );
    this.name = "TenantContextMismatchError";
  }
}

/** 顧客数上限エラー（403） */
export class CustomerHardLimitError extends ForbiddenError {
  constructor(hardLimit: number) {
    super(
      `顧客登録数が上限（${hardLimit}件）に達しています。プランのアップグレードについては管理者にお問い合わせください`,
      "CUSTOMER_HARD_LIMIT_REACHED",
    );
    this.name = "CustomerHardLimitError";
  }
}

/** AppError を NextResponse 用の JSON に変換 */
export function toErrorResponse(error: AppError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error instanceof ValidationError && error.details
        ? { details: error.details }
        : {}),
    },
  };
}
