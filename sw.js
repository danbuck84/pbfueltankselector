const CACHE_NAME = 'fuel-timer-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './app_icon.jpg',
  './favicon.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
