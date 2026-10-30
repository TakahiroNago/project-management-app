-- 「すべてのプロジェクトに OWNER がちょうど 1 人存在する」を DB レベルで保証する。
--
-- DEFERRABLE INITIALLY DEFERRED の制約トリガーのため、検査はトランザクションのコミット時に行われる。
-- これにより「プロジェクト作成 → OWNER 登録」を 1 トランザクション内で順に実行でき、
-- 逆に OWNER を登録せずにコミットしようとするとエラーになる。
-- プロジェクト削除時（CASCADE でメンバーも削除）はプロジェクト自体が存在しないため検査対象外。

CREATE OR REPLACE FUNCTION assert_project_has_single_owner() RETURNS trigger AS $$
DECLARE
  target_project_ids text[];
  target_id text;
  owner_count integer;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    target_project_ids := ARRAY[NEW."id"];
  ELSIF TG_OP = 'INSERT' THEN
    target_project_ids := ARRAY[NEW."projectId"];
  ELSIF TG_OP = 'DELETE' THEN
    target_project_ids := ARRAY[OLD."projectId"];
  ELSE
    target_project_ids := ARRAY[OLD."projectId", NEW."projectId"];
  END IF;

  FOREACH target_id IN ARRAY target_project_ids LOOP
    IF EXISTS (SELECT 1 FROM "projects" WHERE "id" = target_id) THEN
      SELECT count(*) INTO owner_count
        FROM "project_members"
       WHERE "projectId" = target_id AND "role" = 'OWNER';

      IF owner_count <> 1 THEN
        RAISE EXCEPTION 'Project % must have exactly one OWNER (found %)', target_id, owner_count
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "projects_owner_invariant"
  AFTER INSERT ON "projects"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_project_has_single_owner();

CREATE CONSTRAINT TRIGGER "project_members_owner_invariant"
  AFTER INSERT OR UPDATE OR DELETE ON "project_members"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_project_has_single_owner();
