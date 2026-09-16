import type { ContentLifecycleStatus } from '@thelastheart/contracts';

export const BULK_PAUSE_STATUSES: ReadonlySet<ContentLifecycleStatus> = new Set(
  ['published', 'approved', 'scheduled'],
);

export const BULK_RESUME_STATUSES: ReadonlySet<ContentLifecycleStatus> =
  new Set(['paused']);

export type BulkLifecycleItem = {
  templateId: string;
  status: ContentLifecycleStatus;
  internalTitle: string;
};

export function partitionBulkLifecycleSelection<T extends BulkLifecycleItem>(
  items: T[],
  selectedIds: Set<string>,
  paused: boolean,
): { eligible: T[]; skipped: T[] } {
  const eligible: T[] = [];
  const skipped: T[] = [];
  const allowed = paused ? BULK_PAUSE_STATUSES : BULK_RESUME_STATUSES;
  for (const item of items) {
    if (!selectedIds.has(item.templateId)) {
      continue;
    }
    if (allowed.has(item.status)) {
      eligible.push(item);
    } else {
      skipped.push(item);
    }
  }
  return { eligible, skipped };
}
