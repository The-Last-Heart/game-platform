import { describe, expect, it } from 'vitest';
import { validateLoginForm } from './login';

describe('validateLoginForm', () => {
  it('requires email and password', () => {
    expect(validateLoginForm({ email: '', password: '' })).toEqual({
      email: 'required',
      password: 'required',
    });
  });

  it('rejects invalid email', () => {
    expect(
      validateLoginForm({ email: 'not-an-email', password: 'secret' }),
    ).toEqual({ email: 'invalid' });
  });

  it('accepts valid credentials shape', () => {
    expect(
      validateLoginForm({
        email: ' admin@example.com ',
        password: 'long-enough',
      }),
    ).toBeNull();
  });
});
