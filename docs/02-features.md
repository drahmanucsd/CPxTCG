# 02 — Feature list

Tiers: **T1** = MVP, the thing that already beats the existing trainers. **T2** = makes it a
practice *system* (tunes, band, plans). **T3** = the ambitious inputs (mic, voice, scans).
**T4** = polish and backlog. Items marked ★ were not in the original brief; they're listed
because a pianist will ask for them within a week.

## A. Harmony engine (T1) — the foundation everything sits on

- **Chord symbol parser** covering real-world jazz notation: `Cmaj7 CΔ CM7 C∆7`, `C-7 Cm7 Cmin7`,
  `C7`, `Cø Cm7b5 C-7b5`, `C°7 Cdim7 Cdim`, `C6 C-6 C6/9`, `C9 C-9 Cmaj9 C11 C13`, `Csus Csus4
  C7sus4 Csus2`, `Cadd9`, `C-Δ7 CmMaj7`, `C7alt`, `C7(b9) C7b9#11 C7#9b13 C7(#5) C+ Caug Cmaj7#11`,
  `C/E C7/Bb` (slash bass), `N.C.`, `%` (repeat), and bracketed/superscript variants. Normalizes
  to one canonical form; round-trips to display in a user-chosen style (`Δ`/`maj7`, `-`/`m`,
  `ø`/`m7b5`).
