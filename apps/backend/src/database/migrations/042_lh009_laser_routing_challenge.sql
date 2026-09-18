-- Seed laser.routing into Studio templates + live challenge catalog.
DO $$
DECLARE
  v_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc42';
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd42';
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa42';
  v_loc_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb42';
  v_current_catalog jsonb;
  v_entries jsonb;
  v_current_loc jsonb;
  v_ar jsonb;
  v_en jsonb;
  v_client jsonb;
  v_server jsonb;
  v_def jsonb;
BEGIN
  INSERT INTO content_families (id, title) VALUES ('laser', 'Laser')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('laser.routing', 'laser', 'Laser Routing')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (
    v_tid,
    'laser.routing',
    'laser',
    'laser.routing',
    'Laser Routing',
    'published'
  )
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_tid
  FROM content_templates
  WHERE slug = 'laser.routing';

  v_client := '{
    "categoryKey": "challenge.category.precision",
    "titleKey": "challenge.laser.classic.title",
    "promptKey": "challenge.laser.classic.prompt",
    "footerKey": "challenge.laser.footer",
    "timeRemainingKey": "challenge.laser.time_remaining",
    "progressMirrorsKey": "challenge.laser.progress_mirrors",
    "progressGatesKey": "challenge.laser.progress_gates",
    "progressFusionKey": "challenge.laser.progress_fusion",
    "progressFusionPartialKey": "challenge.laser.progress_fusion_partial",
    "a11yFallbackKey": "challenge.laser.a11y_fallback",
    "variant": "classic",
    "startDelayMs": 800,
    "assetIds": {
      "laserLoopSfx": "laser_routing.laser_loop",
      "reflectionSfx": "laser_routing.reflection",
      "heartPowerOnSfx": "laser_routing.heart_power_on"
    }
  }'::jsonb;

  v_server := '{
    "variant": "classic",
    "variantWeights": {
      "classic": 25,
      "zigzag": 25,
      "dual_fusion": 25,
      "pulse_gates": 25
    },
    "gridWidth": 4,
    "gridHeight": 4,
    "startDelayMs": 800,
    "moveBudgetMs": 1800,
    "safetyMarginMs": 2000,
    "maxGenerationAttempts": 24,
    "minRequiredMoves": 2,
    "maxRequiredMoves": 5,
    "requireUniqueSolution": true,
    "avoidSingleMoveStart": true,
    "mirrorCount": 4,
    "difficulty": "medium",
    "assetIds": {
      "laserLoopSfx": "laser_routing.laser_loop",
      "reflectionSfx": "laser_routing.reflection",
      "heartPowerOnSfx": "laser_routing.heart_power_on"
    }
  }'::jsonb;

  v_def := jsonb_build_object(
    'definitionId', 'laser.routing.dev',
    'definitionVersion', 1,
    'engineId', 'laser.routing',
    'durationMs', 15000,
    'introDurationMs', 800,
    'resultHoldMs', 2000,
    'heartPenaltyOnFailure', 1,
    'energyRewardOnSuccess', 1,
    'promptKey', 'challenge.laser.classic.prompt',
    'choiceKeys', '[]'::jsonb,
    'clientConfig', v_client,
    'serverConfig', v_server,
    'internalTitle', 'Laser Routing',
    'familyId', 'laser',
    'categoryId', 'laser.routing',
    'difficulty', 'medium',
    'instructionAr', 'دوّر المرايا حتى يصل الضوء إلى القلب',
    'eligibleModes', '["quick_survival", "private", "training", "dev"]'::jsonb,
    'selectionWeight', 100,
    'repetitionCooldownRounds', 1,
    'minAppVersion', '0.0.0',
    'requiredCapabilities', '["touch"]'::jsonb,
    'accessibilityFallbackKey', 'challenge.laser.a11y_fallback',
    'requiredAssetIds', '["laser_routing.laser_loop","laser_routing.reflection","laser_routing.heart_power_on"]'::jsonb
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
    md5('laser.routing.v1'),
    'laser routing seed',
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
    WHERE e->>'definitionId' = 'laser.routing.dev'
  ) THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'laser.routing.dev',
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
    'lh.laser_routing.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.laser_routing.v1',
      'entries', v_entries,
      'changelog', 'Add laser.routing'
    ),
    'Add Laser Routing challenge'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload INTO v_current_loc
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'localization'
  LIMIT 1;

  v_ar := COALESCE(v_current_loc#>'{entries,ar}', '{}'::jsonb) || '{
    "challenge.laser.classic.title": "وجّه الشعاع",
    "challenge.laser.classic.prompt": "دوّر المرايا حتى يصل الضوء إلى القلب",
    "challenge.laser.zigzag.title": "المسار المتعرّج",
    "challenge.laser.zigzag.prompt": "دوّر المرايا الأربع حتى يصل الضوء إلى القلب",
    "challenge.laser.dual_fusion.title": "ادمج الطاقة",
    "challenge.laser.dual_fusion.prompt": "وجّه الشعاعين إلى الموحّد ثم إلى القلب",
    "challenge.laser.pulse_gates.title": "بوابات النبض",
    "challenge.laser.pulse_gates.prompt": "مرّر الضوء عبر البوابات الثلاث إلى القلب",
    "challenge.laser.footer": "أوصل الضوء إلى القلب",
    "challenge.laser.time_remaining": "الوقت المتبقي",
    "challenge.laser.progress_mirrors": "{correct} / {total} مرايا صحيحة",
    "challenge.laser.progress_gates": "{open} / {total} بوابات مفتوحة",
    "challenge.laser.progress_fusion": "مساران متصلان",
    "challenge.laser.progress_fusion_partial": "{count} / 2 مسارات",
    "challenge.laser.a11y_fallback": "دوّر المرايا لتوجيه الضوء إلى القلب",
    "challenge.laser.a11y_board": "لوحة توجيه الليزر",
    "challenge.laser.a11y_mirror": "مرآة {id}",
    "challenge.laser.a11y_gate": "بوابة {id}",
    "engine.laser.routing": "توجيه الليزر"
  }'::jsonb;

  v_en := COALESCE(v_current_loc#>'{entries,en}', '{}'::jsonb) || '{
    "challenge.laser.classic.title": "Guide the Beam",
    "challenge.laser.classic.prompt": "Rotate the mirrors until the light reaches the heart",
    "challenge.laser.zigzag.title": "The Zigzag Path",
    "challenge.laser.zigzag.prompt": "Rotate the four mirrors until the light reaches the heart",
    "challenge.laser.dual_fusion.title": "Fuse the Energy",
    "challenge.laser.dual_fusion.prompt": "Guide both beams into the combiner then to the heart",
    "challenge.laser.pulse_gates.title": "Pulse Gates",
    "challenge.laser.pulse_gates.prompt": "Pass the light through the three gates to the heart",
    "challenge.laser.footer": "Connect the light to the heart",
    "challenge.laser.time_remaining": "Time remaining",
    "challenge.laser.progress_mirrors": "{correct} / {total} mirrors correct",
    "challenge.laser.progress_gates": "{open} / {total} gates open",
    "challenge.laser.progress_fusion": "Two paths connected",
    "challenge.laser.progress_fusion_partial": "{count} / 2 paths",
    "challenge.laser.a11y_fallback": "Rotate mirrors to guide the light to the heart",
    "challenge.laser.a11y_board": "Laser routing board",
    "challenge.laser.a11y_mirror": "Mirror {id}",
    "challenge.laser.a11y_gate": "Gate {id}",
    "engine.laser.routing": "Laser routing"
  }'::jsonb;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.laser_routing.v1',
    jsonb_build_object(
      'releaseId', v_loc_release_id,
      'versionLabel', 'lh.laser_routing.v1',
      'locales', '["ar","en"]'::jsonb,
      'entries', jsonb_build_object('ar', v_ar, 'en', v_en)
    ),
    'Laser Routing localization'
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
