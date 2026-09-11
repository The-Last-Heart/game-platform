import {
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_VALUES,
  THEME_COOKIE_NAME,
  THEME_VALUES,
  type SidebarPreference,
  type ThemePreference,
} from '@/lib/bff/constants';

export function parseTheme(value: string | undefined | null): ThemePreference {
  if (value && (THEME_VALUES as readonly string[]).includes(value)) {
    return value as ThemePreference;
  }
  return 'light';
}

export function parseSidebar(
  value: string | undefined | null,
): SidebarPreference {
  if (value && (SIDEBAR_VALUES as readonly string[]).includes(value)) {
    return value as SidebarPreference;
  }
  return 'expanded';
}

/**
 * Inline script applied before paint so theme/sidebar classes match cookies
 * and avoid hydration mismatches (same idea as locale lang/dir).
 */
export function preferenceBootstrapScript(): string {
  return `(function(){try{var c=document.cookie||'';function g(n){var m=c.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):'';}var t=g('${THEME_COOKIE_NAME}');if(t!=='dark'&&t!=='light')t='light';var s=g('${SIDEBAR_COOKIE_NAME}');if(s!=='collapsed'&&s!=='expanded')s='expanded';var r=document.documentElement;r.dataset.theme=t;r.dataset.sidebar=s;r.style.colorScheme=t;}catch(e){}})();`;
}

export function setClientCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): void {
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${maxAgeSeconds}`,
    'samesite=lax',
  ];
  if (secure) {
    parts.push('secure');
  }
  document.cookie = parts.join('; ');
}

export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
