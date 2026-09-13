-- LH-010: Challenge Studio backend foundation.
-- Extends lifecycle statuses, adds daily_goals kind, scheduled publishes,
-- challenge attempt analytics, and seeds LH-009 engine families/categories.

-- ── Alter status CHECK constraints ─────────────────────────────────────────

-- content_templates: add in_review, scheduled
ALTER TABLE content_templates DROP CONSTRAINT IF EXISTS content_templates_status_check;
ALTER TABLE content_templates ADD CONSTRAINT content_templates_status_check
  CHECK (status IN ('draft','submitted','in_review','approved','scheduled','published','paused','retired'));

-- content_template_versions: add in_review, scheduled
ALTER TABLE content_template_versions DROP CONSTRAINT IF EXISTS content_template_versions_status_check;
ALTER TABLE content_template_versions ADD CONSTRAINT content_template_versions_status_check
  CHECK (status IN ('draft','submitted','in_review','approved','scheduled','published','paused','retired'));

-- content_releases: add daily_goals
ALTER TABLE content_releases DROP CONSTRAINT IF EXISTS content_releases_kind_check;
ALTER TABLE content_releases ADD CONSTRAINT content_releases_kind_check
  CHECK (kind IN ('challenge_catalog','game_mode_rules','localization','power_configuration','daily_goals'));

-- content_current_releases: add daily_goals
ALTER TABLE content_current_releases DROP CONSTRAINT IF EXISTS content_current_releases_kind_check;
ALTER TABLE content_current_releases ADD CONSTRAINT content_current_releases_kind_check
  CHECK (kind IN ('challenge_catalog','game_mode_rules','localization','power_configuration','daily_goals'));

-- ── submitted_by_admin_id for SoD ─────────────────────────────────────────

ALTER TABLE content_template_versions
  ADD COLUMN IF NOT EXISTS submitted_by_admin_id uuid;

-- ── Scheduled publishes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_scheduled_publishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('challenge_catalog','game_mode_rules','localization','power_configuration','daily_goals')),
  payload jsonb NOT NULL,
  publish_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','done','cancelled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_scheduled_publishes_status_idx
  ON content_scheduled_publishes (status, publish_at);

-- ── Challenge attempt events (analytics) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_attempt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL,
  definition_id text NOT NULL,
  definition_version int NOT NULL,
  engine_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success','failure','timeout')),
  heart_delta int NOT NULL DEFAULT 0,
  energy_delta int NOT NULL DEFAULT 0,
  measure_ms int,
  locale text,
  mode text,
  round_number int,
  app_version text,
  device_family text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenge_attempt_events_engine_idx
  ON challenge_attempt_events (engine_id, created_at);

CREATE INDEX IF NOT EXISTS challenge_attempt_events_definition_idx
  ON challenge_attempt_events (definition_id, created_at);

CREATE INDEX IF NOT EXISTS challenge_attempt_events_match_idx
  ON challenge_attempt_events (match_id);

-- ── Seed LH-009 engine families/categories ─────────────────────────────────

INSERT INTO content_families (id, title) VALUES
  ('trap', 'Trap'),
  ('gesture', 'Gesture'),
  ('tap', 'Tap'),
  ('memory', 'Memory'),
  ('hold', 'Hold'),
  ('motion', 'Motion'),
  ('audio', 'Audio'),
  ('social', 'Social'),
  ('tactical', 'Tactical')
ON CONFLICT (id) DO NOTHING;

INSERT INTO content_categories (id, family_id, title) VALUES
  ('trap.no_touch', 'trap', 'No touch'),
  ('gesture.reverse_swipe', 'gesture', 'Reverse swipe'),
  ('tap.precision', 'tap', 'Precision tap'),
  ('memory.sequence', 'memory', 'Sequence recall'),
  ('hold.multitouch', 'hold', 'Multitouch hold'),
  ('motion.shake', 'motion', 'Shake'),
  ('motion.tilt_balance', 'motion', 'Tilt balance'),
  ('audio.cue', 'audio', 'Audio cue'),
  ('social.pair_sync', 'social', 'Pair sync'),
  ('tactical.risk_choice', 'tactical', 'Risk choice')
ON CONFLICT (id) DO NOTHING;
