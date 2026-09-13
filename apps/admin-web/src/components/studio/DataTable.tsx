'use client';

import type { ReactNode } from 'react';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel,
  selectable,
  selectedKeys,
  onSelectionChange,
}: DataTableProps<T>) {
  const allSelected = rows.length > 0 && selectedKeys?.size === rows.length;

  function toggleAll() {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(rows.map(rowKey)));
    }
  }

  function toggleRow(key: string) {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  }

  if (rows.length === 0 && emptyLabel) {
    return (
      <div className="empty-block">
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="panel table-wrap">
      <table className="studio-data-table">
        <thead>
          <tr>
            {selectable ? (
              <th style={{ width: '2.5rem' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                  style={{ accentColor: 'var(--lh-accent)' }}
                />
              </th>
            ) : null}
            {columns.map((col) => (
              <th key={col.key} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr key={key}>
                {selectable ? (
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedKeys?.has(key) ?? false}
                      onChange={() => toggleRow(key)}
                      aria-label={`Select ${key}`}
                      style={{ accentColor: 'var(--lh-accent)' }}
                    />
                  </td>
                ) : null}
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
