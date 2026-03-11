/**
 * PWA アイコン生成スクリプト
 *
 * 実行方法: npx tsx scripts/generate-icons.ts
 *
 * Canvas ライブラリが必要な場合は以下をインストール:
 *   npm install canvas --save-dev
 *
 * このスクリプトがない環境では、public/icons/icon.svg を
 * 外部ツール (Figma, Canva, https://realfavicongenerator.net 等) で
 * 192x192 / 512x512 の PNG に変換してください。
 */

import { writeFileSync } from "fs";
import { join } from "path";

const sizes = [192, 512];
const outDir = join(__dirname, "..", "public", "icons");

// SVG → PNG 変換が不要な場合のプレースホルダー生成
// 1x1 transparent PNG (最小限のPNG)
function createPlaceholderPng(): Buffer {
  // 最小限の1x1 PNG バイナリ
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
}

console.log("PWA アイコンのプレースホルダーを生成します。");
console.log("本番用アイコンは icon.svg から手動で PNG に変換してください。\n");

for (const size of sizes) {
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, createPlaceholderPng());
  console.log(`  Created: icons/icon-${size}.png (placeholder)`);
}

console.log("\n完了。本番用は icon.svg を PNG 変換ツールで変換してください。");
