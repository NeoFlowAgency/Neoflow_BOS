# Phase 1 — Fondations Literie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapter NeoFlow BOS pour générer un bon de commande conforme au format réel d'un magasin de literie (variantes produits, éco-participation, acompte multi-mode, reprise ancien matelas, consentement RGPD, dates de livraison, PDF imprimable).

**Architecture:** Ajout de 2 nouvelles tables DB (`product_variants`, `order_payments`) et extension de 4 tables existantes (`products`, `orders`, `order_items`, `workspaces`). Nouveaux services JS pour les variantes et paiements. Extension de la Edge Function `generate-pdf` avec un nouveau type `order`. Aucune page nouvelle — modifications des pages existantes uniquement.

**Tech Stack:** React 19, Vite, Supabase (PostgreSQL + RLS + Edge Functions Deno), Tailwind CSS v4, pdf-lib (déjà utilisé dans generate-pdf)

**Spec:** `docs/superpowers/specs/2026-04-14-neoflow-literie-adaptation-design.md`

**Note importante — pas de framework de test :** Ce projet n'a pas de test runner configuré. Chaque tâche inclut une étape de vérification manuelle via le navigateur ou le SQL Editor Supabase. Lancer le dev server avec `npm run dev` avant de commencer.

---

## Contexte Codebase — ce qui existe déjà

- `customers.phone` ✅ existe déjà (pas de migration nécessaire)
- `workspaces.siret` ✅ existe déjà (ajouter seulement `ape_code` et `legal_capital`)
- `products` a déjà les catégories literie : matelas, sommier, literie, etc.
- `generate-pdf` supporte `invoice` et `quote` — ajouter `order`
- `payments` table existe (liée aux commandes) — on crée `order_payments` en complément pour le workflow acompte/solde literie
- Status `orders` existants : brouillon, confirme, en_preparation, en_livraison, livre, termine, annule

---

## Fichiers — Vue d'ensemble

### Créer
- `sql/v4_001_product_variants.sql`
- `sql/v4_002_orders_literie_fields.sql`
- `src/services/variantService.js`
- `src/services/orderPaymentService.js`

### Modifier
- `src/pages/Produits.jsx` — section variantes dans la modal produit
- `src/pages/CreerCommande.jsx` — variantes + éco-participation + acompte multi-mode + reprise + RGPD + dates livraison
- `src/pages/VenteRapide.jsx` — sélection variante à la vente rapide
- `src/pages/Settings.jsx` — champs ape_code + legal_capital dans onglet Workspace
- `src/pages/ApercuCommande.jsx` — bouton "Imprimer bon de commande"
- `src/services/orderService.js` — `createOrder` accepte les nouveaux champs
- `supabase/functions/generate-pdf/index.ts` — nouveau type `order`

---

## Task 1 : Migration DB — Variantes produits

**Fichiers :**
- Créer : `sql/v4_001_product_variants.sql`

- [ ] **Étape 1 : Créer le fichier de migration**

```sql
-- ============================================================
-- NeoFlow BOS V4 - Migration 001: Variantes produits
-- Exécuter dans : Supabase SQL Editor
-- ============================================================

-- 1. Colonnes literie sur products
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS eco_participation_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_years INT DEFAULT 0;

-- 2. Table product_variants
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(20) NOT NULL,             -- ex: "160x200"
  comfort VARCHAR(30),                   -- ex: "medium", "ferme", "souple"
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  purchase_price DECIMAL(10,2) DEFAULT 0,
  sku_supplier VARCHAR(100),
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS product_variants
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_variants_select" ON product_variants FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "product_variants_insert" ON product_variants FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager', 'vendeur')
  ));

CREATE POLICY "product_variants_update" ON product_variants FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "product_variants_delete" ON product_variants FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

-- 4. Extension stock_levels pour variantes
ALTER TABLE stock_levels ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE;

-- 5. Extension order_items pour variantes + éco-participation
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS eco_participation DECIMAL(10,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS eco_participation_tva_rate DECIMAL(5,2) DEFAULT 20;

-- 6. Index utiles
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_workspace_id ON product_variants(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_variant_id ON stock_levels(variant_id);
```

- [ ] **Étape 2 : Exécuter dans Supabase SQL Editor**

Ouvrir le SQL Editor Supabase → coller et exécuter le contenu du fichier.
Résultat attendu : "Success. No rows returned" sans erreur.

- [ ] **Étape 3 : Vérifier les tables**

Exécuter dans SQL Editor :
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'product_variants';
SELECT column_name FROM information_schema.columns WHERE table_name = 'products' WHERE column_name IN ('has_variants','eco_participation_amount','warranty_years');
SELECT column_name FROM information_schema.columns WHERE table_name = 'order_items' WHERE column_name IN ('variant_id','eco_participation');
```
Résultat attendu : toutes les colonnes apparaissent.

- [ ] **Étape 4 : Commit**

```bash
git add sql/v4_001_product_variants.sql
git commit -m "feat(db): add product_variants table and literie columns"
```

---

## Task 2 : Migration DB — Champs literie orders + order_payments + workspace

**Fichiers :**
- Créer : `sql/v4_002_orders_literie_fields.sql`

- [ ] **Étape 1 : Créer le fichier de migration**

```sql
-- ============================================================
-- NeoFlow BOS V4 - Migration 002: Champs literie orders + order_payments
-- Exécuter dans : Supabase SQL Editor
-- ============================================================

-- 1. Nouveaux champs sur orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wished_delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS max_delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS old_furniture_option VARCHAR(20) DEFAULT 'keep'
  CHECK (old_furniture_option IN ('keep', 'ess', 'dechetterie', 'reprise'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sms_partner_consent BOOLEAN DEFAULT FALSE;

-- 2. Table order_payments (acomptes / soldes multi-mode)
CREATE TABLE IF NOT EXISTS order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_type VARCHAR(20) NOT NULL DEFAULT 'acompte'
    CHECK (payment_type IN ('acompte', 'solde', 'avoir')),
  mode VARCHAR(20) NOT NULL DEFAULT 'cb'
    CHECK (mode IN ('cash', 'cb', 'virement', 'cheque', 'financement', 'avoir')),
  amount DECIMAL(10,2) NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  notes VARCHAR(255),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS order_payments
ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_payments_select" ON order_payments FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "order_payments_insert" ON order_payments FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager', 'vendeur')
  ));

CREATE POLICY "order_payments_update" ON order_payments FOR UPDATE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

CREATE POLICY "order_payments_delete" ON order_payments FOR DELETE
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
      AND role IN ('proprietaire', 'manager')
  ));

-- 4. Infos légales workspace
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ape_code VARCHAR(10);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS legal_capital VARCHAR(50);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_workspace_id ON order_payments(workspace_id);

-- 6. RPC is_order_ready_to_deliver
-- Retourne true si toutes les contremarques de la commande sont reçues/allouées
-- ET qu'au moins un acompte a été encaissé
-- NOTE: les contremarques seront ajoutées en Phase 2 — pour l'instant la fonction
-- retourne true si au moins un acompte order_payments existe
CREATE OR REPLACE FUNCTION is_order_ready_to_deliver(order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM order_payments
    WHERE order_payments.order_id = is_order_ready_to_deliver.order_id
      AND payment_type = 'acompte'
  );
