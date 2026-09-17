/// <reference lib="webworker" />

const CACHE_VERSION = "snappy-pwa-v3";
const NOTIFICATION_DB = "snappy-notifications";
const NOTIFICATION_STORE = "pending";
const OFFLINE_URL = "/offline";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-512x512-maskable.png",
  "/logo.png",
  "/apple-touch-icon.png",
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isApiRequest(pathname) {
  return pathname.startsWith("/api/");
}

function isAdminRequest(pathname) {
  return pathname.startsWith("/admin/");
}

function isProtectedAppRoute(pathname) {
  return (
    pathname.startsWith("/home") ||
    pathname.startsWith("/friends") ||
    isAdminRequest(pathname)
  );
}

function isPrefetchRequest(request) {
  const purpose = request.headers.get("Purpose");
  const secPurpose = request.headers.get("Sec-Purpose");
  return purpose === "prefetch" || secPurpose === "prefetch";
}

function isRscRequest(request, url) {
  return (
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.get("Next-Router-State-Tree") !== null ||
    url.searchParams.has("_rsc")
  );
}

function isStaticAsset(pathname) {
  if (pathname.startsWith("/_next/static/")) {
    return true;
  }
  if (pathname.startsWith("/icons/")) {
    return true;
  }
  if (pathname === "/logo.png" || pathname === "/apple-touch-icon.png") {
    return true;
  }
  return /\.(css|js|woff2?|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname);
}

function shouldNeverCache(request, url) {
  if (request.method !== "GET") {
    return true;
  }
  if (!isSameOrigin(url)) {
    return true;
  }
  if (isApiRequest(url.pathname)) {
    return true;
  }
  if (isPrefetchRequest(request)) {
    return true;
  }
  if (isRscRequest(request, url)) {
    return true;
  }
  if (url.pathname.startsWith("/_next/image")) {
    return true;
  }
  if (isProtectedAppRoute(url.pathname)) {
    return true;
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("snappy-pwa-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (shouldNeverCache(request, url)) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStatic(request));
  }
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) {
      return offline;
    }
    return new Response("You are offline.", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/plain" },
    });
  }
}

function isValidInternalPath(pathname) {
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) {
    return false;
  }
  if (pathname.includes("://")) {
    return false;
  }
  if (
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    pathname === "/search" ||
    pathname.startsWith("/search/") ||
    pathname === "/notifications" ||
    pathname.startsWith("/notifications/")
  ) {
    return true;
  }
  if (pathname.startsWith("/friends/")) {
    const slug = pathname.slice("/friends/".length).split("/")[0];
    return slug.length > 0 && !slug.includes("..");
  }
  return false;
}

function openNotificationDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NOTIFICATION_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(NOTIFICATION_STORE)) {
        db.createObjectStore(NOTIFICATION_STORE, { keyPath: "notificationId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueNotificationRecord(record) {
  const db = await openNotificationDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIFICATION_STORE, "readwrite");
    tx.objectStore(NOTIFICATION_STORE).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve(undefined);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function drainNotificationQueue() {
  const db = await openNotificationDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIFICATION_STORE, "readwrite");
    const store = tx.objectStore(NOTIFICATION_STORE);
    const getAll = store.getAll();
    let items = [];
    getAll.onsuccess = () => {
      items = getAll.result ?? [];
      store.clear();
    };
    tx.oncomplete = () => {
      db.close();
      resolve(items);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function buildNotificationRecord(payload) {
  const title = typeof payload.title === "string" ? payload.title : "Snappy";
  const body =
    typeof payload.body === "string" ? payload.body : "You have a new update.";
  const url = typeof payload.url === "string" ? payload.url : "/notifications";
  let notificationId =
    typeof payload.notificationId === "string"
      ? payload.notificationId
      : typeof payload.id === "string"
        ? payload.id
        : "";
  if (!notificationId) {
    notificationId = `snappy-${Date.now()}`;
  }
  const createdAt =
    typeof payload.createdAt === "string"
      ? payload.createdAt
      : new Date().toISOString();
  const safeUrl = isValidInternalPath(url) ? url : "/notifications";

  return {
    notificationId,
    id: notificationId,
    type: typeof payload.type === "string" ? payload.type : "NEW_SNAP",
    title,
    body,
    url: safeUrl,
    targetUrl: safeUrl,
    createdAt,
  };
}

async function notifyClients(type, extra) {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    client.postMessage({ type, ...extra });
  }
  return clientList.length;
}

async function deliverNotificationToClients(record) {
  const delivered = await notifyClients("SNAPPY_PUSH_RECEIVED", {
    notification: record,
  });
  if (delivered === 0) {
    await queueNotificationRecord(record);
  }
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object" || !data.type) {
    return;
  }

  if (data.type === "SNAPPY_SYNC_NOTIFICATIONS") {
    event.waitUntil(
      drainNotificationQueue().then((notifications) => {
        if (notifications.length === 0) {
          return undefined;
        }
        return notifyClients("SNAPPY_NOTIFICATION_QUEUE", { notifications });
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const record = buildNotificationRecord(payload);
  const icon =
    typeof payload.icon === "string" ? payload.icon : "/icons/icon-192x192.png";
  const badge =
    typeof payload.badge === "string" ? payload.badge : "/icons/icon-192x192.png";

  event.waitUntil(
    (async () => {
      await deliverNotificationToClients(record);
      await self.registration.showNotification(record.title, {
        body: record.body,
        icon,
        badge,
        tag: record.notificationId || "snappy-notification",
        data: record,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const record = event.notification.data ?? {};
  const rawUrl = record.url ?? record.targetUrl;
  const targetPath =
    typeof rawUrl === "string" && isValidInternalPath(rawUrl)
      ? rawUrl
      : "/notifications";
  const targetUrl = new URL(targetPath, self.location.origin).href;
  const notificationId =
    typeof record.notificationId === "string"
      ? record.notificationId
      : typeof record.id === "string"
        ? record.id
        : "";

  event.waitUntil(
    (async () => {
      await notifyClients("SNAPPY_NOTIFICATION_CLICK", {
        notificationId,
        notification: record,
      });

      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if (typeof client.navigate === "function") {
            await client.navigate(targetUrl);
            return client.focus();
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })(),
  );
});

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const fallback = await caches.match(request);
    if (fallback) {
      return fallback;
    }
    throw new Error("Network error and no cache match");
  }
}
