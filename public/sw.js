/**
 * Service worker — push notifications for the email platform.
 *
 * Deliberately minimal: no offline caching, no interception of fetches. The
 * only reason this exists is that a browser will not deliver a push message
 * without one, and caching a signed-in mail client is a good way to show
 * somebody yesterday's inbox.
 *
 * Lives at the origin root so its scope covers the whole site, which is what
 * lets mail.wjohnstonmedia.com register it.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close — a
  // notification that only starts working tomorrow is not much of a feature.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // Logged first, before anything can throw. A push that arrives and then
  // fails to display looks identical from the server — which reports it as
  // sent either way — so this line is the only thing that tells the two
  // apart. Visible in DevTools under Application, Service Workers, Inspect.
  console.log("[sw] push received", new Date().toISOString());

  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch (err) {
        console.log("[sw] payload was not JSON:", err);
      }

      try {
        await self.registration.showNotification(payload.title || "New mail", {
          body: payload.body || "",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          // Grouping on the thread means a conversation that gets three
          // replies replaces its own notification instead of stacking three.
          tag: payload.tag || "jm-mail",
          renotify: true,
          data: { url: payload.url || "/email" },
        });
      } catch (err) {
        console.log("[sw] showNotification failed:", err);
        // Something must appear, or a browser that requires a visible
        // notification per push will revoke the subscription for abuse.
        await self.registration.showNotification("New mail", {
          body: "Open Johnston Media Mail to read it.",
        });
      }
    })(),
  );
});

/**
 * A subscription can be rotated by the browser without anybody asking.
 *
 * When that happens the stored endpoint goes dead and every push is accepted
 * by the push service and delivered nowhere — the exact silence this feature
 * kept producing. Telling any open tab means it can re-register rather than
 * waiting for someone to notice.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  console.log("[sw] subscription changed — re-registration needed");
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of all) client.postMessage({ type: "jm-resubscribe" });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/email";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an open copy rather than opening a second one. Someone who has
      // the inbox open on their phone should land back in it.
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
