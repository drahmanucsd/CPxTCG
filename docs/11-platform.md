# 11 — Platform structure and UX critique

> Context: the app was built without the author being able to judge whether the learning system
> is sound, because they are still learning the material it teaches. This doc is the critique of
> the current build and the structure proposed to replace it.
>
> Stated goal: **not** to teach the voicings — a teacher/book does that — but to make learning a
> new voicing fast, and learning a standard fast and properly.

---

## Verdict on the core

The core model is right: voicings learned as ii-V-I movements, automated under a click, then
applied to tunes. The engine already does most of it. What is missing is the **staging around
it**.

Three concrete failures:

1. The learner has to assemble the path themselves out of 30 presets and a custom editor. A
   person who does not yet know the material cannot pick `strictness: shape`, `beatsPerChord: 4`,
   `bpm: 80`, `advance: onTime`.
2. Nothing carries a voicing from Drills into Tunes. They are effectively two apps.
3. **Half the tune-learning method is impossible.** Verified in `packages/theory/src/matcher.ts`:
   `evaluate()` compares played notes to the target as a whole set — `exact`, `shape` and `family`
   all require equal lengths, `octaveFree` requires equal pitch-class counts, and `chordTones`
   rejects any pitch class outside the chord's allowed set. So playing a melody note in the right
   hand over a left-hand voicing **fails the chord**. Melody-plus-voicing is the standard way
   tunes are learned at the piano, and the grader cannot express it.

---

## Loop 1 — learn a voicing family

One object ("a course"), staged. The app picks the settings; the learner picks the family.

| Stage | What happens | Why |
|---|---|---|
| 1. **Show** | Formula, degree labels on the keys, hear it — inside a ii-V-I in one key | Never isolated chords: A/B alternation *is* the thing being learned |
| 2. **Copy** | Untimed, target shown on the keyboard, **"what moved" highlighted** between chords | Usually one note by a half step. Fastest way to internalise voice leading, and cheap to build |
| 3. **Find** | Target hidden; hints fade automatically as accuracy rises | Not a user setting |
| 4. **Clock that waits** | Pulse on, chord window stretches until you play. App measures your real inter-onset tempo and reports it | This is the honest version of "self-adjusting metronome" |
| 5. **Fixed clock** | At the measured tempo, ladder up. Tempo changes **between passes only** | A click that follows you mid-bar teaches nothing about time — the value of a click is that it does not move |
| 6. **Apply** | Comp one tune with this family | The gate out of the course |

**Scope control**: a subset of keys first (F, B♭, E♭, C, G, A♭), then twelve. Only the qualities a
ii-V-I uses — min7, dom7, maj7, plus halfdim and alt for minor. Family × 17 qualities × 12 keys is
combinatorics, not learning.

**Mastery gate**: clean at target tempo in N keys → next stage. Progress reads as *keys mastered
out of 12, per family*.

## Loop 2 — learn a standard

| Stage | What happens |
|---|---|
| 1. **Listen** | Band plays it with model voicings before you touch the keys |
| 2. **Analysis overlay** | Section blocks (AABA/ABAC), key centre per section, ii-V-I brackets, roman numerals relative to the local key, "bars 9–16 = bars 1–8 except the turnaround" |
| 3. **Chunk** | One 8-bar section looped with the band; chain sections |
| 4. **Layers** | roots + melody → shells + melody → rootless + melody → comp only |
| 5. **Fade the chart** | full chart → roman numerals → form boxes → blank. Memorisation as a hint ladder |
| 6. **Transpose** | Play it in a second key. If you cannot, you have not learned it |
| 7. **Repertoire** | Tune-level spaced repetition: learning / know it / rusty, "last played", Today pulls one rusty tune a day |

The **analysis overlay is the highest-leverage feature on this list**. Detection is mostly
pattern-matching the engine can already do, and it is what makes tunes fast — you notice you
already know 80% of a new tune. Stage 4 is blocked on hand-split grading.

