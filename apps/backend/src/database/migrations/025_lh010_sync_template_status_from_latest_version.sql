-- Repair template rows left on 'published' after a revise→submit of a pack
-- challenge (submit previously refused to flip published → submitted).
UPDATE content_templates t
SET status = lv.status,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (v.template_id)
         v.template_id,
         v.status
  FROM content_template_versions v
  ORDER BY v.template_id, v.version DESC
) lv
WHERE t.id = lv.template_id
  AND t.status <> 'retired'
  AND t.status IS DISTINCT FROM lv.status
  AND lv.status IN ('draft', 'submitted', 'in_review', 'approved');
