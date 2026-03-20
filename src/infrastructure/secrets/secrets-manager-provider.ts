/**
 * AWS Secrets Manager Provider
 *
 * AWS Secrets Manager から secret を取得する。
 * AWS SDK 呼び出しはこのファイルに閉じ込める。
 *
 * ┌─ REQUIRED BEFORE PRODUCTION ──────────────────────────────────────────┐
 * │                                                                      │
 * │ 本番利用前に以下を完了すること:                                       │
 * │   1. Secrets Manager に secret 登録                                   │
 * │   2. AWS SDK v3 の @aws-sdk/client-secrets-manager インストール      │
 * │   3. IAM 実行ロールに secretsmanager:GetSecretValue 権限付与         │
 * │                                                                      │
 * │ secret 名はログに出してよいが、secret 値は絶対に出さない。           │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { logger } from "@/shared/logging";
import type { SecretProvider } from "./interface";
import { SecretResolutionError } from "./types";

export class SecretsManagerProvider implements SecretProvider {
  async getSecret(name: string): Promise<string> {
    try {
      // ┌─ AWS SDK 呼び出し（Phase 9 以降で有効化）─────────────────────┐
      // │                                                                │
      // │ import {                                                       │
      // │   SecretsManagerClient,                                        │
      // │   GetSecretValueCommand,                                       │
      // │ } from "@aws-sdk/client-secrets-manager";                      │
      // │                                                                │
      // │ const client = new SecretsManagerClient({                      │
      // │   region: getAwsRegion(),                                      │
      // │ });                                                            │
      // │ const result = await client.send(                              │
      // │   new GetSecretValueCommand({ SecretId: name }),               │
      // │ );                                                             │
      // │                                                                │
      // │ if (!result.SecretString) {                                    │
      // │   throw new SecretResolutionError(name, "SecretString is empty");
      // │ }                                                              │
      // │ return result.SecretString;                                    │
      // └────────────────────────────────────────────────────────────────┘

      logger.info("[SecretsManagerProvider] GetSecret (stub)", {
        secretName: name,
      });

      throw new SecretResolutionError(
        name,
        "SecretsManagerProvider stub — AWS SDK not yet wired",
      );
    } catch (err) {
      if (err instanceof SecretResolutionError) throw err;

      const msg = err instanceof Error ? err.message : String(err);
      // secret 名のみログ出力。値は出さない。
      logger.error("[SecretsManagerProvider] GetSecret failed", err instanceof Error ? err : undefined, {
        secretName: name,
      });
      throw new SecretResolutionError(name, msg);
    }
  }

  async getJsonSecret<T = unknown>(name: string): Promise<T> {
    const raw = await this.getSecret(name);
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new SecretResolutionError(
        name,
        `Failed to parse JSON secret: ${name}`,
      );
    }
  }
}
