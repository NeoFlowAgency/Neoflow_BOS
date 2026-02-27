-- ============================================================
-- NeoFlow BOS — Documentation Seed v6.002
-- 18 articles couvrant tous les modules de l'application
-- À exécuter dans le SQL Editor Supabase après v6_001
-- ============================================================

-- S'assurer que la table existe avant d'insérer
-- (la table documentation_articles est créée dans v6_001)

INSERT INTO documentation_articles (title, slug, content, category, position, is_published) VALUES

-- ─────────────────────────────────────────────────────────────
-- PRISE EN MAIN
-- ─────────────────────────────────────────────────────────────

(
  'Bienvenue sur NeoFlow BOS',
  'bienvenue',
  E'# Bienvenue sur NeoFlow BOS\n\nNeoFlow BOS est votre **système de gestion complet** pour un magasin de literie. Il centralise vos ventes, votre stock, vos fournisseurs, vos livraisons et vos statistiques dans une seule application.\n\n## Ce que vous pouvez faire avec NeoFlow BOS\n\n- **Vendre** : vente rapide comptoir ou commande standard avec suivi de paiement\n- **Gérer le stock** : niveaux par emplacement, alertes de rupture, mouvements automatiques\n- **Suivre les fournisseurs** : fiches fournisseurs, bons de commande, réceptions\n- **Organiser les livraisons** : planification, assignation livreur, suivi en temps réel\n- **Analyser les performances** : CA, marges, taux de conversion, statistiques vendeurs\n- **Documenter** : base de connaissances accessible à toute l'équipe\n\n## Structure de l''application\n\nL''application est organisée autour de la **commande** comme élément central. Toute vente génère une commande, qu''elle soit rapide (comptoir) ou standard (avec devis préalable). Les factures, paiements et livraisons sont tous rattachés à une commande.\n\n## Prochaines étapes\n\n1. Configurez votre workspace dans **Paramètres → Workspace** (nom, logo, informations légales)\n2. Ajoutez vos produits dans **Produits** avec prix de vente, coût d''achat et stock initial\n3. Créez vos emplacements de stock dans **Stock → Emplacements**\n4. Invitez votre équipe dans **Paramètres → Workspace → Membres**\n\n> Besoin d''aide ? Consultez les autres articles de cette documentation ou contactez le support via **Paramètres → Support**.',
  'prise-en-main',
  1,
  true
),

(
  'Rôles et permissions',
  'roles-permissions',
  E'# Rôles et permissions\n\nNeoFlow BOS utilise un système de **4 rôles** pour contrôler l''accès aux fonctionnalités selon la responsabilité de chaque membre de l''équipe.\n\n## Les 4 rôles\n\n### Propriétaire\nAccès complet à toutes les fonctionnalités, y compris :\n- Gestion de l''abonnement Stripe\n- Suppression du workspace\n- Modification des rôles de tous les membres\n- Visualisation des marges et coûts d''achat\n- Administration de la documentation\n\n### Manager\nMêmes droits que le propriétaire sur les données métier, sauf :\n- Pas d''accès à la gestion de l''abonnement\n- Ne peut pas supprimer le workspace\n- Ne peut pas modifier le rôle du propriétaire\n\nLe manager voit les marges, coûts d''achat et statistiques complètes.\n\n### Vendeur\nAccès aux opérations de vente quotidiennes :\n- Vente rapide, commandes, devis, factures\n- Gestion des clients\n- Livraisons (toutes)\n- Stock en **lecture seule**\n- Pas d''accès aux marges ni aux statistiques avancées\n- Pas d''accès aux fournisseurs\n\n### Livreur\nAccès limité aux livraisons assignées :\n- Voir uniquement ses livraisons du jour\n- Enregistrer un paiement à la livraison\n- Consulter le stock en lecture seule (pour vérifier le chargement)\n- Pas d''accès aux ventes, clients, produits, statistiques\n\n## Règles importantes\n\n- Il ne peut y avoir qu''**un seul propriétaire** par workspace\n- Les coûts d''achat et les marges ne sont **jamais visibles** dans les documents clients (devis, factures)\n- Un livreur ne voit que les livraisons qui lui sont explicitement assignées\n\n## Modifier un rôle\n\nDans **Paramètres → Workspace → Membres**, cliquez sur un membre puis modifiez son rôle dans le menu déroulant. Seul le propriétaire peut modifier le rôle d''un manager ou se désigner un successeur.',
  'prise-en-main',
  2,
  true
),

