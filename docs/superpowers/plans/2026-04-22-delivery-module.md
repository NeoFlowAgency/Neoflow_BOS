# Delivery Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un module livraison premium (système de modules transversal + interface gérant + interface livreur mobile-first + GPS live) dans NeoFlow BOS pour le client Maison de la Literie Rezé.

**Architecture:** Module autonome dans `/src/modules/delivery/`, connecté aux données Supabase existantes (commandes, clients, produits). Deux univers visuels : gérant (dashboard riche, desktop/tablette) et livreur (workflow guidé, mobile-first, gros boutons). Fondation transversale : système de modules activables par workspace.

**Tech Stack:** React 19, Vite, Supabase (Realtime + Storage), Leaflet + React-Leaflet, @dnd-kit/core (kanban), Tailwind CSS v4, Brevo SMS (Edge Function `send-sms` existante)

**Spec de référence:** `docs/superpowers/specs/2026-04-22-delivery-module-design.md`

---

## Phase 1 — Système de modules (fondation transversale)

> Doit être complète avant toute autre phase. Touche WorkspaceContext, Sidebar, WorkspaceOnboarding, Settings.

---

### Task 1 : SQL — colonne `modules` sur workspaces

**Files:**
- Create: `sql/v11_001_modules_system.sql`

- [ ] **Créer la migration SQL**

```sql
-- sql/v11_001_modules_system.sql

-- Ajouter colonne modules JSONB avec valeurs par défaut (tous actifs pour workspaces existants)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '{
    "livraisons": true,
    "ventes_rapides": true,
    "devis": true,
    "stock": true,
    "fournisseurs": true,
    "sav": true,
    "commandes": true
  }'::jsonb;

-- Colonne toggle SMS livreur en route
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_driver_en_route_enabled BOOLEAN NOT NULL DEFAULT false;

-- Clé template SMS livreur en route (stockée comme les autres templates)
-- La colonne sms_template_driver_en_route est ajoutée via la mécanique existante de Settings
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_template_driver_en_route TEXT DEFAULT 'Bonjour {prenom}, votre livreur est en route depuis {magasin}. Arrivée estimée : {heure_estimee}.';

-- ── SMS J-1 rappel livraison (pg_cron) ───────────────────────────────────────
-- Envoie un SMS de rappel la veille à 9h pour chaque livraison planifiée
-- Nécessite l'extension pg_cron (déjà activée dans ce projet, voir v3_005_cron_jobs.sql)
-- La logique d'envoi appelle une Edge Function ou une RPC — à implémenter dans une Edge Function dédiée
-- Pour l'instant : créer la colonne de tracking + documenter le cron
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sms_template_delivery_reminder TEXT
    DEFAULT 'Bonjour {prenom}, rappel : votre livraison {magasin} est prévue le {date} ({creneau}). À demain !';

-- Colonne pour éviter les doubles envois
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS sms_reminder_sent BOOLEAN NOT NULL DEFAULT false;

-- Cron J-1 à 9h (UTC+2 = 7h UTC) — appelle une RPC qui envoie les SMS
-- À activer après déploiement de la RPC send_delivery_reminders()
-- SELECT cron.schedule('delivery-reminders', '0 7 * * *', $$SELECT send_delivery_reminders()$$);
```

- [ ] **Exécuter dans Supabase SQL Editor** (Production + local si dev local actif)

- [ ] **Vérifier** : `SELECT id, name, modules FROM workspaces LIMIT 3;` — doit retourner l'objet JSON avec tous les modules à `true` pour les workspaces existants.

- [ ] **Commit**
```bash
git add sql/v11_001_modules_system.sql
git commit -m "sql: ajout colonne modules JSONB sur workspaces + SMS livreur en route"
```

---

### Task 2 : WorkspaceContext — `isModuleEnabled()`

**Files:**
- Modify: `src/contexts/WorkspaceContext.jsx`

- [ ] **Ajouter `isModuleEnabled` dans le contexte**

Dans `WorkspaceContext.jsx`, ajouter la fonction helper après les helpers plan existants (~ligne 114) :

```js
// Modules activés
const isModuleEnabled = (key) => {
  const modules = currentWorkspace?.modules
  if (!modules) return true // rétrocompat : si pas de modules, tout actif
  return modules[key] === true
}
```

- [ ] **Exposer dans le Provider**

Dans l'objet value du `WorkspaceContext.Provider` (après `isLivreur`), ajouter :

```js
isModuleEnabled,
modules: currentWorkspace?.modules ?? {},
```

- [ ] **Tester manuellement** : dans la console browser, `useWorkspace().isModuleEnabled('livraisons')` doit retourner `true`.

- [ ] **Commit**
```bash
git add src/contexts/WorkspaceContext.jsx
git commit -m "feat(context): ajouter isModuleEnabled() dans WorkspaceContext"
```

---

### Task 3 : Sidebar — masquage conditionnel par module

**Files:**
- Modify: `src/components/Sidebar.jsx`

- [ ] **Importer `isModuleEnabled` depuis le contexte**

Dans la destructuration de `useWorkspace()` (~ligne 24) :
```js
const { currentWorkspace, workspaces, switchWorkspace, role, planType, isModuleEnabled } = useWorkspace()
```

- [ ] **Identifier les sections à gater** dans `Sidebar.jsx`

Chercher les sections correspondant à chaque module et les entourer d'une condition :

| Module key | Éléments sidebar à masquer |
|------------|--------------------------|
| `livraisons` | Lien `/livraisons`, `/livraisons/ma-tournee`, `/carte-livraisons` |
| `ventes_rapides` | Lien `/vente-rapide` |
| `devis` | Liens `/devis` |
| `stock` | Liens `/stock`, `/stock/emplacements` |
| `fournisseurs` | Liens `/fournisseurs`, bons de commande |
| `sav` | Liens `/sav` |
| `commandes` | Liens `/commandes` (si désactivé standalone — rare) |

Pattern à appliquer sur chaque section concernée :
```jsx
{isModuleEnabled('livraisons') && (
  <NavLink to="/livraisons">...</NavLink>
)}
```

- [ ] **Tester** : dans Settings, désactiver un module (quand Settings sera fait) → section disparaît de la sidebar. Pour test immédiat, modifier temporairement `modules` en DB via SQL Editor.

- [ ] **Commit**
```bash
git add src/components/Sidebar.jsx
git commit -m "feat(sidebar): masquage conditionnel des sections par module"
```

---

### Task 4 : WorkspaceOnboarding — étape sélection des modules

**Files:**
- Modify: `src/pages/WorkspaceOnboarding.jsx`

- [ ] **Ajouter l'étape modules dans `STEPS`**

Dans le tableau `STEPS` (~ligne 13), ajouter une étape avant "Abonnement" :
```js
{ id: 5, label: 'Modules' },
{ id: 6, label: 'Abonnement' },
```
(décaler l'id de l'abonnement de 5 → 6)

- [ ] **Définir la liste des modules disponibles** en haut du fichier :

