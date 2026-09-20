/* Eyeball tool: `pnpm theory voicings "Ebm7"` | `pnpm theory lead rootlessA "Dm7 G7 Cmaj7"` | `pnpm theory id C4 E4 G4 B4` */
import { FAMILIES, familiesFor, generateVoicings } from './voicings.js';
import { formatChord, parseChord } from './chord.js';
import { midiName, parseMidiName } from './pitch.js';
import { leadProgression } from './voiceLeading.js';
import { identify } from './matcher.js';

const [cmd, ...args] = process.argv.slice(2);
const names = (ns: number[]) => ns.map((n) => midiName(n)).join(' ');

if (cmd === 'voicings') {
  const chord = parseChord(args[0] ?? 'Cmaj7');
  console.log(`\n${formatChord(chord)}  (${chord.text})`);
  for (const fam of familiesFor(chord)) {
    const vs = generateVoicings(chord, fam.id);
    console.log(`\n  ${fam.name} [${fam.id}] — ${vs.length} candidates`);
    for (const v of vs.slice(0, 12)) console.log(`    ${v.label.padEnd(22)} ${names(v.notes)}`);
    if (vs.length > 12) console.log(`    … ${vs.length - 12} more`);
  }
} else if (cmd === 'lead') {
  const family = args[0] ?? 'rootlessA';
  const chords = (args[1] ?? 'Dm7 G7 Cmaj7').split(/\s+/).map(parseChord);
  const led = leadProgression(chords, { families: [family] });
  led.forEach((v, i) => console.log(`${formatChord(chords[i]!).padEnd(8)} ${v ? v.label.padEnd(16) + names(v.notes) : '—'}`));
} else if (cmd === 'id') {
  const notes = args.map((a) => parseMidiName(a) ?? Number(a));
  for (const r of identify(notes)) console.log(`${formatChord(r.chord).padEnd(10)} ${r.score.toFixed(1).padStart(5)}  ${r.family ?? ''} ${r.label ?? ''} ${r.rootless ? '(rootless)' : ''}`);
} else if (cmd === 'families') {
  for (const f of FAMILIES) console.log(`${f.id.padEnd(18)} ${f.hand.padEnd(6)} ${f.name} — ${f.description}`);
} else {
  console.log('usage: theory voicings <chord> | lead <family> "<chords>" | id <notes…> | families');
}
