/**
 * Catalog playlist entry identity is definitionId. Version pins are
 * templateVersionId — swapping that id is how an approved revision goes live.
 */
export type CatalogPlaylistEntry = {
  templateVersionId: string;
  definitionId: string;
  weight: number;
  repetitionCooldownRounds: number;
  roundMin?: number;
  roundMax?: number;
  paused?: boolean;
};

/**
 * Operator-facing Studio status is the live gate. A catalog snapshot can still
 * list a challenge after it is paused, revised, or left as approved-only.
 */
export function isLiveCatalogEntry(input: {
  entryPaused?: boolean;
  templateStatus: string | null | undefined;
}): boolean {
  if (input.entryPaused === true) {
    return false;
  }
  return input.templateStatus === 'published';
}

export function pinApprovedVersionInCatalog(
  entries: CatalogPlaylistEntry[],
  next: CatalogPlaylistEntry,
  options?: { appendIfMissing?: boolean },
): { entries: CatalogPlaylistEntry[]; changed: boolean; replaced: boolean } {
  const index = entries.findIndex(
    (entry) => entry.definitionId === next.definitionId,
  );
  if (index >= 0) {
    const current = entries[index]!;
    if (current.templateVersionId === next.templateVersionId) {
      return { entries, changed: false, replaced: true };
    }
    const copy = [...entries];
    copy[index] = {
      ...current,
      templateVersionId: next.templateVersionId,
    };
    return { entries: copy, changed: true, replaced: true };
  }
  if (options?.appendIfMissing === true) {
    return { entries: [...entries, next], changed: true, replaced: false };
  }
  return { entries, changed: false, replaced: false };
}
