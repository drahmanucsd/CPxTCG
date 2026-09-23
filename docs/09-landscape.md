# 09 — The landscape: what already exists, and where Shed actually stands

> Research pass of 2026-09-21. `05-prior-art.md` was a quick scan of browser chord trainers
> written before the build; this supersedes it for the area it covers.
>
> **Status: one of five planned searches completed.** Five parallel searches were started —
> MIDI-grading piano apps, browser/OSS trainers, the jazz-education market, backing-track and
> beat-detection tech, and the practice science. Four were cut off by an API session rate limit
> partway through, so only §1 below is written. §2–§5 are stubs naming the questions they were
> meant to answer; do not treat their absence as "nothing found".
>
> Every claim in §1 came with a URL and was checked against a live page. Items that could not be
> verified are marked **[unverified]** and are leads, not facts.

---

## 1. Browser trainers and open source — Shed's exact technical niche

### The nearest competitor is open source

**jazzchords.app** ([site](https://jazzchords.app/), [source](https://github.com/telaaron/piano-chord-trainer), **MIT**)
is the closest thing to Shed that exists, and the whole app is public: SvelteKit engine
(`chords.ts`, `voicings.ts`, `voice-leading.ts`, `adaptive.ts`, `coach.ts`) with tests, plus a
Swift iOS port. Web MIDI + mic + on-screen keyboard, 16 chord types, ii-V-I in twelve keys,
cycle of fourths, custom progressions, metronome 40–240. Free tier keeps **one week** of history;
Studio €59/yr, Lehrpult €290/yr, Institut €490+/yr.

Two things matter about it:

- **It does not grade rhythmic placement.** It measures *reaction time per chord* (`durationMs`)
  and promotes on a mastery threshold. No onset-vs-beat comparison anywhere in the engine.
- **Only 9 voicing types** — root, shell, half-shell, full, rootless A/B, inversions. No drop 2/3,
  quartal, So What, upper structures, Kenny Barron or block chords.

Its `coach-params.ts` is the most useful single file in the category: every adaptive-difficulty
constant is annotated with the telemetry that produced it. Mastery threshold **2000 ms/chord**;
real practice blocks average **410–1743 ms/chord**; a cold-start calibration drill averages
**7632 ms**; **4 chords/minute** is the honest session rate ("eight made a '5 minute' session run
to forty chords"); selection weights weak 4.0 / new 2.5 / strong 0.3. Shed's speed ladder and
`smartWeight` currently have no empirical prior at all; this is one.

### The other 2026 entrants

| Product | Strength | Missing |
|---|---|---|
| [VoicingLab](https://voicinglab.com/) | **16 voicing styles / 10,674 voicings** incl. drop 2, quartal, "Bill Evans"; voice-leading engine; iReal import; 25 standards; teacher tier with 30 seats | No grading, no metronome found. Selling **£29 lifetime to its first 100 users** — i.e. weeks old |
| [Chord Runner](https://chordrunner.cnhsync.dev/) | Endless-runner game; Web MIDI + mic; recognises inversions/spreads/rootless; **timing window with a perfect-timing bonus** | Game scoring, not analysis. $9.99/mo or **$23 lifetime** |
| [piano.org/tools](https://piano.org/tools/) | 26 free tools, ~11 Web MIDI, incl. a **[MIDI latency calibration](https://piano.org/tools/midi-calibration/)** that caches a per-device offset and applies it so "timing windows stay fair at higher tempos" | Content is triads-deep |
| [Playsheet](https://playsheet.app/) | Free; MusicXML/MIDI upload; **real note-and-timing feedback**, loop bars, post-session mistake review | Reading-driven, not voicing-driven |
| [chordpianotrainer.vercel.app](https://chordpianotrainer.vercel.app/) | MIDI + mic, rootless toggle, $7.99 one-off | No metronome, no timing |

### Worth mining

- **[Tonal.js](https://github.com/tonaljs/tonal)** (MIT, 4.2k★) — `@tonaljs/voicing`,
  `@tonaljs/voice-leading`, and a **pluggable voicing dictionary**. `Voicing.search()` enumerates,
  `Voicing.get()` picks by voice leading from the previous voicing. Shed's 21 families could be
  expressed as a custom dictionary rather than a custom engine.
- **[rawfalafel/jazz251](https://github.com/rawfalafel/jazz251)** — SRS for ii-V-I, guide tones and
  rootless A/B in twelve keys. PWA, offline, localStorage, **zero dependencies, no build step**,
  and its theory engine works in *spelled* notes (C♭, not B) — an enharmonic correctness most
  tools skip. No licence stated, so the deck taxonomy is the takeaway, not the code.
- **[brona90/twelve-keys](https://github.com/brona90/twelve-keys)** — shell, rootless, tritone subs,
  turnarounds, drop-2, quartal, upper structures, stride, Coltrane. Engraved with LilyPond + the
  LilyJAZZ font. The best reference for *what the families should be* and how to notate them.
- **[vurs1/rhythm-section](https://github.com/vurs1/rhythm-section)** (MIT) — in-browser AI jazz
  accompanist: mic pitch tracking, **tempo following**, generates walking bass + rootless voicings
  + swung ride in 13 kB with no runtime deps. A live argument against Shed's fixed click: the band
  follows the player rather than the player following a metronome.
- **[audiouniversityonline-sketch/rhythm-trainer](https://github.com/audiouniversityonline-sketch/rhythm-trainer)**
  — obscure, but the most rigorous grading design found. Published bands at 72 bpm:
  **±25 ms = "Locked in", ±60 ms = "Solid", ±120 ms ≈ 75/100 "Getting there"**. Measures each input
  device's constant offset, reports it, and subtracts it before scoring — grading *consistency*
  rather than absolute accuracy.

### Where Shed already agrees with the best practice found

`AudioClock` (`packages/engine/src/clock.ts`) already aligns `performance.now()` to the audio
clock via `getOutputTimestamp()`, and `packages/engine/src/midi.ts:84` converts each MIDI event's
own `timeStamp` through it. So the "score against what the player heard" recommendation is
already implemented. What is *not* implemented is the per-device constant-offset measurement
(Shed has a manual `latencyOffsetMs` calibration, not an automatic per-device cached one).

### The gaps nobody is filling

1. **Nobody grades where a voicing lands against the beat.** Jazz voicing tools measure how long
   you took to find the chord; tools that measure onset-vs-beat are reading or drum trainers.
   The intersection is empty.
2. **Nobody pairs breadth of voicings with grading.** VoicingLab has the families and no grader;
   jazzchords.app has the grader and nine families.
3. **Nobody is genuinely local-first** except hobby projects — jazzchords.app deletes free-tier
   history after a week specifically to sell sync.
4. **Latency calibration is solved and ignored** by the whole jazz cohort.

**[unverified]** musictheory.net's web exercises accepting MIDI (their FAQ omits it);
InnoviCat's rhythm trainer methodology (403s to fetch); scales-chords.com (403); whether
VoicingLab's MIDI mode grades anything; the 56★ on `rallytakis8-cloud/jazz-hands-practice`
(README reads as AI-generated marketing, stars look inorganic).

---

## 2. Apps that grade MIDI playing — *not yet written*

Questions outstanding: does Melodics (the closest analogue for a graded, timing-scored practice
loop) grade chord voicings or only rhythm/pads? What do Piano Marvel, Flowkey, Skoove, Simply
Piano, Yousician and Tomplay actually assess — notes only, or placement? Which of them handles
jazz repertoire, and how do they license it? Pricing and free tiers.

## 3. The jazz-education market and what learners say is missing — *not yet written*

Questions outstanding: Open Studio, PianoGroove, Jazzadvice, Learn Jazz Standards, Jazz Piano
School — what do they charge and what is the structure? Is "LH root + RH 3-7 → guide tones →
rootless A/B" the standard teaching order in Levine / DeGreg / the established methods, or is
`08-mvp.md`'s ladder idiosyncratic? What do r/JazzPiano and app-store reviews say people wish
existed, and where do people quit? Do teachers endorse or warn against twelve-keys-with-a-rising-
tempo drilling?

## 4. Backing tracks, beat detection, and the legal position on charts — *not yet written*

Questions outstanding, and this one blocks `07-backing-and-repertoire-ux.md`: is in-browser
tempo/downbeat detection (Essentia.js, aubio WASM, BeatNet, web-audio-beat-detector) accurate
enough **on swung jazz** to replace the tap-on-beat-1 ritual, or is that plan unfounded? Is
Demucs-in-WASM viable in 2026? And what do iReal Pro, Band-in-a-Box, Chordify and Ultimate Guitar
actually distribute and under what arrangement — the answer determines whether §1's "ship the
index, import the charts" plan is right.

## 5. Practice science — *not yet written*

Questions outstanding: is the speed ladder supported by motor-learning evidence? Does interleaving
keys beat blocked practice? Does immediate per-chord timing feedback help or hurt? And the specific
number this app is built on: **what is the defensible "in time" tolerance?** §1 turned up one
practitioner source putting ±120 ms at the bottom of acceptable; that needs checking against
research on onset-asynchrony JND and jazz microtiming before the window is changed.
