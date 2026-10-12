import type { KvRepository, Subscribable, SyncedPrefsRepository } from '../data/repositories';
import { detectLocale } from '../i18n/detect';
import { isLocale, type Locale } from '../i18n/types';

/**
 * Resolves and persists the UI language (FR-32 … FR-34, ARCHITECTURE §5.8, ADR-12).
 * v2.1 (FR-55): with a `SyncedPrefsRepository` the choice is written together with its sync
 * marker (also when signed out: a choice is a choice).
 */
export class LocaleService {
  constructor(
    private readonly kv: KvRepository,
    private readonly prefs?: SyncedPrefsRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Saved choice wins; an invalid saved value is ignored; otherwise detect from the browser. */
  async resolve(navigatorLanguage: string | undefined): Promise<Locale> {
    const saved = await this.kv.get<unknown>('locale');
    if (isLocale(saved)) return saved;
    return detectLocale(navigatorLanguage);
  }

  /** Persist the user's explicit choice (A-16: only written when the user chooses). */
  set(locale: Locale): Promise<void> {
    if (this.prefs) return this.prefs.setLocale(locale, this.clock());
    return this.kv.set('locale', locale);
  }

  watch(): Subscribable<Locale | undefined> {
    const inner = this.kv.watch<unknown>('locale');
    return {
      subscribe(onNext, onError) {
        return inner.subscribe((v) => onNext(isLocale(v) ? v : undefined), onError);
      },
    };
  }
}
