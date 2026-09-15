-- LH-009: precision.cable_untangle challenge + catalog/localization pin.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc28';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd28';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa24';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb24';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_layout jsonb;
  v_sockets jsonb;
  v_cables jsonb;
  v_theme jsonb;
  v_puzzle jsonb;
  v_variants jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('precision', 'Precision')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('precision.cable_untangle', 'precision', 'Cable untangle')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'precision.cable_untangle',
    'precision',
    'precision.cable_untangle',
    'Cable untangle',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid
  FROM content_templates
  WHERE slug = 'precision.cable_untangle';

  v_layout := '{
    "leftColumnX": 0.12,
    "rightColumnX": 0.88,
    "topPadding": 0.1,
    "bottomPadding": 0.1
  }'::jsonb;

  v_sockets := '{
    "left": [
      {"id": "left-1", "order": 0},
      {"id": "left-2", "order": 1},
      {"id": "left-3", "order": 2},
      {"id": "left-4", "order": 3}
    ],
    "right": [
      {"id": "right-1", "order": 0},
      {"id": "right-2", "order": 1},
      {"id": "right-3", "order": 2},
      {"id": "right-4", "order": 3}
    ]
  }'::jsonb;

  v_cables := '[
    {"id":"cable-1","leftSocketId":"left-1","initialRightSocketId":"right-3"},
    {"id":"cable-2","leftSocketId":"left-2","initialRightSocketId":"right-1"},
    {"id":"cable-3","leftSocketId":"left-3","initialRightSocketId":"right-4"},
    {"id":"cable-4","leftSocketId":"left-4","initialRightSocketId":"right-2"}
  ]'::jsonb;

  v_theme := '{
    "backgroundColor": "#07131D",
    "gridColor": "#143143",
    "cableColor": "#69E7FF",
    "cableCoreColor": "#E8FCFF",
    "socketColor": "#91EFFF"
  }'::jsonb;

  v_puzzle := jsonb_build_object(
    'layout', v_layout,
    'sockets', v_sockets,
    'cables', v_cables,
    'theme', v_theme,
    'assetIds', '{"swingSfx":"cable_untangle.swing"}'::jsonb,
    'snapRadiusNorm', 0.08,
    'mirrorHorizontally', false
  );

  v_variants := jsonb_build_array(
    jsonb_build_object(
      'layout', v_layout,
      'sockets', v_sockets,
      'cables', v_cables
    ),
    jsonb_build_object(
      'layout', v_layout,
      'sockets', '{
        "left": [
          {"id": "left-1", "order": 0},
          {"id": "left-2", "order": 1},
          {"id": "left-3", "order": 2},
          {"id": "left-4", "order": 3},
          {"id": "left-5", "order": 4}
        ],
        "right": [
          {"id": "right-1", "order": 0},
          {"id": "right-2", "order": 1},
          {"id": "right-3", "order": 2},
          {"id": "right-4", "order": 3},
          {"id": "right-5", "order": 4}
        ]
      }'::jsonb,
      'cables', '[
        {"id":"cable-1","leftSocketId":"left-1","initialRightSocketId":"right-3"},
        {"id":"cable-2","leftSocketId":"left-2","initialRightSocketId":"right-1"},
        {"id":"cable-3","leftSocketId":"left-3","initialRightSocketId":"right-5"},
        {"id":"cable-4","leftSocketId":"left-4","initialRightSocketId":"right-4"},
        {"id":"cable-5","leftSocketId":"left-5","initialRightSocketId":"right-2"}
      ]'::jsonb
    )
  );

  v_def := jsonb_build_object(
    'definitionId', 'precision.cable_untangle.dev',
    'definitionVersion', 1,
    'engineId', 'precision.cable_untangle',
    'durationMs', 8000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.cable_untangle.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig',
      jsonb_build_object(
        'categoryKey', 'challenge.category.precision',
        'titleKey', 'challenge.cable_untangle.intro',
        'promptKey', 'challenge.cable_untangle.prompt',
        'footerKey', 'challenge.cable_untangle.footer'
      ) || v_puzzle,
    'serverConfig',
      v_puzzle || jsonb_build_object('variants', v_variants),
    'internalTitle', 'Cable untangle',
    'familyId', 'precision',
    'categoryId', 'precision.cable_untangle',
    'difficulty', 'medium',
    'instructionAr', 'اسحب رأس كابل إلى نقطة أخرى لتبديلهما حتى لا تتقاطع الكوابل',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '["touch"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.cable_untangle.a11y_fallback',
    'requiredAssetIds', '["cable_untangle.swing"]'::jsonb
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
    md5('precision.cable_untangle.v1'),
    'cable untangle seed',
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
    WHERE e->>'definitionId' = 'precision.cable_untangle.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'precision.cable_untangle.dev',
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
    'lh.cable_untangle.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.cable_untangle.v1',
      'entries', v_entries,
      'changelog', 'Add precision.cable_untangle'
    ),
    'Add cable untangle challenge'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.cable_untangle.v1',
    '{
      "releaseId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb24",
      "versionLabel": "lh.cable_untangle.v1",
      "locales": ["ar", "en"],
      "entries": {
        "ar": {
          "challenge.cable_untangle.intro": "فك التشابك",
          "challenge.cable_untangle.prompt": "اسحب رأس كابل إلى نقطة أخرى لتبديلهما حتى لا تتقاطع الكوابل",
          "challenge.cable_untangle.footer": "بدّل الرؤوس حتى تتحرر الكوابل",
          "challenge.cable_untangle.a11y_fallback": "اسحب رأس كابل إلى مقبس آخر لتبديلهما",
          "result.cable_untangle.incomplete": "ما زالت الكوابل متقاطعة",
          "result.cable_untangle.invalid": "تسلسل تبديل غير صالح",
          "engine.precision.cable_untangle": "فك التشابك"
        },
        "en": {
          "challenge.cable_untangle.intro": "Untangle",
          "challenge.cable_untangle.prompt": "Drag a cable head onto another to swap them until no cables cross",
          "challenge.cable_untangle.footer": "Swap heads until cables are free",
          "challenge.cable_untangle.a11y_fallback": "Drag a cable head onto another socket to swap them",
          "result.cable_untangle.incomplete": "Cables still cross",
          "result.cable_untangle.invalid": "Invalid swap sequence",
          "engine.precision.cable_untangle": "Cable untangle"
        }
      }
    }'::jsonb,
    'Cable untangle localization'
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
