-- Seed logic.complete_sum into Studio templates + live challenge catalog.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc30';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd30';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa30';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb30';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('logic', 'Logic')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('logic.complete_sum', 'logic', 'Complete the Sum')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'logic.complete_sum',
    'logic',
    'logic.complete_sum',
    'Complete the Sum',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid
  FROM content_templates
  WHERE slug = 'logic.complete_sum';

  v_client := '{
    "categoryKey": "challenge.category.logic",
    "titleKey": "challenge.complete_sum.intro",
    "promptKey": "challenge.complete_sum.prompt",
    "currentTotalKey": "challenge.complete_sum.current_total",
    "chooseNumberKey": "challenge.complete_sum.choose",
    "readyKey": "challenge.complete_sum.ready",
    "thinkingKey": "challenge.complete_sum.thinking",
    "youKey": "challenge.complete_sum.you",
    "footerKey": "challenge.complete_sum.footer"
  }'::jsonb;

  v_server := '{
    "maxGenerationAttempts": 48,
    "generationRules": {
      "2": { "minValue": 0, "maxValue": 8, "choicesPerPlayer": 4 },
      "3": { "minValue": 0, "maxValue": 6, "choicesPerPlayer": 4 },
      "4": { "minValue": 0, "maxValue": 5, "choicesPerPlayer": 4 },
      "5": { "minValue": 0, "maxValue": 4, "choicesPerPlayer": 4 },
      "6": { "minValue": 0, "maxValue": 3, "choicesPerPlayer": 4 }
    }
  }'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'logic.complete_sum.dev',
    'definitionVersion', 1,
    'engineId', 'logic.complete_sum',
    'durationMs', 15000,
    'introDurationMs', 1200,
    'resultHoldMs', 2000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.complete_sum.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Complete the Sum',
    'familyId', 'logic',
    'categoryId', 'logic.complete_sum',
    'difficulty', 'hard',
    'instructionAr', 'اختاروا أرقاماً ليصبح المجموع المطلوب قبل انتهاء الوقت',
    'eligibleModes', '["quick_survival", "private", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '["touch"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.complete_sum.a11y_fallback',
    'requiredAssetIds', '[]'::jsonb
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
    md5('logic.complete_sum.v1'),
    'complete sum seed',
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
    WHERE e->>'definitionId' = 'logic.complete_sum.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'logic.complete_sum.dev',
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
    'lh.complete_sum.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.complete_sum.v1',
      'entries', v_entries,
      'changelog', 'Add logic.complete_sum'
    ),
    'Add Complete the Sum challenge'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.complete_sum.v1',
    '{
      "releaseId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb30",
      "versionLabel": "lh.complete_sum.v1",
      "locales": ["ar", "en"],
      "entries": {
        "ar": {
          "challenge.complete_sum.intro": "أكملوا المجموع",
          "challenge.complete_sum.prompt": "اختاروا أرقاماً ليصبح المجموع {target}",
          "challenge.complete_sum.footer": "يمكنكم تغيير اختياركم قبل انتهاء الوقت",
          "challenge.complete_sum.current_total": "المجموع الحالي",
          "challenge.complete_sum.choose": "اختر رقمك",
          "challenge.complete_sum.ready": "جاهز",
          "challenge.complete_sum.thinking": "يفكر...",
          "challenge.complete_sum.you": "أنت",
          "challenge.complete_sum.a11y_fallback": "اختر رقماً من خياراتك ليساهم في المجموع الجماعي",
          "result.complete_sum.wrong": "المجموع غير صحيح",
          "engine.logic.complete_sum": "أكملوا المجموع"
        },
        "en": {
          "challenge.complete_sum.intro": "Complete the Sum",
          "challenge.complete_sum.prompt": "Choose numbers so the total becomes {target}",
          "challenge.complete_sum.footer": "You may change your choice before time runs out",
          "challenge.complete_sum.current_total": "Current total",
          "challenge.complete_sum.choose": "Choose your number",
          "challenge.complete_sum.ready": "Ready",
          "challenge.complete_sum.thinking": "Thinking...",
          "challenge.complete_sum.you": "You",
          "challenge.complete_sum.a11y_fallback": "Pick one of your numbers to contribute to the shared total",
          "result.complete_sum.wrong": "Incorrect total",
          "engine.logic.complete_sum": "Complete the Sum"
        }
      }
    }'::jsonb,
    'Complete the Sum localization'
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
