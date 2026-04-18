import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

// ── Entity configs ────────────────────────────────────────────────────────────

const ENTITY_CONFIGS = {
  clients: {
    label: 'Clients',
    table: 'customers',
    fields: [
      { key: 'first_name', label: 'Prénom',     required: true },
      { key: 'last_name',  label: 'Nom',        required: true },
      { key: 'email',      label: 'Email' },
      { key: 'phone',      label: 'Téléphone' },
      { key: 'address',    label: 'Adresse' },
    ],
    ocrPromptHint: 'client',
  },
  produits: {
    label: 'Produits',
    table: 'products',
    fields: [
      { key: 'name',              label: 'Nom produit',      required: true },
      { key: 'reference',         label: 'Référence / SKU' },
      { key: 'description',       label: 'Description' },
      { key: 'unit_price_ht',     label: 'Prix HT (€)',      type: 'number' },
      { key: 'tax_rate',          label: 'TVA (%)',          type: 'number' },
      { key: 'cost_price_ht',     label: "Prix d'achat HT",  type: 'number' },
      { key: 'category',          label: 'Catégorie' },
      { key: 'warranty_years',    label: 'Garantie (ans)',   type: 'number' },
    ],
    ocrPromptHint: 'produit',
  },
  fournisseurs: {
    label: 'Fournisseurs',
    table: 'suppliers',
    fields: [
      { key: 'name',         label: 'Nom société',   required: true },
      { key: 'contact_name', label: 'Contact' },
      { key: 'email',        label: 'Email' },
      { key: 'phone',        label: 'Téléphone' },
      { key: 'address',      label: 'Adresse' },
      { key: 'postal_code',  label: 'Code postal' },
      { key: 'city',         label: 'Ville' },
      { key: 'notes',        label: 'Notes' },
    ],
    ocrPromptHint: 'fournisseur',
  },
}

// ── Field aliases for auto-mapping ────────────────────────────────────────────

const FIELD_ALIASES = {
  first_name:      ['prenom', 'firstname', 'givenname', 'billing first name', 'first name', 'customer first name'],
  last_name:       ['nom', 'lastname', 'familyname', 'surname', 'last name', 'customer last name'],
  email:           ['email', 'mail', 'courriel', 'billing email', 'customer email'],
  phone:           ['telephone', 'phone', 'tel', 'mobile', 'portable', 'billing phone', 'customer phone'],
  address:         ['adresse', 'address', 'rue', 'billing address 1', 'billing address'],
  name:            ['nom', 'name', 'libelle', 'libellé', 'label', 'designation', 'désignation', 'title', 'product name', 'article'],
  reference:       ['ref', 'reference', 'sku', 'code', 'code_article', 'default_code', 'variant sku', 'handle', 'barcode'],
  description:     ['description', 'notes', 'body', 'body (html)', 'short description', 'detail'],
  unit_price_ht:   ['prix ht', 'prixht', 'unit price ht', 'regular price', 'variant price', 'list_price', 'prixvente', 'prix vente'],
  tax_rate:        ['tva', 'tva_tx', 'tax rate', 'taxe', 'taux tva', 'tax'],
  cost_price_ht:   ['cout', 'cost', 'prix achat', 'prixachat', 'prixrevient', 'standard_price', 'cost price', 'purchase price'],
  category:        ['categorie', 'category', 'famille', 'type', 'categ', 'catégorie'],
  warranty_years:  ['garantie', 'warranty', 'warranty years', 'années garantie'],
  contact_name:    ['contact', 'contact_name', 'representant', 'interlocuteur'],
  postal_code:     ['cp', 'zip', 'code_postal', 'postal_code', 'postcode', 'zipcode', 'postal code'],
  city:            ['ville', 'city', 'commune', 'localite'],
  notes:           ['notes', 'remarques', 'comment', 'comments', 'observation'],
}

