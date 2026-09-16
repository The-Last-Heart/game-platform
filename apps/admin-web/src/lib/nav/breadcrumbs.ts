import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';

export type AdminBreadcrumb = {
  href: string;
  label: string;
};

/**
 * Builds the admin top-bar trail from the current path.
 * `entityLabels` maps locale-stripped paths (e.g. `/content/templates/{id}`)
 * to operator-facing names so IDs are not shown as crumbs.
 */
export function buildAdminBreadcrumbs(
  locale: Locale,
  pathname: string,
  entityLabels: Record<string, string> = {},
): AdminBreadcrumb[] {
  const bare = pathname.replace(/^\/(en|ar)/, '') || '/';
  const parts = bare.split('/').filter(Boolean);
  const crumbs: AdminBreadcrumb[] = [
    { href: `/${locale}/dashboard`, label: t(locale, 'nav.dashboard') },
  ];

  const keyMap: Record<string, string> = {
    '/administrators': t(locale, 'nav.administrators'),
    '/administrators/new': t(locale, 'admins.create'),
    '/audit-log': t(locale, 'nav.auditLog'),
    '/content': t(locale, 'nav.content'),
    '/content/library': t(locale, 'studio.nav.library'),
    '/content/templates': t(locale, 'studio.nav.library'),
    '/content/templates/new': t(locale, 'studio.nav.newChallenge'),
    '/content/catalog': t(locale, 'studio.nav.catalog'),
    '/content/localization': t(locale, 'studio.nav.localization'),
    '/content/powers': t(locale, 'studio.nav.powers'),
    '/content/modes': t(locale, 'studio.nav.modes'),
    '/content/rewards': t(locale, 'studio.nav.rewards'),
    '/content/analytics': t(locale, 'studio.nav.analytics'),
    '/content/ops': t(locale, 'studio.nav.ops'),
    '/content/preview': t(locale, 'studio.nav.preview'),
    '/system': t(locale, 'nav.system'),
    '/profile': t(locale, 'nav.profile'),
    '/profile/security': t(locale, 'nav.security'),
  };

  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    if (acc === '/dashboard') continue;
    const label =
      entityLabels[acc] ??
      keyMap[acc] ??
      (acc.startsWith('/administrators/')
        ? t(locale, 'admins.detailTitle')
        : /^\/content\/templates\/[^/]+\/edit$/.test(acc)
          ? t(locale, 'studio.detail.edit')
          : part);
    crumbs.push({ href: `/${locale}${acc}`, label });
  }

  return crumbs;
}
