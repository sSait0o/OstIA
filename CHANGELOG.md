# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
