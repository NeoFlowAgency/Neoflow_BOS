-- ============================================================
-- NeoFlow BOS — Documentation Seed v6.002
-- 18 articles couvrant tous les modules de l'application
-- A executer dans le SQL Editor Supabase apres v6_001
-- ============================================================
-- Utilise le dollar-quoting ($doc$) pour eviter tout probleme
-- d'echappement avec les apostrophes et accents francais.
-- ============================================================

INSERT INTO documentation_articles (title, slug, content, category, position, is_published) VALUES

-- ─────────────────────────────────────────────────────────────
-- PRISE EN MAIN
-- ─────────────────────────────────────────────────────────────

(
  'Bienvenue sur NeoFlow BOS',
  'bienvenue',
  $doc$
# Bienvenue sur NeoFlow BOS

NeoFlow BOS est votre **systeme de gestion complet** pour un magasin de literie. Il centralise vos ventes, votre stock, vos fournisseurs, vos livraisons et vos statistiques dans une seule application.

## Ce que vous pouvez faire avec NeoFlow BOS

- **Vendre** : vente rapide comptoir ou commande standard avec suivi de paiement
- **Gerer le stock** : niveaux par emplacement, alertes de rupture, mouvements automatiques
- **Suivre les fournisseurs** : fiches fournisseurs, bons de commande, receptions
- **Organiser les livraisons** : planification, assignation livreur, suivi en temps reel
- **Analyser les performances** : CA, marges, taux de conversion, statistiques vendeurs
- **Documenter** : base de connaissances accessible a toute l'equipe

## Structure de l'application

L'application est organisee autour de la **commande** comme element central. Toute vente genere une commande, qu'elle soit rapide (comptoir) ou standard (avec devis prealable). Les factures, paiements et livraisons sont tous rattaches a une commande.

## Prochaines etapes

1. Configurez votre workspace dans **Parametres > Workspace** (nom, logo, informations legales)
2. Ajoutez vos produits dans **Produits** avec prix de vente, cout d'achat et stock initial
3. Creez vos emplacements de stock dans **Stock > Emplacements**
4. Invitez votre equipe dans **Parametres > Workspace > Membres**

> Besoin d'aide ? Consultez les autres articles de cette documentation ou contactez le support via **Parametres > Support**.
  $doc$,
  'prise-en-main',
  1,
  true
),

(
  'Roles et permissions',
  'roles-permissions',
  $doc$
# Roles et permissions

NeoFlow BOS utilise un systeme de **4 roles** pour controler l'acces aux fonctionnalites selon la responsabilite de chaque membre de l'equipe.

## Les 4 roles

### Proprietaire
Acces complet a toutes les fonctionnalites, y compris :
- Gestion de l'abonnement Stripe
- Suppression du workspace
- Modification des roles de tous les membres
- Visualisation des marges et couts d'achat
- Administration de la documentation

### Manager
Memes droits que le proprietaire sur les donnees metier, sauf :
- Pas d'acces a la gestion de l'abonnement
- Ne peut pas supprimer le workspace
- Ne peut pas modifier le role du proprietaire

Le manager voit les marges, couts d'achat et statistiques completes.

### Vendeur
Acces aux operations de vente quotidiennes :
- Vente rapide, commandes, devis, factures
- Gestion des clients
- Livraisons (toutes)
- Stock en **lecture seule**
- Pas d'acces aux marges ni aux statistiques avancees
- Pas d'acces aux fournisseurs

### Livreur
Acces limite aux livraisons assignees :
- Voir uniquement ses livraisons du jour
- Enregistrer un paiement a la livraison
- Consulter le stock en lecture seule (pour verifier le chargement)
- Pas d'acces aux ventes, clients, produits, statistiques

## Regles importantes

- Il ne peut y avoir qu'**un seul proprietaire** par workspace
- Les couts d'achat et les marges ne sont **jamais visibles** dans les documents clients (devis, factures)
- Un livreur ne voit que les livraisons qui lui sont explicitement assignees

## Modifier un role

Dans **Parametres > Workspace > Membres**, cliquez sur un membre puis modifiez son role dans le menu deroulant. Seul le proprietaire peut modifier le role d'un manager ou se designer un successeur.
  $doc$,
  'prise-en-main',
  2,
  true
),

