# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.0.3] - 2026-07-04

### Changed

- Backend: normalized prettier formatting across several services/controllers and the generated migrations; `EmailService` now logs through the shared NestJS `Logger` instead of raw `console.error`/`console.warn` calls.
- Core: removed dead code — an unused logger in the `cv`/`matching` routers and an unused `Request` import in `main.py`.

## [1.0.2] - 2026-07-04

### Fixed

- README (root and backend) documented Claude/Anthropic as the email-parsing AI provider; the implementation has always called Groq end to end. Also documented the email verification, IMAP sync/thread-dedup, and concurrent geocoding features, and the SMTP/encryption env vars and `mail/`/`migrations/` folders missing from the project structure.

## [1.0.1] - 2026-07-04

### Fixed

- AI geocoding fallback and the `/health` endpoint were awaiting `complete_json` through `asyncio.to_thread`, which just handed back an un-awaited coroutine instead of running it (a leftover from the Groq client's move to `aiohttp`). The geocode fallback silently failed and `/health` always reported Groq as "degraded".

## [1.0.0] - 2026-07-04

### Added

- Email verification at signup: SMTP-based confirmation link, resend flow, and a pending/verify landing page.
- Email sync tracking (`EmailSyncRecord`) so IMAP mailboxes resume from where they left off instead of re-scanning.
- Thread-based deduplication: follow-up emails are matched to their existing application by `threadId`/company/title instead of creating a duplicate dossier.
- AI-based status detection from follow-up emails (e.g. an interview invite automatically moves an application to `INTERVIEW`).
- Concurrent geocoding on the map view (up to 3 in parallel) with Nominatim rate-limiting and reuse of already-resolved company coordinates.
- Score filter for job search results.
- Image logo and mobile sidebar overlay in the main layout.
- Windows `setup.ps1` / `start.ps1` scripts for local onboarding.

### Changed

- Kanban page title renamed to "Candidatures".
- Default Groq model switched to `openai/gpt-oss-120b`.
- `ACKNOWLEDGED` status merged into `APPLIED` on the map legend for a simpler view.
- Dark theme polished across the layout, kanban board, and map.

### Fixed

- France Travail contract type and location filters (arrondissement commune codes, `natureContrat` mapping for apprenticeship/professionalization).
- France Travail date params and pagination total.
- Vercel API rewrite pointing to the correct Railway backend URL.
- Missing `ArrowRightOutline` icon registration.
- Progress score badge text contrast on the dashboard.

### Removed

- `WITHDRAWN` application status.
