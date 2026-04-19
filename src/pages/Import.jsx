import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

// ── Constants ──────────────────────────────────────────────────────────────────

const BATCH_SIZE = 50

// ── Entity configs ─────────────────────────────────────────────────────────────

const ENTITY_CONFIGS = {
  clients: {
    label: 'Clients',
    table: 'customers',
    icon: '👥',
    description: 'Noms, emails, téléphones',
    fields: [
      { key: 'first_name', label: 'Prénom',          required: true },
      { key: 'last_name',  label: 'Nom',             required: true },
      { key: 'email',      label: 'Email' },
      { key: 'phone',      label: 'Téléphone' },
      { key: 'address',    label: 'Adresse' },
    ],
  },
  produits: {
    label: 'Produits',
    table: 'products',
    icon: '📦',
    description: 'Références, prix, catégories',
    fields: [
      { key: 'name',           label: 'Nom produit',     required: true },
      { key: 'reference',      label: 'Référence / SKU' },
      { key: 'description',    label: 'Description' },
      { key: 'unit_price_ht',  label: 'Prix HT (€)',     type: 'number' },
      { key: 'tax_rate',       label: 'TVA (%)',          type: 'number' },
      { key: 'cost_price_ht',  label: "Prix d'achat HT", type: 'number' },
      { key: 'category',                  label: 'Catégorie' },
      { key: 'warranty_years',            label: 'Garantie (ans)',       type: 'number' },
      { key: 'eco_participation_amount',  label: 'Éco-participation (€)', type: 'number' },
    ],
  },
  fournisseurs: {
    label: 'Fournisseurs',
    table: 'suppliers',
    icon: '🏭',
    description: 'Contacts, adresses, notes',
    fields: [
      { key: 'name',         label: 'Nom société',  required: true },
      { key: 'contact_name', label: 'Contact' },
      { key: 'email',        label: 'Email' },
      { key: 'phone',        label: 'Téléphone' },
      { key: 'address',      label: 'Adresse' },
      { key: 'postal_code',  label: 'Code postal' },
      { key: 'city',         label: 'Ville' },
      { key: 'notes',        label: 'Notes' },
    ],
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseNum(val) {
  const raw = String(val ?? '').replace(',', '.').replace(/[^0-9.]/g, '')
  return raw ? parseFloat(raw) : null
}

function parseStr(val) {
  const s = String(val ?? '').trim()
  return s || null
}

// ── File parser ────────────────────────────────────────────────────────────────

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

// ── Apply AI mapping spec to rows ──────────────────────────────────────────────

function applyMappingSpec(rows, mappings, entityKey) {
  const fields = ENTITY_CONFIGS[entityKey].fields
  const required = fields.filter(f => f.required).map(f => f.key)
  const numericFields = fields.filter(f => f.type === 'number').map(f => f.key)

  return rows.map((row, i) => {
    const mapped = {}
    for (const m of mappings) {
      if (!m.sourceColumns?.length) continue
      const isNumeric = numericFields.includes(m.targetField) || m.transform === 'number'

      if (m.transform === 'concat') {
        const parts = m.sourceColumns
          .map(col => String(row[col] ?? '').trim())
          .filter(Boolean)
        mapped[m.targetField] = parts.length ? parts.join(m.concatSeparator ?? ' | ') : null
      } else if (isNumeric) {
        mapped[m.targetField] = parseNum(row[m.sourceColumns[0]])
      } else {
        const val = String(row[m.sourceColumns[0]] ?? '').trim()
        mapped[m.targetField] = val || null
      }
    }
    const errors = required.filter(k => !mapped[k])
    return { _row: i + 1, _errors: errors, ...mapped }
  })
}

// ── Export helpers ─────────────────────────────────────────────────────────────

export function exportToCSV(data, filename) {
  if (!data.length) return
  const hdrs = Object.keys(data[0])
  const rows = data.map(r => hdrs.map(h => {
    const v = r[h] ?? ''
    return typeof v === 'string' && v.includes(';') ? `"${v}"` : v
  }).join(';'))
  const csv = [hdrs.join(';'), ...rows].join('\n')
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

// ── Step bar ───────────────────────────────────────────────────────────────────

const STEPS = ['Entité', 'Fichier', 'Mapping IA', 'Aperçu', 'Résultat']

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-gray-100 overflow-x-auto">
      {STEPS.map((s, i) => (
        <div key={i} className="flex items-center gap-2 flex-shrink-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
            ${i < current ? 'bg-green-500 text-white' : i === current ? 'bg-[#313ADF] text-white' : 'bg-gray-100 text-gray-400'}`}>
            {i < current ? '✓' : i + 1}
          </div>
          <span className={`text-sm hidden sm:block ${i === current ? 'font-semibold text-[#040741]' : 'text-gray-400'}`}>{s}</span>
          {i < STEPS.length - 1 && (
            <div className={`h-px w-6 sm:w-8 ${i < current ? 'bg-green-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Mapping field inline editor ────────────────────────────────────────────────

function MappingFieldEditor({ mapping, headers, onChange, onClose }) {
  const [selected, setSelected] = useState(new Set(mapping.sourceColumns ?? []))
  const [transform, setTransform] = useState(mapping.transform ?? 'direct')
  const [separator, setSeparator] = useState(mapping.concatSeparator ?? ' | ')

  const toggle = (col) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(col) ? next.delete(col) : next.add(col)
      return next
    })
  }

  const save = () => {
    const cols = [...selected]
    onChange({
      ...mapping,
      sourceColumns: cols,
      transform: cols.length > 1 ? 'concat' : transform,
      concatSeparator: cols.length > 1 ? separator : undefined,
    })
    onClose()
  }

  return (
    <div className="mt-1 bg-white border border-[#313ADF]/20 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Sélectionnez les colonnes source
      </p>

      <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
        {headers.map(h => (
          <label key={h} className="flex items-center gap-2 text-sm cursor-pointer hover:text-[#313ADF] select-none">
            <input
              type="checkbox"
              checked={selected.has(h)}
              onChange={() => toggle(h)}
              className="rounded accent-[#313ADF]"
            />
            <span className="truncate" title={h}>{h}</span>
          </label>
        ))}
      </div>

      {[...selected].length > 1 && (
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Séparateur de fusion</label>
          <input
            value={separator}
            onChange={e => setSeparator(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-28 focus:ring-2 focus:ring-[#313ADF]/20 focus:border-[#313ADF] outline-none"
          />
          <span className="text-xs text-gray-400 ml-2">entre chaque valeur</span>
        </div>
      )}

      {[...selected].length === 1 && (
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Transformation</label>
          <select
            value={transform}
            onChange={e => setTransform(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#313ADF]/20 focus:border-[#313ADF] outline-none"
          >
            <option value="direct">Texte brut</option>
            <option value="number">Nombre (nettoyer €, %, virgule→point)</option>
          </select>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          className="px-4 py-1.5 bg-[#313ADF] text-white rounded-lg text-xs font-semibold hover:bg-[#2830b8] transition-colors"
        >
          Appliquer
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Import() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [step, setStep]               = useState(0)
  const [entity, setEntity]           = useState(null)
  const [fileData, setFileData]       = useState(null)
  const [fileLoading, setFileLoading] = useState(false)

  const [aiMapping, setAiMapping]     = useState(null)
  const [aiLoading, setAiLoading]     = useState(false)
  const [aiMessage, setAiMessage]     = useState('')
  const [editingField, setEditingField] = useState(null)

  // Auto-detected from AI response
  const [variantMode, setVariantMode]     = useState(false)
  const [variantConfig, setVariantConfig] = useState(null)

  const [mappedRows, setMappedRows]         = useState([])
  const [importing, setImporting]           = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [showProgressBar, setShowProgressBar] = useState(false)
  const [importResult, setImportResult]     = useState(null)

  const fileRef = useRef(null)
  const progressTimerRef = useRef(null)
  const cfg = entity ? ENTITY_CONFIGS[entity] : null

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file) => {
    if (!file) return
    setFileLoading(true)
    try {
      const data = await parseFile(file)
      setFileData(data)
    } catch (err) {
      toast.error('Erreur lecture fichier : ' + err.message)
    } finally {
      setFileLoading(false)
    }
  }, [toast])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }, [handleFileUpload])

  const callAI = useCallback(async (message = null, current = null) => {
    if (!fileData || !entity) return
    setAiLoading(true)
    setAiMessage('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-import-mapping`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            headers: fileData.headers,
            sampleRows: fileData.rows.slice(0, 10),
            entityType: entity,
            userMessage: message ?? undefined,
            currentMapping: current ?? undefined,
          }),
        }
      )

      const json = await resp.json()
      if (json.error) throw new Error(json.error)
      setAiMapping(json)

      // Auto-detect variants — validate against real data (guard against AI false positives)
      if (json.variantSuggestion?.detected) {
        const sizeCol = (json.variantSuggestion.sizeColumn ?? '').trim() || null
        // sizeColumn must be an actual column in the file (guards against hallucinations)
        const sizeColValid = !!(sizeCol && fileData.headers.includes(sizeCol))
        const nameMapping = json.mappings?.find(m => m.targetField === 'name')
        const nameCol = nameMapping?.sourceColumns?.[0]
        let hasDuplicates = false
        if (nameCol && sizeColValid) {
          const names = fileData.rows.map(r => String(r[nameCol] ?? '').trim()).filter(Boolean)
          hasDuplicates = new Set(names).size < names.length
        }
        const activate = hasDuplicates && sizeColValid
        setVariantMode(activate)
        if (activate) {
          const vs = json.variantSuggestion
          const trimCol = (v) => (v ?? '').trim() || null
          setVariantConfig({
            ...vs,
            sizeColumn:         trimCol(vs.sizeColumn),
            comfortColumn:      trimCol(vs.comfortColumn),
            priceColumn:        trimCol(vs.priceColumn),
            purchasePriceColumn:trimCol(vs.purchasePriceColumn),
            skuSupplierColumn:  trimCol(vs.skuSupplierColumn),
          })
        } else {
          setVariantConfig(null)
        }
      } else {
        setVariantMode(false)
        setVariantConfig(null)
      }
    } catch (err) {
      toast.error('Erreur IA : ' + err.message)
    } finally {
      setAiLoading(false)
    }
  }, [fileData, entity, toast])

  const updateMapping = useCallback((updated) => {
    setAiMapping(prev => {
      const exists = prev.mappings.some(x => x.targetField === updated.targetField)
      return {
        ...prev,
        mappings: exists
          ? prev.mappings.map(x => x.targetField === updated.targetField ? updated : x)
          : [...prev.mappings, updated],
      }
    })
  }, [])

  const handleImport = async () => {
    if (!workspace?.id || !cfg) return
    setImporting(true)
    const validRows = mappedRows.filter(r => r._errors.length === 0)
    setImportProgress({ current: 0, total: validRows.length })
    setShowProgressBar(false)

    // Show progress bar only if import takes more than 30s
    progressTimerRef.current = setTimeout(() => setShowProgressBar(true), 30000)

    let imported = 0, skipped = 0, errors = 0

    try {
      if (variantMode && variantConfig && entity === 'produits') {
        // ── Variant mode: group rows by product name ──────────────────────────
        const groups = new Map()
        validRows.forEach((row) => {
          const key = row.name ?? ''
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key).push(row)
        })

        let processed = 0
        for (const [, groupRows] of groups) {
          const baseRow = groupRows[0]
          const { _row, _errors, ...data } = baseRow
          const record = { workspace_id: workspace.id }
          cfg.fields.forEach(f => { if (data[f.key] !== undefined) record[f.key] = data[f.key] })
          if (record.tax_rate == null) record.tax_rate = 20
          record.eco_participation_amount = record.eco_participation_amount ?? 0
          record.has_variants = true

          const { data: prod, error: prodErr } = await supabase
            .from('products').insert(record).select('id').single()

          if (prodErr) {
            if (prodErr.code === '23505') skipped += groupRows.length
            else errors += groupRows.length
            processed += groupRows.length
            setImportProgress({ current: processed, total: validRows.length })
            continue
          }

          // Build variant batch from original rows
          const variantBatch = groupRows.map((row) => {
            const raw = fileData.rows[row._row - 1]
            const rawSize = variantConfig.sizeColumn ? String(raw[variantConfig.sizeColumn] ?? '').trim() : ''
            const rawComfort = variantConfig.comfortColumn ? String(raw[variantConfig.comfortColumn] ?? '').trim() : ''
            return {
              product_id: prod.id,
              workspace_id: workspace.id,
              size:           rawSize || 'Standard',
              comfort:        rawComfort || null,
              price:          (variantConfig.priceColumn ? parseNum(raw[variantConfig.priceColumn]) : null) ?? row.unit_price_ht ?? 0,
              purchase_price: variantConfig.purchasePriceColumn ? parseNum(raw[variantConfig.purchasePriceColumn]) : (row.cost_price_ht ?? null),
              sku_supplier:   variantConfig.skuSupplierColumn ? (String(raw[variantConfig.skuSupplierColumn] ?? '').trim() || null) : null,
              is_archived: false,
            }
          })

          let variantInserted = 0
          for (let i = 0; i < variantBatch.length; i += BATCH_SIZE) {
            const chunk = variantBatch.slice(i, i + BATCH_SIZE)
            const { error: varErr } = await supabase.from('product_variants').insert(chunk)
            if (varErr) errors += chunk.length
            else { imported += chunk.length; variantInserted += chunk.length }
          }
          // Rollback orphan product if NO variant was successfully created
          if (variantInserted === 0 && variantBatch.length > 0) {
            await supabase.from('products').delete().eq('id', prod.id)
          }

          processed += groupRows.length
          setImportProgress({ current: processed, total: validRows.length })
        }
      } else {
        // ── Normal batch mode ─────────────────────────────────────────────────
        for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
          const chunk = validRows.slice(i, i + BATCH_SIZE)
          const records = chunk.map(row => {
            const { _row, _errors, ...data } = row
            const record = { workspace_id: workspace.id }
            cfg.fields.forEach(f => { if (data[f.key] !== undefined) record[f.key] = data[f.key] })
            if (entity === 'produits') {
              if (record.tax_rate == null) record.tax_rate = 20
              if (record.eco_participation_amount == null) record.eco_participation_amount = 0
            }
            if (entity === 'fournisseurs') {
              if (!record.country) record.country = 'France'
            }
            return record
          })

          const { data: inserted, error } = await supabase.from(cfg.table).insert(records).select()
          if (error) {
            if (error.code === '23505') {
              // Retry one by one to isolate duplicates
              for (const record of records) {
                const { error: e } = await supabase.from(cfg.table).insert(record)
                if (e?.code === '23505') skipped++
                else if (e) errors++
                else imported++
              }
            } else {
              errors += chunk.length
            }
          } else {
            imported += inserted?.length ?? chunk.length
          }

          setImportProgress({ current: Math.min(i + BATCH_SIZE, validRows.length), total: validRows.length })
        }
      }

      clearTimeout(progressTimerRef.current)
      setImportResult({ imported, skipped, errors, total: validRows.length })
      setStep(4)
    } catch (err) {
      clearTimeout(progressTimerRef.current)
      toast.error('Erreur import : ' + err.message)
    } finally {
      setImporting(false)
      setImportProgress(null)
      setShowProgressBar(false)
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  const goNext = () => {
    if (step === 0) {
      if (entity) setStep(1)
    } else if (step === 1) {
      if (fileData) {
        setStep(2)
        callAI()
      }
    } else if (step === 2) {
      if (aiMapping) {
        const rows = applyMappingSpec(fileData.rows, aiMapping.mappings, entity)
        setMappedRows(rows)
        setStep(3)
      }
    } else if (step === 3) {
      handleImport()
    }
  }

  const goBack = () => {
    if (step === 2) { setAiMapping(null); setVariantMode(false); setVariantConfig(null) }
    if (step > 0) setStep(s => s - 1)
    else navigate(-1)
  }

  const canNext = () => {
    if (step === 0) return !!entity
    if (step === 1) return !!fileData && !fileLoading
    if (step === 2) return !!aiMapping && !aiLoading
    if (step === 3) return mappedRows.filter(r => !r._errors?.length).length > 0
    return false
  }

  // ── Step 0 — Choose entity ───────────────────────────────────────────────────

  const renderStep0 = () => (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-[#040741]">Que voulez-vous importer ?</h2>
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
              {c.icon}
            </div>
            <p className={`font-semibold text-sm ${entity === key ? 'text-[#313ADF]' : 'text-[#040741]'}`}>{c.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
          </button>
        ))}
      </div>
    </div>
  )

  // ── Step 1 — Upload file ─────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-[#313ADF]/30 rounded-2xl p-10 text-center bg-[#313ADF]/3 hover:bg-[#313ADF]/5 transition-colors cursor-pointer"
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="font-semibold text-[#040741]">Glissez votre fichier ici</p>
        <p className="text-sm text-gray-500 mt-1">ou cliquez pour parcourir</p>
        <p className="text-xs text-gray-400 mt-2">CSV, XLS, XLSX · UTF-8 ou Latin-1</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xls,.xlsx"
          className="hidden"
          onChange={e => handleFileUpload(e.target.files[0])}
        />
      </div>

      {fileLoading && (
        <div className="flex items-center gap-2 text-sm text-[#313ADF]">
          <div className="w-4 h-4 border-2 border-[#313ADF] border-t-transparent rounded-full animate-spin" />
          Lecture du fichier…
        </div>
      )}

      {fileData && !fileLoading && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 flex-shrink-0 text-sm font-bold">✓</div>
          <div>
            <p className="font-semibold text-green-800">{fileData.rows.length} lignes détectées</p>
            <p className="text-sm text-green-700 mt-0.5">
              {fileData.headers.length} colonnes : {fileData.headers.slice(0, 5).join(', ')}
              {fileData.headers.length > 5 ? ` … +${fileData.headers.length - 5}` : ''}
            </p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-700 mb-2">Sources compatibles</p>
        <div className="flex flex-wrap gap-1.5">
          {['Dolibarr', 'EBP', 'WooCommerce', 'Shopify', 'Odoo', 'Sage', 'Cegid', 'QuickBooks', 'Excel', 'Google Sheets'].map(s => (
            <span key={s} className="px-2 py-0.5 bg-white border border-blue-200 rounded-full text-xs text-blue-700">{s}</span>
          ))}
        </div>
      </div>
    </div>
  )

  // ── Step 2 — AI mapping review ───────────────────────────────────────────────

  const renderStep2 = () => {
    const sampleTransformed = aiMapping
      ? applyMappingSpec(fileData.rows.slice(0, 3), aiMapping.mappings, entity)
      : []

    return (
      <div className="space-y-5">
        {/* Loading */}
        {aiLoading && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <div className="relative w-14 h-14">
              <div className="w-14 h-14 border-4 border-[#313ADF]/20 rounded-full" />
              <div className="absolute inset-0 w-14 h-14 border-4 border-t-[#313ADF] rounded-full animate-spin" />
            </div>
            <p className="text-sm font-semibold text-[#040741]">L'IA analyse vos colonnes…</p>
            <p className="text-xs text-gray-400">Détection des correspondances et transformations</p>
          </div>
        )}

        {!aiLoading && aiMapping && (
          <>
            {/* Variant auto-detection banner */}
            {variantMode && variantConfig && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex gap-3">
                <span className="text-lg flex-shrink-0">🎨</span>
                <div>
                  <p className="text-sm font-semibold text-purple-800">Variantes détectées automatiquement</p>
                  <p className="text-xs text-purple-700 mt-0.5">{variantConfig.reason}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {variantConfig.sizeColumn && (
                      <span className="px-2 py-0.5 bg-purple-100 border border-purple-200 rounded-full text-xs text-purple-700">
                        Taille : {variantConfig.sizeColumn}
                      </span>
                    )}
                    {variantConfig.comfortColumn && (
                      <span className="px-2 py-0.5 bg-purple-100 border border-purple-200 rounded-full text-xs text-purple-700">
                        Confort : {variantConfig.comfortColumn}
                      </span>
                    )}
                    {variantConfig.priceColumn && (
                      <span className="px-2 py-0.5 bg-purple-100 border border-purple-200 rounded-full text-xs text-purple-700">
                        Prix : {variantConfig.priceColumn}
                      </span>
                    )}
                    {variantConfig.skuSupplierColumn && (
                      <span className="px-2 py-0.5 bg-purple-100 border border-purple-200 rounded-full text-xs text-purple-700">
                        SKU fournisseur : {variantConfig.skuSupplierColumn}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-purple-600 mt-2">Elles seront regroupées automatiquement à l'import.</p>
                </div>
              </div>
            )}

            {/* AI explanation */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
              <span className="text-lg flex-shrink-0">✨</span>
              <p className="text-sm text-indigo-800 leading-relaxed">{aiMapping.explanation}</p>
            </div>

            {/* Sample preview table */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Aperçu — 3 premières lignes après transformation
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {cfg.fields.map(f => (
                        <th key={f.key} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                          {f.label}{f.required ? <span className="text-red-400">*</span> : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleTransformed.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {cfg.fields.map(f => (
                          <td
                            key={f.key}
                            className={`px-3 py-2 truncate max-w-[140px] ${
                              !row[f.key] && f.required
                                ? 'bg-red-50 text-red-400 italic'
                                : 'text-[#040741]'
                            }`}
                            title={row[f.key] != null ? String(row[f.key]) : ''}
                          >
                            {row[f.key] != null
                              ? String(row[f.key])
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mapping detail */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Détail du mapping</p>
              <div className="space-y-1">
                {cfg.fields.map(f => {
                  const m = aiMapping.mappings.find(x => x.targetField === f.key)
                  const hasSources = m?.sourceColumns?.length > 0
                  const isEditing = editingField === f.key

                  return (
                    <div
                      key={f.key}
                      className={`rounded-xl border transition-all ${
                        isEditing
                          ? 'border-[#313ADF]/40 bg-[#313ADF]/3'
                          : hasSources
                            ? 'border-gray-100 bg-white'
                            : f.required
                              ? 'border-red-200 bg-red-50'
                              : 'border-gray-100 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-36 flex-shrink-0">
                          <span className="text-sm font-semibold text-[#040741]">{f.label}</span>
                          {f.required && <span className="text-red-400 ml-0.5 text-xs">*</span>}
                        </div>

                        <span className="text-gray-300 flex-shrink-0">←</span>

                        <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                          {hasSources ? (
                            m.sourceColumns.map((col, ci) => (
                              <span key={ci} className="flex items-center gap-1">
                                <span className="inline-flex items-center px-2 py-0.5 bg-[#313ADF]/10 text-[#313ADF] rounded-full text-xs font-medium whitespace-nowrap">
                                  {col}
                                </span>
                                {ci < m.sourceColumns.length - 1 && (
                                  <span className="text-xs text-gray-400">+</span>
                                )}
                              </span>
                            ))
                          ) : (
                            <span className={`text-xs ${f.required ? 'text-red-500 font-medium' : 'text-gray-300'}`}>
                              {f.required ? '⚠️ Non trouvé — obligatoire !' : 'Non mappé'}
                            </span>
                          )}
                          {hasSources && m.transform === 'concat' && m.concatSeparator && (
                            <span className="text-xs text-gray-400 self-center">
                              (fusionnés avec « {m.concatSeparator} »)
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => setEditingField(isEditing ? null : f.key)}
                          className="text-xs text-gray-400 hover:text-[#313ADF] flex-shrink-0 px-2 py-1 rounded-lg hover:bg-[#313ADF]/5 transition-colors"
                        >
                          {isEditing ? '✕' : '✏️'}
                        </button>
                      </div>

                      {isEditing && (
                        <div className="px-4 pb-3">
                          <MappingFieldEditor
                            mapping={m ?? { targetField: f.key, sourceColumns: [], transform: 'direct' }}
                            headers={fileData.headers}
                            onChange={(updated) => {
                              updateMapping(updated)
                              setEditingField(null)
                            }}
                            onClose={() => setEditingField(null)}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Ask AI to correct */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">💬 Demander une correction à l'IA</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiMessage}
                  onChange={e => setAiMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && aiMessage.trim()) callAI(aiMessage, aiMapping)
                  }}
                  placeholder={'Ex : "La TVA s\'appelle Taux dans mon fichier"'}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#313ADF]/20 focus:border-[#313ADF] outline-none bg-white"
                />
                <button
                  onClick={() => aiMessage.trim() && callAI(aiMessage, aiMapping)}
                  disabled={!aiMessage.trim() || aiLoading}
                  className="px-4 py-2 bg-[#313ADF] text-white rounded-xl text-sm font-semibold hover:bg-[#2830b8] transition-colors disabled:opacity-40"
                >
                  Envoyer
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Step 3 — Preview before import ──────────────────────────────────────────

  const renderStep3 = () => {
    const valid = mappedRows.filter(r => !r._errors?.length)
    const withErrors = mappedRows.filter(r => r._errors?.length > 0)

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
            <p className="text-2xl font-bold text-[#313ADF]">{mappedRows.length}</p>
            <p className="text-xs text-blue-500 mt-0.5">Total</p>
          </div>
        </div>

        {variantMode && variantConfig && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex gap-2 items-center">
            <span className="text-sm">🎨</span>
            <p className="text-xs text-purple-700">
              Mode variantes actif — les produits identiques seront regroupés en 1 fiche avec leurs variantes.
            </p>
          </div>
        )}

        {withErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm font-semibold text-red-700 mb-1">Lignes ignorées — champs obligatoires manquants :</p>
            {withErrors.slice(0, 5).map((r, i) => (
              <p key={i} className="text-xs text-red-600">
                · Ligne {r._row} : {r._errors.map(e => cfg.fields.find(f => f.key === e)?.label).join(', ')}
              </p>
            ))}
            {withErrors.length > 5 && (
              <p className="text-xs text-red-500 mt-1">…et {withErrors.length - 5} autres</p>
            )}
          </div>
        )}

        {valid.length > 0 ? (
          <div className="overflow-auto rounded-xl border border-gray-200 max-h-72">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  {cfg.fields.slice(0, 5).map(f => (
                    <th key={f.key} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valid.slice(0, 30).map((r, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {cfg.fields.slice(0, 5).map(f => (
                      <td key={f.key} className="px-3 py-2 text-[#040741] truncate max-w-[120px]">
                        {String(r[f.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {valid.length > 30 && (
              <p className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t">+ {valid.length - 30} lignes non affichées</p>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-red-500 text-sm font-medium">Aucune ligne valide.</p>
            <p className="text-xs text-gray-400 mt-1">Retournez corriger le mapping IA.</p>
          </div>
        )}
      </div>
    )
  }

  // ── Step 4 — Result ──────────────────────────────────────────────────────────

  const renderStep4 = () => {
    if (!importResult) return null
    const destPath = entity === 'clients' ? '/clients' : entity === 'fournisseurs' ? '/fournisseurs' : '/produits'
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
            onClick={() => navigate(destPath)}
            className="px-6 py-2.5 bg-[#313ADF] text-white rounded-xl font-semibold text-sm hover:bg-[#2830b8] transition-colors"
          >
            Voir les {cfg?.label}
          </button>
          <button
            onClick={() => {
              setStep(0); setEntity(null); setFileData(null)
              setAiMapping(null); setMappedRows([]); setImportResult(null)
              setVariantMode(false); setVariantConfig(null)
            }}
            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors"
          >
            Nouvel import
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  const validCount = mappedRows.filter(r => !r._errors?.length).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#040741] px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Import de données</h1>
          <p className="text-white/50 text-xs">CSV ou Excel · Mapping intelligent par IA</p>
        </div>
      </div>

      <StepBar current={step} />

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </div>

        {step < 4 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={goBack}
                disabled={(step === 2 && aiLoading) || importing}
                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                ← {step === 0 ? 'Annuler' : 'Retour'}
              </button>
              <button
                onClick={goNext}
                disabled={!canNext() || importing}
                className="px-6 py-2.5 bg-[#313ADF] text-white rounded-xl text-sm font-semibold hover:bg-[#2830b8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {importing && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {importing && importProgress
                  ? `${importProgress.current} / ${importProgress.total} importés…`
                  : step === 3
                    ? `Importer ${validCount} enregistrement(s)`
                    : 'Suivant →'
                }
              </button>
            </div>

            {/* Inline progress bar — only shown after 30s */}
            {importing && showProgressBar && importProgress && (
              <div className="space-y-1">
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#313ADF] rounded-full transition-all duration-500"
                    style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 text-right">
                  {Math.round((importProgress.current / importProgress.total) * 100)}%
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
