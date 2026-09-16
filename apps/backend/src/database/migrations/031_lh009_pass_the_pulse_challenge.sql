-- Seed social.pass_the_pulse into Studio templates + live challenge catalog.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc31';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd31';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb31';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('social', 'Social')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('social.pass_the_pulse', 'social', 'Pass the Pulse')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'social.pass_the_pulse',
    'social',
    'social.pass_the_pulse',
    'Pass the Pulse',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid
  FROM content_templates
  WHERE slug = 'social.pass_the_pulse';

  v_client := '{
    "categoryKey": "challenge.category.social",
    "titleKey": "challenge.pass_the_pulse.intro",
    "promptKey": "challenge.pass_the_pulse.prompt",
    "actionKey": "challenge.pass_the_pulse.action",
    "youKey": "challenge.pass_the_pulse.you",
    "timeRemainingKey": "challenge.pass_the_pulse.time_remaining",
    "turnAnnounceKey": "challenge.pass_the_pulse.turn_announce",
    "a11yTapReadyKey": "challenge.pass_the_pulse.a11y_tap_ready",
    "a11yTapWaitKey": "challenge.pass_the_pulse.a11y_tap_wait",
    "pulseSfxAssetId": "sfx.pulse"
  }'::jsonb;

  v_server := '{
    "minPlayers": 2,
    "maxPlayers": 6,
    "startDelayMs": 800,
    "segmentDurationMs": 1800,
    "hitWindowEarlyMs": 280,
    "hitWindowLateMs": 320,
    "resultTransitionMs": 900
  }'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'social.pass_the_pulse.dev',
    'definitionVersion', 1,
    'engineId', 'social.pass_the_pulse',
    'durationMs', 15000,
    'introDurationMs', 1000,
    'resultHoldMs', 2000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.pass_the_pulse.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Pass the Pulse',
    'familyId', 'social',
    'categoryId', 'social.pass_the_pulse',
    'difficulty', 'medium',
    'instructionAr', 'اضغط عندما تصل النبضة إلى دائرتك',
    'eligibleModes', '["quick_survival", "private", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '["touch"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.pass_the_pulse.a11y_fallback',
    'requiredAssetIds', '["sfx.pulse"]'::jsonb
  );

  INSERT INTO content_template_versions (
    id,
    template_id,
    version,
    status,
    definition,
    validation_hash,
    validation_notes,
    approved_at
  ) VALUES (
    v_vid,
    v_tid,
    1,
    'published',
    v_def,
    md5('social.pass_the_pulse.v1'),
    'pass the pulse seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  v_entries := COALESCE(v_current_catalog->'entries', '[]'::jsonb);
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_entries) e
    WHERE e->>'definitionId' = 'social.pass_the_pulse.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'social.pass_the_pulse.dev',
        'weight', 100,
        'repetitionCooldownRounds', 1,
        'paused', false
      )
    );
  END IF;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'lh.pass_the_pulse.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.pass_the_pulse.v1',
      'entries', v_entries,
      'changelog', 'Add social.pass_the_pulse'
    ),
    'Add Pass the Pulse challenge'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.pass_the_pulse.v1',
    '{
      "releaseId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb31",
      "versionLabel": "lh.pass_the_pulse.v1",
      "locales": ["ar", "en"],
      "entries": {
        "ar": {
          "challenge.pass_the_pulse.intro": "مرّروا النبضة",
          "challenge.pass_the_pulse.prompt": "اضغط عندما تصل النبضة إلى دائرتك",
          "challenge.pass_the_pulse.action": "اضغط",
          "challenge.pass_the_pulse.you": "أنت",
          "challenge.pass_the_pulse.time_remaining": "الوقت المتبقي",
          "challenge.pass_the_pulse.turn_announce": "دور {name}",
          "challenge.pass_the_pulse.a11y_tap_ready": "اضغط الآن، النبضة عند دائرتك",
          "challenge.pass_the_pulse.a11y_tap_wait": "انتظر دورك",
          "challenge.pass_the_pulse.a11y_fallback": "اضغط الزر عندما تصل النبضة إلى دائرتك",
          "result.pass_the_pulse.missed": "فاتت النبضة",
          "engine.social.pass_the_pulse": "مرّروا النبضة"
        },
        "en": {
          "challenge.pass_the_pulse.intro": "Pass the Pulse",
          "challenge.pass_the_pulse.prompt": "Tap when the pulse reaches your circle",
          "challenge.pass_the_pulse.action": "Tap",
          "challenge.pass_the_pulse.you": "You",
          "challenge.pass_the_pulse.time_remaining": "Time remaining",
          "challenge.pass_the_pulse.turn_announce": "{name}''s turn",
          "challenge.pass_the_pulse.a11y_tap_ready": "Tap now, the pulse is at your circle",
          "challenge.pass_the_pulse.a11y_tap_wait": "Wait for your turn",
          "challenge.pass_the_pulse.a11y_fallback": "Tap the button when the pulse reaches your circle",
          "result.pass_the_pulse.missed": "Missed the pulse",
          "engine.social.pass_the_pulse": "Pass the Pulse"
        }
      }
    }'::jsonb,
    'Pass the Pulse localization'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind)
  DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('localization', v_loc_release_id)
  ON CONFLICT (kind)
  DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;
