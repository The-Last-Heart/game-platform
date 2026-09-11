-- LH-004A admin foundation tables
-- Append-only audit logs; sessions store token hashes only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(email)) STORED,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  last_login_at timestamptz NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES admin_users (id) ON DELETE SET NULL,
  CONSTRAINT admin_users_email_normalized_unique UNIQUE (email_normalized),
  CONSTRAINT admin_users_role_check CHECK (
    role IN (
      'super_admin',
      'content_manager',
      'live_ops',
      'translator',
      'viewer'
    )
  ),
  CONSTRAINT admin_users_status_check CHECK (status IN ('active', 'deactivated')),
  CONSTRAINT admin_users_display_name_len CHECK (
    char_length(display_name) BETWEEN 1 AND 120
  ),
  CONSTRAINT admin_users_email_len CHECK (char_length(email) BETWEEN 3 AND 320),
  CONSTRAINT admin_users_password_hash_nonempty CHECK (char_length(password_hash) > 0)
);

CREATE INDEX IF NOT EXISTS admin_users_role_idx ON admin_users (role);
CREATE INDEX IF NOT EXISTS admin_users_status_idx ON admin_users (status);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text NULL,
  ip_hash text NULL,
  CONSTRAINT admin_sessions_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT admin_sessions_token_hash_nonempty CHECK (char_length(token_hash) > 0)
);

CREATE INDEX IF NOT EXISTS admin_sessions_admin_user_id_idx
  ON admin_sessions (admin_user_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx
  ON admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS admin_sessions_active_idx
  ON admin_sessions (admin_user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id uuid NULL REFERENCES admin_users (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NULL,
  outcome text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_logs_action_nonempty CHECK (char_length(action) BETWEEN 1 AND 128),
  CONSTRAINT admin_audit_logs_entity_type_nonempty CHECK (
    char_length(entity_type) BETWEEN 1 AND 64
  ),
  CONSTRAINT admin_audit_logs_outcome_check CHECK (
    outcome IN ('success', 'failure', 'denied')
  )
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_admin_id_idx
  ON admin_audit_logs (actor_admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx
  ON admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS admin_audit_logs_entity_idx
  ON admin_audit_logs (entity_type, entity_id);
