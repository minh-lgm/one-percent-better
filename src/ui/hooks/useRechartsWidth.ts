import { useLayoutEffect, useState, type RefObject } from 'react';

export const FALLBACK_WIDTH = 320;

/**
 * Current `clientWidth` of `ref` (ResizeObserver; `FALLBACK_WIDTH` in jsdom).
 * Shared by the two lazily loaded Recharts wrappers (BarChart, CurveChart); the
 * bundler names the chunk that holds Recharts after this module (`useRechartsWidth-*.js`).
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || FALLBACK_WIDTH);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
