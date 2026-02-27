import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSupplier, updateSupplier } from '../services/supplierService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const PO_STATUS_BADGES = {
  brouillon: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Brouillon' },
  envoye: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Envoye' },
  confirme: { bg: 'bg-indigo-100', text: 'text-indigo-600', label: 'Confirme' },
  reception_partielle: { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Partiel' },
  recu: { bg: 'bg-green-100', text: 'text-green-600', label: 'Recu' },
  annule: { bg: 'bg-red-100', text: 'text-red-600', label: 'Annule' }
}

export default function FicheFournisseur() {
  const { fournisseurId } = useParams()
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [supplier, setSupplier] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (fournisseurId) loadSupplier()
  }, [fournisseurId])

  const loadSupplier = async () => {
    try {
      const data = await getSupplier(fournisseurId)
      setSupplier(data)
      setForm({
        name: data.name || '',
        contact_name: data.contact_name || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        postal_code: data.postal_code || '',
        country: data.country || 'France',
        notes: data.notes || ''
      })
    } catch (err) {
      console.error('Erreur:', err)
      toast.error('Erreur chargement fournisseur')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Le nom est obligatoire')
      return
    }
    setSaving(true)
    try {
      await updateSupplier(fournisseurId, form)
      toast.success('Fournisseur mis a jour')
      setEditing(false)
      loadSupplier()
    } catch (err) {
      toast.error(err.message || 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 mb-4">Fournisseur non trouve</p>
        <button onClick={() => navigate('/fournisseurs')} className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-semibold">
          Retour aux fournisseurs
        </button>
      </div>
    )
  }

  const products = supplier.product_suppliers || []
  const purchaseOrders = supplier.purchase_orders || []

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-4xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">{supplier.name}</h1>
          {supplier.contact_name && <p className="text-gray-500">{supplier.contact_name}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-[#040741] rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {editing ? 'Annuler' : 'Modifier'}
          </button>
          <button
            onClick={() => navigate(`/bons-commande/nouveau?fournisseur=${fournisseurId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#4149e8] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau bon de commande
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Infos fournisseur */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <h3 className="text-sm font-bold text-[#040741] mb-4">Informations</h3>
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nom *</label>
                    <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact</label>
                    <input type="text" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Telephone</label>
                    <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Adresse</label>
                  <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Code postal</label>
                    <input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Ville</label>
                    <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Pays</label>
                    <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none" />
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-medium hover:bg-[#4149e8] disabled:opacity-50">
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {supplier.email && (
                  <div>
                    <p className="text-xs text-gray-400">Email</p>
                    <p className="text-sm text-[#040741] font-medium">{supplier.email}</p>
                  </div>
                )}
                {supplier.phone && (
                  <div>
                    <p className="text-xs text-gray-400">Telephone</p>
                    <p className="text-sm text-[#040741] font-medium">{supplier.phone}</p>
                  </div>
                )}
                {(supplier.address || supplier.city) && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">Adresse</p>
                    <p className="text-sm text-[#040741]">
                      {[supplier.address, supplier.postal_code, supplier.city, supplier.country].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
                {supplier.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">Notes</p>
                    <p className="text-sm text-gray-600">{supplier.notes}</p>
                  </div>
                )}
                {!supplier.email && !supplier.phone && !supplier.address && !supplier.notes && (
                  <p className="text-sm text-gray-400 col-span-2">Aucune information supplementaire</p>
                )}
              </div>
            )}
          </div>

          {/* Bons de commande */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#040741] flex items-center gap-2">
                <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Bons de commande ({purchaseOrders.length})
              </h3>
              <button
                onClick={() => navigate(`/bons-commande/nouveau?fournisseur=${fournisseurId}`)}
                className="text-sm text-[#313ADF] font-medium hover:underline"
              >
                + Nouveau
              </button>
            </div>
            {purchaseOrders.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Aucun bon de commande</p>
            ) : (
              <div className="space-y-2">
                {purchaseOrders.map(po => {
                  const badge = PO_STATUS_BADGES[po.status] || PO_STATUS_BADGES.brouillon
                  return (
                    <button
                      key={po.id}
                      onClick={() => navigate(`/bons-commande/${po.id}`)}
                      className="w-full bg-gray-50 rounded-xl p-3 text-left hover:bg-[#313ADF]/5 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#313ADF]">{po.po_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          {po.expected_date ? `Prevue le ${new Date(po.expected_date).toLocaleDateString('fr-FR')}` : new Date(po.created_at).toLocaleDateString('fr-FR')}
                        </span>
                        <span className="text-sm font-medium text-[#040741]">{(po.total_ht || 0).toFixed(2)} EUR HT</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Produits lies */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <h3 className="text-sm font-bold text-[#040741] mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Produits ({products.length})
            </h3>
            {products.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun produit lie</p>
            ) : (
              <div className="space-y-2">
                {products.map(ps => (
                  <div key={ps.id} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-sm font-medium text-[#040741]">{ps.product?.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      {ps.product?.reference && <span className="text-xs text-gray-400">{ps.product.reference}</span>}
                      {ps.supplier_cost_ht && <span className="text-xs font-medium text-[#313ADF]">{ps.supplier_cost_ht.toFixed(2)} EUR</span>}
                    </div>
                    {ps.supplier_reference && <p className="text-xs text-gray-400 mt-0.5">Ref: {ps.supplier_reference}</p>}
                    {ps.is_primary && <span className="text-xs bg-[#313ADF]/10 text-[#313ADF] px-1.5 py-0.5 rounded mt-1 inline-block">Principal</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Retour */}
      <button
        onClick={() => navigate('/fournisseurs')}
        className="mt-8 inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour aux fournisseurs
      </button>
    </div>
  )
}
