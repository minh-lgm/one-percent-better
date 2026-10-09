import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Alert({ children, role = 'alert', id }: { children: ReactNode; role?: 'alert' | 'status'; id?: string }) {
  return (
    <div className="alert" role={role} id={id}>
      <Icon name="alert" />
      <p>{children}</p>
    </div>
  );
}
