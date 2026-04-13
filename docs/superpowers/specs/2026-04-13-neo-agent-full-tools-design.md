# Neo Agent — Full Tools (Version Débridée)
**Date :** 2026-04-13
**Statut :** Approuvé

---

## 1. Contexte

Neo est l'assistant IA intégré dans NeoFlow BOS (sidebar flottante). Actuellement il dispose de 7 outils (4 lecture + 3 écriture) et peut uniquement lire des données ou effectuer 3 actions limitées. L'objectif de ce sprint est de lui donner accès à **toutes les actions possibles dans l'application** (32 outils au total) et d'améliorer la carte d'approbation avec un bouton "Autre" permettant de rediriger Neo avec une instruction corrigée.

---

## 2. Périmètre

### Ce qui est dans le scope
- Ajout de 25 nouveaux outils (13 lecture + 12 écriture) dans l'Edge Function `neo-chat`
- Ajout de l'outil navigation `navigate_to` (côté frontend)
- Ajout du bouton "Autre" dans `ActionApprovalCard` avec textarea inline
- Mise à jour du system prompt Neo pour documenter tous les outils
- Mise à jour de l'indicateur d'outil en cours d'exécution (`toolExecuting`)

### Ce qui n'est PAS dans le scope
- Messagerie proactive / rappels (sous-projet B)
- Mémoire / personnalisation (sous-projets C & D)
- Restrictions par rôle (à faire dans un sprint séparé)
- Modification de la logique de crédit / plan Pro

---

## 3. Inventaire complet des outils

### 3.1 Outils LECTURE — exécution automatique (sans approbation)

| Outil | Description | Nouveau |
|-------|-------------|---------|
| `search_orders` | Commandes par numéro/statut/client | ✅ existant |
| `get_order_details` | Détails complets d'une commande (articles, paiements, livraison associée) | 🆕 |
| `get_customer_info` | Fiche client + historique commandes | ✅ existant |
| `search_products` | Produits du catalogue par nom/catégorie | ✅ existant |
| `get_stock_alerts` | Alertes rupture / stock faible | ✅ existant |
| `get_stock_levels` | Niveaux de stock par produit et emplacement | 🆕 |
| `search_invoices` | Factures par client/statut/période | 🆕 |
| `search_quotes` | Devis ouverts ou par client | 🆕 |
| `search_deliveries` | Livraisons par statut/date/livreur assigné | 🆕 |
| `list_sav_tickets` | Tickets SAV ouverts + statuts + priorité | 🆕 |
| `get_financial_summary` | CA encaissé, impayés, paiements sur une période | 🆕 |
| `search_suppliers` | Fournisseurs par nom + leurs produits | 🆕 |
| `search_purchase_orders` | Bons de commande fournisseurs par statut | 🆕 |

### 3.2 Outils ÉCRITURE — approbation utilisateur requise

Chaque outil write inclut sa définition de paramètres complète ci-dessous.

| Outil | Description | Nouveau |
|-------|-------------|---------|
| `update_order_status` | Changer le statut d'une commande | ✅ existant |
| `cancel_order` | Annuler une commande | ✅ existant |
| `create_delivery` | Planifier une livraison pour une commande | ✅ existant |
| `create_order` | Créer une commande (client + liste de produits) | 🆕 |
| `create_customer` | Ajouter un nouveau client | 🆕 |
| `update_customer` | Modifier les informations d'un client existant | 🆕 |
| `create_quote` | Créer un devis (client + articles) | 🆕 |
| `update_quote_status` | Accepter / refuser / convertir un devis en commande | 🆕 |
| `generate_invoice` | Générer une facture depuis une commande existante | 🆕 |
| `record_payment` | Enregistrer un paiement sur une commande | 🆕 |
| `create_sav_ticket` | Créer un ticket SAV lié à une commande | 🆕 |
| `update_sav_status` | Changer le statut d'un ticket SAV | 🆕 |
| `adjust_stock` | Ajuster la quantité de stock d'un produit | 🆕 |
| `update_delivery` | Modifier date / créneau / livreur d'une livraison | 🆕 |
| `create_product` | Ajouter un produit au catalogue | 🆕 |
| `update_product` | Modifier un produit existant (nom, prix, stock min) | 🆕 |
| `create_supplier` | Ajouter un fournisseur | 🆕 |
| `create_purchase_order` | Créer un bon de commande fournisseur | 🆕 |

