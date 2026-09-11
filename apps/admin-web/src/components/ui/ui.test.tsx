import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/components/auth/login-form';
import {
  LanguageSwitcher,
  SidebarToggle,
  ThemeToggle,
} from '@/components/language-switcher';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { documentDirection } from '@/i18n/locale';
import { localizeAdminError } from '@/i18n/localize-admin-error';
import ar from '@/i18n/messages/ar';
import en from '@/i18n/messages/en';
import { filterNavItems } from '@/lib/nav/items';
import { preferenceBootstrapScript } from '@/lib/preferences/cookies';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/en/dashboard',
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('admin-web UI behaviors', () => {
  it('shows English login validation messages', async () => {
    const user = userEvent.setup();
    render(<LoginForm locale="en" />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });

  it('maps Arabic document direction to rtl', () => {
    expect(documentDirection('ar')).toBe('rtl');
    expect(documentDirection('en')).toBe('ltr');
  });

  it('applies rtl on the document when switching to Arabic', async () => {
    const user = userEvent.setup();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    render(<LanguageSwitcher locale="en" currentPath="/en/dashboard" />);
    await user.click(screen.getByRole('link', { name: 'التبديل إلى العربية' }));
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('preserves page path when switching language', () => {
    render(
      <LanguageSwitcher locale="en" currentPath="/en/administrators/new" />,
    );
    const link = screen.getByRole('link', { name: 'التبديل إلى العربية' });
    expect(link).toHaveAttribute('href', '/ar/administrators/new');
  });

  it('filters nav by permissions for non-super roles', () => {
    const items = filterNavItems(['dashboard:read']);
    expect(items.map((item) => item.id)).not.toContain('administrators');
    expect(items.map((item) => item.id)).toContain('dashboard');
  });

  it('keeps theme/sidebar bootstrap script free of hydration-prone defaults only', () => {
    const script = preferenceBootstrapScript();
    expect(script.startsWith('(function(){')).toBe(true);
    expect(script).toContain("t='light'");
    expect(script).toContain("s='expanded'");
  });

  it('keeps en/ar message catalogs in sync for batch keys', () => {
    const enKeys = Object.keys(en).sort();
    const arKeys = Object.keys(ar).sort();
    expect(arKeys).toEqual(enKeys);
    expect(en['admins.revokeSessions']).toBeTruthy();
    expect(ar['admins.revokeSessions']).toBeTruthy();
    expect(en['profile.updateDisplayName']).toBeTruthy();
    expect(ar['profile.updateDisplayName']).toBeTruthy();
    expect(en['dashboard.col.phase']).toBe('Phase');
    expect(ar['dashboard.col.phase']).toBe('المرحلة');
    expect(en['dashboard.col.presence']).toBe('Presence');
    expect(ar['dashboard.col.presence']).toBe('الحضور');
    expect(en['dashboard.phase.lobby']).toBeTruthy();
    expect(ar['dashboard.phase.lobby']).not.toBe(en['dashboard.phase.lobby']);
    expect(en['dashboard.presence.connected']).toBeTruthy();
    expect(ar['dashboard.presence.connected']).not.toBe(
      en['dashboard.presence.connected'],
    );
    expect(en['system.col.name']).toBe('Name');
    expect(ar['system.col.name']).toBe('الاسم');
    expect(localizeAdminError('ar', 'FORBIDDEN')).toBe(ar['errors.FORBIDDEN']);
    expect(localizeAdminError('ar', 'FORBIDDEN')).not.toBe(
      en['errors.FORBIDDEN'],
    );
  });

  it('updates theme icon, text, and aria-label across two consecutive toggles', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'light';
    render(<ThemeToggle locale="en" initialTheme="light" />);

    const first = screen.getByRole('button', { name: en['theme.dark'] });
    expect(first).toHaveAccessibleName(en['theme.dark']);
    expect(first.querySelector('svg')).toBeTruthy();
    await user.click(first);

    const second = screen.getByRole('button', { name: en['theme.light'] });
    expect(second).toHaveAccessibleName(en['theme.light']);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(second);

    const third = screen.getByRole('button', { name: en['theme.dark'] });
    expect(third).toHaveAccessibleName(en['theme.dark']);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('updates sidebar icon, text, and aria-label across two consecutive toggles', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.sidebar = 'expanded';
    render(<SidebarToggle locale="en" initialSidebar="expanded" />);

    const first = screen.getByRole('button', { name: en['nav.collapse'] });
    expect(first).toHaveAccessibleName(en['nav.collapse']);
    await user.click(first);

    const second = screen.getByRole('button', { name: en['nav.expand'] });
    expect(second).toHaveAccessibleName(en['nav.expand']);
    expect(document.documentElement.dataset.sidebar).toBe('collapsed');
    await user.click(second);

    const third = screen.getByRole('button', { name: en['nav.collapse'] });
    expect(third).toHaveAccessibleName(en['nav.collapse']);
    expect(document.documentElement.dataset.sidebar).toBe('expanded');
  });

  it('disables confirm actions while busy and ignores duplicate confirms', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        locale="en"
        open
        message="Dangerous action"
        danger
        busy
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const confirm = screen.getByRole('button', { name: /working/i });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('traps focus, supports Escape cancel, and restores opener focus', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button">Opener</button>
          <ConfirmDialog
            locale="en"
            open={open}
            title="Confirm logout"
            message="Sign out of the administration console?"
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    expect(opener).toHaveFocus();

    rerender(<Harness open />);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
    expect(screen.getByText('Confirm logout')).toBeInTheDocument();
    expect(
      screen.getByText('Sign out of the administration console?'),
    ).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: en['common.confirm'] });
    const cancel = screen.getByRole('button', { name: en['common.cancel'] });
    expect(confirm).toHaveFocus();

    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} />);
    expect(opener).toHaveFocus();
  });
});
