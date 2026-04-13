import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// In development, Vite reloads the entire page when it detects the dev server
// has restarted (HMR WebSocket disconnect → poll for server → location.reload).
// This causes a jarring full-page refresh even though the SSE presence
// connection will reconnect on its own via the `retry: 2000` directive.
//
// We intercept that single reload call and suppress it so the SSE can
// reconnect naturally without disrupting the user's view.
//
// Trade-off: after suppressing the reload, Vite's HMR WebSocket won't
// automatically reconnect. If you make server-side code changes and restart
// the dev server you'll need to reload the page manually to pick them up.
if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.on("vite:ws:disconnect", () => {
    const original = location.reload.bind(location);
    Object.defineProperty(location, "reload", {
      configurable: true,
      writable: true,
      value() {
        // Restore immediately so subsequent manual or file-change reloads work.
        Object.defineProperty(location, "reload", {
          configurable: true,
          writable: true,
          value: original,
        });
        // Skip Vite's server-restart reload — SSE reconnects via retry: 2000.
      },
    });
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>
  );
});
