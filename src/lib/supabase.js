import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Invoke a Supabase Edge Function and extract the real error message.
 * Handles both:
 * - Functions returning HTTP 200 with { success: false, error: "..." }
 * - Functions returning HTTP 400+ where SDK puts body in error.context
 */
export async function invokeFunction(name, body = {}) {
  // Ensure we have a fresh, valid access token before calling Edge Function
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Non authentifié. Veuillez vous reconnecter.')

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  // Case 1: SDK-level error (non-2xx response)
  if (error) {
    let message = null

    // Try to extract the actual error from error.context (response body)
    const ctx = error.context
    if (ctx) {
      try {
        // ctx might be the raw body string or already parsed
        const parsed = typeof ctx === 'string' ? JSON.parse(ctx) : ctx
        if (parsed?.error) message = parsed.error
        if (parsed?.message) message = message || parsed.message
      } catch {
        // ctx is not JSON, use as-is if it's a string
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
