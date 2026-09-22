// ===== Service Worker - 离线缓存 =====

const CACHE_NAME = 'warehouse-app-v5';
const OFFLINE_URL = 'index.html';

// 需要缓存的核心文件
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js'
];

// 安装 - 预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.log('预缓存部分失败（CDN可能离线）:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// 激活 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// 请求拦截 - 缓存优先策略
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只缓存GET请求
  if (request.method !== 'GET') return;

  // 对于导航请求，使用网络优先，离线时回退到缓存
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // 对于其他资源，使用缓存优先，回退到网络
  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request).then((response) => {
        // 缓存成功的响应
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
