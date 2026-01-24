import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ListeDevis() {
  const navigate = useNavigate()
  const [devis, setDevis] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDevis()
  }, [])

  const loadDevis = async () => {
    try {
      const { data } = await supabase
        .from('devis')
        .select('*, clients(nom, prenom)')
        .order('created_at', { ascending: false })

      setDevis(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
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
      <div className="flex items-start justify-between mb-6">
        {/* Logo Maison de la Literie */}
        <img
          src="/logo-maison-literie.png"
          alt="Maison de la Literie"
          className="h-16 object-contain rounded-xl"
        />

        {/* Bouton Créer nouveau devis */}
        <button
          onClick={() => navigate('/creer-devis')}
          className="bg-[#1e1b4b] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#2d2a5d] transition-colors shadow-lg"
        >
          Crée un nouveau devis
        </button>
      </div>

      {/* Grille de devis */}
      {devis.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 mb-6 text-lg">Aucun devis trouvé</p>
          <button
            onClick={() => navigate('/creer-devis')}
            className="bg-[#1e1b4b] text-white px-8 py-3 rounded-full font-semibold hover:bg-[#2d2a5d] transition-colors"
          >
            Créer votre premier devis
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {devis.map((d) => (
            <div
              key={d.id}
              onClick={() => navigate(`/apercu-devis/${d.id}`)}
              className="bg-white rounded-lg border-2 border-[#3b82f6] p-3 cursor-pointer hover:shadow-xl transition-all hover:scale-[1.02] aspect-[3/4] flex flex-col"
            >
              {/* Mini aperçu facture */}
              <div className="flex-1 flex flex-col text-[7px] leading-tight">
                {/* En-tête */}
                <div className="flex items-start justify-between mb-2">
                  <img
                    src="/logo-maison-literie.png"
                    alt="Logo"
                    className="h-5 w-auto rounded"
                  />
                  <div className="text-right">
                    <p className="font-bold text-[9px]">FACTURE</p>
                    <p className="text-gray-500 text-[5px]">N°: {d.numero_devis}</p>
                    <p className="text-gray-500 text-[5px]">DATE: {new Date(d.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>

                {/* Émetteur / Destinataire */}
                <div className="flex justify-between mb-2 text-[5px]">
                  <div>
                    <p className="font-bold text-[#d97706]">ÉMETTEUR:</p>
                    <p>Maison de la Literie</p>
                    <p className="text-gray-400">contact@literie.fr</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#d97706]">DESTINATAIRE:</p>
                    <p>{d.clients ? `${d.clients.prenom} ${d.clients.nom}` : 'Client'}</p>
                  </div>
                </div>

                {/* Tableau simplifié */}
                <div className="flex-1 border-t border-gray-100 pt-1">
                  <div className="flex justify-between text-[5px] font-bold border-b border-gray-100 pb-0.5">
                    <span>DESCRIPTION</span>
                    <span>TOTAL HT</span>
                  </div>
                  <div className="text-gray-500 space-y-0.5 mt-0.5">
                    <div className="flex justify-between"><span>Produit 1</span><span>---</span></div>
                    <div className="flex justify-between"><span>Produit 2</span><span>---</span></div>
                  </div>
                </div>

                {/* Totaux */}
                <div className="border-t border-gray-200 pt-1 mt-auto text-[5px]">
                  <div className="flex justify-between"><span>TOTAL HT:</span><span>{d.total_ht?.toFixed(2) || '0.00'}€</span></div>
                  <div className="flex justify-between"><span>TVA:</span><span>{d.montant_tva?.toFixed(2) || '0.00'}€</span></div>
                  <div className="flex justify-between font-bold text-[6px]"><span>TOTAL TTC:</span><span>{d.total_ttc?.toFixed(2) || '0.00'}€</span></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
