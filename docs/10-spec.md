# 10 — Specification sheet

Factual description of Shed as built. No roadmap, no rationale. For an evaluator asked to
critique the app against the goal *"an app that helps piano players improve."*

Generated against commit `82d45ee`, 2026-09-21. Counts are from the source, not estimates.

---

## 1. Identity

| | |
|---|---|
| Name | Shed |
| Type | Single-page web app, installable PWA |
| Domain | Jazz piano — chord voicings, chord progressions, tunes |
| Target user | A pianist who can already play, learning jazz voicings and time |
| Not included | Sight-reading, scales/technique, melody, improvisation, notation entry, ear training as a separate mode |
| Distribution | Not deployed. Runs locally (`pnpm dev`) or on Vercel (config present, never deployed) |
| Accounts | None. No server-side user state |
| Price | None set |
| Licence | None declared in the repo |
| Repo | `github.com/drahmanucsd/CPxTCG`, branch `claude/piano-training-app-814y6f`, public |

## 2. Runtime requirements

| Capability | Requirement | Fallback if absent |
|---|---|---|
| MIDI keyboard input | Web MIDI API — Chrome, Edge, Firefox | Computer keyboard, or microphone |
| Microphone input | `getUserMedia` + Web Audio | MIDI or computer keyboard |
| Voice commands | Web Speech API — Chrome, Edge | Feature hidden |
| Audio output | Web Audio API | None; app is unusable |
| Storage | IndexedDB | None; progress not saved |
| Safari / iPad | No Web MIDI | Microphone or computer-keyboard mode only |
| Network | Required only for YouTube backing tracks and YouTube search | Everything else works offline |
| Server | One Vercel function (`api/yt-search.ts`, 16 lines) for YouTube search | App falls back to paste-a-URL |
| API keys | `YOUTUBE_API_KEY` only (YouTube Data API v3, 10,000 units/day free, 100 units per search) | Search disabled |

## 3. Codebase

| Package | Purpose | Lines (src) | Runtime deps |
|---|---|---|---|
| `packages/theory` | Pure music theory. No DOM, no browser APIs | 2,617 | none |
| `packages/engine` | Drill runner, transport, capture, MIDI, mic, speech, audio, rhythm section | 1,719 | `@shed/theory` |
| `apps/web` | React UI | 3,187 | dexie 4, dexie-react-hooks, pdfjs-dist 6, react 19, react-dom, react-router 7, tesseract.js 7, zustand 5 |
| `api` | Vercel serverless | 16 | none |
| `scripts` | Backing-catalog curation CLI | 67 | none |

Total tracked files: 109. Commits on branch: 82. Build: Vite 6 + Tailwind 4. TypeScript strict.

Production bundle (gzipped): app 185 KB, PDF worker chunk 130 KB, CSS 6 KB, entry 7 KB.
Service worker precaches 10 entries / ~1 MB.

## 4. Input methods

| Method | Mechanism | Grading resolution | Notes |
|---|---|---|---|
| MIDI keyboard | Web MIDI; each event's own `timeStamp` converted to the audio clock via `AudioContext.getOutputTimestamp()` | Full — exact MIDI notes and onset times | Sustain pedal (CC64) doubles as a hands-free control |
| Computer keyboard | `z`–`m` / `q`–`p` mapped to notes, `,`/`.` octave | Full note resolution; timing is keyboard-event-based | |
| Microphone | Web Audio `AnalyserNode`, FFT 8192, peak picking 50–4200 Hz, chroma folding, 40 Hz frame rate, 22 dB threshold, 2 frames on / 5 frames off | **Pitch-class only** — cannot distinguish octaves | Strictness is force-capped to `octaveFree`; +60 ms added to the latency offset |
| Voice | Web Speech API | Chord name only, graded separately from playing | Commands: next, slower, faster, stop, pause, resume, hint, play |

**Chord capture**: notes are grouped into one attempt when no new note-on arrives for **70 ms**
(`settleMs`). Releases within a grace window still count as part of the chord.

**Latency**: a manual calibration screen exists, storing a single global `latencyOffsetMs`.
There is no automatic or per-device measurement.

## 5. Theory engine

**22 voicing families**, defined as data (interval templates per quality class):

| Group | Families |
|---|---|
| basic (5) | `close`, `inversions`, `shell`, `guide` (3-7), `root37` (RH root + LH 3-7) |
| rootless (4) | `rootlessA`, `rootlessB`, `rootless3A`, `rootless3B` |
| drop (3) | `drop2`, `drop3`, `drop24` |
| quartal (3) | `quartal`, `quartal3`, `soWhat` |
| two-hand (2) | `spread`, `twoHandRootless` |
| advanced (5) | `fourWayClose`, `upperStructure`, `kennyBarron`, `cluster`, `sixNine` |

