-- LH-009: circuit rotation cable-connect + heart power-on content-pack SFX.
DO $$
DECLARE
  r record;
  v_client jsonb;
  v_server jsonb;
  v_required jsonb;
BEGIN
  FOR r IN
    SELECT tv.id, tv.definition
    FROM content_template_versions tv
    JOIN content_templates t ON t.id = tv.template_id
    WHERE t.slug = 'precision.circuit_rotation'
  LOOP
    v_client := COALESCE(r.definition->'clientConfig'->'assetIds', '{}'::jsonb);
    v_server := COALESCE(r.definition->'serverConfig'->'assetIds', '{}'::jsonb);
    v_client := jsonb_set(v_client, '{cableConnectSfx}', '"circuit_rotation.cable_connected"'::jsonb, true);
    v_client := jsonb_set(v_client, '{heartPowerOnSfx}', '"circuit_rotation.heart_power_on"'::jsonb, true);
    v_server := jsonb_set(v_server, '{cableConnectSfx}', '"circuit_rotation.cable_connected"'::jsonb, true);
    v_server := jsonb_set(v_server, '{heartPowerOnSfx}', '"circuit_rotation.heart_power_on"'::jsonb, true);

    v_required := COALESCE(r.definition->'requiredAssetIds', '[]'::jsonb);
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_required) x
      WHERE x = 'circuit_rotation.cable_connected'
    ) THEN
      v_required := v_required || '"circuit_rotation.cable_connected"'::jsonb;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_required) x
      WHERE x = 'circuit_rotation.heart_power_on'
    ) THEN
      v_required := v_required || '"circuit_rotation.heart_power_on"'::jsonb;
    END IF;

    UPDATE content_template_versions
    SET definition = jsonb_set(
      jsonb_set(
        jsonb_set(
          r.definition,
          '{clientConfig,assetIds}',
          v_client,
          true
        ),
        '{serverConfig,assetIds}',
        v_server,
        true
      ),
      '{requiredAssetIds}',
      v_required,
      true
    )
    WHERE id = r.id;
  END LOOP;
END $$;
