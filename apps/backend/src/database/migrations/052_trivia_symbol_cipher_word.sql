-- Seed trivia.symbol_cipher_word (Decode the Cipher / فكّ الشفرة).
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc51';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd51';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa51';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb51';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_current_loc jsonb;
  v_ar jsonb;
  v_en jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('trivia', 'Trivia')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('trivia.symbol_cipher_word', 'trivia', 'Decode the Cipher')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'trivia.symbol_cipher_word.decode',
    'trivia',
    'trivia.symbol_cipher_word',
    'Decode the Cipher — فكّ الشفرة',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid FROM content_templates WHERE slug = 'trivia.symbol_cipher_word.decode';

  v_client := '{
    "categoryKey": "challenge.category.trivia",
    "promptKey": "challenge.symbol_cipher.prompt",
    "titleKey": "challenge.symbol_cipher.title",
    "titleText": "فكّ الشفرة",
    "instructionText": "استخدم المفتاح لاكتشاف الكلمة",
    "backgroundAssetId": "symbol_cipher_word.background"
  }'::jsonb;

  v_server := '{
    "titleCopy": {"ar": "فكّ الشفرة", "en": "Decode the Cipher"},
    "instructionCopy": {
      "ar": "استخدم المفتاح لاكتشاف الكلمة",
      "en": "Use the key to discover the word"
    },
    "questions": [
      {
        "questionId": "symbol_cipher.q.miftah",
        "internalName": "مفتاح",
        "answerDisplayText": "مفتاح",
        "normalizedAnswer": "مفتاح",
        "keyMappings": [
          {"symbolId": "hexagon", "letter": "م", "isDecoy": false},
          {"symbolId": "circle", "letter": "ف", "isDecoy": false},
          {"symbolId": "triangle", "letter": "ت", "isDecoy": false},
          {"symbolId": "diamond", "letter": "ا", "isDecoy": false},
          {"symbolId": "square", "letter": "ح", "isDecoy": false}
        ],
        "encodedSymbols": ["hexagon", "circle", "triangle", "diamond", "square"],
        "optionKeys": [
          "symbol_cipher.opt.miftah",
          "symbol_cipher.opt.misbah",
          "symbol_cipher.opt.tuffaha",
          "symbol_cipher.opt.minshar"
        ],
        "correctOptionKey": "symbol_cipher.opt.miftah",
        "optionCopy": {
          "symbol_cipher.opt.miftah": {"ar": "مفتاح", "en": "Key"},
          "symbol_cipher.opt.misbah": {"ar": "مصباح", "en": "Lamp"},
          "symbol_cipher.opt.tuffaha": {"ar": "تفاحة", "en": "Apple"},
          "symbol_cipher.opt.minshar": {"ar": "منشار", "en": "Saw"}
        },
        "selectionWeight": 100,
        "enabled": true
      },
      {
        "questionId": "symbol_cipher.q.kitabuk",
        "internalName": "كتابك",
        "answerDisplayText": "كتابك",
        "normalizedAnswer": "كتابك",
        "keyMappings": [
          {"symbolId": "star", "letter": "ك", "isDecoy": false},
          {"symbolId": "crescent", "letter": "ت", "isDecoy": false},
          {"symbolId": "octagon", "letter": "ا", "isDecoy": false},
          {"symbolId": "circle", "letter": "ب", "isDecoy": false},
          {"symbolId": "triangle", "letter": "ن", "isDecoy": true}
        ],
        "encodedSymbols": ["star", "crescent", "octagon", "circle", "star"],
        "optionKeys": [
          "symbol_cipher.opt2.kitabuk",
          "symbol_cipher.opt2.safina",
          "symbol_cipher.opt2.maktab",
          "symbol_cipher.opt2.hadiqa"
        ],
        "correctOptionKey": "symbol_cipher.opt2.kitabuk",
        "optionCopy": {
          "symbol_cipher.opt2.kitabuk": {"ar": "كتابك", "en": "Your book"},
          "symbol_cipher.opt2.safina": {"ar": "سفينة", "en": "Ship"},
          "symbol_cipher.opt2.maktab": {"ar": "مكتب", "en": "Office"},
          "symbol_cipher.opt2.hadiqa": {"ar": "حديقة", "en": "Garden"}
        },
        "selectionWeight": 80,
        "enabled": true
      }
    ]
  }'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'trivia.symbol_cipher_word.decode',
    'definitionVersion', 1,
    'engineId', 'trivia.symbol_cipher_word',
    'durationMs', 12000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.symbol_cipher.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Decode the Cipher — فكّ الشفرة',
    'familyId', 'trivia',
    'categoryId', 'trivia.symbol_cipher_word',
    'difficulty', 'easy',
    'instructionAr', 'استخدم المفتاح لاكتشاف الكلمة',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'introDurationMs', 1200,
    'resultHoldMs', 1600,
    'requiredCapabilities', '["touch", "challenge.engine.trivia.symbol_cipher_word.v1"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.symbol_cipher.a11y_fallback',
    'requiredAssetIds', '["symbol_cipher_word.background"]'::jsonb,
    'minAppVersion', '0.0.1'
  );

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid, v_tid, 1, 'published', v_def,
    md5('trivia.symbol_cipher_word.decode.v1'), 'Decode the Cipher seed bank', now()
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
    WHERE e->>'definitionId' = 'trivia.symbol_cipher_word.decode'
       OR e->>'templateVersionId' = v_vid::text
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'trivia.symbol_cipher_word.decode',
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
    'lh.symbol_cipher_word.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.symbol_cipher_word.v1',
      'entries', v_entries,
      'changelog', 'Add trivia.symbol_cipher_word (Decode the Cipher)'
    ),
    'Add Decode the Cipher challenge'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_loc
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'localization'
  LIMIT 1;

  v_ar := COALESCE(v_current_loc#>'{entries,ar}', '{}'::jsonb) || '{
    "challenge.symbol_cipher.title": "فكّ الشفرة",
    "challenge.symbol_cipher.intro": "فكّ الشفرة",
    "challenge.symbol_cipher.prompt": "استخدم المفتاح لاكتشاف الكلمة",
    "challenge.symbol_cipher.a11y_fallback": "فكّ الشفرة",
    "engine.trivia.symbol_cipher_word": "فكّ الشفرة",
    "result.symbol_cipher.wrong": "إجابة خاطئة"
  }'::jsonb;

  v_en := COALESCE(v_current_loc#>'{entries,en}', '{}'::jsonb) || '{
    "challenge.symbol_cipher.title": "Decode the Cipher",
    "challenge.symbol_cipher.intro": "Decode the Cipher",
    "challenge.symbol_cipher.prompt": "Use the key to discover the word",
    "challenge.symbol_cipher.a11y_fallback": "Decode the Cipher",
    "engine.trivia.symbol_cipher_word": "Decode the Cipher",
    "result.symbol_cipher.wrong": "Wrong answer"
  }'::jsonb;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.symbol_cipher_word.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'lh.symbol_cipher_word.v1',
      'locales', '["ar","en"]'::jsonb,
      'entries', jsonb_build_object('ar', v_ar, 'en', v_en)
    ),
    'Decode the Cipher localization'
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
