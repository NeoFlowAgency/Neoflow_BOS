// ============================================================
// NeoFlow BOS - Service Worker
// Handles Web Push notifications
// ============================================================

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'NeoFlow BOS', body: event.data?.text() || '' }
  }

  const title = data.title || 'NeoFlow BOS'
  const options = {
    body: data.body || '',
    icon: '/logo-neoflow-icon.png',
    badge: '/logo-neoflow-icon.png',
    data: data.data || {},
    tag: data.tag || 'neoflow-notif',
    renotify: true,
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing tab if found
        for (const client of windowClients) {
          if ('focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        // Otherwise open new tab
        return clients.openWindow(url)
      })
  )
})
