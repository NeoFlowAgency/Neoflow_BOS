# NeoFlow BOS v4 — Plan d'implémentation des 18 corrections

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implémenter les 18 corrections et améliorations validées dans le design v4 : onboarding, stock, paiements, livraisons, Neo IA split pane, settings enrichis.

**Architecture:** React 19 + Vite 7 SPA multi-tenant Supabase. Chaque tâche est indépendante après les migrations SQL. Les migrations SQL (Tâche 1) sont un prérequis absolu. Le bug #13 (Tâche 2) est la correction la plus urgente. Les tâches 3-15 peuvent être faites dans l'ordre ou en parallèle.

**Tech Stack:** React 19, Tailwind CSS v4, Supabase (PostgreSQL + RLS + Edge Functions), React Router 7, Stripe.

**Design doc de référence :** `docs/plans/2026-03-01-corrections-v4-design.md`

---

## Task 1 : Migrations SQL (PRÉREQUIS ABSOLU)

**Fichiers à créer :**
- `sql/v4_001_onboarding.sql`
- `sql/v4_002_quotes_deposit.sql`
- `sql/v4_003_orders_extended.sql`
- `sql/v4_004_deliveries_timeslots.sql`
- `sql/v4_005_payments_fix.sql`
- `sql/v4_006_workspace_settings.sql`

**Step 1 : Créer les fichiers SQL**

`sql/v4_001_onboarding.sql`:
```sql
-- Colonnes tutorial et survey sur profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutorial_shown_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_survey JSONB DEFAULT '{}';
```

`sql/v4_002_quotes_deposit.sql`:
```sql
-- Acompte sur les devis
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(10) DEFAULT 'percent'
  CHECK (deposit_type IN ('percent', 'euro'));
```

`sql/v4_003_orders_extended.sql`:
```sql
-- Retrait en magasin + frais de livraison
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_available_from TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fees NUMERIC(12,2) DEFAULT 0;

-- Nouveaux statuts : en_preparation, en_livraison
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'brouillon','confirme','en_preparation','en_livraison',
    'livre','termine','annule'
  ));
```

`sql/v4_004_deliveries_timeslots.sql`:
```sql
-- Créneaux multiples (JSONB) sur les livraisons
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS time_slots JSONB DEFAULT '[]';
```

`sql/v4_005_payments_fix.sql`:
```sql
-- Fix: relier payments.received_by → profiles(id) pour que PostgREST
-- puisse résoudre la jointure profiles!received_by
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_received_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_received_by_profiles_fk
  FOREIGN KEY (received_by) REFERENCES profiles(id) ON DELETE SET NULL;
```

`sql/v4_006_workspace_settings.sql`:
```sql
-- Settings JSON + infos situation magasin (step 4 onboarding)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_settings JSONB DEFAULT '{}';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS nb_employes INTEGER;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ca_annuel_estime NUMERIC(12,2);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS surface_magasin INTEGER;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS specialite TEXT;
```

**Step 2 : Exécuter dans l'ordre dans Supabase SQL Editor**

Aller sur : https://app.supabase.com → projet → SQL Editor
Exécuter chaque fichier dans l'ordre v4_001 → v4_006.
Vérifier : chaque script doit retourner "Success. No rows returned."

**Step 3 : Vérifier les colonnes**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('profiles','quotes','orders','deliveries','payments','workspaces')
  AND column_name IN (
    'tutorial_shown_at','deposit_amount','pickup_available_from',
    'delivery_fees','time_slots','workspace_settings'
  );
```

**Step 4 : Commit des fichiers SQL**

```bash
git add sql/v4_001_onboarding.sql sql/v4_002_quotes_deposit.sql \
        sql/v4_003_orders_extended.sql sql/v4_004_deliveries_timeslots.sql \
        sql/v4_005_payments_fix.sql sql/v4_006_workspace_settings.sql
git commit -m "sql: migrations v4 - onboarding, deposits, orders status, timeslots, payments FK fix"
```

---

## Task 2 : Bug #13 — Erreur paiements après conversion devis → commande

**Fichiers :**
- Modifier : `src/pages/ApercuCommande.jsx`

**Contexte :** La query `payments?select=*,receiver:profiles!received_by(full_name)` échoue avec 400 car `payments.received_by` n'avait pas de FK vers `profiles`. Après la migration v4_005, la FK existe. Il faut aussi s'assurer que la query dans le code est correcte.

**Step 1 : Trouver la query fautive**

Dans `src/pages/ApercuCommande.jsx`, chercher `received_by` ou `profiles!received_by`.
La query ressemble à :
```js
.from('payments')
.select('*, receiver:profiles!received_by(full_name)')
```

**Step 2 : Corriger la query**

Si la query utilise `receiver:profiles!received_by`, après la migration v4_005 elle devrait fonctionner. Si elle utilise une autre syntaxe, normaliser en :
```js
const { data: payments, error } = await supabase
  .from('payments')
  .select('*, receiver:profiles!received_by(full_name)')
  .eq('order_id', commandeId)
  .order('payment_date', { ascending: true })
```

**Step 3 : Ajouter un guard si profiles n'a pas de row pour cet utilisateur**

```jsx
// Dans l'affichage du nom du receveur :
{p.receiver?.full_name || 'Équipe'}
```

**Step 4 : Tester**

1. Créer un devis → convertir en commande
2. Aller sur l'aperçu de la commande
3. Enregistrer un paiement
4. Vérifier : la liste des paiements s'affiche sans erreur 400

**Step 5 : Commit**

```bash
git add src/pages/ApercuCommande.jsx
git commit -m "fix: payments query after quote-to-order conversion (profiles FK)"
```

---

## Task 3 : Neo IA — Split pane redimensionnable (#16)

**Fichiers :**
- Modifier : `src/App.jsx`
- Modifier : `src/components/NeoChat.jsx`

**Step 1 : Ajouter neoWidth state dans App.jsx**

Dans le composant `Layout` de `App.jsx`, ajouter :
```jsx
const [neoOpen, setNeoOpen] = useState(false)
const [neoWidth, setNeoWidth] = useState(() => {
  return parseInt(localStorage.getItem('neoflow_neo_width') || '380', 10)
})

// Écouter l'event d'ouverture Neo
useEffect(() => {
  const open = () => setNeoOpen(true)
  const close = () => setNeoOpen(false)
  window.addEventListener('neoflow:open-neo', open)
  window.addEventListener('neoflow:close-neo', close)
  return () => {
    window.removeEventListener('neoflow:open-neo', open)
    window.removeEventListener('neoflow:close-neo', close)
  }
}, [])

// Persister la largeur
useEffect(() => {
  localStorage.setItem('neoflow_neo_width', String(neoWidth))
}, [neoWidth])
```

**Step 2 : Modifier le `<main>` pour laisser place à Neo**

```jsx
<main
  className={`min-h-screen overflow-y-auto relative z-10 transition-all duration-200 ${
    isMobile
      ? 'ml-0 pb-16'
      : sidebarOpen ? 'ml-[240px]' : 'ml-[80px]'
  }`}
  style={!isMobile && neoOpen ? { paddingRight: `${neoWidth}px` } : {}}
