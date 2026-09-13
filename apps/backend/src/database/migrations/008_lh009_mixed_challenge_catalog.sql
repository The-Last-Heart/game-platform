-- LH-009: seed advanced engine templates and restore a mixed live catalog.
-- Replaces wait-for-signal-only current release from migration 006.

DO $$
DECLARE
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa09';
  v_loc_release_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd09';
  v_wait_vid uuid;
  v_trap_vid uuid;
  v_swipe_vid uuid;
  v_tap_vid uuid;
  v_mem_vid uuid;
  v_hold_vid uuid;
  v_shake_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc11';
  v_shake_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd11';
  v_tilt_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc12';
  v_tilt_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd12';
  v_audio_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc13';
  v_audio_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd13';
  v_pair_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc14';
  v_pair_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd14';
  v_risk_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc15';
  v_risk_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd15';
BEGIN
  INSERT INTO content_families (id, title) VALUES
    ('motion', 'Motion'),
    ('audio', 'Audio'),
    ('social', 'Social'),
    ('tactical', 'Tactical')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('motion.shake', 'motion', 'Shake'),
    ('motion.tilt_balance', 'motion', 'Tilt balance'),
    ('audio.cue', 'audio', 'Audio cue'),
    ('social.pair_sync', 'social', 'Pair sync'),
    ('tactical.risk_choice', 'tactical', 'Risk choice')
  ON CONFLICT (id) DO NOTHING;

  -- Shake
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_shake_tid, 'motion.shake', 'motion', 'motion.shake', 'Shake phone', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_shake_tid FROM content_templates WHERE slug = 'motion.shake';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_shake_vid, v_shake_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'motion.shake.dev',
      'definitionVersion', 1,
      'engineId', 'motion.shake',
      'durationMs', 5000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.shake.intro',
      'choiceKeys', '[]'::jsonb,
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.motion',
        'promptKey', 'challenge.shake.prompt',
        'progressKey', 'challenge.shake.progress'
      ),
      'serverConfig', jsonb_build_object(
        'requiredShakeCount', 5,
        'noiseThreshold', 5
      ),
      'internalTitle', 'Shake phone',
      'familyId', 'motion',
      'categoryId', 'motion.shake',
      'difficulty', 'easy',
      'instructionAr', 'هز الهاتف حتى يكتمل العدد.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 1,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', jsonb_build_array('accelerometer'),
      'accessibilityFallbackKey', 'challenge.shake.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('motion.shake.v1'),
    'lh009 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Tilt balance
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_tilt_tid, 'motion.tilt_balance', 'motion', 'motion.tilt_balance', 'Tilt balance', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tilt_tid FROM content_templates WHERE slug = 'motion.tilt_balance';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_tilt_vid, v_tilt_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'motion.tilt_balance.dev',
      'definitionVersion', 1,
      'engineId', 'motion.tilt_balance',
      'durationMs', 6000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.tilt.intro',
      'choiceKeys', '[]'::jsonb,
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.motion',
        'promptKey', 'challenge.tilt.prompt'
      ),
      'serverConfig', jsonb_build_object(
        'targetX', 0,
        'targetY', 0,
        'holdMs', 1500,
        'varianceTolerance', 0.2
      ),
      'internalTitle', 'Tilt balance',
      'familyId', 'motion',
      'categoryId', 'motion.tilt_balance',
      'difficulty', 'medium',
      'instructionAr', 'أمل الجهاز ووازن النقطة داخل الدائرة.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 1,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', jsonb_build_array('accelerometer'),
      'accessibilityFallbackKey', 'challenge.tilt.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('motion.tilt_balance.v1'),
    'lh009 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Audio cue
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_audio_tid, 'audio.cue', 'audio', 'audio.cue', 'Audio cue', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_audio_tid FROM content_templates WHERE slug = 'audio.cue';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_audio_vid, v_audio_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'audio.cue.dev',
      'definitionVersion', 1,
      'engineId', 'audio.cue',
      'durationMs', 6000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.audio.intro',
      'choiceKeys', '[]'::jsonb,
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.audio',
        'promptKey', 'challenge.audio.prompt',
        'visualFallbackKey', 'challenge.audio.visual_fallback',
        'hapticFallbackKey', 'challenge.audio.haptic_fallback'
      ),
      'serverConfig', jsonb_build_object('pulseCount', 3),
      'internalTitle', 'Audio cue',
      'familyId', 'audio',
      'categoryId', 'audio.cue',
      'difficulty', 'medium',
      'instructionAr', 'عدّ النبضات ثم اختر العدد الصحيح.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 1,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', '[]'::jsonb,
      'accessibilityFallbackKey', 'challenge.audio.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('audio.cue.v1'),
    'lh009 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Pair sync
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_pair_tid, 'social.pair_sync', 'social', 'social.pair_sync', 'Pair sync', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_pair_tid FROM content_templates WHERE slug = 'social.pair_sync';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_pair_vid, v_pair_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'social.pair_sync.dev',
      'definitionVersion', 1,
      'engineId', 'social.pair_sync',
      'durationMs', 5000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.pair_sync.intro',
      'choiceKeys', '[]'::jsonb,
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.social',
        'promptKey', 'challenge.pair_sync.prompt',
        'partnerRoleKeys', jsonb_build_array('role.leader', 'role.follower')
      ),
      'serverConfig', jsonb_build_object(
        'partnerRoleKeys', jsonb_build_array('role.leader', 'role.follower'),
        'syncWindowMs', 500
      ),
      'internalTitle', 'Pair sync',
      'familyId', 'social',
      'categoryId', 'social.pair_sync',
      'difficulty', 'hard',
      'instructionAr', 'اضغطا معاً في نفس اللحظة.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 2,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', '[]'::jsonb,
      'accessibilityFallbackKey', 'challenge.pair_sync.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('social.pair_sync.v1'),
    'lh009 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Risk choice
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_risk_tid, 'tactical.risk_choice', 'tactical', 'tactical.risk_choice', 'Risk choice', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_risk_tid FROM content_templates WHERE slug = 'tactical.risk_choice';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_risk_vid, v_risk_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'tactical.risk_choice.dev',
      'definitionVersion', 1,
      'engineId', 'tactical.risk_choice',
      'durationMs', 5000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.risk_choice.intro',
      'choiceKeys', jsonb_build_array('option.safe', 'option.risky'),
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.tactical',
        'promptKey', 'challenge.risk_choice.prompt',
        'optionKeys', jsonb_build_array('option.safe', 'option.risky')
      ),
      'serverConfig', jsonb_build_object(
        'optionKeys', jsonb_build_array('option.safe', 'option.risky'),
        'riskWeights', jsonb_build_array(30, 70)
      ),
      'internalTitle', 'Risk choice',
      'familyId', 'tactical',
      'categoryId', 'tactical.risk_choice',
      'difficulty', 'medium',
      'instructionAr', 'اختر المسار الآمن أو المخاطرة.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 1,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', '[]'::jsonb,
      'accessibilityFallbackKey', 'challenge.risk_choice.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('tactical.risk_choice.v1'),
    'lh009 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Resolve all version ids (including LH-007 seeds)
  SELECT ctv.id INTO v_wait_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'reaction.wait_for_signal' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_trap_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'trap.no_touch' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_swipe_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'gesture.reverse_swipe' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_tap_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'tap.precision' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_mem_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'memory.sequence' AND ctv.version = 1 LIMIT 1;

  SELECT ctv.id INTO v_hold_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'hold.multitouch' AND ctv.version = 1 LIMIT 1;

  SELECT id INTO v_shake_vid FROM content_template_versions WHERE template_id = v_shake_tid AND version = 1;
  SELECT id INTO v_tilt_vid FROM content_template_versions WHERE template_id = v_tilt_tid AND version = 1;
  SELECT id INTO v_audio_vid FROM content_template_versions WHERE template_id = v_audio_tid AND version = 1;
  SELECT id INTO v_pair_vid FROM content_template_versions WHERE template_id = v_pair_tid AND version = 1;
  SELECT id INTO v_risk_vid FROM content_template_versions WHERE template_id = v_risk_tid AND version = 1;

  IF v_wait_vid IS NULL OR v_trap_vid IS NULL OR v_swipe_vid IS NULL
     OR v_tap_vid IS NULL OR v_mem_vid IS NULL OR v_hold_vid IS NULL THEN
    RAISE EXCEPTION 'LH-007 template versions missing; cannot publish mixed catalog';
  END IF;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'lh009.mixed.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh009.mixed.v1',
      'entries', jsonb_build_array(
        jsonb_build_object('templateVersionId', v_wait_vid, 'definitionId', 'reaction.wait_for_signal.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_trap_vid, 'definitionId', 'trap.no_touch.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_shake_vid, 'definitionId', 'motion.shake.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_tilt_vid, 'definitionId', 'motion.tilt_balance.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_swipe_vid, 'definitionId', 'gesture.reverse_swipe.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_tap_vid, 'definitionId', 'tap.precision.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_mem_vid, 'definitionId', 'memory.sequence.dev', 'weight', 100, 'repetitionCooldownRounds', 2, 'paused', false),
        jsonb_build_object('templateVersionId', v_audio_vid, 'definitionId', 'audio.cue.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_pair_vid, 'definitionId', 'social.pair_sync.dev', 'weight', 100, 'repetitionCooldownRounds', 2, 'paused', false),
        jsonb_build_object('templateVersionId', v_hold_vid, 'definitionId', 'hold.multitouch.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_risk_vid, 'definitionId', 'tactical.risk_choice.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false)
      ),
      'changelog', 'LH-009 mixed eleven-engine live catalog'
    ),
    'LH-009 mixed eleven-engine live catalog'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh009.mixed.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'lh009.mixed.v1',
      'locales', jsonb_build_array('ar','en'),
      'entries', jsonb_build_object(
        'ar', jsonb_build_object(
          'challenge.shake.intro', 'هز الهاتف',
          'challenge.tilt.intro', 'أمل الجهاز',
          'challenge.audio.intro', 'عدّ النبضات',
          'challenge.pair_sync.intro', 'تزامن مع شريكك',
          'challenge.risk_choice.intro', 'اختر مخاطرتك',
          'result.shake.incomplete', 'هزّات غير كافية',
          'result.tilt.miss', 'لم تثبت التوازن',
          'result.audio.wrong_count', 'عدد نبضات خاطئ',
          'result.pair.fallback', 'متابعة عادلة بدون شريك',
          'result.pair.out_of_sync', 'خارج التزامن'
        ),
        'en', jsonb_build_object(
          'challenge.shake.intro', 'Shake the phone',
          'challenge.tilt.intro', 'Tilt the phone',
          'challenge.audio.intro', 'Count the pulses',
          'challenge.pair_sync.intro', 'Sync with your partner',
          'challenge.risk_choice.intro', 'Choose your risk',
          'result.shake.incomplete', 'Not enough shakes',
          'result.tilt.miss', 'Balance not held',
          'result.audio.wrong_count', 'Wrong pulse count',
          'result.pair.fallback', 'Fair continue without partner',
          'result.pair.out_of_sync', 'Out of sync'
        )
      )
    ),
    'LH-009 localization'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('localization', v_loc_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;
