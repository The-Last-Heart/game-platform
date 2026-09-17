-- Widen ring_lock hit window for playable timing (tolerance + slower spins).
DO $$
DECLARE
  v_release_id uuid;
  v_payload jsonb;
  v_entries jsonb;
  v_def jsonb;
BEGIN
  -- Update published template definition if present.
  UPDATE content_template_versions
  SET definition = jsonb_set(
    jsonb_set(
      jsonb_set(
        definition,
        '{serverConfig,alignmentToleranceDeg}',
        '24'::jsonb,
        true
      ),
      '{serverConfig,minAngularVelocityDegPerSec}',
      '45'::jsonb,
      true
    ),
    '{serverConfig,maxAngularVelocityDegPerSec}',
    '90'::jsonb,
    true
  )
  WHERE definition->>'engineId' = 'precision.ring_lock'
     OR definition->>'definitionId' = 'precision.ring_lock.dev';

  -- Patch current challenge catalog entries in place.
  SELECT c.release_id, r.payload
  INTO v_release_id, v_payload
  FROM content_current_releases c
  JOIN content_releases r ON r.id = c.release_id
  WHERE c.kind = 'challenge_catalog'
  LIMIT 1;

  IF v_release_id IS NULL THEN
    RETURN;
  END IF;

  v_entries := COALESCE(v_payload->'entries', '[]'::jsonb);
  -- Entries may be lightweight refs (templateVersionId) or full defs.
  -- Full defs: patch serverConfig on matching engineId/definitionId.
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN (e->>'engineId' = 'precision.ring_lock'
         OR e->>'definitionId' = 'precision.ring_lock.dev')
           AND e ? 'serverConfig'
      THEN jsonb_set(
             jsonb_set(
               jsonb_set(
                 e,
                 '{serverConfig,alignmentToleranceDeg}',
                 '24'::jsonb,
                 true
               ),
               '{serverConfig,minAngularVelocityDegPerSec}',
               '45'::jsonb,
               true
             ),
             '{serverConfig,maxAngularVelocityDegPerSec}',
             '90'::jsonb,
             true
           )
      ELSE e
    END
  ), '[]'::jsonb)
  INTO v_entries
  FROM jsonb_array_elements(v_entries) e;

  UPDATE content_releases
  SET payload = jsonb_set(payload, '{entries}', v_entries)
  WHERE id = v_release_id;

  -- Also patch template-version payloads if the catalog stores full defs elsewhere.
  SELECT definition INTO v_def
  FROM content_template_versions
  WHERE definition->>'engineId' = 'precision.ring_lock'
  ORDER BY version DESC
  LIMIT 1;
END $$;
