-- LH-009: precision.neon_cable challenge + catalog/localization pin.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc24';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd24';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa19';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb19';
  v_current_catalog jsonb;
  v_entries jsonb;
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

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid, v_tid, 1, 'published',
    '{"definitionId": "precision.neon_cable.dev", "definitionVersion": 1, "engineId": "precision.neon_cable", "durationMs": 8000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.neon_cable.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.precision", "promptKey": "challenge.neon_cable.prompt", "footerKey": "challenge.neon_cable.footer", "assetIds": {"panel": "neon_cable.panel_background", "socketHousing": "neon_cable.socket_housing", "socketRingCyan": "neon_cable.socket_ring_cyan", "socketRingRed": "neon_cable.socket_ring_red", "socketGlowCyan": "neon_cable.socket_glow_cyan", "socketGlowRed": "neon_cable.socket_glow_red", "plugBody": "neon_cable.plug_body", "plugGlow": "neon_cable.plug_glow_cyan", "plugShadow": "neon_cable.plug_shadow", "snapSparksCyan": "neon_cable.snap_sparks_cyan", "snapSparksRed": "neon_cable.snap_sparks_red", "composition": "neon_cable.composition"}, "sockets": [{"socketId": "socket.cyan", "color": "cyan", "xNorm": 0.78, "yNorm": 0.34}, {"socketId": "socket.red", "color": "red", "xNorm": 0.78, "yNorm": 0.66}], "plugStartXNorm": 0.28, "plugStartYNorm": 0.5, "cableAnchorXNorm": 0.08, "cableAnchorYNorm": 0.5, "plugCableAnchorNorm": [0.105, 0.5], "plugTipAnchorNorm": [0.895, 0.5], "socketTargetAnchorNorm": [0.5, 0.5], "snapRadiusNorm": 0.09, "wrongDropPolicy": "fail_final", "correctSocketId": "socket.cyan", "plugColor": "cyan"}, "serverConfig": {"assetIds": {"panel": "neon_cable.panel_background", "socketHousing": "neon_cable.socket_housing", "socketRingCyan": "neon_cable.socket_ring_cyan", "socketRingRed": "neon_cable.socket_ring_red", "socketGlowCyan": "neon_cable.socket_glow_cyan", "socketGlowRed": "neon_cable.socket_glow_red", "plugBody": "neon_cable.plug_body", "plugGlow": "neon_cable.plug_glow_cyan", "plugShadow": "neon_cable.plug_shadow", "snapSparksCyan": "neon_cable.snap_sparks_cyan", "snapSparksRed": "neon_cable.snap_sparks_red", "composition": "neon_cable.composition"}, "sockets": [{"socketId": "socket.cyan", "color": "cyan", "xNorm": 0.78, "yNorm": 0.34}, {"socketId": "socket.red", "color": "red", "xNorm": 0.78, "yNorm": 0.66}], "plugStartXNorm": 0.28, "plugStartYNorm": 0.5, "cableAnchorXNorm": 0.08, "cableAnchorYNorm": 0.5, "plugCableAnchorNorm": [0.105, 0.5], "plugTipAnchorNorm": [0.895, 0.5], "socketTargetAnchorNorm": [0.5, 0.5], "snapRadiusNorm": 0.09, "wrongDropPolicy": "fail_final", "correctSocketId": "socket.cyan", "plugColor": "cyan", "variants": [{"sockets": [{"socketId": "socket.cyan", "color": "cyan", "xNorm": 0.78, "yNorm": 0.34}, {"socketId": "socket.red", "color": "red", "xNorm": 0.78, "yNorm": 0.66}], "correctSocketId": "socket.cyan", "plugColor": "cyan"}, {"sockets": [{"socketId": "socket.red", "color": "red", "xNorm": 0.78, "yNorm": 0.34}, {"socketId": "socket.cyan", "color": "cyan", "xNorm": 0.78, "yNorm": 0.66}], "correctSocketId": "socket.cyan", "plugColor": "cyan"}]}, "internalTitle": "Neon cable connect", "familyId": "precision", "categoryId": "precision.neon_cable", "difficulty": "easy", "instructionAr": "اسحب السلك إلى المنفذ المطابق.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.neon_cable.a11y_fallback", "requiredAssetIds": ["neon_cable.panel_background", "neon_cable.socket_housing", "neon_cable.socket_ring_cyan", "neon_cable.socket_ring_red", "neon_cable.socket_glow_cyan", "neon_cable.socket_glow_red", "neon_cable.plug_body", "neon_cable.plug_glow_cyan", "neon_cable.plug_shadow", "neon_cable.snap_sparks_cyan", "neon_cable.snap_sparks_red", "neon_cable.composition"]}'::jsonb,
    md5('precision.neon_cable.v1'),
    'neon cable seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  v_entries := COALESCE(v_current_catalog->'entries', '[]'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_entries) e
    WHERE e->>'definitionId' = 'precision.neon_cable.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'precision.neon_cable.dev',
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
    'lh.neon_cable.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.neon_cable.v1',
      'entries', v_entries,
      'changelog', 'Add precision.neon_cable'
    ),
    'Add neon cable challenge'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.neon_cable.v1',
    '{"releaseId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb19", "versionLabel": "lh.neon_cable.v1", "locales": ["ar", "en"], "entries": {"ar": {"challenge.neon_cable.intro": "وصل السلك", "challenge.neon_cable.prompt": "اسحب السلك الأزرق إلى المنفذ المطابق", "challenge.neon_cable.footer": "طابق اللون", "challenge.neon_cable.a11y_fallback": "اسحب القابس إلى المنفذ الصحيح", "result.neon_cable.wrong": "منفذ خاطئ", "engine.precision.neon_cable": "السلك النيوني"}, "en": {"challenge.neon_cable.intro": "Connect the cable", "challenge.neon_cable.prompt": "Drag the blue cable to the matching port", "challenge.neon_cable.footer": "Match the color", "challenge.neon_cable.a11y_fallback": "Drag the plug to the correct socket", "result.neon_cable.wrong": "Wrong socket", "engine.precision.neon_cable": "Neon cable"}}}'::jsonb,
    'Neon cable localization'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('localization', v_loc_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;