>
```

**Step 3 : Passer neoWidth + setNeoWidth + setNeoOpen à NeoChat**

```jsx
<NeoChat
  neoWidth={neoWidth}
  setNeoWidth={setNeoWidth}
  neoOpen={neoOpen}
  setNeoOpen={setNeoOpen}
/>
```

**Step 4 : Modifier NeoChat.jsx — supprimer backdrop, ajouter resize handle**

Remplacer le composant principal de NeoChat pour :
- Accepter les props `neoWidth`, `setNeoWidth`, `neoOpen`, `setNeoOpen`
- Utiliser `neoOpen` au lieu de l'état interne `isOpen`
- Supprimer le backdrop (`bg-black/25 backdrop-blur-[2px]`)
- Ajouter un resize handle

```jsx
export default function NeoChat({ neoWidth, setNeoWidth, neoOpen, setNeoOpen }) {
  // ... état existant ...

  // Sync avec l'event externe pour le bouton flottant
  const isOpen = neoOpen
  const setIsOpen = setNeoOpen

  // ... reste du code existant ...
```

**Step 5 : Ajouter le resize handle dans le panel**

Dans le panel principal (la div `fixed right-0 top-0 h-screen`), en premier enfant :
```jsx
{/* Resize handle */}
{!isMobile && (
  <div
    className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#313ADF]/40 transition-colors z-10 group"
    onMouseDown={(e) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = neoWidth
      const onMove = (ev) => {
        const delta = startX - ev.clientX
        const newWidth = Math.min(640, Math.max(280, startWidth + delta))
        setNeoWidth(newWidth)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }}
  >
    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-0.5 h-12 bg-white/20 group-hover:bg-[#313ADF]/60 rounded-full" />
  </div>
)}
```

**Step 6 : Appliquer la largeur dynamique au panel**

```jsx
<div
  className="fixed right-0 top-0 h-screen z-[60] flex flex-col bg-white shadow-2xl"
  style={{ width: isMobile ? '100%' : `${neoWidth}px` }}
>
```

**Step 7 : Modifier le bouton flottant pour dispatcher l'event**

```jsx
// Bouton flottant - si Neo n'est pas ouvert
<button
  onClick={() => window.dispatchEvent(new CustomEvent('neoflow:open-neo'))}
  className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[55] ..."
>
```

**Step 8 : Bouton fermer dans le header Neo**

```jsx
onClick={() => window.dispatchEvent(new CustomEvent('neoflow:close-neo'))}
```

**Step 9 : Vérifier visuellement**

1. Ouvrir Neo → le contenu principal se comprime à gauche
2. Glisser la barre gauche de Neo → largeur change de 280 à 640px
3. Fermer Neo → contenu reprend toute la largeur
4. Mobile : comportement inchangé (plein écran)

**Step 10 : Commit**

```bash
git add src/App.jsx src/components/NeoChat.jsx
git commit -m "feat(neo): split pane redimensionnable - push contenu, resize handle, no backdrop"
```

---

## Task 4 : Survey post-signup (#1A)

**Fichiers :**
- Créer : `src/pages/OnboardingSurvey.jsx`
- Modifier : `src/App.jsx` (ajouter route)
- Modifier : `src/pages/Signup.jsx` (redirect vers survey)

**Step 1 : Créer OnboardingSurvey.jsx**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const QUESTIONS = [
  {
    id: 'discovery',
    question: 'Comment avez-vous découvert NeoFlow BOS ?',
    options: ['Réseaux sociaux', 'Bouche à oreille', 'Recherche web', 'Salon ou événement', 'Autre'],
  },
  {
    id: 'reason',
    question: 'Pourquoi avez-vous choisi NeoFlow BOS ?',
    options: ['Gestion complète', 'Prix attractif', 'Interface simple', 'Recommandé', 'Autre'],
  },
  {
    id: 'expectation',
    question: 'Votre principale attente ?',
    options: ['Gérer mes ventes', 'Suivre mon stock', 'Gérer mes livraisons', 'Statistiques', 'Autre'],
  },
]

export default function OnboardingSurvey() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(false)

  const q = QUESTIONS[step]

  const handleSelect = async (option) => {
    const newAnswers = { ...answers, [q.id]: option }
    setAnswers(newAnswers)

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1)
    } else {
      await submit(newAnswers)
    }
  }

  const submit = async (finalAnswers) => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ onboarding_survey: finalAnswers })
        .eq('id', user.id)
    }
    navigate('/onboarding/choice')
  }

  const skip = () => navigate('/onboarding/choice')

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#040741] to-[#0a0b52] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="flex gap-1.5 mb-8">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-[#313ADF]' : 'bg-white/20'
              }`}
            />
          ))}
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
            Question {step + 1} sur {QUESTIONS.length}
          </p>
          <h2 className="text-xl font-bold text-gray-900 mb-6">{q.question}</h2>

          <div className="space-y-2.5">
            {q.options.map((opt) => (
              <button
                key={opt}
                onClick={() => handleSelect(opt)}
                disabled={loading}
                className="w-full text-left px-4 py-3.5 rounded-xl border border-gray-200 hover:border-[#313ADF] hover:bg-[#313ADF]/5 text-gray-700 font-medium text-sm transition-all"
              >
                {opt}
              </button>
            ))}
          </div>

          <button
            onClick={skip}
            className="mt-6 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Passer cette étape →
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2 : Ajouter la route dans App.jsx**

Chercher `<Route path="/onboarding/choice"` et ajouter avant :
```jsx
<Route path="/onboarding/survey" element={<OnboardingSurvey />} />
```
Import en haut : `import OnboardingSurvey from './pages/OnboardingSurvey'`

**Step 3 : Modifier la redirection dans Signup.jsx**

Chercher la redirection vers `/onboarding/choice` et remplacer par :
```jsx
navigate('/onboarding/survey')
```

**Step 4 : Tester**

1. Créer un nouveau compte
2. Vérifier : après inscription → page Survey s'affiche
3. Répondre aux 3 questions → redirect vers `/onboarding/choice`
4. Vérifier dans Supabase : `SELECT onboarding_survey FROM profiles WHERE ...`

**Step 5 : Commit**

```bash
git add src/pages/OnboardingSurvey.jsx src/App.jsx src/pages/Signup.jsx
git commit -m "feat(onboarding): survey post-inscription 3 questions à choix"
```

---

## Task 5 : Workspace création multi-step (#1B)

**Fichiers :**
- Modifier : `src/pages/WorkspaceOnboarding.jsx`

**Step 1 : Ajouter état `currentStep` et données step 4**

Au début du composant, ajouter :
```jsx
const [currentStep, setCurrentStep] = useState(1)
const TOTAL_STEPS = 5

// Étendre le form existant avec les champs step 4
const [form, setForm] = useState({
  // ... champs existants ...
  nb_employes: '',
  ca_annuel_estime: '',
  surface_magasin: '',
  specialite: '',
})
```

**Step 2 : Créer un composant StepIndicator**

