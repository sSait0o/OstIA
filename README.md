# OstIA

[![CI](https://github.com/qleboucher1/OstIA/actions/workflows/ci.yml/badge.svg)](https://github.com/qleboucher1/OstIA/actions/workflows/ci.yml)
[![CD](https://github.com/qleboucher1/OstIA/actions/workflows/cd.yml/badge.svg)](https://github.com/qleboucher1/OstIA/actions/workflows/cd.yml)

Plateforme intelligente de gestion de candidatures et de recherche d'emploi, propulsée par l'IA.

## Fonctionnalités

- **Kanban des candidatures** - 6 statuts (Envoyée, Reçue, Test technique, Entretien, Offre, Refusée), drag & drop, filtres
- **Parsing IA des emails** - Groq analyse le dossier "Ostia" de votre boîte mail et crée les candidatures automatiquement
- **Sync email avancée** - suivi de progression par mailbox, dédoublonnage des relances par thread, détection automatique des changements de statut par IA
- **Vérification d'email** - confirmation du compte par lien envoyé par email (Resend)
- **Matching CV/offres** - Agrège les offres France Travail et Adzuna et les score en temps réel selon votre CV (Groq)
- **Dashboard analytique** - Taux de réponse, répartition par statut (Apache ECharts)
- **Carte géographique** - Visualisation des candidatures par localisation (OpenLayers), géocodage à 3 niveaux : Nominatim direct, puis recherche web + IA, puis IA du siège social en dernier recours

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Angular 19, NG-Zorro, Apache ECharts, OpenLayers |
| Backend | NestJS, TypeORM, PostgreSQL |
| Core IA | FastAPI, Groq, pdfplumber |
| Emails | Gmail OAuth2, Microsoft Graph, Resend (transactionnel) |
| Jobs | France Travail API (officielle) |
| Auth | JWT, vérification d'email |
| Infra | Docker, Railway, GitHub Actions |

## Prérequis

- Node.js 22+
- Python 3.12+
- Docker & Docker Compose
- Comptes : [Google Cloud](https://console.cloud.google.com) (Gmail), [Azure](https://portal.azure.com) (Outlook), [Groq](https://console.groq.com), [France Travail](https://francetravail.io)

## Démarrage rapide

```bash
# 1. Base de données + core IA
docker-compose up -d

# 2. Backend
cd backend
cp .env.example .env   # Remplir les variables (voir tableau ci-dessous)
npm install
npm run start:dev

# 3. Frontend
cd frontend
npm install
npx ng serve
```

L'app est disponible sur [http://localhost:4200](http://localhost:4200).

## Variables d'environnement

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | URL PostgreSQL Railway (production) |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | PostgreSQL local |
| `JWT_SECRET` | Clé secrète JWT (min. 32 chars en prod) |
| `ENCRYPTION_KEY` | Chiffrement AES-256-GCM des tokens OAuth au repos (défaut: `JWT_SECRET`) |
| `RESEND_API_KEY` | Clé API Resend pour les emails transactionnels (vérification de compte) |
| `MAIL_FROM` | Adresse d'expéditeur des emails transactionnels |
| `GOOGLE_CLIENT_ID/SECRET` | Google OAuth (Gmail) |
| `MICROSOFT_CLIENT_ID/SECRET/TENANT_ID` | Azure OAuth (Outlook) |
| `CORE_API_URL` | URL du service core (défaut: `http://localhost:8001`) |
| `FRANCE_TRAVAIL_CLIENT_ID/SECRET` | API France Travail |
| `ADZUNA_APP_ID` | Adzuna App ID (offres d'emploi) |
| `ADZUNA_APP_KEY` | Adzuna App Key |

### Core (`core/.env`)

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Clé API Groq (matching CV/offres) |
| `TAVILY_API_KEY` | Clé API Tavily (recherche web, fallback de géocodage sur la carte) |

## Structure du projet

```
OstIA/
├── backend/          # API NestJS
│   └── src/
│       ├── auth/         # JWT + vérification d'email
│       ├── users/
│       ├── applications/ # Candidatures
│       ├── email/        # Gmail + Outlook OAuth, sync IMAP, dédup par thread
│       ├── mail/         # Envoi SMTP (nodemailer)
│       ├── jobs/         # France Travail API
│       ├── cv/           # Upload & parsing CV
│       ├── ai/           # Client vers le core (Groq)
│       └── migrations/   # Migrations TypeORM
├── core/             # Microservice Python FastAPI
│   └── app/
│       ├── routers/      # cv, matching, analytics
│       └── services/     # cv_parser, job_matcher, ai_client
├── frontend/         # Angular app
│   └── src/app/
│       ├── core/         # Services, guards, interceptors
│       ├── layout/       # Sidebar
│       └── pages/        # Landing, Login, Register, Kanban, Jobs, Dashboard, Map
└── docker-compose.yml
```

## Déploiement (Railway)

Chaque service est déployé sur Railway. Configurer les secrets GitHub suivants pour activer le CD :

- `RAILWAY_TOKEN` - Token Railway (Settings → Tokens)
- `RAILWAY_SERVICE_BACKEND` - ID du service backend Railway
- `RAILWAY_SERVICE_CORE` - ID du service core Railway
