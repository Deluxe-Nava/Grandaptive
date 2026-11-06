# GRANDAPTIVE · Your way

**Live demo:** https://grandaptive.vercel.app

A neuro-affirming journal with optional AI that helps autistic students understand their experiences, recognize their needs, and find their own words to communicate them — without being taught to mask better.

Built by five students from **Tecnológico de Monterrey, Campus Querétaro** for the **North American AI Challenge for Neurodiverse Learning**, with **Surfeando la Neurodiversidad** as our Challenge Partner.

> This is a prototype for an educational challenge. It is not therapy, diagnosis, or an emergency service. The demo uses fictional data only.

## Demo access

Sign-up is closed: the demo is invitation-only so that no real personal stories are stored. Access credentials for evaluators are shared privately with the challenge organizers — they are intentionally not published in this repository. If you need access, contact the team.

## The problem

Many autistic people practice social camouflage (masking): hiding or adjusting their natural behavior to fit social expectations. It can help with belonging and safety, but sustained under pressure it is linked to exhaustion, difficulty recognizing one's own needs, and overload. There are few spaces to understand one's own experience without being evaluated or corrected.

**Guiding principle:** the technology adapts to the person; it never turns social adaptation into an obligation. Unmasking is not a goal — each person decides when, how, and with whom to express themselves.

## What the MVP does

| Module | What you can do |
|---|---|
| **My journal** (core) | Write freely and save **without AI**. Edit with versioning, search, and choose which entries are available for pattern exploration. |
| **My assistant** (optional AI) | *Keep me company* · *Summarize what I wrote* · *Understand a situation* (three columns: **What happened · Possible readings · What we don't know**) · *Find my words* (2–3 editable phrasings by context: school, family, work, friendship) · *Explore a possible pattern*. Every question can be skipped; you can switch to *Just listen* or *Change topic*. |
| **My profile** | Write your own needs and preferences in five categories. AI pattern suggestions are only added if **you** accept them; each item shows its origin ("I wrote this" / "Suggested by AI and accepted by me"). Rejected patterns are not proposed again. |
| **Settings** | Interface: text size, contrast, spacing, reduced motion. Support style: tone, length, question style, just listen, follow-up questions. **Your explicit settings always override the AI.** |
| **Privacy** | Separate, revocable AI permissions (main switch, conversation, patterns, profile memory). Data export, deletion with a preview of everything that will be removed, sign-out on all devices, and account deletion. |

## Responsible AI

- **No AI by default.** Saving an entry never calls the AI; every AI feature requires explicit, per-layer consent.
- **Uncertainty, not authority.** The AI separates what was reported from hypotheses and unknowns, never states other people's emotions or intentions as facts, and never diagnoses.
- **Server-side safety filters** (English and Spanish) reject responses that assert third parties' feelings, offer false reassurance, diagnose, push masking ("make eye contact", "act normal"), or break *Just listen* — and require tentative language in pattern suggestions.
- **The user decides.** Nothing is saved to the profile automatically; any reading can be marked "doesn't fit me"; any conversation can be paused.
- **Minimal data.** Only the selected entries and authorized context are sent to the AI provider. API keys live only on the server. Daily and lifetime usage limits protect the budget.

## Tech stack

- **Frontend:** React 19 + TypeScript + Vite (`frontend/`)
- **Backend:** TypeScript HTTP API on Vercel Functions (`backend/src/`, entry point `api/index.ts`), Zod validation, HttpOnly session cookies, origin checks, encrypted, expiring AI receipts
- **Database & auth:** Supabase (Postgres with Row Level Security, Supabase Auth) — migrations in `backend/supabase/migrations/`
- **AI:** OpenAI Responses API with strict JSON schemas (`backend/src/ai.ts`); `AI_MODE=mock` for a free simulated mode
- **Shared contracts:** `shared/`

## Run locally

Requires Node.js 24.

```sh
npm ci
cp .env.example .env.local   # fill in Supabase keys; AI_MODE=mock avoids OpenAI costs
npm run dev:api              # backend on http://127.0.0.1:3001
npm run dev                  # frontend on http://127.0.0.1:5173
```

Checks:

```sh
npm run check    # TypeScript
npm test         # 69 tests (API, security, AI filters, shared rules)
npm run test:db  # SQL isolation tests on embedded PostgreSQL
npm run build
```

## Repository structure

```text
frontend/   React interface, styles, Vite config
backend/    API (src/), tests, scripts, Supabase migrations and SQL tests
shared/     Contracts and rules shared by frontend and backend
api/        Vercel entry point
docs/       Internal planning and technical documentation (in Spanish)
```

## Known limitations

- Invitation-only demo with fictional data; not yet validated with participants.
- The safety pause (RF-17) is technical only; crisis protocols require specialist review.
- Pattern rejection blocks the exact pattern key, not every paraphrase.
- Voice input, the interactive social-situations lab, and a browser extension are part of the future vision, not this MVP.

## Team

- Abril Odette Jiménez Sánchez
- Arturo Sebastián García Soto
- Emma Valentina Molina Hernández
- Erick Domínguez Navarrete
- Naoto Santiago Salvador Masuoka

## License

MIT — see [LICENSE](LICENSE).