(
  'Configurer votre workspace',
  'configurer-workspace',
  E'# Configurer votre workspace\n\nLe workspace représente votre magasin. Les informations saisies ici apparaissent sur vos devis, factures et bons de commande.\n\n## Informations générales\n\nDans **Paramètres → Workspace**, renseignez :\n\n- **Nom du magasin** : apparaît sur tous les documents\n- **Logo** : formats acceptés JPG, PNG, WebP — recommandé : carré, fond transparent\n- **Adresse complète** : rue, code postal, ville, pays\n- **Téléphone et email professionnel**\n- **Site web** (optionnel)\n\n## Informations légales\n\n- **Forme juridique** : SAS, SARL, Auto-entrepreneur, etc.\n- **SIRET** : obligatoire sur les factures en France\n- **Numéro TVA intracommunautaire** : si assujetti à la TVA\n\n## Coordonnées bancaires\n\nSi vous souhaitez faire apparaître votre RIB sur les factures pour les paiements par virement :\n\n- **IBAN**\n- **BIC/SWIFT**\n- **Titulaire du compte**\n\n## Pied de page des documents\n\nPersonnalisez le texte affiché en bas de vos factures et devis (conditions de paiement, mentions légales spécifiques, garanties, etc.).\n\n## Conditions de paiement\n\nIndiquez vos conditions standard, par exemple : *"Paiement à 30 jours fin de mois"* ou *"Acompte 30% à la commande, solde à la livraison"*. Ce texte apparaîtra sur chaque facture.\n\n## Inviter des membres\n\nDans l''onglet **Membres**, cliquez sur **Inviter** pour envoyer un lien d''invitation par email. Définissez le rôle avant d''envoyer. Les invitations expirent après 7 jours.',
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
  E'# Vente rapide : encaisser en 3 clics\n\nLa vente rapide est conçue pour les **ventes comptoir** où la rapidité prime : client de passage, achat direct sans devis préalable, client inconnu.\n\n## Quand utiliser la vente rapide ?\n\n- Client qui achète sur place sans rendez-vous\n- Vente sans livraison (retrait immédiat)\n- Petits achats (oreillers, accessoires, etc.)\n- Tout cas où vous n''avez pas besoin de créer un dossier client complet\n\n## Le processus en 3 étapes\n\n### 1. Sélectionner les produits\n\nRecherchez vos produits par nom ou référence. Ajustez les quantités. Appliquez une remise sur une ligne si nécessaire (€ ou %). Vous pouvez aussi saisir une remise globale sur la commande.\n\n### 2. Choisir le mode de paiement\n\nSélectionnez le moyen de paiement :\n- **Espèces** — un calcul de rendu monnaie optionnel est disponible\n- **Carte bancaire**\n- **Chèque**\n- **Virement bancaire**\n\n### 3. Confirmer\n\nCliquez sur **Encaisser**. NeoFlow BOS crée automatiquement :\n- Une **commande** de type *Vente rapide* avec le statut *Terminé*\n- Un **paiement** intégral associé\n- Une **facture simplifiée** (obligation légale française pour les particuliers)\n\n## Client optionnel\n\nLe client est **facultatif** pour la vente rapide. Si vous connaissez le client, recherchez-le ou créez-le rapidement. La vente sera alors associée à sa fiche et apparaîtra dans son historique.\n\n## Après la vente\n\nLa vente apparaît dans la liste **Commandes** avec le tag *Vente rapide*. La facture simplifiée est disponible en PDF depuis la fiche commande.',
  'ventes',
  1,
  true
),

