-- LH-009: fog wipe swipe SFX content-pack asset on published definitions.
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
    WHERE t.slug = 'gesture.fog_wipe'
  LOOP
    v_client := COALESCE(r.definition->'clientConfig'->'assetIds', '{}'::jsonb);
    v_server := COALESCE(r.definition->'serverConfig'->'assetIds', '{}'::jsonb);
    v_client := jsonb_set(v_client, '{swipeSfx}', '"fog_wipe.swipe"'::jsonb, true);
    v_server := jsonb_set(v_server, '{swipeSfx}', '"fog_wipe.swipe"'::jsonb, true);

    v_required := COALESCE(r.definition->'requiredAssetIds', '[]'::jsonb);
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_required) x WHERE x = 'fog_wipe.swipe'
    ) THEN
      v_required := v_required || '"fog_wipe.swipe"'::jsonb;
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
