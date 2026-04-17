# Phase 2 — Contremarques & Livraisons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le flux contremarques (commandes fournisseur liées à des commandes clients) et les documents livraison (bon de livraison PDF, étiquettes), avec une vue "Prêt à livrer" dans les commandes.

**Architecture:** Nouvelle table `contremarques` + `contremarqueService.js`, sections contremarques dans ApercuCommande, page ListeContremarques, mise à jour de la RPC `is_order_ready_to_deliver` pour inclure la vérification des contremarques, et extension de la Edge Function `generate-pdf` avec deux nouveaux types : `delivery_note` et `label`.

**Tech Stack:** React 19, Vite, Supabase (PostgreSQL + RLS + Edge Functions Deno), Tailwind CSS v4, pdf-lib (déjà utilisé dans generate-pdf)

**Spec:** `docs/superpowers/specs/2026-04-14-neoflow-literie-adaptation-design.md` (Section 4 + Phase 2)

**Note importante — pas de framework de test :** Ce projet n'a pas de test runner configuré. Chaque tâche inclut une étape de vérification manuelle via le navigateur ou le SQL Editor Supabase. Lancer le dev server avec `npm run dev` avant de commencer.

---

## Contexte Codebase — ce qui existe déjà

- `deliveries` table + `Livraisons.jsx` (Kanban livraisons) ✅ déjà complet
- `LivraisonLivreur.jsx` (vue mobile livreur) ✅ déjà complet
- SAV system (`sav_tickets`, `savService.js`, `ListeSAV.jsx`, `ApercuSAV.jsx`) ✅ déjà complet
- `is_order_ready_to_deliver(order_id UUID) RETURNS BOOLEAN` RPC ✅ existe mais ne vérifie que les acomptes (Phase 1) — Phase 2 ajoute la vérification des contremarques
- `order_payments` table + `orderPaymentService.js` ✅ Phase 1
- `product_variants` table + `variantService.js` ✅ Phase 1
- Bon de commande PDF (`document_type: 'order'`) ✅ Phase 1
- `suppliers` table ✅ existe avec FK utilisable pour contremarques
- `order_items` table avec `variant_id` ✅ Phase 1

**Important — schéma deliveries :** La table `deliveries` (et non `delivery_routes`) est le système existant pour la planification des livraisons. Il utilise un kanban avec statuts : `a_planifier`, `planifiee`, `en_cours`, `livree`. Ne pas créer de table `delivery_routes` — utiliser `deliveries`.

**Routes et navigation :** Toutes les pages sont en React Router v7, lazy-loadées dans `src/App.jsx`. Ajouter les nouvelles routes dans ce fichier. La sidebar est dans `src/components/Sidebar.jsx`.

---

## Fichiers — Vue d'ensemble

### Créer
- `sql/v4_003_contremarques.sql` — table contremarques + RLS + update RPC
- `src/services/contremarqueService.js` — CRUD contremarques
- `src/pages/ListeContremarques.jsx` — vue "Contremarques en attente" groupées par fournisseur

### Modifier
- `src/pages/ApercuCommande.jsx` — section contremarques + bouton bon de livraison + bouton étiquette
- `src/pages/ListeCommandes.jsx` — onglet/filtre "Prêt à livrer"
- `src/components/Sidebar.jsx` — lien "Contremarques" dans section Livraisons
- `src/App.jsx` — route `/contremarques`
- `supabase/functions/generate-pdf/index.ts` — types `delivery_note` et `label`

---

## Task 1 : Migration DB — Table contremarques

**Fichiers :**
- Créer : `sql/v4_003_contremarques.sql`

- [ ] **Étape 1 : Créer le fichier SQL**

```sql
-- ============================================================
-- NeoFlow BOS V4 - Migration 003: Contremarques
-- Exécuter dans : Supabase SQL Editor
-- ============================================================

-- 1. Table contremarques
CREATE TABLE IF NOT EXISTS contremarques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'en_attente'
    CHECK (status IN ('en_attente', 'commandee', 'recue', 'allouee', 'livree')),
  expected_date DATE,
  received_date DATE,
  notes VARCHAR(500),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS contremarques
ALTER TABLE contremarques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contremarques_select" ON contremarques;
CREATE POLICY "contremarques_select" ON contremarques FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "contremarques_insert" ON contremarques;
CREATE POLICY "contremarques_insert" ON contremarques FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager', 'vendeur')
  ));

DROP POLICY IF EXISTS "contremarques_update" ON contremarques;
CREATE POLICY "contremarques_update" ON contremarques FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager', 'vendeur')
  ));

DROP POLICY IF EXISTS "contremarques_delete" ON contremarques;
CREATE POLICY "contremarques_delete" ON contremarques FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_contremarques_order_id ON contremarques(order_id);
CREATE INDEX IF NOT EXISTS idx_contremarques_workspace_id ON contremarques(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contremarques_status ON contremarques(status);
CREATE INDEX IF NOT EXISTS idx_contremarques_supplier_id ON contremarques(supplier_id);

-- 4. Mise à jour RPC is_order_ready_to_deliver
-- NOTE: Cette fonction existe déjà (créée en Phase 1). CREATE OR REPLACE la met à jour.
-- Règle : au moins un acompte ET toutes les contremarques en statut recue/allouee/livree
-- (absence de contremarques = OK)
CREATE OR REPLACE FUNCTION is_order_ready_to_deliver(order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    -- Au moins un acompte encaissé
    EXISTS (
      SELECT 1 FROM order_payments
      WHERE order_payments.order_id = is_order_ready_to_deliver.order_id
        AND payment_type = 'acompte'
    )
    AND
    -- Aucune contremarque bloquante (en_attente ou commandee)
    NOT EXISTS (
      SELECT 1 FROM contremarques
      WHERE contremarques.order_id = is_order_ready_to_deliver.order_id
        AND status IN ('en_attente', 'commandee')
    )
  );
END;
$$;

-- 5. RPC batch : retourne les IDs de commandes prêtes à livrer pour un workspace
-- Utilisée par listOrdersReadyToDeliver() côté frontend (1 seul appel DB au lieu de N)
CREATE OR REPLACE FUNCTION list_orders_ready_to_deliver(p_workspace_id UUID)
RETURNS TABLE(order_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id
  FROM orders o
  WHERE o.workspace_id = p_workspace_id
    AND o.status NOT IN ('termine', 'annule', 'livre')
    AND EXISTS (
      SELECT 1 FROM order_payments op
      WHERE op.order_id = o.id AND op.payment_type = 'acompte'
    )
    AND NOT EXISTS (
      SELECT 1 FROM contremarques c
      WHERE c.order_id = o.id AND c.status IN ('en_attente', 'commandee')
    );
END;
$$;
```

