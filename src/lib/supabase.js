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

  // Call the Edge Function with explicit auth header
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  // Case 1: SDK-level error (non-2xx response)
  if (error) {
    let message = null

    // Try to extract the actual error from error.context (response body)
    const ctx = error.context
    if (ctx) {
      try {
        // ctx can be a Response object, a string, or already parsed
        let parsed = ctx
        if (ctx instanceof Response) {
          try { parsed = await ctx.json() } catch { parsed = null }
        } else if (typeof ctx === 'string') {
          parsed = JSON.parse(ctx)
        }
        if (parsed?.error) message = parsed.error
        if (parsed?.message) message = message || parsed.message
      } catch {
        if (typeof ctx === 'string' && ctx.length < 200) message = ctx
      }
    }

    throw new Error(message || error.message || `Erreur appel ${name}`)
  }

  // Case 2: HTTP 200 but application-level error
  if (data?.success === false || data?.error) {
    throw new Error(data.error || `Erreur dans ${name}`)
  }

  return data
}
