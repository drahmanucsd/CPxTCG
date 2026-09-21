# 07 — Backing tracks and repertoire: rethinking the workflow

> Two connected problems. (1) Playing a tune with a track currently starts with a chore —
> pick one of eight YouTube search results, tap the tempo, tap beat 1. (2) The library is 20
> public-domain standards, and the repertoire a player actually works from is the Real Book.

---

## Part 1 — Backing tracks

### The goal, stated properly

The player wants to **play the changes in time with a band**. That's it. Every second spent
choosing a video, tapping a tempo, or hunting for beat 1 is a second not spent playing, and
worse, it's a *decision* — the thing this app is supposed to remove.

Test for any design here: **how many taps between "I want to play Body and Soul" and hearing
bar 1?** Today it's roughly seven, two of which require judgement the player can't make well
(is this video any good? was that beat 1?). The target is **one**.

### What's wrong with the current flow

- **It asks a question the user can't answer.** Eight thumbnails, no tempo, no key, no idea
  which is a decent rhythm section and which is a solo guitar loop. The player picks blind,
  discovers the problem 20 seconds in, goes back.
- **Tap-tempo is a calibration ritual.** Three taps for tempo, one on beat 1, per new track.
  It's also the single most error-prone step: one tap off and the whole session is a bar behind.
- **YouTube is not a dependable dependency.** Region blocks, takedowns, mid-video ads that
  desync everything, and a 10,000-unit/day API quota. Fine as an option, wrong as the path.
- **The good option is buried.** The synthesized rhythm section already exists (bass + drums,
  eight styles), follows the chart *exactly*, can't drift, needs no network, no key, no sync,
  and its tempo is a number rather than a property of a recording. It should be the default.

### The design

**1. The band is the default.** Every tune page's primary action is **Play with the band** —
one tap to bar 1. Tempo comes from the chart's `tempo:` field, adjustable with the same tempo
control used everywhere else. No sync step exists, because there's nothing to sync to.

**2. "Play with a record" is a one-tap upgrade, not a search.** The app chooses, and says what
it chose:

- **Curated catalog first** (`data/backing-catalog.json`): tune → videoId + bpm + beat-1 offset,
  verified. When a tune is in the catalog, "Play with a record" is genuinely one tap and
  sample-accurate.
- **Otherwise the app picks the top candidate itself**, scored rather than shown: title contains
  the tune name, title or channel says *backing track* / *play along* / *rhythm changes*,
  duration between 2 and 12 minutes, tempo parsable from the title, channel on a known-good list.
  It starts playing. A small "not this one →" cycles to the next candidate. The grid of eight
  results only appears if the player asks for it.

**3. Sync without a ritual.** Detect tempo and the downbeat from the audio instead of asking:

- pull the first ~30 s, build an onset envelope (spectral flux over a 512-hop STFT),
  autocorrelate for the beat period, pick the phase that maximises onset energy on the grid;
- disambiguate half/double time using the tune's `tempo:` field as a prior;
- for the downbeat, score candidate phases by low-frequency (kick/bass) energy, which lands on 1
  far more often than not.
- then **confirm by ear, not by asking**: the click plays over the track for four bars while the
  chart cursor moves. The player either starts playing (accepted) or taps one of two fixes —
  *off by a beat* (rotate phase) or *half / double* (×2, ÷2). That's a maximum of one tap to
  correct, versus four taps to specify.
- Tap-tempo stays as the fallback when detection confidence is low, and as the manual override.
  It is no longer the primary path.

**4. Anchor once, forever.** A confirmed anchor is written to the same shape as the curated
catalog, keyed by tune + videoId. Second time is instant. Anchors are exportable, so one
player's verification pass can ship as curated data for everyone.

**5. Drift is visible and correctable mid-flight.** A thin drift meter next to the chart; `[`/`]`
nudge ±50 ms; space re-anchors on the current chord. Already built — it just needs to stop being
the first thing you see.

### Consequence for the code

`BackingTracks.tsx` stops being a search-results grid and becomes a *decision*: catalog → auto-pick
→ (rarely) a picker. The YouTube search endpoint stays, but it feeds the scorer, not the UI.

---

## Part 2 — "Every tune from the Real Book"

### The constraint, plainly

The Real Book is a copyrighted compilation of copyrighted compositions. For tunes published
after 1929, the chord progression as printed — and certainly a specific edition's
transcription — is protected expression. Shipping ~400 Real Book charts inside this repo would
make it a distribution of infringing material, and the repo is **public**. I'm not going to
commit that, and you don't want it on your GitHub account either.

That does not mean you can't practise from your Real Book in this app. It means **the charts
come from you, not from us.** The app's job is to make that import so cheap it feels like it
shipped with the charts.

### What we ship (all legitimate)

1. **A repertoire index — the whole standard repertoire, ~1,300 tunes.** Per tune: title,
   composer, year, usual key, form (AABA / ABAC / 12-bar blues / 32-bar), bar count, typical
   tempo range, style, and the aliases people search by. These are *facts about works*, not
   expression — the same information a fake-book index or a jam-session list carries. This alone
   unlocks a lot: search any tune by name, see it in the library, get it into the Today plan,
   track progress against it, and know what key and form to expect.

2. **The public-domain charts, expanded.** Everything published ≤1929 can ship with real changes.
   Currently 20; there are a few hundred legitimately available (early Gershwin, Kern, Waller,
   Handy, the traditional blues and rhythm-changes skeletons). This is the free tier of content
   and it covers a real chunk of a jam session.

3. **Form skeletons for the rest.** For an indexed tune with no changes yet, we can still ship
   the *structure* — 32 bars, AABA, key of Eb — so the player can practise the form, the count,
   and their own changes against a click or the band before importing anything.

### Import, made one action

Every path already half-exists; the work is making them bulk and obvious.

| Source | Now | Target |
|---|---|---|
| iReal Pro link | one tune per paste | paste a whole forum playlist → hundreds of tunes in one go, deduped against the index |
| iReal Pro export HTML | supported | drag the file onto the library |
| Scanned page (your own book) | one page → OCR → editable chart | batch: drop 20 photos, get 20 charts queued for a quick eyeball |
| Chart text | supported | keep — it's the fastest way to fix one bar |

The iReal Pro route is the realistic answer to "every tune from the Real Book": the standard
playlists exist, the player imports them once, and from then on the app has their whole book —
stored in *their* browser, never in this repo.

### The library UI that follows

One list, three states per tune, visibly different:

- **Ready** — has changes (public domain, or imported by you). Play it.
- **Indexed** — title/key/form known, no changes. Shows *Import changes* (iReal / scan / type)
  and still offers form-only practice.
- **Yours** — imported or scanned, editable, exportable.

Search covers all three, so a tune name always finds something. Progress, weak spots and the
Today plan key off the index's tune id, so they survive an import: practise the form today,
import the changes tomorrow, and the history stays attached.

### Non-goals

- No scraping chart sites, no bundling "found" iReal playlists in the repo, no OCR-as-a-service
  of copyrighted pages on a server. All import is local and user-initiated.
- No melody. Chord changes and form are what this app trains.
