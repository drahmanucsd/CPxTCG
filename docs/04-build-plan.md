# 04 — Build plan

Ordered so every phase ends with something you'd actually practice with. Each phase lists the
**definition of done** — the thing you can do at the piano when it's finished — and the tests
that gate it. Estimates are for AI-assisted building in this repo; "session" ≈ one focused
working block.

## Phase 0 — Scaffold (1 session)

- pnpm monorepo: `packages/theory`, `packages/engine`, `apps/web`, `functions/`.
- Vite + React + TS + Tailwind; Vitest; Playwright; ESLint/Prettier; CI running tests on push.
- PWA shell, dark theme by default (music stands, dim rooms), landscape-first layout grid.
- **Done when**: `pnpm test` runs a trivial theory test and `pnpm dev` shows the Today shell.

## Phase 1 — Theory engine (2–3 sessions, mostly tests)

1. Chord symbol parser + normalizer + display styles. Test table of ≥ 200 real-world symbols
   (harvested from iReal charts and Real Book conventions), incl. the ugly ones (`C7(b9,#11)`,
   `Ebø7`, `A-Δ7`, `G7alt`, `F#m7b5/A`, `Bb+7`, `C6/9`, `%`, `N.C.`).
2. Chord tones: essential / optional / tensions / avoid per quality. Golden tests per quality.
3. Voicing generators, in this order (each with golden tests for C and a transposition property
   test): close + inversions → shells/guide tones → rootless A/B (3- & 4-note, altered dom,
   ø variants) → drop 2 / drop 3 / drop 2+4 → two-hand spread → quartal / So What → upper
   structures → four-way close → Kenny Barron / clusters / 6-9 / minor-major / sus / dim
   extras.
4. Register realization + low-interval limits + hand-span filter.
5. Voice-leading chooser with the cost function; tests: ii-V-I in 12 keys both cycles alternate
   A/B and stay in the box; 48-chord random walk never leaves the box; common tones kept.
6. Matcher: `identify(notes)` and `evaluate(notes, target, strictness)` with diagnosis. Tests for
   every family × quality (positive), and for each diagnosis category (negative).
7. Roman numerals both directions, incl. secondary dominants, subV, borrowed chords.
- **Done when**: `theory` has ≥ 95% coverage on generators/matcher and a CLI script prints every
  voicing family for any symbol (`pnpm theory voicings "Ebm7b5"`), which is how we eyeball
  musical correctness with a real pianist.

## Phase 2 — Drill MVP: this is where it beats the existing apps (3–4 sessions)

1. `engine`: MIDI input (WEBMIDI.js), chord settle state machine, attempt grading, latency
   offset store. Fake-MIDI injector for tests and for the on-screen keyboard.
2. `engine`: audio scheduler + metronome (count-in, subdivisions, accents, visual pulse hook),
   tap tempo, latency calibration flow.
3. `engine`: drill runner state machine (`idle → countIn → chord(n) → graded → next | pause |
   end`), generators: random (filtered, weighted), ii-V-I (major/minor, all orderings), cycles,
   turnarounds, blues, custom progression (symbols + roman numerals), speed ladder.
4. `web`: Drill screen exactly as in `01-goal-and-ux.md` (huge symbol, prev/next, pulse,
   keyboard diagram with green/red/hollow diff, hint ladder, reference playback on the sampled
   piano, hands-free keys/pedal). Presets drawer with ~15 shipped drills. Devices drawer with the
   live "you're playing: …" readout.
5. Persistence: attempts + drills in Dexie; Session review screen; heatmap on Progress.
- **Done when**: at a piano, pick "Rootless ii-V-I · cycle of 4ths · 120", the app counts in,
  grades every chord in time via MIDI, shows the fix on misses, and the review lists the weak
  keys. Playwright drives a full block with injected MIDI. Ship this to a URL and use it for a
  week before building Phase 3 — the feedback from real practice will reorder the rest.

## Phase 3 — Tunes and the band (3–4 sessions)

1. Song model + form resolver (repeats, endings, D.S./coda → flat bars) with tests on nasty
   forms.
2. iReal Pro importer (`irealbook://` and obfuscated `irealb://`, playlist `.html`), tested against
   a corpus of community charts; MusicXML chord+melody importer.
3. Built-in PD library (~25 standards + blues/rhythm-changes templates) authored as iReal
   strings or our JSON.
4. Chord-grid renderer (SVG, iReal look), flat-form view, transposition, guide-tone line view
   (VexFlow), section selection/loop.
5. Rhythm section: styles swing/bossa/ballad/latin/waltz/straight; walking bass generator;
   drum patterns; mix controls; count-in from the band.
6. "Play the changes" drill from a tune (family + voice leading), loop section, chord quiz,
   half-time changes, "only the ii-Vs".
7. Tune practice UI: bar cursor across the grid, per-bar verdict colouring, "Drill these bars".
- **Done when**: import the Jazz 1300 playlist, open *All The Things You Are*, press play, comp
  through it with a bass player at 140 in drop 2 with the bars lighting up and misses marked.

## Phase 4 — Backing tracks + practice plans (2 sessions)

1. YouTube: embed, URL paste, search via `functions/yt-search`, tap-to-sync object per
   song/video, bar clock, nudge/re-anchor, section loop by seek, playback rate. Saved syncs.
