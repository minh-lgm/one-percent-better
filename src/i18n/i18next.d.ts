import 'i18next';
import type en from './resources/en.json';
import type roadmapEn from './resources/roadmap.en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    returnNull: false;
    resources: {
      translation: typeof en;
      /** v8.0 (M17, ADR-53): registered at runtime by `ensureRoadmapNamespace` (lazy), typed here so `t('roadmap:…')` is checked. */
      roadmap: typeof roadmapEn;
    };
  }
}
