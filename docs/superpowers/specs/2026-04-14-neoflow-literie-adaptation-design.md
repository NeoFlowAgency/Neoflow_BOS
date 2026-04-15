# Design Spec — NeoFlow BOS : Adaptation Complète Magasins de Literie

**Date** : 2026-04-14  
**Auteur** : Noakim Grelier + Claude Code  
**Statut** : Approuvé — prêt pour implémentation  

---

## 1. Contexte et Objectif

NeoFlow BOS est un SaaS de gestion d'entreprise (React 19 + Vite + Supabase + Tailwind v4).
L'objectif est de l'adapter pour qu'il remplace **complètement** le logiciel de gestion des magasins de literie indépendants (Skara, Ecolix, etc.), tout en étant aussi accessible aux magasins qui n'ont aucun outil.

**Client pilote** : Maison de la Literie Rezé (belle-mère de Noakim).  
**Concurrent principal analysé** : Skara (12+ ans, 1 000+ magasins), Ecolix Business.  
**Cible** : indépendants et magasins de taille moyenne (1-3 sites). Multi-sites = phase ultérieure.

---

## 2. Spécificités Métier Literie

### 2.1 Le cycle de vie d'une commande literie

```
Accueil client
  → Essai produits en showroom
  → Devis (modèle + taille + fermeté + éco-participation)
  → Commande ferme signée (bon de commande imprimé, double signature)
  → Acompte encaissé (CB / espèces / virement / chèque / financement manuel)
  → Contremarque fournisseur créée si produit hors stock
  → Réception marchandise → allocation automatique à la contremarque
  → Planification livraison (créneau + tournée + équipe)
  → SMS confirmation créneau au client
  → Livraison + installation + reprise ancien matelas (si demandée)
  → Signature bon de livraison confirmée par livreur (case à cocher mobile)
  → Solde encaissé (à la livraison ou avant)
  → Facture finale générée
  → [Optionnel 100 nuits] : échange confort SAV
```

### 2.2 La contremarque — concept central

Une contremarque est une **commande fournisseur directement liée à une commande client**.
- Déclenché quand le produit demandé n'est pas en stock
- La ligne fournisseur est "réservée" pour ce client dès réception
- Statuts : `en_attente` → `commandee` → `recue` → `allouee` → `livree`
- Une commande client peut avoir plusieurs contremarques (plusieurs articles)

**Règle "prêt à livrer"** : une commande peut être ajoutée à une tournée de livraison uniquement si **toutes ses contremarques** sont au statut `recue` ou `allouee` ET qu'au moins un paiement de type `acompte` a été encaissé. Cette règle est implémentée comme une **RPC Supabase** (`rpc('is_order_ready_to_deliver', { order_id })`) appelée côté service JS avant tout insert dans `delivery_route_items`. Ce n'est pas une contrainte PostgreSQL native.

### 2.3 Les variantes produits

En literie, un produit existe en multiples dimensions :
- **Taille** : 90×190, 90×200, 140×190, 140×200, 160×200, 180×200
- **Confort** : souple, medium, ferme (parfois : très souple, très ferme)
- Chaque combinaison taille+confort a son propre : prix, référence fournisseur, stock

Le stock des variantes est géré via la table `stock_levels` existante, étendue avec un champ `variant_id` nullable. Cela préserve le système de mouvements de stock existant.

### 2.4 L'éco-participation (Éco-mobilier DEA)

- Obligation légale pour tout produit meuble/literie vendu en France
- Montant ~0,52€/kg, défini par catégorie produit
- Doit apparaître en **ligne séparée** sur devis, bon de commande et facture
- Hérite du taux de TVA de la ligne produit parente (règle explicite, pas de taux distinct)
- Mention obligatoire : "sous réserve d'augmentation à la date de facturation"

### 2.5 Le SAV literie — 4 types distincts

| Type | Délai | Responsable |
|------|-------|-------------|
| Échange confort | 100 nuits (depuis `delivered_at`) | Magasin |
| Garantie constructeur | 2-10 ans selon marque | Fournisseur |
| Pièces détachées | N/A | Fournisseur |
| Rétractation légale | 14 jours | Magasin (remboursement) |

La date de livraison (`delivered_at`) est stockée sur la table `orders` et mise à jour lors de la confirmation de livraison par le livreur.

### 2.6 La reprise de l'ancien matelas

Option choisie **au niveau de la commande** (pas par article), avec 4 choix :
- Conserver ses anciens meubles
- Don à une ESS
- Déchetterie/point de collecte
- Reprise gratuite par le magasin

L'option choisie apparaît sur le bon de livraison pour que le livreur sache quoi faire.

### 2.7 Le financement consommateur

"Financement" est un **mode de paiement manuel** : le vendeur saisit le montant accordé par l'organisme de crédit (Cofidis, Cetelem) après validation externe. Aucune intégration API requise — c'est une étiquette de paiement comme CB ou chèque. L'intégration directe Cofidis/Cetelem est hors périmètre.

---

## 3. Analyse du Bon de Commande Réel (Maison de la Literie Rezé)

Analysé sur photo. Champs obligatoires identifiés :

