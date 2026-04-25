// src/modules/delivery/components/driver/DeliveryWorkflow.jsx
import { useState } from 'react'
import { confirmLoading, transitionDelivery, reportProblem, completeDelivery, uploadDeliveryPhoto, uploadSignature, updateDelivery } from '../../services/deliveryService'
import { useWorkspace } from '../../../../contexts/WorkspaceContext'
import { sendSms } from '../../../../services/edgeFunctionService'
import SignatureCanvas from './SignatureCanvas'
import PhotoCapture from './PhotoCapture'
import PaymentCapture from './PaymentCapture'
import { ChevronLeft, AlertTriangle, CheckCircle, Navigation, Phone } from 'lucide-react'

const STEPS = ['preparation', 'en_route', 'chez_client', 'finalisation', 'termine']
const STEP_LABELS = { preparation: 'Chargement', en_route: 'En route', chez_client: 'Installation', finalisation: 'Finalisation', termine: 'Terminé' }
const PROBLEM_TYPES = [
  { key: 'absent', label: 'Client absent' },
  { key: 'damaged', label: 'Article endommagé' },
  { key: 'refused', label: 'Refus de livraison' },
  { key: 'other', label: 'Autre' },
]

export default function DeliveryWorkflow({ delivery, onClose, workspaceId }) {
  const { workspace } = useWorkspace()
  const [step, setStep] = useState('preparation')
  const [loading, setLoading] = useState(false)
  const [checkedItems, setCheckedItems] = useState({})
  const [checkedInstall, setCheckedInstall] = useState({})
  const [oldFurnitureConfirmed, setOldFurnitureConfirmed] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState(null)
  const [showProblemModal, setShowProblemModal] = useState(false)
  const [problemType, setProblemType] = useState('')
  const [problemDesc, setProblemDesc] = useState('')
  const [signatureRefused, setSignatureRefused] = useState(false)

  const orderItems = delivery.order?.order_items ?? []
  const customer = delivery.order?.customer
  const isReprise = delivery.order?.old_furniture_option === 'reprise'
  const remaining = delivery.order?.remaining_amount ?? 0
  const stepIndex = STEPS.indexOf(step)

  const allLoadChecked = orderItems.length > 0 && orderItems.every(i => checkedItems[i.id])
  const allInstallChecked = orderItems.every(i => checkedInstall[i.id]) && (!isReprise || oldFurnitureConfirmed)

  const goEnRoute = async () => {
    setLoading(true)
    try {
      await confirmLoading(delivery.id)
      await transitionDelivery(delivery.id, 'en_route')
      // SMS en route si activé et pas déjà envoyé
      if (workspace?.sms_driver_en_route_enabled && !delivery.sms_en_route_sent) {
        const phone = customer?.phone
        const prenom = customer?.first_name ?? 'client'
        const heure = delivery.time_slot ?? 'dans la journée'
        const template = workspace.sms_template_driver_en_route
          ?.replace('{prenom}', prenom)
          ?.replace('{heure_estimee}', heure)
          ?.replace('{magasin}', workspace.name)
        if (phone && template) {
          sendSms(workspace.id, phone, { message: template }).catch(() => {})
          updateDelivery(delivery.id, { sms_en_route_sent: true }).catch(() => {})
        }
      }
      setStep('en_route')
    } finally {
      setLoading(false)
    }
  }

  const goChezClient = async () => {
    setLoading(true)
    try {
      await transitionDelivery(delivery.id, 'chez_client')
      setStep('chez_client')
    } finally {
      setLoading(false)
    }
  }

  const handlePayment = async ({ method, amount }) => {
    await updateDelivery(delivery.id, { payment_method: method, amount_collected: amount })
  }

  const handleComplete = async () => {
    setLoading(true)
    try {
      if (photoFile) await uploadDeliveryPhoto(delivery.id, photoFile)
      if (signatureDataUrl) await uploadSignature(delivery.id, signatureDataUrl)
      await completeDelivery(delivery.id)
      // SMS avis Google — uniquement si aucun problème signalé
      if (!delivery.problem_type && !delivery.sms_review_sent) {
        const phone = customer?.phone
        const prenom = customer?.first_name ?? 'client'
        const template = workspace?.sms_template_post_delivery
          ?.replace('{prenom}', prenom)
          ?.replace('{lien_avis_google}', workspace.google_review_url ?? '')
          ?.replace('{magasin}', workspace?.name ?? '')
        if (phone && template) {
          sendSms(workspace.id, phone, { message: template }).catch(() => {})
          updateDelivery(delivery.id, { sms_review_sent: true }).catch(() => {})
        }
      }
      setStep('termine')
    } finally {
      setLoading(false)
    }
  }

  const handleProblem = async () => {
    if (!problemType) return
    setLoading(true)
    try {
      await reportProblem(delivery.id, problemType, problemDesc)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* En-tête */}
      <div className="bg-[#040741] text-white px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onClose} className="p-1 -ml-1">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <p className="font-semibold">{customer?.first_name} {customer?.last_name}</p>
            <p className="text-blue-200 text-xs">{STEP_LABELS[step]}</p>
          </div>
        </div>
        {/* Progress */}
        <div className="flex gap-1">
          {STEPS.filter(s => s !== 'termine').map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${i <= stepIndex ? 'bg-[#313ADF]' : 'bg-white/20'}`} />
          ))}
        </div>
      </div>

      {/* Corps */}
      <div className="flex-1 px-4 py-6">

        {/* ÉTAPE 1 — Préparation */}
        {step === 'preparation' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-gray-900">Chargement des articles</h2>
            {delivery.pickup_location && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">Lieu de chargement</p>
                <p className="text-gray-900 font-medium">
                  {delivery.pickup_location === 'store' ? 'Magasin' : delivery.pickup_location === 'depot' ? 'Dépôt' : delivery.pickup_location}
                </p>
              </div>
            )}
            <div className="space-y-2">
              {orderItems.map(item => (
                <label key={item.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-4 border border-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!checkedItems[item.id]}
                    onChange={e => setCheckedItems(prev => ({ ...prev, [item.id]: e.target.checked }))}
                    className="w-5 h-5 accent-[#313ADF]"
                  />
                  <span className="text-gray-900">{item.product?.name ?? 'Article'}</span>
                  {item.quantity > 1 && <span className="text-gray-400 text-sm ml-auto">x{item.quantity}</span>}
                </label>
              ))}
            </div>
            <button
              onClick={goEnRoute}
              disabled={!allLoadChecked || loading}
              className="w-full py-4 bg-[#313ADF] text-white rounded-xl font-semibold text-lg mt-4 disabled:opacity-40 active:bg-[#2830c0]"
            >
              {loading ? 'Chargement...' : 'Tout est chargé → Départ'}
            </button>
          </div>
        )}

        {/* ÉTAPE 2 — En route */}
        {step === 'en_route' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900">En route</h2>
            {customer?.address && (
              <div className="bg-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Adresse</p>
                <p className="font-semibold text-gray-900">{customer.address}</p>
              </div>
            )}
            {customer?.address ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customer.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 w-full py-5 bg-[#313ADF] text-white rounded-xl font-semibold text-lg"
              >
                <Navigation size={24} /> Naviguer
              </a>
            ) : (
              <div className="w-full py-5 bg-gray-200 text-gray-400 rounded-xl font-semibold text-lg text-center">
                Adresse non renseignée
              </div>
            )}
            {customer?.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center justify-center gap-3 w-full py-5 bg-green-600 text-white rounded-xl font-semibold text-lg"
              >
                <Phone size={24} /> Appeler le client
              </a>
            )}
            <button
              onClick={goChezClient}
              disabled={loading}
              className="w-full py-5 bg-amber-500 text-white rounded-xl font-semibold text-lg disabled:opacity-40"
            >
              {loading ? '...' : '✅ Je suis arrivé'}
            </button>
          </div>
        )}

        {/* ÉTAPE 3 — Chez le client */}
        {step === 'chez_client' && (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-gray-900">Installation</h2>
            <div className="space-y-2">
              {orderItems.map(item => (
                <label key={item.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-4 border border-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!checkedInstall[item.id]}
                    onChange={e => setCheckedInstall(prev => ({ ...prev, [item.id]: e.target.checked }))}
                    className="w-5 h-5 accent-[#313ADF]"
                  />
                  <span className="text-gray-900">Déposé : {item.product?.name ?? 'Article'}</span>
                </label>
              ))}
              {isReprise && (
                <label className="flex items-center gap-3 bg-amber-50 rounded-xl px-4 py-4 border border-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={oldFurnitureConfirmed}
                    onChange={e => setOldFurnitureConfirmed(e.target.checked)}
                    className="w-5 h-5 accent-amber-500"
                  />
                  <span className="text-amber-800 font-medium">Ancien matelas récupéré ✓</span>
                </label>
              )}
            </div>
            <button
              onClick={() => setStep('finalisation')}
              disabled={!allInstallChecked}
              className="w-full py-4 bg-[#313ADF] text-white rounded-xl font-semibold text-lg disabled:opacity-40"
            >
              Installation terminée
            </button>
          </div>
        )}

        {/* ÉTAPE 4 — Finalisation */}
        {step === 'finalisation' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Finalisation</h2>

            {/* Signature */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Signature du client</p>
              {signatureRefused ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between">
                  <p className="text-sm text-orange-700 font-medium">Signature refusée par le client</p>
                  <button onClick={() => setSignatureRefused(false)} className="text-xs text-orange-600 underline">Annuler</button>
                </div>
              ) : signatureDataUrl ? (
                <div className="space-y-2">
                  <img src={signatureDataUrl} alt="Signature" className="w-full border border-gray-200 rounded-xl bg-white" />
                  <button onClick={() => setSignatureDataUrl(null)} className="text-sm text-[#313ADF] underline">
                    Resigner
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <SignatureCanvas onSave={setSignatureDataUrl} onCancel={null} />
                  <button
                    onClick={() => setSignatureRefused(true)}
                    className="w-full py-2 text-sm text-orange-600 border border-orange-200 rounded-xl"
                  >
                    Client refuse de signer
                  </button>
                </div>
              )}
            </div>

            {/* Photo */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Photo de livraison</p>
              <PhotoCapture onCapture={setPhotoFile} onSkip={() => {}} />
            </div>

            {/* Paiement */}
            {remaining > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Encaissement</p>
                <PaymentCapture
                  remainingAmount={remaining}
                  onPayment={handlePayment}
                  onSkip={() => {}}
                />
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleComplete}
              disabled={(!signatureDataUrl && !signatureRefused) || loading}
              className="w-full py-4 bg-[#313ADF] text-white rounded-xl font-bold text-lg disabled:opacity-40 active:bg-[#2830c0]"
            >
              {loading ? 'Enregistrement...' : 'Livraison terminée ✅'}
            </button>

            <button
              onClick={() => setShowProblemModal(true)}
              className="w-full py-3 flex items-center justify-center gap-2 text-red-600 text-sm font-medium"
            >
              <AlertTriangle size={16} /> Signaler un problème
            </button>
          </div>
        )}

        {/* ÉTAPE 5 — Terminé */}
        {step === 'termine' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
            <CheckCircle size={80} className="text-green-500" />
            <h2 className="text-2xl font-bold text-gray-900">Livraison terminée !</h2>
            <p className="text-gray-500">La livraison a été enregistrée avec succès.</p>
            <button
              onClick={onClose}
              className="mt-6 w-full max-w-xs py-4 bg-[#313ADF] text-white rounded-xl font-semibold"
            >
              Retour à ma journée
            </button>
          </div>
        )}
      </div>

      {/* Modal problème */}
      {showProblemModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Signaler un problème</h3>
            <div className="space-y-2">
              {PROBLEM_TYPES.map(pt => (
                <button
                  key={pt.key}
                  onClick={() => setProblemType(pt.key)}
                  className={`w-full py-3 px-4 rounded-xl border-2 text-left text-sm font-medium transition-colors
                    ${problemType === pt.key ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-700'}`}
                >
                  {pt.label}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Description (optionnel)"
              value={problemDesc}
              onChange={e => setProblemDesc(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowProblemModal(false)} className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm">
                Annuler
              </button>
              <button
                onClick={handleProblem}
                disabled={!problemType || loading}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
