#!/usr/bin/env node
// Generate VAPID key pair for Web Push notifications
// Usage: node scripts/generate-vapid-keys.js

const { generateKeyPairSync, createPublicKey } = require('crypto')

function toBase64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })

// Export private key raw scalar (32 bytes)
const privDer = privateKey.export({ type: 'pkcs8', format: 'der' })
// PKCS#8 EC P-256: private key scalar starts at byte 36 (after header)
const privRaw = privDer.slice(36, 68)

// Export public key uncompressed point (04 || x || y = 65 bytes)
const pubDer = publicKey.export({ type: 'spki', format: 'der' })
// SPKI EC P-256: public key starts at byte 27 (after OID headers)
const pubRaw = pubDer.slice(27)

console.log('\nVAPID keys generated:\n')
console.log('Public key (add to .env as VITE_VAPID_PUBLIC_KEY):')
console.log(toBase64url(pubRaw))
console.log('\nPrivate key (add to Supabase secrets as VAPID_PRIVATE_KEY):')
console.log(toBase64url(privRaw))
console.log('\nPublic key (add to Supabase secrets as VAPID_PUBLIC_KEY — same as above):')
console.log(toBase64url(pubRaw))
console.log('\nRun these commands:')
console.log(`  supabase secrets set VAPID_PUBLIC_KEY=${toBase64url(pubRaw)}`)
console.log(`  supabase secrets set VAPID_PRIVATE_KEY=${toBase64url(privRaw)}`)
console.log('  supabase secrets set VAPID_SUBJECT=mailto:contact@yourdomain.com')
console.log('')
