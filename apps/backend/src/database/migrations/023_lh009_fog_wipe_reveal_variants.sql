-- LH-009: fog wipe per-seat reveal image variants (content-pack assets).
-- UUIDs must not collide with 022 circuit rotation (…cc27 / …dd27 / …aa23).
DO $$
DECLARE
  v_tid uuid;
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd29';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa25';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_def jsonb;
BEGIN
  SELECT id INTO v_tid FROM content_templates WHERE slug = 'gesture.fog_wipe';
  IF v_tid IS NULL THEN
    RAISE EXCEPTION 'gesture.fog_wipe template missing';
  END IF;

  v_def := '{
    "definitionId": "gesture.fog_wipe.dev",
    "definitionVersion": 2,
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
        "revealContent": "fog_wipe.reveal.petsev",
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
        "revealContent": "fog_wipe.reveal.petsev",
        "fogDensity": "fog_wipe.fog_density",
        "dropletHeight": "fog_wipe.droplets_height",
        "frostedEdges": "fog_wipe.frosted_edges",
        "scratchMask": "fog_wipe.scratch_mask",
        "wetSmudgeMask": "fog_wipe.wet_smudge_mask",
        "glassReflections": "fog_wipe.glass_reflections"
      },
      "revealContentVariants": [
        "fog_wipe.reveal.petsev",
        "fog_wipe.reveal.gta_vi",
        "fog_wipe.reveal.snowman",
        "fog_wipe.reveal.cucumber",
        "fog_wipe.reveal.wrap",
        "fog_wipe.reveal.watermelon"
      ],
      "brushDiameterNorm": 0.12,
      "brushFeatherNorm": 0.28,
      "clearanceRatioMin": 0.55
    },
    "difficulty": "medium",
    "familyId": "gesture",
    "categoryId": "gesture.fog_wipe",
    "eligibleModes": ["quick_survival", "private", "training", "dev"],
    "instructionAr": "امسح الضباب بإصبعك حتى يظهر ما خلف الزجاج.",
    "internalTitle": "Fog wipe",
    "minAppVersion": "0.0.0",
    "selectionWeight": 100,
    "requiredAssetIds": [
      "fog_wipe.reveal.petsev",
      "fog_wipe.reveal.gta_vi",
      "fog_wipe.reveal.snowman",
      "fog_wipe.reveal.cucumber",
      "fog_wipe.reveal.wrap",
      "fog_wipe.reveal.watermelon",
      "fog_wipe.fog_density",
      "fog_wipe.droplets_height",
      "fog_wipe.frosted_edges",
      "fog_wipe.scratch_mask",
      "fog_wipe.wet_smudge_mask",
      "fog_wipe.glass_reflections"
    ],
    "requiredCapabilities": [],
    "accessibilityFallbackKey": "challenge.fog_wipe.a11y_fallback",
    "repetitionCooldownRounds": 1
  }'::jsonb;

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    v_vid,
    v_tid,
    2,
    'published',
    v_def,
    md5('gesture.fog_wipe.v2.reveal_variants'),
    'fog wipe reveal variants',
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET definition = EXCLUDED.definition,
        status = 'published',
        validation_hash = EXCLUDED.validation_hash,
        validation_notes = EXCLUDED.validation_notes,
        approved_at = EXCLUDED.approved_at;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  IF v_current_catalog IS NULL THEN
    RAISE EXCEPTION 'current challenge_catalog release missing';
  END IF;

  v_entries := COALESCE(v_current_catalog->'entries', '[]'::jsonb);

  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO v_entries
  FROM jsonb_array_elements(v_entries) e
  WHERE COALESCE(e->>'definitionId', '') <> 'gesture.fog_wipe.dev';

  v_entries := v_entries || jsonb_build_array(
    jsonb_build_object(
      'definitionId', 'gesture.fog_wipe.dev',
      'templateVersionId', v_vid,
      'weight', 100,
      'paused', false,
      'repetitionCooldownRounds', 1
    )
  );

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'lh.fog_wipe.reveal_variants.v2',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.fog_wipe.reveal_variants.v2',
      'entries', v_entries,
      'changelog', 'Fog wipe per-seat reveal image variants'
    ),
    'Fog wipe reveal variants'
  )
  ON CONFLICT (id) DO UPDATE
    SET payload = EXCLUDED.payload,
        version_label = EXCLUDED.version_label,
        changelog = EXCLUDED.changelog;

  INSERT INTO content_current_releases (kind, release_id, updated_at)
  VALUES ('challenge_catalog', v_catalog_release_id, now())
  ON CONFLICT (kind) DO UPDATE
    SET release_id = EXCLUDED.release_id,
        updated_at = now();
END $$;