**En-tête** : logo magasin, nom/adresse/email/tél, numéro commande, date  
**Vendeur** : "Votre Conseiller : [prénom]"  
**Client** : nom, adresse livraison, **téléphone** (requis pour SMS et bon de commande)  
**Tableau produits** : réf, désignation, description détaillée (matériaux, garantie), qté, prix TTC, remise, total TTC  
**Éco-participation** : ligne séparée avec sa propre remise  
**Dates** : livraison souhaitée + date limite de livraison  
**Acompte ventilé** : espèces / CB / virement / chèque / financement  
**À encaisser à la livraison** : solde restant  
**Reprise anciens meubles** : 4 checkboxes (niveau commande)  
**RGPD** : consentement SMS/email magasin (Oui/Non) + partenaires (Oui/Non) — stocké en DB  
**Signatures** : client + vendeur  
**Footer** : SIRET, APE, capital social  

---

## 4. Architecture — Ce qui Change dans NeoFlow BOS

### 4.1 Modifications schéma DB

**Table `customers`** — ajouts
- `phone` (varchar) — requis pour SMS et bon de commande

**Table `products`** — ajouts
- `eco_participation_amount` (decimal) — montant éco-participation
- `warranty_years` (int) — garantie constructeur en années
- `has_variants` (boolean) — active le système de variantes

**Table `stock_levels`** — ajout
- `variant_id` (FK product_variants, nullable) — étend le stock existant aux variantes

**Table `product_variants`** (nouvelle)
- `id`, `product_id` (FK products), `workspace_id`
- `size` (varchar, ex: "160x200"), `comfort` (varchar, ex: "medium")
- `price` (decimal), `purchase_price` (decimal)
- `sku_supplier` (varchar)

**Table `orders`** — ajouts et modifications
- `old_furniture_option` (enum: keep/ess/dechetterie/reprise) — au niveau commande
- `delivered_at` (timestamp) — date réelle de livraison confirmée
- `wished_delivery_date` (date), `max_delivery_date` (date)
- `sms_consent` (boolean), `sms_partner_consent` (boolean)
- Enum `status` redéfini pour literie : `brouillon` → `devis` → `confirme` → `en_attente_stock` → `pret_a_livrer` → `en_livraison` → `livre` → `annule`

**Table `order_payments`** (nouvelle — remplace ou complète le paiement existant)
- `id`, `order_id` (FK orders), `workspace_id`
- `payment_type` (enum: acompte/solde/avoir) — distingue le moment du paiement
- `mode` (enum: cash/cb/virement/cheque/financement/avoir)
- `amount` (decimal), `paid_at` (timestamp)
- `notes` (varchar)

**Table `order_items`** — ajouts
- `variant_id` (FK product_variants, nullable)
- `eco_participation` (decimal)
- `eco_participation_tva_rate` (decimal) — hérite du taux TVA de la ligne

**Table `contremarques`** (nouvelle)
- `id`, `workspace_id`, `order_id` (FK orders), `order_item_id` (FK order_items)
- `supplier_id` (FK suppliers), `purchase_order_id` (FK purchase_orders, nullable)
- `status` (enum: en_attente/commandee/recue/allouee/livree)
- `expected_date` (date), `received_date` (date), `notes` (varchar)

**Table `delivery_routes`** (nouvelle)
- `id`, `workspace_id`, `name` (varchar), `date` (date)
- `status` (enum: planifiee/en_cours/terminee)

**Table `delivery_route_members`** (nouvelle — équipe livreurs)
- `id`, `route_id` (FK delivery_routes), `user_id` (FK auth.users)

**Table `delivery_route_items`** (nouvelle)
- `id`, `route_id` (FK delivery_routes), `order_id` (FK orders), `position` (int)
- `time_slot` (varchar), `status` (enum: en_attente/livre/echec)
- `delivery_notes` (varchar), `confirmed_at` (timestamp)
- Contrainte : `order_id` ne peut être ajouté que si `isOrderReadyToDeliver()` = true

