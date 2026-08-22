const CACHE_NAME = "chengyu-storybook-shell-v1";
const STATIC_PATHS = ["/manifest.webmanifest", "/favicon.svg"];

async function cacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const shell = await fetch("/", { cache: "no-store" });
  if (!shell.ok) throw new Error(`Unable to cache app shell: ${shell.status}`);

  const html = await shell.clone().text();
  await cache.put("/", shell.clone());
  await cache.put("/index.html", shell.clone());

  const assetPaths = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map((match) => match[1]);
  const paths = [...new Set([...STATIC_PATHS, ...assetPaths])];

  await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      if (response.ok) await cache.put(path, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Narration can be large and browsers may use Range requests. Keep audio
  // network-only until an explicit offline-download product flow exists.
  if (request.headers.has("range") || url.pathname.startsWith("/audio/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put("/index.html", response.clone());
          }
          return response;
        } catch {
          return (await caches.match("/index.html")) || (await caches.match("/"));
        }
      })(),
    );
    return;
  }

  const cacheable =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/stories/") ||
    url.pathname.startsWith("/fonts/") ||
    STATIC_PATHS.includes(url.pathname);

  if (!cacheable) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
