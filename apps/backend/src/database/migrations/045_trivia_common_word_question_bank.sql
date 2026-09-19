-- Consolidate trivia.common_word into one Studio challenge with a question bank.
-- Retires the duplicate per-question templates from migration 044.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc46';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd46';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa46';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_filtered jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('trivia', 'Trivia')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('trivia.common_word', 'trivia', 'Common Word')
  ON CONFLICT (id) DO NOTHING;

  -- Retire the two per-question templates.
  UPDATE content_templates
  SET status = 'retired'
  WHERE slug IN ('trivia.common_word.eye', 'trivia.common_word.head');

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'trivia.common_word',
    'trivia',
    'trivia.common_word',
    'Common Word',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET
    status = 'published',
    internal_title = EXCLUDED.internal_title,
    category_id = EXCLUDED.category_id;
  SELECT id INTO v_tid FROM content_templates WHERE slug = 'trivia.common_word';

  v_client := '{
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

  v_server := '{
    "titleCopy": {"ar": "الكلمة المشتركة", "en": "The Common Word"},
    "instructionCopy": {
      "ar": "اختر كلمة ترتبط بالعبارات الثلاث",
      "en": "Choose a word related to the three phrases"
    },
    "questions": [
      {
        "questionKey": "common_word.q.eye",
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
      },
      {
        "questionKey": "common_word.q.head",
        "clues": [
          {
            "clueId": "clue.year",
            "textCopy": {"ar": "السنة", "en": "The year"},
            "relationshipCopy": {"ar": "رأس السنة", "en": "New Year"},
            "visualHint": "neutral"
          },
          {
            "clueId": "clue.money",
            "textCopy": {"ar": "المال", "en": "Money"},
            "relationshipCopy": {"ar": "رأس المال", "en": "Capital"},
            "visualHint": "neutral"
          },
          {
            "clueId": "clue.page",
            "textCopy": {"ar": "الصفحة", "en": "The page"},
            "relationshipCopy": {"ar": "رأس الصفحة", "en": "Page header"},
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
      }
    ]
  }'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'trivia.common_word.dev',
    'definitionVersion', 1,
    'engineId', 'trivia.common_word',
    'durationMs', 10000,
    'introDurationMs', 1200,
    'resultHoldMs', 2000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.common_word.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Common Word',
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
    v_vid, v_tid, 1, 'published', v_def,
    md5('trivia.common_word.bank.v1'), 'common word question bank', now()
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  v_entries := COALESCE(v_current_catalog->'entries', '[]'::jsonb);

  -- Drop old per-question catalog entries.
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_entries)
  LOOP
    IF coalesce(v_entry->>'definitionId', '') NOT IN (
      'trivia.common_word.eye.dev',
      'trivia.common_word.head.dev'
    ) THEN
      v_filtered := v_filtered || jsonb_build_array(v_entry);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_filtered) e
    WHERE e->>'definitionId' = 'trivia.common_word.dev'
  ) THEN
    v_filtered := v_filtered || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'trivia.common_word.dev',
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
    'lh.common_word.bank.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.common_word.bank.v1',
      'entries', v_filtered,
      'changelog', 'Consolidate Common Word into one challenge with a question bank'
    ),
    'Consolidate Common Word question bank'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind)
  DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;