- **Chord model**: root, quality, extensions, alterations, bass → intervals, *essential tones*
  (what a voicing must contain: usually 3 & 7; 3 & 6 for 6ths; 4 & 7 for sus; b3 & b5 & bb7 for
  dim7), *available tensions* (what may be added: 9, 11/#11, 13/b13 depending on quality), and
  *avoid notes*.
- **Voicing generators** (every family, each producing all valid candidates for a chord):
  - Close position: root position, 1st/2nd/3rd inversion (3- and 4-note)
  - Shells: `1-3-7`, `1-7-3`, `1-7`, `1-3` (LH), guide tones only (`3-7` / `7-3`)
  - Rootless **A** and **B** forms (Bill Evans / Wynton Kelly style), 3-note and 4-note:
    maj7 `3-5-7-9`/`7-9-3-5`, m7 `b3-5-b7-9`/`b7-9-b3-5`, dom7 `3-13-b7-9`/`b7-9-3-13`,
    ø `b3-b5-b7-1`/`b7-1-b3-b5` (and `b3-b5-b7-9` variant), dim7, altered dom `3-b13-b7-#9`
    / `b7-#9-3-b13`, sus `4-b7-9-5`
  - Drop 2, drop 3, drop 2+4 (from any 4-note close voicing and any inversion)
  - Four-way close / **block chords** (Shearing: melody doubled an octave below, with the
    diminished-passing rule available for T2 tune mode)
  - **Quartal** (stacked 4ths, 3–5 notes, "So What" voicing = three 4ths + a 3rd on top),
    quartal over root
  - **Upper-structure triads** on dominants (II/7 = `9-#11-13`, bII, bIII, bVI, VI… each with
    its tension content), on maj7 and m7 where applicable
  - **Spread / two-hand** voicings: LH `1-5` or `1-7` or `1-5-9`, RH `3-7-9`, `3-5-7-9`, `7-9-3-5`
    etc.; two-hand quartal; two-hand rootless (LH 3-7, RH 9-5 + extension)
  - Kenny Barron minor 11 (`1-5-9 | b3-b7-11`), "Herbie" maj7 (`1-5-9 | 3-7-#11`… ), 6/9 stacks,
    cluster voicings (`1-9-3` / `7-1-9` etc.), altered dominant polychords
  - Sus and phrygian voicings, dim7 4-note with tensions, minor-major, 7#11 lydian dominant
  - Each family declares: hands (LH / RH / both), default register box, low-interval limits
    (no 2nds below C3, no 3rds below ~G2, no 7ths below ~F2 as sensible defaults, configurable),
    and which chord qualities it applies to (a "drop 2 of a sus" exists; a "rootless A of a
    triad" doesn't).
- **Voice-leading engine**: given previous voicing + next chord + family, rank candidates by
  total semitone motion (optimal voice pairing), common-tone retention, register drift from the
  box centre, and a "don't cross voices" penalty. Deterministic, so the "correct" voice-led
  answer is reproducible and can be shown as a hint. Cycle-aware: over a 12-key cycle it keeps
  the hand from walking off the keyboard.
- **Chord matcher**: played notes → `{ chord, family, inversion, confidence, diagnosis }` and
  `evaluate(played, target, strictness)` with the four strictness levels and a human-readable
  diagnosis (missing / extra / wrong inversion / wrong register / wrong family / muddy low
  interval).
- **Roman numeral analysis** in a key (for prompts and for reading custom progressions):
  `ii-7 V7 IΔ`, `bVII7`, `#iv°7`, `V7/ii`, `subV7`, modal mixture. Both directions (numeral →
  chord in key, chord → numeral given key).

## B. Drills / target generators (T1 unless noted)

- **Single chords**: random from a filter (qualities × keys × families). Weighted random that
  favours cells you're weak in ("smart random").
- **ii-V-I**: major and minor (`iiø V7b9 i-`), 12 keys ordered by cycle of 4ths / cycle of 5ths /
  chromatic up / chromatic down / whole-step / minor-3rds / random. Optional `ii-V` only,
  `V-I` only, `ii-V-I-VI` turnaround.
- **Cycles**: any chord quality around the cycle of 4ths/5ths (e.g. "all dom7 around the cycle
  in drop 2"), "same chord, all 12 keys" (chromatic), Coltrane changes.
- **Turnarounds & cells**: `I-vi-ii-V`, `iii-VI-ii-V`, `I-bIII7-bVI7-bII7` (tritone-sub turnaround),
  backdoor `iv-bVII7-I`, `I-#i°-ii-#ii°-iii`, rhythm-changes A section, "Autumn Leaves" cell.
- **Blues forms**: basic 12-bar, jazz blues, Bird blues, minor blues, in any key.
- **Custom progression editor**: type chord symbols or roman numerals (`| Dm7 G7 | Cmaj7 % |`),
  with bar/beat placement, save as a drill. Shareable as a URL.
- **From a tune** (T2): the changes of any tune in the library are a drill.
- **Echo drills** ★ (T2): app plays the voicing, you copy it (ear + hands).
- **Chord quiz / memory** ★ (T2): key or roman numeral shown, chord symbol hidden.
- **Transposition drills** ★ (T2): a short progression shown in one key, play it in another.
- **Speed ladder** ★ (T1): tempo auto-ramps on clean passes.

## C. Pacing (T1 unless noted)

- **Metronome**: 30–300 bpm, time signatures 4/4 3/4 5/4 6/8, subdivision clicks, accent pattern,
  swing feel for 8ths (for the rhythm section), **count-in** (1 or 2 bars), tap tempo, visual
  pulse always on. Muted-bar mode ★ (click drops out for N bars to test internal time).
  Beats-per-chord: 1, 2, 4, 8, or "as written in the tune".
- **Free mode**: wait until correct, then advance (with optional hold time), or manual next.
- **Synthesized rhythm section** ★ (T2): walking bass generated from the changes (root/5th/
  chromatic approach logic), ride/hi-hat/brushes patterns for swing / bossa / ballad / straight-8
  / waltz / latin, optional piano comping ghost track. This is the *reliable* backing track —
  tempo-flexible, loopable, always in sync. YouTube is a bonus on top.
- **Backing tracks, zero interaction** (T2): a **curated catalog** ships with the app — for every
  standard, a verified YouTube backing track with its tempo and the video time of beat 1, so
  "Play with the track" just plays in sync. Built by `scripts/curate-backing.ts` (search + rank:
  embeddable, right length, right channels, "no piano" preferred), verified once at a piano
  (tap beat 1 → exported from Devices → merged). Tunes not in the catalog fall back to a live
  search, then a pasted link; the first tap is remembered so it's automatic from then on. Embedded
  player, **tap-to-sync** (tap beat 1 of the form; enter/tap tempo), the app runs a bar clock
  from that anchor and shows the changes in time; re-anchor button for drift; loop a section via
  seek; playback-rate control (0.5×–1.5× via the player). Per-tune saved sync so it's set up once.
- **Records — play with the actual recording, minus you** ★ (T3): drop your own audio for a tune
  (a mix, or stems from a separator) → per-stem mute/solo/gain (piano off by default, keep Chet's
  horn, bass and drums) → played on the audio clock, so once beat 1 is tapped (and saved) the
  chart is sample-accurate against the record. Then, in order: **in-browser stem separation**
  (Demucs 6-stem via WASM — vocals, drums, bass, piano, guitar, other; minutes per track, nothing
  uploaded), **beat tracking on the drum stem** → tempo map so drifting live records stay in sync,
  and **form alignment** (chart chroma vs audio chroma) so bar 1 of every chorus is found without
  taps. Legally clean because the audio is yours and never leaves the device.

## D. Input (T1: MIDI + on-screen; T3: mic + voice)

- **MIDI** (Web MIDI): device picker, hot-plug, multiple devices, note timestamps, sustain-pedal
  tracking, velocity captured (for T4 dynamics stats). Fallback: computer-keyboard piano and
  on-screen keyboard (for testing / no piano handy).
- **Microphone** (T3): polyphonic pitch detection in the browser. Level 1 = pitch-class
  detection (chroma) — grades at `chord-tones` / `octave-free` strictness; Level 2 = note-level
  polyphonic transcription (Basic Pitch model in-browser) — grades inversions/voicings. Onset
  detection so we know *when* you played. Calibration step; works with an acoustic piano and a
  laptop mic.
- **Voice — speech recognition** (T3): "Name it & play it" mode — a roman numeral (or a played
  chord, or a key + scale degree) is shown; you must *say* the chord name and play it within the
  window; both are graded. Spoken-name parser tolerant of "B flat minor seven flat five",
  "half-diminished", "E flat major seventh", "G seven altered". Voice commands for navigation.
- **Speech synthesis** (T3): spoken prompts so you never look at the screen ("D minor seven…
  G seven… C major seven").
- **Latency calibration** (T1) for MIDI+audio, separately for mic.

## E. Prompt modes (what the target looks like on screen)

- Chord symbol (T1) · Roman numeral in key (T1) · Voicing formula (`3-7-9-5`) (T1) ·
  Notes on keyboard (T1, as hint) · Spoken (T3) · Ear: chord played, you name/play it (T2) ·
  Hidden: only the key and bar number, from memory (T2).

## F. Tunes & the Real Book problem (T2)

- **Song model**: title, composer, key, tempo, style, time signature, form (sections with
  repeats, 1st/2nd endings, D.S., coda — resolved to a flat bar list for playback), chords with
  beat positions, optional melody (MusicXML), notes/tags, "learning status".
- **Built-in library**: public-domain standards only (works published ≤1930 are PD in the US as
  of 2026: *After You've Gone, Avalon, Ain't Misbehavin', Basin Street Blues, Body and Soul, Bye
  Bye Blackbird, Dinah, Embraceable You, Exactly Like You, Georgia On My Mind, Honeysuckle Rose,
  I Got Rhythm, Indiana, Ja-Da, Limehouse Blues, Mean To Me, On the Sunny Side of the Street,
  Rose Room, St. Louis Blues, Star Dust, Sweet Georgia Brown, Sweet Lorraine, Tiger Rag, What Is
  This Thing Called Love, Whispering*, …) plus generic forms (blues, rhythm changes).
- **iReal Pro import**: paste an `irealbook://` / `irealb://` URL or drop an exported `.html`
  playlist → full library in seconds (the community "Jazz 1300 standards" playlist is the de facto
  Real Book index). This is how most users get "every song in the Real Book".
- **MusicXML import**: chords + melody; melody rendered on a staff.
- **Scan import — "bring your own Real Book"** (T3): photograph or PDF-upload a page → vision
  model extracts title, key, time signature, sections, bar-by-bar chord symbols, repeats/codas →
  you verify in a bar-grid editor overlaid on the image → saved locally with the image. Then the
  **page image is the practice view**: a bar cursor highlights the bar in time. Melody OMR is
  optional and later.
- **Views**: chord grid, flat form, guide-tone line ★, page image with cursor, transposed
  (any key, and "up a 4th / down a 5th" quick buttons for singers).
- **Practice modes**: play the changes (with family + voice leading), loop section, chord quiz,
  with backing track, **half-time changes** ★ (each chord twice as long — for learning), and
  **"only the ii-Vs"** ★ (drill just the cadences the tune contains, in the tune's keys).
- **Set lists** ★: ordered tune lists for a gig, practiced as one session.

## G. Memory / progress (T1 core, T2 plans)

- Every attempt stored: target (chord, family, inversion, key, strictness), played notes,
  correct/miss, diagnosis, lateness, hints used, tempo, source drill/tune, timestamp.
- **Weak-spot map**: keys × families × qualities, aggregated with recency weighting.
- **Practice plan generator** (T2): builds *Today* from the worst cells, a core drill and a
  stretch block; respects a target duration. Deliberately simple — no scheduling algorithm.
- Streaks, minutes, per-tune clean-at-tempo %, per-block latency trend, export/import JSON.
- Everything lives in the browser (IndexedDB + localStorage). No accounts, no sync, no server
  state: export JSON if you change machines.
- **MIDI recording of the session** ★ (T2): what you actually played, replayable against the
  targets — "hear your mistakes".

## H. Things you didn't list that belong in the app ★

- **Guide-tone line view** for tunes (3rds & 7ths as a melodic line) — the fastest way to learn
  changes and to see why voice leading works.
- **Chord-scale display**: for the current chord, show the scale (dorian / altered / lydian
  dominant…) and available tensions; drill "play the scale then the voicing".
- **Comping rhythm trainer**: the rhythm section plays and a comping rhythm pattern is shown
  (Charleston, anticipations); you must hit the voicing *on those rhythms*.
- **Bass-line practice**: LH walking bass generated for the changes; play the line, then play
  line + RH voicing.
- **Low-interval-limit guard**: warns when a voicing is muddy (even when "correct").
- **Ear training tied to the harmony engine**: quality ID, ii-V-I key ID, voicing-family ID by ear,
  "which tension is that?".
- **Reharm suggestions** for a tune (tritone subs, backdoor, Coltrane) as alternate drills.
- **Warm-up generator**: 3 minutes of the family you drilled least this week.
- **Practice journal** per tune ("bridge still rough") and per session.
- **Shareable drills / progressions** as URLs and QR codes (teacher → student).

## I. Explicitly out of scope (for now)

- Accounts and cloud sync (progress is local; JSON export is the backup), spaced-repetition
  scheduling, teacher mode, full notation editing, audio-to-MIDI transcription of recordings,
  downloading YouTube audio (against ToS — we embed), shipping copyrighted lead sheets, native
  mobile apps (a PWA and, if needed later, a Capacitor wrapper).
