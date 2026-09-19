-- Re-pin Guess the Audio to the seed template version whose clips ship in the
-- baked content-pack. Studio-uploaded ca_* assets were written into the
-- container filesystem and lost on backend recreate, so live rounds referenced
-- missing files (phones with a partial cache heard "some clips play").
DO $$
DECLARE
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa47';
  v_seed_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd39';
  v_current_catalog jsonb;
  v_entries jsonb := '[]'::jsonb;
  v_entry jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM content_template_versions WHERE id = v_seed_vid
  ) THEN
    RAISE NOTICE 'audio.multiple_choice seed version missing; skip re-pin';
    RETURN;
  END IF;

  SELECT payload INTO v_current_catalog
  FROM content_releases r
  JOIN content_current_releases c ON c.release_id = r.id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  IF v_current_catalog IS NULL THEN
    RETURN;
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(COALESCE(v_current_catalog->'entries', '[]'::jsonb))
  LOOP
    IF v_entry->>'definitionId' = 'audio.multiple_choice.dev' THEN
      v_entries := v_entries || jsonb_build_array(
        jsonb_build_object(
          'templateVersionId', v_seed_vid,
          'definitionId', 'audio.multiple_choice.dev',
          'weight', COALESCE((v_entry->>'weight')::int, 100),
          'repetitionCooldownRounds', COALESCE((v_entry->>'repetitionCooldownRounds')::int, 1),
          'paused', COALESCE((v_entry->>'paused')::boolean, false)
        )
      );
    ELSE
      v_entries := v_entries || jsonb_build_array(v_entry);
    END IF;
  END LOOP;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'lh.audio_mc.seed_repin.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.audio_mc.seed_repin.v1',
      'entries', v_entries,
      'changelog', 'Re-pin Guess the Audio to seed clips present in content-pack'
    ),
    'Re-pin audio.multiple_choice to seed pack assets'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind)
  DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;
