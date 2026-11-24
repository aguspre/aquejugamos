import { useState } from 'react';
import type { UserSummary } from '../../types/domain';

interface UserAvatarProps {
  user: UserSummary;
  className?: string;
  title?: string;
}

export function UserAvatar({ user, className = 'h-6 w-6 text-[10px]', title }: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(user.avatarUrl && failedUrl !== user.avatarUrl);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white select-none ${className}`}
      style={{ backgroundColor: user.accentColor }}
      title={title}
    >
      {showImage ? (
        <img
          src={user.avatarUrl}
          alt={user.displayName}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailedUrl(user.avatarUrl ?? null)}
          className="h-full w-full object-cover"
        />
      ) : (
        user.initials
      )}
    </span>
  );
}
