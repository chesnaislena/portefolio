# Portfolio Léna Chesnais — Instructions de développement

## Contexte du projet

Portfolio académique d'une doctorante en neurosciences. Site statique déployé sur GitHub Pages.  
Stack : **Vanilla JS + CSS3 + D3.js**, données dans `data.json`, panneau admin intégré côté client.  
Synchronisation avec GitHub via l'API REST (pas de backend).

---

## Architecture cible : site multi-pages (MPA)

### Pages à créer / maintenir

| Fichier | Titre affiché | Contenu |
|---|---|---|
| `index.html` | Accueil | Hero, présentation, carte identité, accès rapide aux autres pages |
| `cursus.html` | Cursus Universitaire | Diplômes avec sous-expériences dépliables |
| `experiences.html` | Expériences Professionnelles | Postes avec sous-expériences dépliables |
| `formations.html` | Formations | Formations courtes, certifications, écoles thématiques |
| `rayonnement.html` | Rayonnement Scientifique | Implications collectives + actions grand public |
| `financements.html` | Financements | Bourses, prix, appels à projets obtenus |
| `travaux.html` | Publications & Travaux | Articles, abstracts, communications |

> **Note :** Le nom "Rayonnement Scientifique" est une proposition pour la page regroupant implications collectives scientifiques et actions grand public (médiation, vulgarisation). Valider avec l'utilisatrice avant de figer.

La navigation persistante doit apparaître sur toutes les pages.  
Le panneau admin et la synchronisation GitHub restent accessibles depuis toutes les pages.

---

## Données (`data.json`)

`data.json` est **la seule source de vérité**. Toute information affichée en est extraite. Toute modification passe par le panneau admin qui écrit dans ce fichier (via GitHub API en prod, ou export JSON en local).

### Structure globale cible

```json
{
  "meta": { "lastUpdated": "", "version": 0, "passwordHash": "" },
  "profile": { ... },
  "skills": [ ... ],
  "cursus": [ ... ],
  "experiences": [ ... ],
  "formations": [ ... ],
  "rayonnement": [ ... ],
  "financements": [ ... ],
  "publications": [ ... ]
}
```

### Schéma par type d'entité

#### `profile`
```json
{
  "name": "Prénom Nom",
  "title": "Titre",
  "tagline": "Accroche courte",
  "about": "Biographie (paragraphes séparés par \\n\\n)",
  "location": "Ville, Pays",
  "email": "...",
  "lab": "Nom du laboratoire",
  "orcid": "...",
  "links": { "github": "", "linkedin": "", "scholar": "", "orcid": "" }
}
```

#### `skills`
```json
{
  "id": "s-python",
  "name": "Python",
  "category": "hard | soft | language",
  "level": "avancé | intermédiaire | débutant | natif | C1 | ..."
}
```

#### `cursus` et `experiences` — structure avec sous-expériences

Ces deux collections partagent le même schéma.  
Chaque item principal (diplôme, poste) **contient une liste de sous-expériences** détaillant ce qui a été fait.

```json
{
  "id": "edu-master",
  "type": "education | experience",

  "title": "Master Neurosciences",          // titre principal affiché dans la liste
  "org": "Université de Bordeaux",
  "location": "Bordeaux, France",
  "start": "2021-09",
  "end": "2023-06",                          // null = en cours
  "description": "Résumé général (optionnel)",

  "subItems": [
    {
      "id": "edu-master-tpe",
      "title": "Titre de l'expérience ou activité",
      "location": "Lieu précis",
      "start": "2022-03",
      "end": "2022-06",
      "summary": "Bref résumé (2-3 phrases)",
      "skills": ["s-python", "s-matlab"],   // compétences tirées de cette sous-expérience
      "detail": "Description détaillée affichée au clic (peut être longue)"
    }
  ],

  "skills": ["s-python"]                    // compétences agrégées de l'item principal (union des sous-items possible)
}
```

**Comportement UX attendu :**
1. La page affiche la liste des items principaux (diplôme / poste) avec date et org.
2. Clic sur un item → ouvre la liste de ses `subItems`.
3. Clic sur un subItem → affiche un volet ou modal avec `detail` et la liste des `skills` associés.

#### `formations`
```json
{
  "id": "form-1",
  "title": "Nom de la formation",
  "org": "Organisme",
  "location": "Lieu ou En ligne",
  "start": "2024-06",
  "end": "2024-06",
  "description": "Description courte",
  "skills": ["s-ml"]
}
```

#### `rayonnement`
```json
{
  "id": "ray-1",
  "category": "collective | grandpublic",   // implication collective OU action grand public
  "title": "Titre de l'action / rôle",
  "org": "Structure ou événement",
  "location": "",
  "start": "2023-01",
  "end": null,
  "description": "Description",
  "skills": []
}
```

#### `financements`
```json
{
  "id": "fin-1",
  "title": "Nom de la bourse / prix / appel à projets",
  "org": "Organisme financeur",
  "year": "2024",
  "amount": "3 000 €",                      // optionnel
  "description": "Contexte et usage",
  "skills": []
}
```

