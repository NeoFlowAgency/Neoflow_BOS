// ============================================================
// NeoFlow BOS - Web Push Notifications
// ============================================================

import { supabase } from './supabase'

// VAPID public key — public by design (the private key is in Supabase secrets)
// Valid P-256 uncompressed public key (65 bytes, first byte 0x04)
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BA4111hrDMpz3gwxc4ZnjUwh8NKJpHvdq1TLN86ZYjEksGDxzfueYTDYjVXZ4PQVMB9TQwo1hLErQfIey7_Dc7w'

/**
 * Convert a base64url VAPID public key to Uint8Array
 * (required by PushManager.subscribe applicationServerKey)
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

/**
 * Register the service worker (call once at app startup)
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    return registration
  } catch (err) {
    console.warn('Service worker registration failed:', err)
    return null
  }
}

/**
 * Check whether push notifications are currently active for this browser session.
 */
export async function getSubscriptionStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if (Notification.permission !== 'granted') return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return !!subscription
  } catch {
    return false
  }
}

/**
 * Request permission, subscribe this device/browser, and persist the subscription
 * in the push_subscriptions table for the given workspace.
 * Replaces any previous subscription for this user+workspace (one device at a time).
 */
export async function subscribeToPush(workspaceId, userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Les notifications push ne sont pas supportées par ce navigateur.')
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VAPID_PUBLIC_KEY manquant (VITE_VAPID_PUBLIC_KEY non configuré).')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permission de notifications refusée.')
  }

  const registration = await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  // Replace any previous subscription for this user+workspace
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)

  const { error } = await supabase.from('push_subscriptions').insert({
    workspace_id: workspaceId,
    user_id: userId,
    subscription: subscription.toJSON(),
  })
  if (error) throw error

  return subscription
}

/**
 * Unsubscribe this browser and remove the entry from the DB.
 */
export async function unsubscribeFromPush(workspaceId, userId) {
  try {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) await subscription.unsubscribe()
    }
  } catch (err) {
    console.warn('unsubscribe browser error:', err)
  }

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
}

/**
 * Send a push notification to all subscribers of a workspace,
 * excluding the sender (to avoid self-notifications).
 *
 * @param {string} workspaceId
 * @param {{ title: string, body: string, tag?: string, data?: object }} notification
 * @param {string|null} senderUserId  User who triggered the event (excluded from recipients)
 */
export async function sendPushToWorkspace(workspaceId, notification, senderUserId = null) {
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { workspace_id: workspaceId, notification, sender_user_id: senderUserId },
    })
    if (error) console.warn('send-push error:', error)
  } catch (err) {
    // Non-blocking: push failures should never break the main action
    console.warn('sendPushToWorkspace failed:', err)
  }
}