END;
$$;
```

- [ ] **Étape 2 : Exécuter dans Supabase SQL Editor**

Résultat attendu : "Success. No rows returned" sans erreur.

- [ ] **Étape 3 : Vérifier**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'
AND column_name IN ('wished_delivery_date','old_furniture_option','sms_consent','delivered_at');
SELECT column_name FROM information_schema.columns WHERE table_name = 'workspaces'
AND column_name IN ('ape_code','legal_capital');
SELECT routine_name FROM information_schema.routines WHERE routine_name = 'is_order_ready_to_deliver';
```

- [ ] **Étape 4 : Commit**

```bash
git add sql/v4_002_orders_literie_fields.sql
git commit -m "feat(db): add order_payments table and literie fields on orders/workspaces"
```

---

## Task 3 : variantService.js

**Fichiers :**
- Créer : `src/services/variantService.js`

- [ ] **Étape 1 : Créer le service**

```js
import { supabase } from '../lib/supabase'

/**
 * Liste les variantes d'un produit
 */
export async function listVariants(productId) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*')
    .eq('product_id', productId)
    .eq('is_archived', false)
    .order('size')
    .order('comfort')
  if (error) throw new Error('Erreur chargement variantes: ' + error.message)
  return data || []
}

/**
 * Liste les variantes d'un workspace entier (pour la vente rapide)
 */
export async function listVariantsByWorkspace(workspaceId) {
  const { data, error } = await supabase
    .from('product_variants')
    .select('*, product:products(name, reference, category)')
    .eq('workspace_id', workspaceId)
    .eq('is_archived', false)
    .order('size')
  if (error) throw new Error('Erreur chargement variantes: ' + error.message)
  return data || []
}

/**
 * Crée une variante
 */
export async function createVariant(workspaceId, productId, variantData) {
  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      workspace_id: workspaceId,
      product_id: productId,
      size: variantData.size,
      comfort: variantData.comfort || null,
      price: variantData.price || 0,
      purchase_price: variantData.purchase_price || 0,
      sku_supplier: variantData.sku_supplier || null,
    })
    .select()
    .single()
  if (error) throw new Error('Erreur création variante: ' + error.message)
  return data
}

/**
 * Met à jour une variante
 */
export async function updateVariant(variantId, updates) {
  const { data, error } = await supabase
    .from('product_variants')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', variantId)
    .select()
    .single()
  if (error) throw new Error('Erreur mise à jour variante: ' + error.message)
  return data
}

/**
 * Archive une variante (soft delete)
 */
export async function archiveVariant(variantId) {
  const { error } = await supabase
    .from('product_variants')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', variantId)
  if (error) throw new Error('Erreur suppression variante: ' + error.message)
}
```

- [ ] **Étape 2 : Vérifier l'import dans le navigateur**

Ouvrir la console du navigateur (dev server). Pas d'erreur d'import = OK.

- [ ] **Étape 3 : Commit**

```bash
git add src/services/variantService.js
git commit -m "feat(services): add variantService for product variants CRUD"
```

---

## Task 4 : orderPaymentService.js

**Fichiers :**
- Créer : `src/services/orderPaymentService.js`

- [ ] **Étape 1 : Créer le service**

```js
import { supabase } from '../lib/supabase'

/**
 * Ajoute un paiement (acompte ou solde) sur une commande
 */
export async function addOrderPayment(workspaceId, orderId, userId, paymentData) {
  const { data, error } = await supabase
    .from('order_payments')
    .insert({
      workspace_id: workspaceId,
      order_id: orderId,
      payment_type: paymentData.payment_type || 'acompte', // 'acompte' | 'solde' | 'avoir'
      mode: paymentData.mode || 'cb',    // 'cash'|'cb'|'virement'|'cheque'|'financement'|'avoir'
      amount: paymentData.amount,
      paid_at: paymentData.paid_at || new Date().toISOString(),
      notes: paymentData.notes || null,
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw new Error('Erreur enregistrement paiement: ' + error.message)
  return data
}

/**
 * Liste les paiements d'une commande
 */
export async function listOrderPayments(orderId) {
  const { data, error } = await supabase
    .from('order_payments')
    .select('*')
    .eq('order_id', orderId)
    .order('paid_at')
  if (error) throw new Error('Erreur chargement paiements: ' + error.message)
  return data || []
}

/**
 * Calcule le total encaissé et le solde restant d'une commande
 * @returns { totalPaid, totalAcompte, totalSolde, remaining }
 */
export function computePaymentSummary(payments, orderTotal) {
  const totalAcompte = payments
    .filter(p => p.payment_type === 'acompte')
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const totalSolde = payments
    .filter(p => p.payment_type === 'solde')
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const totalPaid = totalAcompte + totalSolde
  const remaining = Math.max(0, Number(orderTotal) - totalPaid)
  return { totalPaid, totalAcompte, totalSolde, remaining }
}

/**
 * Vérifie si une commande est prête à livrer (côté client, pour affichage)
 * La vraie vérification se fait via RPC Supabase côté serveur.
 */
export async function checkOrderReadyToDeliver(orderId) {
  const { data, error } = await supabase.rpc('is_order_ready_to_deliver', { order_id: orderId })
  if (error) throw new Error('Erreur vérification livraison: ' + error.message)
  return data === true
}

/**
 * Supprime un paiement
 */
export async function deleteOrderPayment(paymentId) {
  const { error } = await supabase
    .from('order_payments')
    .delete()
    .eq('id', paymentId)
  if (error) throw new Error('Erreur suppression paiement: ' + error.message)
}
```

- [ ] **Étape 2 : Commit**

```bash
git add src/services/orderPaymentService.js
git commit -m "feat(services): add orderPaymentService for multi-mode acompte/solde"
```

---

## Task 5 : orderService.js — Mise à jour createOrder

**Fichiers :**
- Modifier : `src/services/orderService.js`

- [ ] **Étape 1 : Mettre à jour la fonction `createOrder`**

Dans `createOrder`, ajouter les nouveaux champs literie dans l'objet `insert` :

```js
// Dans le bloc .insert({...}) de createOrder, ajouter après `notes`:
wished_delivery_date: orderData.wished_delivery_date || null,
max_delivery_date: orderData.max_delivery_date || null,
old_furniture_option: orderData.old_furniture_option || 'keep',
sms_consent: orderData.sms_consent || false,
sms_partner_consent: orderData.sms_partner_consent || false,
```

- [ ] **Étape 2 : Mettre à jour `itemsToInsert`**

Dans la construction de `itemsToInsert`, ajouter :

```js
variant_id: item.variant_id || null,
eco_participation: item.eco_participation || 0,
eco_participation_tva_rate: item.eco_participation_tva_rate || item.tax_rate || 20,
```

- [ ] **Étape 3 : Mettre à jour `getOrder`** pour inclure variantes et order_payments

Changer le select de `getOrder` :
```js
// Remplacer la ligne items:order_items(...) par :
items:order_items(*, product:products(name, reference), variant:product_variants(size, comfort)),
// Ajouter après payments(*):
order_payments(*),
```

- [ ] **Étape 4 : Commit**

```bash
git add src/services/orderService.js
git commit -m "feat(services): extend orderService with literie fields and variant support"
```

---

## Task 6 : Produits.jsx — Gestion variantes

**Fichiers :**
- Modifier : `src/pages/Produits.jsx`

