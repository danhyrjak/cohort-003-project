import type { PresenceUser } from "~/lib/presenceStore";
import { presenceColor } from "~/lib/presenceColor";

const MAX_VISIBLE = 5;

export function PresenceAvatarStack({
  roster,
  connected,
}: {
  roster: PresenceUser[];
  connected: boolean;
}) {
  if (roster.length === 0) return null;

  const visible = roster.slice(0, MAX_VISIBLE);
  const overflow = roster.length - MAX_VISIBLE;
  const label =
    roster.length === 1
      ? "1 student viewing"
      : `${roster.length} students viewing`;

  return (
    <div
      className={`flex items-center gap-1${connected ? "" : " opacity-50"}`}
      title={label}
    >
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <Avatar key={user.id} user={user} />
        ))}
      </div>
      {overflow > 0 && (
        <span className="text-xs text-muted-foreground">+{overflow} more</span>
      )}
    </div>
  );
}

function Avatar({ user }: { user: PresenceUser }) {
  const initial = user.name.charAt(0).toUpperCase();

  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        title={user.name}
        className="size-7 rounded-full object-cover ring-2 ring-background"
      />
    );
  }

  return (
    <div
      title={user.name}
      className="flex size-7 items-center justify-center rounded-full ring-2 ring-background text-xs font-medium text-white"
      style={{ backgroundColor: presenceColor(user.id) }}
    >
      {initial}
    </div>
  );
}