2. Uploaded audio with the same sync (Web Audio `AudioBufferSourceNode`, so loops are
   sample-accurate here).
3. Spaced-repetition state over (chord, family, tempo tier); the *Today* generator; time-boxed
   session runner chaining blocks; streaks.
4. MIDI session recording + replay against targets.
- **Done when**: *Today* opens with a plan, runs end-to-end hands-free, and the last block plays a
  YouTube track with the changes rolling in sync.

## Phase 5 — Ears and voice (3 sessions, R&D-flavoured)

1. Mic Level 1: AudioWorklet, onset detection, HPCP chroma, template grading at `chordTones`.
   Calibration flow. Test with recorded piano clips as fixtures (acoustic upright, digital piano
   through speakers, laptop mic).
2. Mic Level 2: Basic Pitch in ONNX Runtime Web (WebGPU with WASM fallback), rolling buffer,
   note events → MIDI grading path; fuse with Level 1 for provisional/firm verdicts.
3. Speech: recognizer + domain post-processor (test table of ≥ 100 spoken variants), commands,
   "name it & play it" mode, spoken prompts (TTS) with a "voice only" drill option.
4. Ear modes: chord quality ID, ii-V-I key ID, echo drills.
- **Done when**: with no MIDI cable, play an upright piano at a laptop; the app grades ii-V-Is at
  `chordTones` reliably (≥ 90% agreement with MIDI ground truth on the fixture set) and inversions
  at ≥ 75%; say "B flat minor seven" and it registers.

## Phase 6 — Bring your own Real Book (2 sessions)

1. `functions/ocr-chart` with the JSON schema; client uploader (camera on mobile, file/PDF on
   desktop; PDF pages rasterized client-side with pdf.js).
2. Verify view over the image; bar-box editing; form controls; save as Song with image.
3. Page-image practice view with the bar cursor; everything from Phase 3 works on scanned tunes.
4. (Optional) Audiveris path for melody → MusicXML → OSMD.
- **Done when**: photograph a Real Book page on a phone, fix two chords, and practice it with the
  band with the cursor moving across your photo.

## Phase 7 — Polish and backlog (ongoing)

Chord-scale display, comping rhythm trainer, bass-line practice, reharm drills, set lists,
practice journal, shareable drill URLs, teacher mode, cloud sync, Capacitor iPad build, small-
hands voicing filter, accessibility pass (screen reader for the non-drill screens, high-contrast
theme), i18n of chord display conventions.

## Risks and how the plan handles them

| Risk | Mitigation baked into the plan |
|---|---|
| Voicing "correctness" is musical, not just mathematical (a pianist will disagree with a template) | Phase 1's CLI dump + golden tests reviewed by a pianist before Phase 2; families are data, so fixing one is a one-line change plus a test |
| Latency makes timed grading feel wrong | Calibration in Phase 2 from day one; grading reports lateness rather than binary fail; windows are generous by default |
| Mic polyphonic detection on a real piano is noisy | Two levels; mic mode caps strictness; fixture-based accuracy targets; MIDI remains the precise path |
| Speech recognition mishears chord names | Domain post-processor with a mishearing table; independent grading of spoken vs played; push-to-talk option |
| YouTube sync drift; no audio access | Synthesized band is the primary pacer; YouTube is tap-synced with one-tap re-anchor; uploaded audio gets sample-accurate loops |
| Real Book copyright | Ship PD only; iReal import; user scans stay on device; no bundled scans ever |
| Safari/iOS has no Web MIDI | Mic mode; Capacitor wrapper later if demanded |
| Settings sprawl kills the UX | Drills are saved presets; the Today generator is the default path; settings live in a drawer |
| The theory engine grows into a swamp | It's a separate package with no DOM, property-tested, and every family is declarative data |

## Decisions to make before Phase 0

1. **Name** — working title *Shed*. Fine to change.
2. **Hosting** — Vercel (functions + static, simplest) vs Cloudflare Pages/Workers. Default: Vercel.
3. **OCR model** — Claude via the Anthropic API from the function (needs a key in the deploy env).
4. **YouTube search** — Data API key (quota ~100 searches/day free) or paste-URL only for v1.
   Default: paste-URL in Phase 4, add search when there's a key.
5. **Chord display default** — `Δ / - / ø` (Real Book style) vs `maj7 / m7 / m7b5`. Default: Real
   Book style, switchable.
6. **Which of the three personas is *you*** — this changes which shipped presets and which Phase 2
   families come first. Default: "chasing fluency", which builds the most demanding version.

## First concrete tickets (Phase 0 → Phase 1 start)

- [ ] `chore: pnpm monorepo, vite react ts tailwind vitest playwright ci`
- [ ] `theory: chord symbol tokenizer + parser + 200-case table`
- [ ] `theory: chord tones (essential/optional/tensions/avoid) per quality`
- [ ] `theory: voicing template DSL + realization + low-interval limits`
- [ ] `theory: close/inversions, shells, rootless A/B (+ golden tests C, + transposition property)`
- [ ] `theory: drop2/drop3/drop24`
- [ ] `theory: voice-leading chooser + 12-key cycle tests`
- [ ] `theory: matcher identify/evaluate + diagnosis`
- [ ] `theory: cli "voicings <symbol>"`
