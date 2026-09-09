const en = {
  'app.title': 'The Last Heart — Administration',
  'app.description': 'Administration foundation for The Last Heart',
  'foundation.heading': 'Foundation status',
  'foundation.body':
    'Administration foundation is ready. Localization, locale routing, and document direction are active.',
  'language.switchToEnglish': 'Switch to English',
  'language.switchToArabic': 'التبديل إلى العربية',
  'language.current': 'Current language',
} as const;

export default en;
export type MessageKey = keyof typeof en;
