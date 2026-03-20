/**
 * Secrets 型定義
 */

/** Secret 取得エラー */
export class SecretResolutionError extends Error {
  constructor(
    public readonly secretName: string,
    message?: string,
  ) {
    super(message ?? `Secret not found: ${secretName}`);
    this.name = "SecretResolutionError";
  }
}
