-- Operator preference: live matches use red/blue heart (wait_for_signal) only.
-- LH-007 engine templates remain in content_templates for Challenge Studio (LH-010);
-- they are simply not in the current catalog playlist.

DO $$
DECLARE
  v_catalog_release_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb06';
  v_wait_vid uuid;
  v_entry jsonb;
  v_entries jsonb := '[]'::jsonb;
  i int;
BEGIN
  SELECT ctv.id INTO v_wait_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'reaction.wait_for_signal' AND ctv.version = 1
  LIMIT 1;

  IF v_wait_vid IS NULL THEN
    RAISE EXCEPTION 'wait_for_signal template version not found';
  END IF;

  v_entry := jsonb_build_object(
    'templateVersionId', v_wait_vid,
    'definitionId', 'reaction.wait_for_signal.dev',
    'weight', 100,
    'repetitionCooldownRounds', 0,
    'paused', false
  );

  -- Six identical rounds so matches still last long enough for energy/power testing.
  FOR i IN 1..6 LOOP
    v_entries := v_entries || jsonb_build_array(v_entry);
  END LOOP;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'local.wait_for_signal_only.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'local.wait_for_signal_only.v1',
      'entries', v_entries,
      'changelog', 'Local testing: red/blue heart only until Challenge Studio'
    ),
    'Local testing: red/blue heart only until Challenge Studio'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id;
END $$;
