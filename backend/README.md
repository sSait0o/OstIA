# OstIA - Backend

API REST construite avec **NestJS** (TypeScript) + **TypeORM** + **PostgreSQL**.

## Architecture

```
src/
├── app.module.ts         # Module racine - configure TypeORM + importe tous les modules
├── main.ts               # Point d'entrée - démarre le serveur, configure Swagger, CORS, validation
│
├── auth/                 # Authentification JWT
│   ├── strategies/       # Stratégies Passport (jwt, jwt-query, local)
│   ├── guards/           # Guards NestJS (JwtAuthGuard, LocalAuthGuard)
│   └── dto/              # Objets de transfert : LoginDto, RegisterDto
│
├── users/                # Gestion des utilisateurs
├── applications/         # Candidatures (CRUD + statuts kanban)
├── email/                # Connexion Gmail/Outlook via OAuth2
├── cv/                   # Upload et analyse de CV (forwarde vers le service core)
├── jobs/                 # Recherche d'offres (France Travail + Adzuna)
└── ai/                   # Intégration Claude API (parsing emails)
```

Chaque module suit la même convention NestJS :
- `*.module.ts` - déclare le module (contrôleurs, providers, imports)
- `*.controller.ts` - définit les routes HTTP
- `*.service.ts` - contient la logique métier
- `dto/` - classes de validation (class-validator)
- `entities/` - entités TypeORM (schéma BDD)

## Prérequis

- Node.js 22+
- PostgreSQL 16 (ou `docker-compose up -d` depuis la racine)

## Démarrage

```bash
cp .env.example .env   # Remplir les variables
npm install
npm run start:dev      # Démarre avec hot-reload sur http://localhost:3000
```

La documentation Swagger est disponible sur `http://localhost:3000/api/docs`.

## Variables d'environnement

Voir [`.env.example`](.env.example) - toutes les variables sont documentées dans ce fichier.

## Scripts utiles

| Commande | Description |
|----------|-------------|
| `npm run start:dev` | Serveur de développement (watch mode) |
| `npm run build` | Compilation TypeScript |
| `npm run start:prod` | Démarrage en production |
| `npm run test` | Tests unitaires (Jest) |
| `npm run lint` | Vérification ESLint |
| `npm run format` | Formatage Prettier |
