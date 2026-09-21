# 06 — The review screen: what a player actually needs to see

> Written because the first version of this screen was four raw numbers and a list of misses.
> That tells you *that* you failed without telling you *what to change*, which is the only
> reason to look at a practice summary at all.

## The one job

A practice block ends. The player has 5 seconds of attention before they either start the next
block or close the tab. In those 5 seconds the screen has to answer, in this order:

1. **Was that good?** — one verdict, not four numbers to average in your head.
2. **What kind of wrong was it?** — because each kind has a different fix.
3. **Where was it hard?** — the pattern (which keys, which qualities, which spot in the phrase), not a list.
4. **Am I better than last time?** — the only thing that keeps someone coming back.
5. **What do I do right now?** — one button, already decided.

Everything else is optional depth, reachable by clicking, and must not compete with those five.

## Why the current screen fails

| What it shows | Why it doesn't help |
|---|---|
| Accuracy 92% | 92% of *what*? A clean run at a crawl and a scrappy run at tempo both land near 90%. |
| Chords 11/12 | Same information as accuracy, taking up a second tile. |
| Avg lateness +48 ms | An average hides the shape. `+48` could be 12 hits at +48 (a latency offset — fix in Settings, not in the practice room) or 6 at −150 and 6 at +250 (a real timing problem). Opposite diagnoses, same number. |
| Final tempo 120 | Only meaningful next to the tempo you *started* at, and next to last session's. |
| "What you missed" | Groups by chord, so a key that's weak in three different qualities reads as three unrelated problems. |
| Every chord (chips) | Binary green/red. A chord played with the right notes 200 ms late is solid green — the single most important thing to surface, hidden. |

The deepest flaw: **`ok` is a boolean.** The engine grades notes and, separately, records lateness,
then throws the lateness away when deciding pass/fail. So the two most instructive outcomes —
"you knew it but couldn't place it" and "you got there but only with a hint" — are invisible.

## The model: four outcomes, not two

Every target resolves to exactly one of these. This is the spine of the whole screen.

| Outcome | Meaning | The fix it implies |
|---|---|---|
| **Clean** | Right notes, inside the timing window, no hint. | Push the tempo. |
| **Late / Early** | Right notes, outside the timing window. | The voicing is learned; the *placement* isn't. Drop the tempo, keep the material. |
| **Wrong notes** | Played something, it wasn't the chord. | You don't own this voicing yet. Slow drill, free time, look at it. |
| **Blank** | Nothing playable arrived in the window. | Tempo is above your recall speed, or you froze. Drop the tempo hard. |

With a fifth qualifier that rides on top of Clean: **assisted** — correct, but a hint was open.
Counted as clean for the run, flagged separately, because "I needed to see it" is not "I know it".

Three deliberate consequences:

- A right-notes-late chord is **not** a pass. The user asked for exactly this, and it's right:
  in time is the skill. It gets its own colour, its own tile, and its own coaching line.
- "Wrong notes" and "blank" are separated because they mean opposite things. Wrong notes means
  you tried and mis-remembered; blank means you never got there. Merging them into "miss" was
  the reason the old screen couldn't tell you whether to slow down or to go look at the voicing.
- The four outcomes sum to the total. No "accuracy" number that needs interpretation.

## Timing deserves a distribution, not a mean

Two numbers, both shown, because they mean different things:

- **Offset (median)** — are you consistently ahead of or behind the beat? A large median with a
  *tight* spread is almost always equipment, not playing: MIDI/audio latency. The screen should
  say so and offer to write it into `latencyOffsetMs` instead of letting the player "practise"
  away a constant.
- **Spread (IQR or σ)** — how consistent you are. This is the actual timing skill, and it's the
  number that should go down over weeks.

Show them over a **strip plot**: one dot per attempt on a −300…+300 ms axis, the tolerance band
shaded, the median marked. A player reads their own shape instantly — cluster, two-humped,
drifting late as the chords get harder. Colour the dots by outcome so "all my wrong notes were
also late" jumps out.

## Where it was hard: three breakdowns, all compact

Not a list of individual chords — a pattern. Each is a row of cells with accuracy and count,
cold cells highlighted, and each cell is a filter for the chord-by-chord strip below.

1. **By key** — 12 cells in circle-of-fourths order (the order they were drilled in). The single
   most common real finding: flat keys are 40% and everything else is 95%.
2. **By chord quality / voicing form** — `m7b5`, `7alt`, Rootless A vs B. Tells you whether it's
   a *shape* problem rather than a *key* problem.
