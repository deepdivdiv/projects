// 오프라인에서도 앱이 열리도록 화면 파일을 캐시한다. 음악은 IndexedDB에 있어서 여기서 다루지 않는다.
// __BUILD__는 배포할 때 빌드 번호로 바뀌어서, 새 버전이 올라가면 캐시가 새로 만들어진다.
const CACHE = 'daa-__BUILD__';
const FILES = ['./', 'index.html', 'style.css', 'theme.css', 'licenses.js', 'gestures.js', 'libutil.js', 'webbridge.js', 'bridge.js', 'app.js', 'manifest.webmanifest', 'icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// 폰에 저장된 파일로 바로 띄우고, 최신 파일은 뒤에서 받아 두었다가 다음 실행 때 쓴다.
// 신호가 약한 곳(지하철, 엘리베이터)에서도 네트워크를 기다리지 않아서 앱이 즉시 열린다.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/ipa/')) return;
  const page = e.request.mode === 'navigate';
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(page ? 'index.html' : e.request, { ignoreSearch: true });
    const fresh = fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok && res.type === 'basic') cache.put(page ? 'index.html' : e.request, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(fresh.catch(() => {}));
      return cached;
    }
    return fresh.catch(() => cache.match('index.html'));
  }));
});
