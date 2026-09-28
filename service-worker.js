// ===== Service Worker - 离线缓存 =====

const CACHE_NAME = 'warehouse-app-v10';
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

// 请求拦截 - 后台更新策略（网络优先，同时更新缓存）
// 关键：核心脚本用"有缓存先用 + 后台拉最新"，避免用户被困在旧版本
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只处理GET请求
  if (request.method !== 'GET') return;

  // 导航请求：网络优先，离线回退缓存
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

  // 其他资源：后台更新（先给缓存，后台拉新版本刷新缓存）
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      // 有缓存就用缓存（快），同时后台用网络更新
      return cached || networkFetch;
    })
  );
});
