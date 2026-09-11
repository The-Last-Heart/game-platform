import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/components/auth/login-form';
import { LanguageSwitcher } from '@/components/language-switcher';
import { documentDirection } from '@/i18n/locale';
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
});
