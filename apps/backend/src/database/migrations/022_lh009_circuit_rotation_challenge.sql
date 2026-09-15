-- LH-009: precision.circuit_rotation challenge + catalog/localization pin.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc27';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd27';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb23';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_assets jsonb;
  v_theme jsonb;
  v_puzzle jsonb;
  v_variants jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('precision', 'Precision')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('precision.circuit_rotation', 'precision', 'Circuit rotation')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'precision.circuit_rotation',
    'precision',
    'precision.circuit_rotation',
    'Circuit rotation',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid
  FROM content_templates
  WHERE slug = 'precision.circuit_rotation';

  v_assets := '{
    "boardBase": "circuit_rotation.board_base",
    "gridPlate": "circuit_rotation.grid_plate",
    "sparkRive": "neon_cable.cable_spark"
  }'::jsonb;

  v_theme := '{
    "inactivePipeColor": "#2A6174",
    "energyColor": "#55E9FF",
    "energyCoreColor": "#EFFFFF",
    "socketColor": "#C9D4DC"
  }'::jsonb;

  v_puzzle := '{
    "grid": {"rows": 3, "columns": 3},
    "source": {"cell": [2, 0], "side": "south"},
    "target": {"cell": [0, 2], "side": "north", "kind": "heart"},
    "tiles": [
      {
        "id": "source-corner",
        "cell": [2, 0],
        "shape": "corner",
        "initialQuarterTurns": 1,
        "movable": false
      },
      {
        "id": "bottom-turn",
        "cell": [2, 1],
        "shape": "corner",
        "initialQuarterTurns": 0,
        "movable": true
      },
      {
        "id": "center-straight",
        "cell": [1, 1],
        "shape": "straight",
        "initialQuarterTurns": 0,
        "movable": false
      },
      {
        "id": "top-turn",
        "cell": [0, 1],
        "shape": "corner",
        "initialQuarterTurns": 2,
        "movable": true
      },
      {
        "id": "heart-corner",
        "cell": [0, 2],
        "shape": "corner",
        "initialQuarterTurns": 3,
        "movable": false
      }
    ],
    "stationaryConnections": [
      {"cell": [2, 0], "side": "south"},
      {"cell": [0, 2], "side": "north"}
    ]
  }'::jsonb;

  v_variants := jsonb_build_array(
    v_puzzle || jsonb_build_object(
      'tiles',
      '[
        {"id":"source-corner","cell":[2,0],"shape":"corner","initialQuarterTurns":1,"movable":false},
        {"id":"bottom-turn","cell":[2,1],"shape":"corner","initialQuarterTurns":3,"movable":false},
        {"id":"center-straight","cell":[1,1],"shape":"straight","initialQuarterTurns":1,"movable":true},
        {"id":"top-turn","cell":[0,1],"shape":"corner","initialQuarterTurns":1,"movable":false},
        {"id":"heart-corner","cell":[0,2],"shape":"corner","initialQuarterTurns":3,"movable":false}
      ]'::jsonb,
      'requireAllConfiguredTilesPowered',
      true
    ),
    v_puzzle || jsonb_build_object(
      'tiles',
      '[
        {"id":"source-corner","cell":[2,0],"shape":"corner","initialQuarterTurns":1,"movable":false},
        {"id":"bottom-turn","cell":[2,1],"shape":"corner","initialQuarterTurns":0,"movable":true},
        {"id":"center-straight","cell":[1,1],"shape":"straight","initialQuarterTurns":0,"movable":false},
        {"id":"top-turn","cell":[0,1],"shape":"corner","initialQuarterTurns":2,"movable":true},
        {"id":"heart-corner","cell":[0,2],"shape":"corner","initialQuarterTurns":3,"movable":false}
      ]'::jsonb,
      'requireAllConfiguredTilesPowered',
      true
    ),
    v_puzzle || jsonb_build_object(
      'tiles',
      '[
        {"id":"source-corner","cell":[2,0],"shape":"corner","initialQuarterTurns":0,"movable":true},
        {"id":"bottom-turn","cell":[2,1],"shape":"corner","initialQuarterTurns":0,"movable":true},
        {"id":"center-straight","cell":[1,1],"shape":"straight","initialQuarterTurns":1,"movable":true},
        {"id":"top-turn","cell":[0,1],"shape":"corner","initialQuarterTurns":1,"movable":false},
        {"id":"heart-corner","cell":[0,2],"shape":"corner","initialQuarterTurns":3,"movable":false}
      ]'::jsonb,
      'requireAllConfiguredTilesPowered',
      true
    ),
    v_puzzle || jsonb_build_object(
      'tiles',
      '[
        {"id":"source-corner","cell":[2,0],"shape":"corner","initialQuarterTurns":0,"movable":true},
        {"id":"bottom-turn","cell":[2,1],"shape":"corner","initialQuarterTurns":0,"movable":true},
        {"id":"center-straight","cell":[1,1],"shape":"straight","initialQuarterTurns":0,"movable":false},
        {"id":"top-turn","cell":[0,1],"shape":"corner","initialQuarterTurns":2,"movable":true},
        {"id":"heart-corner","cell":[0,2],"shape":"corner","initialQuarterTurns":0,"movable":true}
      ]'::jsonb,
      'requireAllConfiguredTilesPowered',
      true
    ),
    v_puzzle || jsonb_build_object(
      'tiles',
      '[
        {"id":"source-corner","cell":[2,0],"shape":"corner","initialQuarterTurns":0,"movable":true},
        {"id":"bottom-turn","cell":[2,1],"shape":"corner","initialQuarterTurns":0,"movable":true},
        {"id":"center-straight","cell":[1,1],"shape":"straight","initialQuarterTurns":1,"movable":true},
        {"id":"top-turn","cell":[0,1],"shape":"corner","initialQuarterTurns":2,"movable":true},
        {"id":"heart-corner","cell":[0,2],"shape":"corner","initialQuarterTurns":0,"movable":true}
      ]'::jsonb,
      'requireAllConfiguredTilesPowered',
      true
    )
  );

  v_def := jsonb_build_object(
    'definitionId', 'precision.circuit_rotation.dev',
    'definitionVersion', 1,
    'engineId', 'precision.circuit_rotation',
    'durationMs', 8000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.circuit_rotation.intro',
    'choiceKeys', '[]'::jsonb,
    'clientConfig',
      jsonb_build_object(
        'categoryKey', 'challenge.category.precision',
        'promptKey', 'challenge.circuit_rotation.prompt',
        'footerKey', 'challenge.circuit_rotation.footer',
        'assetIds', v_assets,
        'theme', v_theme,
        'rotationDegrees', 90
      ) || v_puzzle,
    'serverConfig',
      jsonb_build_object(
        'assetIds', v_assets,
        'theme', v_theme,
        'rotationDegrees', 90,
        'requireAllConfiguredTilesPowered', true,
        'variants', v_variants
      ) || v_puzzle,
    'internalTitle', 'Circuit rotation',
    'familyId', 'precision',
    'categoryId', 'precision.circuit_rotation',
    'difficulty', 'medium',
    'instructionAr', 'اضغط لتدوير القطع وإكمال المسار',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '["touch"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.circuit_rotation.a11y_fallback',
    'requiredAssetIds',
      '[
        "circuit_rotation.board_base",
        "circuit_rotation.grid_plate",
        "neon_cable.cable_spark"
      ]'::jsonb
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
    md5('precision.circuit_rotation.v1'),
    'circuit rotation seed',
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
    WHERE e->>'definitionId' = 'precision.circuit_rotation.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'precision.circuit_rotation.dev',
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
    'lh.circuit_rotation.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.circuit_rotation.v1',
      'entries', v_entries,
      'changelog', 'Add precision.circuit_rotation'
    ),
    'Add circuit rotation challenge'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.circuit_rotation.v1',
    '{
      "releaseId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb23",
      "versionLabel": "lh.circuit_rotation.v1",
      "locales": ["ar", "en"],
      "entries": {
        "ar": {
          "challenge.circuit_rotation.intro": "أكمل الدائرة",
          "challenge.circuit_rotation.prompt": "اضغط لتدوير القطع وإكمال المسار",
          "challenge.circuit_rotation.footer": "أوصل الطاقة إلى القلب",
          "challenge.circuit_rotation.a11y_fallback": "اضغط على قطع الأنابيب لتدويرها وإكمال الدائرة",
          "result.circuit_rotation.incomplete": "الدائرة غير مكتملة",
          "engine.precision.circuit_rotation": "تدوير الدائرة"
        },
        "en": {
          "challenge.circuit_rotation.intro": "Complete the circuit",
          "challenge.circuit_rotation.prompt": "Tap to rotate pieces and complete the path",
          "challenge.circuit_rotation.footer": "Power the path to the heart",
          "challenge.circuit_rotation.a11y_fallback": "Tap pipe pieces to rotate them and complete the circuit",
          "result.circuit_rotation.incomplete": "Circuit incomplete",
          "engine.precision.circuit_rotation": "Circuit rotation"
        }
      }
    }'::jsonb,
    'Circuit rotation localization'
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
