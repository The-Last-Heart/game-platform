-- Seed precision.ring_lock into Studio templates + live challenge catalog.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc34';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd34';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa34';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb34';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('precision', 'Precision')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('precision.ring_lock', 'precision', 'Unlock the Rings')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'precision.ring_lock',
    'precision',
    'precision.ring_lock',
    'Unlock the Rings',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid
  FROM content_templates
  WHERE slug = 'precision.ring_lock';

  v_client := '{
    "categoryKey": "challenge.category.precision",
    "titleKey": "challenge.ring_lock.intro",
    "promptKey": "challenge.ring_lock.prompt",
    "actionKey": "challenge.ring_lock.action",
    "timeRemainingKey": "challenge.ring_lock.time_remaining",
    "ring1Key": "challenge.ring_lock.ring_1",
    "ring2Key": "challenge.ring_lock.ring_2",
    "ring3Key": "challenge.ring_lock.ring_3",
    "statusLockedKey": "challenge.ring_lock.locked",
    "statusRotatingKey": "challenge.ring_lock.rotating",
    "statusFailedKey": "challenge.ring_lock.failed",
    "a11yLockButtonKey": "challenge.ring_lock.a11y_lock"
  }'::jsonb;

  v_server := '{
    "ringCount": 3,
    "startDelayMs": 700,
    "minAngularVelocityDegPerSec": 55,
    "maxAngularVelocityDegPerSec": 110,
    "allowClockwise": true,
    "allowCounterClockwise": true,
    "targetAngleDeg": 0,
    "alignmentToleranceDeg": 14,
    "transitionDelayMs": 180,
    "safetyMarginMs": 600,
    "maxGenerationAttempts": 48,
    "difficulty": "medium"
  }'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'precision.ring_lock.dev',
    'definitionVersion', 1,
    'engineId', 'precision.ring_lock',
    'durationMs', 15000,
    'introDurationMs', 1200,
    'resultHoldMs', 2000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.ring_lock.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Unlock the Rings',
    'familyId', 'precision',
    'categoryId', 'precision.ring_lock',
    'difficulty', 'medium',
    'instructionAr', 'أوقف الحلقات عند البوابة',
    'eligibleModes', '["quick_survival", "private", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '["touch"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.ring_lock.a11y_fallback',
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
    md5('precision.ring_lock.v1'),
    'ring lock seed',
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
    WHERE e->>'definitionId' = 'precision.ring_lock.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'precision.ring_lock.dev',
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
    'lh.ring_lock.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.ring_lock.v1',
      'entries', v_entries,
      'changelog', 'Add precision.ring_lock'
    ),
    'Add Unlock the Rings challenge'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.ring_lock.v1',
    '{
      "releaseId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb34",
      "versionLabel": "lh.ring_lock.v1",
      "locales": ["ar", "en"],
      "entries": {
        "ar": {
          "challenge.ring_lock.intro": "افتح القفل",
          "challenge.ring_lock.prompt": "أوقف الحلقات عند البوابة",
          "challenge.ring_lock.action": "ثبّت",
          "challenge.ring_lock.time_remaining": "الوقت المتبقي",
          "challenge.ring_lock.ring_1": "الحلقة الأولى",
          "challenge.ring_lock.ring_2": "الحلقة الثانية",
          "challenge.ring_lock.ring_3": "الحلقة الثالثة",
          "challenge.ring_lock.locked": "مُثبتة",
          "challenge.ring_lock.rotating": "تدور",
          "challenge.ring_lock.failed": "فشل",
          "challenge.ring_lock.a11y_lock": "ثبّت الحلقة النشطة عند البوابة",
          "challenge.ring_lock.a11y_fallback": "اضغط ثبّت عندما تصل علامة القفل إلى السهم العلوي",
          "result.ring_lock.incomplete": "لم تُفتح كل الحلقات",
          "engine.precision.ring_lock": "افتح القفل"
        },
        "en": {
          "challenge.ring_lock.intro": "Unlock the Lock",
          "challenge.ring_lock.prompt": "Stop the rings at the gate",
          "challenge.ring_lock.action": "Lock",
          "challenge.ring_lock.time_remaining": "Time remaining",
          "challenge.ring_lock.ring_1": "First ring",
          "challenge.ring_lock.ring_2": "Second ring",
          "challenge.ring_lock.ring_3": "Third ring",
          "challenge.ring_lock.locked": "Locked",
          "challenge.ring_lock.rotating": "Rotating",
          "challenge.ring_lock.failed": "Failed",
          "challenge.ring_lock.a11y_lock": "Lock the active ring at the gate",
          "challenge.ring_lock.a11y_fallback": "Press Lock when the lock marker reaches the top arrow",
          "result.ring_lock.incomplete": "Not all rings were unlocked",
          "engine.precision.ring_lock": "Unlock the Lock"
        }
      }
    }'::jsonb,
    'Unlock the Rings localization'
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
