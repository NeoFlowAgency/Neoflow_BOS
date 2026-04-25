// src/modules/delivery/components/driver/PaymentCapture.jsx
import { useState } from 'react'
import { Banknote, FileText } from 'lucide-react'

export default function PaymentCapture({ remainingAmount, onPayment, onSkip }) {
  const [method, setMethod] = useState(null)
  const [amount, setAmount] = useState(remainingAmount?.toFixed(2) ?? '')

  const parsedAmount = parseFloat(amount) || 0
  const cashLimitExceeded = method === 'cash' && parsedAmount > 1000
  const canConfirm = method && parsedAmount > 0 && !cashLimitExceeded

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
        <p className="text-sm text-amber-700">Reste à encaisser</p>
        <p className="text-3xl font-bold text-amber-900 mt-1">
          {remainingAmount?.toFixed(2)} €
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { key: 'cash',  label: 'Espèces',  Icon: Banknote },
          { key: 'check', label: 'Chèque',   Icon: FileText },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setMethod(key)}
            className={`py-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-colors
              ${method === key
                ? 'border-[#313ADF] bg-[#313ADF]/5 text-[#313ADF]'
                : 'border-gray-200 text-gray-600'}`}
          >
            <Icon size={24} />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      {method && (
        <div>
          <label className="text-sm text-gray-600 mb-1 block">Montant encaissé (€)</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className={`w-full text-2xl font-semibold text-center border rounded-xl py-3 focus:outline-none
              ${cashLimitExceeded ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-[#313ADF]'}`}
            step="0.01"
            min="0"
          />
          {cashLimitExceeded && (
            <p className="mt-2 text-sm text-red-600 font-medium">
              ⚠️ Légal : le paiement en espèces est limité à 1 000 € pour les particuliers (art. L.112-6 CMF). Proposez un autre moyen de paiement.
            </p>
          )}
        </div>
      )}

      <button
        disabled={!canConfirm}
        onClick={() => onPayment({ method, amount: parsedAmount })}
        className="w-full py-4 bg-[#313ADF] text-white rounded-xl font-semibold text-lg
                   disabled:opacity-40 disabled:cursor-not-allowed active:bg-[#2830c0]"
      >
        Confirmer l'encaissement
      </button>

      <button onClick={onSkip} className="w-full py-3 text-gray-500 text-sm underline">
        Aucun paiement à encaisser
      </button>
    </div>
  )
}