#### Paramètres détaillés des outils ÉCRITURE nouveaux

```typescript
// create_order
{
  customer_name: string,      // "Prénom Nom" du client existant ou nouveau
  customer_phone?: string,    // téléphone si nouveau client
  items: Array<{
    product_name: string,     // nom du produit (recherche approximative)
    quantity: number,
    unit_price?: number       // si différent du prix catalogue
  }>,
  notes?: string,
  delivery_type?: 'none' | 'delivery' | 'pickup'  // défaut: 'none'
}

// create_customer
{
  first_name: string,
  last_name: string,
  phone?: string,
  email?: string,
  address?: string,
  customer_type?: 'particulier' | 'pro',  // défaut: 'particulier'
  company_name?: string,     // si pro
  notes?: string
}

// update_customer
{
  query: string,             // nom ou téléphone pour identifier le client
  updates: {
    first_name?: string,
    last_name?: string,
    phone?: string,
    email?: string,
    address?: string,
    notes?: string
  }
}

// create_quote
{
  customer_name: string,
  customer_phone?: string,
  items: Array<{
    product_name: string,
    quantity: number,
    unit_price?: number
  }>,
  notes?: string,
  valid_days?: number        // durée de validité en jours, défaut: 30
}

// update_quote_status
{
  quote_number: string,      // ex: "DEV-2026-012"
  action: 'accept' | 'reject' | 'convert_to_order',
  reason?: string
}

// generate_invoice
{
  order_number: string,      // ex: "CMD-2026-042"
  invoice_type: 'standard' | 'deposit'
}

// record_payment
{
  order_number: string,
  amount: number,
  payment_method: 'cash' | 'card' | 'check' | 'transfer' | 'other',
  notes?: string
}

// create_sav_ticket
{
  order_number: string,      // commande liée (requis)
  type: 'retour' | 'reparation' | 'echange' | 'remboursement' | 'reclamation',
  priority: 'basse' | 'normale' | 'haute' | 'urgente',
  description: string,
  items?: Array<{
    product_name: string,
    quantity: number,
    motif: 'produit_manquant' | 'produit_casse' | 'defaut_fabrication' | 'defaut_livraison' | 'erreur_commande' | 'retour_client' | 'autre'
  }>
}

// update_sav_status
{
  ticket_number: string,     // numéro du ticket SAV
  new_status: 'ouvert' | 'en_cours' | 'en_attente' | 'resolu' | 'ferme',
  comment?: string
}

// adjust_stock
{
  product_name: string,      // recherche approximative
  new_quantity: number,      // quantité absolue (pas un delta)
  location_name?: string,    // emplacement, défaut: emplacement principal
  reason?: string
}

// update_delivery
{
  order_number: string,
  updates: {
    scheduled_date?: string, // format YYYY-MM-DD
    time_slot?: string,      // ex: "14h-17h"
    assigned_to_name?: string, // nom du livreur
    notes?: string
  }
}

// create_product
{
  name: string,
  unit_price_ht: number,
  tax_rate?: number,         // défaut: 20
  category?: string,
  description?: string,
  initial_stock?: number,    // défaut: 0
  min_stock?: number         // seuil alerte stock, défaut: 3
}

// update_product
{
  product_name: string,      // recherche approximative
  updates: {
    name?: string,
    unit_price_ht?: number,
    tax_rate?: number,
    category?: string,
    description?: string,
    min_stock?: number
  }
}

// create_supplier
{
  name: string,
  contact_name?: string,
  email?: string,
  phone?: string,
  address?: string,
  notes?: string
}

// create_purchase_order
{
  supplier_name: string,     // recherche approximative
  items: Array<{
    product_name: string,
    quantity: number,
    unit_price?: number
  }>,
  expected_date?: string,    // format YYYY-MM-DD
  notes?: string
}
```

### 3.3 Outil NAVIGATION — exécution automatique côté frontend