---

## The four proposals, judged

| Proposal | Verdict |
|---|---|
| Learning mode (untimed) | **Yes** — but it already exists as free mode + `onCorrect` + hints. The change is making it stages 1–3 of every course instead of a preset, in ii-V-I context, with the moved-note highlight |
| Self-adjusting metronome | **Yes** as *measure-then-set* and between-pass adjustment (stages 4–5). **No** as within-pass tempo following |
| Backing tracks for standards | The **synth band is the learning tool** — locked to the grid, loops a section, changes tempo, can drop the bass out. YouTube is the performance stage; keep it deferred |
| Form/shape display | **Yes.** The best thing on the list |

---

## UX critiques of the current build, ranked

1. **Configuration is exposed to a learner who cannot set it.** bpm, beats per chord, strictness,
   timing window, 30 presets, a full editor. Replace presets with courses; the editor becomes an
   advanced tab.
2. **Hints are user-toggled.** They should fade with performance. In learn mode the target shows
   *before* the attempt; in drill mode the diff shows *after*. Never both at once.
3. **Drills and Tunes are two apps.** Every voicing course should end in "apply to a tune"; every
   tune should ask "which family".
4. **No hand split, so no melody-plus-voicing practice.** One setting unlocks half the method.
5. **Calibration is a screen you have to find.** It must be first-run: every timing verdict is
   meaningless until it is done, and "late" cannot be trusted before it.
6. **Navigation.** Devices and Scan are top-level; the Drills library is visible; Today competes
   for attention. Daily use should be one tap from launch.
7. **Review leads with analytics.** Verdict and one action first; timing strip, key breakdown and
   per-chord diff behind a fold.
8. **Progress leads with a heatmap.** Learner-facing progress is "8/12 keys mastered in rootless
   A/B" and "6 tunes known, 2 due". Keep the heatmap as a second view.
9. **The tune view has no listen step, no section loop, no analysis.** The rhythm section exists;
   the practice view does not use it for learning.
10. **Voice commands** are Chrome-only and the sustain-pedal double-tap already covers hands-free.
    Cut.

---

## Platform shape

Five surfaces. The daily path never leaves Home.

| Surface | Contents |
|---|---|
| **Home** | Today: one button, three blocks |
| **Voicings** | Courses in ladder order; keys-mastered per family |
| **Tunes** | Repertoire with status. Per tune: listen → analysis → chunks → layers → fade → transpose |
| **Review** | After every session |
| **Settings** | Devices, calibration, sound |

## Build order — status

| # | Item | State |
|---|---|---|
| 1 | Hand split + moved-note highlight | **Built.** `hands: { grade: 'below' }`, split derived per chord from the target; `Target.moved`/`held` lit on the keyboard |
| 2 | Voicing courses, auto-fading hints, mastery gates | **Built.** `packages/engine/src/courses.ts`, 10 courses × 6 stages; `autoHint: 2 \| 'adaptive'`; keys-mastered derived from attempts |
| 3 | Analysis overlay + section loop | **Built.** `packages/theory/src/analysis.ts` + the Shape tab; section click sets the practice range |
| 4 | Chart fading + repertoire status | **Built.** `reveal: chart → roman → sections → blank`; tune status derived from sessions, rusty after 21 days |

Also done from the critique list: five-surface nav, Today rebuilt around the current course stage,
review analytics behind a fold, progress led by keys-mastered and repertoire, first-run calibration
warning before any timed drill, voice input cut.

Not done: transposing a tune as a graded exercise (the transpose control exists, but nothing tracks
"can you play it in a second key"), and the backing-track rework in `07-backing-and-repertoire-ux.md`.

## Open question for a teacher

Take the three rungs in `08-mvp.md` (RH root + LH 3-7 → LH guide tones → rootless A/B) to a
lesson and ask whether that order is right. It is a two-minute question for someone who teaches
this, and it is currently an assumption with nothing behind it (`10-spec.md` §14).
