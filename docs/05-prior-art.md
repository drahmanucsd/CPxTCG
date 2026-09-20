# 05 — Prior art

There are several browser chord-voicing trainers (the search turned up *Chord Trainer* by
telaaron, *jazzchords.app*, *chordpianotrainer.vercel.app*, *practice-jazz-chords.com*,
*twelvekeysmastery*, and a few GitHub projects). The most complete of them — and the one whose
feature set matches the brief — has:

- 16 chord types (Maj7, 7, m7, m7b5, dim7, 6, m6, 9, m9, Maj9, 6/9, Maj7#11, 7#9, 7b9, m11, 13)
- 9 voicing types (root position, shell, rootless A & B, inversions)
- Progression modes: random, ii-V-I through 12 keys, cycle of 4ths, I-vi-ii-V turnaround, custom
- Real-time MIDI validation with automatic chord recognition
- Per-chord timing and "weakness analysis", practice plans
- Audio playback of the target, built-in metronome 40–240 bpm
- Free, no signup, Chrome/Edge

That's a good core loop and the reason the brief says "they didn't do a bad job". Where it
stops, and where Shed goes further:

| Area | Existing trainers | Shed |
|---|---|---|
| Voicing families | ~9, LH-centric | Every family incl. drop 2/3/2+4 from any inversion, quartal, upper structures, block chords, two-hand spread, clusters, altered forms |
| Voice leading | Not enforced / not modelled | Deterministic engine; toggle strict / lenient / off; shown as a hint |
| Strictness | Pitch-class match | Four-level ladder incl. "any voicing in the family" and diagnosis of *what* was wrong |
| Progressions | Fixed list + custom | Same + cycles of any quality, turnaround library, blues forms, Coltrane, minor ii-V-i, roman-numeral input, from-tune |
| Pacing | Metronome | Metronome + synthesized rhythm section (bass/drums in styles) + YouTube/uploaded backing tracks with tap-sync + speed ladder |
| Tunes | None or a few pre-loaded | PD library, iReal import, MusicXML, scanned pages with a moving bar cursor, section loops, guide-tone view |
| Input | MIDI (+ mouse) | MIDI, microphone (polyphonic), voice (say the chord), spoken prompts |
| Memory | Per-session weakness | Persistent attempts, heatmap, spaced repetition, generated daily plan |
| UX | Config-heavy, screen-facing | Two taps to start, hands-free, eyes-on-keys, time-boxed sessions |

The pattern to copy from them: show one chord, listen on MIDI, flash a verdict, keep it fast, no
signup. The pattern to avoid: a settings wall on the front page and a session that ends when
you look away.
