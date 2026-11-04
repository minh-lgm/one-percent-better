// Lazy i18next namespace `roadmap` (phase 8, M17; ARCHITECTURE §4.8 j, ADR-53). Both languages are loaded together
// with `import()` so switching the language later never needs another request; the JSON chunks are precached by the
// service worker like every other lazy chunk. Called from the `lazy()` of the `#/roadmaps*` routes and, on demand,
// before Settings shows the D3 roadmap line.
import type { i18n } from 'i18next';

export const ROADMAP_NS = 'roadmap';

const loads = new WeakMap<i18n, Promise<void>>();

/** Resolves once the namespace is registered on `instance` for `en` and `vi` (memoised per instance; a failed load is retried). */
export function ensureRoadmapNamespace(instance: i18n): Promise<void> {
  if (instance.hasResourceBundle('en', ROADMAP_NS) && instance.hasResourceBundle('vi', ROADMAP_NS)) return Promise.resolve();
  let pending = loads.get(instance);
  if (!pending) {
    pending = Promise.all([import('./resources/roadmap.en.json'), import('./resources/roadmap.vi.json')])
      .then(([en, vi]) => {
        instance.addResourceBundle('en', ROADMAP_NS, en.default, true, true);
        instance.addResourceBundle('vi', ROADMAP_NS, vi.default, true, true);
      })
      .catch((e: unknown) => {
        loads.delete(instance);
        throw e;
      });
    loads.set(instance, pending);
  }
  return pending;
}
