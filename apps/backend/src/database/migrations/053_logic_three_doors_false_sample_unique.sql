-- Fix Door of Truth "exactly one false" sample: prior seed was multi-solution
-- (B and C both valid) so Studio publish rejected the bank.
UPDATE content_template_versions
SET definition = jsonb_set(
  definition,
  '{serverConfig,questions}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN q->>'questionId' = 'three_doors.q.exactly_one_false_sample'
        THEN q
          || jsonb_build_object(
            'correctDoorId', 'A',
            'truthRule', 'exactly_one_false',
            'statements', '[
              {"doorId":"A","predicate":{"kind":"is_here"}},
              {"doorId":"B","predicate":{"kind":"is_not_here"}},
              {"doorId":"C","predicate":{"kind":"is","doorId":"B"}}
            ]'::jsonb
          )
        ELSE q
      END
      ORDER BY ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(definition->'serverConfig'->'questions', '[]'::jsonb))
      WITH ORDINALITY AS t(q, ord)
  )
)
WHERE definition->>'engineId' = 'logic.three_doors'
   OR definition->>'definitionId' IN (
     'logic.three_doors.door_of_truth',
     'logic.three_doors.dev'
   );