(
  'Créer et suivre une commande standard',
  'commande-standard',
  E'# Créer et suivre une commande standard\n\nLa commande standard est le cœur de NeoFlow BOS. Elle convient aux ventes avec livraison, aux commandes de matelas avec acompte, et à tout achat nécessitant un suivi complet.\n\n## Créer une commande\n\nCliquez sur **Nouvelle commande** depuis le tableau de bord ou depuis le menu **Ventes → Commandes**.\n\n### 1. Client\nRecherchez un client existant ou créez-en un nouveau directement dans le formulaire. Le client est **obligatoire** si la commande nécessite une livraison à domicile.\n\n### 2. Produits\nAjoutez des lignes produits :\n- Recherche par nom ou référence\n- Quantité, prix unitaire HT (pré-rempli depuis le catalogue)\n- Remise par ligne (€ ou %)\n\n### 3. Options\n- **Remise globale** : appliquée sur le sous-total\n- **Type de livraison** : Livraison à domicile / Retrait en magasin / Sans livraison\n- **Notes** : instructions particulières, préférences client\n\n### 4. Confirmer\nCliquez sur **Créer la commande**. Elle est créée avec le statut **Confirmé**.\n\n## Statuts d''une commande\n\n| Statut | Signification |\n|--------|---------------|\n| Brouillon | En cours de création |\n| Confirmé | Commande validée, en attente de traitement |\n| En cours | Production / préparation |\n| Livré | Livraison effectuée, paiement potentiellement en attente |\n| Terminé | Commande entièrement soldée |\n| Annulé | Commande annulée |\n\n## Convertir un devis en commande\n\nDepuis la fiche d''un devis accepté, cliquez sur **Convertir en commande**. Les lignes produits et les informations client sont reprises automatiquement.\n\n## Modifier une commande\n\nLes commandes en statut **Brouillon** ou **Confirmé** peuvent être modifiées. Au-delà, seules les notes et le statut sont éditables.',
  'ventes',
  2,
  true
),

(
  'Enregistrer un paiement (acompte, solde)',
  'enregistrer-paiement',
  E'# Enregistrer un paiement\n\nNeoFlow BOS gère les **paiements multiples** par commande : acompte à la commande, paiements intermédiaires, solde à la livraison.\n\n## Accéder aux paiements\n\nOuvrez la fiche d''une commande (depuis **Ventes → Commandes**). La section **Paiements** affiche tous les paiements enregistrés et la barre de progression.\n\n## Enregistrer un nouveau paiement\n\nCliquez sur **Enregistrer un paiement**. Renseignez :\n\n- **Type de paiement** :\n  - *Acompte* — premier versement partiel\n  - *Paiement partiel* — versement intermédiaire\n  - *Solde* — paiement du reste dû\n  - *Paiement complet* — règlement en une fois\n- **Moyen de paiement** : Espèces, Carte, Chèque, Virement, Autre\n- **Montant** : pré-rempli avec le reste dû, modifiable\n- **Date** : aujourd''hui par défaut\n- **Notes** : numéro de chèque, référence virement, etc.\n\n## Suivi automatique\n\nAprès chaque paiement, NeoFlow BOS met à jour automatiquement :\n- Le **montant payé** sur la commande\n- Le **reste dû**\n- La **barre de progression** sur la fiche et dans la liste des commandes\n\nQuand le reste dû atteint 0, la commande passe automatiquement au statut **Terminé**.\n\n## Paiement à la livraison\n\nLes livreurs peuvent enregistrer un paiement directement depuis leur vue Livraisons, au moment de la livraison. Cela met à jour la commande en temps réel.\n\n## Acomptes en attente\n\nLe tableau de bord affiche le **total des soldes à récupérer** (commandes livrées mais non entièrement payées). Cliquez sur ce chiffre pour filtrer les commandes concernées.',
  'ventes',
  3,
  true
),

(
  'Gestion des devis',
  'gestion-devis',
  E'# Gestion des devis\n\nLes devis permettent de proposer un chiffrage à un client avant qu''il valide sa commande. Un devis accepté se convertit en commande en un clic.\n\n## Créer un devis\n\nDans **Ventes → Devis**, cliquez sur **Nouveau devis**. Le formulaire est similaire à la création de commande :\n\n1. **Client** (obligatoire pour un devis)\n2. **Produits** : lignes avec quantités et prix\n3. **Remises** par ligne ou globale\n4. **Date d''expiration** : par défaut +30 jours, modifiable\n5. **Notes client** : affiché sur le devis PDF\n\n> Les coûts d''achat et les marges n''apparaissent jamais sur le PDF du devis.\n\n## Statuts d''un devis\n\n| Statut | Signification |\n|--------|---------------|\n| Brouillon | En cours de rédaction |\n| Envoyé | Transmis au client, en attente de réponse |\n| Accepté | Client a validé |\n| Refusé | Client a refusé |\n| Expiré | Date d''expiration dépassée |\n\n## Convertir en commande\n\nDepuis la fiche du devis, cliquez sur **Convertir en commande**. Un formulaire pré-rempli s''ouvre avec les produits et le client du devis. Vous pouvez ajuster avant de confirmer.\n\nLe devis passe alors au statut **Accepté** et la commande est liée au devis (traçabilité complète).\n\n## Taux de conversion\n\nLe tableau de bord et les statistiques affichent le **taux de conversion devis → commande**, utile pour mesurer l''efficacité commerciale de l''équipe.',
  'ventes',
  4,
  true
),

