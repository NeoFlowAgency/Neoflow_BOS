# Design — Claude CoWork : Prospection LinkedIn NeoFlow BOS

**Date :** 2026-02-28
**Auteur :** Noakim Grelier
**Outil :** Claude Cowork (Anthropic Desktop Agent)
**Objectif :** Trouver des prospects qualifiés (magasins de literie indépendants, France), rédiger un message LinkedIn personnalisé pour chacun, stocker dans Notion. Aucun envoi automatique.

---

## Architecture

```
Claude Cowork
    │
    ├── 1. Recherche web (LinkedIn public)
    │       └── Requêtes ciblées → profils qualifiés
    │
    ├── 2. Analyse profil
    │       └── Nom, entreprise, ville, taille, élément spécifique
    │
    ├── 3. Rédaction message personnalisé
    │       └── Basé sur l'élément spécifique trouvé
    │
    └── 4. Push Notion (via MCP connector)
            └── Base "Prospection NeoFlow BOS" — 1 ligne par prospect
```

---

## Critères de qualification

**Inclure :**
- Magasin de literie indépendant (pas une franchise nationale)
- France métropolitaine
- Petite structure (1–10 employés estimés)
- Présence digitale minimale (profil LinkedIn, site, avis Google...)
- Activité récente (post, mise à jour profil, avis récent)

**Exclure :**
- Grandes enseignes (But, Conforama, Ikea, Emma, Bultex...)
- Profils sans info exploitable
- Comptes inactifs depuis +6 mois
- Distributeurs ou grossistes (B2B uniquement)

---

## Format Notion

| Colonne | Type | Valeur par défaut |
|---|---|---|
| Nom du contact | Titre | — |
| Entreprise / Magasin | Texte | — |
| Ville | Texte | — |
| Taille estimée | Select | Petite / Moyenne |
| Message à envoyer | Texte long | Rédigé par Cowork |
| Statut | Select | À contacter |
| Date de contact | Date | Date du jour |
| Notes | Texte long | Élément profil utilisé |
| Créateur | Texte | NeoFlow BOS |
| Plateforme de contact | Select | LinkedIn |

---

## Règles strictes

1. Ne jamais envoyer de message — rédiger uniquement
2. Priorité qualité sur volume (5 bons prospects > 20 mauvais)
3. Chaque message doit contenir un élément spécifique du profil
4. Aucun message générique ou copier-coller
5. Si un profil est trop vague → passer, ne pas qualifier à la va-vite

---

## Prompt final

Voir fichier : `docs/plans/2026-02-28-cowork-prompt.md`
