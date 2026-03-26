-- User.email に UNIQUE 制約を追加（メールセルフパスワードリセットの前提整備）
-- PostgreSQL の UNIQUE は NULL を重複とみなさないため、既存 NULL データは影響なし

-- 1. 空文字があれば NULL に補正（安全策）
UPDATE users SET email = NULL WHERE email = '';

-- 2. 既存 email を小文字正規化（安全策）
UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL;

-- 3. UNIQUE 制約追加
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