(
  'Configurer votre workspace',
  'configurer-workspace',
  $doc$
# Configurer votre workspace

Le workspace represente votre magasin. Les informations saisies ici apparaissent sur vos devis, factures et bons de commande.

## Informations generales

Dans **Parametres > Workspace**, renseignez :

- **Nom du magasin** : apparait sur tous les documents
- **Logo** : formats acceptes JPG, PNG, WebP — recommande : carre, fond transparent
- **Adresse complete** : rue, code postal, ville, pays
- **Telephone et email professionnel**
- **Site web** (optionnel)

## Informations legales

- **Forme juridique** : SAS, SARL, Auto-entrepreneur, etc.
- **SIRET** : obligatoire sur les factures en France
- **Numero TVA intracommunautaire** : si assujetti a la TVA

## Coordonnees bancaires

Si vous souhaitez faire apparaitre votre RIB sur les factures pour les paiements par virement :

- **IBAN**
- **BIC/SWIFT**
- **Titulaire du compte**

## Pied de page des documents

Personnalisez le texte affiche en bas de vos factures et devis (conditions de paiement, mentions legales specifiques, garanties, etc.).

## Conditions de paiement

Indiquez vos conditions standard, par exemple : *"Paiement a 30 jours fin de mois"* ou *"Acompte 30% a la commande, solde a la livraison"*. Ce texte apparaitra sur chaque facture.

## Inviter des membres

Dans l'onglet **Membres**, cliquez sur **Inviter** pour envoyer un lien d'invitation par email. Definissez le role avant d'envoyer. Les invitations expirent apres 7 jours.
  $doc$,
  'prise-en-main',
  3,
  true
),

-- ─────────────────────────────────────────────────────────────
-- VENTES
-- ─────────────────────────────────────────────────────────────

(
  'Vente rapide : encaisser en 3 clics',
  'vente-rapide',
  $doc$
# Vente rapide : encaisser en 3 clics

La vente rapide est concue pour les **ventes comptoir** ou la rapidite prime : client de passage, achat direct sans devis prealable, client inconnu.

## Quand utiliser la vente rapide ?

- Client qui achete sur place sans rendez-vous
- Vente sans livraison (retrait immediat)
- Petits achats (oreillers, accessoires, etc.)
- Tout cas ou vous n'avez pas besoin de creer un dossier client complet

## Le processus en 3 etapes

### 1. Selectionner les produits

Recherchez vos produits par nom ou reference. Ajustez les quantites. Appliquez une remise sur une ligne si necessaire (€ ou %). Vous pouvez aussi saisir une remise globale sur la commande.

### 2. Choisir le mode de paiement

Selectionnez le moyen de paiement :
- **Especes** — un calcul de rendu monnaie optionnel est disponible
- **Carte bancaire**
- **Cheque**
- **Virement bancaire**

### 3. Confirmer

Cliquez sur **Encaisser**. NeoFlow BOS cree automatiquement :
- Une **commande** de type *Vente rapide* avec le statut *Termine*
- Un **paiement** integral associe
- Une **facture simplifiee** (obligation legale francaise pour les particuliers)

## Client optionnel

Le client est **facultatif** pour la vente rapide. Si vous connaissez le client, recherchez-le ou creez-le rapidement. La vente sera alors associee a sa fiche et apparaitra dans son historique.

## Apres la vente

La vente apparait dans la liste **Commandes** avec le tag *Vente rapide*. La facture simplifiee est disponible en PDF depuis la fiche commande.
  $doc$,
  'ventes',
  1,
  true
),

