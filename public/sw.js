// 오프라인 안내만 맡는 최소 서비스 워커입니다.
// 하는 일은 하나입니다: 화면 이동(navigation) 요청이 연결 문제로 실패했을 때 /offline.html 안내 화면을 보여 줍니다.
// 저장하는 것은 /offline.html 한 장뿐입니다. /api/*, 로그인 요청, /aleph.json 같은 그 밖의 요청은 가로채지 않으며
// (respondWith를 부르지 않음) 응답을 저장하지도 않습니다. 그래서 보호 요청의 정상·거부 결과는 서비스 워커가 없을 때와 같습니다.
const CACHE = 'byteback-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // 화면 이동 GET만 다룬다. 그 밖의 모든 요청은 브라우저가 평소처럼 처리한다.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
  );
});
