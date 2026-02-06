import { supabase } from '../lib/supabase'

export const jobService = {
  /**
   * Poll job status every 2 seconds for max 30 seconds
   */
  async pollJobStatus(jobId, maxAttempts = 15) {
    for (let i = 0; i < maxAttempts; i++) {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (error) {
        console.error('[jobService] Poll error:', error.message)
        await new Promise(resolve => setTimeout(resolve, 2000))
        continue
      }

      if (data.status === 'completed') {
        return { success: true, result: data.result }
      }

      if (data.status === 'failed') {
        return { success: false, error: data.result?.error || 'Job failed' }
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    return { success: false, error: 'Timeout: le traitement prend trop de temps' }
  },

  /**
   * Subscribe to realtime job updates
   */
  subscribeToJob(jobId, onUpdate) {
    return supabase
      .channel(`job:${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`
      }, (payload) => onUpdate(payload.new))
      .subscribe()
  },

  /**
   * Unsubscribe from job channel
   */
  unsubscribe(channel) {
    if (channel) {
      supabase.removeChannel(channel)
    }
  }
}
