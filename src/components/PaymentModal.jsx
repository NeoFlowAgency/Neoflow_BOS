import { useState } from 'react'

const PAYMENT_TYPES = [
  { value: 'deposit', label: 'Acompte' },
  { value: 'partial', label: 'Paiement partiel' },
  { value: 'balance', label: 'Solde' },
  { value: 'full', label: 'Paiement total' }
]

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Especes', icon: '💵' },
  { value: 'card', label: 'Carte bancaire', icon: '💳' },
  { value: 'check', label: 'Cheque', icon: '📝' },
  { value: 'transfer', label: 'Virement', icon: '🏦' },
  { value: 'other', label: 'Autre', icon: '📋' }
]

export default function PaymentModal({ isOpen, onClose, onConfirm, orderTotal, amountPaid, loading }) {
  const [paymentType, setPaymentType] = useState('full')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const remaining = (orderTotal || 0) - (amountPaid || 0)

  const handleTypeChange = (type) => {
    setPaymentType(type)
    if (type === 'full') {
      setAmount(remaining.toFixed(2))
    } else if (type === 'balance') {
      setAmount(remaining.toFixed(2))
    } else {
      setAmount('')
    }
  }

  const handleConfirm = () => {
    setError('')
    const montant = parseFloat(amount)

    if (!montant || montant <= 0) {
      setError('Veuillez saisir un montant valide')
      return
    }

    if (montant > remaining + 0.01) {
      setError(`Le montant ne peut pas depasser le restant du (${remaining.toFixed(2)} EUR)`)
      return
    }

    onConfirm({
      payment_type: paymentType,
      payment_method: paymentMethod,
      amount: montant,
      payment_date: paymentDate,
      notes
    })
  }

  const resetAndClose = () => {
    setPaymentType('full')
    setPaymentMethod('cash')
    setAmount('')
    setPaymentDate(new Date().toISOString().split('T')[0])
    setNotes('')
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-[#040741]">Enregistrer un paiement</h2>
            <p className="text-sm text-gray-500 mt-1">
              Restant du : <span className="font-semibold text-[#313ADF]">{remaining.toFixed(2)} EUR</span>
            </p>
          </div>
          <button
            onClick={resetAndClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Barre de progression paiement */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">Progression du paiement</span>
              <span className="font-medium text-[#040741]">
                {amountPaid?.toFixed(2)} / {orderTotal?.toFixed(2)} EUR
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="h-3 rounded-full transition-all bg-[#313ADF]"
                style={{ width: `${Math.min(100, ((amountPaid || 0) / (orderTotal || 1)) * 100)}%` }}
              />
            </div>
          </div>

          {/* Type de paiement */}
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Type de paiement</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleTypeChange(t.value)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    paymentType === t.value
                      ? 'bg-[#313ADF] text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Methode de paiement */}
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Methode de paiement</label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    paymentMethod === m.value
                      ? 'bg-[#040741] text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Montant */}
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Montant (EUR)</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={remaining.toFixed(2)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
              />
              <button
                type="button"
                onClick={() => setAmount(remaining.toFixed(2))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-[#313ADF]/10 text-[#313ADF] px-2 py-1 rounded-lg font-medium hover:bg-[#313ADF]/20 transition-colors"
              >
                Tout
              </button>
            </div>
          </div>

          {/* Date de paiement */}
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Date du paiement</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remarques sur le paiement..."
              rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-100">
          <button
            onClick={resetAndClose}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-[#313ADF] text-white rounded-xl font-bold hover:bg-[#4149e8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Enregistrement...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Confirmer le paiement
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