```jsx
function StepIndicator({ current, total }) {
  const labels = ['Général', 'Légal', 'Documents', 'Situation', 'Abonnement']
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <div key={step} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
            step < current ? 'bg-emerald-500 text-white' :
            step === current ? 'bg-[#313ADF] text-white' :
            'bg-gray-200 text-gray-400'
          }`}>
            {step < current ? '✓' : step}
          </div>
          {step < total && (
            <div className={`w-8 h-0.5 ${step < current ? 'bg-emerald-500' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}
```

**Step 3 : Envelopper le contenu dans des blocs conditionnels par step**

```jsx
return (
  <div className="...">
    <StepIndicator current={currentStep} total={TOTAL_STEPS} />

    {/* Step 1 : Infos générales */}
    {currentStep === 1 && (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Informations générales</h2>
        {/* Champs: name, description, address, postal_code, city, country, currency */}
        {/* Copier les champs existants correspondants */}
      </div>
    )}

    {/* Step 2 : Infos légales */}
    {currentStep === 2 && (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Informations légales et bancaires</h2>
        {/* Champs: siret, vat_number, legal_form, bank_iban, bank_bic, bank_account_holder */}
      </div>
    )}

    {/* Step 3 : Personnalisation documents */}
    {currentStep === 3 && (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Personnalisation des documents</h2>
        {/* Logo upload + payment_terms + invoice_footer + quote_footer */}
        <button onClick={() => setCurrentStep(4)} className="... text-gray-500">
          Passer cette étape →
        </button>
      </div>
    )}

    {/* Step 4 : Situation du magasin */}
    {currentStep === 4 && (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Votre magasin</h2>
        <input placeholder="Nombre d'employés" type="number"
          value={form.nb_employes} onChange={e => setForm({...form, nb_employes: e.target.value})} />
        <input placeholder="CA annuel estimé (€)" type="number"
          value={form.ca_annuel_estime} onChange={e => setForm({...form, ca_annuel_estime: e.target.value})} />
        <input placeholder="Surface du magasin (m²)" type="number"
          value={form.surface_magasin} onChange={e => setForm({...form, surface_magasin: e.target.value})} />
        <input placeholder="Spécialité (ex: literie, matelas...)"
          value={form.specialite} onChange={e => setForm({...form, specialite: e.target.value})} />
        <button onClick={() => setCurrentStep(5)} className="... text-gray-500">
          Passer cette étape →
        </button>
      </div>
    )}

    {/* Step 5 : Abonnement */}
    {currentStep === 5 && (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Abonnement</h2>
        {/* Plan unique pour l'instant: 49,99€/mois */}
        <div className="border-2 border-[#313ADF] rounded-2xl p-6">
          <p className="font-bold text-lg">Starter</p>
          <p className="text-3xl font-bold">49,99€<span className="text-sm font-normal">/mois</span></p>
          <p className="text-sm text-gray-500">7 jours d'essai gratuit, carte requise</p>
        </div>
        <button onClick={handleSubmit} disabled={loading} className="w-full bg-[#313ADF] text-white py-3 rounded-xl font-semibold">
          {loading ? 'Création...' : 'Commencer l\'essai gratuit →'}
        </button>
      </div>
    )}

    {/* Navigation */}
    <div className="flex gap-3 mt-6">
      {currentStep > 1 && (
        <button onClick={() => setCurrentStep(s => s - 1)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium">
          ← Précédent
        </button>
      )}
      {currentStep < TOTAL_STEPS && currentStep !== 3 && currentStep !== 4 && (
        <button onClick={() => validateAndNext()} className="flex-1 py-2.5 bg-[#313ADF] text-white rounded-xl text-sm font-medium">
          Suivant →
        </button>
      )}
    </div>
  </div>
)
```

**Step 4 : Modifier handleSubmit pour inclure les nouveaux champs**

```jsx
const workspaceData = {
  ...form,
  nb_employes: form.nb_employes ? parseInt(form.nb_employes) : null,
  ca_annuel_estime: form.ca_annuel_estime ? parseFloat(form.ca_annuel_estime) : null,
  surface_magasin: form.surface_magasin ? parseInt(form.surface_magasin) : null,
}
```

**Step 5 : Tester**

1. Se connecter avec un compte existant
2. Aller sur `/onboarding/workspace`
3. Naviguer entre les 5 étapes, vérifier Précédent/Suivant
4. Créer un workspace → vérifier Stripe redirect

**Step 6 : Commit**

```bash
git add src/pages/WorkspaceOnboarding.jsx
git commit -m "feat(onboarding): workspace création en 5 étapes avec stepper"
```

---

## Task 6 : Tutorial auto au premier login (#2) + Supprimer bouton sidebar (#3)

**Fichiers :**
- Modifier : `src/App.jsx`
- Modifier : `src/components/Sidebar.jsx`
- Modifier : `src/pages/Settings.jsx`

**Step 1 : Ajouter détection tutorial dans App.jsx**

Dans le composant `ProtectedRoute` ou `Layout`, après chargement du user :
```jsx
const [showTutorialModal, setShowTutorialModal] = useState(false)

useEffect(() => {
  if (!user) return
  supabase
    .from('profiles')
    .select('tutorial_shown_at')
    .eq('id', user.id)
    .single()
    .then(({ data }) => {
      if (data && !data.tutorial_shown_at) {
        setShowTutorialModal(true)
      }
    })
}, [user?.id])

const handleTutorialClose = async (launch) => {
  setShowTutorialModal(false)
  await supabase
    .from('profiles')
    .update({ tutorial_shown_at: new Date().toISOString() })
    .eq('id', user.id)
  if (launch && currentWorkspace?.id) {
    await createTestData(currentWorkspace.id, user.id)
    toast.success('Données de démonstration créées ! Explorez l\'application.')
  }
}
```

**Step 2 : Ajouter la modal de bienvenue dans le JSX**

```jsx
{showTutorialModal && (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
      <div className="w-16 h-16 bg-gradient-to-br from-[#313ADF] to-[#040741] rounded-2xl flex items-center justify-center mx-auto mb-4">
        <span className="text-white text-2xl font-bold">N</span>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Bienvenue sur NeoFlow BOS !</h2>
      <p className="text-gray-500 text-center text-sm mb-6">
        Voulez-vous qu'on crée des données de démonstration pour explorer l'application ?
      </p>
      <div className="space-y-2.5">
        <button
          onClick={() => handleTutorialClose(true)}
          className="w-full py-3 bg-[#313ADF] text-white rounded-xl font-semibold hover:bg-[#2730c4] transition-colors"
        >
          Oui, créer des données de démonstration
        </button>
        <button
          onClick={() => handleTutorialClose(false)}
          className="w-full py-3 border border-gray-200 text-gray-500 rounded-xl font-medium hover:bg-gray-50 transition-colors"
        >
          Non, je commence avec mes vraies données
        </button>
      </div>
    </div>
  </div>
)}
```

Import : `import { createTestData } from './services/onboardingService'`

**Step 3 : Supprimer le bouton "Nouveau workspace" dans Sidebar.jsx**

Dans `Sidebar.jsx`, chercher et supprimer :
```jsx
<button
  onClick={() => {
    setWsDropdownOpen(false)
    navigate('/onboarding/workspace')
  }}
  className="w-full px-3 py-2.5 ... border-t border-white/10"
>
  <span className="w-6 h-6 border border-dashed ...">{/* Plus icon */}</span>
  <span>Nouveau workspace</span>
</button>
```

**Step 4 : Ajouter "Créer un workspace" dans Settings.jsx**

Dans l'onglet "workspace" de Settings, tout en bas de la section, ajouter :
```jsx
{/* Créer un nouveau workspace */}
<div className="pt-6 border-t border-gray-200">
  <h3 className="font-semibold text-gray-900 mb-1">Créer un nouveau workspace</h3>
  <p className="text-sm text-gray-500 mb-3">
    Vous gérez plusieurs boutiques ? Créez un workspace séparé pour chacune.
  </p>
  <button
    onClick={() => navigate('/onboarding/workspace')}
    className="px-4 py-2 bg-[#313ADF] text-white rounded-xl text-sm font-medium hover:bg-[#2730c4] transition-colors"
  >
    + Créer un nouveau workspace
  </button>
</div>
```

**Step 5 : Tester**

1. Se connecter avec un compte qui n'a jamais vu le tutorial → modal s'affiche
2. Se reconnecter → modal ne s'affiche plus
3. Dans la sidebar, vérifier : bouton "Nouveau workspace" absent
4. Dans Settings > Workspace, vérifier : bouton "Créer un nouveau workspace" présent

**Step 6 : Commit**

```bash
git add src/App.jsx src/components/Sidebar.jsx src/pages/Settings.jsx
git commit -m "feat: tutorial auto premier login, suppr creation workspace sidebar, btn settings"
```

---

## Task 7 : Settings — Tab Préférences (#17)

**Fichiers :**
- Modifier : `src/pages/Settings.jsx`

**Step 1 : Ajouter 'preferences' aux tabs**

```jsx
const TABS = [
  { key: 'compte', label: 'Compte' },
  { key: 'workspace', label: 'Workspace' },
  { key: 'preferences', label: 'Préférences' },  // NOUVEAU
  { key: 'abonnement', label: 'Abonnement' },
  { key: 'membres', label: 'Membres' },
  { key: 'support', label: 'Support' },
]
```

**Step 2 : Ajouter état pour les préférences**

```jsx
const [prefs, setPrefs] = useState({
  delivery_fee_default: '',
  delivery_zone_km: '',
  deposit_percent_default: '30',
  payment_delay_days: '30',
  prefix_orders: 'CMD-',
  prefix_invoices: 'FA-',
  prefix_quotes: 'DEV-',
  stock_alert_threshold: '3',
  vat_rate_default: '20',
})

// Charger depuis workspace_settings
useEffect(() => {
  if (currentWorkspace?.workspace_settings) {
    setPrefs(prev => ({ ...prev, ...currentWorkspace.workspace_settings }))
  }
}, [currentWorkspace])
```

**Step 3 : Ajouter la fonction de sauvegarde des préférences**

```jsx
const savePreferences = async () => {
  setLoading(true)
  const { error } = await supabase
    .from('workspaces')
    .update({ workspace_settings: prefs })
    .eq('id', currentWorkspace.id)
  setLoading(false)
  if (error) toast.error('Erreur lors de la sauvegarde')
  else toast.success('Préférences enregistrées')
}
```

**Step 4 : Créer le contenu du tab Préférences**

```jsx
{activeTab === 'preferences' && (
  <div className="space-y-8">
    {/* Livraisons */}
    <section>
      <h3 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">Livraisons</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Tarif de livraison par défaut (€)</label>
          <input type="number" min="0" value={prefs.delivery_fee_default}
            onChange={e => setPrefs({...prefs, delivery_fee_default: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" placeholder="0" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Zone de livraison (km max)</label>
          <input type="number" min="0" value={prefs.delivery_zone_km}
            onChange={e => setPrefs({...prefs, delivery_zone_km: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" placeholder="50" />
        </div>
      </div>
    </section>

    {/* Paiements */}
    <section>
      <h3 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">Paiements</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Acompte par défaut (%)</label>
          <input type="number" min="0" max="100" value={prefs.deposit_percent_default}
            onChange={e => setPrefs({...prefs, deposit_percent_default: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Délai de paiement devis (jours)</label>
          <input type="number" min="1" value={prefs.payment_delay_days}
            onChange={e => setPrefs({...prefs, payment_delay_days: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        </div>
      </div>
    </section>

    {/* Numérotation */}
    <section>
      <h3 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">Numérotation</h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Préfixe commandes</label>
          <input value={prefs.prefix_orders}
            onChange={e => setPrefs({...prefs, prefix_orders: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Préfixe factures</label>
          <input value={prefs.prefix_invoices}
            onChange={e => setPrefs({...prefs, prefix_invoices: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Préfixe devis</label>
          <input value={prefs.prefix_quotes}
            onChange={e => setPrefs({...prefs, prefix_quotes: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono" />
        </div>
      </div>
    </section>

    {/* Stock & TVA */}
    <section>
      <h3 className="font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">Stock & TVA</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Seuil alerte stock faible</label>
          <input type="number" min="0" value={prefs.stock_alert_threshold}
            onChange={e => setPrefs({...prefs, stock_alert_threshold: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">TVA par défaut</label>
          <select value={prefs.vat_rate_default}
            onChange={e => setPrefs({...prefs, vat_rate_default: e.target.value})}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm">
            <option value="20">20%</option>
            <option value="10">10%</option>
            <option value="5.5">5,5%</option>
            <option value="0">0%</option>
          </select>
        </div>
      </div>
    </section>

    <button onClick={savePreferences} disabled={loading}
      className="px-6 py-2.5 bg-[#313ADF] text-white rounded-xl font-medium text-sm">
      Enregistrer les préférences
    </button>
  </div>
)}
```

**Step 5 : Commit**

```bash
git add src/pages/Settings.jsx
git commit -m "feat(settings): tab Préférences - livraisons, paiements, numérotation, stock/TVA"
```

---

## Task 8 : VenteRapide — Alertes stock + Remises par produit (#4, #5, #6)

**Fichiers :**
- Modifier : `src/pages/VenteRapide.jsx`

**Step 1 : Alerte à l'ajout si stock faible/nul**

Dans la fonction `ajouterAuPanier`, avant d'ajouter :
```jsx
const ajouterAuPanier = (product) => {
  const available = stockMap[product.id] ?? 0

  if (available === 0) {
    toast.error(`Rupture de stock — impossible d'ajouter "${product.name}"`, { duration: 4000 })
    return
  }
  if (available <= parseInt(workspace?.workspace_settings?.stock_alert_threshold || '3')) {
    toast(`⚠️ Stock faible : ${available} unité(s) restante(s) pour "${product.name}"`, {
      icon: '⚠️',
      style: { background: '#fef3c7', color: '#92400e' },
      duration: 3000,
    })
  }

  // ... reste de la logique existante ...
}
```

**Step 2 : Alerte à la finalisation si stock atteint 0**

Dans la fonction de soumission, après le débit stock :
```jsx
// Vérifier si des produits sont maintenant en rupture
for (const item of panier) {
  const newStock = (stockMap[item.product_id] ?? 0) - item.quantity
  if (newStock <= 0) {
    toast.error(`"${item.description}" est maintenant en rupture de stock`, {
      duration: 5000,
    })
  }
}
```

**Step 3 : Ajouter remise par ligne**

Dans l'état du panier, chaque item a déjà `discount_item` et `discount_item_type`. Activer dans l'UI.

Pour chaque ligne produit dans le panier, ajouter un champ remise :
```jsx
{/* Ligne produit dans le panier */}
<div className="flex items-center gap-2">
  {/* ... nom, quantité, prix ... */}

  {/* Remise par ligne */}
  <div className="flex items-center gap-1 ml-auto">
    <button
      onClick={() => toggleDiscountType(item.id)}
      className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono"
    >
      {item.discount_item_type === 'percent' ? '%' : '€'}
    </button>
    <input
      type="number"
      min="0"
      value={item.discount_item || ''}
      onChange={e => updateItemDiscount(item.id, parseFloat(e.target.value) || 0)}
      className="w-14 text-xs px-1.5 py-1 border border-gray-200 rounded-lg text-right"
      placeholder="0"
    />
  </div>
</div>
```

**Step 4 : Fonctions updateItemDiscount et toggleDiscountType**

```jsx
const toggleDiscountType = (itemId) => {
  setPanier(prev => prev.map(item =>
    item.id === itemId
      ? { ...item, discount_item_type: item.discount_item_type === 'percent' ? 'euro' : 'percent' }
      : item
  ))
}

const updateItemDiscount = (itemId, value) => {
  setPanier(prev => prev.map(item =>
    item.id === itemId ? { ...item, discount_item: value } : item
  ))
}
```

**Step 5 : Mettre à jour le calcul des totaux**

```jsx
const calculateLineTotalHT = (item) => {
  let price = item.unit_price_ht
  if (item.discount_item > 0) {
    if (item.discount_item_type === 'percent') {
      price = price * (1 - item.discount_item / 100)
    } else {
      price = Math.max(0, price - item.discount_item)
    }
  }
  return price * item.quantity
}

// Dans le calcul du subtotal_ht :
const subtotalHT = panier.reduce((sum, item) => sum + calculateLineTotalHT(item), 0)
```

**Step 6 : Inclure discount_item dans l'INSERT order_items**

```jsx
// Dans l'insertion des order_items :
{
  ...item,
  discount_item: item.discount_item || 0,
  discount_item_type: item.discount_item_type || 'percent',
  total_ht: calculateLineTotalHT(item),
}
```

**Step 7 : Tester**

1. VenteRapide : ajouter un produit avec stock = 0 → blocage toast rouge
2. Ajouter produit avec stock ≤ 3 → toast orange
3. Ajouter remise 10% sur une ligne → prix recalculé
4. Finaliser → vérifier console : pas d'erreur

**Step 8 : Commit**

```bash
git add src/pages/VenteRapide.jsx
git commit -m "feat(vente-rapide): alertes stock faible/rupture + remises par ligne produit"
```

---

## Task 9 : CreerCommande — Client pro/particulier + remises + livraison étendue (#5, #7, #18)

**Fichiers :**
- Modifier : `src/pages/CreerCommande.jsx`

**Step 1 : Ajouter toggle particulier/pro dans le formulaire client**

Après le bloc de recherche/sélection client :
```jsx
<div className="flex gap-2 mb-4">
  <button
    onClick={() => setClientType('particulier')}
    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
      clientType === 'particulier'
        ? 'bg-[#313ADF] text-white border-[#313ADF]'
        : 'border-gray-200 text-gray-600'
    }`}
  >
    Particulier
  </button>
  <button
    onClick={() => setClientType('pro')}
    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
      clientType === 'pro'
        ? 'bg-[#313ADF] text-white border-[#313ADF]'
        : 'border-gray-200 text-gray-600'
    }`}
  >
    Professionnel
  </button>