(
  'Gestion des factures',
  'gestion-factures',
  E'# Gestion des factures\n\nDans NeoFlow BOS, les factures sont **générées depuis les commandes**, pas créées indépendamment. Cette approche garantit la cohérence entre ce qui a été vendu et ce qui est facturé.\n\n## Types de factures\n\n| Type | Utilisation |\n|------|-------------|\n| **Acompte** | Facture correspondant au premier versement |\n| **Solde** | Facture du montant restant dû |\n| **Complète** | Facture de la totalité (paiement en une fois) |\n| **Facture simplifiée** | Générée automatiquement pour les ventes rapides |\n\n## Générer une facture depuis une commande\n\nDepuis la fiche commande, section **Factures**, cliquez sur **Générer une facture**. Choisissez le type (acompte, solde, complète) selon l''état du paiement.\n\n## Télécharger le PDF\n\nCliquez sur l''icône PDF depuis la liste des factures ou depuis la fiche facture. Le PDF est généré avec toutes les mentions légales obligatoires :\n- Numéro de facture séquentiel\n- Date d''émission\n- Informations légales du workspace (SIRET, forme juridique, TVA)\n- Détail des lignes avec TVA\n- Coordonnées bancaires si renseignées\n\n## Mentions légales\n\n> Pour les ventes entre professionnels (B2B), les factures sont légalement obligatoires. Pour les particuliers, une facture simplifiée suffit pour les montants inférieurs à 150 €. NeoFlow BOS génère automatiquement le bon type.\n\n## Numérotation\n\nLes numéros de facture sont générés automatiquement de façon séquentielle par workspace et par année (ex: *SLUG-FAC-2026-001*). La séquence ne peut pas être modifiée manuellement pour garantir l''intégrité comptable.',
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
  E'# Comprendre la gestion du stock\n\nNeoFlow BOS gère un stock **multi-emplacement** avec des mouvements automatiques liés aux ventes et des mouvements manuels pour les ajustements.\n\n## Concepts clés\n\n### Quantité disponible\nNombre d''unités physiquement présentes dans un emplacement, disponibles à la vente.\n\n### Quantité réservée\nUnités réservées pour des commandes confirmées mais non encore expédiées. Ces articles ne peuvent pas être vendus à quelqu''un d''autre.\n\n### Stock disponible réel = Disponible - Réservé\n\n## Mouvements automatiques\n\n| Événement | Mouvement |\n|-----------|----------|\n| Commande confirmée | +Réservation |\n| Paiement enregistré | -Stock, -Réservation |\n| Commande annulée | -Réservation |\n| Réception fournisseur | +Stock |\n\n## Mouvements manuels\n\nDepuis la page **Stock**, cliquez sur un produit pour accéder aux options :\n- **Ajuster le stock** : corriger une erreur, inventaire physique\n- **Transférer** : déplacer des unités d''un emplacement à un autre\n\nChaque mouvement est historisé avec la date, l''utilisateur et la raison.\n\n## Vente sans stock suffisant\n\nNeoFlow BOS affiche un **avertissement** si vous tentez de vendre un produit dont le stock est insuffisant, mais ne bloque pas la vente. Le message indique le stock disponible par emplacement et les commandes fournisseur en attente.\n\n> Il est possible de vendre en négatif (stock = -1) pour honorer une commande urgente, mais cela génère une alerte visible dans le tableau de bord.',
  'stock',
  1,
  true
),