**Comportement attendu :**
- La modal de création/édition d'un produit a un toggle "Ce produit a des tailles/conforts"
- Si activé : section "Variantes" avec liste des variantes existantes + bouton "Ajouter variante"
- Chaque variante : taille (texte, ex "160x200") + confort (souple/medium/ferme/autre) + prix TTC + prix d'achat HT + référence fournisseur
- Si désactivé : les champs prix normaux du produit s'affichent

- [ ] **Étape 1 : Ajouter les imports**

En haut de `Produits.jsx`, ajouter :
```js
import { listVariants, createVariant, updateVariant, archiveVariant } from '../services/variantService'
```

- [ ] **Étape 2 : Ajouter les états variantes dans le composant**

```js
// Après les états existants (form, saveLoading...)
const [hasVariants, setHasVariants] = useState(false)
const [variants, setVariants] = useState([])
const [variantForm, setVariantForm] = useState({ size: '', comfort: 'medium', price: '', purchase_price: '', sku_supplier: '' })
const [variantsLoading, setVariantsLoading] = useState(false)
const [addingVariant, setAddingVariant] = useState(false)
```

- [ ] **Étape 3 : Charger les variantes à l'ouverture de la modal édition**

Dans la fonction qui ouvre la modal d'édition (probablement `handleEdit`), après avoir rempli le form :
```js
setHasVariants(prod.has_variants || false)
if (prod.has_variants && prod.id) {
  setVariantsLoading(true)
  listVariants(prod.id).then(v => { setVariants(v); setVariantsLoading(false) })
}
```

Dans la fonction `handleCloseModal` (ou équivalent) :
```js
setHasVariants(false)
setVariants([])
setVariantForm({ size: '', comfort: 'medium', price: '', purchase_price: '', sku_supplier: '' })
setAddingVariant(false)
```

- [ ] **Étape 4 : Étendre le form produit avec éco-participation**

Dans l'état `form` existant, ajouter :
```js
eco_participation_amount: '', warranty_years: ''
```

Dans `handleEdit`, ajouter :
```js
eco_participation_amount: prod.eco_participation_amount || '',
warranty_years: prod.warranty_years || '',
```

Dans le `handleSave` (ou équivalent), inclure dans l'upsert :
```js
has_variants: hasVariants,
eco_participation_amount: parseFloat(form.eco_participation_amount) || 0,
warranty_years: parseInt(form.warranty_years) || 0,
```

- [ ] **Étape 5 : Ajouter les champs UI dans la modal**

Après le champ "Prix TTC" existant, ajouter dans le JSX de la modal :
```jsx
{/* Éco-participation */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Éco-participation (€)
    <span className="text-xs text-gray-400 ml-1">obligatoire literie</span>
  </label>
  <input
    type="number" step="0.01" min="0"
    value={form.eco_participation_amount}
    onChange={e => setForm(f => ({ ...f, eco_participation_amount: e.target.value }))}
    className="w-full border rounded-xl px-3 py-2 text-sm"
    placeholder="ex: 5.50"
  />
</div>

{/* Garantie */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Garantie constructeur (années)</label>
  <input
    type="number" min="0" max="25"
    value={form.warranty_years}
    onChange={e => setForm(f => ({ ...f, warranty_years: e.target.value }))}
    className="w-full border rounded-xl px-3 py-2 text-sm"
    placeholder="ex: 5"
  />
</div>

{/* Toggle variantes */}
<div className="flex items-center gap-3 pt-2">
  <input
    type="checkbox"
    id="has_variants"
    checked={hasVariants}
    onChange={e => setHasVariants(e.target.checked)}
    className="w-4 h-4"
  />
  <label htmlFor="has_variants" className="text-sm font-medium text-gray-700">
    Ce produit a des tailles / conforts différents
  </label>
</div>
```

- [ ] **Étape 6 : Ajouter la section variantes dans la modal (si `hasVariants`)**

