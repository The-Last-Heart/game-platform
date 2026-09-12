-- LH-007: publish six-engine core challenge catalog (finite pack).
-- Idempotent via fixed UUIDs / ON CONFLICT.

DO $$
DECLARE
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa07';
  v_loc_release_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd07';
  v_wait_tid uuid;
  v_wait_vid uuid;
  v_trap_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';
  v_trap_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd01';
  v_swipe_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc02';
  v_swipe_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd02';
  v_tap_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc03';
  v_tap_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd03';
  v_mem_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc04';
  v_mem_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd04';
  v_hold_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc05';
  v_hold_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd05';
BEGIN
  INSERT INTO content_families (id, title) VALUES
    ('trap', 'Trap'),
    ('gesture', 'Gesture'),
    ('tap', 'Tap'),
    ('memory', 'Memory'),
    ('hold', 'Hold')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('trap.no_touch', 'trap', 'No-touch trap'),
    ('gesture.reverse_swipe', 'gesture', 'Reverse swipe'),
    ('tap.precision', 'tap', 'Precision tap'),
    ('memory.sequence', 'memory', 'Memory sequence'),
    ('hold.multitouch', 'hold', 'Multitouch hold')
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_wait_tid FROM content_templates WHERE slug = 'reaction.wait_for_signal' LIMIT 1;
  SELECT id INTO v_wait_vid FROM content_template_versions
    WHERE template_id = v_wait_tid AND version = 1 LIMIT 1;

  -- Trap
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_trap_tid, 'trap.no_touch', 'trap', 'trap.no_touch', 'No-touch trap', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published'
  RETURNING id INTO v_trap_tid;
  SELECT id INTO v_trap_tid FROM content_templates WHERE slug = 'trap.no_touch';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_trap_vid, v_trap_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'trap.no_touch.dev',
      'definitionVersion', 1,
      'engineId', 'trap.no_touch',
      'durationMs', 4000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.no_touch.intro',
      'choiceKeys', '[]'::jsonb,
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.trap',
        'promptKey', 'challenge.no_touch.prompt',
        'zoneHintKey', 'challenge.no_touch.zone_hint',
        'zone', jsonb_build_object('x', 0.25, 'y', 0.3, 'width', 0.5, 'height', 0.4)
      ),
      'serverConfig', jsonb_build_object('allowSystemGestures', true),
      'internalTitle', 'No-touch trap',
      'familyId', 'trap',
      'categoryId', 'trap.no_touch',
      'difficulty', 'easy',
      'instructionAr', 'لا تلمس المنطقة المحظورة حتى ينتهي الوقت.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 1,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', '[]'::jsonb,
      'accessibilityFallbackKey', 'challenge.no_touch.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('trap.no_touch.v1'),
    'lh007 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Reverse swipe
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_swipe_tid, 'gesture.reverse_swipe', 'gesture', 'gesture.reverse_swipe', 'Reverse swipe', 'published')
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_swipe_tid FROM content_templates WHERE slug = 'gesture.reverse_swipe';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_swipe_vid, v_swipe_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'gesture.reverse_swipe.dev',
      'definitionVersion', 1,
      'engineId', 'gesture.reverse_swipe',
      'durationMs', 5000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.reverse_swipe.intro',
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.gesture',
        'promptKey', 'challenge.reverse_swipe.prompt',
        'displayedDirection', 'right',
        'minDistancePx', 80
      ),
      'serverConfig', jsonb_build_object(
        'requiredDirection', 'left',
        'minDistancePx', 80,
        'maxDurationMs', 1500
      ),
      'internalTitle', 'Reverse swipe',
      'familyId', 'gesture',
      'categoryId', 'gesture.reverse_swipe',
      'difficulty', 'medium',
      'instructionAr', 'اسحب بعكس الاتجاه المعروض.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 1,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', '[]'::jsonb,
      'accessibilityFallbackKey', 'challenge.reverse_swipe.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('gesture.reverse_swipe.v1'),
    'lh007 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Precision tap
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_tap_tid, 'tap.precision', 'tap', 'tap.precision', 'Precision tap', 'published')
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_tap_tid FROM content_templates WHERE slug = 'tap.precision';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_tap_vid, v_tap_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'tap.precision.dev',
      'definitionVersion', 1,
      'engineId', 'tap.precision',
      'durationMs', 5000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.precision.intro',
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.tap',
        'promptKey', 'challenge.precision.prompt',
        'attemptCount', 2,
        'targets', jsonb_build_array(
          jsonb_build_object('id', 't1', 'x', 0.3, 'y', 0.4),
          jsonb_build_object('id', 't2', 'x', 0.7, 'y', 0.6)
        )
      ),
      'serverConfig', jsonb_build_object(
        'targetIds', jsonb_build_array('t1', 't2'),
        'attemptCount', 2
      ),
      'internalTitle', 'Precision tap',
      'familyId', 'tap',
      'categoryId', 'tap.precision',
      'difficulty', 'medium',
      'instructionAr', 'اضغط على جميع الأهداف.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 1,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', '[]'::jsonb,
      'accessibilityFallbackKey', 'challenge.precision.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('tap.precision.v1'),
    'lh007 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Memory
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_mem_tid, 'memory.sequence', 'memory', 'memory.sequence', 'Memory sequence', 'published')
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_mem_tid FROM content_templates WHERE slug = 'memory.sequence';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_mem_vid, v_mem_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'memory.sequence.dev',
      'definitionVersion', 1,
      'engineId', 'memory.sequence',
      'durationMs', 6000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.memory.intro',
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.memory',
        'promptKey', 'challenge.memory.prompt',
        'previewMs', 1500,
        'optionKeys', jsonb_build_array('memory.opt.a','memory.opt.b','memory.opt.c','memory.opt.d')
      ),
      'serverConfig', jsonb_build_object(
        'sequence', jsonb_build_array('memory.opt.a','memory.opt.c','memory.opt.b'),
        'previewMs', 1500,
        'optionKeys', jsonb_build_array('memory.opt.a','memory.opt.b','memory.opt.c','memory.opt.d')
      ),
      'internalTitle', 'Memory sequence',
      'familyId', 'memory',
      'categoryId', 'memory.sequence',
      'difficulty', 'hard',
      'instructionAr', 'احفظ التسلسل ثم أعده.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 2,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', '[]'::jsonb,
      'accessibilityFallbackKey', 'challenge.memory.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('memory.sequence.v1'),
    'lh007 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Hold
  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_hold_tid, 'hold.multitouch', 'hold', 'hold.multitouch', 'Multitouch hold', 'published')
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO v_hold_tid FROM content_templates WHERE slug = 'hold.multitouch';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_hold_vid, v_hold_tid, 1, 'published',
    jsonb_build_object(
      'definitionId', 'hold.multitouch.dev',
      'definitionVersion', 1,
      'engineId', 'hold.multitouch',
      'durationMs', 5000,
      'heartPenaltyOnFailure', 1,
      'energyRewardOnSuccess', 1,
      'promptKey', 'challenge.hold.intro',
      'clientConfig', jsonb_build_object(
        'categoryKey', 'challenge.category.hold',
        'promptKey', 'challenge.hold.prompt',
        'requiredContacts', 2,
        'holdMs', 1500
      ),
      'serverConfig', jsonb_build_object(
        'requiredContacts', 2,
        'holdMs', 1500,
        'resetOnLift', true
      ),
      'internalTitle', 'Multitouch hold',
      'familyId', 'hold',
      'categoryId', 'hold.multitouch',
      'difficulty', 'medium',
      'instructionAr', 'أمسك بإصبعين حتى يكتمل الشريط.',
      'eligibleModes', jsonb_build_array('quick_survival','private','training','dev'),
      'selectionWeight', 100,
      'repetitionCooldownRounds', 1,
      'minAppVersion', '0.0.0',
      'requiredCapabilities', jsonb_build_array('multitouch'),
      'accessibilityFallbackKey', 'challenge.hold.a11y_fallback',
      'requiredAssetIds', '[]'::jsonb
    ),
    md5('hold.multitouch.v1'),
    'lh007 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Re-read version ids after conflict paths
  SELECT id INTO v_trap_vid FROM content_template_versions WHERE template_id = (SELECT id FROM content_templates WHERE slug='trap.no_touch') AND version=1;
  SELECT id INTO v_swipe_vid FROM content_template_versions WHERE template_id = (SELECT id FROM content_templates WHERE slug='gesture.reverse_swipe') AND version=1;
  SELECT id INTO v_tap_vid FROM content_template_versions WHERE template_id = (SELECT id FROM content_templates WHERE slug='tap.precision') AND version=1;
  SELECT id INTO v_mem_vid FROM content_template_versions WHERE template_id = (SELECT id FROM content_templates WHERE slug='memory.sequence') AND version=1;
  SELECT id INTO v_hold_vid FROM content_template_versions WHERE template_id = (SELECT id FROM content_templates WHERE slug='hold.multitouch') AND version=1;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'lh007.core.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh007.core.v1',
      'entries', jsonb_build_array(
        jsonb_build_object('templateVersionId', v_wait_vid, 'definitionId', 'reaction.wait_for_signal.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_trap_vid, 'definitionId', 'trap.no_touch.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_swipe_vid, 'definitionId', 'gesture.reverse_swipe.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_tap_vid, 'definitionId', 'tap.precision.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_mem_vid, 'definitionId', 'memory.sequence.dev', 'weight', 100, 'repetitionCooldownRounds', 2, 'paused', false),
        jsonb_build_object('templateVersionId', v_hold_vid, 'definitionId', 'hold.multitouch.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false)
      ),
      'changelog', 'LH-007 six-engine core pack'
    ),
    'LH-007 six-engine core pack'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh007.core.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'lh007.core.v1',
      'locales', jsonb_build_array('ar','en'),
      'entries', jsonb_build_object(
        'ar', jsonb_build_object(
          'result.equal', 'نتيجة التحدي: تعادل',
          'challenge.no_touch.intro', 'لا تلمس',
          'challenge.reverse_swipe.intro', 'اسحب بالعكس',
          'challenge.precision.intro', 'اضغط الأهداف',
          'challenge.memory.intro', 'تذكّر التسلسل',
          'challenge.hold.intro', 'أمسك بإصبعين'
        ),
        'en', jsonb_build_object(
          'result.equal', 'Result: Equal',
          'challenge.no_touch.intro', 'Do not touch',
          'challenge.reverse_swipe.intro', 'Swipe the opposite way',
          'challenge.precision.intro', 'Tap the targets',
          'challenge.memory.intro', 'Remember the sequence',
          'challenge.hold.intro', 'Hold with two fingers'
        )
      )
    ),
    'LH-007 localization'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('localization', v_loc_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;