(
  'Emplacements de stock',
  'emplacements-stock',
  E'# Emplacements de stock\n\nLes emplacements permettent de suivre le stock dans différents endroits physiques : salle d''exposition, entrepôt, dépôt secondaire.\n\n## Types d''emplacements\n\n- **Magasin** : salle de vente, produits visibles par les clients\n- **Entrepôt** : stock de réserve, produits non exposés\n- **Exposition** : articles en démonstration (peuvent être vendus mais nécessitent un délai)\n\n## Emplacement par défaut\n\nLors de la création de votre workspace, un emplacement **Magasin** est créé automatiquement. C''est vers cet emplacement que pointent les ajustements de stock par défaut.\n\n## Créer un nouvel emplacement\n\nDans **Stock → Emplacements** (accessible aux propriétaires et managers), cliquez sur **Nouvel emplacement**. Renseignez :\n- **Nom** : ex. "Entrepôt Nord", "Dépôt Fournisseur"\n- **Type** : Magasin / Entrepôt / Exposition\n- **Adresse** (optionnel)\n\n## Vue multi-emplacement\n\nLa page principale **Stock** affiche un tableau croisé :\n- Lignes = produits\n- Colonnes = emplacements\n- Chaque cellule = stock disponible / réservé\n\nLes codes couleur indiquent l''état :\n- **Vert** : stock correct\n- **Orange** : stock faible (< seuil d''alerte)\n- **Rouge** : rupture (stock = 0)\n\n## Transfert entre emplacements\n\nPour déplacer du stock : dans la fiche produit ou depuis le tableau de stock, utilisez **Transférer**. Indiquez l''emplacement source, la destination et la quantité. Un mouvement est créé dans les deux emplacements.',
  'stock',
  2,
  true
),

(
  'Alertes de stock',
  'alertes-stock',
  E'# Alertes de stock\n\nNeoFlow BOS surveille automatiquement vos niveaux de stock et vous alerte quand une action est nécessaire.\n\n## Types d''alertes\n\n### Rupture de stock\nProduit dont la quantité disponible est **égale à 0** dans tous les emplacements. Le produit apparaît en rouge dans la liste.\n\n### Stock faible\nProduit dont la quantité disponible est **inférieure au seuil d''alerte** (par défaut : 3 unités). Le produit apparaît en orange.\n\n### Commandes fournisseur en attente\nBons de commande passés auprès de fournisseurs mais non encore reçus. Ces informations sont visibles dans la section Fournisseurs.\n\n## Où voir les alertes ?\n\n- **Tableau de bord** : nombre de produits en alerte affiché dans le résumé stock\n- **Page Stock** : tableau avec codes couleurs et filtre "Alertes uniquement"\n- **Statistiques** : section "Résumé stock" avec valeur totale et nombre d''alertes\n\n## Configurer le seuil d''alerte\n\nLe seuil par défaut est **3 unités**. Pour modifier ce seuil pour un produit spécifique, ouvrez la fiche produit et ajustez le champ **Seuil d''alerte stock**.\n\n## Bonnes pratiques\n\n- Consultez les alertes stock chaque matin avant l''ouverture\n- Passez les bons de commande fournisseurs dès qu''un produit passe en stock faible\n- Utilisez le filtre "Ruptures" dans la page Stock pour prioriser les commandes urgentes\n- Le stock d''exposition (articles en démonstration) doit être comptabilisé séparément pour éviter les fausses ruptures',
  'stock',
  3,
  true
),

-- ─────────────────────────────────────────────────────────────
-- FOURNISSEURS
-- ─────────────────────────────────────────────────────────────

(
  'Gérer ses fournisseurs',
  'gerer-fournisseurs',
  E'# Gérer ses fournisseurs\n\nLa section Fournisseurs vous permet de centraliser les informations de vos partenaires et de lier chaque produit à son ou ses fournisseurs.\n\n## Accéder aux fournisseurs\n\n**Fournisseurs** est visible dans le menu uniquement pour les **propriétaires et managers**. Les vendeurs et livreurs n''ont pas accès à cette section.\n\n## Créer une fiche fournisseur\n\nCliquez sur **Nouveau fournisseur**. Renseignez :\n- **Nom de l''entreprise**\n- **Contact principal** : nom, email, téléphone\n- **Adresse** : utilisée sur les bons de commande\n- **Notes** : conditions commerciales, délais habituels, informations utiles\n\n## Lier un produit à un fournisseur\n\nDepuis la fiche produit (dans **Produits**), section **Fournisseurs** :\n- Associez un ou plusieurs fournisseurs\n- Indiquez la **référence fournisseur** (son code article)\n- Indiquez le **prix d''achat fournisseur** (peut différer du coût d''achat général)\n- Désignez le **fournisseur principal** (utilisé par défaut pour les réapprovisionnements)\n\nDepuis la fiche fournisseur, vous voyez également la liste des produits qu''il vous fournit.\n\n## Archiver un fournisseur\n\nSi vous ne travaillez plus avec un fournisseur, archivez-le plutôt que de le supprimer. Il reste visible dans l''historique des commandes mais n''apparaît plus dans les listes de sélection.',
  'fournisseurs',
  1,
  true
),

