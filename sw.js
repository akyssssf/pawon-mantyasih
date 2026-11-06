/* Service worker Pawon Mantyasih.
 * - Saat dipasang: menyimpan cangkang aplikasi, aset hasil build, dan data konten.
 * - Saat berjalan: aset memakai cache lebih dulu (cache-first), halaman memakai jaringan lebih dulu.
 * - Versi cache diganti agar cache lama dibersihkan (GDD 2.13.2).
 */
const VERSION = "pawon-v14";
const SCOPE = self.registration.scope;

const CORE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "panduan.html",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "data/dialogues.json",
  "data/quests.json",
  "data/items.json",
  "data/journal.json",
  "data/puzzles.json",
  "data/recipes.json",
  "data/anim.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(CORE.map((p) => new URL(p, SCOPE).href));
      // Aset 3D proyek Mikro (opsional): daftar berkas dibaca dari manifest agar tersedia saat offline.
      try {
        const res = await fetch(new URL("assets/world/manifest.json", SCOPE).href);
        if (res.ok) {
          const m = await res.json();
          await cache.addAll(["assets/world/manifest.json", ...m.files.map((f) => "assets/world/" + f)].map((p) => new URL(p, SCOPE).href));
        }
      } catch (e) {
        // Dilewati: berkas akan disimpan saat pertama kali diminta.
      }
      // Aset hasil build (nama berhash) dibaca dari index.html.
      try {
        const res = await fetch(new URL("index.html", SCOPE).href, { cache: "no-store" });
        const html = await res.text();
        const urls = new Set();
        for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
          const u = new URL(m[1], SCOPE);
          if (u.origin === self.location.origin && /\.(js|css|png|svg|webmanifest)$/.test(u.pathname)) {
            urls.add(u.href);
          }
        }
        await cache.addAll([...urls]);
      } catch (e) {
        // Dilewati: aset akan disimpan saat pertama kali diminta.
      }
    })(),
  );
  // Versi baru menunggu persetujuan pemain (lihat pesan SKIP_WAITING).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Halaman: jaringan dulu, cadangan dari cache saat offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(VERSION);
          cache.put(new URL("index.html", SCOPE).href, fresh.clone());
          return fresh;
        } catch {
          const cached =
            (await caches.match(new URL("index.html", SCOPE).href)) || (await caches.match(req));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Data konten: jaringan dulu agar teks yang sudah divalidasi cepat terbarui.
  if (url.pathname.includes("/data/")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(VERSION);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(req)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Aset lain: cache dulu, simpan saat pertama kali diambil.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(VERSION);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        return Response.error();
      }
    })(),
  );
});
