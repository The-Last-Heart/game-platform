import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/shell/admin-shell';
import { isLocale } from '@/i18n/locale';
import { requireAdminSession } from '@/lib/auth/session';
import { SIDEBAR_COOKIE_NAME, THEME_COOKIE_NAME } from '@/lib/bff/constants';
import { parseSidebar, parseTheme } from '@/lib/preferences/cookies';

export const dynamic = 'force-dynamic';

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function ProtectedLayout({
  children,
  params,
}: LayoutProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  const session = await requireAdminSession(rawLocale);
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE_NAME)?.value);
  const sidebar = parseSidebar(cookieStore.get(SIDEBAR_COOKIE_NAME)?.value);
  const environment =
    process.env.NEXT_PUBLIC_ADMIN_ENV?.trim() ||
    process.env.NODE_ENV ||
    'development';

  return (
    <AdminShell
      locale={rawLocale}
      session={session}
      environment={environment}
      initialTheme={theme}
      initialSidebar={sidebar}
    >
      {children}
    </AdminShell>
  );
}