(
  'Bons de commande fournisseur',
  'bons-commande-fournisseur',
  E'# Bons de commande fournisseur\n\nLes bons de commande (BC) permettent de commander des marchandises auprès de vos fournisseurs et de suivre les réceptions pour mettre à jour le stock automatiquement.\n\n## Créer un bon de commande\n\nDans **Fournisseurs → Créer un bon de commande** :\n\n1. **Sélectionner le fournisseur**\n2. **Ajouter les produits** à commander avec les quantités et le coût HT par unité\n3. **Date de livraison prévue** : permet d''anticiper le réapprovisionnement\n4. **Notes** : instructions particulières, références spéciales\n\n## Workflow d''un bon de commande\n\n```\nBrouillon → Envoyé → Confirmé → Réception partielle → Reçu\n                                                     ↑\n                                              (ou directement)\n```\n\n- **Brouillon** : en cours de rédaction, modifiable\n- **Envoyé** : transmis au fournisseur (email ou impression)\n- **Confirmé** : fournisseur a confirmé la commande\n- **Réception partielle** : une partie des articles est arrivée\n- **Reçu** : toute la marchandise est arrivée\n\n## Recevoir la marchandise\n\nQuand la livraison arrive, ouvrez le bon de commande et cliquez sur **Recevoir la marchandise**. Pour chaque ligne, indiquez la quantité réellement reçue (peut différer de la quantité commandée).\n\nNeoFlow BOS crée automatiquement un **mouvement de stock entrant** pour chaque produit reçu. Le stock est mis à jour immédiatement.\n\n## Réception partielle\n\nSi seulement une partie de la commande est livrée, enregistrez les quantités reçues. Le bon passe au statut *Réception partielle*. Vous pouvez enregistrer les livraisons suivantes jusqu''à réception complète.',
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
  E'# Planifier et suivre une livraison\n\nNeoFlow BOS gère les livraisons à domicile et les retraits en magasin depuis une vue kanban intuitive.\n\n## Créer une livraison\n\nUne livraison est créée depuis la **fiche commande**, section **Livraison**. Cliquez sur **Planifier la livraison**. Renseignez :\n\n- **Type** : Livraison à domicile / Retrait en magasin\n- **Date prévue** et **créneau horaire** (ex: 14h-16h)\n- **Adresse** : pré-remplie depuis la fiche client, modifiable\n- **Livreur assigné** : sélectionnez un membre de l''équipe avec le rôle Livreur\n- **Frais de livraison** (optionnel)\n- **Notes** : code d''accès, étage, instructions particulières\n\n## Workflow des livraisons\n\n```\nÀ planifier → Planifiée → En cours → Livrée\n                                   ↑\n                           (peut aussi être annulée)\n```\n\n- **À planifier** : commande qui nécessite une livraison, date non encore fixée\n- **Planifiée** : date, créneau et livreur assignés\n- **En cours** : livreur en route\n- **Livrée** : livraison confirmée par le livreur\n\nQuand une livraison passe à **Livrée**, la commande associée passe automatiquement au statut **Livré**.\n\n## Vue Kanban\n\nLa page **Livraisons** affiche un tableau kanban avec 4 colonnes. Glissez les cartes pour changer leur statut. Chaque carte affiche :\n- Nom du client\n- Numéro de commande\n- Type (badge Livraison / Retrait)\n- Créneau horaire\n- Livreur assigné\n- Montant restant à encaisser\n\n## Filtres disponibles\n\n- Filtrer par date\n- Filtrer par livreur\n- Filtrer par type (livraison / retrait)',
  'livraisons',
  1,
  true
),

