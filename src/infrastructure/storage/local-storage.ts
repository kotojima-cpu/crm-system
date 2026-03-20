/**
 * Local Object Storage
 *
 * メモリ内にオブジェクトを保持する。
 * ファイルシステム書き込みは行わない。
 *
 * 対象環境: local / test
 */

import { logger } from "@/shared/logging";
import type { ObjectStorage } from "./interface";
import type { PutObjectInput, PutObjectResult } from "./types";

export class LocalStorage implements ObjectStorage {
  /** テスト用: 保存されたオブジェクトを保持 */
  public readonly objects: Map<string, { body: Uint8Array | Buffer | string; contentType?: string }> = new Map();

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    this.objects.set(input.key, {
      body: input.body,
      contentType: input.contentType,
    });

    logger.info("[LocalStorage] Object stored (memory)", {
      storageKey: input.key,
      storageContentType: input.contentType ?? "unknown",
      storageTenantId: input.tenantId,
      storageRequestId: input.requestId,
    });

    return { key: input.key };
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    logger.debug("[LocalStorage] Signed URL generated (dummy)", {
      storageKey: key,
      storageExpires: expiresInSeconds,
    });
    return `http://localhost:3000/local-storage/${key}?expires=${expiresInSeconds}`;
  }
}