By hand assignment: 9 left-hand, 7 two-hand, 6 either.

**17 quality classes** in the type (`maj`, `maj6`, `maj7`, `min`, `min6`, `min7`, `minmaj7`,
`dom7`, `dom7sus`, `alt`, `halfdim`, `dim7`, `aug`, `aug7`, `sus4`, `sus2`, `power`); **12 of them
have voicing templates** in at least one family (`aug`, `sus4`, `sus2`, `power` are parsed and
playable but have no dedicated family templates beyond `close`). Not every family implements every
class; `familiesFor(chord)` returns only those that do.

**Voicing generation** enumerates every candidate inside per-family register boxes, with
configurable max span, low-interval-limit filtering, and transforms (inversions, drop 2/3/2+4).
**Voice leading** picks the candidate minimising motion cost from the previous voicing.

**Grading — 5-level strictness ladder** (`packages/theory/src/matcher.ts`):

| Level | Passes when the played notes are |
|---|---|
| `exact` | these exact MIDI notes |
| `shape` | the same voicing in any octave (same bottom→top intervals) |
| `octaveFree` | the same pitch classes in any arrangement |
| `family` | any valid voicing of the target's family for this chord |
| `chordTones` | the essential tones, and nothing outside the chord's allowed tones |

A verdict reports the strictest level met, a diagnosis list (`missing`, `extra`,
`wrongInversion`, `wrongRegister`, `wrongFamily`, `lowIntervalLimit`, `nothingPlayed`), the
missing/extra pitch classes, per-note correct/wrong/missed arrays for the keyboard diff, and a
one-line message.

## 6. Drill engine

**7 target generators**: `random` (with optional weak-spot weighting), `iiVI` (major/minor, 4
shapes, altered option, any key order), `cycle` (any quality through any key order),
`turnaround` (10 named: I-vi-ii-V, iii-VI-ii-V, IV-I-ii-V, tritone, backdoor, Ladybird,
rhythm-changes A, Coltrane, minor, diminished passing), `blues` (4: basic / jazz / bird / minor),
`custom` (parsed chord text), `progression` (explicit chord list, used by tunes and by
"drill my misses").

**Pacing**

| Field | Values | Default |
|---|---|---|
| `mode` | `free` (no clock) / `timed` (transport) | per preset |
| `advance` | `onTime` (bar ends the chord) / `onCorrect` (chord repeats until played) | `onTime` when timed, `onCorrect` when free |
| `bpm` | 30–300 | per preset |
| `beatsPerChord` | integer | 2 or 4 |
| `timeSig` | 4/4, 3/4, 2/4, 5/4, 6/8, 12/8 | 4/4 |
| `subdivision` | 1, 2, 3, 4 clicks per beat | 1 |
| `countInBars` | 0, 1, 2 | 1 |
| `timingWindowMs` | ± ms counting as in time, capped at half the chord length | 120 |
| `maxRepeats` | cap in `onCorrect` mode | 8 |
| `holdMs` | green-hold before advancing in free mode | 350 |
| `earlyMs` | how early an attack still attributes to the chord | 150 |

**Outcome model** — every target resolves to exactly one of four:

| Outcome | Condition |
|---|---|
| `clean` | notes correct at the required strictness, inside the timing window, no hint open |
| `timing` | notes correct, outside the timing window (`early` or `late`) |
| `wrong` | something was played, it did not pass |
| `blank` | nothing playable arrived in the window |

`assisted` flags a correct attempt made with a hint open. `repeats` counts extra windows used in
`onCorrect` mode. Per-session timing stats: median offset, IQR spread, and every signed offset.

**Speed ladder**: after each pass, tempo +N if every chord in the pass was correct, −M otherwise,
clamped to a min/max. Typical values `up 4 / down 6 / min 50 / max 240`.

**Session length**: by reps, by passes through the progression, or by minutes.

**Transport**: look-ahead scheduling (100 ms horizon, 25 ms tick), audio-clock based. Tempo
changes re-anchor so the current beat position is preserved. `nudge(dt)` shifts the grid for
external-track sync.

**Hints** — 3 levels: (1) chord tones, (2) the voicing's note names, (3) plays it. Rendered as
text, on the keyboard, or both, per a user setting. On the keyboard, level 1 outlines chord-tone
pitch classes with degree labels; level 2 shows the actual voicing notes.

