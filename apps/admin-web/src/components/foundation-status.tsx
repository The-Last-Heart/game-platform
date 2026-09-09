import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';

type FoundationStatusProps = {
  locale: Locale;
};

export function FoundationStatus({ locale }: FoundationStatusProps) {
  return (
    <section aria-labelledby="foundation-heading">
      <h2 id="foundation-heading">{t(locale, 'foundation.heading')}</h2>
      <p>{t(locale, 'foundation.body')}</p>
    </section>
  );
}