Sous le toggle, ajouter :
```jsx
{hasVariants && (
  <div className="border-t pt-4 mt-2">
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-semibold text-gray-700">Variantes</p>
      <button
        type="button"
        onClick={() => setAddingVariant(true)}
        className="text-xs text-[#313ADF] font-medium hover:underline"
      >
        + Ajouter une taille
      </button>
    </div>

    {variantsLoading && <p className="text-xs text-gray-400">Chargement...</p>}

    {/* Liste des variantes existantes */}
    {variants.map(v => (
      <div key={v.id} className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded-lg text-sm">
        <span className="font-medium w-20">{v.size}</span>
        <span className="text-gray-500 w-16">{v.comfort || '—'}</span>
        <span className="flex-1">{Number(v.price).toFixed(2)} €</span>
        <button
          type="button"
          onClick={() => archiveVariant(v.id).then(() => setVariants(vv => vv.filter(x => x.id !== v.id)))}
          className="text-red-400 hover:text-red-600 text-xs"
        >
          Suppr.
        </button>
      </div>
    ))}

    {/* Formulaire ajout variante */}
    {addingVariant && (
      <div className="bg-blue-50 rounded-xl p-3 mt-2 space-y-2">
        <div className="flex gap-2">
          <input
            placeholder="Taille (ex: 160x200)"
            value={variantForm.size}
            onChange={e => setVariantForm(f => ({ ...f, size: e.target.value }))}
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
          />
          <select
            value={variantForm.comfort}
            onChange={e => setVariantForm(f => ({ ...f, comfort: e.target.value }))}
            className="border rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">Sans</option>
            <option value="souple">Souple</option>
            <option value="medium">Medium</option>
            <option value="ferme">Ferme</option>
            <option value="tres_souple">Très souple</option>
            <option value="tres_ferme">Très ferme</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="Prix TTC (€)"
            type="number" step="0.01"
            value={variantForm.price}
            onChange={e => setVariantForm(f => ({ ...f, price: e.target.value }))}
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Réf. fournisseur"
            value={variantForm.sku_supplier}
            onChange={e => setVariantForm(f => ({ ...f, sku_supplier: e.target.value }))}
            className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setAddingVariant(false)}
            className="text-xs text-gray-500 hover:underline">Annuler</button>
          <button
            type="button"
            disabled={!variantForm.size || !variantForm.price}
            onClick={async () => {
              if (!editingProduct?.id) return
              const v = await createVariant(workspace.id, editingProduct.id, variantForm)
              setVariants(vv => [...vv, v])
              setVariantForm({ size: '', comfort: 'medium', price: '', purchase_price: '', sku_supplier: '' })
              setAddingVariant(false)
            }}
            className="text-xs bg-[#313ADF] text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Étape 7 : Vérifier dans le navigateur**

1. Aller sur `/produits`
2. Créer un produit "Matelas Test", éco-participation 5.50, garantie 5 ans
3. Activer "Ce produit a des tailles/conforts différents"
4. Sauvegarder → rouvrir → vérifier que le toggle est toujours actif
5. Ajouter variante "160x200" / ferme / 620€ → apparaît dans la liste
6. Supprimer la variante → disparaît

- [ ] **Étape 8 : Commit**

```bash
git add src/pages/Produits.jsx
git commit -m "feat(produits): add variant management, eco-participation and warranty fields"
```

---

## Task 7 : CreerCommande.jsx — Variantes + Éco-participation

**Fichiers :**
- Modifier : `src/pages/CreerCommande.jsx`

**Comportement attendu :** quand un produit avec `has_variants = true` est sélectionné sur une ligne, un second select apparaît pour choisir la variante (taille + confort). Le prix de la ligne se met à jour avec le prix de la variante. L'éco-participation s'ajoute automatiquement comme information dans la ligne.

- [ ] **Étape 1 : Ajouter les imports**

```js
import { listVariants } from '../services/variantService'
```

- [ ] **Étape 2 : Ajouter l'état variantes par ligne**

```js
// Map productId → liste de variantes disponibles
const [variantsMap, setVariantsMap] = useState({}) // { productId: [variant, ...] }
```

Dans chaque ligne (`lignes`), ajouter `variant_id: null` et `eco_participation: 0` à l'état initial.

- [ ] **Étape 3 : Charger les variantes quand un produit est sélectionné**

Trouver la fonction qui gère la sélection d'un produit sur une ligne (probablement `handleSelectProduct` ou dans `handleLigneChange`). Après la sélection du produit :

```js
// Si le produit a des variantes, les charger
if (selectedProduit?.has_variants) {
  if (!variantsMap[selectedProduit.id]) {
    listVariants(selectedProduit.id).then(variants => {
      setVariantsMap(prev => ({ ...prev, [selectedProduit.id]: variants }))
    })
  }
}
// Reset variant_id et eco_participation sur la ligne
setLignes(prev => prev.map(l =>
  l.id === ligneId
    ? { ...l, variant_id: null, eco_participation: selectedProduit?.eco_participation_amount || 0 }
    : l
))
```

- [ ] **Étape 4 : Ajouter le select variante dans le JSX des lignes**

Dans le rendu de chaque ligne, après le select du produit, ajouter :
```jsx
{/* Select variante si le produit en a */}
{(() => {
  const produit = produits.find(p => p.id === ligne.produit_id)
  if (!produit?.has_variants) return null
  const variantsList = variantsMap[produit.id] || []
  return (
    <select
      value={ligne.variant_id || ''}
      onChange={e => {
        const variant = variantsList.find(v => v.id === e.target.value)
        setLignes(prev => prev.map(l =>
          l.id === ligne.id
            ? { ...l, variant_id: e.target.value || null, unit_price: variant ? variant.price / 1.2 : l.unit_price }
            : l
        ))
      }}
      className="border rounded-xl px-3 py-2 text-sm"
    >
      <option value="">— Choisir taille/confort —</option>
      {variantsList.map(v => (
        <option key={v.id} value={v.id}>
          {v.size}{v.comfort ? ` — ${v.comfort}` : ''} — {Number(v.price).toFixed(2)} €
        </option>
      ))}
    </select>
  )
})()}
```

- [ ] **Étape 5 : Afficher l'éco-participation dans le résumé des totaux**

Dans la section de calcul des totaux, ajouter l'affichage de l'éco-participation totale :
```jsx
{lignes.some(l => l.eco_participation > 0) && (
  <div className="flex justify-between text-sm text-gray-500">
    <span>Éco-participation</span>
    <span>{lignes.reduce((s, l) => s + (l.eco_participation || 0) * l.quantity, 0).toFixed(2)} €</span>
  </div>
)}
```

- [ ] **Étape 6 : Passer les nouveaux champs à `createOrder`**

Dans la fonction de soumission, s'assurer que chaque item inclut :
```js
variant_id: ligne.variant_id || null,
eco_participation: ligne.eco_participation || 0,
eco_participation_tva_rate: ligne.tax_rate || 20,
```

- [ ] **Étape 7 : Vérifier dans le navigateur**

1. Aller sur `/commandes/creer`
2. Ajouter le produit "Matelas Test" → le select variante apparaît
3. Choisir "160x200 — ferme" → le prix de la ligne se met à jour
4. L'éco-participation apparaît dans le résumé
5. Valider la commande → vérifier dans Supabase que `order_items.variant_id` est rempli

- [ ] **Étape 8 : Commit**

```bash
git add src/pages/CreerCommande.jsx
git commit -m "feat(commandes): add variant selection and eco-participation to order creation"
```

---

## Task 8 : CreerCommande.jsx — Acompte, reprise, RGPD, dates livraison

**Fichiers :**
- Modifier : `src/pages/CreerCommande.jsx`

**Comportement attendu :** Le formulaire de création de commande dispose d'une section "Informations literie" avec : dates de livraison, reprise ancien matelas (4 options), consentement SMS, et une section acompte multi-mode avec ventilation par moyen de paiement.

- [ ] **Étape 1 : Ajouter les imports**

```js
import { addOrderPayment } from '../services/orderPaymentService'
```

- [ ] **Étape 2 : Ajouter les états**

```js
// Dates livraison
const [wishedDeliveryDate, setWishedDeliveryDate] = useState('')
const [maxDeliveryDate, setMaxDeliveryDate] = useState('')

// Reprise ancien matelas
const [oldFurnitureOption, setOldFurnitureOption] = useState('keep')

// Consentements RGPD
const [smsConsent, setSmsConsent] = useState(false)
const [smsPartnerConsent, setSmsPartnerConsent] = useState(false)

