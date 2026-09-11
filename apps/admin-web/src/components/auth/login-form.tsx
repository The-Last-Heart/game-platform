'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { t } from '@/i18n/get-dictionary';
import type { Locale } from '@/i18n/locale';
import { adminApiFetch } from '@/lib/api/client';
import {
  validateLoginForm,
  type LoginValidationErrors,
} from '@/lib/validation/login';

export function LoginForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<LoginValidationErrors | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const validation = validateLoginForm({ email, password });
    setErrors(validation);
    if (validation) {
      return;
    }

    setSubmitting(true);
    const result = await adminApiFetch<{ user: unknown }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    });
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.error.message || t(locale, 'auth.genericError'));
      return;
    }

    const next = searchParams.get('next');
    const safeNext =
      next && next.startsWith(`/${locale}/`) && !next.includes('/login')
        ? next
        : `/${locale}/dashboard`;
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-brand">{t(locale, 'app.productName')}</p>
        <p className="login-brand-ar">{t(locale, 'app.productNameAr')}</p>
        <h1>{t(locale, 'auth.loginTitle')}</h1>
        <p className="subtitle">{t(locale, 'auth.loginSubtitle')}</p>

        <div style={{ marginBottom: '1rem' }}>
          <LanguageSwitcher locale={locale} currentPath={`/${locale}/login`} />
        </div>

        <form onSubmit={onSubmit} noValidate>
          {formError ? <p className="form-error">{formError}</p> : null}

          <div className="field">
            <label htmlFor="login-email">{t(locale, 'auth.email')}</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(errors?.email)}
              aria-describedby={errors?.email ? 'login-email-error' : undefined}
            />
            {errors?.email === 'required' ? (
              <span id="login-email-error" className="field-error">
                {t(locale, 'auth.emailRequired')}
              </span>
            ) : null}
            {errors?.email === 'invalid' ? (
              <span id="login-email-error" className="field-error">
                {t(locale, 'auth.emailInvalid')}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="login-password">{t(locale, 'auth.password')}</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(errors?.password)}
              aria-describedby={
                errors?.password ? 'login-password-error' : undefined
              }
            />
            {errors?.password ? (
              <span id="login-password-error" className="field-error">
                {t(locale, 'auth.passwordRequired')}
              </span>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            style={{ width: '100%' }}
          >
            {submitting
              ? t(locale, 'auth.signingIn')
              : t(locale, 'auth.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
