// 오프라인에서도 앱이 열리도록 화면 파일을 캐시한다. 음악은 IndexedDB에 있어서 여기서 다루지 않는다.
// __BUILD__는 배포할 때 빌드 번호로 바뀌어서, 새 버전이 올라가면 캐시가 새로 만들어진다.
const CACHE = 'daa-__BUILD__';
const FILES = ['./', 'index.html', 'style.css', 'theme.css', 'licenses.js', 'gestures.js', 'libutil.js', 'webbridge.js', 'bridge.js', 'app.js', 'manifest.webmanifest', 'icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 먼저 네트워크에서 최신 파일을 받고, 인터넷이 안 되면 캐시를 쓴다.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/ipa/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
