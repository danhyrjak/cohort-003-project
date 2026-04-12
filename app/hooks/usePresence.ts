import { useState, useEffect } from "react";
import type { PresenceUser } from "~/lib/presenceStore";

export function usePresence(lessonId: number, currentUserId: number | null) {
  const [roster, setRoster] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;

    const es = new EventSource(`/api/lessons/${lessonId}/presence`);

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

    return () => {
      es.close();
      setConnected(false);
    };
  }, [lessonId, currentUserId]);

  return { roster, connected };
}
