import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, invokeFunction } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { translateError } from '../lib/errorMessages'
import { updateWorkspace, createPortalSession } from '../services/workspaceService'
import { createInvitation, listInvitations, revokeInvitation } from '../services/invitationService'
import BugReportForm from '../components/BugReportForm'

const LEGAL_FORMS = ['SAS', 'SARL', 'EURL', 'SCI', 'Auto-entrepreneur', 'SA', 'SNC', 'Autre']
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF']
const COUNTRIES = ['France', 'Belgique', 'Suisse', 'Luxembourg', 'Canada', 'Autre']

export default function Settings() {
  const navigate = useNavigate()
  const { workspaces, currentWorkspace, isAdmin, isOwner, switchWorkspace, refreshWorkspaces } = useWorkspace()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('compte')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Account form
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)

  // Password form
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  // Workspace form
  const [wsForm, setWsForm] = useState({
    name: '', description: '', address: '', postal_code: '', city: '',
    country: 'France', currency: 'EUR', siret: '', vat_number: '', legal_form: 'SAS'
  })
  const [wsSaving, setWsSaving] = useState(false)
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)

  // Invitations
  const [invitations, setInvitations] = useState([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteCreating, setInviteCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState('confirm') // confirm | choose | deleting
  const [ownedWorkspaces, setOwnedWorkspaces] = useState([])
  const [deleteAction, setDeleteAction] = useState('delete_workspace')
  const [transferTarget, setTransferTarget] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)


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
        legal_form: currentWorkspace.legal_form || 'SAS'
      })
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

  const handleChangePassword = async () => {
    if (!oldPassword) {
      toast.error('Veuillez entrer votre ancien mot de passe')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Le nouveau mot de passe doit contenir au moins 8 caractères')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }

    setPasswordSaving(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: oldPassword
      })
      if (signInError) {
        toast.error('Ancien mot de passe incorrect')
        setPasswordSaving(false)
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Mot de passe mis à jour')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(translateError(err))
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleSaveWorkspace = async () => {
    if (!wsForm.name.trim()) {
      toast.error('Le nom du workspace est requis')
      return
    }
    setWsSaving(true)
    try {
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
        legal_form: wsForm.legal_form
      })
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
    try {
      // First call: check if user owns workspaces
      if (deleteStep === 'confirm') {
        const data = await invokeFunction('delete-account', {})
        if (data?.requires_action) {
          setOwnedWorkspaces(data.owned_workspaces)
          setDeleteStep('choose')
          setDeleting(false)
          return
        }
      }

      // Second call: perform deletion with action
      const body = {}
      if (ownedWorkspaces.length > 0) {
        body.action = deleteAction
        if (deleteAction === 'transfer' && transferTarget) {
          body.transfer_to = transferTarget
          body.workspace_id = ownedWorkspaces[0].id
        }
      }

      await invokeFunction('delete-account', body)

      // Account deleted - sign out and redirect
      await supabase.auth.signOut()
      navigate('/login')
    } catch (err) {
      console.error('Erreur suppression compte:', err)
      toast.error(translateError(err))
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

  const EyeIcon = ({ show, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
      tabIndex={-1}
    >
      {show ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  )

  const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
  const inputDisabledClass = "w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
  const labelClass = "block text-sm font-semibold text-[#040741] mb-2"

  const tabs = [
    { key: 'compte', label: 'Compte' },
    { key: 'workspace', label: 'Workspace' },
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
            <h2 className="text-xl font-bold text-[#040741] mb-6">Changer le mot de passe</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className={labelClass}>Ancien mot de passe</label>
                <div className="relative">
                  <input
                    type={showOldPassword ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Votre mot de passe actuel"
                    className={`${inputClass} pr-12`}
                  />
                  <EyeIcon show={showOldPassword} onClick={() => setShowOldPassword(!showOldPassword)} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 caractères"
                    className={`${inputClass} pr-12`}
                  />
                  <EyeIcon show={showNewPassword} onClick={() => setShowNewPassword(!showNewPassword)} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Confirmer le nouveau mot de passe</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Retapez le nouveau mot de passe"
                  className={inputClass}
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={passwordSaving || !oldPassword || !newPassword}
                className="bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50"
              >
                {passwordSaving ? 'Mise à jour...' : 'Changer le mot de passe'}
              </button>
            </div>
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
              onClick={() => { setShowDeleteModal(true); setDeleteStep('confirm'); setConfirmEmail(''); setDeleteAction('delete_workspace'); setTransferTarget('') }}
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
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-red-600 mb-4">Supprimer mon compte</h2>

            {deleteStep === 'choose' && ownedWorkspaces.length > 0 && (
              <div className="space-y-4 mb-6">
                <p className="text-sm text-gray-600">
                  Vous êtes propriétaire du workspace <span className="font-semibold">{ownedWorkspaces[0].name}</span>. Que souhaitez-vous faire ?
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

                  {ownedWorkspaces[0].members.length > 0 && (
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
                            {ownedWorkspaces[0].members.map(m => (
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
            )}

            <div className="mb-4">
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

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || confirmEmail !== user?.email || (deleteAction === 'transfer' && !transferTarget)}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
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
                      <p className="text-xs text-gray-400">{ws.role}</p>
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
                  <div key={i} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
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
                      {isOwner && m.user_id !== user?.id && m.role !== 'owner' ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#313ADF]"
                        >
                          <option value="manager">manager</option>
                          <option value="member">member</option>
                        </select>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          m.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                          m.role === 'manager' ? 'bg-purple-100 text-purple-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {m.role === 'owner' ? 'proprietaire' : m.role}
                        </span>
                      )}
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
                    <option value="member">Membre</option>
                    <option value="manager">Manager</option>
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
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              inv.role === 'manager' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {inv.role}
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
