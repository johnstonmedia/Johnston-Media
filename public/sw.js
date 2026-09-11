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
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "New mail";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Grouping on the thread means a conversation that gets three replies
    // replaces its own notification instead of stacking three of them.
    tag: payload.tag || "jm-mail",
    renotify: true,
    data: { url: payload.url || "/email" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
