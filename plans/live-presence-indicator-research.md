# Live Presence Indicator — Research & Implementation Plan

## Overview

A live presence indicator that shows students who else is currently viewing the same lesson. Displays as a row of avatars (real avatar image if available, random-color circle with initials if not), capped at 5 visible with a "+N more" overflow label.

---

## Requirements Summary

| Dimension | Decision |
|---|---|
| Departure detection | Within seconds (near-instant) |
| Display | Avatars — real photo or color-coded circle with initials |
| Privacy | Always visible, no opt-out |
| Persistence | Ephemeral for now; design to allow SQLite persistence later |
| Scale target | 50–500 concurrent per lesson |

---

## Chosen Approach: SSE + In-Memory Presence Store

### Why SSE over polling

Polling (fetching every 30–60s) would mean a departing student lingers in the indicator for up to a minute. Since the requirement is "within seconds," we need a persistent connection that the server can detect closing immediately.

Server-Sent Events (SSE) fit this exactly:
- The server detects connection close the moment a student navigates away or closes their tab
- It's one-way (server → client), which is all presence needs — students never push presence data back
- HTTP-native: no special infrastructure, no upgrade handshake, works through standard proxies
- React Router v7 supports it cleanly via resource routes (not loaders — loaders have a 4950ms default timeout that would kill a persistent SSE stream)

WebSockets were ruled out: bidirectional comms are not needed, and they add upgrade complexity with no benefit for this use case.

### Why not a third-party service

Liveblocks, Ably, and PartyKit all add external vendor dependencies and recurring cost. PartyKit specifically caps at ~30–40 concurrent users per room before degrading. For a self-hosted, single-server SQLite deployment there is no compelling reason to reach for any of them.

### Why in-memory over SQLite for presence state

SQLite is a single-writer database. Updating a `last_seen_at` row on every heartbeat or connection event from 50–500 concurrent students would create write contention under load. In-memory state is instant and perfectly suited for ephemeral data on a single server.

The tradeoff: presence is lost on server restart. Acceptable — students reconnect and presence rebuilds within seconds.

---

## Architecture

### Server: `app/lib/presence.server.ts`

A singleton module that owns two data structures:

```
presenceMap:  Map<lessonId, Map<userId, PresenceUser>>
subscribers:  Map<lessonId, Set<(users: PresenceUser[]) => void>>
```

`PresenceUser` shape:
```ts
type PresenceUser = {
  userId: string
  name: string       // display name
  avatarUrl?: string // null → render color circle
  color: string      // deterministic from userId hash, stable across reconnects
}
```

Each entry in `presenceMap` tracks a `connectionCount` alongside the user data. A user opening multiple tabs creates multiple SSE connections — the count increments on each `join` and decrements on each `leave`. The user is only removed from the map and broadcast to others when their count reaches zero (last tab closed). This ensures a user always appears exactly once regardless of how many tabs they have open.

Key operations:
- `join(lessonId, user)` — increment connection count (or add if first tab), broadcast only on first join
- `leave(lessonId, userId)` — decrement count, broadcast and remove only when count reaches zero
- `subscribe(lessonId, callback)` — register a push function for an SSE connection
- `unsubscribe(lessonId, callback)` — called when the SSE connection closes

### Resource Route: `app/routes/resources.presence.$lessonId.ts`

An SSE endpoint. On request:
1. Reads authenticated user from session
2. Calls `presence.join(lessonId, user)`
3. Returns a `text/event-stream` `Response` with a `ReadableStream`
4. On stream close (client disconnect): calls `presence.leave(lessonId, userId)`

The response pushes the full current roster on every change. Clients always have the complete list, not a diff — simpler and avoids desync bugs.

```
GET /resources/presence/:lessonId
Content-Type: text/event-stream

data: {"users":[{"userId":"u1","name":"Alex","color":"#4f46e5"},...]}\n\n
```

### Client: `usePresence(lessonId)` hook

```ts
const { users } = usePresence(lessonId)
```

Uses `EventSource` to connect to the resource route. On mount: opens connection. On unmount (navigation/tab close): calls `eventSource.close()`, which triggers the server-side disconnect detection.

Reconnection is handled automatically by the browser's built-in `EventSource` reconnect behavior.

### Component: `<PresenceIndicator lessonId={lessonId} />`

Renders the avatar stack. Logic:
- Show up to 5 avatars
- Each avatar: real `<img>` if `avatarUrl` is set, otherwise a colored circle with first-initial
- If `users.length > 5`: show the 5 avatars + `+N more` label
- Tooltip on hover: show the count ("6 students viewing")
- Don't render current user (filter out `currentUserId`) — you don't need to see yourself

---

## Color Assignment

Colors are assigned deterministically from the userId so they are stable across reconnects and page refreshes:

```ts
const PALETTE = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777']

function colorForUser(userId: string): string {
  const hash = [...userId].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return PALETTE[hash % PALETTE.length]
}
```

---

## Reconnection Behaviour

SSE reconnection is built into the browser's `EventSource` spec — no custom retry logic needed. When the server restarts or the connection drops:

1. The TCP connection drops and the browser detects it within seconds
2. `EventSource` enters `CONNECTING` state (`readyState = 0`) and waits before retrying
3. The retry delay defaults to ~3s but can be controlled server-side via the `retry:` SSE field — set to `2000` (2s) for faster recovery
4. On reconnect the client calls `join()` again, receives the current (fresh) roster, and presence rebuilds as other clients reconnect

**During the gap**, the client holds stale state — the last roster it received before the drop. To avoid silently showing wrong data, the `usePresence` hook should track connection state and pass it to the component:

```ts
eventSource.onopen = () => setConnected(true)
eventSource.onerror = () => setConnected(false)
```

The `PresenceIndicator` should visually dim or fade the avatars when `connected === false`, signalling to the student that the count may be stale.

**After restart**, clients reconnect at slightly different times. The in-memory store starts empty and fills organically as each client rejoins — this is fine and feels natural (students appear to "arrive" one by one).

---

## React Router v7 SSE Caveat

Loaders in React Router v7 have a default 4950ms timeout. SSE **must not** go through a loader. It must be a resource route — a file in `app/routes/` that exports only a `loader` returning a raw `Response`, with no default component export. This bypasses the framework timeout entirely.

Additionally, the `Connection: keep-alive` and `Cache-Control: no-cache` headers must be set on the SSE response, or proxies/CDNs will buffer the stream.

---

## Future: SQLite Persistence (When Needed)

When analytics become a requirement, add a `lesson_presence_sessions` table:

```sql
CREATE TABLE lesson_presence_sessions (
  id           INTEGER PRIMARY KEY,
  lesson_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  joined_at    INTEGER NOT NULL,  -- unix ms
  left_at      INTEGER            -- null while active
);
```

The `presence.server.ts` module's `join` and `leave` functions can write to this table without changing the SSE or client code at all. Peak concurrent viewer queries become straightforward window function queries over this table.

---

## What We Are Not Building (Now)

- Per-lesson or global opt-out toggle — always visible by design
- Cursor tracking or collaborative annotations — out of scope
- Instructor view of presence — separate analytics feature
- Cross-server presence sync — not needed while on single-server SQLite deployment

---

## File Plan

| File | Purpose |
|---|---|
| `app/lib/presence.server.ts` | In-memory store + pub/sub logic |
| `app/routes/resources.presence.$lessonId.ts` | SSE resource route |
| `app/hooks/usePresence.ts` | Client EventSource hook |
| `app/components/PresenceIndicator.tsx` | Avatar stack UI component |

