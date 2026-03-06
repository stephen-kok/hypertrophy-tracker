/* CACHE_NAME must match APP_VERSION in app.js — bump both together */
var CACHE_NAME = 'hypertrophy-v55';
var URLS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './configs/profiles.json',
  './configs/stephen.json',
  './configs/james.json',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js'
];

self.addEventListener('install', function(event) {
  /* skipWaiting() is triggered via SKIP_WAITING message to avoid mid-session race conditions */
  var LOCAL_URLS = URLS_TO_CACHE.filter(function(u) { return u.indexOf('://') === -1; });
  var CDN_URLS = URLS_TO_CACHE.filter(function(u) { return u.indexOf('://') !== -1; });
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      /* Cache local assets atomically, CDN assets individually (partial connectivity safe) */
      var cdnPromises = CDN_URLS.map(function(url) {
        return cache.add(url); /* CDN must be cached — React is required for the app to function */
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
  if (event.data && event.data.type === 'SHOW_TIMER_NOTIFICATION') {
    self.registration.showNotification('Rest Complete', {
      body: 'Time for your next set!',
      tag: 'rest-timer',
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200]
    }).catch(function(){});
  }
  if (event.data && event.data.type === 'CACHE_CONFIG' && event.data.url) {
    var url = event.data.url;
    /* Only cache same-origin relative URLs to prevent cache poisoning */
    var isSafeUrl = (url.startsWith('./') || (url.startsWith('/') && !url.startsWith('//'))) && url.indexOf('://') === -1;
    if (isSafeUrl) {
      caches.open(CACHE_NAME).then(function(cache) {
        cache.add(url).catch(function() {});
      });
    }
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
  /* Navigation, app.js, styles.css, and config JSON files: network-first so updates apply immediately */
  var reqUrl = event.request.url;
  var isNetworkFirst = event.request.mode === 'navigate' ||
    reqUrl.endsWith('/app.js') || reqUrl.endsWith('/styles.css') ||
    reqUrl.indexOf('/configs/') !== -1;
  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function() {
        return caches.match(new Request('./index.html'));
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
      return cached || networkFetch.then(function(r){ return r || new Response('Not available offline',{status:503,statusText:'Service Unavailable'}); });
    }).catch(function() { return new Response('Not available offline', {status: 503, statusText: 'Service Unavailable'}); })
  );
});
