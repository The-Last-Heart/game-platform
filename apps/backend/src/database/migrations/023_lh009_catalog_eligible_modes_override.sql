-- LH-009: live per-mode eligibility override (Studio can toggle Training etc. without republish).
ALTER TABLE content_catalog_entry_overrides
  ADD COLUMN IF NOT EXISTS eligible_modes jsonb;

COMMENT ON COLUMN content_catalog_entry_overrides.eligible_modes IS
  'When non-null JSON array, replaces definition.eligibleModes for live playlist filtering. Null = use published definition.';
