// In-memory presence store for live lesson co-viewing.
// Holds ephemeral state only — no DB writes on the hot path.

export type PresenceUser = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

type UserEntry = {
  user: PresenceUser;
  connectionCount: number;
};

type ChangeCallback = (roster: PresenceUser[]) => void;

// lessonId → userId → entry
const store = new Map<number, Map<number, UserEntry>>();

// lessonId → set of subscriber callbacks
const subscribers = new Map<number, Set<ChangeCallback>>();

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

export function join(lessonId: number, userId: number, user: PresenceUser) {
  let lesson = store.get(lessonId);
  if (!lesson) {
    lesson = new Map();
    store.set(lessonId, lesson);
  }
  const existing = lesson.get(userId);
  if (existing) {
    existing.connectionCount += 1;
  } else {
    lesson.set(userId, { user, connectionCount: 1 });
  }
  notify(lessonId);
}

export function leave(lessonId: number, userId: number) {
  const lesson = store.get(lessonId);
  if (!lesson) return;
  const existing = lesson.get(userId);
  if (!existing) return;
  existing.connectionCount -= 1;
  if (existing.connectionCount <= 0) {
    lesson.delete(userId);
    if (lesson.size === 0) {
      store.delete(lessonId);
    }
  }
  notify(lessonId);
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
