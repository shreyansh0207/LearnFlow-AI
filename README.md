# LearnFlow AI

A personalised AI learning companion: learn any subject from zero with an adaptive roadmap, lessons, quizzes, spaced revision, streaks and analytics. It ships as one responsive Next.js app that also installs as a Progressive Web App (PWA) on Android, iPhone/iPad and desktop, with no app store involved.

> Learn anything from zero. Follow your own path. Remember what matters. Build real understanding, one day at a time.

---

## Contents

1. [Stack](#stack)
2. [Quick start (local)](#quick-start-local)
3. [Neon database setup](#neon-database-setup)
4. [Groq setup](#groq-setup)
5. [Deploying to Vercel](#deploying-to-vercel)
6. [Installing the app (PWA)](#installing-the-app-pwa)
7. [How it works](#how-it-works)
8. [Universal knowledge system](#universal-knowledge-system)
9. [Security model](#security-model)
10. [Testing](#testing)
11. [Project structure](#project-structure)
12. [Known limitations](#known-limitations)

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 4, custom accessible components, Lucide icons |
| Database | **Neon Postgres** via `node-postgres` (`pg`) on the pooled connection, attached to Vercel Fluid compute (`@vercel/functions`) |
| Auth | Built in and stored in Neon: scrypt password hashes, database sessions in httpOnly cookies |
| Authorization | Postgres Row Level Security: every user query runs as the `authenticated` role with `app.user_id` set for that transaction |
| AI | **Groq** (default model `openai/gpt-oss-120b`) via the official `groq-sdk` (server only), strict JSON-schema structured output validated by Zod |
| PWA | Web app manifest (`app/manifest.ts`), hand-written service worker (`public/sw.js`), offline page |
| Tests | Vitest (unit), PGlite (real Postgres in-process, same migrations), opt-in live Groq/source tests, Playwright browser checks |

---

## Quick start (local)

Requires **Node.js 20.6+**.

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL and GROQ_API_KEY
npm run db:migrate              # creates all tables, roles, RLS policies and the catalog seed in Neon
npm run ai:check                # confirms GROQ_MODEL can actually generate with your key
npm run dev                     # http://localhost:3000
```

Then open <http://localhost:3000/signup>, create an account, and follow onboarding.

Without `DATABASE_URL`, every page shows a **Setup required** screen naming the missing variable. It doesn't crash, and nothing is reported as saved. Without `GROQ_API_KEY`, AI features show *"AI is not configured…"* with setup steps.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build and server (needed to test the service worker and installation) |
| `npm run db:migrate` | Apply `db/migrations/*.sql` to Neon (direct connection, once each, tracked in `meta.schema_migrations`) |
| `npm run db:verify` | Check tables, RLS and role scoping on Neon |
| `npm run ai:check` | List Groq models for your key, then make a real call with `GROQ_MODEL` |
| `npm run lint` / `npm run typecheck` / `npm test` | Quality checks |
| `npm run test:live` | Live tests against real Groq (`LIVE_GROQ=1`) and sources (`LIVE_SOURCES=1`) |
| `npm run icons` / `npm run catalog:seed` | Regenerate icons/splash, or the catalog seed migration |

### Test the AI locally

1. Sign in and open **Settings → AI status & Groq self-test** (`/settings/ai`).
2. The status card makes a tiny real call to confirm the configured model works with your key.
3. **Run self-test** sends *"Teach me compound interest from absolute beginner level, give one practical example, and finish with three quiz questions."* through the server-side Groq service and renders the answer.
4. From the command line: `LIVE_GROQ=1 npm run test:live` runs the same prompt, a structured-JSON quiz, and the error cases (unavailable model, invalid key, missing key).

---

## Neon database setup

All data lives in one Neon Postgres database: accounts, sessions, learning history and the shared knowledge catalog.

1. **Create a project** at <https://console.neon.tech> (or use an existing one).
2. **Copy the pooled connection string**: the host contains `-pooler`. Put it in `.env.local` as `DATABASE_URL`.
3. **Apply the schema**: `npm run db:migrate`. It uses the *direct* connection (it removes `-pooler`, or set `DATABASE_URL_UNPOOLED`), as Neon recommends for schema changes. Migrations run in filename order:
   1. `…_auth.sql`: roles (`anon`, `authenticated`), the `auth` schema (users, sessions, reset tokens, attempt counters), `auth.uid()`
   2. `…_init.sql`: learner data with RLS on every table, idempotent activity recording, account deletion
   3. `…_knowledge_catalog.sql`: the shared catalog, search and admin functions
   4. `…_catalog_seed.sql`: 17 curated domains and 180 disciplines
   5. `…_role_grants.sql`: table privileges for the scoped roles
4. **Verify**: `npm run db:verify` should report RLS on every public table, and a scoped user blocked from writing to the catalog.
5. **Make yourself a catalog admin** (optional) after signing up:

   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```

   Admins get **Profile → Catalog admin** (`/admin/catalog`). Everyone else gets a 404 there, and every admin action re-checks membership on the server.

**Neon CLI (optional).** `neon init` installs Neon's agent plugins and links the project, and `neon deploy` applies `neon.ts` and pulls env vars into `.env.local`. Both need `neon login` first. The app doesn't depend on them: `DATABASE_URL` is all it needs.

**Email.** No email service is configured. Sign-up signs you in straight away, without email confirmation. Password reset works in development (the one-time link is printed in the server console); in production the reset page says plainly that email reset isn't available until an email provider is added. Signed-in users can change their password in Settings.

---

## Groq setup

1. Create an API key at <https://console.groq.com/keys>.
2. Set `GROQ_API_KEY` in `.env.local` on the server, never with a `NEXT_PUBLIC_` prefix.
3. Set `GROQ_MODEL` (default `openai/gpt-oss-120b`) and run `npm run ai:check`. It lists the models your key can use and makes a real call with the configured one.
   - LearnFlow never silently swaps models. If the configured model can't be used, every AI feature reports the exact model and Groq's reason, and `/settings/ai` shows it.
4. Optional: `GROQ_REASONING_EFFORT` (`low`/`medium`/`high`, default `low`; applies to gpt-oss models) and `AI_RATE_LIMIT_PER_HOUR` (default 40 per user).

**Groq plan limits.** On Groq's free tier, `openai/gpt-oss-120b` allows about 8,000 tokens per minute and 1,000 requests per day per organisation. One roadmap can use most of a minute's budget, so with several active learners you'll see *"Groq's rate limit was reached. Please wait a minute and try again."* Upgrade to Groq's Developer tier for production traffic.

What runs on Groq:

- Roadmaps (beginner → advanced modules and subtopics), with course shapes and sources
- Lessons and the "explain more simply / another example / Hinglish / practical case / summarise" follow-ups
- Quizzes with answer explanations, and practice and harder quizzes
- **AI feedback on written exercise answers**
- **AI revision plans**
- Tutor follow-ups grounded in the current lesson
- Topic discovery, gap analysis, and roadmap expansion

How the service behaves:

- **One server-side service** (`src/lib/ai/client.ts`, Groq's official `groq-sdk`) handles every call: timeouts, output limits (`max_completion_tokens`), retry, error mapping, and content-filter refusals.
- **Structured output**: roadmaps, lessons, quizzes, feedback and plans use `response_format: json_schema` generated from the same Zod schema that validates the result. On gpt-oss models it is strict, so decoding is constrained to the schema. Invalid or truncated output is retried once. If it still fails, nothing is saved and the user sees a retry message.
- **Reasoning stays hidden**: gpt-oss models reason before answering. LearnFlow requests `include_reasoning: false`, so only the final answer is returned and stored.
- **Errors**: rate limits (HTTP 429/413), timeouts, network failures, invalid keys and unavailable models each give a friendly, specific message. Keys are scrubbed from provider messages.
- **Duplicate protection**: identical in-flight requests (double clicks, retries while waiting) share one Groq call. Journey creation also takes a client request id, and lessons and quizzes are cached once generated.
- **Minimal context**: Groq receives topic titles, levels, scores and missed concepts. It never receives emails, passwords, notes or other private data.
- **Labelling**: AI output is labelled "AI-generated" and kept separate from retrieved, externally sourced references.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project → Import** the repo. The framework is auto-detected.
3. Add environment variables (Production and Preview): `DATABASE_URL` (pooled), `GROQ_API_KEY`, `GROQ_MODEL`, `NEXT_PUBLIC_SITE_URL`, plus any optional ones from `.env.example`.
4. Run `npm run db:migrate` once against the production database (from your machine, or a CI step).
5. Deploy. Vercel provides HTTPS automatically, which service workers and installation require. Fluid compute reuses the database pool across requests.
6. AI routes declare `maxDuration` of 90–120 s. Make sure your Vercel plan allows that function duration.

Any Node host with HTTPS works (`npm run build && npm start`).

---

## Installing the app (PWA)

Installation always requires the user's approval through the browser. A PWA can't be installed silently, and it isn't an APK or IPA.

**Android (Chrome, Edge, Samsung Internet)**

- When the browser allows it, LearnFlow shows an **Install app** button that opens the native install prompt (`beforeinstallprompt`).
- Otherwise: browser menu **⋮ → Install app / Add to Home screen**.
- After installing, the button changes to *Installed*, and launching from the home screen opens full-screen (`display: standalone`).

**iPhone / iPad (Safari; Chrome/Edge on iOS 16.4+)**

- iOS has no install prompt API, so LearnFlow shows a step-by-step guide: **Share → Add to Home Screen → Add**.
- Standalone launch is detected via `navigator.standalone` / `display-mode: standalone`. Launch screens and the Apple touch icon are provided.
- The installed iOS app keeps its own storage, so users sign in once after installing.

**Desktop (Chrome/Edge)**: use the install icon in the address bar. Safari on macOS Sonoma or later: File → Add to Dock.

The full in-app guide lives at `/install` (public) and `/settings/install`.

**Testing installation locally:** the service worker registers only in production builds. Run `npm run build && npm start` and open `http://localhost:3000` (localhost counts as a secure context). In Chrome DevTools → **Application → Manifest** you can confirm "installable". For a phone on your network you need HTTPS, so deploy a preview or use a tunnel.

**Updates:** bump `VERSION` in `public/sw.js` whenever you change it. Installed clients see *"A new version of LearnFlow is ready — Update"*. The new worker activates only when the user taps Update, so nothing reloads mid-lesson. The browser always re-fetches `sw.js` because it's served with `Cache-Control: no-store`.

### Offline behaviour

| Works offline | Needs a connection |
|---|---|
| App opens to an offline screen (not a browser error) | AI lessons, quizzes, tutor |
| Lessons the user tapped **Save for offline** (stored on the device) | Dashboard, analytics, roadmap |
| Lesson completions and review ratings made when the connection drops are **queued** and synced automatically | Sign-in |

The queue uses client-generated UUIDs as idempotency keys, so a retried request can never double-count progress or streaks. The service worker caches only public static files and hashed build assets. Authenticated pages and API responses are never cached. Signing out clears offline lessons and the pending queue on that device.

---

## How it works

**Core loop:** sign up → onboarding (goal, level, motivation, time, formats, deadline; optional questions can be skipped) → AI roadmap (levels, modules, topics, prerequisites, objectives, durations, checkpoints, milestones) → preview and **edit** the roadmap → optional **diagnostic** → lesson → quiz → reviews → come back and **resume** from the real last position (`/learn`).

**Lessons** include objectives, an explanation, key terms, analogies, examples, a step-by-step breakdown, ungraded comprehension checks, an exercise with a model answer, a recap, a next step and flashcards. Follow-up controls: *Explain more simply, Another example, Explain in Hinglish, Practical case, Ask me questions, Harder challenge, Summarize, Test my understanding*.

**Completion ≠ mastery.** Finishing a lesson marks the topic *Studied*. Mastery is a transparent weighted average (`src/lib/learning/mastery.ts`):

- 60% quiz results (exponential moving average, so recent attempts count more)
- 25% review recall
- 15% self-rated confidence, only alongside real evidence

Below 60% → **Needs practice**. In that case LearnFlow offers a simpler explanation, an easier targeted practice quiz on the missed concepts, and a link back to the prerequisite. *Mastered* requires at least 90% and at least two quiz attempts.

**Spaced repetition** (`spaced-repetition.ts`): ladder 1 → 3 → 7 → 14 days, then growth by an adaptive ease factor. "Forgot" resets the card, "Easy" skips ahead, intervals cap at 180 days, and the daily queue is capped (most overdue first) so backlogs never become overwhelming. Cards come from lesson recaps, lesson flashcards, quiz mistakes and the user's own cards.

**Streaks** (`streaks.ts`): a day counts when the learner completes a lesson, submits a quiz, or finishes 5 reviews. Time alone never counts. Days are computed in the learner's timezone, and recording is idempotent at the database level (`record_learning_event`). Missed days produce a "fresh start" message, never shaming.

**Curriculum versions:** regenerating creates a new version. Old topics, sessions and attempts are preserved. Progress (mastery, generated lessons, "already known") carries over to topics with the same normalised title, or to clearly similar titles matched one-to-one. Unclear relationships are deliberately left unmapped. **Expanding** a roadmap appends modules (or a prerequisites module at the start) to the active version without touching existing topics or progress. Topics with history can be renamed but not deleted.

---

## Universal knowledge system

LearnFlow isn't limited to a fixed list of subjects. A learner can type almost any legitimate learning goal and get an appropriate path, including topics the catalog has never seen. LearnFlow doesn't claim to already contain every subject, and it doesn't treat the AI as an infallible source.

### Knowledge catalog (shared, data-driven)

- **`knowledge_nodes`** form a flexible hierarchy (domain → discipline → subject → … → concept, or skill/field where that fits better). Each node has:
  - name, aliases, description
  - parent, root domain, kind, difficulty, objectives
  - course shape (`learning_pattern`)
  - **origin** (`curated`, `imported`, `ai_generated`, `user_suggested`) and **status** (`verified`, `reviewed`, `proposed`, `rejected`, `merged`)
  - timestamps and an anonymous demand counter
- **`knowledge_edges`** hold `prerequisite` and `related` links across the hierarchy, which is how interdisciplinary topics connect to several domains.
- **`knowledge_sources`** hold attributed source metadata (URL, title, provider, licence, publication and retrieval dates, short snippet). Full text is never stored.
- The seed (17 domains, 180 disciplines) lives in a **migration**, not in frontend code. Everything else is added at runtime, with no deploy.
- **Search** (`search_knowledge`) combines Postgres full-text search over names, aliases and descriptions with `pg_trgm` fuzzy matching. Candidates come from index-backed branches, then are ranked together with an exact-name/alias boost. It's paginated and capped, and the browser never loads the catalog.
- **Duplicates**:
  - Merged automatically only on *certain* equivalence: exact name, alias, spacing variants ("Cyber security"), or British/American spelling ("Behavioural").
  - Near matches (typos) are **flagged to admins** instead, because similarity alone can't tell "Microeconomics" from "Macroeconomics".
  - Names are unique per parent, so "Mercury" can exist under both Astronomy and Chemistry.
  - `merge_knowledge_nodes` moves children, aliases, links, sources and learner journeys to the surviving node, and refuses to create cycles.

### Discovery workflow (`/explore`, `POST /api/discover`)

1. **Interpret** the input with AI: intent, the underlying topic, scope (broad / focused / narrow), course shape, domain, related domains and synonyms. Vague requests ("Python", "mercury") get **one short clarifying question**. Harmful requests are refused, but legitimate study of difficult subjects is allowed.
2. **Search** the catalog with the topic and its synonyms.
3. **Plan** (`lib/catalog/plan.ts`, unit-tested):
   - an exact or same-name match → the existing topic
   - a broad field → explore its branches
   - otherwise → **propose**. A narrow topic like "underwater photography" is never collapsed into its broader parent.
4. **Propose**:
   - Retrieve sources, then generate a structure: description, aliases, prerequisites with reasons, 5–10 subtopics, related topics, and an uncertainty note.
   - Validate it: no self-references or circular prerequisites, no duplicates, sizes clamped.
   - Deduplicate it against the catalog, then save it as **unverified** with its sources.
5. The learner **reviews** the topic page (prerequisites, branches, sources, provenance) and **personalises** a journey from it.

Broad topics grow **incrementally**: "Map more branches" proposes one level at a time, and nothing tries to generate a whole field in one request.

### Curriculum engine

- **Course shapes**: conceptual, problem-solving, language, hands-on, creative, professional, physical, mixed. Each has its own structure guidance. For example, languages get spiral units and speaking practice, while hands-on skills get safety notes, practice tasks and projects. The learner can change the shape.
- Each curriculum includes:
  - outcomes and assumed prerequisites
  - typed modules (prerequisites → foundations → core → advanced → specialisation → practice/project) and typed topics (concept, skill practice, project, assessment, review)
  - checkpoints and safety notes
  - suggested resources and declared **limitations**
- **Adjust** goal, starting level, target level, course shape or scope, then regenerate. Mark topics as **"I know this"** to skip them; that's tracked separately from completion and mastery. **Expand** with a focus area, or add missing prerequisites at the start.
- Generation is **staged**: catalog hints and sources → curriculum → lessons on demand. Nothing is saved unless the whole curriculum passes validation (tested).

### Source-aware learning

- Sources come from **Wikipedia** (reference, CC BY-SA) and **OpenAlex** (scholarly works, metadata CC0) through their public APIs. There's a 5-second timeout and it fails soft: if retrieval fails, generation continues and the UI says no sources were used. Provider adapters live in `lib/sources/providers.ts`, so adding more providers means writing another adapter.
- Retrieved text is **untrusted**. It's stripped of markup and control characters, fenced in the prompt with an instruction never to follow instructions inside it, and limited to short snippets.
- **Citations can't be invented.** The model can only cite per-request ids (`S1`, `S2`…), and any id that wasn't actually retrieved is discarded. Resource links appear only when they point to a retrieved source; other resource suggestions are shown as generic types, not fake references. Only cited sources are stored.
- Lessons and topic pages separate **retrieved sources** (with provider, licence and retrieval date) from **AI-written explanations**.

### Curriculum gap analysis

- **Rule-based checks** run on every roadmap view (`lib/curriculum/coverage.ts`):
  - outcomes stated, starting point, difficulty progression, whether the target level is reached
  - prerequisite order, assumed knowledge, objectives
  - practice share (higher for practice-heavy subjects), projects, checkpoints, safety notes
  - sources and declared limitations
- **AI gap review** (on demand) lists missing prerequisites and subtopics, ordering issues, unexplained terms, practical and assessment gaps, uncertain claims, and what's out of scope. Suggestions can be added to the roadmap with one tap.
- There's deliberately **no completeness percentage**. The page states that the curriculum is designed for the stated goal and level, not as a complete record of the subject.

### Growth, review and demand

- **Admins** (`/admin/catalog`) can:
  - verify, mark reviewed or reject proposals (possible duplicates are shown next to each one)
  - merge topics by pasting a URL
  - add curated topics, bulk-import a JSON tree of topics
  - review **anonymous demand** (`topic_requests`: normalised topic plus count, no user ids) and **generation health** (`catalog_jobs`: successes and failures by kind)
- **Learners** can suggest topics and subtopics (rate-limited; saved as `user_suggested · proposed`).
- Provenance badges are shown everywhere, so curated, imported, AI-generated and learner-suggested content are never presented as the same thing.

---

## Security model

- **Row Level Security on every table.** Learner tables restrict all reads and writes to `auth.uid()`.
- **Database-enforced isolation.** Every query for a signed-in user runs in a transaction as the restricted `authenticated` role with `app.user_id` set, so Postgres RLS (not just application code) decides which rows are visible. Verified on Neon and in the PGlite tests.
- **The shared catalog is read-only to users.** Catalog tables have no insert, update or delete policies. The server writes with the owner connection, only after validation. Demand and job logs are readable by admins only.
- **Authentication in Neon.** Passwords are stored as scrypt hashes, compared in constant time, with a timing-equal path for unknown emails. Session cookies are random 32-byte tokens; only their SHA-256 hashes are stored. Cookies are httpOnly, SameSite=Lax and Secure in production. Sessions expire after 30 days (sliding), and password changes sign out other devices. Sign-in, sign-up and reset are rate-limited per account and per network.
- **Privileged functions are locked down.** `merge_knowledge_nodes` and `record_topic_request` can't be called by anonymous or signed-in users (verified in tests).
- **Admin rights** are a row in `app_admins`, checked server-side on every page load and every action.
- **Composite foreign keys** `(parent_id, user_id)` stop a row from referencing another user's records, even through the API.
- **Server-side authorization everywhere.** The proxy redirects anonymous users, private layouts re-check the session on every request (`force-dynamic`), and every route handler and server action calls `requireUser` / `requireApiUser`.
- **Quizzes are scored on the server.** Answer keys are never sent to the browser before submission.
- **Secrets stay server-side.** `GROQ_API_KEY` and `DATABASE_URL` are read only in `server-only` modules. A test scans every client component and its imports, and the browser run scanned every loaded JS bundle: no key, connection string or server module reaches the browser.
- **Prompt-injection defence.** Learner input, catalog text and retrieved sources are fenced and marked as data. Model output is schema-validated and sanitised before anything is stored.
- **Input validation** with Zod on every endpoint. `?next=` redirects are restricted to same-site paths.
- **Rate limiting** for AI calls is stored in Postgres, so it holds across serverless instances. Topic suggestions have a daily cap.
- **Safe rendering.** AI Markdown is rendered as React elements (no `dangerouslySetInnerHTML`), and the offline page uses `textContent` only. External links use `rel="noopener noreferrer nofollow"`.
- **Security headers:** `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, a strict referrer policy and a permissions policy.
- **Account deletion** cascades every user-owned row. Shared catalog topics survive with their author cleared.
- **Logging:** passwords, keys and learning content aren't logged. The job log stores topic names and error codes only.

---

## Testing

```bash
npm run lint && npm run typecheck && npm test && npm run build
LIVE_SOURCES=1 npx vitest run tests/live   # optional: hits the real Wikipedia/OpenAlex APIs
```

**Database integration tests** (`tests/db`) apply every migration to real Postgres 17 running in-process via PGlite, using exactly the migrations and role scoping the app uses on Neon. They test the actual SQL:

- search ranking, aliases and typos; pagination
- runtime additions searchable immediately
- duplicate constraints; merge semantics and cycle refusal
- source constraints
- RLS: catalog read-only, admin-only logs, privileged functions denied, cross-user isolation and cross-user attachment blocked
- curriculum expansion preserving progress
- idempotent event recording; account deletion cascades

**Unit and audit tests** cover:

- learning logic: scoring, mastery, spaced repetition, streaks across timezones and DST, recommendations
- the offline queue
- discovery planning (tests A–E), proposal validation, duplicate detection
- source sanitising and citation filtering, retrieval timeouts
- rule-based gap analysis, progress mapping across versions
- the build pipeline's no-save-on-failure guarantee (test I)
- seed integrity, the manifest/icons/service worker, and a static RLS and secret audit across all migrations

**Browser checks** run during development against a production build (Playwright, Chromium):

- no horizontal overflow at 360 px on public pages
- the service worker registers and controls the page
- Chrome DevTools reports **zero installability errors**
- the offline fallback works
- iPhone and Android user agents get the right install guide
- every private page and API (including the new discovery, topic and admin routes) redirects or returns 401 without a session

**Verified end to end against the real Neon database and real Groq** (Playwright, production build):

- sign up → onboarding → Groq roadmap → Groq lesson → completion → Groq quiz scored on the server → `/settings/ai` model check and self-test rendered in the UI
- no secrets in any JS bundle
- signed-out redirect; wrong password rejected
- re-login shows a welcome-back message built from saved history; `/learn` resumes at the next topic
- the rows were confirmed directly in Neon, and another user's scope sees none of them

**Still manual** (not covered by automated tests):

- spaced-repetition reviews on a later day, AI discovery for brand-new topics, and the admin screens in a browser
- installing on a physical Android or iPhone
- email delivery (no email provider is configured)

[`PROGRESS.md`](PROGRESS.md) has a manual checklist.

---

## Project structure

```
src/
  app/
    (marketing)/      landing, features, how-it-works, install, privacy, terms
    (auth)/           login, signup, forgot-password, reset-password
    (app)/            dashboard, onboarding, explore, topics/[id], library, journeys, learn, lesson,
                      quiz, review, flashcards, tutor, notes, progress, history, profile,
                      settings (+ notifications, install), admin/catalog
    api/              discover, catalog (suggest, expand), journeys (curriculum, expand, review,
                      diagnostic), lessons (+ actions), quiz, events, review, tutor
    auth/             email-link confirmation, sign-out
    actions/          server actions (auth, journey editing, notes, cards, account, catalog admin)
    manifest.ts       PWA manifest
  components/         UI kit, app shell, catalog (discovery, topic, admin), curriculum tools,
                      lesson/quiz/review/tutor UIs, PWA provider & install guide
  lib/
    ai/               Groq service (client.ts), prompts, schemas, context builder, demo templates, rate limit
    catalog/          patterns, schemas, text normalisation & dedupe, discovery planning, repository
    curriculum/       build pipeline, rule-based coverage, cross-version topic mapping
    sources/          provider adapters (Wikipedia, OpenAlex), sanitising, retrieval
    learning/         mastery, spaced repetition, streaks, scoring, recommendations, dates, persistence
    auth/             passwords (scrypt), sessions (cookies + Neon), auth context
    db.ts             Neon pool, user-scoped (RLS) and owner connections
public/               sw.js, offline.html, icons, splash screens
scripts/              icon generator, catalog seed data + SQL generator
db/migrations/        auth schema, learner schema, RLS policies, functions, catalog, seed, grants
tests/                unit, audit, db (PGlite) and opt-in live suites
```

---

## Known limitations

- **No semantic or vector search yet.** Full-text plus trigram search is index-backed and suits large catalogs. Embedding-based search (pgvector) is the natural next step if synonym recall becomes a problem.
- **Sources** come from two public providers (Wikipedia and OpenAlex). Academic results are metadata only (title, authors, year, DOI), with no abstracts or full text. More providers can be added as adapters.
- **AI-proposed topics are unverified** until an admin reviews them. That's labelled everywhere, and they're never presented as verified facts.
- **Background processing** is request-scoped and staged (one structure, one level of branches, one curriculum at a time). Large bulk imports run in the admin request and are capped at 500 topics per batch. A job queue would be needed for very large ingestion.
- **Notification delivery**: preferences are saved, but sending reminders needs an email or push service that isn't included. The UI says so.
- **Offline**: only lessons explicitly saved for offline can be read without a connection. Dashboards, discovery and AI need the network.
- **Legal pages** are templates. Fill in the bracketed details with legal advice before launch.
- AI-generated content can contain mistakes. This is stated in the app and the Terms.
