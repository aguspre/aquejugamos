import type { UserSummary } from '../../types/domain';

interface OwnerAvatarStackProps {
  owners: UserSummary[];
  maxVisible?: number;
  size?: 'sm' | 'md';
  showNames?: boolean;
  prefix?: string;
}

function formatOwnerNames(owners: UserSummary[]): string {
  if (owners.length === 0) return '';
  if (owners.length === 1) return owners[0]!.displayName;
  if (owners.length === 2) return `${owners[0]!.displayName} y ${owners[1]!.displayName}`;
  const rest = owners.length - 2;
  return `${owners[0]!.displayName}, ${owners[1]!.displayName} y ${rest} más`;
}

export function OwnerAvatarStack({
  owners,
  maxVisible = 3,
  size = 'sm',
  showNames = true,
  prefix,
}: OwnerAvatarStackProps) {
  if (owners.length === 0) return null;

  const visible = owners.slice(0, maxVisible);
  const overflow = owners.length - visible.length;

  const avatarSize =
    size === 'md' ? 'h-7 w-7 text-[11px]' : 'h-6 w-6 text-[10px]';

  const resolvedPrefix =
    prefix ?? (owners.length === 1 ? 'Lo lleva' : 'Lo llevan');

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex -space-x-2 shrink-0" aria-hidden="true">
        {visible.map((owner) => (
          <span
            key={owner.id}
            className={`inline-flex items-center justify-center rounded-full font-bold text-white ring-2 ring-surface shadow-xs select-none ${avatarSize}`}
            style={{ backgroundColor: owner.accentColor }}
            title={owner.displayName}
          >
            {owner.avatarUrl ? (
              <img
                src={owner.avatarUrl}
                alt={owner.displayName}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              owner.initials
            )}
          </span>
        ))}
        {overflow > 0 && (
          <span
            className={`inline-flex items-center justify-center rounded-full bg-canvas-deep text-ink-muted font-bold ring-2 ring-surface num-tabular ${avatarSize}`}
          >
            +{overflow}
          </span>
        )}
      </div>

      {showNames && (
        <p className="text-xs text-ink-muted truncate">
          {resolvedPrefix && (
            <span className="text-ink-subtle font-medium">{resolvedPrefix}: </span>
          )}
          <span className="font-semibold text-ink">{formatOwnerNames(owners)}</span>
        </p>
      )}
    </div>
  );
}
