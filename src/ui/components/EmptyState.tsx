import { LinkButton } from './Button';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  actionTo?: string;
  icon?: IconName;
  heading?: 'h1' | 'h2' | 'h3';
  /** Inside another card: no border/shadow, less padding. */
  compact?: boolean;
}

export function EmptyState({ title, body, actionLabel, actionTo, icon = 'sparkle', heading = 'h2', compact = false }: EmptyStateProps) {
  const Heading = heading;
  return (
    <div className={compact ? 'empty compact' : 'empty card'}>
      <Icon name={icon} />
      <Heading>{title}</Heading>
      <p>{body}</p>
      {actionLabel && actionTo ? (
        <LinkButton variant="primary" to={actionTo}>
          {actionLabel}
        </LinkButton>
      ) : null}
    </div>
  );
}
