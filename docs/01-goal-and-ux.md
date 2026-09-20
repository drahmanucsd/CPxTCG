# 01 — Goal and UX

## The goal, stated precisely

A pianist's practice is fragmented across a Real Book, a metronome app, YouTube backing tracks,
a chord-drill website, a notebook of "things I'm bad at", and their own memory of what they did
yesterday. **Shed replaces all of that with one loop and one place where progress accumulates.**

The one loop is:

```
 target  →  you play  →  the app hears it  →  verdict + fix  →  next target
```

Every feature in this app is one of five things, and if a proposed feature isn't one of these it
probably doesn't belong:

| Slot | Examples |
|---|---|
| **Target generator** — what to play | random chord, ii-V-I in 12 keys, cycle of 4ths, a tune's changes, a section on loop |
| **Constraint** — *how* to play it | voicing family, voice-leading on/off, hands, register, inversion |
| **Pacer** — *when* to play it | free (wait for correct), metronome, synthesized rhythm section, YouTube track |
| **Input** — how the app hears you | MIDI, microphone, voice, on-screen keys |
| **Memory** — what the app remembers | every attempt, weak-spot map, spaced repetition, streaks, tune list |

"Streamlined" means: **two taps from opening the app to playing**, and **zero decisions during
a session** (the app already decided what's next).

## Who it's for

Three people, and the app must work for all three without settings-sprawl:

1. **Learning voicings (early intermediate).** Knows what a m7 is, is learning rootless A/B forms,
   drop 2, shells. Needs: slow, one chord at a time, see the notes when stuck, hear the reference,
   twelve keys eventually. Needs the app to *teach* (show the voicing) as much as test.
2. **Learning tunes (intermediate).** Has voicings, wants to play *Stella* without stopping.
   Needs: the changes in front of them, in time, loopable sections, transposition, a bass player.
   Needs the app to get out of the way and act like a band.
3. **Chasing fluency (advanced).** Wants any voicing in any key at 200 bpm without thinking,
   wants to be told what they're weakest at. Needs: speed ladders, random everything, stats,
   hands-free, no hand-holding.

Onboarding asks one question ("Where are you?") and sets defaults; it never blocks.

## UX principles (these decide every screen)

1. **Eyes on the keys, not the screen.** The laptop/tablet sits on the music stand at arm's
   length. During a drill: one huge chord symbol, one huge beat indicator, nothing else. Optional
   spoken prompts (TTS) so you can look at your hands. Everything is navigable hands-free
   (auto-advance, voice commands, a MIDI pedal double-tap, or a spare MIDI key mapped to "next").
2. **Never stop the clock.** In timed modes a miss is recorded and the band plays on, exactly
   like a real gig. Blocking "wait until correct" exists but is a mode you choose, not the default
   in timed practice.
3. **Show the fix, not just the fail.** A wrong answer shows a keyboard diagram: green = correct
   notes you played, red = wrong notes you played, hollow = notes you missed, plus one line of
   diagnosis ("missing the 7th", "that's the A form, drill asked for B", "right notes, wrong
   inversion", "too low — muddy below C3").
4. **Hint ladder, not a reveal button.** Hints escalate: chord tones as pitch names → voicing
   formula (3-7-9-5) → notes on keyboard → play the reference. Each hint used is logged; the
   scheduler treats "needed a hint" as "not known yet".
5. **Presets over settings.** A drill is a saved object ("Rootless ii-V-I, cycle of 4ths, 120,
   4 beats/chord"). The app ships with ~15 named drills; you tweak and save your own. The settings
   panel is a drawer, never a page you land on.
6. **The app decides what's next.** Home = *Today*: a generated 20–40 minute session built from
   your weak spots, due reviews, and the tune you're learning. You can override, but the default
   path is "press Start".
7. **Time-boxed.** Every session block has a duration or a rep count. The app ends blocks; you
   don't drift.
8. **Progress is a picture.** A 12-key × voicing-family heatmap, per tune "% of changes played
   clean at tempo", and a streak. Nothing else on the stats page unless you dig.
9. **Latency-honest.** Audio scheduling, MIDI timestamps, and mic buffering are calibrated once
   (a tap test) and the grading window compensates. A trainer that calls you late when you weren't
   is worse than no trainer.
10. **Bring your own Real Book.** We never ship copyrighted lead sheets. We ship public-domain
    standards, import iReal Pro playlists, and read your scans on your device.

## Screens

There are six. Anything else is a drawer or a modal.

### 1. Today (home)
- One big **Start** button on a generated session (e.g. *"Warm-up: Maj7 drop-2, 12 keys ·
  Weak spots: Ebm7 rootless B, F#7alt · Review: 9 due · Tune: All The Things You Are @ 140 ·
  Free play: 5 min"*). Tap a block to swap it.
- Below: streak, minutes this week, the heatmap thumbnail, "Continue: <last tune>".
- Nothing else.

### 2. Drill (fullscreen practice)
This is the screen that matters. Layout in landscape:

```
┌────────────────────────────────────────────────────────────────┐
│ ● ● ● ○   120 bpm   Cycle of 4ths · Rootless A · 4/chord   ⏸ ⚙ │  ← thin status bar
│                                                                │
│               Dm7        →   G7    →   CΔ7                     │  ← prev / CURRENT / next
│                         (huge)                                 │
│                                                                │
│      ┌──────────────────────────────────────────────┐          │
│      │  keyboard diagram (shown on miss / hint)     │          │
│      └──────────────────────────────────────────────┘          │
│  ✓ 14   ✗ 2   ⏱ 210 ms avg                   [hint]  [skip]   │
└────────────────────────────────────────────────────────────────┘
```
- Beat indicator is a pulsing bar at the top edge (visible in peripheral vision), plus an
  optional click.
- Current chord is enormous; previous fades left; next is smaller on the right so you can
  prepare (toggle "look-ahead" off for advanced users).
- On correct: the symbol flashes green, no modal, no delay. On miss: red flash, keyboard diagram
  appears for the rest of the chord's window, band keeps playing.
- Portrait/phone: same, stacked; the keyboard diagram scrolls to the relevant octave.
- Esc / pedal-double-tap / "stop" pauses; a pause shows the block's stats and a **Resume** /
  **Slower** / **Faster** / **End block** row.

### 3. Tunes (library → tune → practice)
- Library: search, filters (key, tempo range, style, "learning / known / new"), sources (built-in,
  iReal import, my scans).
- Tune page: chord grid (iReal-style, 4 bars per line, sections labelled, repeats/coda resolved
  into a flat form you can also view), key/tempo/style, transpose, "guide-tone line" view (3rds
  & 7ths across the changes, as a line on a mini-staff — the single most useful learning view for
  changes), and if a scan exists the **page image with a bar cursor** that moves in time.
- Practice modes from the tune page: **Play the changes** (comp every chord in time with the
  rhythm section, voicing family chosen), **Loop section** (A / B / bars 9–16 / any range), **Chord
  quiz** (bars go blank, you play from memory), **With backing track** (YouTube or uploaded audio).

### 4. Session review (after a block or session)
- What you missed, grouped: "Ebm7 rootless B — 3 misses, avg 410 ms late". One-tap **Drill these**
  creates a targeted drill from the misses.
- Latency trend for the block, hints used, tempo reached.

### 5. Progress
- The heatmap (keys × voicing families, cell = accuracy at your current tempo tier).
- Tunes: bars showing clean-at-tempo %.
- History calendar. Export JSON.

### 6. Devices & settings (drawer)
- MIDI input selection + live "you're playing: Dm7 (rootless A)" readout (this readout is also
  the best onboarding moment — it proves the app hears you).
- Microphone: level meter, a 10-second calibration ("play a C major chord").
- Latency calibration: tap along to 8 clicks, we compute and store the offset.
- Audio: piano sample set, click sound, rhythm section volume mix.
- Voice: on/off, language, test.

## Interaction details that make or break it

- **Chord "settle" detection (MIDI).** A chord is finalized when no new note-on arrives for 70 ms
  after the first note-on of the attempt, *or* the beat window closes. Notes released < 150 ms
  before finalization still count (people roll chords and lift early). Sustain pedal held: use
  sounding notes, not pedal-sustained ones, by tracking note-on/off ourselves.
- **Grading window (timed mode).** Target beat *t*. Accept attempts in [t − 150 ms, t + 250 ms]
  after latency compensation, widened at slow tempos. Report *lateness* even on correct attempts;
  the stats page shows it. Early is fine. Advanced setting: tighten to ±80 ms.
- **Strictness ladder.** `exact` (these MIDI notes) → `octave-free` (these pitch classes, any
  octave) → `family` (any valid voicing of the requested family for this chord) → `chord-tones`
  (contains the essential tones, nothing outside the chord's available tones). Each drill sets a
  strictness; the mic input caps at `chord-tones`/`octave-free` because it can't reliably hear
  octaves.
- **Voice leading toggle.** On: the target is *the specific voice-led voicing* chosen by the
  engine from your previous chord (shown on request); off: any voicing in the family passes.
  A middle setting: any voicing in the family, but total hand movement > N semitones is flagged
  as "jumpy" (not a fail).
- **Look-ahead.** Show next chord: always / only on last beat / never.
- **Tempo ladder.** A drill can be set to "+4 bpm each clean pass, −6 on a miss"; the ladder is
  the fastest way to build speed and it's what advanced users will live in.
- **Hands-free navigation.** Voice commands (`next`, `again`, `slower`, `faster`, `stop`,
  `show me`); MIDI: sustain-pedal double-tap = pause/resume, the lowest key on the instrument
  (A0) = "next" when it's outside the drill's range; computer keyboard: space / arrows.
- **Reference playback.** Long-press the chord (or say "play it") to hear the target voicing on
  the sampled piano. In "echo" drills the app plays first, you copy.
- **Don't punish rolling.** Arpeggiated/rolled chords are the norm on piano; settle detection
  and the released-note grace handle this. Don't require simultaneity unless the drill says so.

## What "done" feels like

You open the app on the music stand, press Start, the band counts in, twelve ii-V-Is go by in
rootless B at 132, two of them flash red and show you the notes, the app says "nice — Ebm7 is
still sticky", then it puts *Stella* up with a bass player at 120 and highlights bars as you go,
then it plays the YouTube track you picked yesterday and shows the changes in time. Twenty-five
minutes. You didn't touch the screen. Tomorrow it's slightly different because you got better.
