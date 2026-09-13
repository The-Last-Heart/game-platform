'use client';

import Link from 'next/link';

type MetricCardProps = {
  href: string;
  value: number | string;
  label: string;
  description?: string;
};

export function MetricCard({ href, value, label, description }: MetricCardProps) {
  return (
    <Link href={href} className="studio-metric-card">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
      {description ? <span className="metric-desc">{description}</span> : null}
    </Link>
  );
}
