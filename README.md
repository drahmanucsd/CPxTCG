# Shed — a jazz piano practice app

> *"The shed"* is where jazz musicians go to practice. This is a single web app that turns
> "what should I practice today?" into a loop of **see → play → verified → next**, whether the
> target is a voicing, a ii-V-I in twelve keys, or a whole tune with a backing track.

Status: **phases 0–6 built, unpolished** — see *What works today* below. Read the docs in order:

| Doc | What it answers |
|---|---|
| [`docs/01-goal-and-ux.md`](docs/01-goal-and-ux.md) | Who this is for, what "streamlined practice" means, the UX principles, the screens, the core loop |
| [`docs/02-features.md`](docs/02-features.md) | The full feature list, tiered (MVP → later), including the things you didn't ask for but will want |
| [`docs/03-architecture.md`](docs/03-architecture.md) | Platform decision, stack, data model, and the specific algorithms for the hard parts (voicing engine, matcher, timing, mic, speech, YouTube sync, sheet import) |
| [`docs/04-build-plan.md`](docs/04-build-plan.md) | Phased build order with definitions of done, risks, and what to decide before starting |
| [`docs/05-prior-art.md`](docs/05-prior-art.md) | What the existing browser chord trainers do, and exactly where we go past them |

## What works today

- **Drills** (`/drills`): 18 presets + an editor. Random / ii-V-I in any key order / cycles / turnarounds / blues / custom text. 20 voicing families, voice leading on or off, five-level strictness, free or timed pacing with count-in, speed ladder, look-ahead, hint ladder, reference playback, keyboard diff on misses, hands-free keys and sustain-pedal double-tap.
- **Input**: Web MIDI (Chrome/Edge/Firefox), computer keyboard, **microphone** (acoustic piano, graded at pitch-class level), **voice** ("name it & play it", commands).
- **Tunes** (`/tunes`): 20 public-domain standards, **iReal Pro import** (links, playlists, exported HTML), chart text, **scan a page** (local OCR → bars → editable chart → practice on your own photo with a moving cursor). Chart / flat form / guide-tone views, section loops, transposition, synthesized **rhythm section** (bass + drums in styles), and **backing tracks found for you**: the tune page searches YouTube (`"<title>" backing track`), you pick one once, and “Play with the track” tap-syncs the changes to it.
- **Progress**: kept in the browser (IndexedDB, no accounts, no server). Heatmap by voicing / chord type, weak spots feed the **Today** plan and smart-random drills; session review with "drill these", MIDI replay; streak; JSON export/import as the backup.
- Tests: 256 unit (theory + engine), 6 Playwright e2e. `pnpm install && pnpm test && pnpm --filter @shed/web dev`.

YouTube search needs `YOUTUBE_API_KEY` on the server (see `.env.example`); without it the tune page links to the YouTube search and takes a pasted link. Not yet: Basic-Pitch (note-level mic), melody OMR, comping-rhythm trainer. Details and order in [`docs/04-build-plan.md`](docs/04-build-plan.md).

## One-paragraph version

Local-first PWA (React + TypeScript + Web Audio + Web MIDI). A pure, heavily-tested **theory
engine** generates every voicing family for any chord symbol and voice-leads between them. A
**drill engine** turns that into targets (random chords, ii-V-Is, cycles, turnarounds, blues,
custom progressions, tunes) paced by a metronome or a synthesized rhythm section or a YouTube
backing track. An **input layer** hears you through MIDI, the microphone (polyphonic pitch
detection), or your voice (speech recognition), and grades each attempt. A **progress layer**
stores every attempt, finds your weak spots (key × voicing × chord type), and builds tomorrow's
session. Tunes come from public-domain standards, iReal Pro imports, and your own scanned Real
Book pages (chord symbols extracted by a vision model; you keep the scans).
