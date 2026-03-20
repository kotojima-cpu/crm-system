/**
 * SecretProvider Interface
 *
 * Secrets Manager を直接各所で読まない。
 * この interface を通して secret を取得する。
 */

export interface SecretProvider {
  /** secret 文字列を取得 */
  getSecret(name: string): Promise<string>;
  /** secret JSON をパースして取得 */
  getJsonSecret<T = unknown>(name: string): Promise<T>;
}
