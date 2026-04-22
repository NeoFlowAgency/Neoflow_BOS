# Spec — Module Livraison NeoFlow BOS
**Date :** 2026-04-22  
**Client pilote :** Maison de la Literie Rezé  
**Statut :** Validé pour implémentation

---

## 1. Contexte

La Maison de la Literie gère ses livraisons entièrement sur papier et à l'oral. L'objectif est de remplacer ce chaos par un module de livraison premium intégré à NeoFlow BOS, traité comme une application à part entière mais connecté aux données existantes (commandes, clients, produits, paiements).

L'équipe terrain : 2-3 livreurs fixes, des vendeurs qui livrent occasionnellement, et des prestataires externes utilisés en pic de charge (soldes). La gestion prestataires sera spécifiée séparément après entretien avec la gérante.

---

## 2. Architecture du module

### Structure fichiers

```
src/modules/delivery/
├── components/
│   ├── manager/                    # Interface gérante (desktop/tablette)
│   │   ├── DeliveryDashboard.jsx   # Vue d'ensemble du jour
│   │   ├── DeliveryBoard.jsx       # Kanban drag-and-drop
│   │   ├── DeliveryCalendar.jsx    # Vue calendrier semaine/mois
│   │   ├── DeliveryMap.jsx         # Carte GPS live tous livreurs
│   │   ├── FleetPanel.jsx          # Gestion véhicules (illimité)
│   │   └── AlertsPanel.jsx         # Alertes livraisons non planifiées
│   ├── driver/                     # Interface livreur (mobile-first)
│   │   ├── DriverHome.jsx          # Ma journée (liste triée)
│   │   ├── DeliveryWorkflow.jsx    # Workflow guidé étape par étape
│   │   ├── SignatureCanvas.jsx     # Signature digitale client
│   │   ├── PhotoCapture.jsx        # Photo preuve livraison
│   │   └── PaymentCapture.jsx      # Encaissement espèces/chèque
│   └── shared/
│       ├── DeliveryStatusBadge.jsx
│       └── DeliveryTimeline.jsx
├── pages/
│   ├── DeliveryManagerPage.jsx     # Route /livraisons (gérante)
│   └── DriverPage.jsx              # Route /livraisons/ma-tournee (livreur)
├── services/
│   └── deliveryService.js          # CRUD + GPS + alertes
├── hooks/
│   ├── useDeliveries.js
│   ├── useDriverLocation.js        # Supabase Realtime GPS
│   └── useDeliveryAlerts.js
└── index.js
```

### Principe d'isolation

Le module expose une interface propre via `index.js`. Les autres parties de BOS ne touchent pas directement aux composants internes du module — ils passent par les services et hooks exposés.

---

## 3. Système de modules

> **Priorité d'implémentation :** Le système de modules est une fondation transversale qui doit être implémentée en **premier**, avant le module livraison. Il touche : la migration SQL (`workspaces.modules JSONB`), `WorkspaceContext` (exposition de `isModuleEnabled()`), la sidebar (masquage conditionnel de chaque section), les routes protégées, et le flow `WorkspaceOnboarding`. Tous les modules existants (Stock, Devis, Fournisseurs, SAV, Ventes Rapides) doivent être mis à jour pour respecter `isModuleEnabled()`.

### Activation à la création de workspace

Lors du flow `WorkspaceOnboarding`, l'utilisateur choisit les modules qu'il veut activer :

| Module | Description courte |
|--------|-------------------|
| Livraisons | Planification, GPS live, interface livreur |
| Ventes rapides | Point de vente rapide |
| Devis | Création et suivi des devis |
| Stock | Gestion des niveaux de stock et emplacements |
| Fournisseurs | Gestion fournisseurs et bons de commande |
| SAV | Suivi service après-vente |

### Stockage

Un objet JSONB `modules` sur la table `workspaces` :

```json
{
  "livraisons": true,
  "ventes_rapides": true,
  "devis": false,
  "stock": true,
  "fournisseurs": false,
  "sav": false
}
```

### Exposition dans le contexte

`WorkspaceContext` expose `isModuleEnabled(moduleKey: string): boolean`.

La sidebar et toutes les routes protégées vérifient `isModuleEnabled()` avant d'afficher leurs éléments. Un module désactivé = invisible partout dans l'app (sidebar, liens dans commandes, champs formulaires associés).

### Modification ultérieure

