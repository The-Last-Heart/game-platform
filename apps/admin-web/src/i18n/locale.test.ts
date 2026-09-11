import { describe, expect, it } from 'vitest';
import { getDictionary, t } from './get-dictionary';
import type { MessageKey } from './messages/en';
import ar from './messages/ar';
import en from './messages/en';
import {
  defaultLocale,
  documentDirection,
  documentLang,
  localizePath,
  resolveRootLocale,
  stripLocalePrefix,
} from './locale';

const locales = ['en', 'ar'] as const;

describe('admin localization foundation', () => {
  it('defaults English on first visit without cookie', () => {
    expect(resolveRootLocale(undefined)).toBe(defaultLocale);
    expect(resolveRootLocale(undefined)).toBe('en');
    expect(documentLang('en')).toBe('en');
    expect(documentDirection('en')).toBe('ltr');
  });

  it('maps Arabic to lang=ar and dir=rtl', () => {
    expect(documentLang('ar')).toBe('ar');
    expect(documentDirection('ar')).toBe('rtl');
    expect(resolveRootLocale('ar')).toBe('ar');
  });

  it('does not treat browser-like values as locale without explicit cookie', () => {
    expect(resolveRootLocale('fr')).toBe('en');
    expect(resolveRootLocale('ar-SA')).toBe('en');
  });

  it('preserves equivalent paths when switching locales', () => {
    expect(stripLocalePrefix('/en')).toBe('/');
    expect(stripLocalePrefix('/ar')).toBe('/');
    expect(localizePath('/en', 'ar')).toBe('/ar');
    expect(localizePath('/ar', 'en')).toBe('/en');
    expect(localizePath('/en/dashboard', 'ar')).toBe('/ar/dashboard');
    expect(localizePath('/en/administrators/new', 'ar')).toBe(
      '/ar/administrators/new',
    );
  });

  it('returns required English and Arabic product copy', () => {
    expect(t('en', 'app.title')).toBe('The Last Heart — Administration');
    expect(t('en', 'app.productName')).toBe('The Last Heart');
    expect(t('ar', 'app.title')).toBe('آخر قلب — لوحة الإدارة');
    expect(t('ar', 'app.productNameAr')).toBe('آخر قلب');
  });

  it('localizes metadata strings per locale', () => {
    expect(t('en', 'app.description')).toContain('Administration');
    expect(t('ar', 'app.description')).toContain('آخر قلب');
  });

  it('falls back to English for invalid locale cookie values', () => {
    expect(resolveRootLocale('invalid')).toBe('en');
    expect(resolveRootLocale('')).toBe('en');
    expect(resolveRootLocale('EN')).toBe('en');
  });

  it('fails clearly in development when a translation key is missing', () => {
    expect(() => t('en', 'does.not.exist' as never)).toThrow(
      /Missing translation for key/,
    );
  });

  it('treats whitespace-only translations as missing', () => {
    const dictionary = getDictionary('en');
    const key = 'app.title' as MessageKey;
    const original = dictionary[key];
    (dictionary as Record<string, string>)[key] = '   ';
    try {
      expect(() => t('en', key)).toThrow(/Missing translation for key/);
    } finally {
      (dictionary as Record<string, string>)[key] = original;
    }
  });

  it('enforces key parity and non-blank values across dictionaries', () => {
    const enKeys = Object.keys(en).sort();
    const arKeys = Object.keys(ar).sort();
    expect(arKeys).toEqual(enKeys);

    for (const locale of locales) {
      const dictionary = getDictionary(locale);
      for (const key of enKeys) {
        const value = dictionary[key as MessageKey];
        expect(typeof value).toBe('string');
        expect(value.trim().length).toBeGreaterThan(0);
        expect(t(locale, key as MessageKey)).toBe(value);
      }
    }
  });
});
