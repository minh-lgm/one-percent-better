import type { Locale } from './types';

/** FR-33: `vi` when the browser language starts with "vi" (case-insensitive), otherwise `en`. */
export function detectLocale(navigatorLanguage: string | undefined | null): Locale {
  return typeof navigatorLanguage === 'string' && navigatorLanguage.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
