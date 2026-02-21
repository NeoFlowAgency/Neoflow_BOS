import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { translateError } from '../lib/errorMessages'
import { updateWorkspace, createPortalSession } from '../services/workspaceService'
import { createInvitation, listInvitations, revokeInvitation } from '../services/invitationService'
import { ROLE_LABELS, ROLE_COLORS, getAssignableRoles, canManageRole } from '../lib/permissions'
import BugReportForm from '../components/BugReportForm'

const LEGAL_FORMS = ['SAS', 'SARL', 'EURL', 'SCI', 'Auto-entrepreneur', 'SA', 'SNC', 'Autre']
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF']
const COUNTRIES = ['France', 'Belgique', 'Suisse', 'Luxembourg', 'Canada', 'Autre']

export default function Settings() {
  const navigate = useNavigate()
  const { workspaces, currentWorkspace, isAdmin, isOwner, role: myRole, switchWorkspace, refreshWorkspaces } = useWorkspace()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('compte')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Account form
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)

  // Password reset via email
  const [passwordResetSending, setPasswordResetSending] = useState(false)
  const [passwordResetSent, setPasswordResetSent] = useState(false)
  const [passwordResetCooldown, setPasswordResetCooldown] = useState(0)

  // Workspace form
  const [wsForm, setWsForm] = useState({
    name: '', description: '', address: '', postal_code: '', city: '',
    country: 'France', currency: 'EUR', siret: '', vat_number: '', legal_form: 'SAS',
    phone: '', email: '', website: '',
    bank_iban: '', bank_bic: '', bank_account_holder: '',
    payment_terms: '', invoice_footer: '', quote_footer: ''
  })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [wsSaving, setWsSaving] = useState(false)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  // Invitations
  const [invitations, setInvitations] = useState([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [inviteRole, setInviteRole] = useState('vendeur')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteCreating, setInviteCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Member info
  const [selectedMember, setSelectedMember] = useState(null)

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteAction, setDeleteAction] = useState('delete_workspace')
  const [transferTarget, setTransferTarget] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmWsName, setConfirmWsName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')


  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    if (currentWorkspace) {
      setWsForm({
        name: currentWorkspace.name || '',
        description: currentWorkspace.description || '',
        address: currentWorkspace.address || '',
        postal_code: currentWorkspace.postal_code || '',
        city: currentWorkspace.city || '',
        country: currentWorkspace.country || 'France',
        currency: currentWorkspace.currency || 'EUR',
        siret: currentWorkspace.siret || '',
        vat_number: currentWorkspace.vat_number || '',
        legal_form: currentWorkspace.legal_form || 'SAS',
        phone: currentWorkspace.phone || '',
        email: currentWorkspace.email || '',
        website: currentWorkspace.website || '',
        bank_iban: currentWorkspace.bank_iban || '',
        bank_bic: currentWorkspace.bank_bic || '',
        bank_account_holder: currentWorkspace.bank_account_holder || '',
        payment_terms: currentWorkspace.payment_terms || '',
        invoice_footer: currentWorkspace.invoice_footer || '',
        quote_footer: currentWorkspace.quote_footer || '',
      })
      setLogoPreview(currentWorkspace.logo_url || null)
      loadMembers()
      loadInvitations()
    }
  }, [currentWorkspace?.id])

  const loadUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setFullName(user?.user_metadata?.full_name || '')
    } catch (err) {
      console.error('Erreur chargement user:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    if (!currentWorkspace?.id) return
    setMembersLoading(true)
    try {
      const { data, error } = await supabase
        .from('workspace_users')
        .select('user_id, role, created_at')
        .eq('workspace_id', currentWorkspace.id)

      if (error) throw error

      // Load profiles for member names
      const userIds = (data || []).map(m => m.user_id)
      let profiles = {}
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds)

        if (profileData) {
          profileData.forEach(p => { profiles[p.id] = p.full_name })
        }
      }

      setMembers((data || []).map(m => ({
        ...m,
        full_name: profiles[m.user_id] || null
      })))
    } catch (err) {
      console.error('Erreur chargement membres:', err)
    } finally {
      setMembersLoading(false)
    }
  }

  const loadInvitations = async () => {
    if (!currentWorkspace?.id) return
    setInvitationsLoading(true)
    try {
      const data = await listInvitations(currentWorkspace.id)
      setInvitations(data)
    } catch (err) {
      console.error('Erreur chargement invitations:', err)
    } finally {
      setInvitationsLoading(false)
    }
  }

  const handleCreateInvitation = async () => {
    setInviteCreating(true)
    setInviteUrl('')
    setCopied(false)
    try {
      const { url } = await createInvitation(
        currentWorkspace.id,
        inviteRole,
        inviteEmail.trim() || null
      )
      setInviteUrl(url)
      setInviteEmail('')
      loadInvitations()
      toast.success('Invitation créée')
    } catch (err) {
      toast.error(translateError(err))
    } finally {
      setInviteCreating(false)
    }
  }

  const handleRevokeInvitation = async (id) => {
    try {
      await revokeInvitation(id)
      toast.success('Invitation révoquée')
      loadInvitations()
    } catch (err) {
      toast.error(translateError(err))
    }
  }

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      toast.success('Lien copié')
      setTimeout(() => setCopied(false), 3000)
    } catch {
      toast.error('Impossible de copier le lien')
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() }
      })
      if (error) throw error
      toast.success('Profil mis à jour')
    } catch (err) {
      toast.error(translateError(err))
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordResetEmail = async () => {
    if (!user?.email) return
    setPasswordResetSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setPasswordResetSent(true)
      toast.success('Email envoyé ! Vérifiez votre boîte mail.')
      // Start cooldown
      setPasswordResetCooldown(60)
      const interval = setInterval(() => {
        setPasswordResetCooldown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      console.error('[password-reset] Error:', err.message || err)
      const msg = err.message || ''
      if (msg.includes('rate limit') || msg.includes('only request this once') || msg.includes('security purposes')) {
        toast.error('Veuillez patienter quelques minutes avant de refaire une demande.')
        setPasswordResetCooldown(120)
        const interval = setInterval(() => {
          setPasswordResetCooldown(prev => {
            if (prev <= 1) { clearInterval(interval); return 0 }
            return prev - 1
          })
        }, 1000)
      } else {
        toast.error(translateError(err))
      }
    } finally {
      setPasswordResetSending(false)
    }
  }

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Le logo doit être au format PNG ou JPEG')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Le logo ne doit pas dépasser 2 Mo')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleSaveWorkspace = async () => {
    if (!wsForm.name.trim()) {
      toast.error('Le nom du workspace est requis')
      return
    }
    setWsSaving(true)
    try {
      let logoUrl = currentWorkspace.logo_url || null
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const fileName = `${currentWorkspace.id}-${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('workspace-logos')
          .upload(fileName, logoFile, { contentType: logoFile.type, upsert: true })
        if (uploadError) {
          console.error('[Settings] Logo upload error:', uploadError)
          toast.error('Erreur upload logo: ' + uploadError.message)
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('workspace-logos')
            .getPublicUrl(fileName)
          logoUrl = publicUrl
        }
      }

      await updateWorkspace(currentWorkspace.id, {
        name: wsForm.name.trim(),
        description: wsForm.description.trim() || null,
        address: wsForm.address.trim() || null,
        postal_code: wsForm.postal_code.trim() || null,
        city: wsForm.city.trim() || null,
        country: wsForm.country,
        currency: wsForm.currency,
        siret: wsForm.siret.replace(/\s/g, '') || null,
        vat_number: wsForm.vat_number.replace(/\s/g, '') || null,
        legal_form: wsForm.legal_form,
        phone: wsForm.phone.trim() || null,
        email: wsForm.email.trim() || null,
        website: wsForm.website.trim() || null,
        bank_iban: wsForm.bank_iban.replace(/\s/g, '') || null,
        bank_bic: wsForm.bank_bic.replace(/\s/g, '') || null,
        bank_account_holder: wsForm.bank_account_holder.trim() || null,
        payment_terms: wsForm.payment_terms.trim() || null,
        invoice_footer: wsForm.invoice_footer.trim() || null,
        quote_footer: wsForm.quote_footer.trim() || null,
        logo_url: logoUrl,
      })
      setLogoFile(null)
      toast.success('Workspace mis à jour')
      refreshWorkspaces()
    } catch (err) {
      toast.error(translateError(err))
    } finally {
      setWsSaving(false)
    }
  }

  const handleChangeRole = async (userId, newRole) => {
    try {
      const { error } = await supabase
        .from('workspace_users')
        .update({ role: newRole })
        .eq('workspace_id', currentWorkspace.id)
        .eq('user_id', userId)

      if (error) throw error
      toast.success('Rôle mis à jour')
      loadMembers()
    } catch (err) {
      toast.error(translateError(err))
    }
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      // Verify password first
      if (isOwner && confirmPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user?.email,
          password: confirmPassword
        })
        if (signInError) {
          setDeleteError('Mot de passe incorrect')
          setDeleting(false)
          return
        }
      }

      // Build request body - always include action and workspace_id
      const body = {}
      if (isOwner && currentWorkspace) {
        body.action = deleteAction
        body.workspace_id = currentWorkspace.id
        if (deleteAction === 'transfer' && transferTarget) {
          body.transfer_to = transferTarget
        }
      }

      // Force refresh session to get a guaranteed fresh token
      const { data: refreshData } = await supabase.auth.refreshSession()
      let token = refreshData?.session?.access_token
      if (!token) {
        const { data: { session } } = await supabase.auth.getSession()
        token = session?.access_token
      }
      if (!token) throw new Error('Session expirée. Veuillez vous reconnecter.')

      console.log('[delete-account] isOwner:', isOwner, 'deleteAction:', deleteAction, 'workspace:', currentWorkspace?.id)
      console.log('[delete-account] Sending body:', JSON.stringify(body))

      // Use raw fetch for full control over headers
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(body),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[delete-account] Response error:', response.status, errorData)
        throw new Error(errorData.error || `Erreur ${response.status}`)
      }

      const fnData = await response.json()
      console.log('[delete-account] Response data:', JSON.stringify(fnData))

      // Edge Function returns { requires_action: true } if no action was sent
      if (fnData?.requires_action) {
        throw new Error('Action requise pour le workspace. Veuillez réessayer.')
      }

      // Require explicit success
      if (!fnData?.success) {
        throw new Error(fnData?.error || 'La suppression n\'a pas abouti. Veuillez réessayer.')
      }

      // Account deleted - clear local session and hard redirect
      console.log('[delete-account] Account deleted, redirecting...')
      try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
      localStorage.clear()
      sessionStorage.clear()
      window.location.href = '/login?account_deleted=1'
    } catch (err) {
      console.error('[delete-account] ERROR:', err)
      const errorMsg = err.message || 'Erreur lors de la suppression du compte'
      setDeleteError(errorMsg)
      toast.error(errorMsg)
      setDeleting(false)
    }
  }

  const handleManageBilling = async () => {
    try {
      if (!currentWorkspace?.stripe_customer_id) {
        toast.error('Aucun abonnement Stripe actif pour ce workspace. Créez d\'abord un abonnement.')
        return
      }
      const { url } = await createPortalSession(currentWorkspace.id)
      window.location.href = url
    } catch (err) {
      console.error('Erreur gestion abonnement:', err)
      toast.error(translateError(err))
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
  const inputDisabledClass = "w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
  const labelClass = "block text-sm font-semibold text-[#040741] mb-2"

  const tabs = [
    { key: 'compte', label: 'Compte' },
    ...(isAdmin ? [{ key: 'workspace', label: 'Workspace' }] : []),
    ...(isOwner ? [{ key: 'abonnement', label: 'Abonnement' }] : []),
    { key: 'support', label: 'Support' }
  ]

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  // Full-screen loading during account deletion
  if (deleting) {
    return (
      <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-500 border-t-transparent mb-4"></div>
        <p className="text-[#040741] font-semibold text-lg">Suppression de votre compte...</p>
        <p className="text-gray-400 text-sm mt-2">Veuillez patienter, vous allez être redirigé</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-2">Paramètres</h1>
        <p className="text-gray-500">Gérez votre compte et votre workspace</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[#313ADF] text-[#313ADF]'
                : 'border-transparent text-gray-500 hover:text-[#040741]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Compte */}
      {activeTab === 'compte' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <h2 className="text-xl font-bold text-[#040741] mb-6">Informations du compte</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nom complet</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" value={user?.email || ''} disabled className={inputDisabledClass} />
                <p className="text-xs text-gray-400 mt-1">L'email ne peut pas être modifié</p>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50"
              >
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <h2 className="text-xl font-bold text-[#040741] mb-2">Modifier le mot de passe</h2>
            <p className="text-gray-500 text-sm mb-6">
              Un email vous sera envoyé avec un lien pour modifier votre mot de passe.
            </p>

            {passwordResetSent && (
              <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Un email a été envoyé à <span className="font-semibold">{user?.email}</span>. Vérifiez votre boîte mail (et vos spams).
              </div>
            )}

            <button
              onClick={handlePasswordResetEmail}
              disabled={passwordResetSending || passwordResetCooldown > 0}
              className="bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {passwordResetSending ? 'Envoi...' : passwordResetCooldown > 0 ? `Renvoyer dans ${passwordResetCooldown}s` : 'Modifier mon mot de passe'}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-red-100 shadow-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#040741]">Déconnexion</h2>
                <p className="text-gray-500 text-sm">Se déconnecter de votre compte</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-xl font-semibold hover:bg-red-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Se déconnecter
              </button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="bg-white rounded-2xl border-2 border-red-200 shadow-lg p-6">
            <h2 className="text-lg font-bold text-red-600 mb-2">Zone dangereuse</h2>
            <p className="text-gray-500 text-sm mb-4">
              La suppression de votre compte est irréversible. Toutes vos données seront supprimées.
            </p>
            <button
              onClick={() => { setShowDeleteModal(true); setConfirmEmail(''); setConfirmPassword(''); setConfirmWsName(''); setDeleteAction('delete_workspace'); setTransferTarget(''); setDeleteError('') }}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Supprimer mon compte
            </button>
          </div>
        </div>
      )}

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-red-600 mb-4">Supprimer mon compte</h2>

            {isOwner && currentWorkspace ? (
              <div className="space-y-4 mb-6">
                {/* Warning banner */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div className="text-sm text-red-700">
                      <p className="font-semibold mb-1">Attention : cette action est irréversible</p>
                      <ul className="list-disc list-inside space-y-1 text-red-600">
                        <li>Votre abonnement Stripe sera annulé</li>
                        <li>Toutes les données du workspace seront perdues</li>
                        <li>Les autres membres perdront l'accès</li>
                        <li>Les factures, devis et clients seront supprimés</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600">
                  Vous êtes propriétaire du workspace <span className="font-semibold">{currentWorkspace.name}</span>. Que souhaitez-vous faire ?
                </p>

                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="deleteAction"
                      value="delete_workspace"
                      checked={deleteAction === 'delete_workspace'}
                      onChange={() => setDeleteAction('delete_workspace')}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-semibold text-[#040741]">Supprimer le workspace</p>
                      <p className="text-xs text-gray-500">L'abonnement sera annulé et le workspace désactivé</p>
                    </div>
                  </label>

                  {members.filter(m => m.user_id !== user?.id).length > 0 && (
                    <label className="flex items-start gap-3 p-3 border rounded-xl cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="deleteAction"
                        value="transfer"
                        checked={deleteAction === 'transfer'}
                        onChange={() => setDeleteAction('transfer')}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="font-semibold text-[#040741]">Transférer la propriété</p>
                        <p className="text-xs text-gray-500 mb-2">Un autre membre deviendra propriétaire</p>
                        {deleteAction === 'transfer' && (
                          <select
                            value={transferTarget}
                            onChange={(e) => setTransferTarget(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                          >
                            <option value="">Choisir un membre...</option>
                            {members.filter(m => m.user_id !== user?.id).map(m => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.full_name || 'Membre'} ({m.role})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-6">
                Votre compte sera supprimé et vous serez retiré de tous les workspaces. Cette action est irréversible.
              </p>
            )}

            {deleteError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                <p className="font-semibold mb-1">Erreur :</p>
                <p>{deleteError}</p>
              </div>
            )}

            <div className="space-y-4 mb-4">
              {/* Password verification (owner only) */}
              {isOwner && (
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">
                    Mot de passe actuel
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Entrez votre mot de passe"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                  />
                </div>
              )}

              {/* Workspace name confirmation (owner + delete_workspace only) */}
              {isOwner && deleteAction === 'delete_workspace' && currentWorkspace && (
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">
                    Recopiez le nom du workspace : <span className="text-red-500">{currentWorkspace.name}</span>
                  </label>
                  <input
                    type="text"
                    value={confirmWsName}
                    onChange={(e) => setConfirmWsName(e.target.value)}
                    placeholder={currentWorkspace.name}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                  />
                </div>
              )}

              {/* Email confirmation */}
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">
                  Tapez votre email pour confirmer : <span className="text-red-500">{user?.email}</span>
                </label>
                <input
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder={user?.email}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={
                  deleting ||
                  confirmEmail !== user?.email ||
                  (isOwner && !confirmPassword) ||
                  (isOwner && deleteAction === 'delete_workspace' && confirmWsName !== currentWorkspace?.name) ||
                  (deleteAction === 'transfer' && !transferTarget)
                }
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member info modal */}
      {selectedMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#040741]">Informations du membre</h2>
              <button
                onClick={() => setSelectedMember(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-[#313ADF]">
                  {(selectedMember.full_name || 'M').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-lg font-bold text-[#040741]">
                  {selectedMember.user_id === user?.id ? 'Vous' : (selectedMember.full_name || 'Membre')}
                </p>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[selectedMember.role] || 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABELS[selectedMember.role] || selectedMember.role}
                </span>
              </div>
            </div>

            <div className="space-y-3 bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <p className="text-xs text-gray-400">Nom</p>
                  <p className="text-sm font-medium text-[#040741]">{selectedMember.full_name || 'Non renseigné'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div>
                  <p className="text-xs text-gray-400">Rôle</p>
                  <p className="text-sm font-medium text-[#040741]">
                    {ROLE_LABELS[selectedMember.role] || selectedMember.role}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-xs text-gray-400">Membre depuis</p>
                  <p className="text-sm font-medium text-[#040741]">
                    {selectedMember.created_at ? new Date(selectedMember.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Inconnue'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                </svg>
                <div>
                  <p className="text-xs text-gray-400">ID utilisateur</p>
                  <p className="text-xs font-mono text-gray-500">{selectedMember.user_id?.slice(0, 8)}...</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedMember(null)}
              className="mt-6 w-full py-3 bg-gray-100 text-[#040741] rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Tab: Workspace */}
      {activeTab === 'workspace' && (
        <div className="space-y-6">
          {/* Workspace info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#040741]">Informations du workspace</h2>
              {!isAdmin && (
                <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
                  Seul l'administrateur peut modifier
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Nom *</label>
                <input
                  type="text"
                  value={wsForm.name}
                  onChange={(e) => setWsForm({ ...wsForm, name: e.target.value })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  value={wsForm.description}
                  onChange={(e) => setWsForm({ ...wsForm, description: e.target.value })}
                  disabled={!isAdmin}
                  rows={2}
                  className={`${isAdmin ? inputClass : inputDisabledClass} resize-none`}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Adresse</label>
                <input
                  type="text"
                  value={wsForm.address}
                  onChange={(e) => setWsForm({ ...wsForm, address: e.target.value })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                />
              </div>
              <div>
                <label className={labelClass}>Code postal</label>
                <input
                  type="text"
                  value={wsForm.postal_code}
                  onChange={(e) => setWsForm({ ...wsForm, postal_code: e.target.value })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                />
              </div>
              <div>
                <label className={labelClass}>Ville</label>
                <input
                  type="text"
                  value={wsForm.city}
                  onChange={(e) => setWsForm({ ...wsForm, city: e.target.value })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                />
              </div>
              <div>
                <label className={labelClass}>Pays</label>
                <select
                  value={wsForm.country}
                  onChange={(e) => setWsForm({ ...wsForm, country: e.target.value })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Devise</label>
                <select
                  value={wsForm.currency}
                  onChange={(e) => setWsForm({ ...wsForm, currency: e.target.value })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>SIRET</label>
                <input
                  type="text"
                  value={wsForm.siret}
                  onChange={(e) => setWsForm({ ...wsForm, siret: e.target.value.replace(/\D/g, '').slice(0, 14) })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                />
              </div>
              <div>
                <label className={labelClass}>Numéro TVA</label>
                <input
                  type="text"
                  value={wsForm.vat_number}
                  onChange={(e) => setWsForm({ ...wsForm, vat_number: e.target.value.toUpperCase() })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                />
              </div>
              <div>
                <label className={labelClass}>Forme juridique</label>
                <select
                  value={wsForm.legal_form}
                  onChange={(e) => setWsForm({ ...wsForm, legal_form: e.target.value })}
                  disabled={!isAdmin}
                  className={isAdmin ? inputClass : inputDisabledClass}
                >
                  {LEGAL_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Slug</label>
                <input
                  type="text"
                  value={currentWorkspace?.slug || ''}
                  disabled
                  className={inputDisabledClass}
                />
                <p className="text-xs text-gray-400 mt-1">Utilisé pour la numérotation</p>
              </div>
            </div>

            {/* Contact */}
            {isAdmin && (
              <>
                <div className="border-t border-gray-100 mt-6 pt-6">
                  <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-4">Contact</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Telephone</label>
                      <input type="tel" value={wsForm.phone} onChange={(e) => setWsForm({ ...wsForm, phone: e.target.value })} className={inputClass} placeholder="01 23 45 67 89" />
                    </div>
                    <div>
                      <label className={labelClass}>Email professionnel</label>
                      <input type="email" value={wsForm.email} onChange={(e) => setWsForm({ ...wsForm, email: e.target.value })} className={inputClass} placeholder="contact@entreprise.fr" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Site web</label>
                      <input type="url" value={wsForm.website} onChange={(e) => setWsForm({ ...wsForm, website: e.target.value })} className={inputClass} placeholder="https://www.entreprise.fr" />
                    </div>
                  </div>
                </div>

                {/* Banque & Paiement */}
                <div className="border-t border-gray-100 mt-6 pt-6">
                  <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-4">Banque & Paiement</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>IBAN</label>
                      <input type="text" value={wsForm.bank_iban} onChange={(e) => setWsForm({ ...wsForm, bank_iban: e.target.value.toUpperCase() })} className={inputClass} placeholder="FR76 1234 5678 9012 3456 7890 123" />
                    </div>
                    <div>
                      <label className={labelClass}>BIC / SWIFT</label>
                      <input type="text" value={wsForm.bank_bic} onChange={(e) => setWsForm({ ...wsForm, bank_bic: e.target.value.toUpperCase() })} className={inputClass} placeholder="BNPAFRPP" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Titulaire du compte</label>
                      <input type="text" value={wsForm.bank_account_holder} onChange={(e) => setWsForm({ ...wsForm, bank_account_holder: e.target.value })} className={inputClass} placeholder="Mon Entreprise SAS" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Conditions de paiement</label>
                      <textarea value={wsForm.payment_terms} onChange={(e) => setWsForm({ ...wsForm, payment_terms: e.target.value })} rows={2} className={`${inputClass} resize-none`} placeholder="Ex: Paiement a 30 jours." />
                    </div>
                  </div>
                </div>

                {/* Branding / Logo */}
                <div className="border-t border-gray-100 mt-6 pt-6">
                  <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-4">Logo</h3>
                  <div className="flex items-center gap-4">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-gray-200" />
                    ) : (
                      <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl px-4 py-3 text-sm text-gray-500 hover:border-[#313ADF] hover:text-[#313ADF] transition-colors">
                        {logoFile ? logoFile.name : 'Changer le logo (PNG, JPEG, max 2 Mo)'}
                      </div>
                      <input type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} className="hidden" />
                    </label>
                  </div>
                </div>

                {/* Personnalisation documents */}
                <div className="border-t border-gray-100 mt-6 pt-6">
                  <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-4">Personnalisation documents</h3>
                  <div className="space-y-4">
                    <div>
                      <label className={labelClass}>Pied de page factures</label>
                      <textarea value={wsForm.invoice_footer} onChange={(e) => setWsForm({ ...wsForm, invoice_footer: e.target.value })} rows={2} className={`${inputClass} resize-none`} placeholder="Texte en bas de vos factures..." />
                    </div>
                    <div>
                      <label className={labelClass}>Pied de page devis</label>
                      <textarea value={wsForm.quote_footer} onChange={(e) => setWsForm({ ...wsForm, quote_footer: e.target.value })} rows={2} className={`${inputClass} resize-none`} placeholder="Texte en bas de vos devis..." />
                    </div>
                  </div>
                </div>
              </>
            )}

            {isAdmin && (
              <button
                onClick={handleSaveWorkspace}
                disabled={wsSaving}
                className="mt-6 bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50"
              >
                {wsSaving ? 'Sauvegarde...' : 'Sauvegarder les informations'}
              </button>
            )}
          </div>

          {/* Switch workspace */}
          {workspaces.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
              <h2 className="text-xl font-bold text-[#040741] mb-4">Changer de workspace</h2>
              <div className="space-y-2">
                {workspaces.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => switchWorkspace(ws.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left ${
                      ws.id === currentWorkspace?.id
                        ? 'bg-[#313ADF]/10 border-2 border-[#313ADF]'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className="w-10 h-10 bg-[#313ADF]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-[#313ADF]">
                        {ws.name?.charAt(0)?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[#040741]">{ws.name}</p>
                      <p className="text-xs text-gray-400">{ROLE_LABELS[ws.role] || ws.role}</p>
                    </div>
                    {ws.id === currentWorkspace?.id && (
                      <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Members */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <h2 className="text-xl font-bold text-[#040741] mb-4">
              Membres ({members.length})
            </h2>
            {membersLoading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#313ADF] border-t-transparent"></div>
              </div>
            ) : members.length === 0 ? (
              <p className="text-gray-400 text-center py-4">Aucun membre trouvé</p>
            ) : (
              <div className="space-y-2">
                {members.map((m, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedMember(m)}
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-[#313ADF]/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#313ADF]/10 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-sm text-[#040741] font-medium">
                          {m.user_id === user?.id ? 'Vous' : (m.full_name || 'Membre')}
                        </span>
                        {m.created_at && (
                          <p className="text-xs text-gray-400">
                            Depuis le {new Date(m.created_at).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.user_id !== user?.id && canManageRole(myRole, m.role) ? (
                        <select
                          value={m.role}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#313ADF]"
                        >
                          {getAssignableRoles(myRole).map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[m.role] || 'bg-gray-100 text-gray-600'}`}>
                          {ROLE_LABELS[m.role] || m.role}
                        </span>
                      )}
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invitations (owner/admin only) */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
              <h2 className="text-xl font-bold text-[#040741] mb-2">Inviter un membre</h2>
              <p className="text-gray-500 text-sm mb-4">
                Générez un lien d'invitation pour permettre à un nouveau membre de rejoindre votre workspace.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-1">
                  <label className={labelClass}>Email (optionnel)</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-400 mt-1">Si renseigné, seul cet email pourra utiliser le lien</p>
                </div>
                <div>
                  <label className={labelClass}>Rôle</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className={inputClass}
                  >
                    {getAssignableRoles(myRole).map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleCreateInvitation}
                disabled={inviteCreating}
                className="bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50"
              >
                {inviteCreating ? 'Génération...' : 'Générer un lien d\'invitation'}
              </button>

              {inviteUrl && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-sm font-semibold text-green-700 mb-2">Lien d'invitation généré :</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inviteUrl}
                      readOnly
                      className="flex-1 bg-white border border-green-200 rounded-lg px-3 py-2 text-sm text-gray-700 font-mono"
                    />
                    <button
                      onClick={handleCopyUrl}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                        copied
                          ? 'bg-green-600 text-white'
                          : 'bg-[#313ADF] text-white hover:bg-[#040741]'
                      }`}
                    >
                      {copied ? 'Copié !' : 'Copier'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Ce lien expire dans 7 jours.</p>
                </div>
              )}

              {/* Invitations list */}
              <div className="mt-6">
                <h3 className="text-sm font-bold text-[#040741] mb-3">Invitations ({invitations.length})</h3>
                {invitationsLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-4 border-[#313ADF] border-t-transparent"></div>
                  </div>
                ) : invitations.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-3">Aucune invitation</p>
                ) : (
                  <div className="space-y-2">
                    {invitations.map(inv => {
                      const isUsed = !!inv.used_at
                      const isExpired = !isUsed && new Date(inv.expires_at) < new Date()
                      return (
                        <div key={inv.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[inv.role] || 'bg-gray-100 text-gray-600'}`}>
                              {ROLE_LABELS[inv.role] || inv.role}
                            </span>
                            {inv.email && (
                              <span className="text-sm text-gray-600 truncate">{inv.email}</span>
                            )}
                            <span className="text-xs text-gray-400">
                              {isUsed ? 'Utilisée' : isExpired ? 'Expirée' : `Expire le ${new Date(inv.expires_at).toLocaleDateString('fr-FR')}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {isUsed ? (
                              <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full font-semibold">Utilisée</span>
                            ) : isExpired ? (
                              <span className="text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded-full font-semibold">Expirée</span>
                            ) : (
                              <button
                                onClick={() => handleRevokeInvitation(inv.id)}
                                className="text-xs text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                              >
                                Révoquer
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Abonnement (owner only) */}
      {activeTab === 'abonnement' && isOwner && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <h2 className="text-xl font-bold text-[#040741] mb-6">Abonnement</h2>

            {currentWorkspace?.plan_type === 'early-access' ? (
              /* Early access display */
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-[#313ADF]/10 to-purple-50 border border-[#313ADF]/30 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span className="font-bold text-[#040741]">Acces Anticipe</span>
                    {currentWorkspace?.subscription_status === 'early_access' ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Paye</span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">En attente</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    Paiement unique effectue. Acces complet a partir du <strong>25 fevrier 2026</strong>.
                  </p>
                </div>
              </div>
            ) : (
              /* Standard subscription display */
              <>
                <div className="space-y-4">
                  {/* Status badge */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#040741]">Statut :</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      currentWorkspace?.subscription_status === 'active' ? 'bg-green-100 text-green-700' :
                      currentWorkspace?.subscription_status === 'trialing' ? 'bg-blue-100 text-blue-700' :
                      currentWorkspace?.subscription_status === 'past_due' ? 'bg-orange-100 text-orange-700' :
                      currentWorkspace?.subscription_status === 'canceled' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {currentWorkspace?.subscription_status === 'active' ? 'Actif' :
                       currentWorkspace?.subscription_status === 'trialing' ? 'Essai gratuit' :
                       currentWorkspace?.subscription_status === 'past_due' ? 'Paiement en retard' :
                       currentWorkspace?.subscription_status === 'canceled' ? 'Annulé' :
                       currentWorkspace?.subscription_status === 'incomplete' ? 'Incomplet' :
                       currentWorkspace?.subscription_status || 'Inconnu'}
                    </span>
                  </div>

                  {/* Plan */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#040741]">Plan :</span>
                    <span className="text-sm text-gray-600">NeoFlow BOS - 49,99 EUR/mois</span>
                  </div>

                  {/* Trial info */}
                  {currentWorkspace?.subscription_status === 'trialing' && currentWorkspace?.trial_ends_at && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-sm text-blue-700">
                        Essai gratuit jusqu'au <span className="font-semibold">{new Date(currentWorkspace.trial_ends_at).toLocaleDateString('fr-FR')}</span>
                      </p>
                    </div>
                  )}

                  {/* Past due warning */}
                  {currentWorkspace?.subscription_status === 'past_due' && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                      <p className="text-sm text-orange-700">
                        Votre paiement est en retard. Veuillez régulariser votre situation pour éviter la suspension de votre workspace.
                      </p>
                    </div>
                  )}

                  {/* Next billing */}
                  {currentWorkspace?.current_period_end && currentWorkspace?.subscription_status !== 'canceled' && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#040741]">Prochaine facturation :</span>
                      <span className="text-sm text-gray-600">
                        {new Date(currentWorkspace.current_period_end).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleManageBilling}
                  className="mt-6 bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors"
                >
                  Gérer mon abonnement
                </button>
                <p className="text-xs text-gray-400 mt-2">
                  Modifier votre moyen de paiement, annuler ou réactiver votre abonnement via le portail Stripe.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab: Support */}
      {activeTab === 'support' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <h2 className="text-xl font-bold text-[#040741] mb-4">Support</h2>
            <div className="space-y-4">
              <a
                href="/mentions-legales"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="w-10 h-10 bg-[#313ADF]/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-[#040741]">Mentions légales</p>
                  <p className="text-sm text-gray-500">Consulter les mentions légales</p>
                </div>
              </a>

              <a
                href="mailto:contacte.neoflowagency@gmail.com"
                className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="w-10 h-10 bg-[#313ADF]/10 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-[#040741]">Contacter le support</p>
                  <p className="text-sm text-gray-500">contacte.neoflowagency@gmail.com</p>
                </div>
              </a>
            </div>
          </div>

          <BugReportForm />
        </div>
      )}
    </div>
  )
}
