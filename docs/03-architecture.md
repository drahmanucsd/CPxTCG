# 03 — Architecture

## Platform decision: local-first PWA

**Build a web app.** It's the lowest-friction option and the only one where "open a link on
the laptop on the music stand" works. Specifics that drive the choice:

| Need | Web status (2026) |
|---|---|
| MIDI in | Web MIDI API: Chrome, Edge, Opera, Firefox 108+, Android. **Not Safari / iOS / iPadOS** (WebKit refuses it over fingerprinting). |
| Audio out, scheduling | Web Audio everywhere; AudioWorklet everywhere. |
| Mic in | `getUserMedia` everywhere incl. iOS. |
| Speech in | Web Speech API: Chrome/Edge (good), Safari (ok), Firefox (poor). |
| Speech out | `speechSynthesis` everywhere. |
| YouTube | IFrame Player API everywhere (embedding only — no audio access, no downloads). |
| In-browser ML (pitch) | ONNX Runtime Web / TF.js with WebGPU/WASM everywhere. |
| Storage | IndexedDB (hundreds of MB fine for scans and attempts). |

So: desktop Chrome/Edge/Firefox gets everything; iPad gets everything except MIDI (mic mode
works, and that's the mode acoustic-piano players use anyway). If iPad-with-MIDI matters later,
wrap the same code in **Capacitor** (native CoreMIDI bridge) — a week of work, not a rewrite.

Alternatives considered and why not now:
- **Tauri/Electron desktop app**: same web code, adds native MIDI on macOS Safari-less and
  local-file access for Real Book PDFs. Not lower friction than a URL; keep as a later wrapper.
- **Native iOS/iPadOS (Swift + AudioKit)**: the best music-stand device, but doubles the effort
  and forks the codebase. Revisit only if iPad + MIDI becomes the primary use.
- **Backend-heavy app**: unnecessary. Everything except OCR and YouTube search runs client-side;
  those two are a couple of serverless functions.

## Stack

- **Monorepo** (pnpm workspaces):
  - `packages/theory` — pure TypeScript, zero DOM. Chord parsing, voicing generation, voice
    leading, matching, roman numerals, tune model. **Exhaustively unit-tested** (Vitest); this
    is where correctness lives and where an AI can iterate fastest against tests.
  - `packages/engine` — browser but framework-free: audio scheduler/metronome, rhythm-section
    generator + sampler, MIDI input + chord settle detection, mic pipeline, speech, drill
    runner state machine, YouTube sync clock. Testable with fake clocks.
  - `apps/web` — React 19 + TypeScript + Vite, Tailwind, Zustand (session state) + Dexie
    (IndexedDB persistence), React Router. PWA via `vite-plugin-pwa`.
  - `functions/` — serverless (Vercel/Cloudflare): `ocr-chart` (vision model call), `yt-search`
    (YouTube Data API proxy holding the key). Nothing else server-side in v1.
- **Audio**: raw Web Audio for the click and the scheduler (precision matters, Tone.js's
  transport adds abstraction we don't need); `smplr` (or `soundfont-player`) for a sampled
  piano (Salamander Grand, lazily loaded) and a small drum/bass kit.
- **MIDI**: `webmidi` (WEBMIDI.js) for device handling; we consume raw messages.
- **Notation**: a custom **chord-grid renderer** (SVG, iReal-style) for tunes — simpler, faster
  and more readable on a stand than staff notation; **VexFlow** for the guide-tone line and the
  keyboard/staff hint; **OpenSheetMusicDisplay** only when a MusicXML melody exists.
- **Pitch detection**: AudioWorklet + WASM. Level 1 chroma/HPCP built in-house (FFT →
  harmonic-pitch-class profile → template match); Level 2 **Basic Pitch** (Spotify's polyphonic
  note model, MIT/Apache, runs in ONNX Runtime Web).
- **Speech**: Web Speech API (`SpeechRecognition`, continuous, interim results) + a domain
  post-processor; `speechSynthesis` for prompts.
- **Vision/OCR**: Claude with structured output (JSON schema) for chord-chart extraction from
  page images. Audiveris (server, Java) as an optional later path for melody OMR.
- **Testing**: Vitest (theory/engine), Playwright (web) with injected MIDI/mic events.
- **Deploy**: static hosting + serverless functions; no database until sync (T4, Supabase).

## Data model (TypeScript, abbreviated)

```ts
// packages/theory
type PitchClass = 0|1|2|3|4|5|6|7|8|9|10|11;     // C=0
type Midi = number;                                // 21..108

interface ChordSymbol {
  root: PitchClass; quality: 'maj'|'min'|'dom'|'halfdim'|'dim'|'aug'|'sus4'|'sus2'|'minmaj';
  seventh: 'maj7'|'min7'|'dim7'|'6'|null;
  extensions: Set<9|11|13>; alterations: Set<'b9'|'#9'|'#11'|'b13'|'b5'|'#5'|'alt'>;
  bass: PitchClass|null; display: string; }      // display = original text

interface ChordTones { essential: PitchClass[]; optional: PitchClass[]; tensions: PitchClass[]; avoid: PitchClass[] }

type VoicingFamily = 'close'|'inv1'|'inv2'|'inv3'|'shell'|'guide'|'rootlessA'|'rootlessB'
  |'drop2'|'drop3'|'drop24'|'fourWayClose'|'quartal'|'soWhat'|'upperStructure'|'spread'
  |'twoHandRootless'|'kennyBarron'|'cluster'|'sixNine'|/*…*/ string;

interface Voicing { chord: ChordSymbol; family: VoicingFamily; notes: Midi[];
  hands: { left: Midi[]; right: Midi[] }; inversion?: number; label: string /* "3-7-9-5" */ }

type Strictness = 'exact'|'octaveFree'|'family'|'chordTones';
interface Verdict { ok: boolean; strictnessMet: Strictness|null;
  diagnosis: Array<'missing'|'extra'|'wrongInversion'|'wrongRegister'|'wrongFamily'|'lowIntervalLimit'>;
  missing: PitchClass[]; extra: PitchClass[]; detected?: { chord: ChordSymbol; family?: VoicingFamily } }

interface Song { id; title; composer?; key: PitchClass; mode: 'major'|'minor'; tempo; style: 'swing'|'bossa'|'ballad'|'latin'|'waltz'|'straight';
  timeSig: [number, number]; sections: Section[]; form: Bar[] /* flattened, repeats resolved */;
  source: 'builtin'|'ireal'|'musicxml'|'scan'; scan?: { imageId; barBoxes: Rect[] }; melody?: MusicXMLRef }
interface Bar { chords: Array<{ symbol: ChordSymbol; beat: number; duration: number }>; section: string; index: number }

// packages/engine
interface DrillSpec { id; name; generator: Generator /* random|iiVI|cycle|turnaround|blues|custom|tune */;
  family: VoicingFamily[]; strictness; voiceLeading: 'strict'|'lenient'|'off'; hands: 'LH'|'RH'|'both';
  register: { low: Midi; high: Midi }; pacer: Pacer /* free|metronome|band|youtube */; bpm; beatsPerChord;
  lookAhead: 'always'|'lastBeat'|'never'; ladder?: { up: number; down: number }; blockLength: { minutes?: number; reps?: number } }

interface Attempt { id; ts; drillId; songId?; target: Voicing; played: Midi[]; verdict: Verdict;
  latenessMs: number|null; hintsUsed: number; bpm; input: 'midi'|'mic'|'screen'; spoken?: { heard: string; ok: boolean } }
```

## The hard parts, specified

### 1. Voicing generation

Families are declared as **degree templates** with substitution rules, then *realized* into
MIDI notes inside a register box under constraints.

```
rootlessA(dom7)  = [3, 13, b7, 9]     substitutions: 13→b13 if b13/alt; 9→b9|#9 if altered
rootlessB(dom7)  = [b7, 9, 3, 13]
drop2(X)         = take a 4-note close voicing in inversion k, move 2nd-from-top down an octave
quartal(m7)      = stack 4ths from {1, 4, b7, b3, 13/9…} choosing pcs ⊆ available tones, 3–5 notes
upperStructure(dom7) = LH {3, b7} + RH triad from {II, bIII, bV(=#11 triad), bVI, VI…} filtered by allowed tensions
```

Realization: for each template produce all octave placements whose lowest note is within the
family's box (defaults: LH rootless lowest note in [D3, C4]; two-hand: LH lowest ≥ E2, RH
within [C4, C6]); reject placements violating low-interval limits; reject spans > hand-size
(LH ≤ 10ths by default; configurable for small hands). Output a candidate list, deterministic
order. Every family × quality has a **golden test** listing expected candidates for C, and a
transposition property test (candidates(X) = transpose(candidates(C))).

### 2. Voice leading

`choose(prev: Voicing|null, candidates: Voicing[]) → Voicing`:
cost = Σ|Δ semitone| over the optimal voice pairing (brute force for ≤ 6 voices; Hungarian
otherwise) + 0.5·(register-centre drift) + 2·(voice crossings) + 3·(common tone available but
not kept). Lowest cost wins; ties broken by keeping the previous form (A stays A). The A↔B
alternation that ii-V-Is want falls out of the cost automatically (Dm7 A → G7 B → CΔ A); tests
assert exactly that for all 12 keys, both cycles, and that a 24-chord cycle never leaves the
box.

### 3. MIDI chord capture

State machine per attempt: `idle → collecting (first note-on) → settled (70 ms no new note-on
| beat window closed) → graded`. Sounding set = notes currently down ∪ notes released in the
last 150 ms. Sustain pedal (CC64) is *not* treated as holding notes. In timed mode the graded
set is the sounding set at `beat + offset` (best of the window). MIDI event `timeStamp`
(DOMHighResTimeStamp) is converted to AudioContext time via a stored offset measured at
startup and refined by the tap calibration.

### 4. Timing

Classic look-ahead scheduler: a 25 ms `setInterval` schedules audio events up to 100 ms ahead
on `AudioContext.currentTime`; UI beat pulses are driven from the same schedule via
`requestAnimationFrame` comparison. The rhythm section is pattern-based (per-style bar
patterns, walking bass built per bar from the chord's root/5th/approach notes with a simple
rule set: beat 1 root, beat 4 chromatic or dominant approach to the next root, 2–3 from chord
tones/scale). Latency calibration = median of (tap time − click time) over 8 taps, stored per
device; grading windows subtract it.

### 5. Microphone pitch pipeline

```
mic → AudioWorklet (2048 frames, 50% hop) → onset detector (spectral flux) →
Level 1: FFT → HPCP (12-bin chroma, harmonic-weighted) → template match vs target chord tones
Level 2: rolling 1–2 s buffer → Basic Pitch (ONNX Web) → note events → same grading path as MIDI (octaveFree/family)
```
Level 1 runs always (cheap, ~10 ms); Level 2 runs on onset and returns ~200–400 ms later; the
UI shows a provisional verdict from Level 1 and firms it up. Mic-mode drills default to
`chordTones` strictness and a wider grading window. Calibration: user plays a C major triad
and a single low C; we set the noise floor and check the model hears it.

### 6. Speech

`SpeechRecognition` continuous with interim results; a **domain grammar post-processor** maps
transcripts to `ChordSymbol` with a fuzzy dictionary (`"flat"→b, "sharp"→#, "minor|min"→m,
"major seven(th)|maj seven"→Δ7, "half diminished|half dim"→ø, "altered"→alt, letter names with
common mishearings: "be"→B, "sea/see"→C, "eh"→A, "gee"→G, "dee"→D, "ee"→E, "ef"→F). Commands
(`next again slower faster stop show me play it`) are matched first. In "name it & play it"
mode the spoken chord and the played chord are graded independently and both shown. Speech is
gated behind push-to-talk *or* always-on with the mic already open for pitch (one stream, two
consumers).

### 7. YouTube sync

Embed via IFrame API. Sync object per (song, videoId): `{ anchorVideoTime, bpm, beatsPerBar,
formStartBar, playbackRate }`. The app's bar clock = `(player.getCurrentTime() − anchor) ×
bpm/60 / beatsPerBar`, polled at 60 Hz via `rAF` (getCurrentTime is cheap). UX: press play,
tap on beat 1 of the form → anchor; tap-tempo 8 beats (or type bpm from the video title); a
"nudge ±50 ms" and "re-anchor" control. Looping = seek to bar start time. Drift on real tracks
(human players) is small over a chorus; re-anchor per chorus is a one-tap fix. **No audio
analysis of the embedded player is possible** (cross-origin), which is why the synthesized
rhythm section is the primary pacer and YouTube is the "play with the record" bonus.

### 8. Sheet import (scan → chart)

1. Image/PDF page → client-side downscale → `functions/ocr-chart` → Claude with a JSON schema:
   `{ title, composer, key, timeSig, tempoMarking, systems: [{ bbox, bars: [{ bbox, chords: [{ text, beat }], repeatStart, repeatEnd, ending, rehearsalMark, coda, segno }] }] }`.
2. Client parses every chord `text` with the theory parser; unparseable ones are flagged.
3. **Verify view**: the page image with bar boxes overlaid; tap a bar to edit its chords;
   form controls (repeats/endings) resolved into a flat form with a preview. Save = Song with
   `source: 'scan'` plus the image and bar boxes in IndexedDB. The image never leaves the device
   except transiently for the extraction call (stated in the UI).
4. Practice: the same page image with the current bar highlighted from the bar clock. Bar boxes
   from the model are usually good enough; a "fix boxes" mode lets the user drag corners.
5. Melody (optional, later): Audiveris server → MusicXML → OSMD.

### 9. Persistence & sync

Dexie tables: `songs`, `drills`, `attempts`, `sessions`, `images`, `syncs`, `settings`. Attempts
are append-only; aggregates (heatmap, SRS state) are recomputed incrementally and cached. Export
= one JSON (+ images as a zip). Cloud sync (T4) mirrors the same tables to Supabase with
last-write-wins per row; no server logic.

## Security / privacy notes

- Mic and speech streams stay in the browser; nothing is recorded unless the user turns on
  session MIDI recording (MIDI only, never audio).
- Scan extraction sends the page image to the OCR function once; the function does not store it.
- YouTube: embed only; no downloading; Data API key lives in the function, with quota guarding.
- No accounts in v1; export/import JSON is the backup story.
