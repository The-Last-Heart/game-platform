import 'server-only';

/**
 * Server-only backend base URL. Must never be imported from client components.
 */
export function getBackendInternalUrl(): string {
  const raw = process.env.BACKEND_INTERNAL_URL?.trim();
  if (!raw) {
    throw new Error(
      'BACKEND_INTERNAL_URL is required for admin BFF routes (server-only)',
    );
  }
  return raw.replace(/\/$/, '');
}

export function buildBackendAdminUrl(pathSegments: string[]): string {
  const base = getBackendInternalUrl();
  const suffix = pathSegments.map(encodeURIComponent).join('/');
  return `${base}/api/admin/v1/${suffix}`;
}
