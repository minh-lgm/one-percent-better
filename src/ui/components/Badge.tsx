import type { ReactNode } from 'react';

export type BadgeTone = 'success' | 'info' | 'neutral' | 'warning';

export function Badge({ tone = 'neutral', children, id }: { tone?: BadgeTone; children: ReactNode; id?: string }) {
  return (
    <span id={id} className={`badge${tone === 'neutral' ? '' : ' ' + tone}`}>
      {children}
    </span>
  );
}