(
  'Guide du livreur',
  'guide-livreur',
  E'# Guide du livreur\n\nCe guide est destiné aux membres de l''équipe ayant le rôle **Livreur** dans NeoFlow BOS.\n\n## Ce que vous voyez\n\nEn tant que livreur, votre accès est limité à l''essentiel pour votre travail :\n- **Tableau de bord** : nombre de livraisons à effectuer\n- **Livraisons** : uniquement les livraisons qui vous sont assignées\n- **Stock** : en lecture seule (pour vérifier la disponibilité avant le chargement)\n\n## Vos livraisons du jour\n\nConnectez-vous à NeoFlow BOS depuis votre téléphone ou tablette. La page **Livraisons** affiche uniquement vos livraisons, triées par date et créneau horaire.\n\nChaque livraison indique :\n- L''adresse de livraison\n- Le créneau horaire\n- Les articles à livrer (liste des produits de la commande)\n- Le montant à encaisser (s''il reste un solde)\n\n## Démarrer une livraison\n\nQuand vous partez en livraison, passez la livraison au statut **En cours**. Cela avertit le manager que vous êtes en route.\n\n## Confirmer une livraison\n\nUne fois la livraison effectuée, passez au statut **Livrée**. Si le client vous règle un solde à ce moment :\n1. Cliquez sur **Enregistrer un paiement**\n2. Indiquez le moyen de paiement (espèces, carte, chèque)\n3. Confirmez le montant reçu\n\nLa commande est automatiquement mise à jour.\n\n## En cas de problème\n\nSi vous ne pouvez pas effectuer une livraison (client absent, accès impossible), passez-la en **Annulée** et ajoutez une note explicative. Prévenez votre manager pour replanifier.',
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
  E'# Comprendre le tableau de bord\n\nLe tableau de bord est votre **centre de pilotage quotidien**. Il affiche les indicateurs les plus importants de votre activité du jour.\n\n## KPIs principaux (tous les rôles sauf livreur)\n\n### CA du mois\nSomme des totaux TTC de toutes les commandes avec le statut **Terminé** créées dans le mois en cours. Cliquez pour accéder aux statistiques détaillées.\n\n### Bénéfice du mois *(managers et propriétaires)*\nCA HT du mois moins la somme des coûts d''achat des articles vendus. Indique votre marge brute réelle.\n\n### Taux de conversion *(vendeurs)*\nPourcentage de devis qui ont abouti à une commande. Cliquez pour accéder à la liste des devis.\n\n### Commandes en cours\nNombre de commandes avec les statuts *Confirmé* ou *En cours*. Cliquez pour les voir.\n\n### Livraisons à faire\nNombre de livraisons non encore livrées ni annulées. Cliquez pour accéder au kanban des livraisons.\n\n## KPIs de gestion *(managers et propriétaires uniquement)*\n\n### Acomptes en attente\nTotal des montants restants à encaisser sur les commandes en cours qui ont déjà reçu un acompte.\n\n### Soldes à récupérer\nTotal des montants restants sur les commandes au statut **Livré** (livrées mais pas entièrement payées).\n\n### Marge moyenne\nMarge brute moyenne de toutes les ventes terminées ce mois, exprimée en pourcentage.\n\n## Actions rapides\n\nLes 4 boutons d''action rapide vous permettent de démarrer les tâches les plus fréquentes en un clic : Vente rapide, Nouvelle commande, Clients, Livraisons.\n\n## Dernières commandes\n\nLes 5 commandes les plus récentes avec leur statut et leur progression de paiement (barre bleue).',
  'statistiques',
  1,
  true
),

(
  'Statistiques avancées et marges',
  'statistiques-avancees',
  E'# Statistiques avancées et marges\n\nLa page **Statistiques** (anciennement Dashboard financier) est accessible aux **propriétaires et managers**. Elle offre une analyse approfondie de la performance commerciale.\n\n## Évolution du chiffre d''affaires\n\nGraphique en barres affichant le CA mensuel sur les 12 derniers mois. Basé sur les commandes terminées.\n\n## Répartition des commandes\n\nCamembert montrant la répartition des commandes par statut (Confirmé, En cours, Livré, Terminé, Annulé). Permet de visualiser d''un coup d''œil l''état du carnet de commandes.\n\n## Marge par produit\n\nHistogramme horizontal des 10 produits les plus vendus avec leur **marge brute unitaire** (prix de vente HT - coût d''achat HT). Identifiez vos produits les plus et moins rentables.\n\n> Cette section est strictement réservée aux managers et propriétaires. Les marges et coûts n''apparaissent jamais sur les documents clients.\n\n## Performance vendeurs\n\nTableau récapitulatif par vendeur :\n- Nombre de commandes\n- CA généré\n- Marge totale\n- Taux de conversion devis → commande\n\n## Produits faible rotation\n\nListe des produits qui n''ont pas été vendus depuis plus de 30 jours. Signal d''alerte pour adapter les promotions ou le réassort.\n\n## Résumé stock\n\n- **Valeur totale du stock** : somme (quantité × coût d''achat) pour tous les emplacements\n- **Nombre d''alertes** : produits en rupture ou stock faible\n\n## Livraisons en retard\n\nListe des livraisons dont la date prévue est dépassée et qui ne sont pas encore livrées ni annulées. À traiter en priorité.',
  'statistiques',
  2,
  true
),

