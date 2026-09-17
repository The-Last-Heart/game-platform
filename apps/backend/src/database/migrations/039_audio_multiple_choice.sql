-- Seed audio.multiple_choice (Guess the Audio / خَمّن الصوت) into Studio + live catalog.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc39';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd39';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa39';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb39';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_current_loc jsonb;
  v_ar jsonb;
  v_en jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('audio', 'Audio')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('audio.multiple_choice', 'audio', 'Guess the Audio')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'audio.multiple_choice',
    'audio',
    'audio.multiple_choice',
    'Guess the Audio',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid FROM content_templates WHERE slug = 'audio.multiple_choice';

  v_client := '{
    "categoryKey": "challenge.category.audio",
    "promptKey": "challenge.audio_mc.prompt_artist",
    "titleKey": "challenge.audio_mc.intro",
    "questionKey": "audio_mc.q.artist_1",
    "optionKeys": ["audio_mc.opt.artist_1_a","audio_mc.opt.artist_1_b","audio_mc.opt.artist_1_c","audio_mc.opt.artist_1_d"],
    "targetBadgeKey": "challenge.audio_mc.badge_artist",
    "footerKey": "challenge.audio_mc.footer",
    "answerTarget": "artist",
    "audioAssetId": "ca_44384e12ad9a80f1",
    "visualizationAssetId": "cv_44384e12ad9a80f1",
    "audioDurationMs": 2000
  }'::jsonb;

  v_server := '{
    "questions": [
      {
        "questionKey": "audio_mc.q.artist_1",
        "optionKeys": ["audio_mc.opt.artist_1_a","audio_mc.opt.artist_1_b","audio_mc.opt.artist_1_c","audio_mc.opt.artist_1_d"],
        "correctOptionKey": "audio_mc.opt.artist_1_b",
        "answerTarget": "artist",
        "audioAssetId": "ca_44384e12ad9a80f1",
        "visualizationAssetId": "cv_44384e12ad9a80f1",
        "audioDurationMs": 2000,
        "analysisSchemaVersion": 1,
        "questionCopy": {"ar": "من صاحب هذا الصوت؟", "en": "Who is the owner of this voice?"},
        "optionCopy": {
          "audio_mc.opt.artist_1_a": {"ar": "رامي", "en": "Rami"},
          "audio_mc.opt.artist_1_b": {"ar": "نور", "en": "Nour"},
          "audio_mc.opt.artist_1_c": {"ar": "ليان", "en": "Lyan"},
          "audio_mc.opt.artist_1_d": {"ar": "سليم", "en": "Salim"}
        }
      },
      {
        "questionKey": "audio_mc.q.track_1",
        "optionKeys": ["audio_mc.opt.track_1_a","audio_mc.opt.track_1_b","audio_mc.opt.track_1_c","audio_mc.opt.track_1_d"],
        "correctOptionKey": "audio_mc.opt.track_1_a",
        "answerTarget": "track",
        "audioAssetId": "ca_76fc12197f19bd1b",
        "visualizationAssetId": "cv_76fc12197f19bd1b",
        "audioDurationMs": 2000,
        "analysisSchemaVersion": 1,
        "questionCopy": {"ar": "ما اسم الأغنية؟", "en": "What is the name of the song?"},
        "optionCopy": {
          "audio_mc.opt.track_1_a": {"ar": "نبض أخير", "en": "Last Pulse"},
          "audio_mc.opt.track_1_b": {"ar": "ليل بعيد", "en": "Distant Night"},
          "audio_mc.opt.track_1_c": {"ar": "صوت القلب", "en": "Voice of the Heart"},
          "audio_mc.opt.track_1_d": {"ar": "بعد الغياب", "en": "After Absence"}
        }
      }
    ]
  }'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'audio.multiple_choice.dev',
    'definitionVersion', 1,
    'engineId', 'audio.multiple_choice',
    'durationMs', 8000,
    'introDurationMs', 1200,
    'resultHoldMs', 2000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.audio_mc.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Guess the Audio',
    'familyId', 'audio',
    'categoryId', 'audio.multiple_choice',
    'difficulty', 'medium',
    'instructionAr', 'استمع للمقطع واختر الإجابة الصحيحة',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '["audio_output"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.audio_mc.a11y_fallback',
    'requiredAssetIds', '["ca_44384e12ad9a80f1","cv_44384e12ad9a80f1","ca_76fc12197f19bd1b","cv_76fc12197f19bd1b"]'::jsonb
  );

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid, v_tid, 1, 'published', v_def, md5('audio.multiple_choice.v1'), 'guess the audio seed', now()
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  v_entries := COALESCE(v_current_catalog->'entries', '[]'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_entries) e
    WHERE e->>'definitionId' = 'audio.multiple_choice.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'audio.multiple_choice.dev',
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
    'lh.audio_mc.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.audio_mc.v1',
      'entries', v_entries,
      'changelog', 'Add audio.multiple_choice'
    ),
    'Add Guess the Audio challenge'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_loc
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'localization'
  LIMIT 1;

  v_ar := COALESCE(v_current_loc#>'{entries,ar}', '{}'::jsonb) || '{
    "challenge.audio_mc.intro": "خَمّن الصوت",
    "challenge.audio_mc.prompt_artist": "من صاحب هذا الصوت؟",
    "challenge.audio_mc.prompt_track": "ما اسم الأغنية؟",
    "challenge.audio_mc.badge_artist": "المطلوب: اسم المغني",
    "challenge.audio_mc.badge_track": "المطلوب: اسم الأغنية",
    "challenge.audio_mc.footer": "استمع للمقطع واختر الإجابة الصحيحة",
    "challenge.audio_mc.time_remaining": "الوقت المتبقي",
    "challenge.audio_mc.playing": "يتم التشغيل",
    "challenge.audio_mc.paused": "متوقف",
    "challenge.audio_mc.buffering": "جاري التحميل",
    "challenge.audio_mc.a11y_reactor": "مفاعل الصوت",
    "challenge.audio_mc.a11y_waveform": "شكل الموجة",
    "challenge.audio_mc.a11y_target": "هدف السؤال",
    "challenge.audio_mc.a11y_fallback": "اختر الإجابة بعد الاستماع للمقطع",
    "result.audio_mc.wrong": "إجابة خاطئة",
    "engine.audio.multiple_choice": "خَمّن الصوت",
    "audio_mc.q.artist_1": "من صاحب هذا الصوت؟",
    "audio_mc.q.track_1": "ما اسم الأغنية؟",
    "audio_mc.opt.artist_1_a": "رامي",
    "audio_mc.opt.artist_1_b": "نور",
    "audio_mc.opt.artist_1_c": "ليان",
    "audio_mc.opt.artist_1_d": "سليم",
    "audio_mc.opt.track_1_a": "نبض أخير",
    "audio_mc.opt.track_1_b": "ليل بعيد",
    "audio_mc.opt.track_1_c": "صوت القلب",
    "audio_mc.opt.track_1_d": "بعد الغياب"
  }'::jsonb;

  v_en := COALESCE(v_current_loc#>'{entries,en}', '{}'::jsonb) || '{
    "challenge.audio_mc.intro": "Guess the Audio",
    "challenge.audio_mc.prompt_artist": "Who is the owner of this voice?",
    "challenge.audio_mc.prompt_track": "What is the name of the song?",
    "challenge.audio_mc.badge_artist": "Required: singer name",
    "challenge.audio_mc.badge_track": "Required: song name",
    "challenge.audio_mc.footer": "Listen to the clip and choose the correct answer",
    "challenge.audio_mc.time_remaining": "Time remaining",
    "challenge.audio_mc.playing": "Playing",
    "challenge.audio_mc.paused": "Paused",
    "challenge.audio_mc.buffering": "Loading",
    "challenge.audio_mc.a11y_reactor": "Audio reactor",
    "challenge.audio_mc.a11y_waveform": "Waveform",
    "challenge.audio_mc.a11y_target": "Question target",
    "challenge.audio_mc.a11y_fallback": "Choose an answer after listening to the clip",
    "result.audio_mc.wrong": "Wrong answer",
    "engine.audio.multiple_choice": "Guess the Audio",
    "audio_mc.q.artist_1": "Who is the owner of this voice?",
    "audio_mc.q.track_1": "What is the name of the song?",
    "audio_mc.opt.artist_1_a": "Rami",
    "audio_mc.opt.artist_1_b": "Nour",
    "audio_mc.opt.artist_1_c": "Lyan",
    "audio_mc.opt.artist_1_d": "Salim",
    "audio_mc.opt.track_1_a": "Last Pulse",
    "audio_mc.opt.track_1_b": "Distant Night",
    "audio_mc.opt.track_1_c": "Voice of the Heart",
    "audio_mc.opt.track_1_d": "After Absence"
  }'::jsonb;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.audio_mc.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'lh.audio_mc.v1',
      'locales', '["ar","en"]'::jsonb,
      'entries', jsonb_build_object('ar', v_ar, 'en', v_en)
    ),
    'Guess the Audio localization'
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