function norm(str) {
  return String(str ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function autoMap(headers, entityKey) {
  const fields = ENTITY_CONFIGS[entityKey].fields
  const mapping = {}
  for (const h of headers) {
    const n = norm(h)
    for (const field of fields) {
      const aliases = FIELD_ALIASES[field.key] || [field.key]
      if (aliases.some(a => norm(a) === n)) {
        mapping[h] = field.key
        break
      }
    }
    if (!mapping[h]) mapping[h] = '__ignore__'
  }
  return mapping
}

// ── File parser ───────────────────────────────────────────────────────────────

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'xlsx' || ext === 'xls') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' })
          const sheet = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
          resolve({ rows, headers: rows.length ? Object.keys(rows[0]) : [] })
        } catch (err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => resolve({ rows: r.data, headers: r.meta.fields || [] }),
    })
  })
}

// ── Transform rows using mapping ──────────────────────────────────────────────

function applyMapping(rows, mapping, entityKey) {
  const fields = ENTITY_CONFIGS[entityKey].fields
  const required = fields.filter(f => f.required).map(f => f.key)
  const numericFields = fields.filter(f => f.type === 'number').map(f => f.key)

  return rows.map((row, i) => {
    const mapped = {}
    for (const [src, dest] of Object.entries(mapping)) {
      if (dest === '__ignore__') continue
      let val = String(row[src] ?? '').trim()
      if (numericFields.includes(dest)) {
        val = val.replace(',', '.').replace(/[^0-9.]/g, '')
        mapped[dest] = val ? parseFloat(val) : null
      } else {
        mapped[dest] = val || null
      }
    }
    const errors = required.filter(k => !mapped[k])
    return { _row: i + 1, _errors: errors, ...mapped }
  })
}

// ── Export helpers ────────────────────────────────────────────────────────────

export function exportToCSV(data, filename) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map(r => headers.map(h => {
    const v = r[h] ?? ''
    return typeof v === 'string' && v.includes(';') ? `"${v}"` : v
  }).join(';'))
  const csv = [headers.join(';'), ...rows].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename + '.csv'; a.click()
  URL.revokeObjectURL(url)
}

