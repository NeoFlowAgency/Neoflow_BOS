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

/**
 * Stream une réponse de l'Edge Function neo-chat via Server-Sent Events.
 * @param {object} payload - { message, context, history }
 * @param {(token: string) => void} onToken - appelé pour chaque token reçu
 * @param {() => void} onDone - appelé quand le stream est terminé
 * @param {(err: Error) => void} onError - appelé en cas d'erreur
 * @param {AbortSignal} [signal] - pour annuler le stream
 */
export async function streamNeoChat(payload, onToken, onDone, onError, signal) {
  let accessToken = null
  try {
    const { data } = await supabase.auth.refreshSession()
    accessToken = data?.session?.access_token
  } catch {
    const { data: { session } } = await supabase.auth.getSession()
    accessToken = session?.access_token
  }

  if (!accessToken) {
    onError(new Error('Non authentifié. Veuillez vous reconnecter.'))
    return
  }

  let response
  try {
    response = await fetch(
      `${supabaseUrl}/functions/v1/neo-chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify(payload),
        signal,
      }
    )
  } catch (err) {
    if (err?.name === 'AbortError') return
    onError(err)
    return
  }

  if (!response.ok) {
    let msg = `Erreur HTTP ${response.status}`
    try { const d = await response.json(); msg = d.error || d.message || msg } catch {}
    onError(new Error(msg))
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') { onDone(); return }
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) { onError(new Error(parsed.error)); return }
          if (parsed.t) onToken(parsed.t)
        } catch { /* skip invalid JSON */ }
      }
    }
    onDone()
  } catch (err) {
    if (err?.name === 'AbortError') return
    onError(err)
  }
}