```js
const AVAILABLE_MODULES = [
  {
    key: 'livraisons',
    label: 'Livraisons',
    description: 'Planification, GPS live, interface livreur mobile',
    icon: '🚛',
    requires: ['commandes'],
  },
  {
    key: 'commandes',
    label: 'Commandes',
    description: 'Gestion des commandes clients',
    icon: '📋',
    requires: [],
  },
  {
    key: 'ventes_rapides',
    label: 'Ventes rapides',
    description: 'Point de vente rapide en magasin',
    icon: '⚡',
    requires: [],
  },
  {
    key: 'devis',
    label: 'Devis',
    description: 'Création et suivi des devis clients',
    icon: '📄',
    requires: [],
  },
  {
    key: 'stock',
    label: 'Stock',
    description: 'Gestion des niveaux de stock et emplacements',
    icon: '📦',
    requires: [],
  },
  {
    key: 'fournisseurs',
    label: 'Fournisseurs',
    description: 'Fournisseurs et bons de commande',
    icon: '🏭',
    requires: ['stock'],
  },
  {
    key: 'sav',
    label: 'SAV',
    description: 'Suivi du service après-vente',
    icon: '🔧',
    requires: [],
  },
]
```

- [ ] **Ajouter `selectedModules` dans le state du formulaire**

```js
const [selectedModules, setSelectedModules] = useState({
  livraisons: true, commandes: true, ventes_rapides: true,
  devis: true, stock: true, fournisseurs: true, sav: true,
})

const toggleModule = (key) => {
  setSelectedModules(prev => {
    const next = { ...prev, [key]: !prev[key] }
    // Activer les dépendances automatiquement
    const mod = AVAILABLE_MODULES.find(m => m.key === key)
    if (!prev[key] && mod?.requires?.length) {
      mod.requires.forEach(dep => { next[dep] = true })
    }
    return next
  })
}
```

- [ ] **Créer l'UI de l'étape modules** (rendu conditionnel sur `step === 5`)

Grid de cartes avec toggle par module. Chaque carte : icône, label, description, toggle on/off. Si un module a des dépendances activées automatiquement, afficher un badge "Active aussi : X".

Design : cartes avec border, fond blanc, toggle à droite, état désactivé = fond gris + texte grisé. Taille identique à celle des autres étapes.

- [ ] **Passer `modules: selectedModules` lors de la création du workspace**

Dans la fonction `handleSubmit` / `createWorkspace()`, inclure `modules: selectedModules` dans les données envoyées.

- [ ] **Mettre à jour `workspaceService.js`** si `createWorkspace` ne passe pas déjà toutes les colonnes au INSERT.

- [ ] **Commit**
```bash
git add src/pages/WorkspaceOnboarding.jsx src/services/workspaceService.js
git commit -m "feat(onboarding): étape sélection des modules à la création du workspace"
```

---

### Task 5 : Settings — onglet Modules

**Files:**
- Modify: `src/pages/Settings.jsx`

- [ ] **Ajouter un onglet "Modules"** dans la liste des onglets Settings (visible uniquement pour `isOwner`)

- [ ] **Créer le contenu de l'onglet** : même grid de cartes que l'onboarding, avec toggle + sauvegarde immédiate via `supabase.from('workspaces').update({ modules: newModules }).eq('id', workspace.id)`.

- [ ] **Après sauvegarde**, appeler `refreshWorkspaces()` du contexte pour que la sidebar se mette à jour instantanément.

- [ ] **Dépendances** : même logique que l'onboarding — activer Livraisons active Commandes automatiquement. Afficher un message "Ce module requiert : Commandes (activé automatiquement)".

- [ ] **Toggle SMS livreur en route** dans l'onglet SMS Templates existant :

```jsx
<label>
  <input type="checkbox"
    checked={workspace?.sms_driver_en_route_enabled ?? false}
    onChange={e => updateWorkspace({ sms_driver_en_route_enabled: e.target.checked })}
  />
  Envoyer un SMS au client quand le livreur est en route
</label>
```

Avec champ d'édition du template `sms_template_driver_en_route` juste en dessous (masqué si toggle off).

- [ ] **Commit**
```bash
git add src/pages/Settings.jsx
git commit -m "feat(settings): onglet Modules + toggle SMS livreur en route"
```

---

## Phase 2 — Base de données livraison

---

### Task 6 : SQL — tables delivery + colonnes deliveries

**Files:**
- Create: `sql/v11_002_delivery_module.sql`

- [ ] **Créer la migration**

```sql
-- sql/v11_002_delivery_module.sql

-- ── Véhicules ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  capacity_items  INT DEFAULT 10,
  available       BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE delivery_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_vehicles: workspace members"
  ON delivery_vehicles FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

-- ── Positions GPS livreurs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_driver_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  driver_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_id  UUID REFERENCES deliveries(id) ON DELETE SET NULL,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  heading      FLOAT DEFAULT 0,
  is_moving    BOOLEAN DEFAULT false,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_time
  ON delivery_driver_locations (driver_id, recorded_at DESC);

ALTER TABLE delivery_driver_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_locations: workspace members"
  ON delivery_driver_locations FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_users WHERE user_id = auth.uid()
  ));

-- Activer Realtime sur cette table
ALTER PUBLICATION supabase_realtime ADD TABLE delivery_driver_locations;

-- ── Enrichissement table deliveries ──────────────────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS execution_type       TEXT NOT NULL DEFAULT 'internal'
                                                  CHECK (execution_type IN ('internal', 'provider')),
  ADD COLUMN IF NOT EXISTS vehicle_id           UUID REFERENCES delivery_vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_location      TEXT DEFAULT 'store'
                                                  CHECK (pickup_location IN ('store', 'depot')),
  ADD COLUMN IF NOT EXISTS driver_notes         TEXT,
  ADD COLUMN IF NOT EXISTS proof_photo_url      TEXT,
  ADD COLUMN IF NOT EXISTS signature_url        TEXT,
  ADD COLUMN IF NOT EXISTS signature_obtained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS problem_type         TEXT
                                                  CHECK (problem_type IN ('absent', 'damaged', 'refused', 'other')),
  ADD COLUMN IF NOT EXISTS problem_description  TEXT,
  ADD COLUMN IF NOT EXISTS problem_reported_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS loading_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS departed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrived_at_client_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_review_sent      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_en_route_sent    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_lat         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lng         DOUBLE PRECISION;

-- Normaliser les valeurs de status existantes
-- Valeurs valides : a_planifier, planifiee, en_route, chez_client, livree, probleme
-- (les anciennes valeurs en_cours / livree doivent être migrées)
UPDATE deliveries SET status = 'en_route'   WHERE status = 'en_cours';
UPDATE deliveries SET status = 'a_planifier' WHERE status IS NULL;
```

- [ ] **Exécuter dans Supabase SQL Editor**

