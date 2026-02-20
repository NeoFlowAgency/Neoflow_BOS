import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const PRIORITIES = [
  { value: 'low', label: 'Basse', color: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'Moyenne', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'high', label: 'Haute', color: 'bg-orange-100 text-orange-700' },
  { value: 'critical', label: 'Critique', color: 'bg-red-100 text-red-700' }
]

const STATUS_LABELS = {
  open: { label: 'Ouvert', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'En cours', color: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: 'Résolu', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Fermé', color: 'bg-gray-100 text-gray-600' }
}

export default function BugReportForm() {
  const { currentWorkspace } = useWorkspace()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [screenshot, setScreenshot] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [reports, setReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(true)

  useEffect(() => {
    loadReports()
  }, [currentWorkspace?.id])

  const loadReports = async () => {
    if (!currentWorkspace?.id) return
    setLoadingReports(true)
    try {
      const { data, error } = await supabase
        .from('bug_reports')
        .select('id, title, priority, status, created_at')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setReports(data || [])
    } catch (err) {
      console.error('Erreur chargement rapports:', err)
    } finally {
      setLoadingReports(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      toast.error('Le titre et la description sont requis')
      return
    }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      let screenshotUrl = null

      // Upload screenshot if provided
      if (screenshot) {
        const ext = screenshot.name.split('.').pop()
        const fileName = `${currentWorkspace.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('bug-screenshots')
          .upload(fileName, screenshot)

        if (uploadError) {
          console.error('Erreur upload screenshot:', uploadError)
          // Continue without screenshot
        } else {
          const { data: urlData } = supabase.storage
            .from('bug-screenshots')
            .getPublicUrl(fileName)
          screenshotUrl = urlData?.publicUrl || null
        }
      }

      const { error } = await supabase
        .from('bug_reports')
        .insert({
          workspace_id: currentWorkspace.id,
          user_id: user.id,
          title: title.trim(),
          description: description.trim(),
          priority,
          screenshot_url: screenshotUrl
        })

      if (error) throw error

      // Send webhook to n8n (non-blocking)
      const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'bug_report',
            title: title.trim(),
            description: description.trim(),
            priority,
            workspace_id: currentWorkspace.id,
            workspace_name: currentWorkspace.name,
            user_name: user.user_metadata?.full_name || 'Inconnu',
            user_id: user.id,
            user_email: user.email,
            screenshot_url: screenshotUrl,
            created_at: new Date().toISOString()
          })
        }).catch(err => console.error('[BugReport] Webhook error:', err))
      }

      toast.success('Rapport envoyé ! Notre équipe le traitera rapidement.')
      setTitle('')
      setDescription('')
      setPriority('medium')
      setScreenshot(null)
      loadReports()
    } catch (err) {
      console.error('Erreur envoi rapport:', err)
      toast.error('Erreur lors de l\'envoi du rapport. Veuillez réessayer.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
  const labelClass = "block text-sm font-semibold text-[#040741] mb-2"

  return (
    <div className="space-y-6">
      {/* Bug report form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
        <h2 className="text-xl font-bold text-[#040741] mb-2">Signaler un problème</h2>
        <p className="text-gray-500 text-sm mb-6">
          Décrivez le problème rencontré. Notre équipe sera notifiée automatiquement.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Titre *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Résumé court du problème"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez le problème en détail : étapes pour le reproduire, comportement attendu, ce qui se passe réellement..."
              required
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label className={labelClass}>Priorité</label>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    priority === p.value
                      ? 'ring-2 ring-[#313ADF] ring-offset-2 ' + p.color
                      : p.color + ' opacity-60 hover:opacity-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Capture d'écran (optionnel)</label>
            <div className="relative">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file && file.size > 2 * 1024 * 1024) {
                    toast.error('La capture d\'écran ne doit pas dépasser 2 Mo')
                    e.target.value = ''
                    return
                  }
                  setScreenshot(file || null)
                }}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#313ADF]/10 file:text-[#313ADF] file:font-semibold file:text-sm hover:file:bg-[#313ADF]/20 file:cursor-pointer"
              />
              {screenshot && (
                <p className="text-xs text-green-600 mt-1">
                  {screenshot.name} ({(screenshot.size / 1024).toFixed(0)} Ko)
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !title.trim() || !description.trim()}
            className="bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Envoi...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Envoyer le rapport
              </>
            )}
          </button>
        </form>
      </div>

      {/* Previous reports */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
        <h2 className="text-xl font-bold text-[#040741] mb-4">Rapports précédents</h2>
        {loadingReports ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#313ADF] border-t-transparent"></div>
          </div>
        ) : reports.length === 0 ? (
          <p className="text-gray-400 text-center py-4">Aucun rapport de bug envoyé</p>
        ) : (
          <div className="space-y-2">
            {reports.map(r => {
              const status = STATUS_LABELS[r.status] || STATUS_LABELS.open
              const prio = PRIORITIES.find(p => p.value === r.priority) || PRIORITIES[1]
              return (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-[#040741] truncate">{r.title}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(r.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${prio.color}`}>
                      {prio.label}
                    </span>
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
