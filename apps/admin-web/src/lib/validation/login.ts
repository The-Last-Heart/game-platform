export type LoginValidationErrors = {
  email?: 'required' | 'invalid';
  password?: 'required';
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginForm(input: {
  email: string;
  password: string;
}): LoginValidationErrors | null {
  const errors: LoginValidationErrors = {};
  const email = input.email.trim();
  const password = input.password;

  if (!email) {
    errors.email = 'required';
  } else if (!EMAIL_RE.test(email)) {
    errors.email = 'invalid';
  }

  if (!password) {
    errors.password = 'required';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
