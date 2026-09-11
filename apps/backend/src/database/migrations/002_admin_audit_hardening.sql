-- LH-004A-R1: audit hardening — monotonic sequence + append-only enforcement.
-- Do not edit 001_admin_foundation.sql; this migration is idempotent.

-- Monotonic sequence used for deterministic pagination (UUID `id` remains the public identifier).
CREATE SEQUENCE IF NOT EXISTS admin_audit_logs_sequence_id_seq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_audit_logs'
      AND column_name = 'sequence_id'
  ) THEN
    ALTER TABLE admin_audit_logs
      ADD COLUMN sequence_id bigint;
  END IF;
END
$$;

-- Backfill any rows missing a sequence value (safe to re-run).
UPDATE admin_audit_logs
SET sequence_id = nextval('admin_audit_logs_sequence_id_seq')
WHERE sequence_id IS NULL;

ALTER TABLE admin_audit_logs
  ALTER COLUMN sequence_id SET DEFAULT nextval('admin_audit_logs_sequence_id_seq');

DO $$
BEGIN
  ALTER TABLE admin_audit_logs
    ALTER COLUMN sequence_id SET NOT NULL;
EXCEPTION
  WHEN others THEN
    NULL;
END
$$;

ALTER SEQUENCE admin_audit_logs_sequence_id_seq OWNED BY admin_audit_logs.sequence_id;

CREATE UNIQUE INDEX IF NOT EXISTS admin_audit_logs_sequence_id_uidx
  ON admin_audit_logs (sequence_id);

CREATE INDEX IF NOT EXISTS admin_audit_logs_sequence_id_id_idx
  ON admin_audit_logs (sequence_id DESC, id DESC);

-- Append-only: reject UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION admin_audit_logs_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is append-only'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_logs_no_update ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_update
  BEFORE UPDATE ON admin_audit_logs
  FOR EACH ROW
  EXECUTE PROCEDURE admin_audit_logs_reject_mutation();

DROP TRIGGER IF EXISTS admin_audit_logs_no_delete ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_delete
  BEFORE DELETE ON admin_audit_logs
  FOR EACH ROW
  EXECUTE PROCEDURE admin_audit_logs_reject_mutation();
