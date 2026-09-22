# 12 — Learning a tune: the stages, and the three kinds of backing track

Supersedes the tune half of `07-backing-and-repertoire-ux.md`.

## What internalising a tune actually is

End state: you play it from memory, in time, melody and changes, in the original key and one
other; you hear the next chord before it arrives; you know where you are in the form at every
moment; and you have one recording in your head as the reference.

That last part is the point. A tune is internalised in the ear and the hands follow. Skipping the
ear is why tunes do not stick.

## A tune is a stage, not a page

A tune carries its current stage. The page shows the stage name, one primary button, the chart at
the fade level that stage needs, and a loop bar. Everything else is behind Options. The stage
pre-sets what the learner was previously choosing by hand.

| # | Stage | What it sets |
|---|---|---|
| 1 | **Listen** | The reference recording, opened externally. Nothing graded. |
| 2 | **Melody** | Hand split on, band on, the head in the right hand. |
| 3 | **Roots** | Hand split on, left hand graded on roots only. |
| 4 | **The map** | The Shape view *is* the stage, ending in the chord quiz. |
| 5 | **Guide tones** | Guide-tone view as the live practice view. |
| 6 | **Voicings** | The family you are currently learning in Voicings — the bridge between the two halves of the app. |
| 7 | **In time** | Whole form with the band, timing graded. |
| 8 | **From memory** | The chart fade steps automatically after each clean pass: chords → numerals → sections → nothing. |
| 9 | **With the record** | Your own audio. Notes graded, timing never. |
| 10 | **Keep it** | On the repertoire list with a due date; Today pulls it. |

What this removed from the page: four view tabs, ten voicing chips, the checkboxes, the fade
selector, eight YouTube result cards, and four mode buttons. All still reachable; just assigned
to a stage.

## Three different things called "backing track"

They were tangled together. They have different requirements and only one of them needs to exist
for every tune.

**1. Reference recording** (stages 1–2). One per tune, chosen by you, stored as a link and opened
externally. No sync, no search, no API. The app does not pick your recording.

**2. Practice accompaniment** (stages 3–8). Generated from the chart. This is the only one that
exists for every standard, and sync, looping, tempo, key and instrument isolation come free
because we generated it. This is where the investment goes — see §The band.

**3. Play-along with a real record** (stage 9, late). The audio is the user's problem: a DRM-free
purchase or their own file, separated locally. The record is the clock — no metronome, the user
taps beat 1 of each chorus so drift is corrected, notes are graded and **timing never is**.
Rubato ballads get no cursor.

### Why the YouTube search is gone

An embed gives no access to the audio, so nothing can be isolated or removed from it, and sync
means tapping against a player we do not control. It also needed an API key, had unknown key,
tempo and form per result, and it occupied the centre of the tune page. Deleted: `api/yt-search.ts`,
the search UI, and the curated-catalog script. One reference link per tune remains.

### Stem separation, free

**Demucs** (Meta, MIT) is the model. `demucs -n htdemucs yourfile.mp3` gives drums/bass/other/vocals.
For a piano trio, "other" *is* the piano — drop it and keep bass and drums. For a horn record,
"other" is piano plus horn, so duck it to about −15 dB rather than muting. The 6-stem
`htdemucs_6s` has a dedicated piano stem that its own authors call weak. Alternatives: Spleeter
(MIT, older), UVR (free GUI), and demucs.cpp in WebAssembly, which is what
freemusicdemixer.com runs — no server, a one-time model download, minutes per track on CPU. That
last one fits this app's no-server design and is the eventual path; the CLI is the documented one
today. The app must never ship a downloader.

## The band

Architecture: chart → generated score per chorus → the existing look-ahead scheduler → audio on
the same clock the grader uses. Generation is pure and lives in `packages/theory`
(`walkingBass.ts`, `groove.ts`); rendering lives in `packages/engine/src/rhythmSection.ts`.

**Walking bass.** Root on beat 1 (third or fifth on later choruses); the beat before a chord
change approaches the next root chromatically, diatonically, or from the fifth above; chord and
scale tones between, mostly stepwise, holding a direction. Beam search against a cost for leaps,
repeats, range edges and direction changes, with the final path sampled from the surviving beams
so every chorus differs while none is wrong. Two-feel on the first chorus and on ballads.

**Swing.** The ratio moves with tempo — roughly 3:1 at 80, 2:1 at 140, 1.3:1 at 220. A fixed 2:1
sounds mechanical at both ends.

**Drums.** Ride pattern with the offbeats swung by that ratio, hi-hat on 2 and 4, feathered kick,
snare comping drawn from a small figure vocabulary whose density rises with the chorus number,
fills on the last two beats of every eighth bar, a crash on the top of each chorus, and a
count-in that fills in eighths.

**Piano.** The model voicings, placed with real comping rhythms rather than on every downbeat,
soft, and mutable. This is what Listen plays, and it is hint level 3 heard in context.

**Feel.** Fixed tempo, but bass a few ms ahead, ride a few ms behind, ±10% velocity and ±6 ms
placement noise. Form awareness — count-in, two-feel first chorus, fills at section ends, crash
on top — teaches a learner where they are far more than sample quality would.

Still synth voices, not samples. The sampler is the next step (Salamander piano CC-BY, VSCO 2 CE
bass CC0, Freesound CC0 drums, via smplr); the generation layer is already separated from the
rendering layer so dropping samples in does not touch the musical logic.

## Melodies

The app had chord data and no note data, which blocked stages 2–6 from being graded.

Format is **ABC notation** — text, diffable, hand-editable, and readable by abcjs if engraved
notation is ever wanted. `packages/theory/src/melody.ts` parses and writes it.

Grading is deliberately loose: pitch sequence by longest common subsequence, octave-insensitive,
**rhythm ignored entirely**. A head is phrased, not transcribed, and failing someone for laying
back is both unmusical and discouraging.

Sources: for the built-ins, the original published sheet music (works published through 1930 are
US public domain — the Real Book's later arrangements are not, and recordings never are). Enter
the lead line by hand; OMR on 1920s scans costs more time than it saves. For imported tunes,
**record the head** once against the click — `quantise()` snaps it to the grid and stores it
locally as that user's reference, never in the repo.

## Difficulty

Computed from the analysis: harmonic rhythm, distinct chord count, key centres, non-diatonic
chords and tempo, offset by how much of the tune is ii-V-Is you already know and how much
repeats. Scored 1–5, shown on the tune and used to order the library. On the built-ins this puts
Ja-Da and Indiana at 1 and Body and Soul at 4, which is the order these are actually taught in.
