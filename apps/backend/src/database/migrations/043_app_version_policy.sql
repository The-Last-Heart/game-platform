-- Mobile application version policy + player last-seen version telemetry.

CREATE TABLE IF NOT EXISTS app_version_policy (
  id text PRIMARY KEY CHECK (id = 'mobile_app_version'),
  minimum_supported_version text NOT NULL,
  android_store_url text NOT NULL,
  ios_store_url text NOT NULL,
  policy_revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_admin_id uuid NULL REFERENCES admin_users (id) ON DELETE SET NULL,
  last_reason text NULL,
  CONSTRAINT app_version_policy_min_semver CHECK (
    minimum_supported_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
  ),
  CONSTRAINT app_version_policy_android_https CHECK (
    android_store_url ~ '^https://'
  ),
  CONSTRAINT app_version_policy_ios_https CHECK (
    ios_store_url ~ '^https://'
  ),
  CONSTRAINT app_version_policy_revision_nonneg CHECK (policy_revision >= 0)
);

-- Safe initial floor: first shipped gameplay version (does not lock out users).
INSERT INTO app_version_policy (
  id,
  minimum_supported_version,
  android_store_url,
  ios_store_url,
  policy_revision,
  last_reason
) VALUES (
  'mobile_app_version',
  '0.0.1',
  'https://play.google.com/store/apps/details?id=com.thelastheart.game',
  'https://apps.apple.com/app/id0000000000',
  0,
  'bootstrap: first gameplay release floor'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS last_seen_app_version text NULL,
  ADD COLUMN IF NOT EXISTS last_seen_build_number text NULL,
  ADD COLUMN IF NOT EXISTS last_seen_platform text NULL,
  ADD COLUMN IF NOT EXISTS last_seen_app_at timestamptz NULL;

ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_last_seen_platform_chk;
ALTER TABLE players
  ADD CONSTRAINT players_last_seen_platform_chk CHECK (
    last_seen_platform IS NULL OR last_seen_platform IN ('android', 'ios')
  );

ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_last_seen_app_version_chk;
ALTER TABLE players
  ADD CONSTRAINT players_last_seen_app_version_chk CHECK (
    last_seen_app_version IS NULL
    OR last_seen_app_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
  );
