import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { getLaunchDate } from '../lib/earlyAccess'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function EarlyAccessWaiting() {
  const navigate = useNavigate()
  const { currentWorkspace } = useWorkspace()
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [launched, setLaunched] = useState(false)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const launch = getLaunchDate()
      const diff = launch - now

      if (diff <= 0) {
        setLaunched(true)
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeLeft({ days, hours, minutes, seconds })
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (launched) {
      window.location.href = '/dashboard'
    }
  }, [launched])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const CountdownBlock = ({ value, label }) => (
    <div className="flex flex-col items-center">
      <div className="bg-[#040741] text-white rounded-xl w-16 h-16 md:w-20 md:h-20 flex items-center justify-center shadow-lg">
        <span className="text-2xl md:text-3xl font-bold">{String(value).padStart(2, '0')}</span>
      </div>
      <span className="text-xs text-gray-500 mt-2 font-medium uppercase tracking-wider">{label}</span>
    </div>
  )

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BackgroundPattern />

      <div className="mb-8 relative z-10">
        <img src="/logo-neoflow.png" alt="Neoflow Agency" className="h-20 object-contain" />
      </div>

      <div className="w-full max-w-lg bg-white border-2 border-[#040741] rounded-3xl p-6 md:p-10 shadow-xl relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-[#313ADF] to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#040741]">Acces anticipe active !</h1>
          <p className="text-gray-500 mt-2">Votre application sera disponible dans :</p>
        </div>

        {/* Countdown */}
        <div className="flex justify-center gap-3 md:gap-4 mb-8">
          <CountdownBlock value={timeLeft.days} label="Jours" />
          <CountdownBlock value={timeLeft.hours} label="Heures" />
          <CountdownBlock value={timeLeft.minutes} label="Minutes" />
          <CountdownBlock value={timeLeft.seconds} label="Secondes" />
        </div>

        {/* Info */}
        <div className="bg-[#313ADF]/5 border border-[#313ADF]/20 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-[#313ADF] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-gray-600">
              Vous pouvez des maintenant modifier vos <span className="font-semibold text-[#040741]">informations personnelles</span> et celles de votre <span className="font-semibold text-[#040741]">workspace</span> dans les parametres.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => navigate('/settings')}
            className="w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg"
          >
            Acceder aux parametres
          </button>
          <button
            onClick={handleLogout}
            className="w-full bg-gray-100 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Se deconnecter
          </button>
        </div>

        {currentWorkspace?.name && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Workspace : {currentWorkspace.name}
          </p>
        )}
      </div>

      <p className="mt-8 text-gray-400 text-sm relative z-10">
        Propulse par Neoflow Agency
      </p>
    </div>
  )
}
