import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/locale';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/** `/content/templates` is not a list page — library owns the index. */
export default async function TemplatesIndexPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  redirect(`/${rawLocale}/content/library`);
}
