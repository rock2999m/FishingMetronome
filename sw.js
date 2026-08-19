// ========================================
// Service Worker - オフラインキャッシング対応
// ========================================

const CACHE_VERSION = 'tirava-v2.1.0';
const CACHE_NAME = `${CACHE_VERSION}-assets`;

// キャッシュ対象ファイル
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json'
];

// Service Worker インストール
self.addEventListener('install', event => {
    console.log('[SW] Installing Service Worker:', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching assets');
            return cache.addAll(urlsToCache).catch(err => {
                console.warn('[SW] Cache addAll error (partial cache ok):', err);
                // 部分的なキャッシュ失敗でも続行
                return Promise.resolve();
            });
        })
    );
    self.skipWaiting();
});

// Service Worker アクティベーション（古いキャッシュ削除）
self.addEventListener('activate', event => {
    console.log('[SW] Activating Service Worker');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch イベント（ネットワーク優先 → キャッシュフォールバック）
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // 同一オリジンのリクエストのみキャッシング対象
    if (url.origin !== location.origin) {
        return;
    }

    // GET リクエストのみ対象
    if (request.method !== 'GET') {
        return;
    }

    // ネットワーク優先戦略
    event.respondWith(
        fetch(request)
            .then(response => {
                // 成功したレスポンスをキャッシュに保存
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseToCache).catch(err => {
                            console.warn('[SW] Cache put error:', err);
                        });
                    });
                }
                return response;
            })
            .catch(err => {
                // ネットワーク失敗時はキャッシュから取得
                console.log('[SW] Network error, falling back to cache:', request.url);
                return caches.match(request)
                    .then(response => {
                        if (response) {
                            return response;
                        }
                        // キャッシュもない場合
                        return new Response('オフラインです。アプリを再度開いてください。', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({
                                'Content-Type': 'text/plain; charset=utf-8'
                            })
                        });
                    });
            })
    );
});

// バックグラウンド同期（オプション）
self.addEventListener('sync', event => {
    if (event.tag === 'sync-presets') {
        event.waitUntil(
            // プリセットをクラウドに同期する場合はここに実装
            Promise.resolve()
        );
    }
});

// プッシュ通知（オプション）
self.addEventListener('push', event => {
    if (!event.data) return;
    
    const data = event.data.json();
    const options = {
        body: data.body || 'タイラバメトロノーム',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><circle cx="96" cy="96" r="90" fill="%23FFD700"/></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="45" fill="%23FFD700"/></svg>',
        tag: 'tirava-notification',
        requireInteraction: false
    };

    event.waitUntil(
        self.registration.showNotification('タイラバメトロノーム', options)
    );
});

// 通知クリック時
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            const appUrl = new URL('./', self.registration.scope).href;
            // 既に開いているウィンドウに焦点を当てる
            for (let client of clientList) {
                if (client.url.startsWith(appUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            // 開いていなければ新しいウィンドウで開く
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});

// メッセージ受信（クライアント ←→ Service Worker）
self.addEventListener('message', event => {
    const { type, data } = event.data;

    if (type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(CACHE_NAME).then(cache => {
                return cache.addAll(data.urls).catch(err => {
                    console.warn('[SW] Additional cache error:', err);
                });
            })
        );
    }

    if (type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.delete(CACHE_NAME).then(() => {
                event.ports[0].postMessage({ success: true });
            })
        );
    }
});

console.log('[SW] Service Worker script loaded');
