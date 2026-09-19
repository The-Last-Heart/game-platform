-- Fix Door of Truth catalog entry shape to use templateVersionId (playlist resolver).
DO $$
DECLARE
  v_vid uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd49';
  v_catalog_release_id uuid;
  v_payload jsonb;
  v_entries jsonb;
  v_fixed jsonb := '[]'::jsonb;
  v_el jsonb;
  v_found boolean := false;
BEGIN
  SELECT c.release_id, r.payload
  INTO v_catalog_release_id, v_payload
  FROM content_current_releases c
  JOIN content_releases r ON r.id = c.release_id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  IF v_catalog_release_id IS NULL THEN
    RETURN;
  END IF;

  v_entries := COALESCE(v_payload->'entries', '[]'::jsonb);

  FOR v_el IN SELECT * FROM jsonb_array_elements(v_entries)
  LOOP
    IF v_el->>'definitionId' = 'logic.three_doors.door_of_truth'
       OR v_el->>'templateVersionId' = v_vid::text
       OR v_el->>'versionId' = v_vid::text THEN
      v_found := true;
      v_fixed := v_fixed || jsonb_build_array(
        jsonb_build_object(
          'templateVersionId', v_vid,
          'definitionId', 'logic.three_doors.door_of_truth',
          'weight', 100,
          'repetitionCooldownRounds', 1,
          'paused', false
        )
      );
    ELSE
      v_fixed := v_fixed || jsonb_build_array(v_el);
    END IF;
  END LOOP;

  IF NOT v_found THEN
    v_fixed := v_fixed || jsonb_build_array(
      jsonb_build_object(
        'templateVersionId', v_vid,
        'definitionId', 'logic.three_doors.door_of_truth',
        'weight', 100,
        'repetitionCooldownRounds', 1,
        'paused', false
      )
    );
  END IF;

  UPDATE content_releases
  SET payload = jsonb_set(payload, '{entries}', v_fixed)
  WHERE id = v_catalog_release_id;
END $$;
