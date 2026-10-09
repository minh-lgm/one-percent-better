import { LinkButton } from './Button';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  title: string;
  body: string;
  actionLabel?: string;
  actionTo?: string;
  icon?: IconName;
  heading?: 'h1' | 'h2';
}

export function EmptyState({ title, body, actionLabel, actionTo, icon = 'sparkle', heading = 'h2' }: EmptyStateProps) {
  const Heading = heading;
  return (
    <div className="empty card">
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
