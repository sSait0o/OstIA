# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.5.0] - 2026-07-15

### Added

- Case files review page (`/case-files`): every dossier listed with a `needsReview` flag for ambiguous email matches, ability to split a wrongly-merged email into its own application, a per-status event breakdown, and an email timeline component shared with Kanban.
- Email verification: registration now sends a signed verification link via SMTP and login is blocked until the account is verified.
- Ambiguous email-to-application match detection: the AI now confirms an email genuinely belongs to a fuzzy-matched application before updating it, tracked via a new `matchConfidence` column on sync records.

### Security

- Extended AES-256-GCM at-rest encryption to `EmailConnection.email`, `ApplicationEmail.subject`/`body`, and `Application.company`/`jobTitle`/`location`/`emailSubject` (previously only user identity, CV data, and OAuth tokens were covered).
- Fixed the Outlook OAuth callback: its `state` parameter was never signed like Gmail's, so `verifyOAuthState` always rejected it — Outlook connections were effectively broken and are now CSRF-protected the same way as Gmail.

### Fixed

- Removed the orphaned `lastContactAt` column/field, already dropped from the database by an earlier migration but still referenced in code (broke CSV export).
- AI-driven status detection: added a confidence score to avoid trusting low-certainty guesses, rejected backward status transitions, extended the AI double-check to OFFER in addition to REJECTED, and now requires AI confirmation before applying a keyword-detected REJECTED status.
- Job matching: accented skills (e.g. "développeur") now match unaccented job descriptions during keyword scoring.
- CV analysis: unreadable/scanned PDFs and failed AI extraction now return a clear error instead of a raw 500.
- Dashboard activity chart: applications synced from email now group by their real `appliedAt` date instead of the sync timestamp; the chart also switched from a monthly to a 30-day view.
- Job sync: offers are now written via a single batched upsert keyed on `(user, externalId)` instead of per-job find-then-save, backed by a unique constraint that also dedupes pre-existing rows.

### Changed

- Replaced deep relative imports with TypeScript path aliases (`@core`, `@shared`, `@users`, `@applications`, etc.) across frontend and backend.
- No-reply email domain updated to `ostia-app.com`.

## [1.4.1] - 2026-07-09

### Fixed

- Backend ESLint and ruff format checks that had been failing on `develop` since 2026-07-07, blocking CI from ever reaching the test step. Also fixed a hidden test failure (missing `ApplicationEmailsService` mock) that CI never got to because lint failed first.

### Changed

- Backend: loose module files grouped into subfolders matching the existing `entities/`/`dto/`/`providers/` convention — `jobs/job-search.types.ts` → `jobs/types/`, `email/quote-stripper.ts` and `email/status-keywords.ts` → `email/utils/`.

## [1.4.0] - 2026-07-08

### Added

- Public landing page served at `/`, with a presentation video. The app now lives under `/kanban` (logo and post-login redirect updated accordingly).

### Fixed

- Sidebar now collapses on mobile outside of tutorial steps that require it open, instead of staying expanded through the whole tour.
- Responsive sizing/padding fixes across auth, CV, jobs, kanban, map, and the tutorial overlay, now using shared breakpoint mixins instead of ad-hoc media queries.

### Changed

- README feature/stack descriptions synced with the current implementation (Resend, Adzuna, OpenLayers, 3-level map geocoding, 6-status kanban).

## [1.3.2] - 2026-07-07

### Changed

- Replaced the full JSON data export (profile, emails, sync records) with a focused CSV export of applications, better suited for spreadsheet analysis (e.g. Power BI). The trigger moved from the user dropdown menu to a dashboard action button.

## [1.3.1] - 2026-07-07

### Fixed

- Map geocoding failing in production with a CORS error (`core` service's `ALLOWED_ORIGINS` wasn't set, defaulting to `localhost:4200` only). Documented the required env var in `core/.env.example`.

## [1.3.0] - 2026-07-07

### Added

- Application email history: view synced email body/thread and update status directly from the kanban modal.
- Email sync engine split into dedicated Gmail/Outlook providers with resumable sync state per connection.
- New job search providers (Adzuna, France Travail) behind a shared job-search provider interface.
- Shared frontend design tokens/mixins/buttons system (`frontend/src/styles/`), reused across pages instead of duplicated per component.

### Fixed

- Responsive layout issues across dashboard, kanban, email, auth, and map pages (see 1.2.2).

## [1.2.2] - 2026-07-07

### Fixed

- Dashboard stat numbers now actually get the intended responsive font-size on mobile (the previous CSS targeted a class the template never rendered).
- Kanban email modal header no longer clips the company name or status selector on narrow screens.
- Email page's "how it works" card no longer stays sticky and overlapping content once the layout stacks on tablet/mobile.
- Login/Register pages no longer clip the form with no way to scroll on short/landscape mobile viewports.
- Map view's floating nav and info pills no longer risk overlapping on narrow phone screens.

## [1.2.1] - 2026-07-05

### Fixed

