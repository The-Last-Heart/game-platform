-- LH-009: gesture.fog_wipe challenge + catalog/localization pin.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc26';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd26';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb22';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('gesture', 'Gesture')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('gesture.fog_wipe', 'gesture', 'Fog wipe')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_tid, 'gesture.fog_wipe', 'gesture', 'gesture.fog_wipe', 'Fog wipe', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid FROM content_templates WHERE slug = 'gesture.fog_wipe';

  v_def := '{
    "definitionId": "gesture.fog_wipe.dev",
    "definitionVersion": 1,
    "engineId": "gesture.fog_wipe",
    "durationMs": 10000,
    "heartPenaltyOnFailure": 1,
    "energyRewardOnSuccess": 1,
    "promptKey": "challenge.fog_wipe.intro",
    "choiceKeys": [],
    "clientConfig": {
      "categoryKey": "challenge.category.gesture",
      "promptKey": "challenge.fog_wipe.prompt",
      "footerKey": "challenge.fog_wipe.footer",
      "assetIds": {
        "revealContent": "fog_wipe.reveal_content",
        "fogDensity": "fog_wipe.fog_density",
        "dropletHeight": "fog_wipe.droplets_height",
        "frostedEdges": "fog_wipe.frosted_edges",
        "scratchMask": "fog_wipe.scratch_mask",
        "wetSmudgeMask": "fog_wipe.wet_smudge_mask",
        "glassReflections": "fog_wipe.glass_reflections"
      },
      "brushDiameterNorm": 0.12,
      "brushFeatherNorm": 0.28,
      "clearanceRatioMin": 0.55
    },
    "serverConfig": {
      "assetIds": {
        "revealContent": "fog_wipe.reveal_content",
        "fogDensity": "fog_wipe.fog_density",
        "dropletHeight": "fog_wipe.droplets_height",
        "frostedEdges": "fog_wipe.frosted_edges",
        "scratchMask": "fog_wipe.scratch_mask",
        "wetSmudgeMask": "fog_wipe.wet_smudge_mask",
        "glassReflections": "fog_wipe.glass_reflections"
      },
      "brushDiameterNorm": 0.12,
      "brushFeatherNorm": 0.28,
      "clearanceRatioMin": 0.55
    },
    "internalTitle": "Fog wipe",
    "familyId": "gesture",
    "categoryId": "gesture.fog_wipe",
    "difficulty": "medium",
    "instructionAr": "امسح الضباب بإصبعك حتى يظهر ما خلف الزجاج.",
    "eligibleModes": ["quick_survival", "private", "training", "dev"],
    "selectionWeight": 100,
    "repetitionCooldownRounds": 1,
    "minAppVersion": "0.0.0",
    "requiredCapabilities": [],
    "accessibilityFallbackKey": "challenge.fog_wipe.a11y_fallback",
    "requiredAssetIds": [
      "fog_wipe.reveal_content",
      "fog_wipe.fog_density",
      "fog_wipe.droplets_height",
      "fog_wipe.frosted_edges",
      "fog_wipe.scratch_mask",
      "fog_wipe.wet_smudge_mask",
      "fog_wipe.glass_reflections"
    ]
  }'::jsonb;

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid, v_tid, 1, 'published',
    v_def,
    md5('gesture.fog_wipe.v1'),
    'fog wipe seed',
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
    WHERE e->>'definitionId' = 'gesture.fog_wipe.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'gesture.fog_wipe.dev',
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
    'lh.fog_wipe.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.fog_wipe.v1',
      'entries', v_entries,
      'changelog', 'Add gesture.fog_wipe'
    ),
    'Add fog wipe challenge'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.fog_wipe.v1',
    '{"releaseId": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb22", "versionLabel": "lh.fog_wipe.v1", "locales": ["ar", "en"], "entries": {"ar": {"challenge.fog_wipe.intro": "امسح الضباب", "challenge.fog_wipe.prompt": "اسحب إصبعك لمسح الزجاج", "challenge.fog_wipe.footer": "اكشف ما خلف الضباب", "challenge.fog_wipe.a11y_fallback": "امسح الضباب بإصبعك", "result.fog_wipe.incomplete": "لم يُمسح بما يكفي", "engine.gesture.fog_wipe": "مسح الضباب"}, "en": {"challenge.fog_wipe.intro": "Wipe the fog", "challenge.fog_wipe.prompt": "Swipe to clear the glass", "challenge.fog_wipe.footer": "Reveal what is underneath", "challenge.fog_wipe.a11y_fallback": "Wipe the fog with your finger", "result.fog_wipe.incomplete": "Not cleared enough", "engine.gesture.fog_wipe": "Fog wipe"}}}'::jsonb,
    'Fog wipe localization'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('localization', v_loc_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;
