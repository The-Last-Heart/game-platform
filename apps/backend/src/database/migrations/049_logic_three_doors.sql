-- Seed logic.three_doors (Door of Truth / باب الحقيقة) into Studio + live catalog.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc49';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd49';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa49';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb49';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_current_loc jsonb;
  v_ar jsonb;
  v_en jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('logic', 'Logic')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('logic.three_doors', 'logic', 'Door of Truth')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'logic.three_doors.door_of_truth',
    'logic',
    'logic.three_doors',
    'Door of Truth — باب الحقيقة',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid FROM content_templates WHERE slug = 'logic.three_doors.door_of_truth';

  v_client := '{
    "categoryKey": "challenge.category.logic",
    "promptKey": "challenge.three_doors.prompt",
    "titleKey": "challenge.three_doors.title",
    "roomAssetId": "three_doors.room",
    "backgroundSfxAssetId": "three_doors.background"
  }'::jsonb;

  v_server := '{
    "questions": [
      {
        "questionId": "three_doors.q.reference_exactly_one_true",
        "internalName": "Reference — exactly one true",
        "truthRule": "exactly_one_true",
        "statements": [
          { "doorId": "A", "predicate": { "kind": "is_not_here" } },
          { "doorId": "B", "predicate": { "kind": "is", "doorId": "A" } },
          { "doorId": "C", "predicate": { "kind": "is_not", "doorId": "B" } }
        ],
        "correctDoorId": "B",
        "enabled": true,
        "selectionWeight": 1
      },
      {
        "questionId": "three_doors.q.exactly_one_false_sample",
        "internalName": "Sample — exactly one false",
        "truthRule": "exactly_one_false",
        "statements": [
          { "doorId": "A", "predicate": { "kind": "is_here" } },
          { "doorId": "B", "predicate": { "kind": "is_not_here" } },
          { "doorId": "C", "predicate": { "kind": "is", "doorId": "B" } }
        ],
        "correctDoorId": "A",
        "enabled": true,
        "selectionWeight": 1
      }
    ]
  }'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'logic.three_doors.door_of_truth',
    'definitionVersion', 1,
    'engineId', 'logic.three_doors',
    'durationMs', 12000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.three_doors.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Door of Truth — باب الحقيقة',
    'familyId', 'logic',
    'categoryId', 'logic.three_doors',
    'difficulty', 'medium',
    'instructionAr', 'اقرأ العبارات على الأبواب واختر الباب الذي يخفي القلب',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'introDurationMs', 1200,
    'resultHoldMs', 1600,
    'requiredCapabilities', '["touch", "challenge.engine.logic.three_doors.v1"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.three_doors.a11y_fallback',
    'requiredAssetIds', '["three_doors.background"]'::jsonb,
    'minAppVersion', '0.0.1'
  );

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid, v_tid, 1, 'published', v_def,
    md5('logic.three_doors.door_of_truth.v1'), 'Door of Truth seed bank', now()
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  v_entries := COALESCE(v_current_catalog->'entries', '[]'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_entries) e
    WHERE e->>'definitionId' = 'logic.three_doors.door_of_truth'
       OR e->>'templateVersionId' = v_vid::text
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'logic.three_doors.door_of_truth',
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
    'lh.three_doors.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.three_doors.v1',
      'entries', v_entries,
      'changelog', 'Add logic.three_doors (Door of Truth)'
    ),
    'Add Door of Truth challenge'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_loc
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'localization'
  LIMIT 1;

  v_ar := COALESCE(v_current_loc#>'{entries,ar}', '{}'::jsonb) || '{
    "challenge.three_doors.title": "باب الحقيقة",
    "challenge.three_doors.intro": "باب الحقيقة",
    "challenge.three_doors.prompt": "عبارة واحدة فقط صحيحة — أين المفتاح؟",
    "challenge.three_doors.instruction.exactly_one_true": "عبارة واحدة فقط صحيحة — أين المفتاح؟",
    "challenge.three_doors.instruction.exactly_one_false": "عبارة واحدة فقط خاطئة — أين المفتاح؟",
    "challenge.three_doors.time_remaining": "الوقت المتبقي",
    "challenge.three_doors.a11y_door_a": "الباب A",
    "challenge.three_doors.a11y_door_b": "الباب B",
    "challenge.three_doors.a11y_door_c": "الباب C",
    "engine.logic.three_doors": "باب الحقيقة",
    "result.three_doors.wrong": "باب خاطئ",
    "result.three_doors.invalid": "اختيار غير صالح"
  }'::jsonb;

  v_en := COALESCE(v_current_loc#>'{entries,en}', '{}'::jsonb) || '{
    "challenge.three_doors.title": "Door of Truth",
    "challenge.three_doors.intro": "Door of Truth",
    "challenge.three_doors.prompt": "Only one statement is true — where is the key?",
    "challenge.three_doors.instruction.exactly_one_true": "Only one statement is true — where is the key?",
    "challenge.three_doors.instruction.exactly_one_false": "Only one statement is false — where is the key?",
    "challenge.three_doors.time_remaining": "Time remaining",
    "challenge.three_doors.a11y_door_a": "Door A",
    "challenge.three_doors.a11y_door_b": "Door B",
    "challenge.three_doors.a11y_door_c": "Door C",
    "engine.logic.three_doors": "Door of Truth",
    "result.three_doors.wrong": "Wrong door",
    "result.three_doors.invalid": "Invalid choice"
  }'::jsonb;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.three_doors.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'lh.three_doors.v1',
      'locales', '["ar","en"]'::jsonb,
      'entries', jsonb_build_object('ar', v_ar, 'en', v_en)
    ),
    'Door of Truth localization'
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
