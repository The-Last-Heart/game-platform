/** HttpOnly session cookie — never readable by client JS. */
export const ADMIN_SESSION_COOKIE_NAME = 'lh_admin_session';

/** Double-submit CSRF cookie — readable by client JS. */
export const ADMIN_CSRF_COOKIE_NAME = 'lh_admin_csrf';

export const ADMIN_CSRF_HEADER_NAME = 'x-csrf-token';

/** Default absolute session TTL (12h), mirrors backend default. */
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

export const THEME_COOKIE_NAME = 'lh_admin_theme';
export const SIDEBAR_COOKIE_NAME = 'lh_admin_sidebar';

export const THEME_VALUES = ['light', 'dark'] as const;
export type ThemePreference = (typeof THEME_VALUES)[number];

export const SIDEBAR_VALUES = ['expanded', 'collapsed'] as const;
export type SidebarPreference = (typeof SIDEBAR_VALUES)[number];