(
  'Creer et suivre une commande standard',
  'commande-standard',
  $doc$
# Creer et suivre une commande standard

La commande standard est le coeur de NeoFlow BOS. Elle convient aux ventes avec livraison, aux commandes de matelas avec acompte, et a tout achat necessitant un suivi complet.

## Creer une commande

Cliquez sur **Nouvelle commande** depuis le tableau de bord ou depuis le menu **Ventes > Commandes**.

### 1. Client
Recherchez un client existant ou creez-en un nouveau directement dans le formulaire. Le client est **obligatoire** si la commande necessite une livraison a domicile.

### 2. Produits
Ajoutez des lignes produits :
- Recherche par nom ou reference
- Quantite, prix unitaire HT (pre-rempli depuis le catalogue)
- Remise par ligne (€ ou %)

### 3. Options
- **Remise globale** : appliquee sur le sous-total
- **Type de livraison** : Livraison a domicile / Retrait en magasin / Sans livraison
- **Notes** : instructions particulieres, preferences client

### 4. Confirmer
Cliquez sur **Creer la commande**. Elle est creee avec le statut **Confirme**.

## Statuts d'une commande

| Statut | Signification |
|--------|---------------|
| Brouillon | En cours de creation |
| Confirme | Commande validee, en attente de traitement |
| En cours | Production / preparation |
| Livre | Livraison effectuee, paiement potentiellement en attente |
| Termine | Commande entierement soldee |
| Annule | Commande annulee |

## Convertir un devis en commande

Depuis la fiche d'un devis accepte, cliquez sur **Convertir en commande**. Les lignes produits et les informations client sont reprises automatiquement.

## Modifier une commande

Les commandes en statut **Brouillon** ou **Confirme** peuvent etre modifiees. Au-dela, seules les notes et le statut sont editables.
  $doc$,
  'ventes',
  2,
  true
),

(
  'Enregistrer un paiement (acompte, solde)',
  'enregistrer-paiement',
  $doc$
# Enregistrer un paiement

NeoFlow BOS gere les **paiements multiples** par commande : acompte a la commande, paiements intermediaires, solde a la livraison.

## Acceder aux paiements

Ouvrez la fiche d'une commande (depuis **Ventes > Commandes**). La section **Paiements** affiche tous les paiements enregistres et la barre de progression.

## Enregistrer un nouveau paiement

Cliquez sur **Enregistrer un paiement**. Renseignez :

- **Type de paiement** :
  - *Acompte* — premier versement partiel
  - *Paiement partiel* — versement intermediaire
  - *Solde* — paiement du reste du
  - *Paiement complet* — reglement en une fois
- **Moyen de paiement** : Especes, Carte, Cheque, Virement, Autre
- **Montant** : pre-rempli avec le reste du, modifiable
- **Date** : aujourd'hui par defaut
- **Notes** : numero de cheque, reference virement, etc.

## Suivi automatique

Apres chaque paiement, NeoFlow BOS met a jour automatiquement :
- Le **montant paye** sur la commande
- Le **reste du**
- La **barre de progression** sur la fiche et dans la liste des commandes

Quand le reste du atteint 0, la commande passe automatiquement au statut **Termine**.

## Paiement a la livraison

Les livreurs peuvent enregistrer un paiement directement depuis leur vue Livraisons, au moment de la livraison. Cela met a jour la commande en temps reel.

## Acomptes en attente

Le tableau de bord affiche le **total des soldes a recuperer** (commandes livrees mais non entierement payees). Cliquez sur ce chiffre pour filtrer les commandes concernees.
  $doc$,
  'ventes',
  3,
  true
),

(
  'Gestion des devis',
  'gestion-devis',
  $doc$
# Gestion des devis

Les devis permettent de proposer un chiffrage a un client avant qu'il valide sa commande. Un devis accepte se convertit en commande en un clic.

## Creer un devis

Dans **Ventes > Devis**, cliquez sur **Nouveau devis**. Le formulaire est similaire a la creation de commande :

1. **Client** (obligatoire pour un devis)
2. **Produits** : lignes avec quantites et prix
3. **Remises** par ligne ou globale
4. **Date d'expiration** : par defaut +30 jours, modifiable
5. **Notes client** : affiche sur le devis PDF

> Les couts d'achat et les marges n'apparaissent jamais sur le PDF du devis.

## Statuts d'un devis

| Statut | Signification |
|--------|---------------|
| Brouillon | En cours de redaction |
| Envoye | Transmis au client, en attente de reponse |
| Accepte | Client a valide |
| Refuse | Client a refuse |
| Expire | Date d'expiration depassee |

## Convertir en commande

Depuis la fiche du devis, cliquez sur **Convertir en commande**. Un formulaire pre-rempli s'ouvre avec les produits et le client du devis. Vous pouvez ajuster avant de confirmer.

Le devis passe alors au statut **Accepte** et la commande est liee au devis (tracabilite complete).

## Taux de conversion

Le tableau de bord et les statistiques affichent le **taux de conversion devis > commande**, utile pour mesurer l'efficacite commerciale de l'equipe.
  $doc$,
  'ventes',
  4,
  true
),

