-- __context__ コンテキスト初期マイグレーション
-- 生成手順: pnpm prisma migrate dev --create-only --name init___context__ の後、
--           EXCLUDE / RLS の raw SQL を **手で追記**する (Prisma スキーマでは表現できない)。
-- 適用手順: Cloud Run 起動時には流さない。deploy 前の Cloud Run Job で
--           `prisma migrate deploy` を実行し、成功後に api → web の順で deploy する。

CREATE TABLE "__aggregate__s" (
  "id"         VARCHAR(64) PRIMARY KEY,
  "tenant_id"  VARCHAR(64) NOT NULL,
  "status"     VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE INDEX "__aggregate__s_tenant_id_status_idx" ON "__aggregate__s" ("tenant_id", "status");

-- === 以下 raw SQL (Prisma スキーマ外) ===

-- 1. 区間の重なりを DB の制約で禁止する。アプリのチェックでは競合を潰せない。
--    SQLSTATE 23P01 が返り、adapter が SlotAlreadyTaken ドメインエラーへ翻訳する。
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "room_bookings" (
  "id"          VARCHAR(64) PRIMARY KEY,
  "tenant_id"   VARCHAR(64) NOT NULL,
  "room_id"     VARCHAR(64) NOT NULL,
  "period"      TSTZRANGE   NOT NULL,
  "released_at" TIMESTAMPTZ(3),
  CONSTRAINT "room_bookings_no_overlap"
    EXCLUDE USING GIST ("tenant_id" WITH =, "room_id" WITH =, "period" WITH &&)
    WHERE ("released_at" IS NULL)
);

-- 2. RLS。アプリは withTenant() が張る app.tenant_id 付きトランザクションでのみ読み書きする。
--    FORCE をつけないとテーブル所有者に対して RLS が効かない。
ALTER TABLE "__aggregate__s" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "__aggregate__s" FORCE ROW LEVEL SECURITY;
CREATE POLICY "__aggregate__s_tenant_isolation" ON "__aggregate__s"
  USING ("tenant_id" = current_setting('app.tenant_id', TRUE))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', TRUE));

ALTER TABLE "room_bookings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "room_bookings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "room_bookings_tenant_isolation" ON "room_bookings"
  USING ("tenant_id" = current_setting('app.tenant_id', TRUE))
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', TRUE));