**Table `sav_tickets`** (nouvelle — pas d'existant dans NeoFlow BOS)
- `id`, `workspace_id`, `order_id` (FK orders), `customer_id` (FK customers)
- `type` (enum: echange_confort/garantie_constructeur/pieces/retractation)
- `status` (enum: ouvert/en_cours/resolu/clos)
- `description` (text), `resolution` (text)
- `warranty_expiry_date` (date) — calculée auto = `orders.delivered_at` + `products.warranty_years`
- `contremarque_id` (FK contremarques, nullable) — si échange nécessite une nouvelle commande
- `created_at`, `resolved_at`

**Table `workspace_settings`** — ajouts
- `sms_provider` (varchar), `sms_api_key` (varchar)
- `google_review_url` (varchar)
- `siret` (varchar), `ape_code` (varchar), `legal_capital` (varchar)
- `default_sms_templates` (jsonb) — templates confirmation/rappel/post-livraison

**RLS** : toutes les nouvelles tables filtrent par `workspace_id` via `workspace_users`, pattern identique aux tables existantes.

---

## 5. Plan d'Implémentation en 5 Phases

### Phase 1 — Fondations literie (bon de commande conforme)

**Objectif** : Générer un bon de commande identique au format réel utilisé en magasin de literie. C'est le MVP pilote — ta belle-mère peut tester à partir de cette phase.

Modules :
1. Ajout `phone` sur `customers` + UI fiche client
2. Variantes produits — schema DB + UI fiche produit + sélection variante à la vente
3. Éco-participation — champ sur fiche produit, calcul auto sur lignes commande
4. `order_payments` — acompte multi-mode (CB/espèces/virement/chèque/financement)
5. Champs dates livraison (`wished_delivery_date`, `max_delivery_date`) sur commande
6. Reprise ancien matelas — 4 options checkbox sur commande (niveau commande)
7. Consentement RGPD SMS/email — 2 champs booléens sur commande
8. Bon de commande PDF refondu — fidèle au format réel observé (Section 3)
9. Infos légales workspace (SIRET, APE, capital) dans Settings
10. Nouveau statut `orders` pour le flux literie

### Phase 2 — Contremarques & Livraisons

**Objectif** : Gérer tout le flux fournisseur→client et planifier les livraisons.

Modules :
1. Table `contremarques` + service + UI création depuis une commande
2. Vue "Contremarques en attente" — ce qui manque par fournisseur
3. Réception marchandise — marquer une contremarque `recue`, allouer au client
4. Fonction `isOrderReadyToDeliver()` — vérifie contremarques + acompte
5. Vue "Prêt à livrer" — commandes éligibles à une tournée
6. Planning livraisons — vue calendrier + création de tournées avec équipe (user IDs)
7. Bon de livraison PDF — avec reprise matelas, solde à encaisser, case confirmation livreur
8. Étiquettes produits imprimables (référence, client, adresse)

### Phase 3 — Communication automatique

**Objectif** : Automatiser la communication client sans effort.

Modules :
1. Intégration Brevo SMS API — configuration dans Settings (`sms_api_key`)
2. SMS confirmation commande (auto à la création si `sms_consent = true`)
3. SMS rappel livraison (auto J-1 si tournée planifiée)
4. SMS post-livraison avec lien avis Google (auto après confirmation livreur)
5. Templates SMS éditables dans Settings

### Phase 4 — SAV renforcé

**Objectif** : SAV professionnel avec tracking garanties.

Modules :
1. Table `sav_tickets` + service + UI création avec sélection type
2. Lien vers commande d'origine + affichage historique commande dans SAV
3. Calcul automatique `warranty_expiry_date` à la création du ticket
4. Alerte "100 nuits" — liste des commandes livrées dont le délai approche (depuis `delivered_at`)
5. Bon de reprise produit PDF
6. Contremarque SAV auto (si type = échange_confort, propose de créer une contremarque)

### Phase 5 — UX Terrain & Statistiques

**Objectif** : Interface adaptée à chaque rôle sur le terrain, statistiques vendeurs.

Modules :
1. Dashboard gérant "matin" — livraisons du jour / contremarques reçues / commandes sans acompte / SAV ouverts / alertes stock
2. Interface livreur mobile — tournée du jour, adresses, bon de livraison, bouton "Confirmer livraison" (met à jour `delivered_at` + statut)
3. Vue vendeur tablette — recherche produit rapide avec variantes visuelles, création devis fluide
4. Statistiques vendeurs — CA / taux conversion devis→commandes / panier moyen / par période
5. Neo IA enrichi — contexte literie ("quelles contremarques sont en attente ?", "que dois-je livrer demain ?")

---

## 6. Coûts Additionnels Estimés

| Service | Usage | Coût estimé |
|---------|-------|-------------|
| **Brevo SMS** | ~100-500 SMS/mois/magasin | Gratuit jusqu'à 300/jour ; ~20€/mois au-delà |
| **PDF generation** | Déjà existant (Edge Function) | 0€ |
| **Google Reviews** | Lien statique dans Settings | 0€ |
| **Carte livraisons** | OpenStreetMap + Leaflet (open source) | 0€ |

Aucun nouveau service critique payant obligatoire pour les phases 1-4.

---

## 7. Questions Ouvertes (à confirmer avec cliente pilote ce soir)

1. Quel logiciel utilisent-ils actuellement ?
2. Comment gèrent-ils les contremarques aujourd'hui (Excel, papier, logiciel) ?
3. Combien de fournisseurs (~3 ou ~20 ?)
4. Comment organisent-ils les tournées actuellement ?
5. SMS déjà utilisés ou nouvelle pratique ?
6. Solde : toujours à la livraison ou parfois avant/après ?
7. Bon de livraison = document séparé ou même bon de commande annoté ?
8. Le créneau de livraison (ex : "entre 14h et 17h") est-il communiqué au client à la prise de commande ou seulement lors de la planification de tournée ?

---

## 8. Hors Périmètre (phases futures)

- Certification NF525 (caisse physique)
- Multi-sites
- Intégration Cofidis/Cetelem API directe
- Export comptabilité automatique
- Application mobile native livreur
- E-invoicing 2026-2027
