// ============================================================
// NeoFlow BOS - Edge Function: send-push
// Sends Web Push notifications to workspace subscribers
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
//
// Required secrets:
//   supabase secrets set VAPID_PUBLIC_KEY=<base64url P-256 public key>
//   supabase secrets set VAPID_PRIVATE_KEY=<base64url P-256 private key>
//   supabase secrets set VAPID_SUBJECT=mailto:contact@neoflow-agency.cloud
//
// Input: {
//   workspace_id: string,
//   notification: { title: string, body: string, tag?: string, data?: object },
//   sender_user_id?: string   // excluded from recipients
// }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

// ── Helpers ─────────────────────────────────────────────────

function base64urlToBuffer(b64url: string): Uint8Array {
  const padding = '='.repeat((4 - (b64url.length % 4)) % 4)
  const base64 = (b64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  return Uint8Array.from([...binary].map((c) => c.charCodeAt(0)))
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let str = ''
  bytes.forEach((b) => (str += String.fromCharCode(b)))
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

function jsonBase64url(obj: unknown): string {
  return bufferToBase64url(encode(JSON.stringify(obj)))
}

// ── VAPID JWT (ES256) ────────────────────────────────────────

async function createVapidJWT(
  privateKeyBytes: Uint8Array,
  publicKeyBytes: Uint8Array,
  audience: string,
  subject: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  // Build JWK from raw key bytes
  // Public key is uncompressed P-256: 0x04 || x (32 bytes) || y (32 bytes)
  const x = publicKeyBytes.slice(1, 33)
  const y = publicKeyBytes.slice(33, 65)

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: bufferToBase64url(privateKeyBytes),
    x: bufferToBase64url(x),
    y: bufferToBase64url(y),
  }

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const header = jsonBase64url({ typ: 'JWT', alg: 'ES256' })
  const payload = jsonBase64url({ aud: audience, exp: now + 43200, sub: subject })
  const signingInput = `${header}.${payload}`

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encode(signingInput),
  )

  return `${signingInput}.${bufferToBase64url(signature)}`
}

// ── RFC 8291 - Web Push Message Encryption ──────────────────

async function encryptPushPayload(
  payload: string,
  subscriberPublicKeyBytes: Uint8Array,
  authSecretBytes: Uint8Array,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  // 1. Generate ephemeral sender key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )

  // 2. Import subscriber's public key (p256dh)
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    subscriberPublicKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  // 3. ECDH → shared secret (32 bytes)
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey },
    senderKeyPair.privateKey,
    256,
  )

  // 4. Export sender public key (uncompressed, 65 bytes)
  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeyPair.publicKey),
  )

  // 5. Generate random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // 6. HKDF extract + expand (RFC 8291 / RFC 5869)
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecretBits, 'HKDF', false, [
    'deriveBits',
  ])

  // PRK-key = HKDF-Extract(salt=auth, IKM=sharedSecret)
  // Info for key material: "WebPush: info\x00" || receiverPub || senderPub
  const receiverLen = subscriberPublicKeyBytes.length
  const senderLen = senderPublicKeyRaw.length
  const keyInfoPrefix = encode('WebPush: info\x00')
  const keyInfo = new Uint8Array(keyInfoPrefix.length + receiverLen + senderLen)
  keyInfo.set(keyInfoPrefix, 0)
  keyInfo.set(subscriberPublicKeyBytes, keyInfoPrefix.length)
  keyInfo.set(senderPublicKeyRaw, keyInfoPrefix.length + receiverLen)

  // IKM = HKDF-Expand(PRK-key, keyInfo, 32)
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecretBytes, info: keyInfo },
      hkdfKey,
      256,
    ),
  )

  // PRK = HKDF-Extract(salt=salt, IKM=ikm)
  const prkKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])

  // CEK = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\x00", 16)
  const cekInfo = encode('Content-Encoding: aes128gcm\x00')
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt, info: cekInfo },
      prkKey,
      128,
    ),
  )

  // Nonce = HKDF-Expand(PRK, "Content-Encoding: nonce\x00", 12)
  const nonceInfo = encode('Content-Encoding: nonce\x00')
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt, info: nonceInfo },
      prkKey,
      96,
    ),
  )

  // 7. Encrypt with AES-128-GCM
  // Padding: 1 byte delimiter (0x02 = last record) at end of plaintext
  const plaintextBytes = encode(payload)
  const paddedPlaintext = new Uint8Array(plaintextBytes.length + 1)
  paddedPlaintext.set(plaintextBytes, 0)
  paddedPlaintext[plaintextBytes.length] = 0x02 // last record delimiter

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPlaintext)

  // 8. Build RFC 8188 header: salt(16) + rs(4) + idlen(1) + sender public key(65)
  const rs = paddedPlaintext.length + 16 // record size = plaintext + GCM tag
  const header = new Uint8Array(16 + 4 + 1 + senderPublicKeyRaw.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, rs, false) // big-endian
  header[20] = senderPublicKeyRaw.length
  header.set(senderPublicKeyRaw, 21)

  const ciphertext = new Uint8Array(header.length + encrypted.byteLength)
  ciphertext.set(header, 0)
  ciphertext.set(new Uint8Array(encrypted), header.length)

  return { ciphertext, salt, serverPublicKey: senderPublicKeyRaw }
}

// ── Send a single push notification ─────────────────────────

async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: Uint8Array,
  vapidPrivateKey: Uint8Array,
  vapidSubject: string,
): Promise<Response> {
  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`

  const jwt = await createVapidJWT(vapidPrivateKey, vapidPublicKey, audience, vapidSubject)
  const vapidPublicKeyB64 = bufferToBase64url(vapidPublicKey)

  const subscriberPublicKey = base64urlToBuffer(subscription.keys.p256dh)
  const authSecret = base64urlToBuffer(subscription.keys.auth)

  const { ciphertext } = await encryptPushPayload(payload, subscriberPublicKey, authSecret)

  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Authorization': `vapid t=${jwt},k=${vapidPublicKeyB64}`,
    },
    body: ciphertext,
  })
}

// ── Main handler ─────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { workspace_id, notification, sender_user_id } = await req.json()

    if (!workspace_id || !notification?.title) {
      return new Response(JSON.stringify({ error: 'Missing workspace_id or notification.title' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
    const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contact@neoflow-agency.cloud'

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const vapidPublicKeyBytes = base64urlToBuffer(VAPID_PUBLIC_KEY)
    const vapidPrivateKeyBytes = base64urlToBuffer(VAPID_PRIVATE_KEY)

    // Use service role key to bypass RLS when fetching subscriptions
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let query = supabase
      .from('push_subscriptions')
      .select('subscription, user_id')
      .eq('workspace_id', workspace_id)

    // Exclude the user who triggered the event
    if (sender_user_id) {
      query = query.neq('user_id', sender_user_id)
    }

    const { data: rows, error: dbError } = await query
    if (dbError) throw dbError

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = JSON.stringify(notification)
    const results = await Promise.allSettled(
      rows.map((row) => sendPush(row.subscription, payload, vapidPublicKeyBytes, vapidPrivateKeyBytes, VAPID_SUBJECT)),
    )

    // Remove expired/invalid subscriptions (410 Gone)
    const expiredEndpoints: string[] = []
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.status === 410) {
        expiredEndpoints.push(rows[i].subscription.endpoint)
      }
    })
    if (expiredEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('subscription->>endpoint', expiredEndpoints)
    }

    const sent = results.filter((r) => r.status === 'fulfilled' && (r.value.status === 200 || r.value.status === 201)).length

    return new Response(JSON.stringify({ sent, total: rows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