| Outil | Description | Nouveau |
|-------|-------------|---------|
| `navigate_to` | Naviguer vers une page et optionnellement une section | 🆕 |

**Paramètres `navigate_to` :**
```json
{
  "path": "/settings",
  "section": "subscription"
}
```
- `path` (requis) : **uniquement** parmi les routes valides listées ci-dessous — Neo ne doit pas inventer de route
- `section` (optionnel) : ID HTML d'une section — le frontend scroll automatiquement

**Routes valides (à inclure dans le system prompt) :**
```
/dashboard, /vente-rapide, /commandes, /commandes/nouvelle,
/factures, /factures/nouvelle, /devis, /devis/nouveau,
/clients, /produits, /stock, /stock/emplacements,
/fournisseurs, /bons-commande/nouveau, /livraisons,
/sav, /sav/nouveau, /dashboard-financier,
/documentation, /settings
```

**Sections disponibles par page :**
```
/settings        → account, workspace, subscription, support
/dashboard       → kpis, actions-rapides
/stock           → alerts, movements
/sav             → open, closed
```

**Comportement si path invalide :** le frontend vérifie que `path` est dans la whitelist avant d'appeler `navigate()`. Si invalide, Neo log une erreur et répond "Je ne connais pas cette page."

---

## 4. UI — Carte d'approbation

### 4.1 Design actuel (conservé tel quel)
La carte `ActionApprovalCard` existante est conservée intégralement : header orange "Neo souhaite effectuer une action", icône, label lisible, détails, bloc monospace des paramètres.

### 4.2 Ajout du bouton "Autre"
Un 3ème bouton "Autre" est ajouté dans la même rangée que Approuver / Annuler.

