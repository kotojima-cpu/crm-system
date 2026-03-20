/**
 * S3 Object Storage
 *
 * Amazon S3 を使ったオブジェクトストレージ実装。
 *
 * ┌─ REQUIRED BEFORE PRODUCTION ──────────────────────────────────────────┐
 * │                                                                      │
 * │ 本番利用前に以下を完了すること:                                       │
 * │   1. S3 bucket 作成                                                  │
 * │   2. 環境変数 S3_BUCKET_NAME 設定                                    │
 * │   3. AWS SDK v3 の @aws-sdk/client-s3 インストール                   │
 * │   4. IAM 実行ロールに s3:PutObject / s3:GetObject 権限付与           │
 * │   5. tenant 別 prefix 分離 ("tenants/{tenantId}/")                   │
 * │   6. 署名付き URL が必要なら @aws-sdk/s3-request-presigner          │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { logger } from "@/shared/logging";
import type { ObjectStorage } from "./interface";
import type { PutObjectInput, PutObjectResult } from "./types";

export class S3Storage implements ObjectStorage {
  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    try {
      // ┌─ AWS SDK 呼び出し（Phase 9 以降で有効化）─────────────────────┐
      // │                                                                │
      // │ import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
      // │                                                                │
      // │ const client = new S3Client({ region: getAwsRegion() });       │
      // │ await client.send(new PutObjectCommand({                       │
      // │   Bucket: process.env.S3_BUCKET_NAME,                          │
      // │   Key: input.key,                                              │
      // │   Body: input.body,                                            │
      // │   ContentType: input.contentType,                              │
      // │   Metadata: {                                                  │
      // │     requestId: input.requestId,                                │
      // │     ...(input.tenantId !== null                                │
      // │       ? { tenantId: String(input.tenantId) }                   │
      // │       : {}),                                                   │
      // │   },                                                           │
      // │ }));                                                            │
      // └────────────────────────────────────────────────────────────────┘

      logger.info("[S3Storage] PutObject (stub)", {
        storageKey: input.key,
        storageTenantId: input.tenantId,
        storageRequestId: input.requestId,
      });

      return { key: input.key };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[S3Storage] PutObject failed", err instanceof Error ? err : undefined, {
        storageKey: input.key,
        storageRequestId: input.requestId,
      });
      throw new Error(`S3 PutObject failed: ${errorMessage}`);
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    // ┌─ AWS SDK 呼び出し（Phase 9 以降で有効化）───────────────────────┐
    // │                                                                  │
    // │ import { GetObjectCommand } from "@aws-sdk/client-s3";           │
    // │ import { getSignedUrl } from "@aws-sdk/s3-request-presigner";    │
    // │                                                                  │
    // │ const client = new S3Client({ region: getAwsRegion() });         │
    // │ const command = new GetObjectCommand({                           │
    // │   Bucket: process.env.S3_BUCKET_NAME,                            │
    // │   Key: key,                                                      │
    // │ });                                                               │
    // │ return getSignedUrl(client, command, {                            │
    // │   expiresIn: expiresInSeconds,                                   │
    // │ });                                                               │
    // └──────────────────────────────────────────────────────────────────┘

    logger.info("[S3Storage] GetSignedUrl (stub)", {
      storageKey: key,
      storageExpires: expiresInSeconds,
    });

    return `https://s3-stub.example.com/${key}?expires=${expiresInSeconds}`;
  }
}