</div>

{clientType === 'pro' && (
  <div className="space-y-3 p-4 bg-blue-50 rounded-xl border border-blue-100 mb-4">
    <input required value={form.company_name}
      onChange={e => setForm({...form, company_name: e.target.value})}
      placeholder="Nom de l'entreprise *" className="..." />
    <input value={form.siret_client}
      onChange={e => setForm({...form, siret_client: e.target.value})}
      placeholder="SIRET (optionnel)" className="..." />
    <input value={form.contact_name}
      onChange={e => setForm({...form, contact_name: e.target.value})}
      placeholder="Interlocuteur" className="..." />
  </div>
)}
```

État : `const [clientType, setClientType] = useState('particulier')`

**Step 2 : Passer customer_type à l'INSERT customer**

```jsx
await supabase.from('customers').insert({
  ...clientData,
  customer_type: clientType,
})
```

**Step 3 : Activer les remises par ligne (même logique que Task 8)**

Réutiliser `toggleDiscountType`, `updateItemDiscount`, `calculateLineTotalHT`.

**Step 4 : Section livraison étendue**

Si `deliveryType === 'delivery'` :
```jsx
{deliveryType === 'delivery' && (
  <div className="space-y-4 p-4 bg-gray-50 rounded-xl">
    <h4 className="font-medium text-gray-700">Créneaux de livraison</h4>

    {timeSlots.map((slot, idx) => (
      <div key={idx} className="flex gap-2 items-center">
        <input type="date" value={slot.date}
          onChange={e => updateSlot(idx, 'date', e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        <span className="text-gray-400 text-sm">de</span>
        <input type="time" value={slot.start}
          onChange={e => updateSlot(idx, 'start', e.target.value)}
          className="w-24 px-2 py-2 border border-gray-200 rounded-xl text-sm" />
        <span className="text-gray-400 text-sm">à</span>
        <input type="time" value={slot.end}
          onChange={e => updateSlot(idx, 'end', e.target.value)}
          className="w-24 px-2 py-2 border border-gray-200 rounded-xl text-sm" />
        <button onClick={() => removeSlot(idx)} className="text-red-400 hover:text-red-600">×</button>
      </div>
    ))}

    <button onClick={addSlot}
      className="text-sm text-[#313ADF] font-medium flex items-center gap-1">
      + Ajouter un créneau
    </button>

    <div>
      <label className="text-sm font-medium text-gray-700">Tarif de livraison (€)</label>
      <input type="number" min="0" value={deliveryFees}
        onChange={e => setDeliveryFees(parseFloat(e.target.value) || 0)}
        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
        placeholder="0" />
    </div>
  </div>
)}

{deliveryType === 'pickup' && (
  <div className="p-4 bg-gray-50 rounded-xl">
    <label className="text-sm font-medium text-gray-700">Disponible à partir du</label>
    <input type="datetime-local" value={pickupFrom}
      onChange={e => setPickupFrom(e.target.value)}
      className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
  </div>
)}
```

États à ajouter :
```jsx
const [timeSlots, setTimeSlots] = useState([])
const [deliveryFees, setDeliveryFees] = useState(
  currentWorkspace?.workspace_settings?.delivery_fee_default || 0
)
const [pickupFrom, setPickupFrom] = useState('')

const addSlot = () => setTimeSlots(prev => [...prev, { date: '', start: '09:00', end: '12:00' }])
const removeSlot = (idx) => setTimeSlots(prev => prev.filter((_, i) => i !== idx))
const updateSlot = (idx, key, val) => setTimeSlots(prev =>
  prev.map((s, i) => i === idx ? { ...s, [key]: val } : s)
)
```

**Step 5 : Inclure créneaux dans l'INSERT order + livraison**

```jsx
// Dans l'INSERT order :
await supabase.from('orders').insert({
  ...orderData,
  delivery_fees: deliveryFees,
  pickup_available_from: pickupFrom || null,
})

// Créer la livraison avec créneaux si delivery :
if (deliveryType === 'delivery' && timeSlots.length > 0) {
  await supabase.from('deliveries').insert({
    workspace_id: currentWorkspace.id,
    order_id: newOrder.id,
    customer_id: customerId,
    delivery_type: 'delivery',
    status: 'a_planifier',
    time_slots: timeSlots,
    delivery_address: form.address,
    delivery_fees: deliveryFees,
  })
}
```

**Step 6 : Commit**

```bash
git add src/pages/CreerCommande.jsx
git commit -m "feat(commandes): type client pro/particulier, remises par ligne, créneaux livraison"
```

---

## Task 10 : CreerDevis — Client pro + acompte + remises (#5, #7, #8)

**Fichiers :**
- Modifier : `src/pages/CreerDevis.jsx`

**Step 1 : Toggle client pro/particulier (même logique Task 9)**

Copier exactement la logique de Task 9, Step 1-2.

**Step 2 : Section acompte**

Après la section "Validité", ajouter :
```jsx
<div className="p-4 bg-gray-50 rounded-xl">
  <label className="font-medium text-gray-700 text-sm">Acompte demandé</label>
  <div className="flex gap-2 mt-2">
    <div className="flex border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setDepositType('percent')}
        className={`px-3 py-2 text-sm font-medium transition-colors ${
          depositType === 'percent' ? 'bg-[#313ADF] text-white' : 'bg-white text-gray-600'
        }`}
      >%</button>
      <button
        onClick={() => setDepositType('euro')}
        className={`px-3 py-2 text-sm font-medium transition-colors ${
          depositType === 'euro' ? 'bg-[#313ADF] text-white' : 'bg-white text-gray-600'
        }`}
      >€</button>
    </div>
    <input
      type="number"
      min="0"
      value={depositValue}
      onChange={e => setDepositValue(parseFloat(e.target.value) || 0)}
      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
      placeholder="0"
    />
    {depositValue > 0 && depositType === 'percent' && (
      <div className="flex items-center px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-600">
        = {((totalTTC * depositValue) / 100).toFixed(2)} €
      </div>
    )}
  </div>
</div>
```

États :
```jsx
const [depositType, setDepositType] = useState('percent')
const [depositValue, setDepositValue] = useState(
  parseFloat(currentWorkspace?.workspace_settings?.deposit_percent_default || '30')
)
```

**Step 3 : Remises par ligne (même logique Task 8)**

Réutiliser exactement la même logique.

**Step 4 : Inclure deposit dans l'INSERT quote**

```jsx
await supabase.from('quotes').insert({
  ...quoteData,
  deposit_amount: depositType === 'percent'
    ? (totalTTC * depositValue) / 100
    : depositValue,
  deposit_type: depositType,
})
```

**Step 5 : Commit**

```bash
git add src/pages/CreerDevis.jsx
git commit -m "feat(devis): type client pro, champ acompte % ou €, remises par ligne"
```

---

## Task 11 : ApercuCommande — Modal paiement + statuts auto + créneaux + livraison auto (#9, #10, #11, #15)

**Fichiers :**
- Modifier : `src/pages/ApercuCommande.jsx`

**Step 1 : Redesigner la modal de paiement**

Remplacer la modal existante par :
```jsx
function PaymentModal({ order, onClose, onSuccess }) {
  const [paymentMode, setPaymentMode] = useState('total') // 'acompte' | 'partiel' | 'total'
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  // Pré-remplir le montant selon le mode
  useEffect(() => {
    if (paymentMode === 'acompte') {
      setAmount(order.deposit_amount > 0 ? order.deposit_amount.toFixed(2) : '')
    } else if (paymentMode === 'total') {
      setAmount(order.remaining_amount.toFixed(2))
    } else {
      setAmount('')
    }
  }, [paymentMode, order])

  const MODES = [
    {
      key: 'acompte',
      label: 'Acompte',
      desc: order.deposit_amount > 0
        ? `Montant fixé : ${order.deposit_amount.toFixed(2)} €`
        : 'Aucun acompte défini',
    },
    { key: 'partiel', label: 'Paiement partiel', desc: 'Saisie libre du montant' },
    {
      key: 'total',
      label: 'Paiement total',
      desc: `Reste à payer : ${order.remaining_amount.toFixed(2)} €`,
    },
  ]

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    setLoading(true)
    try {
      await onSuccess({
        payment_type: paymentMode === 'total' ? 'full' : paymentMode,
        payment_method: paymentMethod,
        amount: parseFloat(amount),
        notes,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Enregistrer un paiement</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="p-6 space-y-4">
          {/* Mode de paiement */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => setPaymentMode(m.key)}
                  disabled={m.key === 'acompte' && !order.deposit_amount}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    paymentMode === m.key
                      ? 'border-[#313ADF] bg-[#313ADF]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <p className="text-xs font-semibold text-gray-900">{m.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Montant */}
          <div>
            <label className="text-sm font-medium text-gray-700">Montant (€)</label>
            <input
              type="number"
              min="0"
              max={order.remaining_amount}
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={paymentMode !== 'partiel'}
              className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm disabled:bg-gray-50"
            />
          </div>

          {/* Méthode */}
          <div>
            <label className="text-sm font-medium text-gray-700">Méthode</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm">
              <option value="cash">Espèces</option>
              <option value="card">Carte bancaire</option>
              <option value="check">Chèque</option>
              <option value="transfer">Virement</option>
              <option value="other">Autre</option>
            </select>
          </div>

          {/* Notes */}
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optionnel)" rows={2}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none" />

          <button onClick={handleSubmit} disabled={loading || !amount}
            className="w-full py-3 bg-[#313ADF] text-white rounded-xl font-semibold text-sm disabled:opacity-50">
            {loading ? 'Enregistrement...' : 'Enregistrer le paiement'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2 : Après enregistrement paiement — transitions statut auto**

Dans la fonction qui appelle `createPayment`, après succès :
```jsx
const handlePaymentSuccess = async (paymentData) => {
  // 1. Enregistrer le paiement
  await createPayment({ ...paymentData, order_id: commande.id, workspace_id: currentWorkspace.id })

  // 2. Recharger la commande pour avoir les nouveaux montants
  const { data: updatedOrder } = await supabase
    .from('orders')
    .select('amount_paid, remaining_amount, deposit_amount, status, requires_delivery, customer_id')
    .eq('id', commande.id)
    .single()

  // 3. Transition statut auto
  let newStatus = updatedOrder.status
  if (updatedOrder.status === 'confirme') {
    const depositPaid = updatedOrder.deposit_amount > 0
      ? updatedOrder.amount_paid >= updatedOrder.deposit_amount
      : false
    const fullPaid = updatedOrder.remaining_amount <= 0

    if (depositPaid || fullPaid) {
      newStatus = 'en_preparation'
      await supabase
        .from('orders')
        .update({ status: 'en_preparation' })
        .eq('id', commande.id)
      toast.success('Commande passée en préparation automatiquement')
    }
  }

  // 4. Création livraison auto si nécessaire
  if (updatedOrder.requires_delivery) {
    const { data: existingDeliveries } = await supabase
      .from('deliveries')
      .select('id')
      .eq('order_id', commande.id)

    if (!existingDeliveries?.length) {
      const { data: customer } = await supabase
        .from('customers')
        .select('address')
        .eq('id', updatedOrder.customer_id)
        .single()

      await supabase.from('deliveries').insert({
        workspace_id: currentWorkspace.id,
        order_id: commande.id,
        customer_id: updatedOrder.customer_id,
        delivery_type: 'delivery',
        status: 'a_planifier',
        delivery_address: customer?.address || '',
        time_slots: [],
      })
      toast('Livraison créée automatiquement — planifiez les créneaux', { icon: '🚚' })
    }
  }

  // 5. Alerte rupture stock
  for (const item of commande.order_items || []) {
    const { data: stockData } = await supabase
      .from('stock_levels')
      .select('quantity, reserved_quantity')
      .eq('product_id', item.product_id)
      .eq('workspace_id', currentWorkspace.id)
    if (stockData?.[0]) {
      const avail = stockData[0].quantity - stockData[0].reserved_quantity
      if (avail <= 0) toast.error(`"${item.description}" est en rupture de stock`)
    }
  }

  setShowPaymentModal(false)
  loadCommande() // recharger
}
```

**Step 3 : Boutons de transition statut manuels**

```jsx
{/* Bouton "Passer en livraison" si en_preparation */}
{commande.status === 'en_preparation' && (
  <button
    onClick={async () => {
      await supabase.from('orders').update({ status: 'en_livraison' }).eq('id', commande.id)
      loadCommande()
    }}
    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"
  >
    🚚 Passer en livraison
  </button>
)}
```

**Step 4 : Affichage créneaux multiples dans la section livraisons**

Pour afficher les créneaux :
```jsx
// Dans la section livraisons :
{delivery.time_slots?.map((slot, i) => (
  <span key={i} className="text-sm text-gray-600">
    {i > 0 && <span className="text-gray-400 mx-1">ou</span>}
    {new Date(slot.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
    {' '}de {slot.start} à {slot.end}
  </span>
))}
```

**Step 5 : Section planification livraison avec créneaux**

Dans le modal de planification livraison, remplacer le champ `time_slot` par des créneaux multi-slot (même logique que Task 9).

**Step 6 : Commit**

```bash
git add src/pages/ApercuCommande.jsx
git commit -m "feat(commandes): modal paiement redessinée, statuts auto, livraison auto, créneaux"
```

---

## Task 12 : ApercuDevis — Supprimer email + PDF réel (#12)

**Fichiers :**
- Modifier : `src/pages/ApercuDevis.jsx`

**Step 1 : Supprimer le bouton "Envoyer par email"**

Chercher et supprimer le bouton `sendQuoteEmail` dans le JSX de `ApercuDevis.jsx`.

**Step 2 : Remplacer window.print() par appel Edge Function**

Trouver la fonction de téléchargement et remplacer par :
```jsx
const downloadPDF = async () => {
  setLoadingPdf(true)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: 'quote',
          id: devis.id,
          workspace_id: currentWorkspace.id,
        }),
      }
    )
    if (!res.ok) throw new Error('Erreur génération PDF')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `devis-${devis.quote_ref}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err) {
    toast.error('Erreur lors du téléchargement du PDF')
    console.error(err)
  } finally {
    setLoadingPdf(false)
  }
}
```

État : `const [loadingPdf, setLoadingPdf] = useState(false)`

**Step 3 : Mettre à jour le bouton**

```jsx
<button
  onClick={downloadPDF}
  disabled={loadingPdf}
  className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
>
  {loadingPdf ? 'Génération...' : '⬇ Télécharger PDF'}
</button>
```

**Step 4 : Vérifier**

1. Aller sur un aperçu devis
2. Vérifier : bouton "Envoyer par email" absent
3. Cliquer "Télécharger PDF" → fichier PDF téléchargé (pas impression navigateur)

**Step 5 : Commit**

```bash
git add src/pages/ApercuDevis.jsx
git commit -m "feat(devis): supprimer envoi email, téléchargement PDF réel via Edge Function"
```

---

## Task 13 : ListeClients — Vérification doublons (#14)

**Fichiers :**
- Modifier : `src/pages/ListeClients.jsx`

**Step 1 : Vérifier les doublons avant la création**

Dans la fonction de création/sauvegarde client, avant l'INSERT :
```jsx
const checkDuplicate = async (email, phone) => {
  const checks = []

  if (email) {
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name')
      .eq('workspace_id', currentWorkspace.id)
      .eq('email', email.trim().toLowerCase())
      .limit(1)
    if (data?.[0]) checks.push({ type: 'email', client: data[0] })
  }

  if (phone) {
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name')
      .eq('workspace_id', currentWorkspace.id)
      .eq('phone', phone.trim())
      .limit(1)
    if (data?.[0]) checks.push({ type: 'phone', client: data[0] })
  }

  return checks
}
```

**Step 2 : Afficher l'alerte et proposer un lien**

```jsx
const handleCreateClient = async () => {
  const duplicates = await checkDuplicate(form.email, form.phone)

  if (duplicates.length > 0) {
    const dup = duplicates[0]
    const name = `${dup.client.first_name} ${dup.client.last_name}`
    const type = dup.type === 'email' ? 'email' : 'numéro de téléphone'

    setDuplicateWarning({
      message: `Un client "${name}" existe déjà avec ce ${type}.`,
      clientId: dup.client.id,
      clientName: name,
    })
    return // Ne pas créer, mais laisser l'utilisateur décider
  }

  await doCreateClient()
}
```

**Step 3 : Afficher le warning dans le formulaire**

```jsx
{duplicateWarning && (
  <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm">
    <span>⚠️</span>
    <div>
      <p className="font-medium text-yellow-800">{duplicateWarning.message}</p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={() => navigate(`/clients/${duplicateWarning.clientId}`)}
          className="text-[#313ADF] font-medium underline"
        >
          Voir la fiche de {duplicateWarning.clientName}
        </button>
        <button
          onClick={async () => { setDuplicateWarning(null); await doCreateClient() }}
          className="text-yellow-700"
        >
          Créer quand même
        </button>
      </div>
    </div>
  </div>
)}
```

État : `const [duplicateWarning, setDuplicateWarning] = useState(null)`

**Step 4 : Commit**

```bash
git add src/pages/ListeClients.jsx
git commit -m "feat(clients): avertissement doublon email/téléphone à la création"
```

---

## Task 14 : Livraisons — Créneaux multiples + transitions statuts (#10, #11)

**Fichiers :**
- Modifier : `src/pages/Livraisons.jsx`

**Step 1 : Afficher les créneaux multiples (time_slots)**

Dans l'affichage d'une livraison, remplacer l'affichage de `time_slot` par `time_slots` :
```jsx
{delivery.time_slots?.length > 0 ? (
  <div className="space-y-0.5">
    {delivery.time_slots.map((slot, i) => (
      <p key={i} className="text-sm text-gray-600">
        {i > 0 && <span className="text-gray-400">ou </span>}
        {new Date(slot.date + 'T12:00').toLocaleDateString('fr-FR', {
          weekday: 'long', day: 'numeric', month: 'long'
        })} de {slot.start} à {slot.end}
      </p>
    ))}
  </div>
) : (
  <p className="text-sm text-gray-400 italic">Créneau non défini</p>
)}
```

**Step 2 : Modifier le modal de planification pour multi-créneaux**

Dans le modal "Planifier la livraison", remplacer le select `time_slot` par une UI multi-créneaux (même logique que Task 9 : addSlot, removeSlot, updateSlot).

```jsx
{/* Multi-créneaux */}
{planningSlots.map((slot, idx) => (
  <div key={idx} className="flex gap-2 items-center mb-2">
    <input type="date" value={slot.date}
      onChange={e => updatePlanningSlot(idx, 'date', e.target.value)}
      className="flex-1 px-2 py-2 border border-gray-200 rounded-xl text-sm" />
    <input type="time" value={slot.start}
      onChange={e => updatePlanningSlot(idx, 'start', e.target.value)}
      className="w-20 px-2 py-2 border border-gray-200 rounded-xl text-sm" />
    <span className="text-gray-400 text-xs">à</span>
    <input type="time" value={slot.end}
      onChange={e => updatePlanningSlot(idx, 'end', e.target.value)}
      className="w-20 px-2 py-2 border border-gray-200 rounded-xl text-sm" />
    {planningSlots.length > 1 && (
      <button onClick={() => removePlanningSlot(idx)} className="text-red-400 text-lg">×</button>
    )}
  </div>
))}
<button onClick={addPlanningSlot} className="text-sm text-[#313ADF] font-medium">
  + Ajouter un créneau
</button>
```

**Step 3 : Dans l'UPDATE livraison, enregistrer time_slots**

```jsx
await supabase.from('deliveries').update({
  time_slots: planningSlots.filter(s => s.date),
  status: 'planifiee',
  // ...autres champs
}).eq('id', selectedDelivery.id)
```

**Step 4 : Bouton "Confirmer livraison" → met la commande en termine**

Dans le handler de confirmation livraison :
```jsx
const confirmDelivery = async (deliveryId, orderId) => {
  await supabase.from('deliveries').update({
    status: 'livree',
    delivered_at: new Date().toISOString(),
  }).eq('id', deliveryId)

  // Mettre la commande en terminé
  if (orderId) {
    await supabase.from('orders').update({ status: 'termine' }).eq('id', orderId)
    toast.success('Livraison confirmée — commande terminée')
  }

  loadDeliveries()
}
```

**Step 5 : Commit**

```bash
git add src/pages/Livraisons.jsx
git commit -m "feat(livraisons): créneaux multiples, confirmation → commande terminée"
```

---

## Task 15 : FicheClient — Affichage type client pro (#7)

**Fichiers :**
- Modifier : `src/pages/FicheClient.jsx`

**Step 1 : Afficher le badge type client**

Dans l'en-tête de la fiche client :
```jsx
<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
  client.customer_type === 'pro'
    ? 'bg-blue-100 text-blue-800'
    : 'bg-gray-100 text-gray-600'
}`}>
  {client.customer_type === 'pro' ? '🏢 Professionnel' : '👤 Particulier'}
</span>
```

**Step 2 : Afficher company_name si pro**

```jsx
{client.customer_type === 'pro' && client.company_name && (
  <div className="text-sm text-gray-600">
    <span className="font-medium">Entreprise :</span> {client.company_name}
  </div>
)}
```

**Step 3 : Permettre l'édition du type client**

Dans le formulaire d'édition :
```jsx
<div className="flex gap-2">
  <button
    onClick={() => setEditForm({...editForm, customer_type: 'particulier'})}
    className={`flex-1 py-2 rounded-xl text-sm font-medium border ${
      editForm.customer_type === 'particulier' ? 'bg-[#313ADF] text-white border-[#313ADF]' : 'border-gray-200'
    }`}
  >Particulier</button>
  <button
    onClick={() => setEditForm({...editForm, customer_type: 'pro'})}
    className={`flex-1 py-2 rounded-xl text-sm font-medium border ${
      editForm.customer_type === 'pro' ? 'bg-[#313ADF] text-white border-[#313ADF]' : 'border-gray-200'
    }`}
  >Professionnel</button>
</div>
{editForm.customer_type === 'pro' && (
  <input value={editForm.company_name || ''}
    onChange={e => setEditForm({...editForm, company_name: e.target.value})}
    placeholder="Nom de l'entreprise"
    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
)}
```

**Step 4 : Commit**

```bash
git add src/pages/FicheClient.jsx
git commit -m "feat(clients): affichage et édition type client pro/particulier"
```

---

## Task 16 : Push final + vérification

**Step 1 : Vérifier l'ensemble**

Checklist rapide :
- [ ] SQL migrations exécutées en Supabase (v4_001 à v4_006)
- [ ] Bug #13 résolu (paiement après conversion devis)
- [ ] Neo IA s'ouvre en split pane, redimensionnable
- [ ] Survey post-signup en 3 questions
- [ ] Workspace création en 5 étapes
- [ ] Tutorial modal au premier login
- [ ] "Nouveau workspace" absent de la sidebar
- [ ] Tab Préférences dans Settings
- [ ] VenteRapide : alertes stock faible/rupture + remises par ligne
- [ ] CreerCommande : toggle pro/particulier + créneaux + tarif livraison
- [ ] CreerDevis : toggle pro/particulier + acompte % ou €
- [ ] ApercuCommande : modal paiement redessinée + statuts auto + livraison auto
- [ ] ApercuDevis : pas d'email, PDF réel
- [ ] ListeClients : avertissement doublon
- [ ] Livraisons : créneaux multiples + confirmation → terminé
- [ ] FicheClient : badge + édition type client

**Step 2 : Push**

```bash
git push origin main
```

---

## Notes d'implémentation

- **Tout toast** : utiliser `react-hot-toast` ou le `ToastContext` existant selon ce qui est déjà importé dans chaque page
- **currentWorkspace.workspace_settings** : lire via `useWorkspace()` qui expose déjà `currentWorkspace`
- **Les remises par ligne** : la logique `calculateLineTotalHT` doit être dupliquée dans VenteRapide, CreerCommande et CreerDevis (ou extraite dans un helper `src/lib/pricing.js`)
- **Migration v4_005** : si des utilisateurs existants ont `received_by` qui ne correspond pas à un `profiles.id`, la FK échouera. Vérifier d'abord avec : `SELECT received_by FROM payments WHERE received_by NOT IN (SELECT id FROM profiles)`
- **Edge Function generate-pdf** : doit supporter `type: 'quote'` en plus de `type: 'invoice'`. Vérifier le code de la fonction avant la Task 12.
