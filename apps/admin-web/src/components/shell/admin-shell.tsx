'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Server,
  Shield,
  User,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  LanguageSwitcher,
  SidebarToggle,
  ThemeToggle,
} from '@/components/language-switcher';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { t } from '@/i18n/get-dictionary';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import type { Locale } from '@/i18n/locale';
import { adminApiFetch } from '@/lib/api/client';
import type { AdminSessionSnapshot } from '@/lib/auth/session';
import type { SidebarPreference, ThemePreference } from '@/lib/bff/constants';
import { buildAdminBreadcrumbs } from '@/lib/nav/breadcrumbs';
import {
  filterNavItems,
  navItemIsActive,
  type NavItemId,
} from '@/lib/nav/items';
import {
  BreadcrumbLabelProvider,
  useBreadcrumbLabels,
} from './breadcrumb-labels';

const ICONS: Record<NavItemId, ReactNode> = {
  dashboard: <LayoutDashboard size={18} aria-hidden />,
  administrators: <Users size={18} aria-hidden />,
  'audit-log': <ClipboardList size={18} aria-hidden />,
  content: <ClipboardList size={18} aria-hidden />,
  system: <Server size={18} aria-hidden />,
  profile: <User size={18} aria-hidden />,
  'profile-security': <Shield size={18} aria-hidden />,
};

function Breadcrumbs({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? `/${locale}`;
  const entityLabels = useBreadcrumbLabels();
  const crumbs = buildAdminBreadcrumbs(locale, pathname, entityLabels);

  return (
    <nav className="breadcrumbs" aria-label={t(locale, 'shell.breadcrumbs')}>
      <ol>
        {crumbs.map((crumb) => (
          <li key={crumb.href}>
            <Link href={crumb.href} title={crumb.label}>
              {crumb.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ShellInner({
  locale,
  session,
  environment,
  initialTheme,
  initialSidebar,
  children,
}: {
  locale: Locale;
  session: AdminSessionSnapshot;
  environment: string;
  initialTheme: ThemePreference;
  initialSidebar: SidebarPreference;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? `/${locale}`;
  const router = useRouter();
  const { pushToast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const items = useMemo(
    () => filterNavItems(session.user.permissions),
    [session.user.permissions],
  );
  const mainItems = items.filter((item) => item.group === 'main');
  const accountItems = items.filter((item) => item.group === 'account');

  async function logout() {
    setLoggingOut(true);
    const result = await adminApiFetch('/auth/logout', { method: 'POST' });
    setLoggingOut(false);
    setLogoutConfirm(false);
    if (!result.ok) {
      pushToast(
        localizeAdminError(locale, result.error.code, result.error.message),
        'error',
      );
      return;
    }
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  return (
    <div
      className="admin-shell"
      data-mobile-nav={mobileOpen ? 'open' : 'closed'}
    >
      {mobileOpen ? (
        <button
          type="button"
          className="mobile-drawer-backdrop"
          aria-label={t(locale, 'nav.closeMenu')}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside className="sidebar" aria-label={t(locale, 'nav.main')}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-name">
            {t(locale, 'app.productName')}
          </div>
          <div className="sidebar-brand-ar">
            {t(locale, 'app.productNameAr')}
          </div>
          <span className="env-badge" title={t(locale, 'app.environment')}>
            {environment}
          </span>
        </div>

        <div className="nav-group">
          <div className="nav-group-label">{t(locale, 'nav.main')}</div>
          {mainItems.map((item) => (
            <Link
              key={item.id}
              href={`/${locale}${item.href}`}
              className="nav-link"
              aria-current={
                navItemIsActive(pathname, item.href) ? 'page' : undefined
              }
              onClick={() => setMobileOpen(false)}
            >
              {ICONS[item.id]}
              <span className="nav-label">{t(locale, item.labelKey)}</span>
            </Link>
          ))}
        </div>

        <div className="nav-group" style={{ marginTop: 'auto' }}>
          <div className="nav-group-label">{t(locale, 'nav.account')}</div>
          {accountItems.map((item) => (
            <Link
              key={item.id}
              href={`/${locale}${item.href}`}
              className="nav-link"
              aria-current={
                navItemIsActive(pathname, item.href) ? 'page' : undefined
              }
              onClick={() => setMobileOpen(false)}
            >
              {ICONS[item.id]}
              <span className="nav-label">{t(locale, item.labelKey)}</span>
            </Link>
          ))}
        </div>

        <SidebarToggle locale={locale} initialSidebar={initialSidebar} />
      </aside>

      <div className="shell-main">
        <header className="topbar" aria-label={t(locale, 'shell.topBar')}>
          <div className="inline-actions">
            <button
              type="button"
              className="btn btn-secondary sidebar-toggle-mobile"
              aria-label={t(locale, 'nav.openMenu')}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={18} />
            </button>
            <Breadcrumbs locale={locale} />
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher locale={locale} />
            <ThemeToggle locale={locale} initialTheme={initialTheme} />
            <div className="admin-menu">
              <button
                type="button"
                className="btn btn-secondary"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label={t(locale, 'shell.adminMenu')}
                onClick={() => setMenuOpen((open) => !open)}
              >
                {session.user.displayName}
                {menuOpen ? <X size={14} /> : null}
              </button>
              {menuOpen ? (
                <div className="admin-menu-panel" role="menu">
                  <Link
                    href={`/${locale}/profile`}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t(locale, 'nav.profile')}
                  </Link>
                  <Link
                    href={`/${locale}/profile/security`}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t(locale, 'nav.security')}
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setLogoutConfirm(true);
                    }}
                  >
                    <span className="inline-actions">
                      <LogOut size={14} />
                      {loggingOut
                        ? t(locale, 'auth.loggingOut')
                        : t(locale, 'auth.logout')}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main id="main-content" className="content">
          {children}
        </main>
      </div>

      <ConfirmDialog
        locale={locale}
        open={logoutConfirm}
        message={t(locale, 'auth.logout')}
        danger
        onCancel={() => setLogoutConfirm(false)}
        onConfirm={() => {
          void logout();
        }}
      />
    </div>
  );
}

export function AdminShell(props: {
  locale: Locale;
  session: AdminSessionSnapshot;
  environment: string;
  initialTheme: ThemePreference;
  initialSidebar: SidebarPreference;
  children: ReactNode;
}) {
  return (
    <ToastProvider locale={props.locale}>
      <BreadcrumbLabelProvider>
        <a className="skip-link" href="#main-content">
          {t(props.locale, 'nav.skipToContent')}
        </a>
        <ShellInner {...props} />
      </BreadcrumbLabelProvider>
    </ToastProvider>
  );
}
