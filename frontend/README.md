# OstIA — Frontend

Application web construite avec **Angular 19** (standalone components) + **NG-Zorro** (Ant Design).

## Architecture

```
src/app/
├── app.config.ts         # Configuration Angular (providers, router, HTTP, i18n)
├── app.routes.ts         # Routes lazy-loaded — chaque page est un chunk séparé
│
├── core/                 # Services singleton injectés une seule fois au niveau de l'app
│   ├── services/         # Appels API backend (auth, applications, cv, email, jobs, map)
│   ├── guards/           # Protection des routes (AuthGuard)
│   └── interceptors/     # Injection automatique du JWT dans les requêtes HTTP
│
├── shared/               # Code réutilisable entre plusieurs pages
│   ├── components/       # Composants réutilisables (ex: JobCardComponent)
│   └── utils/            # Fonctions utilitaires pures (ex: score.utils.ts)
│
├── layout/               # Structure visuelle de l'application
│   └── main-layout/      # Sidebar + zone de contenu principale
│
└── pages/                # Une page = un dossier (composant + template + styles)
    ├── auth/             # Login & Register
    ├── kanban/           # Tableau des candidatures (drag & drop)
    ├── jobs/             # Recherche d'offres
    ├── saved-jobs/       # Offres sauvegardées
    ├── dashboard/        # Statistiques (ECharts)
    ├── cv/               # Upload et analyse du CV
    ├── map/              # Carte géographique (OpenLayers)
    └── email/            # Connexion boîte mail
```

**Convention de nommage :** chaque composant Angular respecte la structure `nom.component.ts / .html / .scss`.

## Prérequis

- Node.js 22+
- Le backend doit tourner sur `http://localhost:3000` (voir `backend/README.md`)

## Démarrage

```bash
npm install
npx ng serve   # Démarre sur http://localhost:4200
```

## Environnements

| Fichier | Usage |
|---------|-------|
| `src/environments/environment.ts` | Développement local |
| `src/environments/environment.prod.ts` | Production (build `ng build`) |

## Scripts utiles

| Commande | Description |
|----------|-------------|
| `npx ng serve` | Serveur de développement (hot-reload) |
| `npx ng build` | Build de production dans `dist/` |
| `npx ng test` | Tests unitaires (Karma) |
| `npx ng lint` | Vérification ESLint |
| `npx ng generate component pages/ma-page` | Générer un nouveau composant de page |