**30 presets** (12 of them the MVP ladder: 3 rungs × learn / ii-V-I / random / until-you-get-it).
22 timed, 8 free time. Plus a full custom-drill editor persisted to IndexedDB.

## 7. Content

**20 built-in tunes**, all US public domain (published ≤ 1930): I Got Rhythm, Honeysuckle Rose,
St. Louis Blues, Sweet Georgia Brown, Body and Soul, Bye Bye Blackbird, Indiana, Ja-Da,
Whispering, Ain't Misbehavin', Georgia on My Mind, On the Sunny Side of the Street, Exactly Like
You, Blue Skies, Oh Lady Be Good, Tea for Two, Basin Street Blues, What Is This Thing Called
Love, Avalon, Limehouse Blues.

**Import paths for everything else**: iReal Pro links and playlists, iReal Pro exported HTML,
chart text format, and photographing a page (Tesseract OCR in-browser, chord symbols extracted,
laid into bars, edited before saving; the page image is stored locally and becomes the practice
view with a moving cursor).

**Copyright position**: no copyrighted lead sheets are bundled, by policy recorded in
`CLAUDE.md`. Post-1929 repertoire must be imported by the user.

**Accompaniment**: synthesized rhythm section (bass + drums) in 8 styles — swing, bossa, ballad,
latin, waltz, straight, funk, even-8ths. YouTube backing tracks with a per-tune saved beat-1
anchor and bpm. User-supplied audio files as stems, with per-stem mute and gain.

## 8. Data model

All client-side, IndexedDB via Dexie, schema version 4.

| Store | Key fields |
|---|---|
| `attempts` | every graded chord: chord, family, label, ok, met, `latenessMs`, `timing`, `outcome`, `assisted`, `repeats`, hints, attempts, played notes, target notes, bpm, pass, sessionId, specId, ts, root, suffix |
| `sessions` | id, specId, name, start/end, total, correct, avgLateness, finalBpm, hintsUsed, the full summary object, and the raw MIDI of the run |
| `drills` | custom and generated drill specs |
| `songs` | imported/scanned tunes |
| `images` | scanned page blobs |
| `records` / `audio` | user-supplied backing audio and stems |

Settings (localStorage, zustand): chord display style, spelling, latency offset, MIDI device,
click volume, piano volume, visual pulse, spoken prompts, hint style, level, onboarded flag,
per-song backing track choices.

**Export/import**: whole database as JSON. **No server sync, no telemetry, no analytics, no
error reporting, no third-party requests except YouTube when a backing track is used.**

MIDI of every session is recorded (capped at 20,000 events) and can be replayed. Audio is never
recorded.

## 9. Progress model

- **Heatmap**: accuracy by root × voicing family, or root × chord quality, over the last 60 days.
- **Weak spots**: per (root, suffix, family) cell, recency-weighted with a 14-day exponential
  decay, minimum weight 2.5, sorted by weighted accuracy ascending.
- **Smart random**: weak cells weighted up to 4×, unseen cells 2×, formula `1 + 3 × (1 − accuracy)`.
- **Today plan**: 3–4 blocks — warm-up, weak spots (auto-generated from the heatmap), core,
  stretch — chosen by a declared level (`learning` / `tunes` / `fluency`).
- **Streak**: consecutive days with a session.
- **Post-session review**: verdict sentence and one recommended action from a deterministic rule
  set; four outcome counts as filters; timing strip plot with median and spread; breakdown by key,
  by chord quality and by position in the phrase; per-chord keyboard diff; history of previous
  runs of the same drill.

## 10. UI surface

9 routes: `/` (Today), `/drills`, `/drill/:id`, `/review/:sessionId`, `/progress`, `/devices`,
`/tunes`, `/tunes/:id`, `/scan`. The drill screen is full-screen; everything else sits under a
persistent nav bar.

Dark theme only. No light mode. No internationalisation. Keyboard shortcuts in the drill: space
pause, → skip, `h` hint, `p` play it, `m` metronome, `−`/`=` ±1 bpm, `_`/`+` ±5 bpm,
sustain-pedal double-tap to pause.

## 11. Verification