- [ ] **Vérifier** :
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'deliveries' AND column_name IN ('execution_type', 'vehicle_id', 'signature_url');
-- Doit retourner 3 lignes

SELECT COUNT(*) FROM delivery_vehicles; -- 0
SELECT COUNT(*) FROM delivery_driver_locations; -- 0
```

- [ ] **Commit**
```bash
git add sql/v11_002_delivery_module.sql
git commit -m "sql: tables delivery_vehicles, delivery_driver_locations + colonnes deliveries"
```

---

## Phase 3 — Service & Hooks

---

### Task 7 : `deliveryService.js`

**Files:**
- Create: `src/modules/delivery/services/deliveryService.js`

- [ ] **Créer le dossier et le service**

```js
// src/modules/delivery/services/deliveryService.js
import { supabase } from '../../../lib/supabase'

// ── Livraisons ────────────────────────────────────────────────────────────────

// Note: assigned_to est une FK vers auth.users(id), pas workspace_users.
// On récupère le profil dans une query séparée via getWorkspaceMembers().
const DELIVERY_SELECT = `
  *,
  order:orders(
    id, order_number, remaining_amount,
    old_furniture_option,
    customer:customers(id, first_name, last_name, phone, address),
    order_items(id, quantity, product:products(id, name))
  ),
  vehicle:delivery_vehicles(id, name)
`

export async function listDeliveries(workspaceId, filters = {}) {
  let q = supabase
    .from('deliveries')
    .select(DELIVERY_SELECT)
    .eq('workspace_id', workspaceId)
    .order('scheduled_date', { ascending: true })

  if (filters.status)       q = q.eq('status', filters.status)
  if (filters.assignedTo)   q = q.eq('assigned_to', filters.assignedTo)
  if (filters.date)         q = q.eq('scheduled_date', filters.date)
  if (filters.statuses)     q = q.in('status', filters.statuses)

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getDelivery(id) {
  const { data, error } = await supabase
    .from('deliveries')
    .select(DELIVERY_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function updateDelivery(id, updates) {
  const { data, error } = await supabase
    .from('deliveries')
    .update(updates)
    .eq('id', id)
    .select(DELIVERY_SELECT)
    .single()
  if (error) throw error
  return data
}

// Transition de statut avec horodatage automatique
export async function transitionDelivery(id, newStatus) {
  const timestamps = {
    en_route:    { departed_at: new Date().toISOString() },
    chez_client: { arrived_at_client_at: new Date().toISOString() },
    livree:      {},
    probleme:    { problem_reported_at: new Date().toISOString() },
  }
  return updateDelivery(id, { status: newStatus, ...(timestamps[newStatus] ?? {}) })
}

export async function confirmLoading(id) {
  return updateDelivery(id, { loading_confirmed_at: new Date().toISOString() })
}

export async function signDelivery(id, signatureUrl) {
  return updateDelivery(id, {
    signature_url: signatureUrl,
    signature_obtained_at: new Date().toISOString(),
  })
}

export async function reportProblem(id, type, description) {
  return updateDelivery(id, {
    status: 'probleme',
    problem_type: type,
    problem_description: description,
    problem_reported_at: new Date().toISOString(),
  })
}

export async function completeDelivery(id, { photoUrl, signatureUrl } = {}) {
  const updates = { status: 'livree' }
  if (photoUrl)     updates.proof_photo_url = photoUrl
  if (signatureUrl) updates.signature_url = signatureUrl
  return updateDelivery(id, updates)
}

// ── Véhicules ────────────────────────────────────────────────────────────────

export async function listVehicles(workspaceId) {
  const { data, error } = await supabase
    .from('delivery_vehicles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name')
  if (error) throw error
  return data
}

export async function createVehicle(workspaceId, payload) {
  const { data, error } = await supabase
    .from('delivery_vehicles')
    .insert({ workspace_id: workspaceId, ...payload })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateVehicle(id, updates) {
  const { data, error } = await supabase
    .from('delivery_vehicles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteVehicle(id) {
  const { error } = await supabase.from('delivery_vehicles').delete().eq('id', id)
  if (error) throw error
}

// ── Upload photo / signature ─────────────────────────────────────────────────

export async function uploadDeliveryPhoto(deliveryId, file) {
  const ext = file.name.split('.').pop()
  const path = `delivery-photos/${deliveryId}/proof-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('deliveries').upload(path, file, { upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('deliveries').getPublicUrl(path)
  return publicUrl
}

export async function uploadSignature(deliveryId, dataUrl) {
  const blob = await fetch(dataUrl).then(r => r.blob())
  const path = `delivery-signatures/${deliveryId}/signature.png`
  const { error } = await supabase.storage.from('deliveries').upload(path, blob, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('deliveries').getPublicUrl(path)
  return publicUrl
}
```

- [ ] **Vérifier** : importer dans la console et appeler `listDeliveries(workspaceId)` — doit retourner un tableau (vide ou non).

- [ ] **Commit**
```bash
git add src/modules/delivery/services/deliveryService.js
git commit -m "feat(delivery): deliveryService.js — CRUD livraisons, véhicules, upload"
```

---

### Task 8 : `useDeliveries` hook

**Files:**
- Create: `src/modules/delivery/hooks/useDeliveries.js`

- [ ] **Créer le hook**

```js
// src/modules/delivery/hooks/useDeliveries.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { listDeliveries } from '../services/deliveryService'

export function useDeliveries(workspaceId, filters = {}) {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Stabiliser les filtres pour éviter les re-renders infinis
  // L'appelant doit passer des valeurs primitives ou des strings, pas des objets inline
  const statusKey   = filters.status    ?? ''
  const assignedKey = filters.assignedTo ?? ''
  const dateKey     = filters.date      ?? ''
  const statusesKey = (filters.statuses ?? []).join(',')

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      setLoading(true)
      setError(null)
      const data = await listDeliveries(workspaceId, filters)
      setDeliveries(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, statusKey, assignedKey, dateKey, statusesKey])

  useEffect(() => { load() }, [load])

  // Supabase Realtime — recharger si une livraison change
  useEffect(() => {
    if (!workspaceId) return
    const channel = supabase
      .channel(`deliveries-${workspaceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deliveries',
        filter: `workspace_id=eq.${workspaceId}`,
      }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [workspaceId, load])

  return { deliveries, loading, error, refresh: load }
}
```

- [ ] **Commit**
```bash
git add src/modules/delivery/hooks/useDeliveries.js
git commit -m "feat(delivery): useDeliveries hook avec Supabase Realtime"
```

---

### Task 9 : `useDriverLocation` hook

**Files:**
- Create: `src/modules/delivery/hooks/useDriverLocation.js`

- [ ] **Créer le hook**

```js
// src/modules/delivery/hooks/useDriverLocation.js
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'

// Côté livreur : partage sa position
export function useShareLocation(workspaceId, driverId, deliveryId, active) {
  const watchRef = useRef(null)
  const prevPos = useRef(null)

  const stop = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!active || !workspaceId || !driverId) return stop()

    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const isMoving = prevPos.current
          ? haversine(prevPos.current, { lat, lng }) > 0.01 // > 10m
          : false

        prevPos.current = { lat, lng }

        await supabase.from('delivery_driver_locations').insert({
          workspace_id: workspaceId,
          driver_id: driverId,
          delivery_id: deliveryId ?? null,
          lat,
          lng,
          heading: pos.coords.heading ?? 0,
          is_moving: isMoving,
        })
      },
      (err) => console.warn('[GPS]', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      // maximumAge: 0 force une mesure fraîche à chaque appel (cadence ~15s via watchPosition)
    )

    return stop
  }, [active, workspaceId, driverId, deliveryId])
}

