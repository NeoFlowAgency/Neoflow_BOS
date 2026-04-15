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
  → Acompte encaissé (CB / espèces / virement / chèque / financement)
  → Contremarque fournisseur créée si produit hors stock
  → Réception marchandise → allocation automatique à la contremarque
  → Planification livraison (créneau + tournée + équipe)
  → SMS confirmation créneau au client
  → Livraison + installation + reprise ancien matelas (si demandée)
  → Signature bon de livraison par client
  → Solde encaissé (à la livraison ou avant)
  → Facture finale générée
  → [Optionnel 100 nuits] : échange confort SAV
```

### 2.2 La contremarque — concept central

Une contremarque est une **commande fournisseur directement liée à une commande client**.
- Déclenché quand le produit demandé n'est pas en stock
- La ligne fournisseur est "réservée" pour ce client dès réception
- Statuts : `en_attente` → `commandée` → `reçue` → `allouée` → `livrée`
- Une commande client peut avoir plusieurs contremarques (plusieurs articles)

### 2.3 Les variantes produits

En literie, un produit existe en multiples dimensions :
- **Taille** : 90×190, 90×200, 140×190, 140×200, 160×200, 180×200
- **Confort** : souple, medium, ferme (parfois : très souple, très ferme)
- Chaque combinaison taille+confort a son propre : prix, référence fournisseur, stock

### 2.4 L'éco-participation (Éco-mobilier DEA)

- Obligation légale pour tout produit meuble/literie vendu en France
- Montant ~0,52€/kg, défini par catégorie produit
- Doit apparaître en **ligne séparée** sur devis, bon de commande et facture
- Soumise à TVA au même taux que le produit
- Mention obligatoire : "sous réserve d'augmentation à la date de facturation"

### 2.5 Le SAV literie — 4 types distincts

| Type | Délai | Responsable |
|------|-------|-------------|
| Échange confort | 100 nuits | Magasin |
| Garantie constructeur | 2-10 ans selon marque | Fournisseur |
| Pièces détachées | N/A | Fournisseur |
| Rétractation légale | 14 jours | Magasin (remboursement) |

### 2.6 La reprise de l'ancien matelas

Service proposé lors de la vente, avec 4 options (comme sur le vrai bon de commande observé) :
- Conserver ses anciens meubles
- Don à une ESS
- Déchetterie/point de collecte
- Reprise gratuite par le magasin

L'option choisie doit apparaître sur le bon de livraison pour que le livreur sache quoi faire.

---

## 3. Analyse du Bon de Commande Réel (Maison de la Literie Rezé)

Analysé sur photo. Champs obligatoires identifiés :

**En-tête** : logo magasin, nom/adresse/email/tél, numéro commande, date  
**Vendeur** : "Votre Conseiller : [prénom]"  
**Client** : nom, adresse livraison, téléphone  
**Tableau produits** : réf, désignation, description détaillée (matériaux, garantie), qté, prix TTC, remise, total TTC  
**Éco-participation** : ligne séparée avec sa propre remise  
**Dates** : livraison souhaitée + date limite de livraison  
**Acompte ventilé** : espèces / CB / virement / chèque / financement  
**À encaisser à la livraison** : solde restant  
**Reprise anciens meubles** : 4 checkboxes  
**Bloc légal** : mention éco-participation variable, RGPD SMS/email (Oui/Non)  
**Signatures** : client + vendeur  
**Footer** : SIRET, APE, capital social  

---

## 4. Architecture — Ce qui Change dans NeoFlow BOS

### 4.1 Schéma DB — nouvelles tables / modifications

**Table `product_variants`** (nouvelle)
- `id`, `product_id` (FK products), `workspace_id`
- `size` (ex: "160x200"), `comfort` (ex: "medium")
- `price`, `purchase_price`, `sku_supplier`, `stock_qty`

**Table `order_items`** — ajouts
- `variant_id` (FK product_variants, nullable)
- `eco_participation` (decimal)
- `old_furniture_option` (enum: keep/ess/dechetterie/reprise)

**Table `contremarques`** (nouvelle)
- `id`, `workspace_id`, `order_id`, `order_item_id`
- `supplier_id`, `supplier_order_id` (FK purchase_orders)
- `status` (enum: en_attente/commandee/recue/allouee/livree)
- `expected_date`, `received_date`

**Table `delivery_routes`** (nouvelle)
- `id`, `workspace_id`, `name`, `date`
- `team` (noms livreurs), `status` (planifiee/en_cours/terminee)

**Table `delivery_route_items`** (nouvelle)
- `id`, `route_id`, `order_id`, `position` (ordre dans la tournée)
- `time_slot` (créneau heure), `status` (en_attente/livre/echec)
- `delivery_notes`, `signed_at`

**Table `sav_tickets`** — ajouts
- `type` (enum: echange_confort/garantie_constructeur/pieces/retractation)
- `origin_order_id` (FK orders)
- `warranty_expiry_date`
- `contremarque_id` (si échange nécessite une nouvelle contremarque)

**Table `products`** — ajouts
- `eco_participation_amount` (decimal)
- `warranty_years` (int)
- `has_variants` (boolean)

**Table `workspace_settings`** — ajouts
- `sms_provider`, `sms_api_key`
- `google_review_url`
- `default_delivery_team`
- `siret`, `ape_code`, `legal_capital`

---

## 5. Plan d'Implémentation en 5 Phases

### Phase 1 — Fondations literie (bon de commande conforme)

**Objectif** : Générer un bon de commande identique à celui utilisé en vrai magasin de literie.

Modules :
1. Variantes produits (taille + confort) — schema DB + UI produits + UI vente
2. Éco-participation par produit — champ sur fiche produit, calcul auto sur commande
3. Bon de commande PDF refondu — fidèle au format réel observé
4. Acompte multi-mode sur commandes (CB/espèces/virement/chèque/financement)
5. Champ "À encaisser à la livraison" (solde calculé auto)
6. Reprise ancien matelas (4 options checkbox sur commande)
7. Informations légales workspace (SIRET, APE, capital) dans Settings

### Phase 2 — Contremarques & Livraisons

**Objectif** : Gérer tout le flux fournisseur→client et planifier les livraisons.

Modules :
1. Système de contremarques — création depuis commande client, lien vers bon de commande fournisseur
2. Vue "Contremarques en attente" — ce qui manque par fournisseur
3. Réception marchandise — marquer une contremarque comme reçue, allocation auto
4. Planning livraisons — vue calendrier + création de tournées
5. Vue "Prêt à livrer" — commandes avec contremarque reçue + acompte ok
6. Bon de livraison PDF — avec reprise matelas, signature, solde à encaisser
7. Étiquettes produits imprimables (référence, client, adresse)

### Phase 3 — Communication automatique

**Objectif** : Automatiser la communication client sans effort.

Modules :
1. Intégration SMS (Brevo API) — configuration dans Settings
2. SMS confirmation commande (envoi auto à la création)
3. SMS rappel livraison (veille J-1, envoi auto)
4. SMS post-livraison avec lien avis Google (envoi auto après signature bon de livraison)
5. Template SMS éditables dans Settings

### Phase 4 — SAV renforcé

**Objectif** : SAV professionnel avec tracking garanties.

Modules :
1. Type SAV sélectionnable (4 types distincts)
2. Lien vers commande d'origine obligatoire
3. Suivi garantie constructeur par produit vendu (date expiration auto)
4. Alerte SAV "100 nuits" (liste clients dont le délai approche)
5. Bon de reprise produit PDF
6. Contremarque SAV auto (si échange nécessite une nouvelle commande fournisseur)

### Phase 5 — UX Terrain & Statistiques

**Objectif** : Interface adaptée à chaque rôle sur le terrain.

Modules :
1. Dashboard gérant "matin" — livraisons du jour / contremarques reçues / commandes sans acompte / SAV ouverts
2. Interface livreur mobile — tournée du jour, adresses, bon de livraison, bouton "livré"
3. Vue vendeur tablette — recherche produit rapide avec variantes, création devis fluide
4. Statistiques vendeurs — CA / devis→commandes conversion / panier moyen par vendeur
5. Neo IA enrichi — contexte literie (peut répondre à "quelles contremarques sont en attente ?")

---

## 6. Coûts Additionnels Estimés

| Service | Usage | Coût estimé |
|---------|-------|-------------|
| **Brevo SMS** | ~100-500 SMS/mois/magasin | Gratuit jusqu'à 300/jour ; ~20€/mois au-delà |
| **PDF generation** | Déjà existant (Edge Function) | 0€ |
| **Google Reviews** | Lien statique | 0€ |
| **Carte livraisons** | OpenStreetMap + Leaflet | 0€ |

Pas de nouveau service critique payant obligatoire pour les phases 1-4.

---

## 7. Questions Ouvertes (à confirmer avec cliente pilote)

- Quel logiciel utilisent-ils actuellement ?
- Comment gèrent-ils les contremarques aujourd'hui ?
- Combien de fournisseurs (~3 ou ~20 ?)
- Comment organisent-ils les tournées actuellement ?
- SMS déjà utilisés ou nouvelle pratique ?
- Solde : toujours à la livraison ou parfois avant/après ?
- Bon de livraison = document séparé ou même bon de commande annoté ?

---

## 8. Hors Périmètre (phases futures)

- Certification NF525 (caisse physique)
- Multi-sites
- Intégration Cofidis/Cetelem (crédit consommation)
- Export comptabilité automatique
- Application mobile native livreur
- E-invoicing 2026-2027
