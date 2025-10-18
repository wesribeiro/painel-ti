// public/service-worker.js
self.addEventListener('install', (event) => {
    console.log('Service Worker instalado com sucesso!');
});

self.addEventListener('fetch', (event) => {
    // Por enquanto, não faz nada, apenas deixa a requisição passar.
    event.respondWith(fetch(event.request));
});