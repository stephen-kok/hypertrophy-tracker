var CACHE_NAME = 'hypertrophy-v33';
var URLS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './configs/profiles.json',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js'
];

self.addEventListener('install', function(event) {
  var LOCAL_URLS = URLS_TO_CACHE.filter(function(u) { return u.indexOf('://') === -1; });
  var CDN_URLS = URLS_TO_CACHE.filter(function(u) { return u.indexOf('://') !== -1; });
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      /* Cache local assets atomically, CDN assets individually (partial connectivity safe) */
      var cdnPromises = CDN_URLS.map(function(url) {
        return cache.add(url).catch(function() { /* CDN unavailable — will use stale-while-revalidate */ });
      });
      return cache.addAll(LOCAL_URLS).then(function() {
        return Promise.all(cdnPromises);
      });
    })
  );
});

/* Skip waiting on user request (avoids mid-session race condition) */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) { return caches.delete(name); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  /* Navigation requests (HTML pages): network-first so updates apply immediately */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match('./index.html');
      })
    );
    return;
  }
  /* All other assets: stale-while-revalidate */
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      var networkFetch = fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function() { return null; });
      return cached || networkFetch;
    }).catch(function() { return caches.match('./index.html'); })
  );
});
