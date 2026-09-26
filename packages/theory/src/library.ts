/**
 * Built-in library: the common jam-session changes for standards, not transcriptions of any
 * particular edition — edit to taste, or import your own iReal charts.
 *
 * What is and is not in here, deliberately:
 *   - Chord symbols only. A chord progression is a functional skeleton that every fake book,
 *     teacher and player writes out differently; the melody is the part that is actually the
 *     composition, and no melody ships with this app. See docs/13-melody-timing.md.
 *   - Most of these compositions are in the US public domain (published ≤ 1930). Tune Up, Misty,
 *     Autumn Leaves and April in Paris are not, and are here as changes alone for that reason.
 */
import { parseChartText } from './chartText.js';
import type { Song } from './song.js';

const CHARTS: string[] = [
`title: I Got Rhythm
composer: George Gershwin
key: Bb | style: swing | tempo: 180
[A] { Bbmaj7 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Fm7 Bb7 | Ebmaj7 Ab7 | 1) Dm7 G7 | Cm7 F7 }
2) Cm7 F7 | Bb6 |
[B] D7 | D7 | G7 | G7 | C7 | C7 | F7 | F7 |
[A] Bbmaj7 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Fm7 Bb7 | Ebmaj7 Ab7 | Cm7 F7 | Bb6 |`,

`title: Honeysuckle Rose
composer: Fats Waller
key: F | style: swing | tempo: 160
[A] { Gm7 C7 | Gm7 C7 | Gm7 C7 | Gm7 C7 | F6 | F6 | 1) F6 | F6 }
2) F6 | Cm7 F7 |
[B] Bb7 | Bb7 | F6 | F6 | G7 | G7 | Gm7 | C7 |
[A] Gm7 C7 | Gm7 C7 | Gm7 C7 | Gm7 C7 | F6 | F6 | F6 | F6 |`,

`title: St. Louis Blues
composer: W. C. Handy
key: G | style: swing | tempo: 130
[A] G7 | C7 | G7 | G7 | C7 | C7 | G7 | G7 | D7 | C7 | G7 | D7 |
[A] G7 | C7 | G7 | G7 | C7 | C7 | G7 | G7 | D7 | C7 | G7 | D7 |
[B] Gm | Gm | D7 | D7 | Gm | Gm | D7 | Gm | Gm | Gm | D7 | D7 | Gm | Gm | D7 | Gm |
[C] G7 | C7 | G7 | G7 | C7 | C7 | G7 | G7 | D7 | C7 | G7 | D7 |`,

`title: Sweet Georgia Brown
composer: Ben Bernie, Maceo Pinkard
key: F | style: swing | tempo: 200
[A] D7 | D7 | D7 | D7 | G7 | G7 | G7 | G7 | C7 | C7 | C7 | C7 | F6 | F6 | F6 | F6 |
[B] D7 | D7 | D7 | D7 | G7 | G7 | G7 | G7 | Dm6 | A7 | Dm6 | D7 | Gm7 | C7 | F6 D7 | Gm7 C7 |`,

`title: Body and Soul
composer: John Green
key: Db | style: ballad | tempo: 60
[A] { Ebm7 | Bb7b9 | Ebm7 Ab7 | Dbmaj7 Gb7 | Fm7 Edim7 | Ebm7 Ab7 | 1) Dbmaj7 Bbm7 | Ebm7 Ab7 }
2) Dbmaj7 | Dbmaj7 |
[B] Em7 A7 | Dmaj7 F#m7 | Em7 A7 | Dmaj7 | Dm7 G7 | Cmaj7 Ebdim7 | Dm7 G7 | Cmaj7 Bb7 |
[A] Ebm7 | Bb7b9 | Ebm7 Ab7 | Dbmaj7 Gb7 | Fm7 Edim7 | Ebm7 Ab7 | Dbmaj7 | Ebm7 Ab7 |`,

`title: Bye Bye Blackbird
composer: Ray Henderson
key: F | style: swing | tempo: 150
[A] F6 | F6 | F6 | F6 | Gm7 | C7 | F6 | F6 |
[B] Gm7 | C7 | Gm7 | C7 | Gm7 | C7 | F6 | F6 |
[C] F6 | F6 | Fm6 | Fm6 | Cm7 F7 | Bbmaj7 | Bbm6 | Am7 D7 |
[D] Gm7 | C7 | Am7 D7 | Gm7 C7 | F6 D7 | Gm7 C7 | F6 | Gm7 C7 |`,

`title: Indiana
composer: James F. Hanley
key: F | style: swing | tempo: 210
[A] F6 | F6 | Bb7 | Bb7 | F6 | D7 | G7 | G7 | C7 | C7 | F6 | F6 | D7 | D7 | Gm7 | C7 |
[B] F6 | F6 | Bb7 | Bb7 | F6 | D7 | Gm7 | Gm7 | Bbm6 | Bbm6 | F6 | D7 | Gm7 | C7 | F6 | Gm7 C7 |`,

`title: Ja-Da
composer: Bob Carleton
key: F | style: swing | tempo: 140
[A] F6 | D7 | G7 | C7 | F6 D7 | G7 C7 | F6 | Gm7 C7 |
[A] F6 | D7 | G7 | C7 | F6 D7 | G7 C7 | F6 | F6 |`,

`title: Whispering
composer: John Schonberger
key: Eb | style: swing | tempo: 170
[A] Eb6 | Eb6 | Am7 | D7 | Eb6 | Eb6 | Gm7 | C7 | Fm7 | Bb7 | Eb6 | Cm7 | Fm7 | Bb7 | Eb6 | Bb7 |
[B] Eb6 | Eb6 | Am7 | D7 | Eb6 | Eb6 | Gm7 | C7 | F7 | F7 | Bb7 | Bb7 | Eb6 | Ab7 | Eb6 | Bb7 |`,

`title: Ain't Misbehavin'
composer: Fats Waller
key: Eb | style: swing | tempo: 110
[A] { Eb6 C7 | Fm7 Bb7 | Eb6 Eb7 | Ab6 Abm6 | Eb6 C7 | F7 Bb7 | 1) Eb6 Ab7 | Eb6 Bb7 }
2) Eb6 Ab7 | Eb6 |
[B] Cm | Cm/B | Cm/Bb | Cm/A | Ab7 | Ab7 | F7 | Bb7 |
[A] Eb6 C7 | Fm7 Bb7 | Eb6 Eb7 | Ab6 Abm6 | Eb6 C7 | F7 Bb7 | Eb6 Ab7 | Eb6 |`,

`title: Georgia on My Mind
composer: Hoagy Carmichael
key: F | style: ballad | tempo: 66
[A] { F6 | A7 | Dm7 | Bb6 Bbm6 | F6 | Gm7 C7 | 1) F6 D7 | Gm7 C7 }
2) F6 | Gm7 C7 |
[B] Dm7 | Gm6 | Dm7 | E7 A7 | Dm7 | Gm6 | Dm7 Bbm6 | Gm7 C7 |
[A] F6 | A7 | Dm7 | Bb6 Bbm6 | F6 | Gm7 C7 | F6 | Gm7 C7 |`,

`title: On the Sunny Side of the Street
composer: Jimmy McHugh
key: C | style: swing | tempo: 130
[A] { C6 | E7 | F6 | G7 | C6 A7 | Dm7 G7 | 1) C6 | Dm7 G7 }
2) C6 | C6 |
[B] C7 | C7 | F6 | F6 | D7 | D7 | G7 | Dm7 G7 |
[A] C6 | E7 | F6 | G7 | C6 A7 | Dm7 G7 | C6 | Dm7 G7 |`,

`title: Exactly Like You
composer: Jimmy McHugh
key: C | style: swing | tempo: 140
[A] { C6 | C6 | D7 | D7 | Dm7 | G7 | 1) C6 | Dm7 G7 }
2) C6 | C6 |
[B] C7 | C7 | F6 | F6 | D7 | D7 | G7 | Dm7 G7 |
[A] C6 | C6 | D7 | D7 | Dm7 | G7 | C6 | C6 |`,

`title: Blue Skies
composer: Irving Berlin
key: C | style: swing | tempo: 150
[A] { Am | AmMaj7 | Am7 | D7 | C6 | Dm7 G7 | 1) C6 | E7 }
2) C6 | C6 |
[B] C6 | C#dim7 | Dm7 G7 | C6 | C6 | C#dim7 | Dm7 G7 | E7 |
[A] Am | AmMaj7 | Am7 | D7 | C6 | Dm7 G7 | C6 | C6 |`,

`title: Oh, Lady Be Good
composer: George Gershwin
key: G | style: swing | tempo: 160
[A] { G6 | C7 | G6 | Am7 D7 | G6 | C7 | 1) G6 | Am7 D7 }
2) G6 | G6 |
[B] G7 | G7 | C6 | C6 | A7 | A7 | D7 | D7 |
[A] G6 | C7 | G6 | Am7 D7 | G6 | C7 | G6 | G6 |`,

`title: Tea for Two
composer: Vincent Youmans
key: Ab | style: swing | tempo: 140
[A] Bbm7 Eb7 | Abmaj7 | Bbm7 Eb7 | Abmaj7 | Bbm7 Eb7 | Abmaj7 | Bbm7 Eb7 | Abmaj7 |
[B] Dm7 G7 | Cmaj7 | Dm7 G7 | Cmaj7 | Dm7 G7 | Cmaj7 | Cmaj7 | Bbm7 Eb7 |
[A] Bbm7 Eb7 | Abmaj7 | Bbm7 Eb7 | Abmaj7 | Bbm7 Eb7 | Abmaj7 | Bbm7 Eb7 | Abmaj7 |
[C] Fm7 | Bbm7 | Eb7 | Abmaj7 | Fm7 | Bbm7 | Eb7 | Abmaj7 |`,

`title: Basin Street Blues
composer: Spencer Williams
key: Bb | style: swing | tempo: 100
[A] Bb6 | D7 | Eb6 | Edim7 | Bb6 G7 | C7 F7 | Bb6 | F7 |
[A] Bb6 | D7 | Eb6 | Edim7 | Bb6 G7 | C7 F7 | Bb6 | Bb6 |`,

`title: What Is This Thing Called Love
composer: Cole Porter
key: C | style: swing | tempo: 180
[A] { Gm7b5 | C7b9 | Fm6 | Fm6 | Dm7b5 | G7b9 | 1) C6 | C6 }
2) C6 | C6 |
[B] Cm7 | F7 | Bbmaj7 | Bbmaj7 | Ab7 | Ab7 | G7 | G7 |
[A] Gm7b5 | C7b9 | Fm6 | Fm6 | Dm7b5 | G7b9 | C6 | C6 |`,

`title: Avalon
composer: Vincent Rose, Al Jolson
key: F | style: swing | tempo: 200
[A] C7 | C7 | C7 | C7 | F6 | F6 | F6 | F6 | C7 | C7 | C7 | C7 | F6 | F6 | F6 | F6 |
[B] A7 | A7 | Dm | Dm | G7 | G7 | C7 | C7 | F6 | F6 | Bb6 | Bbm6 | F6 D7 | Gm7 C7 | F6 | F6 |`,

`title: Limehouse Blues
composer: Philip Braham
key: Ab | style: swing | tempo: 220
[A] Db7 | Db7 | Ab6 | Ab6 | Db7 | Db7 | Ab6 | Ab6 | Db7 | Db7 | Ab6 | Ab6 | Bbm7 | Eb7 | Ab6 | Eb7 |
[B] Db7 | Db7 | Ab6 | Ab6 | Db7 | Db7 | Ab6 | Ab6 | F7 | F7 | Bb7 | Bb7 | Eb7 | Eb7 | Ab6 | Eb7 |`,
`title: Tune Up
composer: Miles Davis
key: D | style: swing | tempo: 200
[A] { Em7 | A7 | Dmaj7 | Dmaj7 | Dm7 | G7 | Cmaj7 | Cmaj7 | Cm7 | F7 | Bbmaj7 | Bbmaj7 | Ebmaj7 | Ebmaj7 | 1) Em7 | A7 }
2) Dmaj7 | Dmaj7 |`,

`title: Misty
composer: Erroll Garner
key: Eb | style: ballad | tempo: 68
[A] { Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7 | Ebmaj7 Cm7 | Fm7 Bb7 | 1) Gm7 C7b9 | Fm7 Bb7 }
2) Eb6 | Eb6 |
[B] Bbm7 | Eb7 | Abmaj7 | Abmaj7 | Am7 | D7 F7 | Gm7b5 C7b9 | Fm7 Bb7 |
[A] Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7 | Ebmaj7 Cm7 | Fm7 Bb7 | Eb6 Cm7 | Fm7 Bb7 |`,

`title: Autumn Leaves
composer: Joseph Kosma
key: E- | style: swing | tempo: 120
[A] { Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | B7 | 1) Em | Em }
2) Em | Em |
[B] F#m7b5 | B7b9 | Em | Em | Am7 | D7 | Gmaj7 | Gmaj7 |
[C] F#m7b5 | B7b9 | Em7 A7 | Dm7 G7 | F#m7b5 | B7b9 | Em | Em |`,
`title: April in Paris
composer: Vernon Duke
key: C | style: swing | tempo: 112
[A] Fm6/G | Cmaj7 | Dm7b5 | G7 | Cmaj7 | Cmaj7 | Gm7 | C7 |
[B] Fmaj7 | Fmaj7 | Bm7b5 E7 | Am7 Am7/G | F#m7b5 | B7#5 | Bm7 E7 | Em7b5 A7 |
[C] F#m7b5 Fdim7 | C/E Ebdim7 | Dm7b5 | C/E | Bm7b5 E7 | Am7 Am7/G | F#m7b5 B7#5 | Emaj7:2 Dm7:1 G7:1 |
[D] Fm6/G | Cmaj7 | Em7b5 | A7#5 | D7 | Dm7 G7 | C6 | C6 |`,
];

let cache: Song[] | null = null;
export function builtinSongs(): Song[] {
  if (!cache) cache = CHARTS.map((c) => { const s = parseChartText(c); s.source = 'builtin'; s.id = `builtin-${s.id}`; return s; });
  return cache;
}
