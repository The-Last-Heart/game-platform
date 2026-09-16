-- Wire Pass the Pulse to the existing shared heartbeat asset (sfx.pulse).
-- Do NOT add a second copy of mixkit-human-single-heart-beat — it is already
-- content-pack asset sfx.pulse (identical bytes).
DO $$
DECLARE
  v_tid uuid;
  v_vid uuid;
BEGIN
  SELECT id INTO v_tid
  FROM content_templates
  WHERE slug = 'social.pass_the_pulse'
  LIMIT 1;

  IF v_tid IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_vid
  FROM content_template_versions
  WHERE template_id = v_tid
  ORDER BY version DESC
  LIMIT 1;

  IF v_vid IS NULL THEN
    RETURN;
  END IF;

  UPDATE content_template_versions
  SET definition = jsonb_set(
    jsonb_set(
      definition,
      '{clientConfig,pulseSfxAssetId}',
      '"sfx.pulse"'::jsonb,
      true
    ),
    '{requiredAssetIds}',
    '["sfx.pulse"]'::jsonb,
    true
  )
  WHERE id = v_vid;
END $$;
