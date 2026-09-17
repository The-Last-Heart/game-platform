'use client';

import { useEffect, useState } from 'react';

const IMAGE_TYPES = new Set([
  'image/png',
  'image/webp',
  'image/jpeg',
  'image/jpg',
  'image/gif',
]);

type AssetThumbProps = {
  assetId: string;
  contentType?: string;
  label?: string;
  size?: number;
  /** When false, only the image/chip is shown (caller owns the caption). */
  showCaption?: boolean;
};

/**
 * Renders a content-pack asset thumbnail via the authenticated admin BFF.
 * Non-image assets show a compact id chip.
 */
export function AssetThumb({
  assetId,
  contentType,
  label,
  size = 72,
  showCaption = true,
}: AssetThumbProps) {
  const [failed, setFailed] = useState(false);
  const isImage =
    (contentType != null && IMAGE_TYPES.has(contentType.toLowerCase())) ||
    /\.(png|webp|jpe?g|gif)$/i.test(assetId) ||
    contentType == null;

  useEffect(() => {
    setFailed(false);
  }, [assetId]);

  if (!assetId) {
    return null;
  }

  if (!isImage || failed) {
    return (
      <div
        title={label ?? assetId}
        style={{
          width: size,
          minHeight: size,
          borderRadius: 8,
          border: '1px solid var(--lh-border)',
          background: 'var(--lh-surface-2, #1a1a1a)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6,
          fontSize: 10,
          textAlign: 'center',
          wordBreak: 'break-all',
          color: 'var(--lh-text-muted)',
        }}
      >
        {label ?? assetId}
      </div>
    );
  }

  return (
    <figure style={{ margin: 0, width: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/admin/v1/content/pack/assets/${encodeURIComponent(assetId)}`}
        alt={label ?? assetId}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: 8,
          border: '1px solid var(--lh-border)',
          background: '#0d1117',
          display: 'block',
        }}
      />
      {showCaption ? (
        <figcaption
          style={{
            marginTop: 4,
            fontSize: 10,
            color: 'var(--lh-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={assetId}
        >
          {label ?? assetId}
        </figcaption>
      ) : null}
    </figure>
  );
}

function collectFromConfig(ids: Set<string>, config: Record<string, unknown> | undefined) {
  if (!config) return;

  const singular = config['assetId'];
  if (typeof singular === 'string' && singular.trim()) {
    ids.add(singular.trim());
  }

  const assetIds = config['assetIds'];
  if (assetIds && typeof assetIds === 'object' && !Array.isArray(assetIds)) {
    for (const value of Object.values(assetIds as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) {
        ids.add(value.trim());
      }
    }
  }

  const variants = config['revealContentVariants'];
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (typeof v === 'string' && v.trim()) ids.add(v.trim());
    }
  }
}

export function collectImageAssetIds(
  clientConfig: Record<string, unknown> | undefined,
  requiredAssetIds: string[] = [],
  serverConfig?: Record<string, unknown>,
): string[] {
  const ids = new Set<string>();
  for (const id of requiredAssetIds) {
    if (id.trim()) ids.add(id.trim());
  }
  collectFromConfig(ids, clientConfig);
  collectFromConfig(ids, serverConfig);
  return [...ids].filter((id) => !isNonImageAssetId(id));
}

function isNonImageAssetId(id: string): boolean {
  return (
    id.startsWith('ca_') ||
    id.startsWith('cv_') ||
    /\.(mp3|wav|json|bin)$/i.test(id)
  );
}
