# Shed — working notes for agents

- pnpm monorepo. `packages/theory` (pure TS, no DOM; tests are the spec), `packages/engine` (browser-only but framework-free; manual clocks in tests), `apps/web` (Vite + React + Tailwind v4 PWA), `api/` (Vercel functions, empty until keys exist).
- Run: `pnpm install`, `pnpm test` (vitest), `pnpm typecheck`, `pnpm --filter @shed/web dev`. E2E: `pnpm --filter @shed/web build && PW_CHROMIUM=<chromium> npx playwright test` (tests inject MIDI through `window.__shed`).
- Eyeball musical output: `pnpm theory voicings "Ebm7"`, `pnpm theory lead rootlessA,rootlessB "Dm7 G7 Cmaj7"`, `pnpm theory id F3 A3 C4 E4`.
- Voicing families are data (`packages/theory/src/voicings.ts`); add a family by adding templates + a golden test in `test/voicings.test.ts`.
- Courses are the learner-facing object (`packages/engine/src/courses.ts`): a family, staged. `stageSpec()` is the only place a stage turns into drill settings — never set a bpm or strictness in a screen.
- Song analysis (`packages/theory/src/analysis.ts`) reads the chord stream, not one chord per bar; most ii-Vs are two chords inside one bar.
- Grading semantics live in `packages/theory/src/matcher.ts` (strictness ladder) and `packages/engine/src/drill.ts` (windows, lateness). Change them there, not in the UI.
- Docs in `docs/` are the plan of record; keep `04-build-plan.md` status current when a phase lands.
- Never bundle a copyrighted melody. Built-in tunes ship as chord changes only; a melody is the composition, a chord chart is a functional skeleton every fake book writes differently. Compositions published ≤ 1930 are public domain and may carry a melody too — nothing else may. Melodies for in-copyright tunes get recorded or typed in by the user (see docs/13-melody-timing.md).
