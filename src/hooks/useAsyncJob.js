import { useState, useCallback } from 'react'
import { jobService } from '../services/jobService'

export function useAsyncJob() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const executeJob = useCallback(async (endpoint, payload) => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.message || 'Erreur lors de la requête')
      }

      const data = await response.json()

      // If the response contains a job_id, poll for completion
      if (data.job_id) {
        const jobResult = await jobService.pollJobStatus(data.job_id)

        if (jobResult.success) {
          const parsed = typeof jobResult.result === 'string'
            ? JSON.parse(jobResult.result)
            : jobResult.result
          setResult(parsed)
          return parsed
        } else {
          throw new Error(jobResult.error || 'Le traitement a échoué')
        }
      }

      // No job_id means synchronous response
      setResult(data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setResult(null)
  }, [])

  return { executeJob, loading, error, result, reset }
}
