/**
 * Env Secret Provider
 *
 * 環境変数から secret を取得する。
 * local / test 環境用。
 *
 * secret 名は大文字スネークケースに変換して環境変数を参照する。
 * 例: "db/connection" → "DB_CONNECTION"
 */

import { logger } from "@/shared/logging";
import type { SecretProvider } from "./interface";
import { SecretResolutionError } from "./types";

export class EnvSecretProvider implements SecretProvider {
  /**
   * secret 名を環境変数名に変換する。
   * "/" → "_"、小文字 → 大文字
   */
  private toEnvKey(name: string): string {
    return name.replace(/[\/\-\.]/g, "_").toUpperCase();
  }

  async getSecret(name: string): Promise<string> {
    const envKey = this.toEnvKey(name);
    const value = process.env[envKey];

    if (value === undefined || value === "") {
      // secret 名はログに出してよいが、値は出さない
      logger.warn("[EnvSecretProvider] Secret not found in env", {
        secretName: name,
        envKey,
      });
      throw new SecretResolutionError(name, `Environment variable ${envKey} is not set`);
    }

    logger.debug("[EnvSecretProvider] Secret resolved from env", {
      secretName: name,
      envKey,
    });

    return value;
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