// Acompte multi-mode
const [acompteRows, setAcompteRows] = useState([
  { mode: 'cb', amount: '' }
])
```

- [ ] **Étape 3 : Ajouter les champs UI — Dates livraison**

Dans le formulaire, après la section "Notes" :
```jsx
{/* Section Livraison */}
<div className="bg-gray-50 rounded-2xl p-4 space-y-3">
  <p className="text-sm font-semibold text-gray-700">Livraison</p>
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className="block text-xs text-gray-500 mb-1">Date souhaitée</label>
      <input type="date" value={wishedDeliveryDate}
        onChange={e => setWishedDeliveryDate(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm" />
    </div>
    <div>
      <label className="block text-xs text-gray-500 mb-1">Date limite</label>
      <input type="date" value={maxDeliveryDate}
        onChange={e => setMaxDeliveryDate(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm" />
    </div>
  </div>
</div>
```

- [ ] **Étape 4 : Ajouter les champs UI — Reprise ancien matelas**

```jsx
{/* Reprise ancien matelas */}
<div className="bg-gray-50 rounded-2xl p-4 space-y-2">
  <p className="text-sm font-semibold text-gray-700">Reprise & recyclage des anciens meubles</p>
  {[
    { value: 'keep', label: 'Le client souhaite conserver ses anciens meubles' },
    { value: 'ess', label: 'En faire don et confier la reprise à une ESS' },
    { value: 'dechetterie', label: 'Les déposer en déchetterie ou point de collecte' },
    { value: 'reprise', label: 'En confier la reprise gratuite à notre magasin' },
  ].map(opt => (
    <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
      <input type="radio" name="old_furniture"
        value={opt.value} checked={oldFurnitureOption === opt.value}
        onChange={e => setOldFurnitureOption(e.target.value)}
        className="mt-0.5" />
      <span className="text-sm text-gray-700">{opt.label}</span>
    </label>
  ))}
</div>
```

- [ ] **Étape 5 : Ajouter les champs UI — Consentements RGPD**

```jsx
{/* RGPD */}
<div className="bg-gray-50 rounded-2xl p-4 space-y-2">
  <p className="text-sm font-semibold text-gray-700">Consentements (RGPD)</p>
  <label className="flex items-center gap-2 cursor-pointer">
    <input type="checkbox" checked={smsConsent} onChange={e => setSmsConsent(e.target.checked)} />
    <span className="text-sm text-gray-700">
      J'accepte de recevoir vos offres commerciales par courrier, SMS, email
    </span>
  </label>
  <label className="flex items-center gap-2 cursor-pointer">
    <input type="checkbox" checked={smsPartnerConsent} onChange={e => setSmsPartnerConsent(e.target.checked)} />
    <span className="text-sm text-gray-700">
      J'accepte de recevoir les offres commerciales de vos partenaires
    </span>
  </label>
</div>
```

- [ ] **Étape 6 : Ajouter les champs UI — Acompte multi-mode**

```jsx
{/* Acompte */}
<div className="bg-blue-50 rounded-2xl p-4 space-y-3">
  <p className="text-sm font-semibold text-[#313ADF]">Acompte encaissé aujourd'hui</p>
  {acompteRows.map((row, i) => (
    <div key={i} className="flex gap-2 items-center">
      <select value={row.mode}
        onChange={e => setAcompteRows(prev => prev.map((r, j) => j === i ? { ...r, mode: e.target.value } : r))}
        className="border rounded-xl px-3 py-2 text-sm w-36">
        <option value="cb">CB</option>
        <option value="cash">Espèces</option>
        <option value="cheque">Chèque</option>
        <option value="virement">Virement</option>
        <option value="financement">Financement</option>
      </select>
      <input type="number" step="0.01" min="0"
        placeholder="0,00 €"
        value={row.amount}
        onChange={e => setAcompteRows(prev => prev.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
        className="flex-1 border rounded-xl px-3 py-2 text-sm" />
      {acompteRows.length > 1 && (
        <button type="button" onClick={() => setAcompteRows(prev => prev.filter((_, j) => j !== i))}
          className="text-red-400 text-sm">✕</button>
      )}
    </div>
  ))}
  <button type="button"
    onClick={() => setAcompteRows(prev => [...prev, { mode: 'cb', amount: '' }])}
    className="text-xs text-[#313ADF] hover:underline">
    + Ajouter un mode de paiement
  </button>
  {/* Solde calculé */}
  {(() => {
    const totalAcompte = acompteRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
    const totalCommande = /* valeur totale TTC de la commande */ 0 // remplacer par le vrai calcul
    const solde = Math.max(0, totalCommande - totalAcompte)
    return (
      <p className="text-sm font-semibold text-gray-700 text-right">
        À encaisser à la livraison : <span className="text-[#313ADF]">{solde.toFixed(2)} €</span>
      </p>
    )
  })()}
</div>
```

**Note :** Le calcul du solde utilise le total TTC de la commande. Remplacer `/* valeur totale TTC */` par la variable de calcul déjà existante dans le composant (souvent `totalTTC` ou `montantTotal`).

- [ ] **Étape 7 : Passer tous les nouveaux champs à `createOrder` et enregistrer l'acompte**

Dans la fonction de soumission, ajouter dans `orderData` :
```js
wished_delivery_date: wishedDeliveryDate || null,
max_delivery_date: maxDeliveryDate || null,
old_furniture_option: oldFurnitureOption,
sms_consent: smsConsent,
sms_partner_consent: smsPartnerConsent,
```

Après `createOrder(...)`, pour chaque ligne d'acompte non vide :
```js
const { data: { user } } = await supabase.auth.getUser()
for (const row of acompteRows) {
  if (parseFloat(row.amount) > 0) {
    await addOrderPayment(workspace.id, order.id, user.id, {
      payment_type: 'acompte',
      mode: row.mode,
      amount: parseFloat(row.amount),
    })
  }
}
```

- [ ] **Étape 8 : Vérifier dans le navigateur**

1. Créer une commande avec une date de livraison souhaitée, option reprise "reprise magasin", acompte CB 200€
2. Ouvrir la commande créée → vérifier dans Supabase que `orders.wished_delivery_date`, `old_furniture_option = 'reprise'`, `sms_consent` sont corrects
3. Vérifier que `order_payments` contient bien le paiement de 200€ acompte CB

- [ ] **Étape 9 : Commit**

```bash
git add src/pages/CreerCommande.jsx
git commit -m "feat(commandes): add delivery dates, old furniture option, RGPD consent and multi-mode deposit"
```

---

## Task 9 : VenteRapide.jsx — Sélection variante

**Fichiers :**
- Modifier : `src/pages/VenteRapide.jsx`

**Comportement attendu :** Quand un produit avec variantes est ajouté au panier, une modale ou un select inline permet de choisir la taille/confort avant ajout.

- [ ] **Étape 1 : Ajouter l'import et les états**

```js
import { listVariants } from '../services/variantService'

// Dans le composant :
const [variantPickerProduct, setVariantPickerProduct] = useState(null) // produit en attente de choix
const [variantsForPicker, setVariantsForPicker] = useState([])
```

- [ ] **Étape 2 : Intercepter l'ajout au panier si le produit a des variantes**

Trouver la fonction `ajouterAuPanier` (ou équivalent). Avant d'ajouter, vérifier :

```js
const handleAddProduct = async (produit) => {
  if (produit.has_variants) {
    const variants = await listVariants(produit.id)
    setVariantsForPicker(variants)
    setVariantPickerProduct(produit)
    return // attendre le choix
  }
  // sinon ajout normal existant
  ajouterAuPanier(produit)
}
```

- [ ] **Étape 3 : Ajouter la modale de choix de variante**

```jsx
{variantPickerProduct && (
  <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
    <div className="bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm">
      <h3 className="font-semibold mb-4">Choisir la taille / le confort</h3>
      <p className="text-sm text-gray-500 mb-3">{variantPickerProduct.name}</p>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {variantsForPicker.map(v => (
          <button key={v.id}
            onClick={() => {
              ajouterAuPanier({ ...variantPickerProduct, variant_id: v.id, unit_price: v.price / 1.2, variantLabel: `${v.size}${v.comfort ? ' — ' + v.comfort : ''}` })
              setVariantPickerProduct(null)
            }}
            className="w-full flex justify-between items-center p-3 bg-gray-50 rounded-xl hover:bg-blue-50 text-sm">
            <span>{v.size}{v.comfort ? ` — ${v.comfort}` : ''}</span>
            <span className="font-semibold">{Number(v.price).toFixed(2)} €</span>
          </button>
        ))}
      </div>
      <button onClick={() => setVariantPickerProduct(null)}
        className="w-full mt-3 py-2 text-gray-500 text-sm">Annuler</button>
    </div>
  </div>
)}
```

- [ ] **Étape 4 : Vérifier dans le navigateur**

1. Aller sur `/vente-rapide`
2. Cliquer sur un produit avec variantes → la modale s'ouvre
3. Choisir une variante → elle est ajoutée au panier avec le bon prix
4. Produit sans variante → ajout direct sans modale

- [ ] **Étape 5 : Commit**

```bash
git add src/pages/VenteRapide.jsx
git commit -m "feat(vente-rapide): add variant picker modal for products with variants"
```

---

## Task 10 : Settings.jsx — APE code et capital social

**Fichiers :**
- Modifier : `src/pages/Settings.jsx`

**Comportement attendu :** L'onglet "Workspace" a deux nouveaux champs : "Code APE" et "Capital social" qui apparaissent dans le footer du bon de commande PDF.

- [ ] **Étape 1 : Ajouter `ape_code` et `legal_capital` dans `wsForm`**

Dans l'état `wsForm` existant, ajouter :
```js
ape_code: '',
legal_capital: '',
```

- [ ] **Étape 2 : Pré-remplir depuis le workspace existant**

Dans `useEffect` qui charge les données workspace (probablement `loadWorkspaceData`), ajouter :
```js
ape_code: ws.ape_code || '',
legal_capital: ws.legal_capital || '',
```

- [ ] **Étape 3 : Ajouter les champs dans le formulaire UI**

Dans le JSX de l'onglet Workspace, après le champ SIRET existant :
```jsx
{/* Code APE */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Code APE</label>
  <input
    value={wsForm.ape_code}
    onChange={e => setWsForm(f => ({ ...f, ape_code: e.target.value }))}
    className="w-full border rounded-xl px-3 py-2 text-sm"
    placeholder="ex: 4759A"
    maxLength={10}
  />
</div>

{/* Capital social */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Capital social</label>
  <input
    value={wsForm.legal_capital}
    onChange={e => setWsForm(f => ({ ...f, legal_capital: e.target.value }))}
    className="w-full border rounded-xl px-3 py-2 text-sm"
    placeholder="ex: 8 000 Euros"
  />
</div>
```

- [ ] **Étape 4 : Inclure dans la mise à jour workspace**

Dans la fonction `handleSaveWorkspace` (ou équivalent), inclure :
```js
ape_code: wsForm.ape_code || null,
legal_capital: wsForm.legal_capital || null,
```

- [ ] **Étape 5 : Vérifier**

1. Aller sur `/settings?tab=workspace`
2. Remplir "Code APE : 4759A" et "Capital social : 8 000 Euros"
3. Sauvegarder → vérifier dans Supabase table `workspaces`

- [ ] **Étape 6 : Commit**

```bash
git add src/pages/Settings.jsx
git commit -m "feat(settings): add APE code and legal capital fields for PDF footer"
```

---

## Task 11 : generate-pdf Edge Function — Bon de commande

**Fichiers :**
- Modifier : `supabase/functions/generate-pdf/index.ts`

**Comportement attendu :** Le paramètre `document_type: 'order'` génère un bon de commande au format exact observé sur le bon de commande réel (voir Section 3 du spec). La fonction charge la commande avec ses items, variantes, paiements, workspace, et client.

- [ ] **Étape 1 : Ajouter le branch `order` dans la logique de routing**

Après le bloc existant `const isInvoice = document_type === 'invoice'`, ajouter :

```ts
const isOrder = document_type === 'order'

if (isOrder) {
  // Charger la commande avec tout ce dont on a besoin
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      *,
      customer:customers(*),
      items:order_items(*, product:products(name, reference, eco_participation_amount), variant:product_variants(size, comfort)),
      order_payments(*),
      workspace:workspaces(name, address, postal_code, city, email, phone, siret, ape_code, legal_capital, logo_url)
    `)
    .eq('id', document_id)
    .single()

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const pdfBytes = await generateOrderPdf(order)

  // Upload dans Supabase Storage
  const fileName = `orders/${order.id}/bon-commande-${order.order_number}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw new Error('Erreur upload PDF: ' + uploadError.message)

  const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
  return new Response(JSON.stringify({ pdf_url: urlData.publicUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
```

- [ ] **Étape 2 : Implémenter `generateOrderPdf`**

Ajouter la fonction `generateOrderPdf` dans le même fichier (après les constantes, avant `serve`) :

```ts
async function generateOrderPdf(order: any): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([PAGE_W, PAGE_H])
  const { width, height } = page.getSize()
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let y = height - 40

  // ── En-tête workspace ──────────────────────────────────────
  const ws = order.workspace
  page.drawText(safe(ws?.name), { x: MARGIN, y, font: boldFont, size: 14, color: NAVY })
  y -= 16
  if (ws?.address) { page.drawText(safe(ws.address), { x: MARGIN, y, font, size: 8, color: GRAY }); y -= 11 }
  if (ws?.postal_code || ws?.city) { page.drawText(`${safe(ws.postal_code)} ${safe(ws.city)}`, { x: MARGIN, y, font, size: 8, color: GRAY }); y -= 11 }
  if (ws?.email) { page.drawText(`E-Mail  ${safe(ws.email)}`, { x: MARGIN, y, font, size: 8, color: GRAY }); y -= 11 }
  if (ws?.phone) { page.drawText(`Tél.    ${safe(ws.phone)}`, { x: MARGIN, y, font, size: 8, color: GRAY }); y -= 11 }

  // ── Titre BON DE COMMANDE + numéro + date ─────────────────
  const titleX = PAGE_W / 2
  page.drawText('Bon de Commande', { x: titleX, y: height - 40, font: boldFont, size: 16, color: DARK })
  page.drawText(`N° ${safe(order.order_number)} du ${fmtD(order.created_at)}`, { x: titleX, y: height - 58, font, size: 10, color: DARK })

  // ── Vendeur ────────────────────────────────────────────────
  y = height - 40
  page.drawText('Votre Conseiller', { x: titleX, y: y - 30, font, size: 8, color: GRAY })
  page.drawText(safe(order.seller_name || ''), { x: titleX, y: y - 44, font: boldFont, size: 10, color: DARK })

  // ── Client ─────────────────────────────────────────────────
  const cust = order.customer
  const custName = `${safe(cust?.first_name)} ${safe(cust?.last_name)}`.toUpperCase()
  page.drawText('Adresse Livraison :', { x: MARGIN, y: height - 100, font, size: 8, color: GRAY })
  page.drawText(custName, { x: MARGIN, y: height - 114, font: boldFont, size: 10, color: DARK })
  if (cust?.address) page.drawText(safe(cust.address), { x: MARGIN, y: height - 126, font, size: 9, color: DARK })
  if (cust?.postal_code || cust?.city) page.drawText(`${safe(cust?.postal_code)} ${safe(cust?.city)}`, { x: MARGIN, y: height - 137, font, size: 9, color: DARK })
  if (cust?.phone) page.drawText(`Port. ${safe(cust.phone)}`, { x: MARGIN, y: height - 148, font, size: 9, color: DARK })

  // Client répété à droite
  page.drawText(custName, { x: PAGE_W / 2, y: height - 90, font: boldFont, size: 10, color: DARK })
  if (cust?.address) page.drawText(safe(cust.address), { x: PAGE_W / 2, y: height - 102, font, size: 9, color: DARK })

  // ── Séparateur ─────────────────────────────────────────────
  const tableY = height - 175
  page.drawLine({ start: { x: MARGIN, y: tableY }, end: { x: PAGE_W - MARGIN, y: tableY }, thickness: 0.5, color: LGRAY })

  // ── En-tête tableau ────────────────────────────────────────
  const colRef = MARGIN
  const colDesc = MARGIN + 45
  const colQty = PAGE_W - MARGIN - 210
  const colPrix = PAGE_W - MARGIN - 165
  const colRemise = PAGE_W - MARGIN - 90
  const colTotal = PAGE_W - MARGIN - 20

  let rowY = tableY - 14
  page.drawText('Réf.', { x: colRef, y: rowY, font: boldFont, size: 8, color: GRAY })
  page.drawText('Désignation', { x: colDesc, y: rowY, font: boldFont, size: 8, color: GRAY })
  page.drawText('Qté', { x: colQty, y: rowY, font: boldFont, size: 8, color: GRAY })
  page.drawText('Prix TTC', { x: colPrix, y: rowY, font: boldFont, size: 8, color: GRAY })
  page.drawText('Remise', { x: colRemise, y: rowY, font: boldFont, size: 8, color: GRAY })
  page.drawText('Total TTC', { x: colTotal - 35, y: rowY, font: boldFont, size: 8, color: GRAY })

  rowY -= 10
  page.drawLine({ start: { x: MARGIN, y: rowY }, end: { x: PAGE_W - MARGIN, y: rowY }, thickness: 0.3, color: LGRAY })

  // ── Lignes articles ────────────────────────────────────────
  let totalEco = 0
  for (const item of (order.items || [])) {
    rowY -= 14
    const ref = safe(item.product?.reference || '')
    const name = safe(item.product?.name || item.description || '')
    const variantLabel = item.variant ? ` ${item.variant.size}${item.variant.comfort ? ' — ' + item.variant.comfort : ''}` : ''
    const unitPriceTTC = (item.unit_price_ht || 0) * (1 + (item.tax_rate || 20) / 100)
    const discount = item.discount_item || 0
    const totalTTC = item.total_ht * (1 + (item.tax_rate || 20) / 100)

    page.drawText(truncate(ref, 8), { x: colRef, y: rowY, font, size: 8, color: DARK })
    page.drawText(truncate(name + variantLabel, 35), { x: colDesc, y: rowY, font: boldFont, size: 8, color: DARK })
    page.drawText(String(item.quantity), { x: colQty, y: rowY, font, size: 8, color: DARK })
    page.drawText(fmt(unitPriceTTC), { x: colPrix - 20, y: rowY, font, size: 8, color: DARK })
    page.drawText(fmt(discount), { x: colRemise - 10, y: rowY, font, size: 8, color: DARK })
    page.drawText(fmt(totalTTC), { x: colTotal - 35, y: rowY, font, size: 8, color: DARK })

    // Éco-participation
    const eco = item.eco_participation || item.product?.eco_participation_amount || 0
    if (eco > 0) {
      totalEco += eco * item.quantity
      rowY -= 11
      page.drawText('Eco-participation', { x: colDesc, y: rowY, font, size: 7, color: GRAY })
      page.drawText(String(item.quantity), { x: colQty, y: rowY, font, size: 7, color: GRAY })
      page.drawText(fmt(eco), { x: colPrix - 20, y: rowY, font, size: 7, color: GRAY })
      page.drawText(fmt(eco * item.quantity), { x: colTotal - 35, y: rowY, font, size: 7, color: GRAY })
    }

    // Description technique (garantie, matériaux)
    if (item.product?.reference) {
      rowY -= 10
      page.drawText(`Réf.: ${safe(item.product.reference)}`, { x: colDesc, y: rowY, font, size: 7, color: GRAY })
    }
    rowY -= 4
  }

  // ── Dates livraison ────────────────────────────────────────
  rowY -= 14
  page.drawLine({ start: { x: MARGIN, y: rowY }, end: { x: PAGE_W - MARGIN, y: rowY }, thickness: 0.3, color: LGRAY })
  rowY -= 12
  page.drawText('LIVRAISON SOUHAITEE LE :', { x: MARGIN, y: rowY, font: boldFont, size: 8, color: DARK })
  page.drawText(fmtD(order.wished_delivery_date) || '--/--/----', { x: MARGIN + 110, y: rowY, font, size: 8, color: DARK })
  page.drawText('DATE LIMITE DE LIVRAISON :', { x: PAGE_W / 2, y: rowY, font: boldFont, size: 8, color: DARK })
  page.drawText(fmtD(order.max_delivery_date) || '--/--/----', { x: PAGE_W / 2 + 120, y: rowY, font, size: 8, color: DARK })

  // ── Acompte ────────────────────────────────────────────────
  rowY -= 14
  const payments = order.order_payments || []
  const acomptes = payments.filter((p: any) => p.payment_type === 'acompte')
  const totalAcompte = acomptes.reduce((s: number, p: any) => s + Number(p.amount), 0)
  const totalDu = Number(order.total_ttc || 0) + totalEco
  const solde = Math.max(0, totalDu - totalAcompte)

  page.drawText('ACOMPTE', { x: MARGIN, y: rowY, font: boldFont, size: 8, color: DARK })
  const modeLabels: Record<string, string> = { cb: 'C.B', cash: 'ESPECES', virement: 'VIREMENT', cheque: 'CHEQUE', financement: 'FINANCEMENT' }
  let aY = rowY
  for (const ap of acomptes) {
    page.drawText(`${modeLabels[ap.mode] || ap.mode} :`, { x: MARGIN + 20, y: aY, font, size: 8, color: GRAY })
    page.drawText(fmt(ap.amount), { x: MARGIN + 90, y: aY, font, size: 8, color: DARK })
    aY -= 11
  }
  if (acomptes.length === 0) {
    page.drawText('0,00 €', { x: MARGIN + 90, y: aY, font, size: 8, color: DARK })
    aY -= 11
  }

  // Totaux à droite
  const totX = PAGE_W - MARGIN - 120
  let totY = rowY
  page.drawText('TOTAL TTC hors éco', { x: totX, y: totY, font, size: 8, color: DARK })
  page.drawText(fmt(order.total_ttc), { x: PAGE_W - MARGIN - 5, y: totY, font, size: 8, color: DARK })
  totY -= 11
  page.drawText('Remise', { x: totX, y: totY, font, size: 8, color: DARK })
  page.drawText(fmt(order.discount_global || 0), { x: PAGE_W - MARGIN - 5, y: totY, font, size: 8, color: DARK })
  totY -= 11
  page.drawText('TTC NET hors éco', { x: totX, y: totY, font, size: 8, color: DARK })
  page.drawText(fmt((order.total_ttc || 0) - (order.discount_global || 0)), { x: PAGE_W - MARGIN - 5, y: totY, font, size: 8, color: DARK })
  totY -= 11
  page.drawText('Éco-participation', { x: totX, y: totY, font, size: 8, color: DARK })
  page.drawText(fmt(totalEco), { x: PAGE_W - MARGIN - 5, y: totY, font, size: 8, color: DARK })
  totY -= 13

  // TTC Dû en gros
  page.drawRectangle({ x: totX - 5, y: totY - 4, width: PAGE_W - MARGIN - totX + 5, height: 18, color: LGRAY })
  page.drawText('TTC Dû', { x: totX, y: totY, font: boldFont, size: 10, color: NAVY })
  page.drawText(fmt(totalDu), { x: PAGE_W - MARGIN - 5, y: totY, font: boldFont, size: 10, color: NAVY })

  // ── À encaisser à la livraison ─────────────────────────────
  const aencaisserY = Math.min(aY, totY) - 14
  page.drawText('A ENCAISSER A LA LIVRAISON', { x: MARGIN, y: aencaisserY, font: boldFont, size: 8, color: DARK })
  page.drawText(fmt(solde), { x: MARGIN + 150, y: aencaisserY, font: boldFont, size: 8, color: solde > 0 ? RED : GREEN })

  // ── Reprise anciens meubles ────────────────────────────────
  const repriseY = aencaisserY - 16
  page.drawText('Reprise & recyclage de vos anciens meubles', { x: MARGIN, y: repriseY, font: boldFont, size: 8, color: DARK })
  const repriseOptions = [
    { value: 'keep', label: 'Je souhaite conserver mes anciens meubles' },
    { value: 'ess', label: 'En faire don et confier la reprise à une ESS' },
    { value: 'dechetterie', label: 'Les déposer en déchetterie ou dans un point de collecte de proximité' },
    { value: 'reprise', label: 'En confier la reprise gratuite à mon magasin (ou à son prestataire)' },
  ]
  let rY = repriseY - 11
  for (const opt of repriseOptions) {
    const checked = order.old_furniture_option === opt.value
    page.drawText(checked ? '☑' : '☐', { x: MARGIN, y: rY, font, size: 8, color: DARK })
    page.drawText(opt.label, { x: MARGIN + 14, y: rY, font, size: 7.5, color: DARK })
    rY -= 11
  }

  // ── Mentions légales éco-participation ─────────────────────
  const mentionY = rY - 6
  page.drawText(
    'Sous réserve d\'augmentation de l\'éco-participation inconnue à la date d\'impression de ce document',
    { x: MARGIN, y: mentionY, font, size: 6.5, color: GRAY }
  )
  page.drawText(
    'et applicable lors de la facturation du présent bon de commande.',
    { x: MARGIN, y: mentionY - 8, font, size: 6.5, color: GRAY }
  )

  // ── BON POUR COMMANDE FERME ────────────────────────────────
  const bpcX = PAGE_W / 2 + 5
  const bpcY = aencaisserY - 8
  page.drawText('BON POUR COMMANDE FERME', { x: bpcX, y: bpcY, font: boldFont, size: 9, color: DARK })
  page.drawText(
    'Je déclare avoir pris connaissance des conditions générales de vente',
    { x: bpcX, y: bpcY - 12, font, size: 6.5, color: DARK }
  )
  page.drawText(
    'jointes et accepte tous les termes.',
    { x: bpcX, y: bpcY - 21, font, size: 6.5, color: DARK }
  )

  // RGPD
  const rgpdY = bpcY - 38
  const smsOui = order.sms_consent
  page.drawText('J\'accepte de recevoir vos offres commerciales par courrier, sms, email :', { x: bpcX, y: rgpdY, font, size: 6.5, color: DARK })
  page.drawText(smsOui ? '☑ Oui  ☐ Non' : '☐ Oui  ☑ Non', { x: bpcX, y: rgpdY - 10, font, size: 7, color: DARK })

  // Signatures
  const sigY = mentionY - 30
  page.drawLine({ start: { x: MARGIN, y: sigY }, end: { x: PAGE_W / 2 - 10, y: sigY }, thickness: 0.5, color: LGRAY })
  page.drawLine({ start: { x: PAGE_W / 2 + 5, y: sigY }, end: { x: PAGE_W - MARGIN, y: sigY }, thickness: 0.5, color: LGRAY })
  page.drawText('SIGNATURE DU CLIENT', { x: MARGIN, y: sigY - 10, font, size: 7.5, color: GRAY })
  page.drawText('SIGNATURE DU VENDEUR', { x: PAGE_W / 2 + 5, y: sigY - 10, font, size: 7.5, color: GRAY })

  // ── Footer légal ───────────────────────────────────────────
  const footerParts = [
    ws?.legal_form ? `${ws.legal_form}` : '',
    ws?.legal_capital ? `au capital de ${ws.legal_capital}` : '',
    ws?.siret ? `SIRET : ${ws.siret}` : '',
    ws?.ape_code ? `APE : ${ws.ape_code}` : '',
  ].filter(Boolean).join(' - ')

  page.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: PAGE_W - MARGIN, y: 30 }, thickness: 0.3, color: LGRAY })
  page.drawText(footerParts, { x: MARGIN, y: 18, font, size: 7, color: GRAY })

  return pdfDoc.save()
}
```

- [ ] **Étape 3 : Déployer la Edge Function**

```bash
supabase functions deploy generate-pdf --no-verify-jwt
```

- [ ] **Étape 4 : Vérifier**

Tester depuis la console navigateur ou depuis `ApercuCommande` (tâche suivante) :
```js
// Dans la console navigateur (avec session active) :
const { data: { session } } = await supabase.auth.getSession()
const res = await fetch('https://[project-ref].supabase.co/functions/v1/generate-pdf', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ document_type: 'order', document_id: '[une commande id valide]' })
})
const { pdf_url } = await res.json()
console.log(pdf_url) // ouvrir l'URL → vérifier le PDF
```

- [ ] **Étape 5 : Commit**

```bash
git add supabase/functions/generate-pdf/index.ts
git commit -m "feat(pdf): add bon de commande PDF generation for orders"
```

---

## Task 12 : ApercuCommande.jsx — Bouton "Imprimer le bon de commande"

**Fichiers :**
- Modifier : `src/pages/ApercuCommande.jsx`

- [ ] **Étape 1 : Ajouter l'état et la fonction d'impression**

```js
const [printingPDF, setPrintingPDF] = useState(false)

const handlePrintOrder = async () => {
  setPrintingPDF(true)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document_type: 'order', document_id: commandeId }),
    })
    const result = await res.json()
    if (result.pdf_url) {
      window.open(result.pdf_url, '_blank')
    } else {
      toast.error('Erreur génération PDF')
    }
  } catch (err) {
    toast.error('Erreur génération PDF')
  } finally {
    setPrintingPDF(false)
  }
}
```

- [ ] **Étape 2 : Ajouter le bouton dans le JSX**

Dans la zone des boutons d'action (là où se trouve déjà "Générer facture" ou équivalent), ajouter :

```jsx
<button
  onClick={handlePrintOrder}
  disabled={printingPDF}
  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