-- ─────────────────────────────────────────────────────────────
-- FAQ
-- ─────────────────────────────────────────────────────────────

(
  'Questions fréquentes (FAQ)',
  'faq',
  E'# Questions fréquentes\n\n## Général\n\n### Puis-je utiliser NeoFlow BOS depuis mon téléphone ?\nOui. L''application est responsive et fonctionne sur mobile. Les livreurs utilisent généralement leur téléphone pour gérer leurs livraisons du jour.\n\n### Comment changer ma devise ?\nDans **Paramètres → Workspace**, sélectionnez votre devise dans le champ prévu. La devise est appliquée sur tous les documents (factures, devis, bons de commande).\n\n### Puis-je avoir plusieurs magasins dans un même workspace ?\nNon, un workspace représente un seul magasin. Pour gérer plusieurs points de vente, créez plusieurs workspaces. Une fonctionnalité de gestion multi-magasins sous la même organisation est prévue dans une prochaine version.\n\n---\n\n## Ventes\n\n### Quelle différence entre vente rapide et commande standard ?\nLa **vente rapide** est pour les achats comptoir immédiats — sans livraison, règlement complet sur place, client optionnel. La **commande standard** est pour les ventes avec livraison, paiements multiples (acompte + solde), ou nécessitant un suivi complet.\n\n### Peut-on modifier une facture déjà générée ?\nNon. Pour des raisons légales, une facture émise ne peut pas être modifiée. En cas d''erreur, générez un avoir (fonctionnalité à venir) ou annulez la commande et recommencez.\n\n### Comment annuler une commande ?\nOuvrez la fiche commande, cliquez sur **Changer le statut** et sélectionnez **Annulé**. Si des paiements ont été enregistrés, un remboursement manuel sera nécessaire (NeoFlow BOS ne gère pas les remboursements automatiques).\n\n---\n\n## Stock\n\n### Le stock se met-il à jour automatiquement lors d''une vente ?\nOui. Lors de la confirmation d''une commande, le stock est **réservé**. Lors de l''enregistrement du premier paiement, le stock est **débité**. Si la commande est annulée, la réservation est libérée.\n\n### Peut-on vendre un produit en rupture de stock ?\nOui, NeoFlow BOS affiche un avertissement mais ne bloque pas la vente. Il est possible de vendre avec un stock négatif (commande urgente, livraison fournisseur imminente). Régularisez dès que la marchandise arrive.\n\n---\n\n## Abonnement\n\n### Comment modifier ma carte de paiement ?\nDans **Paramètres → Abonnement**, cliquez sur **Gérer l''abonnement**. Vous accédez au portail Stripe où vous pouvez modifier votre moyen de paiement.\n\n### Mon workspace est suspendu, que faire ?\nUn workspace est suspendu après 3 jours de grâce suivant un échec de paiement. Mettez à jour votre moyen de paiement dans le portail Stripe pour réactiver immédiatement votre accès.\n\n---\n\n## Support\n\n### Comment signaler un bug ?\nUtilisez le formulaire dans **Paramètres → Support → Signaler un bug**. Décrivez le problème, les étapes pour le reproduire et joignez une capture d''écran si possible.\n\n### Comment contacter l''équipe NeoFlow ?\nEmail : **contacte.neoflowagency@gmail.com** — réponse sous 24h ouvrées.',
  'faq',
  1,
  true
)

ON CONFLICT (slug) DO UPDATE SET
  title      = EXCLUDED.title,
  content    = EXCLUDED.content,
  category   = EXCLUDED.category,
  position   = EXCLUDED.position,
  is_published = EXCLUDED.is_published,
  updated_at = now();
