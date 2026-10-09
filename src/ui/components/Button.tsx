import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';

interface BaseProps {
  variant?: ButtonVariant;
  full?: boolean;
  icon?: IconName;
  children?: ReactNode;
}

export type ButtonProps = BaseProps & ComponentPropsWithRef<'button'>;

export function Button({ variant = 'secondary', full = false, icon, className = '', type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={`btn ${variant}${full ? ' full' : ''} ${className}`.trim()} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export type LinkButtonProps = BaseProps & LinkProps;

export function LinkButton({ variant = 'secondary', full = false, icon, className = '', children, ...rest }: LinkButtonProps) {
  return (
    <Link className={`btn ${variant}${full ? ' full' : ''} ${className}`.trim()} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Link>
  );
}

export interface IconButtonProps extends ComponentPropsWithRef<'button'> {
  icon: IconName;
  label: string;
}

/** Icon-only button: `label` becomes the accessible name. */
export function IconButton({ icon, label, type = 'button', className = '', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={`icon-btn ${className}`.trim()} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
