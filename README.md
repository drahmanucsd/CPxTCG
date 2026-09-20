# Shed — a jazz piano practice app

> *"The shed"* is where jazz musicians go to practice. This is a single web app that turns
> "what should I practice today?" into a loop of **see → play → verified → next**, whether the
> target is a voicing, a ii-V-I in twelve keys, or a whole tune with a backing track.

Status: **planning**. Nothing is built yet. Read the docs in order:

| Doc | What it answers |
|---|---|
| [`docs/01-goal-and-ux.md`](docs/01-goal-and-ux.md) | Who this is for, what "streamlined practice" means, the UX principles, the screens, the core loop |
| [`docs/02-features.md`](docs/02-features.md) | The full feature list, tiered (MVP → later), including the things you didn't ask for but will want |
| [`docs/03-architecture.md`](docs/03-architecture.md) | Platform decision, stack, data model, and the specific algorithms for the hard parts (voicing engine, matcher, timing, mic, speech, YouTube sync, sheet import) |
| [`docs/04-build-plan.md`](docs/04-build-plan.md) | Phased build order with definitions of done, risks, and what to decide before starting |
| [`docs/05-prior-art.md`](docs/05-prior-art.md) | What the existing browser chord trainers do, and exactly where we go past them |

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
