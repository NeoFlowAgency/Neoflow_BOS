import { useState } from 'react'

export default function NeoButton() {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Tooltip bientot disponible */}
      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-3 w-56 pointer-events-none">
          <div className="bg-[#040741] text-white rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base">🤖</span>
              <p className="font-bold text-sm">Neo — Assistant IA</p>
            </div>
            <p className="text-xs text-white/70 leading-relaxed">
              Bientot disponible ! Neo vous guidera dans vos actions et repondra a vos questions.
            </p>
            <div className="mt-2.5 px-2.5 py-1 bg-[#313ADF]/40 rounded-lg inline-block">
              <p className="text-xs text-white/90 font-medium">En cours de developpement</p>
            </div>
          </div>
          {/* Arrow */}
          <div className="absolute bottom-[-6px] right-5 w-3 h-3 bg-[#040741] rotate-45 rounded-sm" />
        </div>
      )}

      {/* Button */}
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="relative w-14 h-14 rounded-2xl shadow-2xl bg-gradient-to-br from-[#313ADF] to-[#040741] flex items-center justify-center transition-all hover:scale-110 active:scale-95 group"
        aria-label="Neo — Assistant IA (bientot disponible)"
      >
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-2xl bg-[#313ADF]/40 animate-ping opacity-30" />

        {/* Icon */}
        <svg className="w-7 h-7 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>

        {/* Soon badge */}
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
          <svg className="w-3 h-3 text-amber-900" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        </span>
      </button>
    </div>
  )
}
