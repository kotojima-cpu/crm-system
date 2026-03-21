# ============================================================
# Stage 1: Builder
# - 全依存インストール + Prisma Client 生成 + Next.js ビルド
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# ============================================================
# Stage 2: Prisma CLI 依存セット
# - migrate deploy に必要な effect / c12 等を独立インストール
# - --ignore-scripts: Prisma 6.x は WASM ベースのため native binary 不要
# ============================================================
FROM node:20-alpine AS prisma-cli

WORKDIR /app

RUN echo '{"name":"prisma-cli","version":"1.0.0","private":true}' > package.json && \
    npm install prisma@6.19.2 --ignore-scripts --no-audit --no-fund

# ============================================================
# Stage 3: Runner (本番用軽量イメージ)
# - node_modules を 2 段で構成:
#     1. prisma-cli stage (CLI + effect/c12 等の全依存)
#     2. standalone の node_modules (Next.js runtime + Prisma Client) で上書き
# ============================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 非 root ユーザーを作成
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 1. Prisma CLI + 全依存 (effect, c12, deepmerge-ts, empathic 等)
COPY --from=prisma-cli --chown=nextjs:nodejs /app/node_modules ./node_modules

# 2. Next.js standalone の node_modules をマージ
#    (next, react, @prisma/client, .prisma/client 等を追加・上書き)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/node_modules ./node_modules
# 2a. standalone のファイルトレースで不完全になるパッケージを完全版で上書き
#     bcryptjs 3.x: exports.require → umd/index.js だが、standalone tracer が
#     umd/ を追跡しないため CJS require() が失敗する
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs

# 3. standalone サーバー本体
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/server.js ./server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/package.json ./package.json

# 4. Next.js ビルド成果物 (.next/ 全体)
#    standalone server.js は BUILD_ID / routes-manifest.json 等を参照するため全体が必要
#    cache/ はビルドキャッシュのみのため除外
COPY --from=builder --chown=nextjs:nodejs /app/.next/BUILD_ID ./.next/BUILD_ID
COPY --from=builder --chown=nextjs:nodejs /app/.next/routes-manifest.json ./.next/routes-manifest.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/build-manifest.json ./.next/build-manifest.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/prerender-manifest.json ./.next/prerender-manifest.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/app-path-routes-manifest.json ./.next/app-path-routes-manifest.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/required-server-files.json ./.next/required-server-files.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/fallback-build-manifest.json ./.next/fallback-build-manifest.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/server ./.next/server
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 5. Prisma スキーマ・マイグレーション
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# 6. 起動スクリプト
COPY --from=builder --chown=nextjs:nodejs /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# 7. Turbopack ハッシュ付き外部モジュール ID のシンボリックリンク作成
#
#    Turbopack standalone は serverExternalPackages に指定したパッケージを
#    "{package}-{hash}" という仮想モジュール ID で参照する。
#    例: @prisma/client → @prisma/client-a1b2c3d4
#         bcryptjs     → bcryptjs-ee66c2bdc904f2cf
#    Node.js の require() はその名前のパッケージを node_modules で探すため、
#    実体への symlink が必要。
#
#    注意: Alpine の busybox grep は巨大な1行ファイル (minified JS) で
#    バッファ制限によりマッチに失敗することがあるため、
#    node を使ってスキャンする。
COPY --chown=nextjs:nodejs scripts/create-turbopack-symlinks.js ./scripts/create-turbopack-symlinks.js
RUN node scripts/create-turbopack-symlinks.js


USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
