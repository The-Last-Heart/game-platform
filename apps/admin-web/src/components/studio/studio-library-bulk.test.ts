import { describe, expect, it } from 'vitest';
import {
  partitionBulkLifecycleSelection,
  type BulkLifecycleItem,
} from './studio-library-bulk';

const items: BulkLifecycleItem[] = [
  { templateId: 'a', status: 'published', internalTitle: 'A' },
  { templateId: 'b', status: 'paused', internalTitle: 'B' },
  { templateId: 'c', status: 'draft', internalTitle: 'C' },
  { templateId: 'd', status: 'approved', internalTitle: 'D' },
  { templateId: 'e', status: 'retired', internalTitle: 'E' },
];

describe('partitionBulkLifecycleSelection', () => {
  it('pauses published and approved, skips drafts/paused/retired', () => {
    const selected = new Set(['a', 'b', 'c', 'd', 'e']);
    const { eligible, skipped } = partitionBulkLifecycleSelection(
      items,
      selected,
      true,
    );
    expect(eligible.map((i) => i.templateId)).toEqual(['a', 'd']);
    expect(skipped.map((i) => i.templateId)).toEqual(['b', 'c', 'e']);
  });

  it('resumes only paused items', () => {
    const selected = new Set(['a', 'b', 'c']);
    const { eligible, skipped } = partitionBulkLifecycleSelection(
      items,
      selected,
      false,
    );
    expect(eligible.map((i) => i.templateId)).toEqual(['b']);
    expect(skipped.map((i) => i.templateId)).toEqual(['a', 'c']);
  });

  it('ignores unselected rows', () => {
    const { eligible, skipped } = partitionBulkLifecycleSelection(
      items,
      new Set(['c']),
      true,
    );
    expect(eligible).toEqual([]);
    expect(skipped.map((i) => i.templateId)).toEqual(['c']);
  });
});
