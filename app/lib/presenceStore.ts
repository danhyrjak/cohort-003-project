// In-memory presence store for live lesson co-viewing.
// Holds ephemeral state only — no DB writes on the hot path.

export type PresenceUser = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

type UserEntry = {
  user: PresenceUser;
  connectionIds: Set<string>;
};

type ChangeCallback = (roster: PresenceUser[]) => void;

// lessonId → userId → entry
const store = new Map<number, Map<number, UserEntry>>();

// lessonId → set of subscriber callbacks
const subscribers = new Map<number, Set<ChangeCallback>>();

// connectionId → last heartbeat timestamp (ms)
const connectionTimestamps = new Map<string, number>();

// connectionId → { lessonId, userId } for eviction lookups
const connectionMeta = new Map<string, { lessonId: number; userId: number }>();

const HEARTBEAT_INTERVAL_MS = 20_000;
const CONNECTION_TIMEOUT_MS = 45_000;

export function getRoster(lessonId: number): PresenceUser[] {
  const lesson = store.get(lessonId);
  if (!lesson) return [];
  return Array.from(lesson.values()).map((e) => e.user);
}

function notify(lessonId: number) {
  const cbs = subscribers.get(lessonId);
  if (!cbs) return;
  const roster = getRoster(lessonId);
  for (const cb of cbs) {
    cb(roster);
  }
}

export function join(
  lessonId: number,
  userId: number,
  user: PresenceUser,
  connectionId: string
) {
  let lesson = store.get(lessonId);
  if (!lesson) {
    lesson = new Map();
    store.set(lessonId, lesson);
  }
  const existing = lesson.get(userId);
  if (existing) {
    existing.connectionIds.add(connectionId);
  } else {
    lesson.set(userId, { user, connectionIds: new Set([connectionId]) });
  }
  connectionTimestamps.set(connectionId, Date.now());
  connectionMeta.set(connectionId, { lessonId, userId });
  notify(lessonId);
}

export function leave(lessonId: number, userId: number, connectionId: string) {
  const lesson = store.get(lessonId);
  if (!lesson) return;
  const existing = lesson.get(userId);
  if (!existing) return;

  existing.connectionIds.delete(connectionId);
  connectionTimestamps.delete(connectionId);
  connectionMeta.delete(connectionId);

  if (existing.connectionIds.size === 0) {
    lesson.delete(userId);
    if (lesson.size === 0) {
      store.delete(lessonId);
    }
  }
  notify(lessonId);
}

export function heartbeat(connectionId: string) {
  if (connectionTimestamps.has(connectionId)) {
    connectionTimestamps.set(connectionId, Date.now());
  }
}

export function subscribe(lessonId: number, cb: ChangeCallback): () => void {
  let cbs = subscribers.get(lessonId);
  if (!cbs) {
    cbs = new Set();
    subscribers.set(lessonId, cbs);
  }
  cbs.add(cb);
  return () => {
    cbs!.delete(cb);
    if (cbs!.size === 0) {
      subscribers.delete(lessonId);
    }
  };
}

// Evict connections that have not sent a heartbeat within the timeout window.
// Runs periodically to detect clients that went offline without cleanly closing
// their SSE connection (e.g. Chrome DevTools "Offline" simulation).
function evictStaleConnections() {
  const cutoff = Date.now() - CONNECTION_TIMEOUT_MS;

  for (const [connectionId, ts] of connectionTimestamps) {
    if (ts < cutoff) {
      const meta = connectionMeta.get(connectionId);
      if (meta) {
        leave(meta.lessonId, meta.userId, connectionId);
      } else {
        // No lesson/user metadata — just clean up the timestamp entry.
        connectionTimestamps.delete(connectionId);
      }
    }
  }
}

setInterval(evictStaleConnections, HEARTBEAT_INTERVAL_MS);
