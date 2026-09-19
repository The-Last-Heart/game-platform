-- Pin Common Word looping background bed onto published trivia.common_word definitions.
UPDATE content_template_versions
SET definition = jsonb_set(
  jsonb_set(
    definition,
    '{requiredAssetIds}',
    (
      SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      FROM (
        SELECT DISTINCT x
        FROM (
          SELECT jsonb_array_elements_text(
            COALESCE(definition->'requiredAssetIds', '[]'::jsonb)
          ) AS x
          UNION ALL
          SELECT 'common_word.background'
        ) u
      ) d
    )
  ),
  '{clientConfig,backgroundSfxAssetId}',
  '"common_word.background"'::jsonb
)
WHERE definition->>'engineId' = 'trivia.common_word'
   OR definition->>'definitionId' = 'trivia.common_word.dev';
