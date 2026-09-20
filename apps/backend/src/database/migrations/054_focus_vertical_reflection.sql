-- Seed focus.vertical_reflection (Mirror of Deception / مرآة الخداع).
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc54';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd54';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa54';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb54';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_current_loc jsonb;
  v_ar jsonb;
  v_en jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('focus', 'Focus')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('focus.vertical_reflection', 'focus', 'Mirror of Deception')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'focus.vertical_reflection.mirror',
    'focus',
    'focus.vertical_reflection',
    'Mirror of Deception — مرآة الخداع',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid FROM content_templates WHERE slug = 'focus.vertical_reflection.mirror';

  v_client := '{"categoryKey":"challenge.category.focus","promptKey":"challenge.vertical_reflection.prompt","titleKey":"challenge.vertical_reflection.title","titleText":"مرآة الخداع","instructionText":"اختر الانعكاس الصحيح حول المحور العمودي","footerKey":"challenge.vertical_reflection.footer"}'::jsonb;

  v_server := '{"questions":[{"questionId":"vertical_reflection.q.asymmetric_arrow_notch","internalName":"asymmetric_arrow_notch","templateId":"asymmetric_arrow_notch","generationSeed":"vr-default-asymmetric_arrow_notch-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"easy","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.12,"y":0.28},{"x":0.52,"y":0.28},{"x":0.52,"y":0.16},{"x":0.88,"y":0.5},{"x":0.52,"y":0.84},{"x":0.52,"y":0.72},{"x":0.28,"y":0.72},{"x":0.22,"y":0.66},{"x":0.28,"y":0.6},{"x":0.12,"y":0.6}]}],"markers":[{"id":"m1","type":"dot","center":{"x":0.28,"y":0.4},"size":0.07,"colorRole":"accent"}]}},{"questionId":"vertical_reflection.q.stepped_polygon","internalName":"stepped_polygon","templateId":"stepped_polygon","generationSeed":"vr-default-stepped_polygon-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"easy","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.1,"y":0.75},{"x":0.1,"y":0.55},{"x":0.28,"y":0.55},{"x":0.28,"y":0.35},{"x":0.48,"y":0.35},{"x":0.48,"y":0.18},{"x":0.78,"y":0.18},{"x":0.78,"y":0.42},{"x":0.62,"y":0.42},{"x":0.62,"y":0.75}]}],"markers":[{"id":"m1","type":"ring","center":{"x":0.36,"y":0.48},"size":0.05,"colorRole":"primary"}]}},{"questionId":"vertical_reflection.q.key_silhouette","internalName":"key_silhouette","templateId":"key_silhouette","generationSeed":"vr-default-key_silhouette-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"easy","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.18,"y":0.22},{"x":0.42,"y":0.22},{"x":0.42,"y":0.38},{"x":0.78,"y":0.38},{"x":0.78,"y":0.48},{"x":0.68,"y":0.48},{"x":0.68,"y":0.58},{"x":0.78,"y":0.58},{"x":0.78,"y":0.68},{"x":0.42,"y":0.68},{"x":0.42,"y":0.82},{"x":0.18,"y":0.82},{"x":0.18,"y":0.62},{"x":0.28,"y":0.62},{"x":0.28,"y":0.42},{"x":0.18,"y":0.42}]}],"markers":[{"id":"m1","type":"dot","center":{"x":0.28,"y":0.32},"size":0.055,"colorRole":"accent"}]}},{"questionId":"vertical_reflection.q.irregular_flag","internalName":"irregular_flag","templateId":"irregular_flag","generationSeed":"vr-default-irregular_flag-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"easy","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.12,"y":0.15},{"x":0.72,"y":0.15},{"x":0.62,"y":0.32},{"x":0.78,"y":0.42},{"x":0.58,"y":0.55},{"x":0.74,"y":0.72},{"x":0.12,"y":0.72},{"x":0.12,"y":0.58},{"x":0.22,"y":0.58},{"x":0.22,"y":0.28},{"x":0.12,"y":0.28}]}],"markers":[{"id":"m1","type":"small_triangle","center":{"x":0.32,"y":0.35},"size":0.06,"colorRole":"secondary"}]}},{"questionId":"vertical_reflection.q.asymmetric_shield","internalName":"asymmetric_shield","templateId":"asymmetric_shield","generationSeed":"vr-default-asymmetric_shield-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"easy","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.22,"y":0.12},{"x":0.72,"y":0.12},{"x":0.82,"y":0.28},{"x":0.78,"y":0.55},{"x":0.55,"y":0.88},{"x":0.35,"y":0.72},{"x":0.18,"y":0.5},{"x":0.18,"y":0.28}]}],"markers":[{"id":"m1","type":"ring","center":{"x":0.42,"y":0.32},"size":0.06,"colorRole":"accent"}]}},{"questionId":"vertical_reflection.q.lightning_zigzag","internalName":"lightning_zigzag","templateId":"lightning_zigzag","generationSeed":"vr-default-lightning_zigzag-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"medium","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.42,"y":0.08},{"x":0.72,"y":0.08},{"x":0.48,"y":0.38},{"x":0.78,"y":0.38},{"x":0.28,"y":0.92},{"x":0.38,"y":0.55},{"x":0.18,"y":0.55}]}],"markers":[{"id":"m1","type":"dot","center":{"x":0.52,"y":0.22},"size":0.05,"colorRole":"primary"}]}},{"questionId":"vertical_reflection.q.boot_hook","internalName":"boot_hook","templateId":"boot_hook","generationSeed":"vr-default-boot_hook-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"medium","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.2,"y":0.15},{"x":0.48,"y":0.15},{"x":0.48,"y":0.48},{"x":0.78,"y":0.48},{"x":0.78,"y":0.72},{"x":0.55,"y":0.72},{"x":0.55,"y":0.85},{"x":0.2,"y":0.85},{"x":0.2,"y":0.62},{"x":0.32,"y":0.62},{"x":0.32,"y":0.35},{"x":0.2,"y":0.35}]}],"markers":[{"id":"m1","type":"short_line","center":{"x":0.35,"y":0.25},"size":0.07,"colorRole":"accent"}]}},{"questionId":"vertical_reflection.q.offset_chevron","internalName":"offset_chevron","templateId":"offset_chevron","generationSeed":"vr-default-offset_chevron-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"medium","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.18,"y":0.22},{"x":0.48,"y":0.08},{"x":0.82,"y":0.28},{"x":0.68,"y":0.4},{"x":0.5,"y":0.28},{"x":0.35,"y":0.42},{"x":0.55,"y":0.55},{"x":0.35,"y":0.72},{"x":0.18,"y":0.58},{"x":0.32,"y":0.48},{"x":0.18,"y":0.38}]}],"markers":[{"id":"m1","type":"dot","center":{"x":0.55,"y":0.22},"size":0.05,"colorRole":"secondary"}]}},{"questionId":"vertical_reflection.q.l_block_notch","internalName":"l_block_notch","templateId":"l_block_notch","generationSeed":"vr-default-l_block_notch-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"medium","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.15,"y":0.2},{"x":0.45,"y":0.2},{"x":0.45,"y":0.5},{"x":0.72,"y":0.5},{"x":0.72,"y":0.62},{"x":0.55,"y":0.62},{"x":0.55,"y":0.78},{"x":0.15,"y":0.78},{"x":0.15,"y":0.55},{"x":0.28,"y":0.55},{"x":0.28,"y":0.38},{"x":0.15,"y":0.38}]}],"markers":[{"id":"m1","type":"ring","center":{"x":0.3,"y":0.3},"size":0.05,"colorRole":"accent"}]}},{"questionId":"vertical_reflection.q.irregular_crown","internalName":"irregular_crown","templateId":"irregular_crown","generationSeed":"vr-default-irregular_crown-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"medium","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.12,"y":0.7},{"x":0.12,"y":0.42},{"x":0.22,"y":0.42},{"x":0.28,"y":0.18},{"x":0.4,"y":0.38},{"x":0.5,"y":0.12},{"x":0.62,"y":0.35},{"x":0.75,"y":0.15},{"x":0.82,"y":0.42},{"x":0.88,"y":0.42},{"x":0.88,"y":0.7},{"x":0.7,"y":0.7},{"x":0.7,"y":0.55},{"x":0.3,"y":0.55},{"x":0.3,"y":0.7}]}],"markers":[{"id":"m1","type":"dot","center":{"x":0.5,"y":0.48},"size":0.05,"colorRole":"primary"}]}},{"questionId":"vertical_reflection.q.mechanical_plate","internalName":"mechanical_plate","templateId":"mechanical_plate","generationSeed":"vr-default-mechanical_plate-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"hard","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.15,"y":0.25},{"x":0.55,"y":0.18},{"x":0.82,"y":0.3},{"x":0.75,"y":0.55},{"x":0.85,"y":0.72},{"x":0.55,"y":0.82},{"x":0.28,"y":0.75},{"x":0.18,"y":0.55},{"x":0.32,"y":0.45},{"x":0.22,"y":0.35}]}],"markers":[{"id":"m1","type":"dot","center":{"x":0.4,"y":0.35},"size":0.045,"colorRole":"accent"},{"id":"m2","type":"ring","center":{"x":0.62,"y":0.55},"size":0.04,"colorRole":"secondary"}]}},{"questionId":"vertical_reflection.q.maze_silhouette","internalName":"maze_silhouette","templateId":"maze_silhouette","generationSeed":"vr-default-maze_silhouette-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"hard","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.12,"y":0.15},{"x":0.78,"y":0.15},{"x":0.78,"y":0.35},{"x":0.55,"y":0.35},{"x":0.55,"y":0.5},{"x":0.78,"y":0.5},{"x":0.78,"y":0.85},{"x":0.45,"y":0.85},{"x":0.45,"y":0.65},{"x":0.28,"y":0.65},{"x":0.28,"y":0.85},{"x":0.12,"y":0.85},{"x":0.12,"y":0.55},{"x":0.35,"y":0.55},{"x":0.35,"y":0.35},{"x":0.12,"y":0.35}]}],"markers":[{"id":"m1","type":"small_triangle","center":{"x":0.65,"y":0.25},"size":0.05,"colorRole":"accent"}]}},{"questionId":"vertical_reflection.q.fish_abstract","internalName":"fish_abstract","templateId":"fish_abstract","generationSeed":"vr-default-fish_abstract-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"hard","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.12,"y":0.5},{"x":0.28,"y":0.28},{"x":0.55,"y":0.22},{"x":0.78,"y":0.35},{"x":0.9,"y":0.28},{"x":0.82,"y":0.5},{"x":0.9,"y":0.72},{"x":0.78,"y":0.65},{"x":0.55,"y":0.78},{"x":0.28,"y":0.72},{"x":0.22,"y":0.58}]}],"markers":[{"id":"m1","type":"dot","center":{"x":0.35,"y":0.42},"size":0.05,"colorRole":"primary"}]}},{"questionId":"vertical_reflection.q.hand_silhouette","internalName":"hand_silhouette","templateId":"hand_silhouette","generationSeed":"vr-default-hand_silhouette-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"hard","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.22,"y":0.78},{"x":0.22,"y":0.48},{"x":0.18,"y":0.28},{"x":0.28,"y":0.22},{"x":0.35,"y":0.42},{"x":0.4,"y":0.15},{"x":0.5,"y":0.15},{"x":0.52,"y":0.4},{"x":0.58,"y":0.18},{"x":0.68,"y":0.2},{"x":0.65,"y":0.42},{"x":0.78,"y":0.32},{"x":0.85,"y":0.42},{"x":0.7,"y":0.55},{"x":0.72,"y":0.78}]}],"markers":[{"id":"m1","type":"ring","center":{"x":0.45,"y":0.6},"size":0.05,"colorRole":"accent"}]}},{"questionId":"vertical_reflection.q.crystal_concave","internalName":"crystal_concave","templateId":"crystal_concave","generationSeed":"vr-default-crystal_concave-v1","sourceSide":"left","generatorVersion":1,"enabled":true,"difficulty":"hard","selectionWeight":1,"titleCopy":{"ar":"مرآة الخداع","en":"Mirror of Deception"},"instructionCopy":{"ar":"اختر الانعكاس الصحيح حول المحور العمودي","en":"Choose the correct reflection across the vertical axis"},"sourceShape":{"polygons":[{"closed":true,"points":[{"x":0.5,"y":0.08},{"x":0.78,"y":0.28},{"x":0.7,"y":0.48},{"x":0.88,"y":0.62},{"x":0.58,"y":0.9},{"x":0.42,"y":0.7},{"x":0.2,"y":0.78},{"x":0.18,"y":0.45},{"x":0.35,"y":0.38},{"x":0.28,"y":0.22}]}],"markers":[{"id":"m1","type":"dot","center":{"x":0.48,"y":0.35},"size":0.05,"colorRole":"secondary"}]}}]}'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'focus.vertical_reflection.mirror',
    'definitionVersion', 1,
    'engineId', 'focus.vertical_reflection',
    'durationMs', 12000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.vertical_reflection.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Mirror of Deception — مرآة الخداع',
    'familyId', 'focus',
    'categoryId', 'focus.vertical_reflection',
    'difficulty', 'easy',
    'instructionAr', 'اختر الانعكاس الصحيح حول المحور العمودي',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'introDurationMs', 1200,
    'resultHoldMs', 1600,
    'requiredCapabilities', '["touch", "challenge.engine.focus.vertical_reflection.v1"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.vertical_reflection.a11y_fallback',
    'requiredAssetIds', '[]'::jsonb,
    'minAppVersion', '0.0.1'
  );

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid, v_tid, 1, 'published', v_def,
    md5('focus.vertical_reflection.mirror.v1'), 'Mirror of Deception shape bank (15 templates)', now()
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
    WHERE e->>'definitionId' = 'focus.vertical_reflection.mirror'
       OR e->>'templateVersionId' = v_vid::text
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'focus.vertical_reflection.mirror',
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
    'lh.vertical_reflection.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.vertical_reflection.v1',
      'entries', v_entries,
      'changelog', 'Add focus.vertical_reflection (Mirror of Deception)'
    ),
    'Add Mirror of Deception challenge'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_loc
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'localization'
  LIMIT 1;

  v_ar := COALESCE(v_current_loc#>'{entries,ar}', '{}'::jsonb) || '{
    "challenge.vertical_reflection.title": "مرآة الخداع",
    "challenge.vertical_reflection.intro": "مرآة الخداع",
    "challenge.vertical_reflection.prompt": "اختر الانعكاس الصحيح حول المحور العمودي",
    "challenge.vertical_reflection.instruction": "اختر الانعكاس الصحيح حول المحور العمودي",
    "challenge.vertical_reflection.footer": "اختيار واحد فقط",
    "challenge.vertical_reflection.a11y_fallback": "تحدٍ بصري: اختر انعكاس الشكل حول المحور العمودي",
    "engine.focus.vertical_reflection": "مرآة الخداع",
    "result.vertical_reflection.wrong": "انعكاس خاطئ"
  }'::jsonb;

  v_en := COALESCE(v_current_loc#>'{entries,en}', '{}'::jsonb) || '{
    "challenge.vertical_reflection.title": "Mirror of Deception",
    "challenge.vertical_reflection.intro": "Mirror of Deception",
    "challenge.vertical_reflection.prompt": "Choose the correct reflection across the vertical axis",
    "challenge.vertical_reflection.instruction": "Choose the correct reflection across the vertical axis",
    "challenge.vertical_reflection.footer": "One choice only",
    "challenge.vertical_reflection.a11y_fallback": "Visual challenge: choose the vertical reflection of the shape",
    "engine.focus.vertical_reflection": "Mirror of Deception",
    "result.vertical_reflection.wrong": "Wrong reflection"
  }'::jsonb;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.vertical_reflection.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'lh.vertical_reflection.v1',
      'locales', '["ar","en"]'::jsonb,
      'entries', jsonb_build_object('ar', v_ar, 'en', v_en)
    ),
    'Mirror of Deception localization'
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
