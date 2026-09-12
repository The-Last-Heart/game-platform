-- LH-006: versioned game content releases, pins, and emergency controls.
-- Idempotent / safe to re-run via schema_migrations tracking.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Taxonomy ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_families (
  id text PRIMARY KEY,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_categories (
  id text PRIMARY KEY,
  family_id text NOT NULL REFERENCES content_families (id),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  family_id text NOT NULL REFERENCES content_families (id),
  category_id text NOT NULL REFERENCES content_categories (id),
  internal_title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','published','paused','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES content_templates (id) ON DELETE CASCADE,
  version int NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','published','paused','retired')),
  definition jsonb NOT NULL,
  validation_hash text NOT NULL,
  validation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by_admin_id uuid,
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS content_template_versions_template_idx
  ON content_template_versions (template_id);

-- ── Releases ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL
    CHECK (kind IN ('challenge_catalog','game_mode_rules','localization','power_configuration')),
  version_label text NOT NULL,
  payload jsonb NOT NULL,
  changelog text,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by_admin_id uuid,
  UNIQUE (kind, version_label)
);

CREATE TABLE IF NOT EXISTS content_current_releases (
  kind text PRIMARY KEY
    CHECK (kind IN ('challenge_catalog','game_mode_rules','localization','power_configuration')),
  release_id uuid NOT NULL REFERENCES content_releases (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_catalog_entry_overrides (
  definition_id text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Emergency controls (singleton row) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_controls (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  matchmaking_paused boolean NOT NULL DEFAULT false,
  matchmaking_pause_reason text,
  matchmaking_paused_at timestamptz,
  bot_fill_enabled boolean NOT NULL DEFAULT false,
  bot_fill_wait_ms int NOT NULL DEFAULT 15000
    CHECK (bot_fill_wait_ms >= 0 AND bot_fill_wait_ms <= 600000),
  offensive_powers_disabled boolean NOT NULL DEFAULT false,
  offensive_powers_disable_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO emergency_controls (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ── Match pins (support / investigation) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS match_pins (
  match_id uuid PRIMARY KEY,
  challenge_catalog_release_id uuid NOT NULL REFERENCES content_releases (id),
  game_mode_rule_release_id uuid NOT NULL REFERENCES content_releases (id),
  localization_release_id uuid NOT NULL REFERENCES content_releases (id),
  power_configuration_release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Bootstrap seed (wait-for-state catalog) ────────────────────────────────
INSERT INTO content_families (id, title)
VALUES ('reaction', 'Reaction')
ON CONFLICT (id) DO NOTHING;

INSERT INTO content_categories (id, family_id, title)
VALUES ('reaction.wait_for_signal', 'reaction', 'Wait for signal')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_template_id uuid;
  v_version_id uuid;
  v_catalog_release_id uuid := '11111111-1111-4111-8111-111111111111';
  v_rules_release_id uuid := '22222222-2222-4222-8222-222222222222';
  v_loc_release_id uuid := '33333333-3333-4333-8333-333333333333';
  v_power_release_id uuid := '44444444-4444-4444-8444-444444444444';
  v_definition jsonb;
BEGIN
  SELECT id INTO v_template_id FROM content_templates WHERE slug = 'reaction.wait_for_signal';
  IF v_template_id IS NULL THEN
    v_template_id := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
    VALUES (
      v_template_id,
      'reaction.wait_for_signal',
      'reaction',
      'reaction.wait_for_signal',
      'Wait for signal (bootstrap)',
      'published'
    );
  END IF;

  v_definition := jsonb_build_object(
    'definitionId', 'reaction.wait_for_signal.dev',
    'definitionVersion', 1,
    'engineId', 'reaction.wait_for_signal',
    'durationMs', 5000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.wait_for_signal.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', jsonb_build_object(
      'categoryKey', 'challenge.category.reaction',
      'waitingPromptKey', 'challenge.wait_for_signal.waiting',
      'waitingHintKey', 'challenge.wait_for_signal.waiting_hint',
      'activePromptKey', 'challenge.wait_for_signal.active',
      'actionKey', 'challenge.wait_for_signal.action'
    ),
    'serverConfig', jsonb_build_object(
      'signalDelayMs', 1500,
      'signalWindowMs', 750
    ),
    'internalTitle', 'Wait for signal (bootstrap)',
    'familyId', 'reaction',
    'categoryId', 'reaction.wait_for_signal',
    'difficulty', 'easy',
    'instructionAr', 'انتظر حتى يتحول اللون ثم اضغط بسرعة.',
    'hintAr', 'لا تضغط مبكراً.',
    'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
    'selectionWeight', 100,
    'repetitionCooldownRounds', 0,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '[]'::jsonb,
    'accessibilityFallbackKey', 'challenge.wait_for_signal.a11y_fallback',
    'requiredAssetIds', '[]'::jsonb
  );

  SELECT id INTO v_version_id
  FROM content_template_versions
  WHERE template_id = v_template_id AND version = 1;

  IF v_version_id IS NULL THEN
    v_version_id := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    INSERT INTO content_template_versions (
      id, template_id, version, status, definition, validation_hash,
      validation_notes, approved_at
    ) VALUES (
      v_version_id,
      v_template_id,
      1,
      'published',
      v_definition,
      md5(v_definition::text),
      'bootstrap seed',
      now()
    );
  END IF;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'bootstrap.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'bootstrap.v1',
      'entries', jsonb_build_array(
        jsonb_build_object(
          'templateVersionId', v_version_id,
          'definitionId', 'reaction.wait_for_signal.dev',
          'weight', 100,
          'repetitionCooldownRounds', 0,
          'paused', false
        )
      ),
      'changelog', 'Bootstrap wait-for-signal catalog'
    ),
    'Bootstrap wait-for-signal catalog'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_rules_release_id,
    'game_mode_rules',
    'bootstrap.v1',
    jsonb_build_object(
      'releaseId', v_rules_release_id,
      'versionLabel', 'bootstrap.v1',
      'rules', jsonb_build_object(
        'initialHearts', 3,
        'minLivePlayers', 2,
        'playerCapacity', 6,
        'quickLobbyFillWaitMs', 60000
      ),
      'changelog', 'Bootstrap mode rules'
    ),
    'Bootstrap mode rules'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'bootstrap.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'bootstrap.v1',
      'locales', jsonb_build_array('ar','en'),
      'entries', jsonb_build_object(
        'ar', jsonb_build_object(
          'challenge.wait_for_signal.intro', 'انتظر الإشارة',
          'challenge.wait_for_signal.a11y_fallback', 'اضغط عند ظهور الإشارة الواضحة'
        ),
        'en', jsonb_build_object(
          'challenge.wait_for_signal.intro', 'Wait for the signal',
          'challenge.wait_for_signal.a11y_fallback', 'Tap when the clear signal appears'
        )
      ),
      'changelog', 'Bootstrap localization'
    ),
    'Bootstrap localization'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_power_release_id,
    'power_configuration',
    'bootstrap.v1',
    jsonb_build_object(
      'releaseId', v_power_release_id,
      'versionLabel', 'bootstrap.v1',
      'powers', jsonb_build_object(
        'dangerPulseEnabled', true,
        'shieldEnabled', true,
        'reflectionEnabled', true
      ),
      'changelog', 'Bootstrap powers (flags only until LH-008)'
    ),
    'Bootstrap powers'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES
    ('challenge_catalog', v_catalog_release_id),
    ('game_mode_rules', v_rules_release_id),
    ('localization', v_loc_release_id),
    ('power_configuration', v_power_release_id)
  ON CONFLICT (kind) DO NOTHING;
END
$$;
