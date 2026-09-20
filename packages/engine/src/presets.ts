import type { DrillSpec } from './drill.js';

const timed = (bpm: number, beatsPerChord = 4): DrillSpec['pacing'] => ({ mode: 'timed', bpm, beatsPerChord, countInBars: 1, timeSig: { beats: 4, unit: 4 } });
const free: DrillSpec['pacing'] = { mode: 'free', bpm: 0, beatsPerChord: 4, countInBars: 0, timeSig: { beats: 4, unit: 4 }, holdMs: 350 };

export const PRESETS: DrillSpec[] = [
  {
    id: 'learn-rootless-iiVI', name: 'Learn: rootless ii-V-I', description: 'One key at a time, no clock. See the voicing when you need it.',
    generator: { kind: 'iiVI', order: 'fourths' }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: free, lookAhead: 'always', length: { passes: 1 }, prompt: 'symbol', tags: ['beginner', 'voicings'],
  },
  {
    id: 'rootless-iiVI-4ths-120', name: 'Rootless ii-V-I · cycle of 4ths · 120', description: 'The bread and butter. A/B forms voice-led through all 12 keys.',
    generator: { kind: 'iiVI', order: 'fourths' }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(120, 4), lookAhead: 'always', length: { passes: 1 }, ladder: { up: 4, down: 6, min: 60, max: 240 }, tags: ['core'],
  },
  {
    id: 'rootless-iiVI-random-2beats', name: 'Rootless ii-V-I · random keys · 2 beats', description: 'Faster changes, random key order. No look-ahead.',
    generator: { kind: 'iiVI', order: 'random' }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(100, 2), lookAhead: 'lastBeat', length: { passes: 1 }, tags: ['core'],
  },
  {
    id: 'minor-iiVi', name: 'Minor ii-V-i (ø · 7b9 · -6)', description: 'Half-diminished, altered dominant, minor 6 tonic.',
    generator: { kind: 'iiVI', order: 'fourths', minor: true }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(90, 4), lookAhead: 'always', length: { passes: 1 }, tags: ['core'],
  },
  {
    id: 'shells-iiVI', name: 'Shell voicings ii-V-I', description: 'Root, 3rd, 7th. Bud Powell left hand.',
    generator: { kind: 'iiVI', order: 'fifths' }, families: ['shell'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(110, 4), lookAhead: 'always', length: { passes: 1 }, tags: ['beginner'],
  },
  {
    id: 'guide-tones-iiVI', name: 'Guide tones ii-V-I', description: 'Only 3rds and 7ths. Hear the voice leading.',
    generator: { kind: 'iiVI', order: 'fourths' }, families: ['guide'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(120, 2), lookAhead: 'always', length: { passes: 1 }, tags: ['beginner'],
  },
  {
    id: 'drop2-maj7-cycle', name: 'Drop 2 · maj7 around the cycle', description: 'Any drop-2 inversion is fine; voice leading picks the closest.',
    generator: { kind: 'cycle', suffix: 'maj7', order: 'fourths' }, families: ['drop2'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(80, 4), lookAhead: 'always', length: { passes: 1 }, tags: ['drop'],
  },
  {
    id: 'drop2-any-inversion', name: 'Drop 2 · any inversion · random chords', description: 'Voice leading off: play any drop-2 of the chord.',
    generator: { kind: 'random', suffixes: ['maj7', 'm7', '7', 'm7b5'] }, families: ['drop2'], strictness: 'family', voiceLeading: 'off',
    pacing: free, lookAhead: 'never', length: { reps: 24 }, tags: ['drop'],
  },
  {
    id: 'dom7-cycle-A', name: 'Dominant 7ths · cycle of 4ths · rootless', description: 'Every dominant, 3-13-7-9 / 7-9-3-13 alternating.',
    generator: { kind: 'cycle', suffix: '7', order: 'fourths' }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(120, 2), lookAhead: 'always', length: { passes: 2 }, tags: ['core'],
  },
  {
    id: 'altered-dominants', name: 'Altered dominants · random', description: '7alt in random keys, rootless: 3-b13-7-#9.',
    generator: { kind: 'random', suffixes: ['7alt'] }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(80, 4), lookAhead: 'always', length: { reps: 24 }, tags: ['advanced'],
  },
  {
    id: 'turnaround-IviiiV', name: 'I-vi-ii-V turnaround · all keys', description: 'Two beats a chord, rootless.',
    generator: { kind: 'turnaround', id: 'IviiiV', order: 'fourths' }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(120, 2), lookAhead: 'always', length: { passes: 1 }, tags: ['core'],
  },
  {
    id: 'jazz-blues-F', name: 'Jazz blues in F · comp the changes', description: 'Two-hand spread voicings through a jazz blues.',
    generator: { kind: 'blues', id: 'jazz', tonic: 5 }, families: ['spread'], strictness: 'family', voiceLeading: 'off',
    pacing: timed(130, 4), lookAhead: 'always', length: { passes: 3 }, tags: ['tunes'],
  },
  {
    id: 'rhythm-changes-Bb', name: 'Rhythm changes A section · Bb', description: 'Fast turnarounds, two beats each.',
    generator: { kind: 'turnaround', id: 'rhythmA', order: 'single', tonic: 10 }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(160, 2), lookAhead: 'lastBeat', length: { passes: 4 }, ladder: { up: 6, down: 8, min: 100, max: 260 }, tags: ['core'],
  },
  {
    id: 'quartal-m7', name: 'Quartal voicings · minor 7 · random', description: 'Stacked 4ths, any of the four stacks.',
    generator: { kind: 'random', suffixes: ['m7'] }, families: ['quartal'], strictness: 'family', voiceLeading: 'off',
    pacing: free, lookAhead: 'never', length: { reps: 24 }, tags: ['advanced'],
  },
  {
    id: 'ust-dominants', name: 'Upper-structure triads · dominants', description: 'LH 3-7, RH a triad on a tension.',
    generator: { kind: 'random', suffixes: ['7', '7#11', '7b9', '7alt'] }, families: ['upperStructure'], strictness: 'family', voiceLeading: 'off',
    pacing: free, lookAhead: 'never', length: { reps: 24 }, tags: ['advanced'],
  },
  {
    id: 'random-everything', name: 'Everything, random, fast', description: 'Any chord type, any key, rootless, 2 beats. Speed ladder.',
    generator: { kind: 'random', suffixes: ['maj7', 'm7', '7', 'm7b5', 'dim7', '6', 'm6', '7alt', '7sus4', 'mMaj7'], smart: true },
    families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(100, 2), lookAhead: 'lastBeat', length: { minutes: 5 }, ladder: { up: 5, down: 8, min: 60, max: 240 }, tags: ['advanced'],
  },
  {
    id: 'coltrane-cells', name: 'Coltrane changes · Giant Steps cell', description: 'Major-third cycle through three keys.',
    generator: { kind: 'turnaround', id: 'coltrane', order: 'minorThirds' }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: timed(120, 2), lookAhead: 'always', length: { passes: 1 }, tags: ['advanced'],
  },
];

PRESETS.push({
  id: 'name-it-roman', name: 'Name it & play it · roman numerals', description: 'You see ii-7 in a key: say "D minor seven" and play it. Voice + hands.',
  generator: { kind: 'iiVI', order: 'random' }, families: ['rootlessA', 'rootlessB'], strictness: 'octaveFree', voiceLeading: 'off',
  pacing: free, lookAhead: 'never', length: { passes: 1 }, prompt: 'roman', speak: true, tags: ['advanced'],
});

export const PRESET_BY_ID: Record<string, DrillSpec> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