Accessible dans `Settings > Modules` — uniquement pour le propriétaire.

---

## 4. Base de données — nouvelles tables

### `delivery_vehicles`
```sql
id uuid PK
workspace_id uuid FK workspaces
name text               -- "Camion 1", "Peugeot Expert"
capacity_items int      -- nombre d'articles max
available boolean       -- disponible aujourd'hui
notes text
created_at timestamptz
```

### `delivery_driver_locations`
```sql
id uuid PK
workspace_id uuid FK
driver_id uuid FK auth.users
delivery_id uuid FK deliveries (nullable — entre deux livraisons)
lat double precision
lng double precision
heading float           -- direction en degrés
is_moving boolean
recorded_at timestamptz
```
Index sur `(driver_id, recorded_at DESC)` pour requêtes temps réel.

### Modifications table `deliveries` existante
Colonnes ajoutées :
```sql
execution_type text DEFAULT 'internal'  -- 'internal' | 'provider'
vehicle_id uuid FK delivery_vehicles
pickup_location text                    -- 'store' | 'depot' | text libre
driver_notes text                       -- notes du livreur
proof_photo_url text
signature_url text
signature_obtained_at timestamptz
problem_type text                       -- 'absent' | 'damaged' | 'refused' | 'other'
problem_description text
problem_reported_at timestamptz
loading_confirmed_at timestamptz        -- produits chargés confirmés
departed_at timestamptz
arrived_at_client_at timestamptz
sms_review_sent boolean DEFAULT false
```

---

## 5. Interface livreur — workflow détaillé

Design : mobile-first, gros éléments tactiles, utilisable d'une main. Aucun élément superflu.

### Écran "Ma journée"
- Liste des livraisons du jour assignées au livreur connecté
- Triées par ordre de passage (heure prévue)
- Chaque carte : nom client, adresse, produits, heure créneau, statut
- Badge "Reprise" si l'ancien matelas doit être récupéré
- Badge "Reste à payer" avec montant si encaissement prévu

### Workflow par livraison (étapes séquentielles)

**Étape 1 — Préparation**
- Liste des produits à charger avec lieu de chargement (magasin ou dépôt, adresse affichée)
- Checklist : le livreur coche chaque article chargé
- CTA : "Tout est chargé → Départ"
- Horodatage `loading_confirmed_at`

**Étape 2 — En route**
- Écran épuré, 3 actions :
  - 🗺️ **Naviguer** → ouvre Google Maps / Waze natif à l'adresse exacte
  - 📞 **Appeler le client** → compose le numéro en un tap
  - ✅ **Je suis arrivé**
- Partage GPS actif (indicateur visible en haut de l'écran)
- Horodatage `departed_at`

**Étape 3 — Chez le client**
- Checklist produits déposés et installés
- Si reprise : confirmation "Ancien matelas récupéré"
- CTA : "Installation terminée"
- Horodatage `arrived_at_client_at`

**Étape 4 — Finalisation**
- **Signature** : pad de signature digitale, le client signe sur le téléphone du livreur
- **Photo** : optionnelle, preuve de livraison (stockée Supabase Storage)
- **Encaissement** : si `remaining_amount > 0`, saisie mode (espèces / chèque) + montant encaissé
- **Terminer** : CTA principal → livraison marquée "livrée"
- **Problème** : bouton secondaire → formulaire type de problème + description

### Signalement de problème
Types : Client absent · Article endommagé · Refus de livraison · Autre  
La gérant voit une alerte en temps réel dans le dashboard (Supabase Realtime — pas de push natif en v1).  
Le SMS post-livraison (avis Google) n'est **pas envoyé** si un problème est signalé.

---

## 6. Interface gérante — dashboard

Design : riche, desktop et tablette, plusieurs zones d'information simultanées.

### Bandeau KPIs du jour
- Total livraisons / Terminées / En cours / Problèmes
- Livreurs actifs (avec point vert)
- Alertes livraisons non planifiées (configurable : X jours sans planification)

### Kanban planning
Valeurs de statut (`deliveries.status`) : `a_planifier` · `planifiee` · `en_route` · `chez_client` · `livree` · `probleme`  
Colonnes affichées : `À planifier → Planifiée → En route → Chez le client → Livrée`  
Drag-and-drop pour déplacer une livraison.  
Assignation livreur + véhicule + créneau horaire via modal.  
Planification possible à tout moment (pas seulement le matin).

### Carte GPS live
- Un marqueur animé par livreur actif (couleur selon état)
- Toutes les adresses de livraison du jour épinglées
- Click sur un marqueur livreur → popup avec nom, livraison en cours, heure de départ, ETA estimé (distance à vol d'oiseau + vitesse moyenne 30km/h — pas d'API de routing externe en v1)
- Mise à jour Supabase Realtime (toutes les 15 secondes)
- Librairie carte : Leaflet + React-Leaflet, tuiles OpenStreetMap (gratuit)

### Alertes intelligentes GPS
L'alerte "livreur bloqué" se déclenche **uniquement si** :
- Statut = "en route" (pas "chez le client")
- Immobile depuis > 10 minutes
- Distance au client > 500 mètres

Si le livreur est chez le client, aucune alerte d'immobilité (installation normale d'un matelas peut prendre 20-30 min).

