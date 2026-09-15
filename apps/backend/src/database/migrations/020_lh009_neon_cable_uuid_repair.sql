-- LH-009 repair: neon cable template version UUID collided with sequence sort
-- (dddddddd-dddd-4ddd-8ddd-dddddddddd19 from migration 017). Migration 019's
-- ON CONFLICT (id) DO NOTHING left precision.neon_cable without a version, while
-- the catalog entry pointed at sequence sort — so pausing sequence sort still
-- left "connect cable" resolving to sort-numbers only.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc24';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd24';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa20';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('precision', 'Precision')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('precision.neon_cable', 'precision', 'Neon cable')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_tid, 'precision.neon_cable', 'precision', 'precision.neon_cable', 'Neon cable connect', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid FROM content_templates WHERE slug = 'precision.neon_cable';

  v_def := '{
    "definitionId": "precision.neon_cable.dev",
    "definitionVersion": 1,
    "engineId": "precision.neon_cable",
    "durationMs": 8000,
    "heartPenaltyOnFailure": 1,
    "energyRewardOnSuccess": 1,
    "promptKey": "challenge.neon_cable.intro",
    "choiceKeys": [],
    "clientConfig": {
      "categoryKey": "challenge.category.precision",
      "promptKey": "challenge.neon_cable.prompt",
      "footerKey": "challenge.neon_cable.footer",
      "assetIds": {
        "panel": "neon_cable.panel_background",
        "socketHousing": "neon_cable.socket_housing",
        "socketRingCyan": "neon_cable.socket_ring_cyan",
        "socketRingRed": "neon_cable.socket_ring_red",
        "socketGlowCyan": "neon_cable.socket_glow_cyan",
        "socketGlowRed": "neon_cable.socket_glow_red",
        "plugBody": "neon_cable.plug_body",
        "plugGlow": "neon_cable.plug_glow_cyan",
        "plugShadow": "neon_cable.plug_shadow",
        "snapSparksCyan": "neon_cable.snap_sparks_cyan",
        "snapSparksRed": "neon_cable.snap_sparks_red",
        "sparkRive": "neon_cable.cable_spark",
        "composition": "neon_cable.composition"
      },
      "sockets": [
        {"socketId": "socket.cyan", "color": "cyan", "xNorm": 0.78, "yNorm": 0.34},
        {"socketId": "socket.red", "color": "red", "xNorm": 0.78, "yNorm": 0.66}
      ],
      "plugStartXNorm": 0.28,
      "plugStartYNorm": 0.5,
      "cableAnchorXNorm": 0.08,
      "cableAnchorYNorm": 0.5,
      "plugCableAnchorNorm": [0.105, 0.5],
      "plugTipAnchorNorm": [0.895, 0.5],
      "socketTargetAnchorNorm": [0.5, 0.5],
      "snapRadiusNorm": 0.09,
      "wrongDropPolicy": "fail_final",
      "correctSocketId": "socket.cyan",
      "plugColor": "cyan"
    },
    "serverConfig": {
      "assetIds": {
        "panel": "neon_cable.panel_background",
        "socketHousing": "neon_cable.socket_housing",
        "socketRingCyan": "neon_cable.socket_ring_cyan",
        "socketRingRed": "neon_cable.socket_ring_red",
        "socketGlowCyan": "neon_cable.socket_glow_cyan",
        "socketGlowRed": "neon_cable.socket_glow_red",
        "plugBody": "neon_cable.plug_body",
        "plugGlow": "neon_cable.plug_glow_cyan",
        "plugShadow": "neon_cable.plug_shadow",
        "snapSparksCyan": "neon_cable.snap_sparks_cyan",
        "snapSparksRed": "neon_cable.snap_sparks_red",
        "sparkRive": "neon_cable.cable_spark",
        "composition": "neon_cable.composition"
      },
      "sockets": [
        {"socketId": "socket.cyan", "color": "cyan", "xNorm": 0.78, "yNorm": 0.34},
        {"socketId": "socket.red", "color": "red", "xNorm": 0.78, "yNorm": 0.66}
      ],
      "plugStartXNorm": 0.28,
      "plugStartYNorm": 0.5,
      "cableAnchorXNorm": 0.08,
      "cableAnchorYNorm": 0.5,
      "plugCableAnchorNorm": [0.105, 0.5],
      "plugTipAnchorNorm": [0.895, 0.5],
      "socketTargetAnchorNorm": [0.5, 0.5],
      "snapRadiusNorm": 0.09,
      "wrongDropPolicy": "fail_final",
      "correctSocketId": "socket.cyan",
      "plugColor": "cyan",
      "variants": [
        {
          "sockets": [
            {"socketId": "socket.cyan", "color": "cyan", "xNorm": 0.78, "yNorm": 0.34},
            {"socketId": "socket.red", "color": "red", "xNorm": 0.78, "yNorm": 0.66}
          ],
          "correctSocketId": "socket.cyan",
          "plugColor": "cyan"
        },
        {
          "sockets": [
            {"socketId": "socket.red", "color": "red", "xNorm": 0.78, "yNorm": 0.34},
            {"socketId": "socket.cyan", "color": "cyan", "xNorm": 0.78, "yNorm": 0.66}
          ],
          "correctSocketId": "socket.cyan",
          "plugColor": "cyan"
        }
      ]
    },
    "internalTitle": "Neon cable connect",
    "familyId": "precision",
    "categoryId": "precision.neon_cable",
    "difficulty": "easy",
    "instructionAr": "اسحب السلك إلى المنفذ المطابق.",
    "eligibleModes": ["quick_survival", "private", "training", "dev"],
    "selectionWeight": 100,
    "repetitionCooldownRounds": 1,
    "minAppVersion": "0.0.0",
    "requiredCapabilities": [],
    "accessibilityFallbackKey": "challenge.neon_cable.a11y_fallback",
    "requiredAssetIds": [
      "neon_cable.panel_background",
      "neon_cable.socket_housing",
      "neon_cable.socket_ring_cyan",
      "neon_cable.socket_ring_red",
      "neon_cable.socket_glow_cyan",
      "neon_cable.socket_glow_red",
      "neon_cable.plug_body",
      "neon_cable.plug_glow_cyan",
      "neon_cable.plug_shadow",
      "neon_cable.snap_sparks_cyan",
      "neon_cable.snap_sparks_red",
      "neon_cable.cable_spark",
      "neon_cable.composition"
    ]
  }'::jsonb;

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid, v_tid, 1, 'published',
    v_def,
    md5('precision.neon_cable.v1.repair'),
    'neon cable UUID collision repair',
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    template_id = EXCLUDED.template_id,
    definition = EXCLUDED.definition,
    validation_hash = EXCLUDED.validation_hash,
    validation_notes = EXCLUDED.validation_notes,
    status = 'published',
    approved_at = COALESCE(content_template_versions.approved_at, now());

  -- Prefer unique (template_id, version) if id was free but version 1 already exists under another id.
  UPDATE content_template_versions
  SET definition = v_def,
      validation_hash = md5('precision.neon_cable.v1.repair'),
      validation_notes = 'neon cable UUID collision repair',
      status = 'published',
      approved_at = COALESCE(approved_at, now())
  WHERE template_id = v_tid AND version = 1 AND id <> v_vid;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  v_entries := COALESCE(v_current_catalog->'entries', '[]'::jsonb);

  -- Drop any neon cable entry pointing at the wrong version, then append the correct one.
  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
  INTO v_entries
  FROM jsonb_array_elements(v_entries) e
  WHERE e->>'definitionId' IS DISTINCT FROM 'precision.neon_cable.dev';

  v_entries := v_entries || jsonb_build_array(
    jsonb_build_object(
      'templateVersionId', v_vid,
      'definitionId', 'precision.neon_cable.dev',
      'weight', 100,
      'repetitionCooldownRounds', 1,
      'paused', false
    )
  );

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'lh.neon_cable.v2',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.neon_cable.v2',
      'entries', v_entries,
      'changelog', 'Repair precision.neon_cable templateVersionId collision with order.sequence_sort'
    ),
    'Repair neon cable catalog mapping'
  ) ON CONFLICT (id) DO UPDATE SET
    payload = EXCLUDED.payload,
    version_label = EXCLUDED.version_label,
    changelog = EXCLUDED.changelog;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();

  -- Ensure neon cable is not left paused from a prior bad override.
  INSERT INTO content_catalog_entry_overrides (definition_id, paused, updated_at)
  VALUES ('precision.neon_cable.dev', false, now())
  ON CONFLICT (definition_id) DO UPDATE SET paused = false, updated_at = now();
END $$;
