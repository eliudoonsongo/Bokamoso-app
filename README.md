# Bokamoso

A NotebookLM-inspired learning workspace built with Next.js, React, TypeScript and SQLite or Supabase. Sources, conversations and study tools share a three-pane workspace with a mobile panel switcher.

## Run Locally

Use Node.js 24 or newer and npm. SQLite uses Node's built-in `node:sqlite` module; its experimental warning is expected on Node 24.

```sh
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open http://127.0.0.1:3000. A new browser receives an original Grade 11 Physical Sciences sample notebook. It is demonstration content, not an official textbook or verified curriculum. No API key is needed for its study tools or source-excerpt chat.

## Configuration

Set server-only variables in `.env.local` or the server environment. [The environment template](.env.example) lists them; restart the development server after changing them.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Enables generated learning suites and cited AI answers from selected sources. Never expose it through a `NEXT_PUBLIC_` variable. |
| `GEMINI_MODEL` | Structured-output model ID. Defaults to `gemini-3.8-flash`; requires model access and quota in your Google project. |
| `ADMIN_UPLOAD_KEY` | Shared upload/delete key entered by an administrator in the source dialog. Required for uploads in production; optional only in local development. |
| `BOKAMOSO_STORAGE` | `sqlite` for a local database or `supabase` for hosted storage. If unset, Supabase variables select Supabase; otherwise SQLite is used. |
| `BOKAMOSO_DB_PATH` | Writable SQLite file path. Defaults to `data/bokamoso.sqlite`. |
| `SUPABASE_URL` | Supabase project API URL, required for hosted storage. |
| `SUPABASE_SECRET_KEY` | Server secret API key. A legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported. Never use a publishable/anon key or the database password here. |
| `BOKAMOSO_DB_NAMESPACE` | Supabase notebook namespace; defaults to `default`. Use separate namespaces for production, preview and disposable verification data. |

Without Gemini, chat returns literal excerpts from selected sources, not generated explanations. Regeneration works only with the three unchanged sample sources. Other selections show a configuration error instead of inventing a suite. Live Gemini responses are not covered by the offline tests.

Keep credentials in the ignored local environment file or the hosting provider's secret settings. The environment template must contain placeholders only. Explicitly set `BOKAMOSO_STORAGE=sqlite` locally when retaining the local database alongside hosted credentials.

## Supabase And Vercel

1. Apply [the database migration](supabase/migrations/20260905000100_bokamoso_store.sql) to a new Supabase project using the SQL editor or your migration workflow. The SQL editor does not record Supabase CLI migration history; do not blindly reapply an already installed schema.
2. Import this GitHub repository into Vercel, select the Next.js preset and Node.js 24, and retain the repository's build command. Its build output is `.next-build`.
3. Configure server-only `BOKAMOSO_STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `BOKAMOSO_DB_NAMESPACE=production` and a strong `ADMIN_UPLOAD_KEY` before deploying. Add Gemini settings only when a valid key and model access are available. Use a different namespace for preview deployments.
4. Verify notebook creation, progress, notes and reload persistence in the deployed app. The existing local SQLite database is not automatically migrated to Supabase.

The migration creates six `bokamoso_` tables with RLS enabled. Browser roles have no direct table or RPC access; only the server's service role can access them. The server enforces cookie ownership before notebook operations. Atomic notebook creation, suite replacement/source deletion and revision-checked progress updates protect concurrent writes.

## Learning Contract

`POST /api/suite` accepts `{ "notebookId": "...", "sourceIds": ["..."] }` and returns the exact six-field JSON payload, with no wrapper. `X-Suite-Id` identifies the saved suite and `X-Generation-Mode` identifies sample versus AI generation.

- `moduleSummary`
- `mindMap`: `{ id, label, parentId, summary }`, a connected hierarchy with one null-parent root.
- `flashcards`: exactly five `{ cardId, front, back, hint }` entries.
- `videoSummaryScript`: `{ segment, timestamp, visualCue, narration }` entries with continuous timestamps covering exactly 90 seconds.
- `diagnosticAssessment`: exactly three `{ questionId, question, options, correctOptionIndex, bloomLevel, gapNodeIfWrong, explanation }` entries, ordered Recall, Understanding, Application.
- `gamifiedQuestPlan`: `{ questTitle, narrativeHook, targetNode, xpReward, badgeName }`.

[The shared learning engine](src/lib/learning.ts) validates counts, identifiers, hierarchy, references, answer indices and timing. The server records progress transactionally: wrong answers flag a prerequisite and remove its mastery; a correct retry closes that gap. First-correct answers earn 20 XP per question ID. Quest rewards require all three diagnostics correct with their gaps closed, and can be earned once per notebook, including across suite regenerations. Flashcard review is not treated as assessed mastery.

The explainer is a timed slide player with optional browser speech synthesis and a transcript. It does not generate or export an MP4, and spoken duration depends on the browser voice. The exported script timeline is exactly 90 seconds.

## Sources And Grounding

Create a notebook with a grade, subject and module, then upload or paste its curriculum/syllabus and textbook/chapter material. Those metadata fields are inherited by every source chunk. Sources support text-based PDF, TXT and Markdown, up to 5 MB and 60,000 extracted characters each, with a maximum of 20 per notebook. Scanned/image-only PDFs need OCR before upload.

Selected source context is limited to 80,000 characters. Chunks retain a 200-character overlap. Changing source selection disables the old suite; deleting a source invalidates saved suites. Notes, messages, sources and progress persist in the selected storage backend.

Gemini receives the selected chunks, notebook scope and relevant learner state. Source text is treated as untrusted data. Chat citations must name an actual supplied chunk and quote text found verbatim in it. This is grounding and structural validation, not proof of factual or pedagogical correctness. Generated content still requires review; no vector search, external curriculum verification or live web research is performed.

The sample explainer photo is from [Unsplash](https://images.unsplash.com/photo-1517976487492-5750f3195933) and is served locally. Fonts are bundled locally as well.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run test:e2e
npm run build
```

Browser tests require installed Google Chrome. Playwright starts its own server on port 3107 with `.next-test` output, explicitly selected SQLite storage, a separate database file and Gemini disabled. It checks API ownership, origin protection, real PDF extraction, cited excerpts, output validation, reward integrity, browser persistence and responsive interactions. Test screenshots and traces are written to `test-results`.

`npm test` also exercises the Supabase migration in PGlite, including permissions, namespace isolation, atomic seed operations, revision checks and source invalidation. These tests do not replace a live Supabase connection check.

Production build/start commands use `.next-build`, separate from the running development server:

```sh
npm run build
npm start -- --port 3001
```

## Deployment Boundary

This is an anonymous prototype, not a production school platform. A server-issued HttpOnly learner cookie owns each browser's notebooks. Clearing the cookie loses access; there is no account recovery, cross-device sign-in, administrator role system, shared curriculum distribution or school tenancy. Practice answers are available to the browser, so diagnostics are not secure examinations.

Before a school deployment, add authenticated users and roles, a shared curriculum catalogue, consent/retention policies, upload scanning, backups and centrally enforced usage limits. Current rate limiting is in-process. Only upload materials you have permission to use; selected text is sent to Google when Gemini is enabled.

Use Supabase on ephemeral/serverless hosts such as Vercel. SQLite requires a Node server with a persistent writable volume and HTTPS outside localhost. Back up SQLite using SQLite-aware tooling; do not copy an open database without its WAL state. Configure and verify a backup/retention policy for hosted data before relying on it for learners.
