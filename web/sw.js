/**
 * 서비스 워커 — 한 번 연 뒤에는 인터넷이 없어도 게임이 열리게 한다.
 *
 * 이 게임은 배포본이 `index.html` 한 파일이라 캐시할 것이 몇 개뿐이다.
 * `__BUILD_ID__` 는 `build-pages.js` 가 배포 커밋으로 바꿔 넣는다 —
 * 배포할 때마다 캐시 이름이 달라져서 옛 파일이 남지 않는다.
 */

const VERSION = '__BUILD_ID__';
const CACHE = 'last-squad-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // `cache: 'reload'` 로 받아야 브라우저 HTTP 캐시에 남은 옛 파일을 다시 담지 않는다.
      Promise.all(
        SHELL.map((url) =>
          fetch(url, { cache: 'reload' }).then((res) => (res.ok ? cache.put(url, res) : null)),
        ),
      ),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* 캐시를 먼저 내준다 — 비행기 안에서도 열리고, 시작도 빠르다.
 * 동시에 뒤에서 새 파일을 받아 두므로 새 배포는 다음 실행 때 적용된다. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
