'use client';

import type { ReactNode } from 'react';

type StudioPageHeaderProps = {
  title: string;
  subtitle?: string;
  sticky?: boolean;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
};

export function StudioPageHeader({
  title,
  subtitle,
  sticky,
  primaryAction,
  secondaryAction,
}: StudioPageHeaderProps) {
  return (
    <div className={`page-header${sticky ? ' studio-sticky-header' : ''}`}>
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {primaryAction || secondaryAction ? (
        <div className="inline-actions">
          {secondaryAction}
          {primaryAction}
        </div>
      ) : null}
    </div>
  );
}