(
  'Gestion des factures',
  'gestion-factures',
  $doc$
# Gestion des factures

Dans NeoFlow BOS, les factures sont **generees depuis les commandes**, pas creees independamment. Cette approche garantit la coherence entre ce qui a ete vendu et ce qui est facture.

## Types de factures

| Type | Utilisation |
|------|-------------|
| **Acompte** | Facture correspondant au premier versement |
| **Solde** | Facture du montant restant du |
| **Complete** | Facture de la totalite (paiement en une fois) |
| **Facture simplifiee** | Generee automatiquement pour les ventes rapides |

## Generer une facture depuis une commande

Depuis la fiche commande, section **Factures**, cliquez sur **Generer une facture**. Choisissez le type (acompte, solde, complete) selon l'etat du paiement.

## Telecharger le PDF

Cliquez sur l'icone PDF depuis la liste des factures ou depuis la fiche facture. Le PDF est genere avec toutes les mentions legales obligatoires :
- Numero de facture sequentiel
- Date d'emission
- Informations legales du workspace (SIRET, forme juridique, TVA)
- Detail des lignes avec TVA
- Coordonnees bancaires si renseignees

## Mentions legales

> Pour les ventes entre professionnels (B2B), les factures sont legalement obligatoires. Pour les particuliers, une facture simplifiee suffit pour les montants inferieurs a 150 EUR. NeoFlow BOS genere automatiquement le bon type.

## Numerotation

Les numeros de facture sont generes automatiquement de facon sequentielle par workspace et par annee (ex: *SLUG-FAC-2026-001*). La sequence ne peut pas etre modifiee manuellement pour garantir l'integrite comptable.
  $doc$,
  'ventes',
  5,
  true
),

-- ─────────────────────────────────────────────────────────────
-- STOCK
-- ─────────────────────────────────────────────────────────────

(
  'Comprendre la gestion du stock',
  'gestion-stock',
  $doc$
# Comprendre la gestion du stock

NeoFlow BOS gere un stock **multi-emplacement** avec des mouvements automatiques lies aux ventes et des mouvements manuels pour les ajustements.

## Concepts cles

### Quantite disponible
Nombre d'unites physiquement presentes dans un emplacement, disponibles a la vente.

### Quantite reservee
Unites reservees pour des commandes confirmees mais non encore expediees. Ces articles ne peuvent pas etre vendus a quelqu'un d'autre.

### Stock disponible reel = Disponible - Reserve

## Mouvements automatiques

| Evenement | Mouvement |
|-----------|----------|
| Commande confirmee | +Reservation |
| Paiement enregistre | -Stock, -Reservation |
| Commande annulee | -Reservation |
| Reception fournisseur | +Stock |

## Mouvements manuels

Depuis la page **Stock**, cliquez sur un produit pour acceder aux options :
- **Ajuster le stock** : corriger une erreur, inventaire physique
- **Transferer** : deplacer des unites d'un emplacement a un autre

Chaque mouvement est historise avec la date, l'utilisateur et la raison.

## Vente sans stock suffisant

NeoFlow BOS affiche un **avertissement** si vous tentez de vendre un produit dont le stock est insuffisant, mais ne bloque pas la vente. Le message indique le stock disponible par emplacement et les commandes fournisseur en attente.

> Il est possible de vendre en negatif (stock = -1) pour honorer une commande urgente, mais cela genere une alerte visible dans le tableau de bord.
  $doc$,
  'stock',
  1,
  true
),

