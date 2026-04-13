import { useState, useEffect, useRef } from "react";
import type { PresenceUser } from "~/lib/presenceStore";

const HEARTBEAT_INTERVAL_MS = 20_000;

export function usePresence(lessonId: number, currentUserId: number | null) {
  const [roster, setRoster] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  // Stores the server-assigned connectionId received on the first SSE event.
  const connectionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentUserId) return;

    const es = new EventSource(`/api/lessons/${lessonId}/presence`);

    // The server sends a typed "connection" event with the connectionId so
    // that heartbeats and explicit leave requests can be tied to this specific
    // SSE connection (enabling per-connection deduplication on the server).
    es.addEventListener("connection", (event) => {
      try {
        const { id } = JSON.parse((event as MessageEvent).data);
        connectionIdRef.current = id;
      } catch {
        // Malformed — ignore
      }
    });

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const all: PresenceUser[] = JSON.parse(event.data);
        // Exclude the current user from the displayed roster
        setRoster(all.filter((u) => u.id !== currentUserId));
      } catch {
        // Malformed message — ignore
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    // Periodic heartbeat so the server can detect unclean disconnects.
    // If the server does not receive a heartbeat within its timeout window
    // (45 s), it evicts this connection from the roster and notifies other
    // viewers — fixing the "ghost avatar" problem caused by clients that go
    // offline without cleanly closing the SSE TCP connection.
    const heartbeatInterval = setInterval(() => {
      const connId = connectionIdRef.current;
      if (!connId) return;
      fetch(`/api/lessons/${lessonId}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connId }),
      }).catch(() => {
        // Best-effort — ignore failures
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(heartbeatInterval);

      // Explicit leave: tell the server to remove this connection from the
      // roster immediately, without waiting for the TCP connection to close.
      // keepalive: true ensures the request completes even during SPA navigation.
      const connId = connectionIdRef.current;
      if (connId) {
        fetch(`/api/lessons/${lessonId}/presence`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: connId }),
          keepalive: true,
        }).catch(() => {
          // Best-effort — ignore failures
        });
      }

      es.close();
      setConnected(false);
    };
  }, [lessonId, currentUserId]);

  return { roster, connected };
}