- Tutorial overlay tooltip now measures its actual rendered size instead of relying on fixed constants, preventing it from overflowing the viewport when content is taller/wider than assumed.

### Changed

- Frontend `ApplicationStatus`/`ApplicationSource` types deduplicated into `shared/models/application.model.ts`, shared between the applications and map services instead of being redefined in each.

## [1.2.0] - 2026-07-05

### Added

- CV parsing now extracts the candidate's city, used to prefill the job search location (100km radius) by default.
- Groq API calls now rotate across a pool of keys (`GROQ_API_KEYS`) with per-key cooldown on rate limiting, instead of stalling on a single key's free-tier limit.
- `GET /email/sync/status` exposes in-progress sync state, so the UI can resume tracking a sync after a page reload.

### Changed

- Gmail/Outlook sync no longer auto-creates the "OstIA" label/folder; users must create it themselves, and the email page now explains the manual setup with a walkthrough panel.
- CV experience and education entries are now sorted most-recent first.
- Job search location default switched from CV-derived keywords to the CV's city.
- Groq health check now uses a plain-text completion instead of a JSON one, avoiding false "degraded" reports from transient JSON-formatting hiccups.

### Removed

- Automatic keyword prefill from CV experience/skills in job search.

## [1.1.1] - 2026-07-05

### Fixed

- Prod crash-looped on boot after v1.1.0: `EmailConnection.lastSyncedAt` was typed `Date | null` without an explicit column type, and TypeScript's emitted `design:type` metadata for a union type is `Object`, which TypeORM can't map to a postgres column (`DataTypeNotSupportedError`). Added the explicit `timestamp` type, matching the pattern already used for the other nullable `Date` columns.

## [1.1.0] - 2026-07-05

### Added

- Forgot/reset password flow: users can request a reset link by email and set a new password via a time-limited token, mirroring the existing email-verification flow.
- First-login guided tour highlighting the sync button and main navigation items, replayable anytime via the header's "?" icon.
- Gmail/Outlook sync is now rate-limited to once per hour in production, with a live countdown in the UI, to keep sync usage under the Groq free-tier quota.

### Changed

- `resend-verification` and `forgot-password` now share a single `EmailDto`, replacing the old `ResendVerificationDto`.

### Removed

- Unused `JwtQueryStrategy`/`JwtQueryGuard` (never wired to any route).
- Unused `bySource` field from application stats.

## [1.0.10] - 2026-07-04

### Fixed

- Verification emails never reached users in production: Railway (like most PaaS providers) blocks outbound SMTP ports (25/465/587) entirely, so every SMTP fix attempt (IPv4 forcing, DNS workarounds, timeouts) was doomed regardless of the mail server config, since the traffic never left the container (`connect ETIMEDOUT`). Replaced the SMTP transport with Resend's HTTP API, which isn't subject to that egress block.

## [1.0.9] - 2026-07-04

### Fixed

- The prior IPv4/DNS mail fixes still left verification-email failures undiagnosable in production: `auth.service` silently swallowed the send error, and `MailService` never surfaced the underlying SMTP response. The transporter now logs raw SMTP protocol traffic, verifies the connection on boot, and failures include the response code/command; `auth.service` also logs a warning naming the affected user.

## [1.0.8] - 2026-07-04

### Fixed

- The v1.0.6 IPv6 mail fix didn't actually work: nodemailer's own resolver looks up both A and AAAA records for the SMTP host and picks a random address to connect to, ignoring the `family` option entirely. Verification emails could still fail with `ENETUNREACH` whenever that random pick landed on an IPv6 address. The transporter now connects via a hand-supplied IPv4 socket (`getSocket`), bypassing nodemailer's resolver.

## [1.0.7] - 2026-07-04

### Fixed

- CI had been failing on `main` since before v1.0.5 (backend eslint `no-require-imports`, then `core` ruff formatting), so CD was silently skipped and the v1.0.6 IPv6 mail fix never actually reached production. Also fixed 15 `core` tests left broken by an earlier async migration (`parse_email`/`extract_cv`/`score_cv_job` calls weren't awaited), which the formatting failure had been masking by preventing the Test step from ever running.

## [1.0.6] - 2026-07-04

### Fixed

- Verification emails were silently dropped on networks where Gmail's SMTP host resolves to an IPv6 address with no working route, failing immediately with `ENETUNREACH`. The mail transporter now forces IPv4.

## [1.0.5] - 2026-07-04

### Fixed

- Registration and resend-verification could hang for minutes if the SMTP host accepted a connection but never responded, since the mail send was awaited before responding. The verification email is now sent fire-and-forget with a 10s transporter timeout, so the request always returns promptly regardless of mail-server latency.

## [1.0.4] - 2026-07-04

### Fixed

- Registration permanently blocked an email address if a signup was abandoned before verifying: it now reclaims accounts left unverified past their token's expiry and lets the address register again.
- Registration and resend-verification returned a 500 when the mail provider was unreachable, even though the account/token was already persisted; the failure is now logged and swallowed so the user can retry the send.

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
