import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
    assert.equal(resolveRootLocale(undefined), defaultLocale);
    assert.equal(resolveRootLocale(undefined), 'en');
    assert.equal(documentLang('en'), 'en');
    assert.equal(documentDirection('en'), 'ltr');
  });

  it('maps Arabic to lang=ar and dir=rtl', () => {
    assert.equal(documentLang('ar'), 'ar');
    assert.equal(documentDirection('ar'), 'rtl');
    assert.equal(resolveRootLocale('ar'), 'ar');
  });

  it('does not treat browser-like values as locale without explicit cookie', () => {
    assert.equal(resolveRootLocale('fr'), 'en');
    assert.equal(resolveRootLocale('ar-SA'), 'en');
  });

  it('preserves equivalent paths when switching locales', () => {
    assert.equal(stripLocalePrefix('/en'), '/');
    assert.equal(stripLocalePrefix('/ar'), '/');
    assert.equal(localizePath('/en', 'ar'), '/ar');
    assert.equal(localizePath('/ar', 'en'), '/en');
    assert.equal(localizePath('/en/settings', 'ar'), '/ar/settings');
  });

  it('returns required English and Arabic foundation copy', () => {
    assert.equal(t('en', 'app.title'), 'The Last Heart — Administration');
    assert.equal(t('en', 'foundation.heading'), 'Foundation status');
    assert.equal(t('ar', 'app.title'), 'آخر قلب — لوحة الإدارة');
    assert.equal(t('ar', 'foundation.heading'), 'حالة التأسيس');
  });

  it('localizes metadata strings per locale', () => {
    assert.equal(
      t('en', 'app.description'),
      'Administration foundation for The Last Heart',
    );
    assert.equal(t('ar', 'app.description'), 'أساس لوحة الإدارة لمنصة آخر قلب');
  });

  it('falls back to English for invalid locale cookie values', () => {
    assert.equal(resolveRootLocale('invalid'), 'en');
    assert.equal(resolveRootLocale(''), 'en');
    assert.equal(resolveRootLocale('EN'), 'en');
  });

  it('fails clearly in development when a translation key is missing', () => {
    assert.throws(
      () => t('en', 'does.not.exist' as never),
      /Missing translation for key/,
    );
  });

  it('treats whitespace-only translations as missing', () => {
    const dictionary = getDictionary('en');
    const key = 'app.title' as MessageKey;
    const original = dictionary[key];
    (dictionary as Record<string, string>)[key] = '   ';
    try {
      assert.throws(() => t('en', key), /Missing translation for key/);
    } finally {
      (dictionary as Record<string, string>)[key] = original;
    }
  });

  it('enforces key parity and non-blank values across dictionaries', () => {
    const enKeys = Object.keys(en).sort();
    const arKeys = Object.keys(ar).sort();
    assert.deepEqual(arKeys, enKeys);

    for (const locale of locales) {
      const dictionary = getDictionary(locale);
      for (const key of enKeys) {
        const value = dictionary[key as MessageKey];
        assert.equal(typeof value, 'string');
        assert.ok(
          value.trim().length > 0,
          `${locale}:${key} must be non-blank`,
        );
        assert.equal(t(locale, key as MessageKey), value);
      }
    }
  });
});
