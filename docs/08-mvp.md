# 08 — The MVP, defined

Everything in this repo is in service of one loop. This doc states the smallest version of that
loop that is genuinely useful, so the rest can be judged against it.

## The MVP is a three-rung ladder, drilled two ways

**The material — three voicing setups, in teaching order:**

| Rung | Setup | Family id | Why it's first |
|---|---|---|---|
| 1 | **LH root, RH 3-7** | `root37` | The smallest thing that sounds like jazz piano. The root anchors the key in the bass where it belongs; the right hand plays the two notes that decide what the chord is. |
| 2 | **LH 3-7 alone** | `guide` | Same shapes, no anchor. Now you have to hear the voice leading rather than see the root. |
| 3 | **Both rootless forms, A and B** | `rootlessA` + `rootlessB` | The real working left hand. Voice-led so the app chooses A or B by whichever moves less. |

**The two exercises, at every rung:**

1. **ii-V-I through all 12 keys, in time.** Cycle of fourths first, then random key order.
2. **Random chord and quality in all 12 keys, in time**, using that rung's voicing.

"In time" is the point of both — a click or the band, a fixed number of beats per chord, and a
tempo that ratchets up when you're clean. Free-time versions exist as the learning mode for a
rung you've never played, not as the destination.

That's the MVP: **3 rungs × 2 exercises, metronome, in-time grading, and a review screen that
tells you which rung and which keys to work on.** Nine-tenths of the practice value of the whole
app is in that grid.

## The learning loop: three stages per rung

Each rung is drilled in three stages. They differ only in **what ends a chord**, and that one
switch changes what is being trained.

| Stage | Clock | Chord ends when | What it trains | Move on when |
|---|---|---|---|---|
| 1. **Learn it** | none | you play it right | finding the shape at all | you can play all twelve, at any speed |
| 2. **Until you get it** | running | you play it right; it repeats meanwhile | the shape *without losing the pulse* | repeats per chord ≈ 0 |
| 3. **In time** | running | the bar ends, hit or miss | retrieval against a deadline | clean ≥ 90% at the target tempo |

### Why two clocked stages instead of one

Stage 3 alone is the trap. If you do not yet own the voicing, `onTime` gives you a wall of
misses: the chord is gone before you find it, so **you never once play the correct thing**.
Nothing is reinforced, and the session teaches you only that you are bad at it. Grading is not
learning — you cannot get better at a shape you never successfully execute.

Stage 2 fixes exactly that without giving up the clock. The click keeps running, the form keeps
moving, but the chord comes round again — two bars, three bars — until you find it. Every chord
ends with you having played the right notes in tempo at least once. The cost is recorded as
`repeats` rather than hidden, so "I got it, but it took three bars" is a number that goes down
over a week.

Stage 3 is then the real thing: a tune does not wait for you. Failure here is cheap and
informative rather than destructive, because by now you know the shapes.

### It pairs with the four outcomes

The two advance modes are the *training* counterpart of the diagnosis in `06-review-ux.md`, and
the review screen's verdict maps straight onto them:

- mostly **wrong / blank** → you are in stage 3 too early. Drop to stage 2.
- mostly **timing** (right notes, late) → you know the shapes; stay in stage 3, drop the tempo.
- mostly **clean** → raise the tempo, or move up a rung.

That is the whole loop: the grader tells you which stage you should be in, and the stage tells
you which mode ends the chord.

### The known flaw, stated

Repeating a single chord breaks the phrase. A ii-V-I is learned as a *unit* — the voice leading
between the three chords is the actual content — and if the ii repeats three times before you
get it, you never hear the ii-V-I. For progression drills, stage 2 should arguably repeat the
**phrase** rather than the chord: fail anywhere in the ii-V-I, and the whole ii-V-I comes round
again. The runner currently repeats the chord (`repeatCurrent`), which is right for random-chord
drills and wrong for progressions. Fixing this means giving `advance: 'onCorrect'` a scope —
chord or phrase — defaulting to phrase whenever the generator produces roman numerals.

Stage 2 is also capped (`maxRepeats`, default 8) so one chord cannot eat a whole session; after
the cap it records the failure and moves on.

## Definition of done

- A preset exists for each of the six cells, named after the rung, not the mechanism.
- Today picks the right cell: the lowest rung that isn't ≥90% clean, in the weakest keys.
- Grading distinguishes *right notes late* from *wrong notes* (see `06-review-ux.md`) — without
  that, "if effective with that setup in time" isn't measurable.
- One tempo control, reachable without leaving the drill, with a typed value, a slider, and ±1.
- Hints can be shown on the keyboard, not only as text.
- A run ends on a review screen that names the next action.

## What is explicitly *not* in the MVP

Tunes, backing tracks, scan import, speech, stems, progress heatmaps beyond key × quality. All
built, all fine, none of it on the critical path to "I can play rootless ii-V-Is in twelve keys
at 120". Docs `06` and `07` cover where those go next.

## Resolved: which hand plays what

This was built the other way round first — right hand on the root, left hand on the guide tones —
from a literal reading of a one-line brief, and flagged here as an assumption at the time. It was
wrong. **The root goes in the left hand and the guide tones in the right**, which is how every
method teaches the first two-hand setup: the bass register is where a root belongs, and the third
and seventh are the notes that decide what the chord actually is, so they are what the working
hand should be learning to move.

Corrected 2026-09-22 in `packages/theory/src/voicings.ts` (`root37` templates are now `1 | 3 7`,
left box in the bass register) with the golden tests updated to match.