// Côté gérant : écoute les positions de tous les livreurs en temps réel
export function useWatchDrivers(workspaceId) {
  const [positions, setPositions] = useState({}) // { driverId: { lat, lng, heading, is_moving, delivery_id, recorded_at } }

  useEffect(() => {
    if (!workspaceId) return

    // Charger les positions actuelles (< 5 min)
    const loadCurrent = async () => {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('delivery_driver_locations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .gte('recorded_at', cutoff)
        .order('recorded_at', { ascending: false })

      if (data) {
        const map = {}
        data.forEach(row => {
          if (!map[row.driver_id]) map[row.driver_id] = row
        })
        setPositions(map)
      }
    }

    loadCurrent()

    const channel = supabase
      .channel(`driver-locations-${workspaceId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'delivery_driver_locations',
        filter: `workspace_id=eq.${workspaceId}`,
      }, ({ new: row }) => {
        setPositions(prev => ({ ...prev, [row.driver_id]: row }))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [workspaceId])

  return positions
}

// Distance Haversine en km entre deux points {lat, lng}
function haversine(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(s))
}

export { haversine }
```

- [ ] **Commit**
```bash
git add src/modules/delivery/hooks/useDriverLocation.js
git commit -m "feat(delivery): useShareLocation + useWatchDrivers hooks GPS Realtime"
```

---

### Task 10 : `useDeliveryAlerts` hook

**Files:**
- Create: `src/modules/delivery/hooks/useDeliveryAlerts.js`

- [ ] **Créer le hook**

```js
// src/modules/delivery/hooks/useDeliveryAlerts.js
import { useMemo } from 'react'
import { haversine } from './useDriverLocation'

/**
 * Retourne les alertes actives basées sur les livraisons et positions GPS.
 *
 * Alerte "livreur bloqué" : statut=en_route, immobile > 10 min, distance client > 500m
 * Alerte "non planifiée" : statut=a_planifier, created_at > X jours
 */
export function useDeliveryAlerts(deliveries, driverPositions, thresholdDays = 3) {
  const alerts = useMemo(() => {
    const result = []
    const now = Date.now()
    const TEN_MIN = 10 * 60 * 1000

    deliveries.forEach(delivery => {
      // Livraisons non planifiées depuis trop longtemps
      if (delivery.status === 'a_planifier') {
        const created = new Date(delivery.created_at).getTime()
        const days = (now - created) / (1000 * 60 * 60 * 24)
        if (days >= thresholdDays) {
          result.push({
            type: 'unplanned',
            delivery,
            message: `Non planifiée depuis ${Math.floor(days)} jours`,
          })
        }
      }

      // Livreur bloqué en route
      if (delivery.status === 'en_route' && delivery.assigned_to) {
        const pos = driverPositions[delivery.assigned_to]
        if (!pos) return

        const lastUpdate = new Date(pos.recorded_at).getTime()
        const isStale = (now - lastUpdate) > TEN_MIN
        const isStationary = !pos.is_moving

        if (isStale && isStationary) {
          // Calculer distance au client
          const client = delivery.order?.customer
          if (client?.lat && client?.lng && pos.lat && pos.lng) {
            const dist = haversine(
              { lat: pos.lat, lng: pos.lng },
              { lat: client.lat, lng: client.lng }
            )
            if (dist > 0.5) { // > 500m
              result.push({
                type: 'stuck',
                delivery,
                driverId: delivery.assigned_to,
                message: `Livreur immobile depuis > 10 min à ${(dist * 1000).toFixed(0)}m du client`,
              })
            }
          }
        }
      }
    })

    return result
  }, [deliveries, driverPositions, thresholdDays])

  return alerts
}
```

- [ ] **Commit**
```bash
git add src/modules/delivery/hooks/useDeliveryAlerts.js
git commit -m "feat(delivery): useDeliveryAlerts — alertes non planifiées + livreur bloqué"
```

---

## Phase 4 — Composants partagés

---

### Task 11 : `DeliveryStatusBadge` + `DeliveryTimeline`

**Files:**
- Create: `src/modules/delivery/components/shared/DeliveryStatusBadge.jsx`
- Create: `src/modules/delivery/components/shared/DeliveryTimeline.jsx`

- [ ] **DeliveryStatusBadge**

```jsx
// src/modules/delivery/components/shared/DeliveryStatusBadge.jsx
const CONFIG = {
  a_planifier: { label: 'À planifier',   bg: 'bg-gray-100',   text: 'text-gray-700'   },
  planifiee:   { label: 'Planifiée',     bg: 'bg-blue-100',   text: 'text-blue-700'   },
  en_route:    { label: 'En route',      bg: 'bg-amber-100',  text: 'text-amber-700'  },
  chez_client: { label: 'Chez le client',bg: 'bg-orange-100', text: 'text-orange-700' },
  livree:      { label: 'Livrée',        bg: 'bg-green-100',  text: 'text-green-700'  },
  probleme:    { label: 'Problème',      bg: 'bg-red-100',    text: 'text-red-700'    },
}

export default function DeliveryStatusBadge({ status, size = 'sm' }) {
  const cfg = CONFIG[status] ?? CONFIG.a_planifier
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${padding} ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}
```

- [ ] **DeliveryTimeline** (affiche les horodatages d'une livraison en cours)

```jsx
// src/modules/delivery/components/shared/DeliveryTimeline.jsx
function fmt(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const STEPS = [
  { key: 'loading_confirmed_at', label: 'Chargement confirmé' },
  { key: 'departed_at',          label: 'Départ' },
  { key: 'arrived_at_client_at', label: 'Arrivée client' },
  { key: 'signature_obtained_at',label: 'Signature' },
]

export default function DeliveryTimeline({ delivery }) {
  return (
    <ol className="relative border-l border-gray-200 space-y-4 pl-4">
      {STEPS.map(step => {
        const time = fmt(delivery[step.key])
        return (
          <li key={step.key} className="flex items-center gap-3">
            <span className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 ${
              time ? 'bg-[#313ADF] border-[#313ADF]' : 'bg-white border-gray-300'
            }`} />
            <span className={`text-sm ${time ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
              {step.label}
            </span>
            {time && <span className="ml-auto text-xs text-gray-500">{time}</span>}
          </li>
        )
      })}
    </ol>
  )
}
```

- [ ] **Commit**
```bash
git add src/modules/delivery/components/shared/
git commit -m "feat(delivery): composants partagés DeliveryStatusBadge + DeliveryTimeline"
```

---

## Phase 5 — Interface livreur (mobile-first)

> Design : tout doit être utilisable d'une main. Boutons minimum 48px de hauteur. Texte lisible en plein soleil.

---

### Task 12 : `SignatureCanvas`

**Files:**
- Create: `src/modules/delivery/components/driver/SignatureCanvas.jsx`

- [ ] **Créer le composant** (canvas tactile pour signature client)

Le composant expose une API simple : `onSave(dataUrl)` et `onCancel`. Supporte touch et souris. Bouton "Effacer" pour recommencer.

Récupérer le code de `LivraisonLivreur.jsx` (il y a déjà un `SignatureCanvas` existant) et l'adapter. Vérifier que `getPos` gère correctement les événements touch (`e.touches[0]`) et souris (`e`).

UI : fond blanc, border arrondie, instruction "Le client signe ici" en filigrane si vide, bouton "Valider la signature" en bleu plein, bouton "Recommencer" en outline.

- [ ] **Commit**
```bash
git add src/modules/delivery/components/driver/SignatureCanvas.jsx
git commit -m "feat(delivery): SignatureCanvas tactile pour signature client"
```

---

### Task 13 : `PhotoCapture`

**Files:**
- Create: `src/modules/delivery/components/driver/PhotoCapture.jsx`

- [ ] **Créer le composant**

```jsx
// src/modules/delivery/components/driver/PhotoCapture.jsx
import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'

export default function PhotoCapture({ onCapture, onSkip }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    onCapture(file)
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {preview ? (
        <div className="space-y-3">
          <img src={preview} alt="Preuve" className="w-full rounded-xl object-cover max-h-64" />
          <button
            onClick={() => { setPreview(null); inputRef.current?.click() }}
            className="w-full py-3 border border-gray-300 rounded-xl text-gray-600 text-sm"
          >
            Reprendre la photo
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full py-6 border-2 border-dashed border-gray-300 rounded-xl
                     flex flex-col items-center gap-2 text-gray-500 active:bg-gray-50"
        >
          <Camera size={32} />
          <span className="text-sm font-medium">Prendre une photo de preuve</span>
          <span className="text-xs text-gray-400">Optionnel</span>
        </button>
      )}

      <button onClick={onSkip} className="w-full py-3 text-gray-500 text-sm underline">
        Passer cette étape
      </button>
    </div>
  )
}
```

- [ ] **Commit**
```bash
git add src/modules/delivery/components/driver/PhotoCapture.jsx
git commit -m "feat(delivery): PhotoCapture — capture caméra native mobile"
```

---

### Task 14 : `PaymentCapture`

**Files:**
- Create: `src/modules/delivery/components/driver/PaymentCapture.jsx`

- [ ] **Créer le composant**

Affiche le montant restant à encaisser. Deux boutons : Espèces / Chèque. Champ montant pré-rempli. Bouton "Confirmer l'encaissement" → appelle `onPayment({ method, amount })`. Bouton "Aucun paiement ce soir" si le client reporte.

```jsx
// src/modules/delivery/components/driver/PaymentCapture.jsx
import { useState } from 'react'
import { Banknote, FileText } from 'lucide-react'

export default function PaymentCapture({ remainingAmount, onPayment, onSkip }) {
  const [method, setMethod] = useState(null)   // 'cash' | 'check'
  const [amount, setAmount]   = useState(remainingAmount?.toFixed(2) ?? '')

  const canConfirm = method && parseFloat(amount) > 0

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
            className="w-full text-2xl font-semibold text-center border border-gray-300
                       rounded-xl py-3 focus:outline-none focus:border-[#313ADF]"
            step="0.01"
            min="0"
          />
        </div>
      )}

      <button
        disabled={!canConfirm}
        onClick={() => onPayment({ method, amount: parseFloat(amount) })}
        className="w-full py-4 bg-[#313ADF] text-white rounded-xl font-semibold text-lg
                   disabled:opacity-40 disabled:cursor-not-allowed active:bg-[#2830c0]"
      >
        Confirmer l'encaissement
      </button>

      <button onClick={onSkip} className="w-full py-3 text-gray-500 text-sm underline">
        Aucun paiement ce soir
      </button>
    </div>
  )
}
```

- [ ] **Commit**
```bash
git add src/modules/delivery/components/driver/PaymentCapture.jsx
git commit -m "feat(delivery): PaymentCapture — encaissement espèces/chèque"
```

---

### Task 15 : `DriverHome` — Ma journée

**Files:**
- Create: `src/modules/delivery/components/driver/DriverHome.jsx`

- [ ] **Créer le composant**

Affiche la liste des livraisons du jour assignées au livreur. Design mobile-first.

Structure :
- En-tête : date du jour, compteur "X livraisons aujourd'hui"
- Bouton "Démarrer ma tournée" (si tournée non démarrée) / "Tournée en cours 🟢" avec bandeau GPS actif
- Liste de cartes de livraison triées par heure prévue :
  - Numéro d'ordre (1, 2, 3…)
  - Nom client + adresse
  - Créneau horaire
  - Produits (liste courte)
  - Badges : "Reprise" (si reprise old matelas), "Reste Xh€" (si paiement)
  - Statut actuel
  - Bouton "Commencer" → ouvre le workflow

Props : `deliveries`, `tourneeActive`, `onStartTournee`, `onStopTournee`, `onOpenDelivery(delivery)`

- [ ] **Commit**
```bash
git add src/modules/delivery/components/driver/DriverHome.jsx
git commit -m "feat(delivery): DriverHome — liste journée livreur mobile-first"
```

---

### Task 16 : `DeliveryWorkflow` — workflow étape par étape

**Files:**
- Create: `src/modules/delivery/components/driver/DeliveryWorkflow.jsx`

- [ ] **Créer le composant**

C'est le cœur de l'interface livreur. Un wizard guidé en 5 étapes.

**State :**
```js
const STEPS = ['preparation', 'en_route', 'chez_client', 'finalisation', 'termine']
const [step, setStep] = useState('preparation')
const [loading, setLoading] = useState(false)
const [photoFile, setPhotoFile] = useState(null)
const [signatureDataUrl, setSignatureDataUrl] = useState(null)
```

**Étape 1 — Préparation :**
- Lieu de chargement : badge "Magasin" ou "Dépôt" avec adresse
- Liste des produits à charger (depuis `delivery.order.order_items`)
- Checkboxes par produit
- CTA "Tout est chargé → Départ" (actif si toutes cases cochées)
- Action : `confirmLoading(delivery.id)` + `transitionDelivery(delivery.id, 'en_route')` + SMS en route (si activé)

**Étape 2 — En route :**
- 3 gros boutons plein écran :
  - 🗺️ Naviguer → `window.open('https://www.google.com/maps/dir/?api=1&destination=ADRESSE')`
  - 📞 Appeler → `window.open('tel:NUMERO')`
  - ✅ Je suis arrivé → `transitionDelivery(delivery.id, 'chez_client')`
- Bandeau en haut "GPS actif" (si tournée démarrée)

**Étape 3 — Chez le client :**
- Checklist produits déposés/installés
- Si `delivery.order?.old_furniture_option === 'reprise'` : checkbox "Ancien matelas récupéré" (ce champ vient de la commande, pas de la livraison)
- CTA "Installation terminée"

**Étape 4 — Finalisation :**
- `SignatureCanvas` → onSave(dataUrl) → store en state
- `PhotoCapture` → onCapture(file) → store en state
- Si `delivery.order.remaining_amount > 0` : `PaymentCapture`
- Bouton "⚠️ Signaler un problème" (ouvre modal type + description)
- CTA principal "Livraison terminée ✅"
- Action : upload photo + signature → `completeDelivery()` + déclencher SMS review si pas de problème

**Étape 5 — Terminé :**
- Écran de confirmation avec checkmark animé
- Bouton "Retour à ma journée"

**Modal problème :**
- 4 types : Client absent / Article endommagé / Refus / Autre
- Champ description libre
- Bouton "Signaler" → `reportProblem(id, type, description)` — PAS de SMS review envoyé

- [ ] **Commit**
```bash
git add src/modules/delivery/components/driver/DeliveryWorkflow.jsx
git commit -m "feat(delivery): DeliveryWorkflow — wizard 5 étapes livreur mobile"
```

---

### Task 17 : `DriverPage` — page route livreur

**Files:**
- Create: `src/modules/delivery/pages/DriverPage.jsx`

- [ ] **Créer la page**

```jsx
// src/modules/delivery/pages/DriverPage.jsx
import { useState } from 'react'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { useDeliveries } from '../hooks/useDeliveries'
import { useShareLocation } from '../hooks/useDriverLocation'
import DriverHome from '../components/driver/DriverHome'
import DeliveryWorkflow from '../components/driver/DeliveryWorkflow'

export default function DriverPage() {
  const { workspace, role } = useWorkspace()
  const [currentUserId, setCurrentUserId] = useState(null)
  const [tourneeActive, setTourneeActive] = useState(false)
  const [activeDelivery, setActiveDelivery] = useState(null)

  // Charger l'ID du livreur connecté
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)
    })
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const { deliveries, refresh } = useDeliveries(workspace?.id, {
    assignedTo: currentUserId,
    date: today,
  })

  // Partage GPS actif uniquement si tournée démarrée
  const activeDeliveryId = activeDelivery?.id ?? null
  useShareLocation(workspace?.id, currentUserId, activeDeliveryId, tourneeActive)

  if (activeDelivery) {
    return (
      <DeliveryWorkflow
        delivery={activeDelivery}
        onClose={() => { setActiveDelivery(null); refresh() }}
        workspaceId={workspace?.id}
      />
    )
  }

  return (
    <DriverHome
      deliveries={deliveries}
      tourneeActive={tourneeActive}
      onStartTournee={() => setTourneeActive(true)}
      onStopTournee={() => setTourneeActive(false)}
      onOpenDelivery={setActiveDelivery}
    />
  )
}
```

- [ ] **Commit**
```bash
git add src/modules/delivery/pages/DriverPage.jsx
git commit -m "feat(delivery): DriverPage — page route livreur avec GPS lifecycle"
```

---

## Phase 6 — Interface gérant

---

### Task 18 : `DeliveryDashboard` — bandeau KPIs

**Files:**
- Create: `src/modules/delivery/components/manager/DeliveryDashboard.jsx`

- [ ] **Créer le composant**

KPIs calculés depuis la prop `deliveries` :
- Total du jour / Terminées / En cours / Problèmes
- Livreurs actifs (ceux ayant une position GPS < 5 min)
- Nombre de livraisons non planifiées depuis > 3 jours

4 cartes stat avec couleur contextuelle (vert = bon, rouge = attention).

- [ ] **Commit**
```bash
git add src/modules/delivery/components/manager/DeliveryDashboard.jsx
git commit -m "feat(delivery): DeliveryDashboard — KPIs du jour gérant"
```

---

### Task 18b : `DeliveryCalendar` — vue calendrier semaine/mois

**Files:**
- Create: `src/modules/delivery/components/manager/DeliveryCalendar.jsx`

- [ ] **Créer la vue calendrier**

Vue semaine (par défaut) avec navigation précédent/suivant. Chaque jour affiche les livraisons planifiées sous forme de blocs colorés (couleur = statut). Click sur un bloc → modal de détail identique au kanban.

Vue mois optionnelle : badge avec le nombre de livraisons par jour, click → zoom sur la semaine.

Pas de librairie externe — implémentation manuelle avec CSS Grid (7 colonnes).

Props : `deliveries`, `onOpenDelivery(delivery)`, `selectedDate`, `onDateChange(date)`.

- [ ] **Commit**
```bash
git add src/modules/delivery/components/manager/DeliveryCalendar.jsx
git commit -m "feat(delivery): DeliveryCalendar — vue calendrier semaine/mois gérant"
```

---

### Task 19 : `DeliveryBoard` — kanban drag-and-drop

**Files:**
- Create: `src/modules/delivery/components/manager/DeliveryBoard.jsx`

- [ ] **Installer @dnd-kit**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Créer le kanban**

Colonnes : `a_planifier` · `planifiee` · `en_route` · `chez_client` · `livree`

Chaque carte de livraison : nom client, adresse, créneau, livreur assigné, badge statut, badges Reprise/Paiement.

Drag-and-drop : déplacer une carte entre colonnes → `transitionDelivery(id, newStatus)`.

Click sur une carte → modal de détail / assignation :
- Sélectionner un livreur (dropdown membres workspace)
- Sélectionner un véhicule (dropdown véhicules)
- Date + créneau horaire
- Lieu de chargement (Magasin / Dépôt)
- Bouton "Enregistrer"

Filtres en haut : par date (date picker), par livreur.

- [ ] **Commit**
```bash
git add src/modules/delivery/components/manager/DeliveryBoard.jsx
git commit -m "feat(delivery): DeliveryBoard — kanban drag-and-drop avec @dnd-kit"
```

---

### Task 20 : `DeliveryMap` — carte GPS live

**Files:**
- Create: `src/modules/delivery/components/manager/DeliveryMap.jsx`

- [ ] **Créer le composant Leaflet**

```jsx
// src/modules/delivery/components/manager/DeliveryMap.jsx
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet'
import { useWatchDrivers } from '../../hooks/useDriverLocation'
import 'leaflet/dist/leaflet.css'

// Couleur du marker selon statut livraison en cours
function driverColor(position, deliveries) {
  const delivery = deliveries.find(d => d.id === position.delivery_id)
  if (!delivery) return '#6B7280'          // gris — pas de livraison active
  if (delivery.status === 'chez_client') return '#F59E0B'  // orange
  if (delivery.status === 'en_route')    return '#313ADF'  // bleu
  return '#10B981'                          // vert
}

export default function DeliveryMap({ workspaceId, deliveries, workspaceMembers }) {
  const driverPositions = useWatchDrivers(workspaceId)

  // Centre de la carte : position du workspace ou défaut France
  const center = [47.218, -1.554] // Nantes par défaut (Rezé)

  return (
    <MapContainer center={center} zoom={11} className="w-full h-full rounded-xl" scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© OpenStreetMap contributors'
      />

      {/* Adresses de livraison du jour */}
      {deliveries.filter(d => d.delivery_lat && d.delivery_lng).map(d => (
        <CircleMarker
          key={d.id}
          center={[d.delivery_lat, d.delivery_lng]}
          radius={8}
          pathOptions={{ color: '#313ADF', fillColor: '#313ADF', fillOpacity: 0.3 }}
        >
          <Popup>
            <strong>{d.order?.customer?.first_name} {d.order?.customer?.last_name}</strong><br/>
            {d.delivery_address}<br/>
            <span className="text-xs text-gray-500">{d.time_slot}</span>
          </Popup>
        </CircleMarker>
      ))}

      {/* Positions livreurs en temps réel */}
      {Object.entries(driverPositions).map(([driverId, pos]) => {
        const member = workspaceMembers.find(m => m.user_id === driverId)
        const color = driverColor(pos, deliveries)
        return (
          <Marker key={driverId} position={[pos.lat, pos.lng]}>
            <Popup>
              <strong>{member?.profile?.full_name ?? 'Livreur'}</strong><br/>
              {pos.is_moving ? '🟢 En mouvement' : '🔵 Arrêté'}<br/>
              {(() => {
                const delivery = deliveries.find(d => d.id === pos.delivery_id)
                if (delivery?.delivery_lat && pos.lat) {
                  const { haversine } = require('../../hooks/useDriverLocation')
                  const distKm = haversine({ lat: pos.lat, lng: pos.lng }, { lat: delivery.delivery_lat, lng: delivery.delivery_lng })
                  const etaMin = Math.round((distKm / 30) * 60) // 30 km/h moyenne ville
                  return <span className="text-xs font-medium text-blue-600">ETA ~{etaMin} min</span>
                }
                return null
              })()}<br/>
              <span className="text-xs text-gray-500">
                Mis à jour {new Date(pos.recorded_at).toLocaleTimeString('fr-FR')}
              </span>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
```

**Note :** Les coordonnées GPS des adresses de livraison (`delivery_lat`, `delivery_lng`) doivent être géocodées. Pour la v1, utiliser l'API Nominatim (OpenStreetMap, gratuite) au moment de la planification : `https://nominatim.openstreetmap.org/search?q=ADRESSE&format=json`. Ajouter `delivery_lat DOUBLE PRECISION, delivery_lng DOUBLE PRECISION` à la migration SQL v11_002 si pas encore présents.

- [ ] **Ajouter colonnes lat/lng à la migration si manquantes** dans `sql/v11_002_delivery_module.sql` :
```sql
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION;
```

- [ ] **Commit**
```bash
git add src/modules/delivery/components/manager/DeliveryMap.jsx
git commit -m "feat(delivery): DeliveryMap — Leaflet GPS live livreurs + adresses"
```

---

### Task 21 : `FleetPanel` — gestion véhicules

**Files:**
- Create: `src/modules/delivery/components/manager/FleetPanel.jsx`

- [ ] **Créer le composant**

Liste simple des véhicules avec toggle "disponible aujourd'hui". Bouton "Ajouter un véhicule". Modal d'ajout/édition : nom, capacité (nombre d'articles), notes.

Actions : `createVehicle`, `updateVehicle`, `deleteVehicle` depuis `deliveryService`.

Design sobre : liste de lignes avec switch toggle à droite, pas de table complexe.

- [ ] **Commit**
```bash
git add src/modules/delivery/components/manager/FleetPanel.jsx
git commit -m "feat(delivery): FleetPanel — gestion véhicules CRUD"
```

---

### Task 22 : `AlertsPanel` — panneau alertes

**Files:**
- Create: `src/modules/delivery/components/manager/AlertsPanel.jsx`

- [ ] **Créer le composant**

Reçoit en prop `alerts` (depuis `useDeliveryAlerts`). Affiche chaque alerte sous forme de ligne colorée :
- 🔴 Livreur bloqué : nom livreur, livraison concernée, distance restante
- 🟡 Non planifiée : nom client, date de commande, jours d'attente

Click sur une alerte → scroll ou highlight la livraison dans le kanban.

Si aucune alerte → message ✅ "Toutes les livraisons sont sous contrôle".

- [ ] **Commit**
```bash
git add src/modules/delivery/components/manager/AlertsPanel.jsx
git commit -m "feat(delivery): AlertsPanel — alertes non planifiées + livreur bloqué"
```

---

### Task 23 : `DeliveryManagerPage` — assemblage page gérant

**Files:**
- Create: `src/modules/delivery/pages/DeliveryManagerPage.jsx`

- [ ] **Créer la page assemblage**

Layout avec onglets : "Tableau de bord" | "Planification" | "Carte GPS" | "Flotte"

- Onglet Tableau de bord : `DeliveryDashboard` + `AlertsPanel`
- Onglet Planification : `DeliveryBoard` (kanban)
- Onglet Carte GPS : `DeliveryMap` (hauteur fixe 600px)
- Onglet Flotte : `FleetPanel`

Data globale chargée une fois au niveau de la page et partagée aux composants enfants.

```jsx
// Charger : deliveries du jour + membres workspace + véhicules
const { deliveries, refresh } = useDeliveries(workspace?.id, { date: selectedDate })
const driverPositions = useWatchDrivers(workspace?.id)
const alerts = useDeliveryAlerts(deliveries, driverPositions)
```

- [ ] **Commit**
```bash
git add src/modules/delivery/pages/DeliveryManagerPage.jsx
git commit -m "feat(delivery): DeliveryManagerPage — assemblage dashboard gérant"
```

---

## Phase 7 — Routing & intégration

---

### Task 24 : Routes App.jsx + sidebar

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Sidebar.jsx`
- Create: `src/modules/delivery/index.js`

- [ ] **Créer `src/modules/delivery/index.js`**

```js
export { default as DeliveryManagerPage } from './pages/DeliveryManagerPage'
export { default as DriverPage }          from './pages/DriverPage'
```

- [ ] **Ajouter les imports lazy dans `App.jsx`**

```js
const DeliveryManagerPage = lazy(() => import('./modules/delivery').then(m => ({ default: m.DeliveryManagerPage })))
const DriverPage           = lazy(() => import('./modules/delivery').then(m => ({ default: m.DriverPage })))
```

- [ ] **Ajouter les routes dans `App.jsx`** (dans la section ProtectedRoute)

```jsx
<Route path="/livraisons"           element={<DeliveryManagerPage />} />
<Route path="/livraisons/ma-tournee" element={<DriverPage />} />
```

Remplacer (ou mettre en redirect) les anciennes routes `/livraisons` → `Livraisons`, `/livraisons/ma-journee` → `LivraisonLivreur`, `/carte-livraisons` → `CarteLivraisons`.

- [ ] **Mettre à jour Sidebar.jsx** : les liens `/livraisons` pointent vers la nouvelle page. Ajouter le lien `/livraisons/ma-tournee` pour les livreurs/vendeurs.

- [ ] **Permissions dans les routes** : ajouter un guard dans `DeliveryManagerPage.jsx` au début du composant :

```js
const { role } = useWorkspace()
if (!['proprietaire', 'manager'].includes(role)) {
  return <Navigate to="/livraisons/ma-tournee" replace />
}
```

`DriverPage` accessible à tous les rôles sans guard.

- [ ] **Commit**
```bash
git add src/App.jsx src/components/Sidebar.jsx src/modules/delivery/index.js
git commit -m "feat(delivery): routes App.jsx + sidebar liens module livraison"
```

---

## Phase 8 — SMS automatisation

---

### Task 25 : SMS "livreur en route" — déclenchement dans le workflow

**Files:**
- Modify: `src/modules/delivery/components/driver/DeliveryWorkflow.jsx`
- Modify: `src/services/edgeFunctionService.js` (ou équivalent)

- [ ] **Dans l'étape 1 (Préparation → Départ)**, après `transitionDelivery(id, 'en_route')` :

```js
// Envoyer SMS en route si activé dans le workspace
if (workspace?.sms_driver_en_route_enabled && !delivery.sms_en_route_sent) {
  const phone = delivery.order?.customer?.phone
  const prenom = delivery.order?.customer?.first_name ?? 'client'
  const heure = delivery.time_slot ?? 'dans la journée'
  const template = workspace.sms_template_driver_en_route
    ?.replace('{prenom}', prenom)
    ?.replace('{heure_estimee}', heure)
    ?.replace('{magasin}', workspace.name)

  if (phone && template) {
    await sendSms(workspace.id, phone, { message: template })
    await updateDelivery(delivery.id, { sms_en_route_sent: true })
  }
}
```

- [ ] **Commit**
```bash
git add src/modules/delivery/components/driver/DeliveryWorkflow.jsx
git commit -m "feat(delivery): SMS automatique livreur en route (conditionnel)"
```

---

### Task 26 : SMS post-livraison — condition "sans problème"

**Files:**
- Modify: `src/modules/delivery/components/driver/DeliveryWorkflow.jsx`

- [ ] **Dans l'étape de finalisation**, après `completeDelivery()` :

```js
// SMS avis Google — UNIQUEMENT si aucun problème signalé
const hasProblem = delivery.problem_type != null
if (!hasProblem && !delivery.sms_review_sent) {
  const phone = delivery.order?.customer?.phone
  const prenom = delivery.order?.customer?.first_name ?? 'client'
  const template = workspace.sms_template_post_delivery
    ?.replace('{prenom}', prenom)
    ?.replace('{lien_avis_google}', workspace.google_review_url ?? '')
    ?.replace('{magasin}', workspace.name)

  if (phone && template) {
    await sendSms(workspace.id, phone, { message: template })
    await updateDelivery(delivery.id, { sms_review_sent: true })
  }
}
```

- [ ] **Vérifier** que `workspace.sms_template_post_delivery` est bien la clé utilisée par le template éditeur existant dans Settings. Si la clé diffère, adapter.

- [ ] **Tester le cas "problème signalé"** : créer une livraison de test, signaler un problème → vérifier que `sms_review_sent` reste `false` et qu'aucun SMS n't est envoyé.

- [ ] **Commit**
```bash
git add src/modules/delivery/components/driver/DeliveryWorkflow.jsx
git commit -m "feat(delivery): SMS post-livraison conditionnel (pas envoyé si problème)"
```

---

## Phase 9 — Nettoyage

---

### Task 27 : Archiver les anciennes pages livraison

**Files:**
- Delete ou redirect: `src/pages/Livraisons.jsx`, `src/pages/LivraisonLivreur.jsx`, `src/pages/CarteLivraisons.jsx`

- [ ] **Vérifier** qu'aucun autre fichier n'importe directement ces pages (recherche dans App.jsx — déjà remplacées en Task 24).

- [ ] **Supprimer** les 3 anciens fichiers.

- [ ] **Supprimer les imports lazy** correspondants dans `App.jsx`.

- [ ] **Commit**
```bash
git rm src/pages/Livraisons.jsx src/pages/LivraisonLivreur.jsx src/pages/CarteLivraisons.jsx
git add src/App.jsx
git commit -m "chore: suppression anciennes pages livraison remplacées par le module"
```

---

### Task 28 : Push GitHub

- [ ] **Pusher la branche**

```bash
git push origin claude/busy-saha-6e6868
```

- [ ] **Ouvrir une PR** vers `main` avec pour titre : "feat: module livraison v2 + système de modules"

---

## Résumé des fichiers créés / modifiés

### Créés
```
sql/v11_001_modules_system.sql
sql/v11_002_delivery_module.sql
src/modules/delivery/index.js
src/modules/delivery/services/deliveryService.js
src/modules/delivery/hooks/useDeliveries.js
src/modules/delivery/hooks/useDriverLocation.js
src/modules/delivery/hooks/useDeliveryAlerts.js
src/modules/delivery/components/shared/DeliveryStatusBadge.jsx
src/modules/delivery/components/shared/DeliveryTimeline.jsx
src/modules/delivery/components/driver/DriverHome.jsx
src/modules/delivery/components/driver/DeliveryWorkflow.jsx
src/modules/delivery/components/driver/SignatureCanvas.jsx
src/modules/delivery/components/driver/PhotoCapture.jsx
src/modules/delivery/components/driver/PaymentCapture.jsx
src/modules/delivery/pages/DriverPage.jsx
src/modules/delivery/components/manager/DeliveryDashboard.jsx
src/modules/delivery/components/manager/DeliveryCalendar.jsx
src/modules/delivery/components/manager/DeliveryBoard.jsx
src/modules/delivery/components/manager/DeliveryMap.jsx
src/modules/delivery/components/manager/FleetPanel.jsx
src/modules/delivery/components/manager/AlertsPanel.jsx
src/modules/delivery/pages/DeliveryManagerPage.jsx
```

### Modifiés
```
src/contexts/WorkspaceContext.jsx
src/components/Sidebar.jsx
src/pages/WorkspaceOnboarding.jsx
src/pages/Settings.jsx
src/App.jsx
```

### Supprimés
```
src/pages/Livraisons.jsx
src/pages/LivraisonLivreur.jsx
src/pages/CarteLivraisons.jsx
```

### Dépendances à installer
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```
