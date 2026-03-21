-- 親運営ロールを platform_admin → platform_master に変換
-- platform_operator は後から手動で作成する
UPDATE "users" SET role = 'platform_master' WHERE role = 'platform_admin';
