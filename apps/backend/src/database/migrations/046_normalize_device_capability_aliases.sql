-- Normalize Studio/seed device capability aliases onto the contract registry.
-- audio_output → audio_playback (Guess the Audio was dropped from live playlists
-- by filterPlaylistForAppVersion because audio_output is not a registered cap).
-- accelerometer/gyroscope → motion.
DO $$
DECLARE
  v_row record;
  v_caps jsonb;
  v_normalized jsonb;
  v_cap text;
  v_mapped text;
  v_changed boolean;
BEGIN
  FOR v_row IN
    SELECT id, definition
    FROM content_template_versions
    WHERE definition ? 'requiredCapabilities'
      AND jsonb_typeof(definition->'requiredCapabilities') = 'array'
      AND (
        definition->'requiredCapabilities' ? 'audio_output'
        OR definition->'requiredCapabilities' ? 'accelerometer'
        OR definition->'requiredCapabilities' ? 'gyroscope'
      )
  LOOP
    v_caps := v_row.definition->'requiredCapabilities';
    v_normalized := '[]'::jsonb;
    v_changed := false;

    FOR v_cap IN SELECT jsonb_array_elements_text(v_caps)
    LOOP
      v_mapped := CASE v_cap
        WHEN 'audio_output' THEN 'audio_playback'
        WHEN 'accelerometer' THEN 'motion'
        WHEN 'gyroscope' THEN 'motion'
        ELSE v_cap
      END;
      IF v_mapped IS DISTINCT FROM v_cap THEN
        v_changed := true;
      END IF;
      IF NOT (v_normalized ? v_mapped) THEN
        v_normalized := v_normalized || jsonb_build_array(v_mapped);
      END IF;
    END LOOP;

    IF v_changed THEN
      UPDATE content_template_versions
      SET definition = jsonb_set(definition, '{requiredCapabilities}', v_normalized)
      WHERE id = v_row.id;
    END IF;
  END LOOP;
END $$;
