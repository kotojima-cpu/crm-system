/**
 * ObjectStorage 型定義
 */

import type { TenantAwareExternalPayload } from "../types";

/**
 * オブジェクト保存入力。
 *
 * ┌─ tenant 別 prefix 分離 ────────────────────────────────────────────────┐
 * │ tenant データは "tenants/{tenantId}/" prefix 配下に保存する。          │
 * │ key に prefix を含めるかは呼び出し側の責務。                           │
 * │ S3 実装では bucket 名 + prefix を組み合わせて保存先を決定する。       │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export interface PutObjectInput {
  /** オブジェクトキー（tenant prefix 付き推奨） */
  key: string;
  /** ファイル本体 */
  body: Uint8Array | Buffer | string;
  /** Content-Type */
  contentType?: string;
  /** tenant ID */
  tenantId: number | null;
  /** リクエスト ID */
  requestId: string;
}

/** オブジェクト保存結果 */
export interface PutObjectResult {
  key: string;
}

/** オブジェクト取得入力 */
export interface GetObjectInput {
  key: string;
  tenantId: number | null;
  requestId: string;
}

/** 署名付き URL 取得入力 */
export interface GetSignedUrlInput {
  key: string;
  expiresInSeconds: number;
}
