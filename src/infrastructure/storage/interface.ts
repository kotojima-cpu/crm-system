/**
 * ObjectStorage Interface
 *
 * S3 を直接呼ばず、この interface を通してオブジェクトを操作する。
 */

import type { PutObjectInput, PutObjectResult } from "./types";

export interface ObjectStorage {
  /** オブジェクトを保存 */
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  /** 署名付き URL を生成（実装はオプショナル） */
  getSignedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}
