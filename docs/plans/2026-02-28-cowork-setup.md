# Claude CoWork Prospection — Setup Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Configurer Claude CoWork pour prospecter des magasins de literie indépendants sur LinkedIn, rédiger des messages personnalisés, et centraliser les prospects dans une base Notion dédiée.

**Architecture:** CoWork utilise la recherche web pour trouver des profils LinkedIn publics, analyse chaque profil, rédige un message personnalisé unique, puis écrit le résultat dans Notion via le connector MCP. Aucun message n'est envoyé automatiquement.

**Tech Stack:** Claude CoWork (Anthropic Desktop), Notion (base de données), Notion MCP connector, recherche web publique LinkedIn.

---

### Task 1 : Créer la base Notion "Prospection NeoFlow BOS"

**Fichiers :**
- Référence prompt : `docs/plans/2026-02-28-cowork-prompt.md`

**Step 1 : Ouvrir Notion et créer une nouvelle base de données**

Dans Notion, crée une page : `Prospection NeoFlow BOS`
Type : Database (Table view)

**Step 2 : Créer les colonnes suivantes dans l'ordre**

| Colonne | Type Notion |
|---|---|
| Nom du contact | Title (colonne par défaut) |
| Entreprise / Magasin | Text |
| Ville | Text |
| Taille estimée | Select → options : "Petite", "Moyenne" |
| Message à envoyer | Text |
| Statut | Select → options : "À contacter", "Contacté", "Répondu", "Intéressé", "Relance", "Clos" |
| Date de contact | Date |
| Notes | Text |
| Créateur | Text |
| Plateforme de contact | Select → options : "LinkedIn", "Email", "Téléphone" |

**Step 3 : Vérifier**

La base doit avoir exactement 10 colonnes. Aucune colonne manquante.

**Step 4 : Copier l'ID de la base de données Notion**

URL de la page Notion : `https://notion.so/[workspace]/[DATABASE_ID]?v=...`
Copier le DATABASE_ID (32 caractères après le dernier `/` et avant `?`).
Le noter — il sera nécessaire pour le MCP connector dans CoWork.

---

### Task 2 : Configurer le Notion MCP Connector dans CoWork

**Step 1 : Ouvrir Claude CoWork Desktop**

Lancer l'application Claude Desktop sur ton PC.

**Step 2 : Accéder aux Connectors**

Dans les paramètres du projet CoWork → section "Connectors" ou "MCP".
Ajouter un nouveau connector.

**Step 3 : Sélectionner Notion**

Choisir le connector Notion (disponible nativement dans Cowork).
S'authentifier avec ton compte Notion.
Autoriser l'accès à la page "Prospection NeoFlow BOS".

**Step 4 : Vérifier la connexion**

Demander à CoWork : "Peux-tu lire le contenu de ma base Notion 'Prospection NeoFlow BOS' ?"
Attendu : CoWork confirme qu'il voit la base et ses colonnes.

---

### Task 3 : Créer le projet CoWork avec le system prompt

**Step 1 : Créer un nouveau projet dans CoWork**

Nom du projet : `CoWork Prospection NeoFlow BOS`

**Step 2 : Copier le system prompt**

Ouvrir `docs/plans/2026-02-28-cowork-prompt.md`.
Copier tout le contenu du bloc **"PROMPT SYSTEM (Instructions permanentes du projet)"**.
Coller dans le champ "Instructions" ou "System prompt" du projet CoWork.

**Step 3 : Activer les permissions nécessaires**

Dans les paramètres du projet :
- ✅ Accès web (recherche internet)
- ✅ Connector Notion (configuré en Task 2)
- ❌ Accès fichiers locaux (pas nécessaire pour ce workflow)

**Step 4 : Sauvegarder le projet**

Confirmer et sauvegarder.

---

### Task 4 : Lancer une session de test (3 prospects)

**Step 1 : Ouvrir le projet CoWork Prospection**

Lancer une nouvelle conversation dans le projet.

**Step 2 : Envoyer le message de démarrage**

```
Lance une session de prospection, trouve-moi 3 prospects.
```

**Step 3 : Observer l'exécution**

CoWork doit :
1. Lancer les recherches web LinkedIn
2. Qualifier les profils trouvés
3. Rédiger un message pour chacun
4. Ajouter dans Notion
5. Donner un résumé de session

**Step 4 : Vérifier dans Notion**

Ouvrir la base "Prospection NeoFlow BOS".
Vérifier que 3 nouvelles lignes sont présentes.
Vérifier que chaque message est bien personnalisé (élément spécifique différent pour chaque prospect).

**Step 5 : Valider ou ajuster**

Si les messages semblent génériques → retravailler le Bloc 3 du system prompt.
Si les prospects ne sont pas qualifiés → renforcer les critères d'exclusion dans le Bloc 1.

---

### Task 5 : Workflow de prospection régulière

Une fois le setup validé, le workflow hebdomadaire est :

```
Lance une session de prospection, trouve-moi 5 prospects.
```

Puis dans Notion :
- Filtrer par Statut = "À contacter"
- Contacter manuellement sur LinkedIn
- Mettre à jour le Statut après chaque action
- Ajouter des Notes au fil des échanges

---

## Critères de succès

- [ ] Base Notion créée avec les 10 colonnes
- [ ] Connector Notion fonctionnel dans CoWork
- [ ] System prompt en place dans le projet CoWork
- [ ] Session test : 3 prospects ajoutés dans Notion
- [ ] Chaque message contient un élément spécifique différent
- [ ] Aucun message envoyé automatiquement