export function exportToXLSX(data, filename) {
  if (!data.length) return
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Données')
  XLSX.writeFile(wb, filename + '.xlsx')
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEPS = ['Entité', 'Fichier / Photo', 'Mapping', 'Aperçu', 'Résultat']

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-gray-100">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
            ${i < current ? 'bg-green-500 text-white' : i === current ? 'bg-[#313ADF] text-white' : 'bg-gray-100 text-gray-400'}`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`text-sm hidden sm:block ${i === current ? 'font-semibold text-[#040741]' : 'text-gray-400'}`}>{s}</span>
          {i < STEPS.length - 1 && <div className={`h-px w-6 sm:w-10 ${i < current ? 'bg-green-400' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Import() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [step, setStep]               = useState(0)
  const [entity, setEntity]           = useState(null)
  const [source, setSource]           = useState(null)      // 'file' | 'photo'
  const [fileData, setFileData]       = useState(null)      // { rows, headers }
  const [fileLoading, setFileLoading] = useState(false)
  const [mapping, setMapping]         = useState({})
  const [mappedRows, setMappedRows]   = useState([])
  const [photoItems, setPhotoItems]   = useState([])        // items from OCR
  const [ocrLoading, setOcrLoading]   = useState(false)
  const [editingPhoto, setEditingPhoto] = useState(null)
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState(null)

  const fileRef  = useRef(null)
  const photoRef = useRef(null)

  const cfg = entity ? ENTITY_CONFIGS[entity] : null

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file) => {
    if (!file) return
    setFileLoading(true)
    try {
      const data = await parseFile(file)
      setFileData(data)
      const autoMapping = autoMap(data.headers, entity)
      setMapping(autoMapping)
    } catch (err) {
      toast.error('Erreur lecture fichier : ' + err.message)
    } finally {
      setFileLoading(false)
    }
  }, [entity, toast])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  const handlePhotoUpload = useCallback(async (file) => {
    if (!file || !entity) return
    setOcrLoading(true)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const b64 = e.target.result.split(',')[1]
          resolve(b64)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      const { data: urlData } = await supabase.functions.url('ocr-import')

      const resp = await fetch(urlData || `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ imageBase64: base64, entityType: entity }),
      })

      const json = await resp.json()
      if (json.error) throw new Error(json.error)

      const item = { ...json.data, _id: Date.now() }
      setPhotoItems(prev => [...prev, item])
      setEditingPhoto(item._id)
    } catch (err) {
      toast.error('Erreur OCR : ' + err.message)
    } finally {
      setOcrLoading(false)
    }
  }, [entity, toast])

  const handleImport = async () => {
    if (!workspace?.id || !cfg) return
    setImporting(true)
    let imported = 0, skipped = 0, errors = 0

    const rows = source === 'photo' ? photoItems : mappedRows.filter(r => r._errors.length === 0)

    try {
      for (const row of rows) {
        const { _row, _errors, _id, ...data } = row
        const record = { workspace_id: workspace.id }

        cfg.fields.forEach(f => {
          if (data[f.key] !== undefined) record[f.key] = data[f.key]
        })

        // Defaults for products
        if (entity === 'produits') {
          if (record.tax_rate == null) record.tax_rate = 20
          record.eco_participation_amount = record.eco_participation_amount || 0
        }
        // Defaults for suppliers
        if (entity === 'fournisseurs') {
          if (!record.country) record.country = 'France'
        }

        const { error } = await supabase.from(cfg.table).insert(record)
        if (error) {
          if (error.code === '23505') skipped++ // duplicate
          else errors++
        } else {
          imported++
        }
      }

      setImportResult({ imported, skipped, errors, total: rows.length })
      setStep(4)
    } catch (err) {
      toast.error('Erreur import : ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  // ── Navigate between steps ─────────────────────────────────────────────────

  const goNext = () => {
    if (step === 0) {
      if (!entity || !source) return
      setStep(1)
    } else if (step === 1) {
      if (source === 'file' && fileData) setStep(2)
      else if (source === 'photo' && photoItems.length > 0) setStep(3)
    } else if (step === 2) {
      const rows = applyMapping(fileData.rows, mapping, entity)
      setMappedRows(rows)
      setStep(3)
    } else if (step === 3) {
      handleImport()
    }
  }

  const canNext = () => {
    if (step === 0) return entity && source
    if (step === 1) return source === 'file' ? !!fileData : photoItems.length > 0
    if (step === 2) return true
    if (step === 3) return true
    return false
  }

  // ── Render steps ───────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-bold text-[#040741] mb-3">Que voulez-vous importer ?</h2>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(ENTITY_CONFIGS).map(([key, c]) => (
            <button
              key={key}
              onClick={() => setEntity(key)}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${entity === key
                ? 'border-[#313ADF] bg-[#313ADF]/5 shadow-md'
                : 'border-gray-200 hover:border-[#313ADF]/40 bg-white'}`}
            >
              <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center text-lg
                ${entity === key ? 'bg-[#313ADF] text-white' : 'bg-gray-100 text-gray-500'}`}>
                {key === 'clients' ? '👥' : key === 'produits' ? '📦' : '🏭'}
              </div>
              <p className={`font-semibold text-sm ${entity === key ? 'text-[#313ADF]' : 'text-[#040741]'}`}>{c.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {key === 'clients' ? 'Noms, emails, téléphones' : key === 'produits' ? 'Références, prix, stocks' : 'Contacts, adresses'}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold text-[#040741] mb-3">Comment importer ?</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setSource('file')}
            className={`p-5 rounded-2xl border-2 text-left transition-all ${source === 'file'
              ? 'border-[#313ADF] bg-[#313ADF]/5 shadow-md'
              : 'border-gray-200 hover:border-[#313ADF]/40 bg-white'}`}
          >
            <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center text-xl
              ${source === 'file' ? 'bg-[#313ADF] text-white' : 'bg-gray-100'}`}>
              📄
            </div>
            <p className={`font-semibold text-sm ${source === 'file' ? 'text-[#313ADF]' : 'text-[#040741]'}`}>
              Fichier CSV / Excel
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Depuis Dolibarr, EBP, WooCommerce, Shopify, Odoo, Sage…
            </p>
          </button>

          <button
            onClick={() => setSource('photo')}
            className={`p-5 rounded-2xl border-2 text-left transition-all ${source === 'photo'
              ? 'border-[#313ADF] bg-[#313ADF]/5 shadow-md'
              : 'border-gray-200 hover:border-[#313ADF]/40 bg-white'}`}
          >
            <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center text-xl
              ${source === 'photo' ? 'bg-[#313ADF] text-white' : 'bg-gray-100'}`}>
              📷
            </div>
            <p className={`font-semibold text-sm ${source === 'photo' ? 'text-[#313ADF]' : 'text-[#040741]'}`}>
              Photo / Scan IA
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Prenez une photo d'une fiche — l'IA extrait les données automatiquement
            </p>
          </button>
        </div>
      </div>
    </div>
  )

  const renderStep1File = () => (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-[#313ADF]/30 rounded-2xl p-10 text-center bg-[#313ADF]/3 hover:bg-[#313ADF]/5 transition-colors cursor-pointer"
        onClick={() => fileRef.current?.click()}
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="font-semibold text-[#040741]">Glissez votre fichier ici</p>
        <p className="text-sm text-gray-500 mt-1">ou cliquez pour parcourir</p>
        <p className="text-xs text-gray-400 mt-2">CSV, XLS, XLSX acceptés · UTF-8 ou Latin-1</p>
        <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden"
          onChange={e => handleFileUpload(e.target.files[0])} />
      </div>

      {fileLoading && (
        <div className="flex items-center gap-2 text-sm text-[#313ADF]">
          <div className="w-4 h-4 border-2 border-[#313ADF] border-t-transparent rounded-full animate-spin" />
          Analyse du fichier…
        </div>
      )}

      {fileData && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 flex-shrink-0">✓</div>
          <div>
            <p className="font-semibold text-green-800">{fileData.rows.length} lignes détectées</p>
            <p className="text-sm text-green-700 mt-0.5">
              {fileData.headers.length} colonnes : {fileData.headers.slice(0, 4).join(', ')}{fileData.headers.length > 4 ? '…' : ''}
            </p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-700 mb-2">Logiciels compatibles (détection automatique des colonnes)</p>
        <div className="flex flex-wrap gap-2">
          {['Dolibarr', 'EBP', 'WooCommerce', 'Shopify', 'Odoo', 'Sage', 'Cegid', 'QuickBooks', 'Google Sheets', 'Excel'].map(s => (
            <span key={s} className="px-2 py-0.5 bg-white border border-blue-200 rounded-full text-xs text-blue-700">{s}</span>
          ))}
        </div>
      </div>
    </div>
  )

  const renderStep1Photo = () => (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-[#313ADF]/30 rounded-2xl p-10 text-center bg-[#313ADF]/3 hover:bg-[#313ADF]/5 transition-colors cursor-pointer"
        onClick={() => photoRef.current?.click()}
      >
        <div className="text-4xl mb-3">📷</div>
        <p className="font-semibold text-[#040741]">Ajouter une photo ou un scan</p>
        <p className="text-sm text-gray-500 mt-1">JPG, PNG, WEBP acceptés</p>
        <p className="text-xs text-gray-400 mt-2">L'IA (Gemini 2.0 Flash) extrait les données automatiquement</p>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => handlePhotoUpload(e.target.files[0])} />
      </div>

      {ocrLoading && (
        <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700">
          <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Analyse en cours… L'IA extrait les données de votre image
        </div>
      )}

      {photoItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[#040741]">{photoItems.length} fiche{photoItems.length > 1 ? 's' : ''} extraite{photoItems.length > 1 ? 's' : ''}</p>
          {photoItems.map((item) => (
            <div key={item._id} className="bg-white border border-gray-200 rounded-xl p-4">
              {editingPhoto === item._id ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-[#040741]">Modifier les données extraites</p>
                    <button onClick={() => setEditingPhoto(null)}
                      className="text-xs text-gray-400 hover:text-gray-600">✕ Fermer</button>
                  </div>
                  {cfg.fields.map(f => (
                    <div key={f.key}>
                      <label className="text-xs font-medium text-gray-600 block mb-1">{f.label}</label>
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        value={item[f.key] ?? ''}
                        onChange={e => setPhotoItems(prev => prev.map(p =>
                          p._id === item._id ? { ...p, [f.key]: e.target.value } : p
                        ))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#313ADF]/20 focus:border-[#313ADF] outline-none"
                      />
                    </div>
                  ))}
                  <button onClick={() => setPhotoItems(prev => prev.filter(p => p._id !== item._id))}
                    className="text-xs text-red-500 hover:text-red-700">🗑 Supprimer cette fiche</button>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-[#040741] truncate">
                      {item[cfg.fields[0].key] || 'Sans nom'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {cfg.fields.slice(1, 3).map(f => item[f.key] ? `${f.label}: ${item[f.key]}` : '').filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button onClick={() => setEditingPhoto(item._id)}
                    className="ml-2 text-xs text-[#313ADF] hover:underline flex-shrink-0">Modifier</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => photoRef.current?.click()}
        disabled={ocrLoading}
        className="w-full py-2.5 border-2 border-[#313ADF]/30 rounded-xl text-sm text-[#313ADF] font-medium hover:bg-[#313ADF]/5 transition-colors disabled:opacity-50"
      >
        + Ajouter une autre photo
      </button>
    </div>
  )

  const renderStep2 = () => {
    if (!fileData || !cfg) return null
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Associez chaque colonne de votre fichier à un champ NeoFlow. Les colonnes reconnues ont été mappées automatiquement.
        </p>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-2 gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Colonne fichier</span>
            <span>Champ NeoFlow</span>
          </div>
          {fileData.headers.map(h => (
            <div key={h} className="grid grid-cols-2 gap-4 px-4 py-2.5 border-b border-gray-100 last:border-0 items-center">
              <span className="text-sm font-medium text-[#040741] truncate">{h}</span>
              <select
                value={mapping[h] || '__ignore__'}
                onChange={e => setMapping(prev => ({ ...prev, [h]: e.target.value }))}
                className={`text-sm border rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-[#313ADF]/20
                  ${mapping[h] && mapping[h] !== '__ignore__'
                    ? 'border-[#313ADF]/40 bg-[#313ADF]/3 text-[#313ADF] font-medium'
                    : 'border-gray-200 text-gray-400'}`}
              >
                <option value="__ignore__">— Ignorer —</option>
                {cfg.fields.map(f => (
                  <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-400">* Champ obligatoire</div>

        {/* Sample data preview */}
        {fileData.rows[0] && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Aperçu — 1ère ligne</p>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
              {fileData.headers.filter(h => mapping[h] && mapping[h] !== '__ignore__').map(h => (
                <div key={h} className="flex gap-2">
                  <span className="text-gray-400 w-32 flex-shrink-0">{cfg.fields.find(f => f.key === mapping[h])?.label} :</span>
                  <span className="font-medium text-[#040741] truncate">{String(fileData.rows[0][h] ?? '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderStep3 = () => {
    const rows = source === 'photo' ? photoItems : mappedRows
    const valid = rows.filter(r => !r._errors?.length)
    const withErrors = rows.filter(r => r._errors?.length > 0)

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{valid.length}</p>
            <p className="text-xs text-green-600 mt-0.5">Prêts à importer</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{withErrors.length}</p>
            <p className="text-xs text-red-500 mt-0.5">Erreurs (ignorés)</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[#313ADF]">{rows.length}</p>
            <p className="text-xs text-blue-500 mt-0.5">Total</p>
          </div>
        </div>

        {withErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <p className="font-semibold mb-1">Lignes ignorées (champs obligatoires manquants) :</p>
            {withErrors.slice(0, 5).map((r, i) => (
              <p key={i} className="text-xs">· Ligne {r._row} : {r._errors.map(e => cfg.fields.find(f => f.key === e)?.label).join(', ')}</p>
            ))}
            {withErrors.length > 5 && <p className="text-xs mt-1">…et {withErrors.length - 5} autres</p>}
          </div>
        )}

        <div className="overflow-auto rounded-xl border border-gray-200 max-h-64">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50">
                {cfg.fields.slice(0, 4).map(f => (
                  <th key={f.key} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {valid.slice(0, 20).map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {cfg.fields.slice(0, 4).map(f => (
                    <td key={f.key} className="px-3 py-2 text-[#040741] truncate max-w-[120px]">
                      {String(r[f.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {valid.length > 20 && (
            <p className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t">+ {valid.length - 20} lignes non affichées</p>
          )}
        </div>

        {valid.length === 0 && (
          <p className="text-center text-red-500 text-sm py-4">Aucune ligne valide à importer.</p>
        )}
      </div>
    )
  }

  const renderStep4 = () => {
    if (!importResult) return null
    return (
      <div className="text-center space-y-6 py-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-4xl mx-auto">✅</div>
        <div>
          <h2 className="text-xl font-bold text-[#040741]">Import terminé !</h2>
          <p className="text-gray-500 text-sm mt-1">Vos données sont maintenant dans NeoFlow BOS</p>
        </div>
        <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-2xl font-bold text-green-700">{importResult.imported}</p>
            <p className="text-xs text-green-600 mt-0.5">Importés</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-2xl font-bold text-yellow-700">{importResult.skipped}</p>
            <p className="text-xs text-yellow-600 mt-0.5">Doublons</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-2xl font-bold text-red-600">{importResult.errors}</p>
            <p className="text-xs text-red-500 mt-0.5">Erreurs</p>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(`/${entity === 'clients' ? 'clients' : entity === 'fournisseurs' ? 'fournisseurs' : 'produits'}`)}
            className="px-6 py-2.5 bg-[#313ADF] text-white rounded-xl font-semibold text-sm hover:bg-[#2830b8] transition-colors"
          >
            Voir les {cfg?.label}
          </button>
          <button
            onClick={() => { setStep(0); setEntity(null); setSource(null); setFileData(null); setMapping({}); setMappedRows([]); setPhotoItems([]); setImportResult(null) }}
            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
          >
            Nouvel import
          </button>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#040741] px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Import de données</h1>
          <p className="text-white/50 text-xs">CSV, Excel, ou photo scannée</p>
        </div>
      </div>

      <StepBar current={step} />

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {step === 0 && renderStep0()}
          {step === 1 && source === 'file'  && renderStep1File()}
          {step === 1 && source === 'photo' && renderStep1Photo()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {/* Nav buttons */}
        {step < 4 && (
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => step > 0 ? setStep(s => s - 1) : navigate(-1)}
              className="px-5 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              ← {step === 0 ? 'Annuler' : 'Retour'}
            </button>
            <button
              onClick={goNext}
              disabled={!canNext() || importing || ocrLoading || fileLoading}
              className="px-6 py-2.5 bg-[#313ADF] text-white rounded-xl text-sm font-semibold hover:bg-[#2830b8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {step === 3 ? `Importer ${source === 'photo' ? photoItems.length : mappedRows.filter(r => !r._errors?.length).length} enregistrement(s)` : 'Suivant →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
