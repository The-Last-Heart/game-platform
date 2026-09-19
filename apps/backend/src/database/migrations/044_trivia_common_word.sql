-- Seed trivia.common_word (Common Word / الكلمة المشتركة) into Studio + live catalog.
-- One published definition = one question; two sample questions for pool rotation.
DO $$
DECLARE
  v_tid_1 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc44';
  v_vid_1 uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd44';
  v_tid_2 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc45';
  v_vid_2 uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd45';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa44';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb44';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_current_loc jsonb;
  v_ar jsonb;
  v_en jsonb;
  v_client_1 jsonb;
  v_server_1 jsonb;
  v_def_1 jsonb;
  v_client_2 jsonb;
  v_server_2 jsonb;
  v_def_2 jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('trivia', 'Trivia')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('trivia.common_word', 'trivia', 'Common Word')
  ON CONFLICT (id) DO NOTHING;

  -- Question 1: عين (eye of needle / storm / water)
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid_1,
    'trivia.common_word.eye',
    'trivia',
    'trivia.common_word',
    'Common Word — عين',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid_1 FROM content_templates WHERE slug = 'trivia.common_word.eye';

  v_client_1 := '{
    "categoryKey": "challenge.category.trivia",
    "promptKey": "challenge.common_word.prompt",
    "titleKey": "challenge.common_word.title",
    "titleText": "الكلمة المشتركة",
    "instructionText": "اختر كلمة ترتبط بالعبارات الثلاث",
    "questionKey": "common_word.q.eye",
    "clues": [
      {"id": "clue.needle", "text": "الإبرة", "visualHint": "needle"},
      {"id": "clue.storm", "text": "العاصفة", "visualHint": "storm"},
      {"id": "clue.water", "text": "الماء", "visualHint": "water"}
    ],
    "optionKeys": [
      "common_word.opt.eye",
      "common_word.opt.heart",
      "common_word.opt.head",
      "common_word.opt.door"
    ],
    "optionTexts": {
      "common_word.opt.eye": "عين",
      "common_word.opt.heart": "قلب",
      "common_word.opt.head": "رأس",
      "common_word.opt.door": "باب"
    }
  }'::jsonb;

  v_server_1 := '{
    "questionKey": "common_word.q.eye",
    "titleCopy": {"ar": "الكلمة المشتركة", "en": "The Common Word"},
    "instructionCopy": {
      "ar": "اختر كلمة ترتبط بالعبارات الثلاث",
      "en": "Choose a word related to the three phrases"
    },
    "clues": [
      {
        "clueId": "clue.needle",
        "textCopy": {"ar": "الإبرة", "en": "The needle"},
        "relationshipCopy": {"ar": "عين الإبرة", "en": "Eye of the needle"},
        "visualHint": "needle"
      },
      {
        "clueId": "clue.storm",
        "textCopy": {"ar": "العاصفة", "en": "The storm"},
        "relationshipCopy": {"ar": "عين العاصفة", "en": "Eye of the storm"},
        "visualHint": "storm"
      },
      {
        "clueId": "clue.water",
        "textCopy": {"ar": "الماء", "en": "The water"},
        "relationshipCopy": {"ar": "عين الماء", "en": "Eye of the spring"},
        "visualHint": "water"
      }
    ],
    "optionKeys": [
      "common_word.opt.eye",
      "common_word.opt.heart",
      "common_word.opt.head",
      "common_word.opt.door"
    ],
    "correctOptionKey": "common_word.opt.eye",
    "optionCopy": {
      "common_word.opt.eye": {"ar": "عين", "en": "Eye"},
      "common_word.opt.heart": {"ar": "قلب", "en": "Heart"},
      "common_word.opt.head": {"ar": "رأس", "en": "Head"},
      "common_word.opt.door": {"ar": "باب", "en": "Door"}
    }
  }'::jsonb;

  v_def_1 := jsonb_build_object(
    'definitionId', 'trivia.common_word.eye.dev',
    'definitionVersion', 1,
    'engineId', 'trivia.common_word',
    'durationMs', 10000,
    'introDurationMs', 1200,
    'resultHoldMs', 2000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.common_word.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client_1,
    'serverConfig', v_server_1,
    'internalTitle', 'Common Word — عين',
    'familyId', 'trivia',
    'categoryId', 'trivia.common_word',
    'difficulty', 'easy',
    'instructionAr', 'اختر كلمة ترتبط بالعبارات الثلاث',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '[]'::jsonb,
    'accessibilityFallbackKey', 'challenge.common_word.a11y_fallback',
    'requiredAssetIds', '[]'::jsonb
  );

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid_1, v_tid_1, 1, 'published', v_def_1,
    md5('trivia.common_word.eye.v1'), 'common word eye seed', now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Question 2: رأس (head of year / onion / money — culturally familiar phrases)
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid_2,
    'trivia.common_word.head',
    'trivia',
    'trivia.common_word',
    'Common Word — رأس',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid_2 FROM content_templates WHERE slug = 'trivia.common_word.head';

  v_client_2 := '{
    "categoryKey": "challenge.category.trivia",
    "promptKey": "challenge.common_word.prompt",
    "titleKey": "challenge.common_word.title",
    "titleText": "الكلمة المشتركة",
    "instructionText": "اختر كلمة ترتبط بالعبارات الثلاث",
    "questionKey": "common_word.q.head",
    "clues": [
      {"id": "clue.year", "text": "السنة", "visualHint": "neutral"},
      {"id": "clue.money", "text": "المال", "visualHint": "neutral"},
      {"id": "clue.page", "text": "الصفحة", "visualHint": "neutral"}
    ],
    "optionKeys": [
      "common_word.opt2.head",
      "common_word.opt2.eye",
      "common_word.opt2.hand",
      "common_word.opt2.foot"
    ],
    "optionTexts": {
      "common_word.opt2.head": "رأس",
      "common_word.opt2.eye": "عين",
      "common_word.opt2.hand": "يد",
      "common_word.opt2.foot": "قدم"
    }
  }'::jsonb;

  v_server_2 := '{
    "questionKey": "common_word.q.head",
    "titleCopy": {"ar": "الكلمة المشتركة", "en": "The Common Word"},
    "instructionCopy": {
      "ar": "اختر كلمة ترتبط بالعبارات الثلاث",
      "en": "Choose a word related to the three phrases"
    },
    "clues": [
      {
        "clueId": "clue.year",
        "textCopy": {"ar": "السنة", "en": "The year"},
        "relationshipCopy": {"ar": "رأس السنة", "en": "New Year (head of the year)"},
        "visualHint": "neutral"
      },
      {
        "clueId": "clue.money",
        "textCopy": {"ar": "المال", "en": "Money"},
        "relationshipCopy": {"ar": "رأس المال", "en": "Capital (head of money)"},
        "visualHint": "neutral"
      },
      {
        "clueId": "clue.page",
        "textCopy": {"ar": "الصفحة", "en": "The page"},
        "relationshipCopy": {"ar": "رأس الصفحة", "en": "Page header (head of the page)"},
        "visualHint": "neutral"
      }
    ],
    "optionKeys": [
      "common_word.opt2.head",
      "common_word.opt2.eye",
      "common_word.opt2.hand",
      "common_word.opt2.foot"
    ],
    "correctOptionKey": "common_word.opt2.head",
    "optionCopy": {
      "common_word.opt2.head": {"ar": "رأس", "en": "Head"},
      "common_word.opt2.eye": {"ar": "عين", "en": "Eye"},
      "common_word.opt2.hand": {"ar": "يد", "en": "Hand"},
      "common_word.opt2.foot": {"ar": "قدم", "en": "Foot"}
    }
  }'::jsonb;

  v_def_2 := jsonb_build_object(
    'definitionId', 'trivia.common_word.head.dev',
    'definitionVersion', 1,
    'engineId', 'trivia.common_word',
    'durationMs', 10000,
    'introDurationMs', 1200,
    'resultHoldMs', 2000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.common_word.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client_2,
    'serverConfig', v_server_2,
    'internalTitle', 'Common Word — رأس',
    'familyId', 'trivia',
    'categoryId', 'trivia.common_word',
    'difficulty', 'easy',
    'instructionAr', 'اختر كلمة ترتبط بالعبارات الثلاث',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '[]'::jsonb,
    'accessibilityFallbackKey', 'challenge.common_word.a11y_fallback',
    'requiredAssetIds', '[]'::jsonb
  );

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid_2, v_tid_2, 1, 'published', v_def_2,
    md5('trivia.common_word.head.v1'), 'common word head seed', now()
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  v_entries := COALESCE(v_current_catalog->'entries', '[]'::jsonb);

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_entries) e
    WHERE e->>'definitionId' = 'trivia.common_word.eye.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid_1,
        'definitionId', 'trivia.common_word.eye.dev',
        'weight', 100,
        'repetitionCooldownRounds', 1,
        'paused', false
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_entries) e
    WHERE e->>'definitionId' = 'trivia.common_word.head.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid_2,
        'definitionId', 'trivia.common_word.head.dev',
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
    'lh.common_word.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.common_word.v1',
      'entries', v_entries,
      'changelog', 'Add trivia.common_word (two sample questions)'
    ),
    'Add Common Word challenge'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_loc
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'localization'
  LIMIT 1;

  v_ar := COALESCE(v_current_loc#>'{entries,ar}', '{}'::jsonb) || '{
    "challenge.common_word.title": "الكلمة المشتركة",
    "challenge.common_word.intro": "الكلمة المشتركة",
    "challenge.common_word.prompt": "اختر كلمة ترتبط بالعبارات الثلاث",
    "challenge.common_word.footer": "اختيار واحد فقط",
    "challenge.common_word.a11y_fallback": "اختر الكلمة التي تربط العبارات الثلاث",
    "engine.trivia.common_word": "الكلمة المشتركة",
    "result.common_word.wrong": "إجابة غير صحيحة"
  }'::jsonb;

  v_en := COALESCE(v_current_loc#>'{entries,en}', '{}'::jsonb) || '{
    "challenge.common_word.title": "The Common Word",
    "challenge.common_word.intro": "The Common Word",
    "challenge.common_word.prompt": "Choose a word related to the three phrases",
    "challenge.common_word.footer": "One choice only",
    "challenge.common_word.a11y_fallback": "Choose the word that connects the three phrases",
    "engine.trivia.common_word": "Common Word",
    "result.common_word.wrong": "Incorrect answer"
  }'::jsonb;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.common_word.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'lh.common_word.v1',
      'locales', '["ar","en"]'::jsonb,
      'entries', jsonb_build_object('ar', v_ar, 'en', v_en)
    ),
    'Common Word localization'
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
