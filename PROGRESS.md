# LearnFlow AI — progress log

Last updated: 2026-10-24

## Status

- **Core app + PWA:** done (2026-10-23).
- **Universal knowledge expansion:** done (2026-10-24).
- **Neon + Gemini migration:** done (2026-10-24).
  - All data (accounts, sessions, learning history, catalog) is in Neon Postgres.
  - All AI runs on Google Gemini through one server-side service.
  - Supabase and the Anthropic SDK were removed.

## Verified (2026-10-24)

| Check | Result |
|---|---|
| `npm run lint` / `npm run typecheck` | clean |
| `npm test` | 138 pass (unit + PGlite database tests); live tests skipped by default |
| `npm run build` | passes |
| `npm run db:migrate` on Neon | 5 migrations applied (PostgreSQL 18.6) |
| `npm run db:verify` on Neon | 29/29 public tables have RLS; catalog seeded (197); a scoped user can't write to the catalog |
| `npm run ai:check` | key works with the Gemini API; `gemini-3.5-flash` generates (Google reports the serving version as `gemini-3.6-flash`); `gemini-2.5-flash` is listed but unavailable to new keys |
| `LIVE_GEMINI=1 npm run test:live` | the compound-interest self-test returns a real lesson with an example and 3 quiz questions; structured quiz JSON validates; unavailable model → exact `model_unavailable` message; invalid key → credentials message; missing key → setup message |
| Browser E2E (Playwright, production build, Neon + Gemini) | 15/15 steps: sign-up, Gemini roadmap, lesson, completion, quiz, AI status, self-test UI, no secrets in bundles, sign-out redirect, wrong password, resume after re-login |
| Data in Neon | the E2E user's rows exist in 14 tables; lesson saved with `model = gemini-3.6-flash`; another user's scope sees 0 rows |

## Neon CLI

- `npm i -g neon` and `neon init` ran; the Neon agent plugins are installed for Claude Code, Codex and VS Code. The GitHub Copilot CLI plugin failed because that CLI isn't installed.
- Linking the project and running `neon deploy` both need a signed-in CLI. `neon login` opened a browser sign-in, which timed out after 60 s.
- **Owner action:** run `neon login`, then re-run:

  ```bash
  neon init -y --org-id org-delicate-firefly-48379241 --project-id silent-shape-60986378 --branch production --services postgres
  neon deploy
  ```

- The app doesn't need these steps: it already uses `DATABASE_URL` from `.env.local`.

## Commands

```bash
npm run dev | npm run build && npm start | npm run lint | npm run typecheck | npm test
npm run db:migrate | npm run db:verify | npm run ai:check
LIVE_GEMINI=1 npm run test:live
```

## Owner actions

1. **Rotate the Gemini API key and the Neon database password.** Both were shared in chat. Then update `.env.local` (and Vercel).
2. Run `neon login` if you want the CLI linked (see above).
3. Grant yourself admin: `insert into public.app_admins (user_id) select id from auth.users where email = '…';`
4. For production password-reset emails, add an email provider. Not included yet; the UI says so.

## Known issues / next ideas

- **No email delivery**: sign-up doesn't confirm email addresses, and reset links appear only in the dev server console.
- **Pre-hydration submits.** If a sign-in form is submitted in the instant before React hydrates, the replayed submission can arrive empty. The user sees a validation message and resubmits. True no-JS submissions work (HTTP 303 redirect).
- **Test accounts.** E2E testing created about 12 accounts named `e2e-…@example.com` / `dbg-…@example.com` in Neon. Delete them with: `delete from auth.users where email like 'e2e-%@example.com' or email like 'dbg-%@example.com' or email like 'mob-%@example.com' or email like 'nojs-%@example.com';`
- Embedding-based semantic search, more source providers, and a background job queue for large ingestion.
