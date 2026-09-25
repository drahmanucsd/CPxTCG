# 13 — Playing the head in time

## The question this answers

A metronome tells you *that* you were off. It never tells you the thing you need:

| what you hear | what it could be | what to do about it |
| --- | --- | --- |
| "I'm not with the click" | you sit 40 ms behind every note | nothing — that is a lay-back, and it is a good sound |
| "I'm not with the click" | you are ±70 ms at random | this is the actual problem, and the only one |
| "I'm not with the click" | you started at 140 and finished at 152 | you rush; practise the last eight bars |
| "my swing sounds stiff" | your eighths are at 1.3:1 at a tempo that wants 2:1 | play the off-beats later, deliberately |

All four average to "off the click". Three of them are not faults. Only one is worth practice
time. Separating them is the entire purpose of this feature, and it is the thing a metronome, a
backing track and a teacher-once-a-week all fail to give you.

## What ships, and what does not

**No melody ships with the app.** A chord chart is a functional skeleton that every fake book
writes differently; a melody is the composition itself. Tune Up, Misty and Autumn Leaves are in
the built-in library as *changes only* for exactly that reason (see `CLAUDE.md`).

This turns out not to matter, because the measurement does not need the melody:

- **Without a written head** — the click runs over the form, you play the tune from the book on
  your stand, and every note is placed on the nearest subdivision of the grid. This is the normal
  case and it works for any tune ever written.
- **With a written head** — your notes are matched to it by pitch, and timing is measured against
  where each note is *written*. Stricter and more useful: it can see a note held too long, which a
  bare grid cannot, because a bare grid happily snaps a late note onto the next subdivision and
  calls it early.

A head gets into the app one way: **you play it and save the take.** `MelodyRun.take()` quantises
the performance into a `Melody`, and one button on the report saves it. This is a better exercise
than typing notation anyway — you have to know the tune to play it.

## What gets measured

`packages/theory/src/timing.ts`, pure functions, `analyzeTiming()` and `analyzeMelodyTiming()`.

1. **Steadiness** — the interquartile range of your offsets. *The* grade; everything else is
   description. Tight ≤ 20 ms, good ≤ 35, loose ≤ 55, unsteady beyond.
2. **Placement** — the median offset. Reported as ahead / on top / behind and never marked wrong.
3. **Swing** — where your off-beat eighths actually landed, as the ratio players talk about,
   against what the tempo calls for (`swingRatio()` — roughly 3:1 at 80, 2:1 at 140, 1.3:1 at 220).
   Measured from raw positions inside the beat, *not* from the snapped grid, so the answer does
   not just echo back whether you ticked "swing".
4. **Drift** — least-squares slope of offset against beat, reported as the tempo you were really
   playing. "You were at 149 against a click at 140."
5. **Where in the bar** — mean offset per position. One spot leaning on its own is a habit (the
   classic is rushing the "4&" into the next bar); the whole bar leaning is a lay-back.

### Two honest limitations, stated in the UI

- A large, *very* steady late offset is indistinguishable from input latency. The report says so
  and points at calibration rather than guessing. Consistently *early* is never latency.
- Notes that land more than a beat from where they are written are reported as `displaced` and
  dropped from the statistics — at that distance a pitch match is more likely coincidence.

## Click placement

`Transport.clickBeats` — which beats of the bar sound, 0-based; `null` is all of them. The
count-in always sounds every beat, or there is no way to find one.

- **every beat** — what a metronome does by default, and the least useful setting.
- **2 and 4** — the default here. The downbeat stops being handed to you.
- **beat 1** / **beat 2 only** — one click a bar. At that point the click checks your time
  instead of supplying it.

This lives on `MetronomePanel`, so drills get it too (`Pacing.clickBeats`), not only this screen.

## Where it lives

| piece | file |
| --- | --- |
| analysis | `packages/theory/src/timing.ts` |
| pitch alignment | `alignMelody()` in `packages/theory/src/melody.ts` |
| the run | `packages/engine/src/melodyRun.ts` |
| click placement | `packages/engine/src/transport.ts` |
| screen | `apps/web/src/screens/Melody.tsx` (`/melody/:songId?`) |
| report | `apps/web/src/components/TimingReportView.tsx` |
| storage | `db.melodies` (one saved head per tune), `db.takes` (every run) |

Reached from tune stage 2 (*Melody*), from **Time the head** on any tune at any stage, and from
`/melody` with no tune at all — a bare click with analysis, which is all you need if the book is
already on the stand.

## Call and response: drilling the push

Measuring a take tells you what happened. It does not teach a placement, and the placement that
needs teaching is **the push**: the note that belongs to the next bar, played an eighth early on
the "and of 4". Playing it on the downbeat instead is what makes a head sound stiff, and it is
invisible to everything else in this app — it is not a wrong note, and calling it "+180 ms late"
would send you off to practise the wrong thing. It is a *different rhythm*.

So `/rhythm/:songId?` does what a teacher does. The app plays one or two bars, you play them
back, and it names what you did. You are finished when you get it right N times in a row, because
once is luck.

- **`packages/theory/src/figures.ts`** — the vocabulary, as data. Hits are `{ beat, slot }`, not
  beat fractions: slot 1 means "the off-beat eighth", which sits at the swing ratio for the
  tempo. Storing `3.5` would silently mean *straight* and would be wrong at every tempo a jazz
  drill runs at. A nine-rung ladder ships, from four quarter notes to a mixed two-bar phrase.
- **`pushIndices()`** — an off-beat on the last beat of a bar *with the following downbeat
  silent*. That last condition is what makes it an anticipation rather than an ordinary off-beat.
- **`gradeFigure()`** — matches twice. The first pass estimates the constant offset; the second
  matches with it removed. Then *placement* (did you flatten it?) is judged on the corrected
  positions and *accuracy* (were you on it?) on the raw ones. Without that split, a player 180 ms
  behind on everything gets told they flattened a push they played correctly — or, worse, the
  note drifts far enough that it is not matched at all and reads as "missed".
- **`figuresFromMelody()`** — cuts a head you recorded into two-bar phrases and marks the ones
  containing a push, so "drill the bars of this tune that I keep flattening" is one click from
  having played the head once.

The feedback is a picture, not a number: rings where the figure goes, dots where you put them.
A flattened push is then unmistakable — the ring is on the "and" of 4 and the dot is over the bar
line.

## Fake books

`Scan` opens a whole PDF and renders pages on demand, so a four-hundred-page book is usable
rather than just its first four pages.

The chord reader handles printed and typeset charts. It **cannot** read hand-lettered ones — the
Real Book included; Tesseract returns noise on that calligraphy, which was measured rather than
assumed. For those, skip the read, type the changes, and save: the page image is kept either way
and becomes the practice view with the bar cursor running over it.

Nothing imported this way is ever committed. It lives in the browser's IndexedDB on the device
that imported it.

## Open

- **Anticipations against a written head.** A head that pushes the downbeat is written that way
  and played that way; against a bare grid it reads correctly as a note on the "4&", but against
  a *written* head that lacks the push it reads as early. `gradeFigure` handles this properly for
  short phrases; `analyzeMelodyTiming` does not yet.
- **Per-phrase rather than per-bar.** Rushing usually starts at a phrase end, not a bar line.
  `worstBars` is a blunt version of the right idea.
- **Audio input.** Everything here is MIDI onsets. Onset detection from a microphone is a
  different problem and would need the beat-detection research in `docs/09-landscape.md` §4.