| Kind | Count | Coverage |
|---|---|---|
| Unit tests (vitest) | **261** across 12 files | chord parsing 117, spoken-chord parsing 41, voicings 27 (golden expected-note assertions), voice leading 18, matcher 14, progressions 12, song/form 12, drill runner 8, scan 3, capture 3, transport 3, mic 3 |
| E2E (Playwright, real browser, MIDI injected) | **7** | free drill grading, timed drill count-in, the four outcomes separating late from wrong, Today/Drills/Progress/Devices render, tunes + band, iReal import, scan page |
| Typecheck | clean | all 3 packages, strict |
| Lint | 0 errors, 25 warnings | warnings are React-Compiler readiness rules (refs read during render in the drill loop) |
| CI | typecheck, lint, unit tests, build, e2e | GitHub Actions on push/PR |

**Not verified**: nothing has been tested with a real MIDI keyboard, a real acoustic piano
through a microphone, or a real player. All grading verification is synthetic — injected MIDI
events on a manual clock.

## 12. Build status by area

| Area | State |
|---|---|
| Theory engine, voicings, voice leading | Complete |
| Drill engine, timed grading, outcomes, speed ladder | Complete |
| Drill UI, metronome, hints, custom editor | Complete |
| Review screen | Complete |
| Progress, heatmap, weak spots, Today plan | Complete |
| Tunes: PD library, iReal import, chart text, grid, guide tones, rhythm section | Complete |
| Microphone input | Pitch-class level only; note-level (Basic Pitch) not built |
| Voice input | Complete |
| Page scan / OCR | Works; bar-box editing not built (chart text is edited instead); melody OMR not built |
| YouTube backing tracks | Infrastructure complete; the curated catalog is **empty** and the live search needs the API key |
| Stem separation, beat tracking, form alignment | Not built |
| MusicXML import | Not built |
| Deployment | Not done |

## 13. Known defects and limitations

1. **`onCorrect` repeats the chord, not the phrase.** In a ii-V-I, failing the ii repeats the ii
   alone, so the progression is never heard as a unit.
2. **The ±120 ms timing window is unvalidated.** It is a chosen number with no research or
   user-testing behind it. The single external reference found puts ±120 ms at the bottom of
   "acceptable", which would make Shed's pass/fail threshold too lenient.
3. **Timing is pass/fail, not graded.** There are no bands within the window.
4. **Latency calibration is manual and global**, not automatic and per-device.
5. **The speed ladder's constants are arbitrary** (+4 / −6 bpm), with no empirical basis.
6. **The weak-spot decay constant (14 days) and thresholds are arbitrary.**
7. **The backing-track flow requires choosing a YouTube video from search results, then tapping
   the tempo, then tapping beat 1.** Roughly seven interactions before bar 1.
8. **The backing catalog ships empty**, so the "no interaction" path never triggers.
9. **Microphone grading cannot detect octaves**, so every drill silently drops to `octaveFree`.
10. **No metronome-free rubato or swing-feel grading.** Timing is measured against a straight
    grid; swing eighths and laid-back playing are not modelled.
11. **Only 20 tunes ship.** Everything else depends on the user importing.
12. **`react-hooks` compiler-readiness lint warnings (25)** — the drill screen reads refs during
    render.
13. **No light theme, no i18n, no mobile-specific layout testing.**
14. **No onboarding beyond a three-button level picker.**

## 14. Explicit assumptions with no evidence behind them

An evaluator should treat each of these as an open question, not a decision:

- That a pianist wants chord-by-chord grading at all, rather than looser feedback.
- That "right notes, wrong time" is a useful distinction to surface to a learner.
- That raising tempo after a clean pass is the correct progression mechanic.
- That the three-rung ladder (RH root + LH 3-7 → guide tones → rootless A/B) matches how jazz
  piano is actually taught.
- That drilling all twelve keys in one session beats concentrating on a few.
- That a heatmap of weak keys is something a player will act on correctly.
- That local-only storage with no account is a feature rather than an obstacle.
- That 4 beats per chord at 80–120 bpm is an appropriate starting difficulty.

## 15. Competitive position

From `09-landscape.md` (one of five research passes completed; the rest were cut off):

- The nearest competitor, **jazzchords.app**, is MIT-licensed and public. It grades **reaction
  time per chord**, not rhythmic placement, and has **9 voicing types**. Free tier retains one
  week of history; paid €59–490/yr.
- **VoicingLab** has 16 voicing styles / 10,674 voicings and a voice-leading engine, but no
  grading and no metronome found. Launched recently.
- **No product found grades where a voicing lands relative to the beat.** Tools that grade
  timing are sheet-reading or rhythm trainers; tools that drill voicings measure reaction time.
- **piano.org** ships free automatic per-device MIDI latency calibration; no jazz tool does.
- Shed's differentiators as built: 22 voicing families, timing-aware grading, no account,
  fully offline, own-repertoire import.