#### `publications`
```json
{
  "id": "pub-1",
  "title": "Titre de la publication",
  "year": "2025",
  "authors": "Chesnais L., ...",
  "venue": "Journal / Conférence",
  "type": "article | abstract | communication | preprint",
  "abstract": "Texte de l'abstract (peut être long)",
  "url": "https://doi.org/...",
  "skills": ["s-python"]
}
```

---

## Schéma de compétences (graphe D3.js)

Le graphe interactif doit rester présent (au moins sur la page d'accueil, idéalement accessible depuis toutes les pages via un bouton ou un lien).

**Règles de mise à jour automatique :**
- Chaque entité (`cursus`, `experiences`, `formations`, `rayonnement`, `financements`, `publications`) peut référencer des `skills` via un tableau d'IDs.
- Les `subItems` de cursus/expériences référencent aussi des `skills`.
- Le graphe agrège **toutes** ces relations à la volée depuis `DATA` sans état séparé.
- Ajouter / modifier / supprimer une entité → le graphe se recalcule au prochain `renderGraph()`.

**Nœuds du graphe :**
- Nœuds ronds colorés = compétences (scientifique = bleu pastel, transversales = violet pastel, technique = jaune pastel)
- Nœuds carrés/diamants = entités (cursus, expériences, publications, etc.) différenciés par forme ou couleur de bordure
- Liens = arêtes entre entité et compétence

---

## Panneau Admin

### Principes

- Accès : triple-clic sur le logo / marque (comportement existant à conserver).
- Le panneau doit être accessible et fonctionnel depuis **toutes les pages**.
- Chaque onglet correspond à une collection de `data.json`.
- L'UI doit permettre : **ajouter**, **modifier**, **supprimer** n'importe quel item ou sous-item.
- Après chaque modification, `renderAll()` (ou l'équivalent par page) est appelé pour mettre à jour l'affichage immédiatement.
- La synchronisation GitHub (existante) doit continuer à fonctionner.

### Onglets du panneau admin

| Onglet | Collection modifiée |
|---|---|
| Profil | `profile` |
| Compétences | `skills` |
| Cursus | `cursus` (items + subItems) |
| Expériences | `experiences` (items + subItems) |
| Formations | `formations` |
| Rayonnement | `rayonnement` |
| Financements | `financements` |
| Publications | `publications` |
| Synchronisation | GitHub config, mot de passe, import/export |

### UI pour sous-items (cursus & expériences)

Dans les onglets Cursus et Expériences :
1. Liste des items principaux avec boutons Modifier / Supprimer / **Voir sous-items**.
2. Clic sur "Voir sous-items" → affiche la liste des `subItems` de cet item, avec boutons Ajouter / Modifier / Supprimer.
3. Le formulaire d'un subItem contient : titre, lieu, période (start/end), résumé, détail, compétences liées (checkboxes).
4. Le formulaire d'un item principal contient : titre, org, lieu, période, description, et le lien vers la gestion des sous-items.

---

## Conventions de code

- **Vanilla JS uniquement** — pas de framework.
- **CSS custom properties** pour le thème (light/dark déjà en place, à étendre).
- **Pas de commentaires** sauf si le comportement est non-évident.
- Fonctions nommées de façon explicite : `renderCursusPage()`, `openSubItemForm(parentId, subItemId)`, etc.
- IDs des entités générés avec `uid(prefix)` (fonction existante).
- Toutes les données HTML issues de `data.json` passent par `escapeHtml()` avant insertion.
- Les dates sont formatées avec `fmtDate(iso)` (fonction existante).

---

## Règles de navigation

- Header commun à toutes les pages : logo + liens vers chaque page + toggle thème.
- Page active mise en évidence dans la navigation (classe CSS `active`).
- Le header peut être extrait dans un fragment HTML chargé via JS, ou dupliqué dans chaque fichier (préférer la duplication pour rester sans build tool).
- Retour à la page d'accueil : clic sur le logo.

---

## Ce qui doit être conservé tel quel

- Design visuel (couleurs, typographie Fraunces/Inter Tight/JetBrains Mono).
- Système de thème light/dark avec `localStorage`.
- Mécanisme d'authentification (SHA-256, triple-clic).
- Synchronisation GitHub (lecture SHA → PUT avec Base64).
- Import/export JSON.
- Graphe D3.js avec zoom, pan, drag.

---

## Ce qui doit évoluer

- L'architecture passe de **SPA** (une seule `index.html`) à **MPA** (un fichier HTML par page).
- `data.json` est enrichi avec les nouvelles collections (`formations`, `rayonnement`, `financements`) et la structure `subItems` dans `cursus`/`experiences`.
- Le panneau admin gagne les onglets manquants et la gestion des sous-items.
- Le schéma graphe agrège les relations depuis toutes les collections.
- Les publications gagnent un champ `abstract` et un champ `type`.

---

## Migration des données existantes

Lors de la refonte, migrer les données actuelles de `data.json` :
- `experiences` → conserver dans `experiences`, adapter au nouveau schéma (ajouter `subItems: []`, renommer `role` → `title`).
- `educations` → renommer en `cursus`, adapter au nouveau schéma (ajouter `subItems: []`, renommer `degree` → `title`).
- `publications` → conserver, ajouter `abstract: ""` et `type: "article"` sur les items existants.
- Créer `formations: []`, `rayonnement: []`, `financements: []` vides.