- [ ] **Étape 2 : Appliquer via Supabase MCP**

Utiliser l'outil `mcp__plugin_supabase_supabase__apply_migration` avec :
- `name`: `v4_003_contremarques`
- `query`: le contenu SQL ci-dessus

Vérification attendue : `{"success": true}`

- [ ] **Étape 3 : Vérifier la migration**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'contremarques';
```

Résultat attendu : 1 ligne avec `contremarques`.

- [ ] **Étape 4 : Commit**

```bash
git add sql/v4_003_contremarques.sql
git commit -m "feat(db): table contremarques + RLS + update is_order_ready_to_deliver RPC"
```

---

## Task 2 : Service contremarqueService.js

**Fichiers :**
- Créer : `src/services/contremarqueService.js`

- [ ] **Étape 1 : Implémenter le service**

```javascript
import { supabase } from '../lib/supabase'

const CONTREMARQUE_SELECT = `
  id, status, expected_date, received_date, notes, created_at, updated_at,
  order_id, order_item_id, supplier_id,
  supplier:suppliers(id, name),
  order_item:order_items(
    id, description, quantity,
    product:products(id, name, reference),
    variant:product_variants(id, size, comfort)
  )
`

/**
 * Liste les contremarques d'une commande
 */
export async function listContremarquesByOrder(orderId) {
  const { data, error } = await supabase
    .from('contremarques')
    .select(CONTREMARQUE_SELECT)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Liste les contremarques d'un workspace (filtrées par statut optionnel)
 * Inclut les infos commande + client pour la vue globale
 */
export async function listContremarques(workspaceId, { status } = {}) {
  let query = supabase
    .from('contremarques')
    .select(`
      ${CONTREMARQUE_SELECT},
      order:orders(
        id, order_number, status,
        customer:customers(id, first_name, last_name, phone)
      )
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Crée une contremarque liée à un order_item
 */
export async function createContremarque(workspaceId, userId, {
  orderId,
  orderItemId,
  supplierId,
  expectedDate,
  notes,
}) {
  const { data, error } = await supabase
    .from('contremarques')
    .insert({
      workspace_id: workspaceId,
      order_id: orderId,
      order_item_id: orderItemId || null,
      supplier_id: supplierId || null,
      expected_date: expectedDate || null,
      notes: notes || null,
      created_by: userId,
      status: 'en_attente',
    })
    .select(CONTREMARQUE_SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * Met à jour le statut d'une contremarque
 * Passe automatiquement received_date si statut = 'recue'
 */
export async function updateContremarqueStatus(contremarqueId, newStatus, receivedDate = null) {
  const updates = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (newStatus === 'recue') {
    updates.received_date = receivedDate || new Date().toISOString().split('T')[0]
  }

  const { error } = await supabase
    .from('contremarques')
    .update(updates)
    .eq('id', contremarqueId)

  if (error) throw error
}

/**
 * Met à jour les champs d'une contremarque (fournisseur, date, notes)
 */
export async function updateContremarque(contremarqueId, updates) {
  const { error } = await supabase
    .from('contremarques')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', contremarqueId)

  if (error) throw error
}

/**
 * Supprime une contremarque (seulement si en_attente)
 */
export async function deleteContremarque(contremarqueId) {
  const { error } = await supabase
    .from('contremarques')
    .delete()
    .eq('id', contremarqueId)

  if (error) throw error
}

/**
 * Vérifie si une commande est prête à livrer (appelle la RPC Supabase)
 */
export async function checkOrderReadyToDeliver(orderId) {
  const { data, error } = await supabase.rpc('is_order_ready_to_deliver', {
    order_id: orderId,
  })
  if (error) throw error
  return !!data
}
```

- [ ] **Étape 2 : Vérifier qu'il n'y a pas d'erreurs de syntaxe**

Ouvrir le fichier dans l'éditeur, vérifier visuellement.

- [ ] **Étape 3 : Commit**

```bash
git add src/services/contremarqueService.js
git commit -m "feat(service): contremarqueService CRUD + checkOrderReadyToDeliver"
```

---

## Task 3 : Section contremarques dans ApercuCommande

**Fichiers :**
- Modifier : `src/pages/ApercuCommande.jsx`

**Contexte :** ApercuCommande.jsx affiche les détails d'une commande. Il faut ajouter une section "Contremarques" après les lignes de commande, avec la liste des contremarques existantes et un formulaire de création. Lire le fichier entier avant de modifier.

- [ ] **Étape 1 : Lire le fichier complet**

Lire `src/pages/ApercuCommande.jsx` entier pour comprendre la structure JSX et les imports existants.

- [ ] **Étape 2 : Ajouter les imports**

Ajouter en haut du fichier, après les imports existants :

```javascript
import { listContremarquesByOrder, createContremarque, updateContremarqueStatus, deleteContremarque } from '../services/contremarqueService'
import { listSuppliers } from '../services/supplierService'
```

- [ ] **Étape 3 : Ajouter les états**

Dans la fonction composant, après les états existants :

```javascript
const [contremarques, setContremarques] = useState([])
const [showAddContremarque, setShowAddContremarque] = useState(false)
const [contremarqueForm, setContremarqueForm] = useState({
  orderItemId: '',
  supplierId: '',
  expectedDate: '',
  notes: '',
})
const [contremarqueLoading, setContremarqueLoading] = useState(false)
const [suppliers, setSuppliers] = useState([])
```

- [ ] **Étape 4 : Charger les contremarques dans loadOrder**

Dans `loadOrder()`, après `setOrder(data)` :

```javascript
const [cmqs, suppList] = await Promise.all([
  listContremarquesByOrder(commandeId),
  suppliers.length === 0 ? listSuppliers(workspace.id) : Promise.resolve(suppliers),
])
setContremarques(cmqs)
if (suppList.length > 0) setSuppliers(suppList)
```

- [ ] **Étape 5 : Implémenter handleAddContremarque**

```javascript
const handleAddContremarque = async () => {
  if (!contremarqueForm.orderItemId) {
    toast.error('Sélectionnez une ligne de commande')
    return
  }
  setContremarqueLoading(true)
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await createContremarque(workspace.id, user.id, {
      orderId: commandeId,
      orderItemId: contremarqueForm.orderItemId,
      supplierId: contremarqueForm.supplierId || null,
      expectedDate: contremarqueForm.expectedDate || null,
      notes: contremarqueForm.notes || null,
    })
    toast.success('Contremarque créée')
    setShowAddContremarque(false)
    setContremarqueForm({ orderItemId: '', supplierId: '', expectedDate: '', notes: '' })
    loadOrder()
  } catch (err) {
    toast.error(err.message || 'Erreur création contremarque')
  } finally {
    setContremarqueLoading(false)
  }
}

const handleContremarqueStatus = async (contremarqueId, newStatus) => {
  try {
    await updateContremarqueStatus(contremarqueId, newStatus)
    toast.success('Statut mis à jour')
    loadOrder()
  } catch (err) {
    toast.error(err.message || 'Erreur mise à jour')
  }
}

const handleDeleteContremarque = async (contremarqueId) => {
  try {
    await deleteContremarque(contremarqueId)
    toast.success('Contremarque supprimée')
    loadOrder()
  } catch (err) {
    toast.error(err.message || 'Erreur suppression')
  }
}
```

- [ ] **Étape 6 : Ajouter la section JSX contremarques**

Trouver dans le JSX la section qui affiche les lignes de commande (order.items). Insérer la section suivante APRÈS cette section et AVANT la section paiements :

Les constantes de statut et leur couleur :

```javascript
const CONTREMARQUE_STATUS = {
  en_attente:  { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'En attente' },
  commandee:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Commandée' },
  recue:       { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Reçue' },
  allouee:     { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Allouée' },
  livree:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Livrée' },
}

const CONTREMARQUE_TRANSITIONS = {
  en_attente: ['commandee'],
  commandee:  ['recue'],
  recue:      ['allouee'],
  allouee:    ['livree'],
  livree:     [],
}
```

La section JSX — à placer dans le corps de la page, après les lignes de commande :

```jsx
{/* ── Section Contremarques ── */}
<div className="bg-white rounded-2xl border border-gray-200 p-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="font-semibold text-gray-900">
      Contremarques
      {contremarques.length > 0 && (
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({contremarques.length})
        </span>
      )}
    </h3>
    {['proprietaire', 'manager', 'vendeur'].includes(role) && (
      <button
        onClick={() => setShowAddContremarque(v => !v)}
        className="text-sm text-[#313ADF] hover:underline font-medium"
      >
        + Ajouter
      </button>
    )}
  </div>

  {/* Formulaire ajout */}
  {showAddContremarque && (
    <div className="mb-4 p-4 bg-gray-50 rounded-xl space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Ligne de commande *</label>
        <select
          value={contremarqueForm.orderItemId}
          onChange={e => setContremarqueForm(f => ({ ...f, orderItemId: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Sélectionner une ligne</option>
          {(order?.items || []).map(item => (
            <option key={item.id} value={item.id}>
              {item.description || item.product?.name || 'Article'}
              {item.variant ? ` — ${item.variant.size}${item.variant.comfort ? ' ' + item.variant.comfort : ''}` : ''}
              {` (×${item.quantity})`}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Fournisseur</label>
          <select
            value={contremarqueForm.supplierId}
            onChange={e => setContremarqueForm(f => ({ ...f, supplierId: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Aucun</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Date livraison prévue</label>
          <input
            type="date"
            value={contremarqueForm.expectedDate}
            onChange={e => setContremarqueForm(f => ({ ...f, expectedDate: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
        <input
          type="text"
          value={contremarqueForm.notes}
          onChange={e => setContremarqueForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Référence fournisseur, observations..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleAddContremarque}
          disabled={contremarqueLoading}
          className="flex-1 bg-[#313ADF] text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
        >
          {contremarqueLoading ? 'Création...' : 'Créer la contremarque'}
        </button>
        <button
          onClick={() => setShowAddContremarque(false)}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Annuler
        </button>
      </div>
    </div>
  )}

  {/* Liste des contremarques */}
  {contremarques.length === 0 ? (
    <p className="text-sm text-gray-400 italic">Aucune contremarque</p>
  ) : (
    <div className="space-y-3">
      {contremarques.map(cm => {
        const st = CONTREMARQUE_STATUS[cm.status] || CONTREMARQUE_STATUS.en_attente
        const nextStatuses = CONTREMARQUE_TRANSITIONS[cm.status] || []
        return (
          <div key={cm.id} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                  {st.label}
                </span>
                {cm.supplier?.name && (
                  <span className="text-xs text-gray-500">{cm.supplier.name}</span>
                )}
              </div>
              <p className="text-sm text-gray-700 truncate">
                {cm.order_item?.product?.name || 'Article'}
                {cm.order_item?.variant?.size ? ` — ${cm.order_item.variant.size}` : ''}
                {cm.order_item?.variant?.comfort ? ` ${cm.order_item.variant.comfort}` : ''}
              </p>
              {cm.expected_date && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Prévu : {new Date(cm.expected_date).toLocaleDateString('fr-FR')}
                </p>
              )}
              {cm.received_date && (
                <p className="text-xs text-green-600 mt-0.5">
                  Reçu le : {new Date(cm.received_date).toLocaleDateString('fr-FR')}
                </p>
              )}
              {cm.notes && (
                <p className="text-xs text-gray-500 mt-0.5 italic">{cm.notes}</p>
              )}
            </div>
            <div className="flex flex-col gap-1 items-end flex-shrink-0">
              {nextStatuses.map(ns => {
                const nextSt = CONTREMARQUE_STATUS[ns]
                return (
                  <button
                    key={ns}
                    onClick={() => handleContremarqueStatus(cm.id, ns)}
                    className="text-xs text-[#313ADF] hover:underline whitespace-nowrap"
                  >
                    → {nextSt?.label}
                  </button>
                )
              })}
              {cm.status === 'en_attente' && ['proprietaire', 'manager'].includes(role) && (
                <button
                  onClick={() => handleDeleteContremarque(cm.id)}
                  className="text-xs text-red-400 hover:text-red-600 mt-1"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )}
</div>
```

- [ ] **Étape 7 : Vérification manuelle**

Lancer `npm run dev`, ouvrir une commande, vérifier :
- La section "Contremarques" est visible
- Cliquer "+ Ajouter" ouvre le formulaire
- Sélectionner une ligne de commande → créer → contremarque apparaît
- Cliquer "→ Commandée" change le statut

- [ ] **Étape 8 : Commit**

```bash
git add src/pages/ApercuCommande.jsx
git commit -m "feat(commande): section contremarques dans ApercuCommande"
```

---

## Task 4 : Page ListeContremarques.jsx

**Fichiers :**
- Créer : `src/pages/ListeContremarques.jsx`
- Modifier : `src/App.jsx` — ajouter la route `/contremarques`
- Modifier : `src/components/Sidebar.jsx` — ajouter le lien

**Contexte :** Vue globale des contremarques du workspace, groupées par fournisseur, avec filtre par statut. Seuls propriétaire/manager/vendeur y ont accès.

- [ ] **Étape 1 : Créer ListeContremarques.jsx**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listContremarques, updateContremarqueStatus } from '../services/contremarqueService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const STATUS_FILTERS = [
  { value: '', label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'commandee', label: 'Commandées' },
  { value: 'recue', label: 'Reçues' },
  { value: 'allouee', label: 'Allouées' },
  { value: 'livree', label: 'Livrées' },
]

const STATUS_BADGES = {
  en_attente:  { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'En attente' },
  commandee:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Commandée' },
  recue:       { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Reçue' },
  allouee:     { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Allouée' },
  livree:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Livrée' },
}

const TRANSITIONS = {
  en_attente: ['commandee'],
  commandee:  ['recue'],
  recue:      ['allouee'],
  allouee:    ['livree'],
  livree:     [],
}

export default function ListeContremarques() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [contremarques, setContremarques] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('en_attente')
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    if (workspace?.id) load()
  }, [workspace?.id, statusFilter])

  const load = async () => {
    setLoading(true)
    try {
      const data = await listContremarques(workspace.id, {
        status: statusFilter || undefined,
      })
      setContremarques(data)
    } catch (err) {
      toast.error('Erreur chargement contremarques')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (contremarqueId, newStatus) => {
    setUpdatingId(contremarqueId)
    try {
      await updateContremarqueStatus(contremarqueId, newStatus)
      toast.success('Statut mis à jour')
      load()
    } catch (err) {
      toast.error(err.message || 'Erreur mise à jour')
    } finally {
      setUpdatingId(null)
    }
  }

  // Grouper par fournisseur
  const grouped = contremarques.reduce((acc, cm) => {
    const key = cm.supplier?.name || 'Sans fournisseur'
    if (!acc[key]) acc[key] = []
    acc[key].push(cm)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#040741]">Contremarques</h1>
          <p className="text-sm text-gray-500 mt-1">
            Commandes fournisseurs en attente de réception
          </p>
        </div>
      </div>

      {/* Filtres statut */}
      <div className="flex gap-2 flex-wrap mb-6">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-[#313ADF] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#313ADF] border-t-transparent" />
        </div>
      ) : contremarques.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">Aucune contremarque</p>
          <p className="text-sm mt-1">
            Créez des contremarques depuis l'aperçu d'une commande
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([supplierName, items]) => (
            <div key={supplierName} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {/* En-tête groupe fournisseur */}
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">{supplierName}</h2>
                <span className="text-sm text-gray-500">{items.length} contremarque{items.length > 1 ? 's' : ''}</span>
              </div>

              {/* Lignes */}
              <div className="divide-y divide-gray-100">
                {items.map(cm => {
                  const st = STATUS_BADGES[cm.status]
                  const nextStatuses = TRANSITIONS[cm.status] || []
                  const customer = cm.order?.customer
                  const customerName = customer
                    ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
                    : '—'

                  return (
                    <div key={cm.id} className="px-6 py-4 flex items-center gap-4">
                      {/* Statut badge */}
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${st?.bg} ${st?.text}`}>
                        {st?.label}
                      </span>

                      {/* Infos produit */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {cm.order_item?.product?.name || 'Article'}
                          {cm.order_item?.variant?.size
                            ? ` — ${cm.order_item.variant.size}${cm.order_item.variant.comfort ? ' ' + cm.order_item.variant.comfort : ''}`
                            : ''}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {/* Lien commande */}
                          <button
                            onClick={() => navigate(`/commandes/${cm.order_id}`)}
                            className="text-xs text-[#313ADF] hover:underline"
                          >
                            {cm.order?.order_number || 'Commande'}
                          </button>
                          <span className="text-xs text-gray-400">{customerName}</span>
                          {cm.expected_date && (
                            <span className="text-xs text-gray-400">
                              Prévu : {new Date(cm.expected_date).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                        {cm.notes && (
                          <p className="text-xs text-gray-400 italic mt-0.5">{cm.notes}</p>
                        )}
                      </div>

                      {/* Actions transition */}
                      <div className="flex gap-2 flex-shrink-0">
                        {nextStatuses.map(ns => (
                          <button
                            key={ns}
                            onClick={() => handleStatusChange(cm.id, ns)}
                            disabled={updatingId === cm.id}
                            className="px-3 py-1.5 text-xs font-medium bg-[#313ADF] text-white rounded-lg hover:bg-[#2730c0] disabled:opacity-50 transition-colors"
                          >
                            {updatingId === cm.id ? '...' : `→ ${STATUS_BADGES[ns]?.label}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Étape 2 : Ajouter la route dans App.jsx**

Lire `src/App.jsx` d'abord. Trouver les autres imports lazy et ajouter après les imports SAV :

```javascript
const ListeContremarques = lazy(() => import('./pages/ListeContremarques'))
```

Dans le JSX des routes, trouver la section avec les routes SAV (ListeSAV) et ajouter après :

```jsx
<Route path="/contremarques" element={
  <ProtectedRoute>
    <RoleGuard allowedRoles={SALES_ROLES}>
      <Layout><ListeContremarques /></Layout>
    </RoleGuard>
  </ProtectedRoute>
} />
```

- [ ] **Étape 3 : Ajouter le lien dans Sidebar**

Lire `src/components/Sidebar.jsx`. Trouver la NavItem pour `/livraisons` dans la sidebar desktop. Ajouter après elle :

```jsx
<NavItem
  to="/contremarques"
  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7l2 2 4-4" /></svg>}
  label="Contremarques"
/>
```

Dans la config mobile `boutiqueSheet` (dans `getMobileNavConfig`), ajouter après livraisons :

```javascript
{ to: '/contremarques', label: 'Contremarques', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7l2 2 4-4" /></svg> },
```

- [ ] **Étape 4 : Vérification manuelle**

Naviguer vers `/contremarques`, vérifier :
- Le filtre "En attente" est actif par défaut
- Les contremarques créées en Task 3 apparaissent
- Cliquer sur "→ Commandée" fonctionne
- Cliquer sur le numéro de commande navigue vers `/commandes/{id}`

- [ ] **Étape 5 : Commit**

```bash
git add src/pages/ListeContremarques.jsx src/App.jsx src/components/Sidebar.jsx
git commit -m "feat: page ListeContremarques + route + sidebar link"
```

---

## Task 5 : Vue "Prêt à livrer" dans ListeCommandes

**Fichiers :**
- Modifier : `src/pages/ListeCommandes.jsx`

**Contexte :** Ajouter un onglet/filtre "Prêt à livrer" qui appelle `checkOrderReadyToDeliver` sur chaque commande. Pour éviter N+1 requêtes, la vue charge toutes les commandes confirmées/en_preparation et filtre côté client en appelant le service en batch. Alternative plus simple : appeler la RPC directement via un SELECT avec la fonction dans Supabase.

**Approche choisie :** Ajouter un filtre spécial `pret_a_livrer` qui charge les commandes avec `status IN ('confirme','en_preparation','en_attente_stock')` et affiche un badge vert "✓ Prêt" sur chaque ligne après avoir vérifié la RPC. Pour éviter N+1, utiliser une query directe qui joint les conditions via un appel RPC batch côté service.

- [ ] **Étape 1 : Ajouter une fonction dans orderService.js**

Lire `src/services/orderService.js`. Trouver la fonction `listOrders`. Ajouter à la fin du fichier :

```javascript
/**
 * Retourne les commandes prêtes à livrer dans un workspace.
 * Utilise la RPC batch list_orders_ready_to_deliver pour éviter les N+1 requêtes
 * (1 seul appel DB au lieu d'un appel par commande).
 */
export async function listOrdersReadyToDeliver(workspaceId) {
  // 1. Récupérer les IDs via RPC batch (1 seule requête DB)
  const { data: readyIds, error: rpcError } = await supabase
    .rpc('list_orders_ready_to_deliver', { p_workspace_id: workspaceId })

  if (rpcError) throw rpcError
  if (!readyIds || readyIds.length === 0) return []

  const ids = readyIds.map((r) => r.order_id)

  // 2. Charger les détails de ces commandes
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, total_ttc, status, created_at, customer:customers(first_name, last_name)')
    .in('id', ids)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}
```

- [ ] **Étape 2 : Modifier ListeCommandes.jsx**

Lire `src/pages/ListeCommandes.jsx` en entier. Ajouter l'import :

```javascript
import { listOrders, updateOrderStatus, listOrdersReadyToDeliver } from '../services/orderService'
```

Ajouter `'pret_a_livrer'` dans `STATUS_FILTERS` comme option spéciale :

```javascript
const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'pret_a_livrer', label: '✓ Prêt à livrer', special: true },
  { value: 'confirme', label: 'Confirmé' },
  // ... reste inchangé
]
```

Modifier `loadOrders()` pour gérer ce filtre spécial :

```javascript
const loadOrders = async () => {
  setLoading(true)
  try {
    let data
    if (statusFilter === 'pret_a_livrer') {
      data = await listOrdersReadyToDeliver(workspace.id)
    } else {
      const filters = {}
      if (statusFilter) filters.status = statusFilter
      data = await listOrders(workspace.id, filters)
    }
    setOrders(data)
  } catch (err) {
    console.error('Erreur chargement commandes:', err)
    toast.error('Erreur lors du chargement des commandes')
  } finally {
    setLoading(false)
  }
}
```

Dans le JSX, pour les boutons de filtre, appliquer un style différent pour le filtre spécial :

```jsx
{STATUS_FILTERS.map(f => (
  <button
    key={f.value}
    onClick={() => setStatusFilter(f.value)}
    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
      statusFilter === f.value
        ? f.special ? 'bg-green-600 text-white' : 'bg-[#313ADF] text-white'
        : f.special ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`}
  >
    {f.label}
  </button>
))}
```

- [ ] **Étape 3 : Vérification manuelle**

Cliquer sur l'onglet "✓ Prêt à livrer" dans `/commandes` :
- Si aucune commande n'a d'acompte et pas de contremarques bloquantes → liste vide
- Créer un acompte sur une commande → elle apparaît dans cet onglet

- [ ] **Étape 4 : Commit**

```bash
git add src/pages/ListeCommandes.jsx src/services/orderService.js
git commit -m "feat(commandes): filtre Prêt à livrer via RPC is_order_ready_to_deliver"
```

---

## Task 6 : Bon de livraison PDF (generate-pdf)

**Fichiers :**
- Modifier : `supabase/functions/generate-pdf/index.ts`
- Modifier : `src/pages/ApercuCommande.jsx` — bouton "Bon de livraison"

**Contexte :** Ajouter `document_type: 'delivery_note'` à la Edge Function existante. Le bon de livraison contient : logo/info workspace, client, articles livrés, solde à encaisser, option reprise ancien matelas, ligne de signature livreur. Il reprend les données de la commande + la livraison associée (from `deliveries` table).

Lire `supabase/functions/generate-pdf/index.ts` entier avant de modifier.

- [ ] **Étape 1 : Lire la Edge Function**

Lire `supabase/functions/generate-pdf/index.ts` en entier.

- [ ] **Étape 2 : Ajouter le bloc delivery_note avant le bloc invoice**

Trouver dans le code le bloc `if (document_type === 'order')`. Ajouter APRÈS ce bloc (avant le bloc `if (document_type === 'invoice')`), le bloc suivant :

```typescript
if (document_type === 'delivery_note') {
  // ── Charger la commande avec ses détails ─────────────────────────────
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id, order_number, status, created_at,
      total_ttc, amount_paid, remaining_amount,
      old_furniture_option, delivered_at,
      wished_delivery_date, max_delivery_date,
      customer:customers(first_name, last_name, phone, address, city, postal_code),
      items:order_items(
        id, description, quantity, unit_price_ht, tax_rate, total_ht,
        eco_participation,
        product:products(id, name, reference),
        variant:product_variants(id, size, comfort)
      ),
      order_payments(id, payment_type, mode, amount),
      workspace:workspaces(
        name, address, city, postal_code, phone, email, siret, ape_code, legal_capital,
        logo_url
      )
    `)
    .eq('id', document_id)
    .single()

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404, headers: corsHeaders })
  }

  // ── Charger la dernière livraison associée ────────────────────────────
  const { data: delivery } = await supabase
    .from('deliveries')
    .select('id, scheduled_date, time_slot, assigned_to, delivery_address, notes')
    .eq('order_id', document_id)
    .not('status', 'eq', 'annulee')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // ── Calculs paiements ─────────────────────────────────────────────────
  const payments = order.order_payments || []
  const totalAcompte = payments
    .filter((p: any) => p.payment_type === 'acompte')
    .reduce((s: number, p: any) => s + Number(p.amount), 0)
  const soldeRestant = Math.max(0, Number(order.total_ttc || 0) - totalAcompte)

  // ── Couleurs ──────────────────────────────────────────────────────────
  const NAVY = rgb(4/255, 7/255, 65/255)
  const BLUE = rgb(49/255, 58/255, 223/255)
  const LIGHT = rgb(245/255, 246/255, 255/255)

  const pdfDoc = await PDFDocument.create()
  const font      = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage([595.28, 841.89])
  const { width, height } = page.getSize()
  let y = height

  const ws = order.workspace as any
  const customer = order.customer as any
  const customerName = customer ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim() : ''

  // ── Barre bleue top ───────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: BLUE })
  y = height - 8

  // ── Logo / Nom workspace ──────────────────────────────────────────────
  page.drawText(ws?.name || 'Magasin', {
    x: 40, y: y - 28,
    size: 14, font: fontBold, color: NAVY
  })
  const wsInfoLines = [
    ws?.address, [ws?.postal_code, ws?.city].filter(Boolean).join(' '),
    ws?.phone, ws?.email,
  ].filter(Boolean)
  wsInfoLines.forEach((line, i) => {
    page.drawText(line, { x: 40, y: y - 44 - i * 12, size: 8, font, color: rgb(0.4, 0.4, 0.4) })
  })
  y = y - 44 - wsInfoLines.length * 12 - 8

  // ── Bandeau titre BON DE LIVRAISON ───────────────────────────────────
  page.drawRectangle({ x: 0, y: y - 34, width, height: 34, color: NAVY })
  page.drawText('BON DE LIVRAISON', {
    x: 40, y: y - 23, size: 14, font: fontBold, color: rgb(1, 1, 1)
  })
  const dateStr = delivery?.scheduled_date
    ? new Date(delivery.scheduled_date).toLocaleDateString('fr-FR')
    : new Date(order.created_at).toLocaleDateString('fr-FR')
  page.drawText(`N° ${order.order_number}  |  Date : ${dateStr}`, {
    x: width - 240, y: y - 23, size: 9, font, color: rgb(0.8, 0.8, 0.8)
  })
  y -= 50

  // ── Bloc Client + Créneau ─────────────────────────────────────────────
  page.drawRectangle({ x: 40, y: y - 80, width: 250, height: 80, color: LIGHT })
  page.drawText('CLIENT', { x: 50, y: y - 14, size: 8, font: fontBold, color: BLUE })
  page.drawText(customerName, { x: 50, y: y - 28, size: 10, font: fontBold, color: NAVY })
  const addr = delivery?.delivery_address || [customer?.address, customer?.postal_code, customer?.city].filter(Boolean).join(', ')
  if (addr) {
    const words = addr.split(' ')
    let line = ''
    let lineY = y - 42
    words.forEach(w => {
      const test = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(test, 8) > 230) {
        page.drawText(line, { x: 50, y: lineY, size: 8, font, color: NAVY })
        lineY -= 11
        line = w
      } else { line = test }
    })
    if (line) page.drawText(line, { x: 50, y: lineY, size: 8, font, color: NAVY })
  }
  if (customer?.phone) {
    page.drawText(`Tél : ${customer.phone}`, { x: 50, y: y - 72, size: 8, font, color: rgb(0.4,0.4,0.4) })
  }

  // Créneau livraison (colonne droite)
  if (delivery?.time_slot || delivery?.scheduled_date) {
    page.drawRectangle({ x: 310, y: y - 80, width: 245, height: 80, color: LIGHT })
    page.drawText('CRÉNEAU DE LIVRAISON', { x: 320, y: y - 14, size: 8, font: fontBold, color: BLUE })
    if (delivery.scheduled_date) {
      page.drawText(new Date(delivery.scheduled_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        { x: 320, y: y - 28, size: 9, font: fontBold, color: NAVY })
    }
    if (delivery.time_slot) {
      page.drawText(delivery.time_slot, { x: 320, y: y - 42, size: 12, font: fontBold, color: BLUE })
    }
  }
  y -= 96

  // ── Tableau articles ──────────────────────────────────────────────────
  const items = (order.items || []) as any[]
  page.drawRectangle({ x: 40, y: y - 18, width: width - 80, height: 18, color: NAVY })
  const headers = ['Désignation', 'Qté', 'P.U. TTC', 'Total TTC']
  const colX = [50, 360, 420, 500]
  headers.forEach((h, i) => {
    page.drawText(h, { x: colX[i], y: y - 13, size: 8, font: fontBold, color: rgb(1,1,1) })
  })
  y -= 18

  items.forEach((item: any) => {
    if (y < 120) {
      // Page suivante si nécessaire (simplifié)
      return
    }
    const itemHeight = 22
    const ttcUnit = Number(item.unit_price_ht || 0) * (1 + Number(item.tax_rate || 20) / 100)
    const ttcTotal = ttcUnit * Number(item.quantity || 1)

    const label = item.description || item.product?.name || 'Article'
    const variantSuffix = item.variant
      ? ` — ${item.variant.size}${item.variant.comfort ? ' ' + item.variant.comfort : ''}`
      : ''

    page.drawText(label + variantSuffix, { x: colX[0], y: y - 14, size: 9, font: fontBold, color: NAVY, maxWidth: 290 })
    page.drawText(String(item.quantity || 1), { x: colX[1], y: y - 14, size: 9, font, color: NAVY })
    page.drawText(`${ttcUnit.toFixed(2)} €`, { x: colX[2], y: y - 14, size: 9, font, color: NAVY })
    page.drawText(`${ttcTotal.toFixed(2)} €`, { x: colX[3], y: y - 14, size: 9, font: fontBold, color: NAVY })

    if (Number(item.eco_participation) > 0) {
      page.drawText(
        `  Éco-participation DEA : ${Number(item.eco_participation).toFixed(2)} €`,
        { x: colX[0], y: y - 25, size: 7, font, color: rgb(0.5,0.5,0.5) }
      )
      y -= 11
    }

    y -= itemHeight
    page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.9,0.9,0.9) })
  })

  y -= 16

  // ── Total + Solde à encaisser ─────────────────────────────────────────
  const totalTTC = Number(order.total_ttc || 0)
  page.drawRectangle({ x: width - 230, y: y - 60, width: 190, height: 60, color: LIGHT })
  page.drawText('Total TTC', { x: width - 220, y: y - 14, size: 9, font, color: NAVY })
  page.drawText(`${totalTTC.toFixed(2)} €`, { x: width - 60, y: y - 14, size: 9, font: fontBold, color: NAVY })
  if (totalAcompte > 0) {
    page.drawText('Acompte versé', { x: width - 220, y: y - 28, size: 9, font, color: rgb(0.4,0.4,0.4) })
    page.drawText(`- ${totalAcompte.toFixed(2)} €`, { x: width - 70, y: y - 28, size: 9, font, color: rgb(0.4,0.4,0.4) })
  }
  page.drawLine({ start: { x: width - 225, y: y - 35 }, end: { x: width - 50, y: y - 35 }, thickness: 1, color: BLUE })
  page.drawText('SOLDE À ENCAISSER', { x: width - 220, y: y - 50, size: 9, font: fontBold, color: BLUE })
  page.drawText(`${soldeRestant.toFixed(2)} €`, { x: width - 75, y: y - 50, size: 12, font: fontBold, color: BLUE })

  y -= 80

  // ── Reprise ancien matelas ────────────────────────────────────────────
  const OLD_FURNITURE_LABELS: Record<string, string> = {
    keep: 'Client conserve ses anciens meubles',
    ess: 'Don ESS (association)',
    dechetterie: 'Déchetterie / point de collecte',
    reprise: 'Reprise gratuite par le magasin',
  }
  if (order.old_furniture_option) {
    page.drawRectangle({ x: 40, y: y - 28, width: width - 80, height: 28, color: LIGHT })
    page.drawText('REPRISE ANCIENS MEUBLES :', {
      x: 50, y: y - 18, size: 9, font: fontBold, color: NAVY
    })
    page.drawText(OLD_FURNITURE_LABELS[order.old_furniture_option] || order.old_furniture_option, {
      x: 215, y: y - 18, size: 9, font, color: NAVY
    })
    y -= 42
  }

  // ── Zone signature livreur ────────────────────────────────────────────
  y -= 20
  page.drawLine({ start: { x: 40, y }, end: { x: 280, y }, thickness: 0.5, color: rgb(0.6,0.6,0.6) })
  page.drawLine({ start: { x: 310, y }, end: { x: width - 40, y }, thickness: 0.5, color: rgb(0.6,0.6,0.6) })
  page.drawText('Signature livreur', { x: 40, y: y - 12, size: 8, font, color: rgb(0.5,0.5,0.5) })
  page.drawText('Signature client (bon pour accord)', { x: 310, y: y - 12, size: 8, font, color: rgb(0.5,0.5,0.5) })

  // ── Footer légal ──────────────────────────────────────────────────────
  const footerParts = [ws?.siret ? `SIRET : ${ws.siret}` : '', ws?.ape_code ? `APE : ${ws.ape_code}` : '', ws?.legal_capital ? `Capital : ${ws.legal_capital}` : ''].filter(Boolean)
  page.drawRectangle({ x: 0, y: 0, width, height: 24, color: NAVY })
  page.drawText(footerParts.join('   ·   '), {
    x: 40, y: 8, size: 7, font, color: rgb(0.7, 0.7, 0.8)
  })

  const pdfBytes = await pdfDoc.save()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)))
  const pdfUrl = `data:application/pdf;base64,${base64}`

  return new Response(JSON.stringify({ pdf_url: pdfUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
```

- [ ] **Étape 3 : Ajouter le bouton dans ApercuCommande.jsx**

Dans la section Actions de l'ApercuCommande, après le bouton "Bon de commande", ajouter :

```jsx
{/* Bouton Bon de livraison */}
<button
  onClick={handlePrintBonLivraison}
  disabled={bonLivraisonLoading}
  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium"
>
  {bonLivraisonLoading ? (
    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  )}
  Bon de livraison
</button>
```

Ajouter l'état et le handler dans le composant :

```javascript
const [bonLivraisonLoading, setBonLivraisonLoading] = useState(false)

const handlePrintBonLivraison = async () => {
  try {
    setBonLivraisonLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Non authentifié')

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ document_type: 'delivery_note', document_id: order.id }),
      }
    )
    const data = await response.json()
    if (!response.ok || data.error) throw new Error(data.error || 'Erreur génération PDF')
    window.open(data.pdf_url, '_blank')
  } catch (err) {
    toast.error(err.message || 'Erreur lors de la génération du bon de livraison')
  } finally {
    setBonLivraisonLoading(false)
  }
}
```

- [ ] **Étape 4 : Déployer la Edge Function via Supabase MCP**

Utiliser `mcp__plugin_supabase_supabase__deploy_edge_function` avec :
- `name`: `generate-pdf`
- `files`: lire le fichier `supabase/functions/generate-pdf/index.ts` (entier) et passer son contenu

- [ ] **Étape 5 : Vérification manuelle**

Ouvrir une commande qui a une livraison associée (ou sans), cliquer "Bon de livraison" :
- Un PDF s'ouvre avec les articles, le solde à encaisser, la zone de signature
- La reprise matelas est indiquée si old_furniture_option est renseigné

- [ ] **Étape 6 : Commit**

```bash
git add supabase/functions/generate-pdf/index.ts src/pages/ApercuCommande.jsx
git commit -m "feat(pdf): bon de livraison PDF + bouton ApercuCommande"
```

---

## Task 7 : Étiquettes produits PDF

**Fichiers :**
- Modifier : `supabase/functions/generate-pdf/index.ts`
- Modifier : `src/pages/ApercuCommande.jsx` — bouton "Étiquettes"

**Contexte :** Générer une page A4 avec des étiquettes (format 4 par page, 2 colonnes × 2 rangées) pour les articles d'une commande. Chaque étiquette contient : référence produit, désignation, taille/confort si variante, nom client, numéro de commande. Simple et imprimable directement.

- [ ] **Étape 1 : Ajouter le bloc `label` dans generate-pdf**

Dans `supabase/functions/generate-pdf/index.ts`, après le bloc `delivery_note`, avant le bloc `invoice`, ajouter :

```typescript
if (document_type === 'label') {
  // Charger la commande
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id, order_number,
      customer:customers(first_name, last_name),
      items:order_items(
        id, description, quantity,
        product:products(id, name, reference),
        variant:product_variants(id, size, comfort)
      )
    `)
    .eq('id', document_id)
    .single()

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404, headers: corsHeaders })
  }

  const NAVY = rgb(4/255, 7/255, 65/255)
  const BLUE = rgb(49/255, 58/255, 223/255)

  const pdfDoc = await PDFDocument.create()
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const customer = order.customer as any
  const customerName = customer
    ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
    : ''
  const orderNumber = (order as any).order_number || ''

  // Dédupliquer les articles (1 étiquette par article × quantité, max 1 étiquette/ligne)
  const items = ((order as any).items || []) as any[]

  // Générer les étiquettes : 4 par page (2 cols × 2 rows)
  const LABEL_W = 250
  const LABEL_H = 160
  const COL_POSITIONS = [40, 310]
  const ROW_POSITIONS = [690, 510, 330, 150]

  let page = pdfDoc.addPage([595.28, 841.89])
  let labelIndex = 0

  const drawLabel = (p: any, x: number, y: number, item: any) => {
    // Bordure
    p.drawRectangle({ x, y, width: LABEL_W, height: LABEL_H, borderColor: BLUE, borderWidth: 1.5, color: rgb(1,1,1) })
    // Bandeau header
    p.drawRectangle({ x, y: y + LABEL_H - 24, width: LABEL_W, height: 24, color: NAVY })
    p.drawText('NEOFLOW BOS', { x: x + 8, y: y + LABEL_H - 17, size: 8, font: fontBold, color: rgb(1,1,1) })
    p.drawText(orderNumber, { x: x + LABEL_W - 70, y: y + LABEL_H - 17, size: 8, font: fontBold, color: rgb(0.8,0.8,1) })

    // Référence produit
    const ref = item.product?.reference || ''
    if (ref) {
      p.drawText(ref, { x: x + 8, y: y + LABEL_H - 38, size: 9, font, color: rgb(0.5,0.5,0.5) })
    }

    // Désignation
    const name = item.description || item.product?.name || 'Article'
    p.drawText(name, { x: x + 8, y: y + LABEL_H - 54, size: 11, font: fontBold, color: NAVY, maxWidth: LABEL_W - 16 })

    // Variante
    if (item.variant) {
      const variantLabel = [item.variant.size, item.variant.comfort].filter(Boolean).join(' — ')
      p.drawText(variantLabel, { x: x + 8, y: y + LABEL_H - 72, size: 12, font: fontBold, color: BLUE })
    }

    // Séparateur
    p.drawLine({ start: { x: x + 8, y: y + 48 }, end: { x: x + LABEL_W - 8, y: y + 48 }, thickness: 0.5, color: rgb(0.8,0.8,0.8) })

    // Client
    p.drawText('CLIENT', { x: x + 8, y: y + 36, size: 7, font: fontBold, color: rgb(0.5,0.5,0.5) })
    p.drawText(customerName, { x: x + 8, y: y + 22, size: 10, font: fontBold, color: NAVY, maxWidth: LABEL_W - 16 })

    // Quantité
    p.drawText(`QTÉ : ${item.quantity || 1}`, { x: x + LABEL_W - 55, y: y + 10, size: 9, font: fontBold, color: BLUE })
  }

  for (const item of items) {
    const colIdx = labelIndex % 2
    const rowIdx = Math.floor(labelIndex / 2) % 4
    const x = COL_POSITIONS[colIdx]
    const y = ROW_POSITIONS[rowIdx]

    if (labelIndex > 0 && colIdx === 0 && rowIdx === 0) {
      page = pdfDoc.addPage([595.28, 841.89])
    }

    drawLabel(page, x, y, item)
    labelIndex++
  }

  const pdfBytes = await pdfDoc.save()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)))
  const pdfUrl = `data:application/pdf;base64,${base64}`

  return new Response(JSON.stringify({ pdf_url: pdfUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
```

- [ ] **Étape 2 : Ajouter le bouton dans ApercuCommande.jsx**

Ajouter dans la section Actions, après le bouton "Bon de livraison" :

```jsx
{/* Bouton Étiquettes */}
<button
  onClick={handlePrintEtiquettes}
  disabled={etiquettesLoading}
  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm font-medium"
>
  {etiquettesLoading ? (
    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
    </svg>
  )}
  Étiquettes produits
</button>
```

Ajouter état et handler :

```javascript
const [etiquettesLoading, setEtiquettesLoading] = useState(false)

const handlePrintEtiquettes = async () => {
  try {
    setEtiquettesLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Non authentifié')

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ document_type: 'label', document_id: order.id }),
      }
    )
    const data = await response.json()
    if (!response.ok || data.error) throw new Error(data.error || 'Erreur génération PDF')
    window.open(data.pdf_url, '_blank')
  } catch (err) {
    toast.error(err.message || 'Erreur lors de la génération des étiquettes')
  } finally {
    setEtiquettesLoading(false)
  }
}
```

- [ ] **Étape 3 : Déployer la Edge Function via Supabase MCP**

Utiliser `mcp__plugin_supabase_supabase__deploy_edge_function` avec :
- `name`: `generate-pdf`
- `files`: lire `supabase/functions/generate-pdf/index.ts` entier et passer son contenu

- [ ] **Étape 4 : Vérification manuelle**

Cliquer "Étiquettes produits" dans ApercuCommande :
- PDF s'ouvre avec une grille 2×2 d'étiquettes
- Chaque étiquette montre la référence, désignation, variante, nom client, numéro de commande

- [ ] **Étape 5 : Commit + Push**

```bash
git add supabase/functions/generate-pdf/index.ts src/pages/ApercuCommande.jsx
git commit -m "feat(pdf): étiquettes produits + bon de livraison déployés"
git push
```

---

## Checklist finale

Avant de marquer Phase 2 comme terminée, vérifier :

- [ ] `contremarques` table existe en DB (via Supabase MCP ou SQL Editor)
- [ ] `is_order_ready_to_deliver` RPC vérifie contremarques ET acomptes
- [ ] Section contremarques visible dans ApercuCommande
- [ ] Page `/contremarques` accessible depuis la sidebar
- [ ] Filtre "Prêt à livrer" fonctionne dans ListeCommandes
- [ ] Bouton "Bon de livraison" génère un PDF avec solde + signature
- [ ] Bouton "Étiquettes produits" génère une planche d'étiquettes
- [ ] Tout committé et pushé sur `main`
