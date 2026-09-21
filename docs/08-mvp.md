# 08 — The MVP, defined

Everything in this repo is in service of one loop. This doc states the smallest version of that
loop that is genuinely useful, so the rest can be judged against it.

## The MVP is a three-rung ladder, drilled two ways

**The material — three voicing setups, in teaching order:**

| Rung | Setup | Family id | Why it's first |
|---|---|---|---|
| 1 | **RH root, LH 3-7** | `root37` | The smallest thing that sounds like jazz piano. The left hand learns the guide tones; the right hand only has to find the root, so there's spare attention for the clock. |
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

## Interpretation note

The rung names come from a one-line description: *"right hand root lh 37, both A/B, 2-5-1 all 12
keys in time, and random chord + quality in all 12 with that voicing."* I've read "RH root, LH
3-7" literally — right hand plays the root as a single note, left hand plays the 3rd and 7th —
which is a standard first two-hand setup and makes rung 1 strictly easier than rung 2. If you
meant left-hand root under a right-hand 3-7, it's a one-line change to the family template
(`1 | 3 7` instead of `3 7 | 1`) and both can ship as separate rungs.