(
  'Emplacements de stock',
  'emplacements-stock',
  $doc$
# Emplacements de stock

Les emplacements permettent de suivre le stock dans differents endroits physiques : salle d'exposition, entrepot, depot secondaire.

## Types d'emplacements

- **Magasin** : salle de vente, produits visibles par les clients
- **Entrepot** : stock de reserve, produits non exposes
- **Exposition** : articles en demonstration (peuvent etre vendus mais necessitent un delai)

## Emplacement par defaut

Lors de la creation de votre workspace, un emplacement **Magasin** est cree automatiquement. C'est vers cet emplacement que pointent les ajustements de stock par defaut.

## Creer un nouvel emplacement

Dans **Stock > Emplacements** (accessible aux proprietaires et managers), cliquez sur **Nouvel emplacement**. Renseignez :
- **Nom** : ex. "Entrepot Nord", "Depot Fournisseur"
- **Type** : Magasin / Entrepot / Exposition
- **Adresse** (optionnel)

## Vue multi-emplacement

La page principale **Stock** affiche un tableau croise :
- Lignes = produits
- Colonnes = emplacements
- Chaque cellule = stock disponible / reserve

Les codes couleur indiquent l'etat :
- **Vert** : stock correct
- **Orange** : stock faible (< seuil d'alerte)
- **Rouge** : rupture (stock = 0)

## Transfert entre emplacements

Pour deplacer du stock : dans la fiche produit ou depuis le tableau de stock, utilisez **Transferer**. Indiquez l'emplacement source, la destination et la quantite. Un mouvement est cree dans les deux emplacements.
  $doc$,
  'stock',
  2,
  true
),

(
  'Alertes de stock',
  'alertes-stock',
  $doc$
# Alertes de stock

NeoFlow BOS surveille automatiquement vos niveaux de stock et vous alerte quand une action est necessaire.

## Types d'alertes

### Rupture de stock
Produit dont la quantite disponible est **egale a 0** dans tous les emplacements. Le produit apparait en rouge dans la liste.

### Stock faible
Produit dont la quantite disponible est **inferieure au seuil d'alerte** (par defaut : 3 unites). Le produit apparait en orange.

### Commandes fournisseur en attente
Bons de commande passes aupres de fournisseurs mais non encore recus. Ces informations sont visibles dans la section Fournisseurs.

## Ou voir les alertes ?

- **Tableau de bord** : nombre de produits en alerte affiche dans le resume stock
- **Page Stock** : tableau avec codes couleurs et filtre "Alertes uniquement"
- **Statistiques** : section "Resume stock" avec valeur totale et nombre d'alertes

## Configurer le seuil d'alerte

Le seuil par defaut est **3 unites**. Pour modifier ce seuil pour un produit specifique, ouvrez la fiche produit et ajustez le champ **Seuil d'alerte stock**.

## Bonnes pratiques

- Consultez les alertes stock chaque matin avant l'ouverture
- Passez les bons de commande fournisseurs des qu'un produit passe en stock faible
- Utilisez le filtre "Ruptures" dans la page Stock pour prioriser les commandes urgentes
- Le stock d'exposition (articles en demonstration) doit etre comptabilise separement pour eviter les fausses ruptures
  $doc$,
  'stock',
  3,
  true
),

-- ─────────────────────────────────────────────────────────────
-- FOURNISSEURS
-- ─────────────────────────────────────────────────────────────

(
  'Gerer ses fournisseurs',
  'gerer-fournisseurs',
  $doc$
# Gerer ses fournisseurs

La section Fournisseurs vous permet de centraliser les informations de vos partenaires et de lier chaque produit a son ou ses fournisseurs.

## Acceder aux fournisseurs

**Fournisseurs** est visible dans le menu uniquement pour les **proprietaires et managers**. Les vendeurs et livreurs n'ont pas acces a cette section.

## Creer une fiche fournisseur

Cliquez sur **Nouveau fournisseur**. Renseignez :
- **Nom de l'entreprise**
- **Contact principal** : nom, email, telephone
- **Adresse** : utilisee sur les bons de commande
- **Notes** : conditions commerciales, delais habituels, informations utiles

## Lier un produit a un fournisseur

Depuis la fiche produit (dans **Produits**), section **Fournisseurs** :
- Associez un ou plusieurs fournisseurs
- Indiquez la **reference fournisseur** (son code article)
- Indiquez le **prix d'achat fournisseur** (peut differer du cout d'achat general)
- Designez le **fournisseur principal** (utilise par defaut pour les reapprovisionnements)

Depuis la fiche fournisseur, vous voyez egalement la liste des produits qu'il vous fournit.

## Archiver un fournisseur

Si vous ne travaillez plus avec un fournisseur, archivez-le plutot que de le supprimer. Il reste visible dans l'historique des commandes mais n'apparait plus dans les listes de selection.
  $doc$,
  'fournisseurs',
  1,
  true
),