>
  {printingPDF ? (
    <span className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" />
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
    </svg>
  )}
  Bon de commande
</button>
```

- [ ] **Étape 3 : Vérifier dans le navigateur**

1. Ouvrir une commande existante
2. Cliquer "Bon de commande" → un PDF s'ouvre dans un nouvel onglet
3. Vérifier que le PDF contient : nom du workspace, infos client, lignes produits, éco-participation, dates de livraison, section acompte, section reprise, signatures

- [ ] **Étape 4 : Commit final Phase 1**

```bash
git add src/pages/ApercuCommande.jsx
git commit -m "feat(commandes): add bon de commande print button"
git push
```

---

## Checklist Phase 1 complète

- [ ] Migration v4_001 exécutée dans Supabase
- [ ] Migration v4_002 exécutée dans Supabase
- [ ] variantService.js créé et fonctionnel
- [ ] orderPaymentService.js créé et fonctionnel
- [ ] orderService.js mis à jour
- [ ] Produits.jsx : variantes créables depuis la modal
- [ ] CreerCommande.jsx : variante sélectionnable sur chaque ligne
- [ ] CreerCommande.jsx : section literie (dates / reprise / RGPD / acompte multi-mode)
- [ ] VenteRapide.jsx : picker de variante fonctionnel
- [ ] Settings.jsx : APE code et capital social
- [ ] generate-pdf : type `order` déployé
- [ ] ApercuCommande.jsx : bouton "Bon de commande" fonctionnel
- [ ] Bon de commande imprimé conforme au format réel observé

---

## Prochaines phases (plans séparés)

- **Phase 2** : Contremarques fournisseurs + Planning livraisons + Bon de livraison
- **Phase 3** : SMS automatiques (Brevo) + Avis Google
- **Phase 4** : SAV renforcé (4 types + garanties + échange confort)
- **Phase 5** : Dashboard gérant + Interface livreur mobile + Stats vendeurs