### Gestion flotte
- Liste des véhicules (illimitée)
- Disponibilité modifiable par jour
- Aucune limite artificielle sur le nombre de véhicules

---

## 7. Automatisation SMS

Intégration avec l'Edge Function `send-sms` existante (Brevo).

| Déclencheur | Clé template | Variables disponibles | Condition |
|------------|-------------|----------------------|-----------|
| J-1 livraison (pg_cron 9h) | `sms_template_delivery_reminder` | `{prenom}`, `{date}`, `{creneau}`, `{magasin}` | Statut = planifiée |
| Livreur clique "Départ" | `sms_template_driver_en_route` | `{prenom}`, `{heure_estimee}`, `{magasin}` | Activable/désactivable dans Settings > SMS |
| Livraison terminée | `sms_template_post_delivery` | `{prenom}`, `{lien_avis_google}`, `{magasin}` | **Uniquement si aucun problème signalé** |

Templates SMS éditables dans `Settings > SMS Templates` (déjà existant). Ajouter le toggle d'activation pour `sms_template_driver_en_route` dans la section Templates, avec colonne `sms_driver_en_route_enabled boolean DEFAULT false` sur `workspaces`.

---

## 8. GPS tracking — implémentation technique

- Livreur clique **"Démarrer ma tournée"** (bouton explicite dans `DriverHome.jsx`) → `navigator.geolocation.watchPosition()` toutes les 15s
- Livreur clique **"Terminer ma tournée"** OU fermeture du composant → `clearWatch()` + fermeture du channel Supabase Realtime
- Si le livreur ferme l'app sans terminer : le `useEffect` cleanup appelle `clearWatch()` automatiquement
- Position envoyée à Supabase table `delivery_driver_locations` via `upsert`
- Gérante écoute via `supabase.channel('driver-locations').on('postgres_changes', ...)`
- En fin de tournée : le channel se ferme, aucun tracking résiduel
- Indicateur visible côté livreur : bandeau "GPS actif" en haut de l'écran pendant toute la tournée

---

## 9. Permissions par rôle

| Interface | Rôles autorisés |
|-----------|----------------|
| `DeliveryManagerPage` (dashboard, kanban, carte, flotte) | `proprietaire`, `manager` |
| `DriverPage` (ma tournée, workflow livraison) | `livreur`, `vendeur`, `manager`, `proprietaire` |
| Assignation d'un livreur / véhicule | `proprietaire`, `manager` |
| Marquer une livraison "livrée" / signaler un problème | Tous les rôles (depuis la vue livreur) |

Les `vendeurs` qui livrent occasionnellement utilisent la même interface livreur que les `livreur`.

---

## 11. Ce qui est hors périmètre (v1)

- Gestion prestataires externes (à spécifier après entretien gérante)
- Optimisation automatique d'itinéraire de tournée
- Notifications push natives (PWA)
- Mode hors-ligne complet
- Statistiques livraisons (nombre, délais, taux de problèmes)

---

## 12. Design & UX

- Interface livreur : refonte complète, pas de réutilisation du `LivraisonLivreur.jsx` existant
- Interface gérante : refonte complète de `Livraisons.jsx` et `CarteLivraisons.jsx`
- Palette et typographie respectent le design system BOS (#313ADF, navy, Tailwind)
- Aucun composant "AI-generated look" — hiérarchie visuelle soignée, espacement cohérent
- Skill `frontend-design` invoqué à l'implémentation