(
  'Bons de commande fournisseur',
  'bons-commande-fournisseur',
  $doc$
# Bons de commande fournisseur

Les bons de commande (BC) permettent de commander des marchandises aupres de vos fournisseurs et de suivre les receptions pour mettre a jour le stock automatiquement.

## Creer un bon de commande

Dans **Fournisseurs > Creer un bon de commande** :

1. **Selectionner le fournisseur**
2. **Ajouter les produits** a commander avec les quantites et le cout HT par unite
3. **Date de livraison prevue** : permet d'anticiper le reapprovisionnement
4. **Notes** : instructions particulieres, references speciales

## Workflow d'un bon de commande

```
Brouillon -> Envoye -> Confirme -> Reception partielle -> Recu
```

- **Brouillon** : en cours de redaction, modifiable
- **Envoye** : transmis au fournisseur (email ou impression)
- **Confirme** : fournisseur a confirme la commande
- **Reception partielle** : une partie des articles est arrivee
- **Recu** : toute la marchandise est arrivee

## Recevoir la marchandise

Quand la livraison arrive, ouvrez le bon de commande et cliquez sur **Recevoir la marchandise**. Pour chaque ligne, indiquez la quantite reellement recue (peut differer de la quantite commandee).

NeoFlow BOS cree automatiquement un **mouvement de stock entrant** pour chaque produit recu. Le stock est mis a jour immediatement.

## Reception partielle

Si seulement une partie de la commande est livree, enregistrez les quantites recues. Le bon passe au statut *Reception partielle*. Vous pouvez enregistrer les livraisons suivantes jusqu'a reception complete.
  $doc$,
  'fournisseurs',
  2,
  true
),

-- ─────────────────────────────────────────────────────────────
-- LIVRAISONS
-- ─────────────────────────────────────────────────────────────

(
  'Planifier et suivre une livraison',
  'planifier-livraison',
  $doc$
# Planifier et suivre une livraison

NeoFlow BOS gere les livraisons a domicile et les retraits en magasin depuis une vue kanban intuitive.

## Creer une livraison

Une livraison est creee depuis la **fiche commande**, section **Livraison**. Cliquez sur **Planifier la livraison**. Renseignez :

- **Type** : Livraison a domicile / Retrait en magasin
- **Date prevue** et **creneau horaire** (ex: 14h-16h)
- **Adresse** : pre-remplie depuis la fiche client, modifiable
- **Livreur assigne** : selectionnez un membre de l'equipe avec le role Livreur
- **Frais de livraison** (optionnel)
- **Notes** : code d'acces, etage, instructions particulieres

## Workflow des livraisons

```
A planifier -> Planifiee -> En cours -> Livree
```

- **A planifier** : commande qui necessite une livraison, date non encore fixee
- **Planifiee** : date, creneau et livreur assignes
- **En cours** : livreur en route
- **Livree** : livraison confirmee par le livreur

Quand une livraison passe a **Livree**, la commande associee passe automatiquement au statut **Livre**.

## Vue Kanban

La page **Livraisons** affiche un tableau kanban avec 4 colonnes. Chaque carte affiche :
- Nom du client
- Numero de commande
- Type (badge Livraison / Retrait)
- Creneau horaire
- Livreur assigne
- Montant restant a encaisser

## Filtres disponibles

- Filtrer par date
- Filtrer par livreur
- Filtrer par type (livraison / retrait)
  $doc$,
  'livraisons',
  1,
  true
),

