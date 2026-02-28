import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Invoke a Supabase Edge Function and extract the real error message.
 * All Edge Functions should be deployed with --no-verify-jwt
 * (they handle auth internally via supabase.auth.getUser(token)).
 */
export async function invokeFunction(name, body = {}) {
  // Get a fresh session - refreshSession() auto-refreshes expired tokens
  let accessToken = null
  try {
    const { data } = await supabase.auth.refreshSession()
    accessToken = data?.session?.access_token
  } catch {
    // Fallback to cached session
    const { data: { session } } = await supabase.auth.getSession()
    accessToken = session?.access_token
  }

  if (!accessToken) throw new Error('Non authentifié. Veuillez vous reconnecter.')

  // Use raw fetch for reliable header control (avoids SDK header conflicts)
  const response = await fetch(
    `${supabaseUrl}/functions/v1/${name}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify(body),
    }
  )

  let data
  try { data = await response.json() } catch { data = {} }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erreur HTTP ${response.status}`)
  }

  // Application-level error (HTTP 200 but { success: false })
  if (data?.success === false || data?.error) {
    throw new Error(data.error || `Erreur dans ${name}`)
  }

  return data
}