3. **By position in the phrase** — for progression drills only (ii-V-I, turnarounds, blues): is
   it the ii, the V, or the I that breaks? Voice-leading failures live here and nowhere else.
   A player who is 100% on ii and V and 60% on I has a specific, fixable problem.

## Progress: the comparison is the point

A number with no baseline is decoration. Every headline stat carries a delta against **the
previous sessions of the same drill**:

- accuracy and clean-rate, last 10 sessions, as a sparkline;
- best tempo at which this drill has gone ≥90% clean — the real "personal best" for a practice app;
- timing spread over the same window.

If there's no history yet, say "first run — this is your baseline" rather than showing a 0 delta.

## The verdict line and the next action are computed, not offered

The screen states a verdict in one sentence and gives **one** primary button. The rules are
deterministic so the advice is consistent and explainable:

```
blank > 20%                        → "Too fast to recall. Again at {bpm − 12}."
late/early dominant, wrong < 10%   → "You know these; it's placement. Again at {bpm − 8}."
wrong notes concentrated in ≤5     → "Five shapes are the problem. Drill those, free time."
clean ≥ 95% and spread tight       → "Clean and steady. Push to {bpm + 8}."
clean ≥ 95% and spread wide        → "Right notes, loose time. Same tempo, watch the click."
assisted > 25%                     → "Mostly hints. Same drill, hints off, slower."
otherwise                          → "Again, same tempo."
```

Secondary actions stay small and to the side: *Next block* (if a plan is running), *Again*,
*Drill the misses*, *Replay what I played*, *Done*. The old screen gave five equal-weight
buttons and therefore gave no advice at all.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Rootless ii-V-I · cycle of 4ths          120 bpm · 3m 12s    │
│ ██ You know these; it's placement. Again at 112.   [Again →] │  ← verdict + primary
├──────────────────────────────────────────────────────────────┤
│  CLEAN 18   LATE/EARLY 9   WRONG 4   BLANK 1                 │  ← the four outcomes,
│  58% (+6)   29%            13%       3%                      │    clickable filters
│  2 assisted                                                  │
├──────────────────────────────────────────────────────────────┤
│ TIMING   median +31 ms · spread 84 ms                        │
│ -300 ────────────────·:·█▓·:·──────────────── +300           │  ← strip plot, banded
│ ⓘ A steady +31 ms looks like input latency. Calibrate →      │
├──────────────────────────────────────────────────────────────┤
│ BY KEY      C  F  Bb Eb Ab Db Gb B  E  A  D  G               │
│             ██ ██ ██ ▓▓ ░░ ░░ ▒▒ ██ ██ ██ ██ ██              │
│ BY QUALITY  maj7 ██  m7 ██  7 ▓▓  m7b5 ░░  7alt ░░           │
│ IN PHRASE   ii ██   V ▓▓   I ░░                              │
├──────────────────────────────────────────────────────────────┤
│ THE RUN  Dm7 G7 C△ | Gm7 C7 F△ | …    (colour = outcome)     │
│          click any chord → keyboard diff, played vs target,  │
│          its timing offset, play the voicing                 │
├──────────────────────────────────────────────────────────────┤
│ LAST 10 RUNS  clean% ▁▂▃▃▅▄▆▆▇█   best clean tempo: 126      │
└──────────────────────────────────────────────────────────────┘
```

Mobile: same order, single column. The verdict + four tiles fit above the fold; everything
below is scroll.

## What this requires from the engine

The screen can only be as good as the data. Required changes, all additive:

- `Pacing.timingWindowMs` — the tolerance that defines on-time (default ±120 ms, and a chord
  can't be "on time" beyond a fraction of its own length).
- `TargetResult.timing: 'early' | 'onTime' | 'late' | null` and
  `TargetResult.outcome: 'clean' | 'timing' | 'wrong' | 'blank'` — computed in the runner, where
  the beat grid lives, not in the UI.
- `TargetResult.assisted: boolean` (hint open when the correct attempt landed).
- `DrillSummary` gains `outcomes` counts, `timing: { median, spread, onTime }`, and `startBpm`
  alongside `finalBpm`.
- Attempt rows in IndexedDB carry `outcome` and `latenessMs` so the heatmaps and the Today plan
  can weight "late" differently from "wrong" — a chord you know but can't place needs tempo work,
  not another look at the shape.

## Non-goals

- No letter grades or scores out of 100. Accuracy at a stated tempo is already the honest metric.
- No streak/XP theatre on this screen. The streak belongs on Today; here it would compete with
  the diagnosis.
- No storing audio. MIDI replay is enough and costs almost nothing.
