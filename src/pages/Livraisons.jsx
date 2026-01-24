import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Livraisons() {
  const navigate = useNavigate()
  const [livraisons, setLivraisons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLivraisons()
  }, [])

  const loadLivraisons = async () => {
    try {
      const { data } = await supabase
        .from('livraisons')
        .select('*, devis(numero_devis, clients(nom, prenom, adresse))')
        .order('date_prevue', { ascending: true })

      setLivraisons(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const aujourdhui = new Date().toISOString().split('T')[0]

  const grouped = {
    en_cours: livraisons.filter(l => l.statut === 'en_cours' && l.date_prevue >= aujourdhui),
    en_retard: livraisons.filter(l => l.statut === 'en_cours' && l.date_prevue < aujourdhui),
    finalise: livraisons.filter(l => l.statut === 'finalise')
  }

  const handleStatutChange = async (livraisonId, newStatut) => {
    try {
      const updateData = { statut: newStatut }
      if (newStatut === 'finalise') {
        updateData.date_livree = new Date().toISOString()
      }

      await supabase
        .from('livraisons')
        .update(updateData)
        .eq('id', livraisonId)

      await loadLivraisons()
    } catch (err) {
      console.error(err)
    }
  }

  const LivraisonCard = ({ livraison, onClick }) => {
    const client = livraison.devis?.clients
    const clientName = client ? `${client.prenom} ${client.nom}` : 'Client inconnu'
    const adresse = livraison.adresse_livraison || client?.adresse || ''

    return (
      <div
        onClick={onClick}
        className="bg-gray-100 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
      >
        <p className="font-bold text-[#1e1b4b] text-lg mb-1">{clientName}</p>
        <p className="text-sm text-gray-600 leading-snug">{adresse}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#1e1b4b] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold text-[#3b82f6] italic">livraison</h1>
        <button
          onClick={() => navigate('/creer-devis')}
          className="bg-[#1e1b4b] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#2d2a5d] transition-colors shadow-lg"
        >
          nouvelle livraison
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-3 gap-4">
        {/* En cours */}
        <div>
          <div className="bg-gray-200 rounded-full py-2 px-6 text-center mb-4">
            <h2 className="font-bold text-[#1e1b4b] text-lg">En cours</h2>
          </div>
          <div className="bg-[#c7d2fe] rounded-2xl p-4 min-h-[500px]">
            <div className="space-y-3">
              {grouped.en_cours.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Aucune livraison</p>
              ) : (
                grouped.en_cours.map(l => (
                  <LivraisonCard
                    key={l.id}
                    livraison={l}
                    onClick={() => handleStatutChange(l.id, 'finalise')}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* En retard */}
        <div>
          <div className="bg-gray-200 rounded-full py-2 px-6 text-center mb-4">
            <h2 className="font-bold text-[#1e1b4b] text-lg">En retard</h2>
          </div>
          <div className="bg-[#c7d2fe] rounded-2xl p-4 min-h-[500px]">
            <div className="space-y-3">
              {grouped.en_retard.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Aucune livraison</p>
              ) : (
                grouped.en_retard.map(l => (
                  <LivraisonCard
                    key={l.id}
                    livraison={l}
                    onClick={() => handleStatutChange(l.id, 'finalise')}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Finaliser */}
        <div>
          <div className="bg-gray-200 rounded-full py-2 px-6 text-center mb-4">
            <h2 className="font-bold text-[#1e1b4b] text-lg">Finaliser</h2>
          </div>
          <div className="bg-[#c7d2fe] rounded-2xl p-4 min-h-[500px]">
            <div className="space-y-3">
              {grouped.finalise.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Aucune livraison</p>
              ) : (
                grouped.finalise.map(l => (
                  <LivraisonCard
                    key={l.id}
                    livraison={l}
                    onClick={() => {}}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lien Retour */}
      <button
        onClick={() => navigate('/devis')}
        className="mt-8 inline-flex items-center gap-2 px-6 py-2 border-2 border-[#1e1b4b] rounded-full text-[#1e1b4b] font-semibold hover:bg-gray-50 transition-colors"
      >
        <span>←</span>
        <span>Retour</span>
      </button>
    </div>
  )
}
