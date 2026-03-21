#!/usr/bin/env node
/**
 * Turbopack ハッシュ付き外部モジュール ID の symlink を作成する。
 *
 * Turbopack standalone は serverExternalPackages のパッケージを
 * "{package}-{hash}" という仮想モジュール ID で参照する。
 * Node.js の require() がこの名前を解決できるよう、
 * node_modules 内に実体パッケージへの symlink を作成する。
 *
 * Alpine の busybox grep は minified JS (巨大な1行) に対して
 * バッファ制限でマッチに失敗するため、Node.js で実装する。
 */

const fs = require("fs");
const path = require("path");

const SERVER_DIR = path.join(__dirname, "..", ".next", "server");
const NODE_MODULES = path.join(__dirname, "..", "node_modules");

// serverExternalPackages に対応するパッケージ名と symlink ターゲット
const EXTERNAL_PACKAGES = [
  { pattern: /@prisma\/client-[a-f0-9]+/g, target: "@prisma/client", scoped: true },
  { pattern: /bcryptjs-[a-f0-9]+/g, target: "bcryptjs", scoped: false },
];

function scanDir(dir) {
  let contents = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        contents = contents.concat(scanDir(fullPath));
      } else if (entry.name.endsWith(".js")) {
        contents.push(fullPath);
      }
    }
  } catch {
    // directory doesn't exist — skip
  }
  return contents;
}

function main() {
  console.log("[symlinks] Scanning .next/server/ for Turbopack hashed external module IDs...");

  const jsFiles = scanDir(SERVER_DIR);
  const foundIds = new Set();

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const pkg of EXTERNAL_PACKAGES) {
      const matches = content.match(pkg.pattern);
      if (matches) {
        for (const m of matches) {
          foundIds.add(JSON.stringify({ id: m, target: pkg.target, scoped: pkg.scoped }));
        }
      }
    }
  }

  if (foundIds.size === 0) {
    console.log("[symlinks] No hashed external module IDs found.");
    return;
  }

  let created = 0;
  for (const json of foundIds) {
    const { id, target, scoped } = JSON.parse(json);

    let symlinkPath;
    let targetPath;

    if (scoped) {
      // @prisma/client-{hash} → node_modules/@prisma/client-{hash} -> @prisma/client
      const aliasName = id.split("/")[1]; // "client-{hash}"
      symlinkPath = path.join(NODE_MODULES, "@prisma", aliasName);
      targetPath = path.join(NODE_MODULES, target);
    } else {
      // bcryptjs-{hash} → node_modules/bcryptjs-{hash} -> bcryptjs
      symlinkPath = path.join(NODE_MODULES, id);
      targetPath = path.join(NODE_MODULES, target);
    }

    if (!fs.existsSync(symlinkPath)) {
      fs.symlinkSync(targetPath, symlinkPath);
      console.log(`[symlinks]   ${id} -> ${target}`);
      created++;
    }
  }

  console.log(`[symlinks] Done. Created ${created} symlink(s).`);
}

main();
