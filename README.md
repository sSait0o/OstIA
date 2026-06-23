# OstIA

Plateforme intelligente de gestion de candidatures et de recherche d'emploi, propulsée par l'IA.

## Fonctionnalités

- **Gestion des candidatures** : Kanban board avec 7 statuts, synchronisation automatique via email (Gmail & Outlook)
- **Parsing IA des emails** : Claude (Anthropic) analyse le dossier "Ostia" de votre boîte mail et crée automatiquement les candidatures
- **Recherche d'offres** : Agrège les offres de France Travail, scorées en temps réel selon votre CV grâce à l'IA
- **Dashboard analytique** : Statistiques avec Apache ECharts (taux de réponse, répartition par statut)

## Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | Angular 19, NG-Zorro, Apache ECharts |
| Backend | NestJS, TypeORM, PostgreSQL |
| IA | Claude API (Anthropic) |
| Auth | JWT (access token) |
| Emails | Gmail API (OAuth2), Microsoft Graph (Outlook) |
| Jobs | France Travail API (officielle) |
| Infra | Docker, GitHub Actions CI/CD |

## Démarrage rapide

```bash
# Démarrer la base de données
docker-compose up -d

# Backend
cd backend
cp .env.example .env  # Remplir les variables
npm install
npm run start:dev

# Frontend
cd frontend
npm install
npx ng serve
```

## Structure du projet

```
Ostia/
├── backend/          # NestJS API
│   └── src/
│       ├── auth/         # JWT auth
│       ├── users/        # Utilisateurs
│       ├── applications/ # Candidatures
│       ├── email/        # Gmail + Outlook OAuth
│       ├── jobs/         # France Travail API
│       ├── cv/           # Upload & parsing CV
│       └── ai/           # Claude API service
├── frontend/         # Angular app
│   └── src/app/
│       ├── core/         # Services, guards, interceptors
│       ├── layout/       # Main layout (sidebar)
│       └── pages/        # Login, Register, Kanban, Jobs, Dashboard
├── docker-compose.yml
└── .github/workflows/ci.yml
```
