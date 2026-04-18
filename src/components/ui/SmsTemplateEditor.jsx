import { useRef } from 'react'

const ALL_VARIABLES = [
  { key: 'prenom',    label: 'Prénom',          example: 'Sophie',           color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'numero',    label: 'N° commande',      example: 'CMD-2026-042',     color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { key: 'magasin',   label: 'Magasin',          example: 'Ma Literie',       color: 'bg-green-100 text-green-700 border-green-200' },
  { key: 'date',      label: 'Date livraison',   example: '14 mai',           color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'creneau',   label: 'Créneau horaire',  example: '10h–12h',          color: 'bg-pink-100 text-pink-700 border-pink-200' },
  { key: 'lien_avis', label: 'Lien avis Google', example: 'g.page/r/…',      color: 'bg-amber-100 text-amber-700 border-amber-200' },
]

function renderPreview(text) {
  const parts = []
  const regex = /\{(\w+)\}/g
  let lastIndex = 0
  let match
  let i = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={i++}>{text.slice(lastIndex, match.index)}</span>)
    }
    const varDef = ALL_VARIABLES.find(v => v.key === match[1])
    if (varDef) {
      parts.push(
        <span key={i++} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border ${varDef.color}`}>
          {varDef.example}
        </span>
      )
    } else {
      parts.push(<span key={i++} className="bg-gray-100 text-gray-500 px-1 rounded text-xs">{match[0]}</span>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(<span key={i++}>{text.slice(lastIndex)}</span>)
  return parts
}

export default function SmsTemplateEditor({ label, value, onChange, disabled, availableVars }) {
  const taRef = useRef(null)

  const vars = availableVars
    ? ALL_VARIABLES.filter(v => availableVars.includes(v.key))
    : ALL_VARIABLES

  const insertVar = (key) => {
    if (disabled) return
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const token = `{${key}}`
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + token.length, start + token.length)
    }, 0)
  }

  const charCount = value?.length || 0
  const overLimit = charCount > 160

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-semibold text-gray-700">{label}</p>}

      {/* Boutons variables */}
      {!disabled && (
        <div>
          <p className="text-xs text-gray-400 mb-1.5">Cliquez pour insérer au curseur :</p>
          <div className="flex flex-wrap gap-1.5">
            {vars.map(v => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVar(v.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer hover:opacity-75 transition-opacity ${v.color}`}
              >
                + {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Zone de saisie */}
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        placeholder="Écris ton message ici, puis insère les variables ci-dessus…"
        className={`w-full px-3 py-2.5 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] transition-colors ${
          disabled
            ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
            : overLimit
            ? 'bg-white border-red-300 focus:border-red-400 focus:ring-red-200'
            : 'bg-white border-gray-200'
        }`}
      />

      {/* Compteur */}
      <div className="flex justify-end">
        <span className={`text-xs font-semibold ${overLimit ? 'text-red-500' : 'text-gray-400'}`}>
          {charCount}/160 caractères
        </span>
      </div>

      {/* Aperçu */}
      {value?.trim() && (
        <div className="bg-[#040741]/5 border border-[#040741]/10 rounded-xl px-4 py-3">
          <p className="text-xs font-bold text-[#040741]/50 uppercase tracking-wider mb-2">Aperçu du SMS</p>
          <p className="text-sm text-gray-800 leading-relaxed">{renderPreview(value)}</p>
        </div>
      )}
    </div>
  )
}
