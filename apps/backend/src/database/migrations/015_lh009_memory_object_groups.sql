-- LH-009: memory sequence uses object groups + length-4 recall.
UPDATE content_template_versions AS ctv
SET definition = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              definition,
              '{clientConfig,previewMs}',
              '4000'::jsonb,
              true
            ),
            '{serverConfig,previewMs}',
            '4000'::jsonb,
            true
          ),
          '{clientConfig,optionKeys}',
          '["memory.glyph.circle","memory.glyph.triangle","memory.glyph.square","memory.glyph.diamond"]'::jsonb,
          true
        ),
        '{serverConfig,optionKeys}',
        '["memory.glyph.circle","memory.glyph.triangle","memory.glyph.square","memory.glyph.diamond"]'::jsonb,
        true
      ),
      '{serverConfig,sequence}',
      '["memory.glyph.circle","memory.glyph.triangle","memory.glyph.square","memory.glyph.diamond"]'::jsonb,
      true
    ),
    '{serverConfig,optionCount}',
    '4'::jsonb,
    true
  ),
  '{serverConfig,sequenceLength}',
  '4'::jsonb,
  true
)
FROM content_templates AS ct
WHERE ctv.template_id = ct.id
  AND ct.slug = 'memory.sequence';

UPDATE content_template_versions AS ctv
SET definition = jsonb_set(
  definition,
  '{serverConfig,objectGroups}',
  '[
    {
      "groupId": "shapes",
      "keys": [
        "memory.glyph.circle",
        "memory.glyph.triangle",
        "memory.glyph.square",
        "memory.glyph.diamond",
        "memory.glyph.hexagon",
        "memory.glyph.pentagon"
      ]
    },
    {
      "groupId": "symbols",
      "keys": [
        "memory.glyph.heart",
        "memory.glyph.star",
        "memory.glyph.bolt",
        "memory.glyph.moon",
        "memory.glyph.sun",
        "memory.glyph.cloud"
      ]
    },
    {
      "groupId": "marks",
      "keys": [
        "memory.glyph.cross",
        "memory.glyph.plus",
        "memory.glyph.ring",
        "memory.glyph.arrow",
        "memory.glyph.check",
        "memory.glyph.crescent"
      ]
    }
  ]'::jsonb,
  true
)
FROM content_templates AS ct
WHERE ctv.template_id = ct.id
  AND ct.slug = 'memory.sequence';