**Comportement :**
1. Clic "Autre" → affiche un `<textarea>` inline sous les boutons dans la même carte
2. L'utilisateur tape une instruction correctrice (ex: "Le client c'est Dubois pas Gérard")
3. Bouton "Envoyer" **désactivé si textarea vide** (validation inline, pas de message d'erreur)
4. Clic "Envoyer" (texte non vide) → ferme la carte + injecte le message dans le chat avec contexte

**Format du message injecté côté système :**
```
[Action refusée: create_customer — first_name: Gérard, last_name: Martin]
Instruction corrigée : Le client c'est Dubois pas Gérard
```

---

## 5. Architecture technique

### 5.1 Fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `supabase/functions/neo-chat/index.ts` | +25 outils dans `NEO_TOOLS[]`, +9 read dans `executeTool()`, +15 write dans `executeApprovedActionInline()`, system prompt mis à jour, émission events SSE `__navigate` et `tool_executing: null` |
| `src/lib/supabase.js` | `streamNeoChat` : +2 handlers dans le parseur SSE (`__navigate`, `tool_executing: null`) |
| `src/components/NeoChat.jsx` | Bouton "Autre" + textarea dans `ActionApprovalCard`, handler `handleOther()`, handler `navigate_to` dans `onMeta`, clear `toolExecuting` |

### 5.2 Flux navigate_to (précis)

Le protocole SSE existant dans `streamNeoChat` ne parse que `{ t }`, `{ error }`, `{ credits_remaining }`, `{ pending_action }`, `{ tool_executing }`. Il n'y a **pas** d'event `tool_result`. Le fix est d'émettre un event SSE dédié depuis l'Edge Function.

**Côté Edge Function (`executeTool` pour `navigate_to`) :**
```
LLM appelle navigate_to({path, section})
  → Edge Function : navigate_to est dans READ_TOOLS (pas dans APPROVAL_REQUIRED_TOOLS)
  → executeTool('navigate_to', {path, section}) :
      - Vérifie que path est dans VALID_PATHS whitelist
      - Si invalide : retourne string d'erreur texte (pas de navigation)
      - Si valide :
          1. Émet SSE dédié : data: {"__navigate":"/settings","__section":"subscription"}\n\n
          2. Retourne string texte pour le LLM : "Navigation vers /settings effectuée."
  → Le LLM reçoit la confirmation texte et continue sa réponse normalement
```

**Côté `src/lib/supabase.js` :**
```javascript
// Ajouter dans le parseur SSE (ligne ~130) :
if (parsed.__navigate && onMeta) onMeta({ navigate: parsed.__navigate, section: parsed.__section })
if (parsed.tool_executing === null && onMeta) onMeta({ tool_executing: null })
```

**Côté `NeoChat.jsx` (handler `onMeta`) :**
```javascript
if (meta.navigate) {
  navigate(meta.navigate)
  if (meta.section) {
    setTimeout(() => {
      document.getElementById(meta.section)?.scrollIntoView({ behavior: 'smooth' })
    }, 300)
  }
}
if ('tool_executing' in meta && meta.tool_executing === null) {
  setToolExecuting(null)
}
```

### 5.2b Réinitialisation toolExecuting

Actuellement `toolExecuting` est mis à jour mais jamais remis à `null` après qu'un outil termine. Fix : l'Edge Function émet `data: {"tool_executing":null}\n\n` immédiatement après avoir exécuté un outil (read ou write), avant de reprendre le streaming LLM. `streamNeoChat` transmet via `onMeta({ tool_executing: null })` et `NeoChat` appelle `setToolExecuting(null)`.

### 5.3 Flux "Autre"

```
Utilisateur clique "Autre" sur une ActionApprovalCard
  → État local showOtherInput = true dans le composant ActionApprovalCard
  → textarea s'affiche inline sous les boutons dans la même carte
  → Bouton "Envoyer" disabled si textarea.trim() === ''
  → Utilisateur tape son instruction, clique Envoyer
  → handleOther(action, text) dans NeoChat :
      1. setPendingAction(null) — ferme la carte
      2. Construit le message :
         "[Action refusée: <tool_name> — <args_key>: <args_val>, ...]
          Instruction corrigée : <text>"
      3. Appelle sendMessage(builtMessage) — Neo reprend avec ce contexte
```

### 5.4 Paramètres LLM

Les outils read utilisent `tool_choice: "auto"` avec appels immédiats.
Les outils write génèrent une `ActionApprovalCard` et attendent l'approbation utilisateur avant `executeApprovedActionInline()`.
L'outil `navigate_to` est dans `executeTool()` (read path) pour éviter toute carte d'approbation.

---

## 6. Règles d'approbation (pour le system prompt)

```
OUTILS LECTURE → exécution directe, jamais de question à l'utilisateur
OUTILS ÉCRITURE → TOUJOURS appeler l'outil immédiatement, ne JAMAIS demander
                  "tu veux que je fasse X ?" — le système d'approbation gère ça
navigate_to     → exécution directe, pas d'approbation
                  N'utiliser QUE les routes de la liste fournie
```

---

## 7. Séquence d'implémentation

1. **Edge Function** — ajouter les 9 nouveaux read tools dans `executeTool()`, émettre `{"tool_executing":null}` après chaque exécution
2. **Edge Function** — ajouter `navigate_to` dans `executeTool()` : whitelist `VALID_PATHS` + émission event SSE `{"__navigate":path,"__section":section}`
3. **Edge Function** — ajouter les 15 nouveaux write tools dans `executeApprovedActionInline()`
4. **Edge Function** — ajouter les 25 définitions dans `NEO_TOOLS[]`
5. **Edge Function** — mettre à jour `APPROVAL_REQUIRED_TOOLS` set (ajouter les 15 nouveaux write)
6. **Edge Function** — mettre à jour `getActionLabel()` pour les 15 nouveaux write tools
7. **Edge Function** — mettre à jour le system prompt (liste outils + routes valides + règles)
8. **`src/lib/supabase.js`** — ajouter dans `streamNeoChat` : handlers `parsed.__navigate` et `parsed.tool_executing === null`
9. **Frontend `NeoChat.jsx`** — handler `onMeta` : appel `navigate()` + `scrollIntoView()` + `setToolExecuting(null)`
10. **Frontend `NeoChat.jsx`** — `ActionApprovalCard` : état local `showOtherInput`, bouton "Autre", textarea, bouton "Envoyer" disabled si vide
11. **Frontend `NeoChat.jsx`** — `handleOther(action, text)` dans le composant principal
12. **Deploy** — `supabase functions deploy neo-chat --no-verify-jwt`