(
  'Guide du livreur',
  'guide-livreur',
  $doc$
# Guide du livreur

Ce guide est destine aux membres de l'equipe ayant le role **Livreur** dans NeoFlow BOS.

## Ce que vous voyez

En tant que livreur, votre acces est limite a l'essentiel pour votre travail :
- **Tableau de bord** : nombre de livraisons a effectuer
- **Livraisons** : uniquement les livraisons qui vous sont assignees
- **Stock** : en lecture seule (pour verifier la disponibilite avant le chargement)

## Vos livraisons du jour

Connectez-vous a NeoFlow BOS depuis votre telephone ou tablette. La page **Livraisons** affiche uniquement vos livraisons, triees par date et creneau horaire.

Chaque livraison indique :
- L'adresse de livraison
- Le creneau horaire
- Les articles a livrer (liste des produits de la commande)
- Le montant a encaisser (s'il reste un solde)

## Demarrer une livraison

Quand vous partez en livraison, passez la livraison au statut **En cours**. Cela avertit le manager que vous etes en route.

## Confirmer une livraison

Une fois la livraison effectuee, passez au statut **Livree**. Si le client vous regle un solde a ce moment :
1. Cliquez sur **Enregistrer un paiement**
2. Indiquez le moyen de paiement (especes, carte, cheque)
3. Confirmez le montant recu

La commande est automatiquement mise a jour.

## En cas de probleme

Si vous ne pouvez pas effectuer une livraison (client absent, acces impossible), passez-la en **Annulee** et ajoutez une note explicative. Prevenez votre manager pour replanifier.
  $doc$,
  'livraisons',
  2,
  true
),

-- ─────────────────────────────────────────────────────────────
-- STATISTIQUES
-- ─────────────────────────────────────────────────────────────

(
  'Comprendre le tableau de bord',
  'tableau-de-bord',
  $doc$
# Comprendre le tableau de bord

Le tableau de bord est votre **centre de pilotage quotidien**. Il affiche les indicateurs les plus importants de votre activite du jour.

## KPIs principaux (tous les roles sauf livreur)

### CA du mois
Somme des totaux TTC de toutes les commandes avec le statut **Termine** creees dans le mois en cours. Cliquez pour acceder aux statistiques detaillees.

### Benefice du mois *(managers et proprietaires)*
CA HT du mois moins la somme des couts d'achat des articles vendus. Indique votre marge brute reelle.

### Taux de conversion *(vendeurs)*
Pourcentage de devis qui ont abouti a une commande. Cliquez pour acceder a la liste des devis.

### Commandes en cours
Nombre de commandes avec les statuts *Confirme* ou *En cours*. Cliquez pour les voir.

### Livraisons a faire
Nombre de livraisons non encore livrees ni annulees. Cliquez pour acceder au kanban des livraisons.

## KPIs de gestion *(managers et proprietaires uniquement)*

### Acomptes en attente
Total des montants restants a encaisser sur les commandes en cours qui ont deja recu un acompte.

### Soldes a recuperer
Total des montants restants sur les commandes au statut **Livre** (livrees mais pas entierement payees).

### Marge moyenne
Marge brute moyenne de toutes les ventes terminees ce mois, exprimee en pourcentage.

## Actions rapides

Les 4 boutons d'action rapide vous permettent de demarrer les taches les plus frequentes en un clic : Vente rapide, Nouvelle commande, Clients, Livraisons.

## Dernieres commandes

Les 5 commandes les plus recentes avec leur statut et leur progression de paiement (barre bleue).
  $doc$,
  'statistiques',
  1,
  true
),

(
  'Statistiques avancees et marges',
  'statistiques-avancees',
  $doc$
# Statistiques avancees et marges

La page **Statistiques** est accessible aux **proprietaires et managers**. Elle offre une analyse approfondie de la performance commerciale.

## Evolution du chiffre d'affaires

Graphique en barres affichant le CA mensuel sur les 12 derniers mois. Base sur les commandes terminees.

## Repartition des commandes

Camembert montrant la repartition des commandes par statut (Confirme, En cours, Livre, Termine, Annule). Permet de visualiser d'un coup d'oeil l'etat du carnet de commandes.

## Marge par produit

Histogramme horizontal des 10 produits les plus vendus avec leur **marge brute unitaire** (prix de vente HT - cout d'achat HT). Identifiez vos produits les plus et moins rentables.

> Cette section est strictement reservee aux managers et proprietaires. Les marges et couts n'apparaissent jamais sur les documents clients.

## Performance vendeurs

Tableau recapitulatif par vendeur :
- Nombre de commandes
- CA genere
- Marge totale
- Taux de conversion devis > commande

## Produits faible rotation

Liste des produits qui n'ont pas ete vendus depuis plus de 30 jours. Signal d'alerte pour adapter les promotions ou le reassort.

## Resume stock

- **Valeur totale du stock** : somme (quantite x cout d'achat) pour tous les emplacements
- **Nombre d'alertes** : produits en rupture ou stock faible

## Livraisons en retard

Liste des livraisons dont la date prevue est depassee et qui ne sont pas encore livrees ni annulees. A traiter en priorite.
  $doc$,
  'statistiques',
  2,
  true
),

-- ─────────────────────────────────────────────────────────────
-- FAQ
-- ─────────────────────────────────────────────────────────────

(
  'Questions frequentes (FAQ)',
  'faq',
  $doc$
# Questions frequentes

## General

### Puis-je utiliser NeoFlow BOS depuis mon telephone ?
Oui. L'application est responsive et fonctionne sur mobile. Les livreurs utilisent generalement leur telephone pour gerer leurs livraisons du jour.

### Comment changer ma devise ?
Dans **Parametres > Workspace**, selectionnez votre devise dans le champ prevu. La devise est appliquee sur tous les documents (factures, devis, bons de commande).

### Puis-je avoir plusieurs magasins dans un meme workspace ?
Non, un workspace represente un seul magasin. Pour gerer plusieurs points de vente, creez plusieurs workspaces. Une fonctionnalite de gestion multi-magasins est prevue dans une prochaine version.

---

## Ventes

### Quelle difference entre vente rapide et commande standard ?
La **vente rapide** est pour les achats comptoir immediats — sans livraison, reglement complet sur place, client optionnel. La **commande standard** est pour les ventes avec livraison, paiements multiples (acompte + solde), ou necessitant un suivi complet.

### Peut-on modifier une facture deja generee ?
Non. Pour des raisons legales, une facture emise ne peut pas etre modifiee. En cas d'erreur, annulez la commande et recreez-en une nouvelle.

### Comment annuler une commande ?
Ouvrez la fiche commande, cliquez sur **Changer le statut** et selectionnez **Annule**. Si des paiements ont ete enregistres, un remboursement manuel sera necessaire.

---

## Stock

### Le stock se met-il a jour automatiquement lors d'une vente ?
Oui. Lors de la confirmation d'une commande, le stock est **reserve**. Lors de l'enregistrement du premier paiement, le stock est **debite**. Si la commande est annulee, la reservation est liberee.

### Peut-on vendre un produit en rupture de stock ?
Oui, NeoFlow BOS affiche un avertissement mais ne bloque pas la vente. Il est possible de vendre avec un stock negatif pour une commande urgente. Regularisez des que la marchandise arrive.

---

## Abonnement

### Comment modifier ma carte de paiement ?
Dans **Parametres > Abonnement**, cliquez sur **Gerer l'abonnement**. Vous accedez au portail Stripe ou vous pouvez modifier votre moyen de paiement.

### Mon workspace est suspendu, que faire ?
Un workspace est suspendu apres 3 jours de grace suivant un echec de paiement. Mettez a jour votre moyen de paiement dans le portail Stripe pour reactiver immediatement votre acces.

---

## Support

### Comment signaler un bug ?
Utilisez le formulaire dans **Parametres > Support > Signaler un bug**. Decrivez le probleme, les etapes pour le reproduire et joignez une capture d'ecran si possible.

### Comment contacter l'equipe NeoFlow ?
Email : **contacte.neoflowagency@gmail.com** — reponse sous 24h ouvrees.
  $doc$,
  'faq',
  1,
  true
)

ON CONFLICT (slug) DO UPDATE SET
  title        = EXCLUDED.title,
  content      = EXCLUDED.content,
  category     = EXCLUDED.category,
  position     = EXCLUDED.position,
  is_published = EXCLUDED.is_published,
  updated_at   = now();
