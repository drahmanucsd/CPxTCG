/**
 * Voicing families: declarative degree templates per quality class, realized into
 * MIDI notes inside a register box under low-interval and hand-span constraints.
 */
import { type ChordSymbol, type ChordTones, type QualityClass, DEGREE_SEMITONES, chordTones, qualityClass } from './chord.js';
import { type Midi, type PitchClass, MIDI, pc } from './pitch.js';

export type Hand = 'LH' | 'RH' | 'both' | 'either';

export interface Voicing {
  chord: ChordSymbol;
  family: string;
  /** Sorted ascending. */
  notes: Midi[];
  /** Hand assignment when the family defines it. */
  hands?: { left: Midi[]; right: Midi[] };
  /** Inversion index for families that have one (0 = root position / template order). */
  inversion?: number;
  /** Degree labels bottom to top, e.g. "3-7-9-5" or "1-7 | 3-5-9". */
  label: string;
  /** Degrees bottom to top */
  degrees: string[];
}

export interface RegisterBox {
  /** Inclusive MIDI range the LOWEST note may sit in. */
  lowestMin: Midi;
  lowestMax: Midi;
  /** Highest note may not exceed this. */
  top: Midi;
}

export interface RealizeOptions {
  /** Override the family's default box (single-hand families) */
  box?: Partial<RegisterBox>;
  leftBox?: Partial<RegisterBox>;
  rightBox?: Partial<RegisterBox>;
  /** Max span in semitones for one hand (default 12 = octave; 14 = 10th; 16+ for drop families). */
  maxSpan?: number;
  /** Enforce low interval limits (default true). */
  lowIntervalLimits?: boolean;
  /** Add the root in the bass (an octave-ish below) for rootless families — "two-hand" mode. */
  addBassRoot?: boolean;
}

/** A template is a list of degree strings bottom → top. Two-hand templates split by '|'. */
type Template = string; // e.g. "3 7 9 5" or "1 5 | 3 7 9"

export interface FamilyDef {
  id: string;
  name: string;
  short: string;
  hand: Hand;
  description: string;
  /** Templates per quality class. Missing class → family doesn't apply. */
  templates: Partial<Record<QualityClass, Template[]>>;
  /** Default register box for single-hand families. */
  box: RegisterBox;
  leftBox?: RegisterBox;
  rightBox?: RegisterBox;
  maxSpan: number;
  /** Which "transform" to apply after building the close stack (drop voicings). */
  transform?: 'drop2' | 'drop3' | 'drop24' | 'inversions';
  /** Two-hand: RH must sit directly above LH (next octave occurrence), no gap of an octave+. */
  contiguous?: boolean;
  /** Two-hand: the LH note doubles the RH top note an octave below (block chords). */
  lhDoublesTop?: boolean;
  /** Family groups for UI. */
  group: 'basic' | 'rootless' | 'drop' | 'quartal' | 'twoHand' | 'advanced';
}

const LH_BOX: RegisterBox = { lowestMin: MIDI.C3, lowestMax: MIDI.C4, top: MIDI.C5 };
const LH_LOW_BOX: RegisterBox = { lowestMin: MIDI.E2, lowestMax: MIDI.G3, top: MIDI.C5 };
const RH_BOX: RegisterBox = { lowestMin: MIDI.C4, lowestMax: MIDI.G4 + 5, top: MIDI.C6 };
const BASS_BOX: RegisterBox = { lowestMin: MIDI.C2, lowestMax: MIDI.E3, top: MIDI.C4 };
const EITHER_BOX: RegisterBox = { lowestMin: MIDI.E2 + 1, lowestMax: MIDI.C4, top: MIDI.C6 };

// A few shorthand template sets
const SHELL: Partial<Record<QualityClass, Template[]>> = {
  maj7: ['1 3 7', '1 7 3'], maj6: ['1 3 6', '1 6 3'], dom7: ['1 3 b7', '1 b7 3'], min7: ['1 b3 b7', '1 b7 b3'],
  halfdim: ['1 b3 b7', '1 b7 b3', '1 b5 b7'], dim7: ['1 b3 bb7', '1 bb7 b3'], minmaj7: ['1 b3 7', '1 7 b3'],
  dom7sus: ['1 4 b7', '1 b7 4'], alt: ['1 3 b7', '1 b7 3'], aug7: ['1 3 b7', '1 b7 3'], min6: ['1 b3 6', '1 6 b3'],
  maj: ['1 3 5'], min: ['1 b3 5'],
};

export const FAMILIES: FamilyDef[] = [
  {
    id: 'close', name: 'Close position (root)', short: 'Close', hand: 'either', group: 'basic',
    description: 'Root-position stacked 3rds. The reference form for everything else.',
    templates: {
      maj: ['1 3 5'], min: ['1 b3 5'], aug: ['1 3 #5'], sus4: ['1 4 5'], sus2: ['1 9 5'], power: ['1 5'],
      maj7: ['1 3 5 7'], maj6: ['1 3 5 6'], min7: ['1 b3 5 b7'], min6: ['1 b3 5 6'], minmaj7: ['1 b3 5 7'],
      dom7: ['1 3 5 b7'], dom7sus: ['1 4 5 b7'], halfdim: ['1 b3 b5 b7'], dim7: ['1 b3 b5 bb7'], aug7: ['1 3 #5 b7'],
      alt: ['1 3 b7 b9', '1 3 b7 #9'],
    },
    box: EITHER_BOX, maxSpan: 14,
  },
  {
    id: 'inversions', name: 'Inversions', short: 'Inv', hand: 'either', group: 'basic', transform: 'inversions',
    description: 'All inversions of the close voicing.',
    templates: {
      maj: ['1 3 5'], min: ['1 b3 5'], aug: ['1 3 #5'], sus4: ['1 4 5'],
      maj7: ['1 3 5 7'], maj6: ['1 3 5 6'], min7: ['1 b3 5 b7'], min6: ['1 b3 5 6'], minmaj7: ['1 b3 5 7'],
      dom7: ['1 3 5 b7'], dom7sus: ['1 4 5 b7'], halfdim: ['1 b3 b5 b7'], dim7: ['1 b3 b5 bb7'], aug7: ['1 3 #5 b7'],
    },
    box: EITHER_BOX, maxSpan: 12,
  },
  {
    id: 'shell', name: 'Shell voicings', short: 'Shell', hand: 'LH', group: 'basic',
    description: 'Root + 3rd + 7th (or 7th + 3rd). Bud Powell style LH.',
    templates: SHELL, box: LH_LOW_BOX, maxSpan: 12,
  },
  {
    id: 'guide', name: 'Guide tones', short: '3-7', hand: 'LH', group: 'basic',
    description: 'Just the 3rd and 7th. The skeleton of voice leading.',
    templates: {
      maj7: ['3 7', '7 3'], maj6: ['3 6', '6 3'], dom7: ['3 b7', 'b7 3'], min7: ['b3 b7', 'b7 b3'], halfdim: ['b3 b7', 'b7 b3'],
      dim7: ['b3 bb7', 'bb7 b3'], minmaj7: ['b3 7', '7 b3'], dom7sus: ['4 b7', 'b7 4'], alt: ['3 b7', 'b7 3'], aug7: ['3 b7', 'b7 3'],
      min6: ['b3 6', '6 b3'],
    },
    box: { lowestMin: MIDI.C3, lowestMax: MIDI.C4, top: MIDI.C5 }, maxSpan: 12,
  },
  {
    id: 'root37', name: 'RH root, LH 3-7', short: 'Root + 3-7', hand: 'both', group: 'basic',
    description: 'Left hand plays the guide tones (3rd and 7th); right hand plays the root on its own. The first two-hand setup: the LH learns the voice leading while the RH only has to find the key.',
    templates: {
      maj7: ['3 7 | 1', '7 3 | 1'], maj6: ['3 6 | 1', '6 3 | 1'], min7: ['b3 b7 | 1', 'b7 b3 | 1'],
      min6: ['b3 6 | 1', '6 b3 | 1'], minmaj7: ['b3 7 | 1', '7 b3 | 1'],
      dom7: ['3 b7 | 1', 'b7 3 | 1'], dom7sus: ['4 b7 | 1', 'b7 4 | 1'], alt: ['3 b7 | 1', 'b7 3 | 1'],
      halfdim: ['b3 b7 | 1', 'b7 b3 | 1'], dim7: ['b3 bb7 | 1', 'bb7 b3 | 1'], aug7: ['3 b7 | 1', 'b7 3 | 1'],
      maj: ['3 5 | 1'], min: ['b3 5 | 1'],
    },
    box: EITHER_BOX, leftBox: { lowestMin: MIDI.C3, lowestMax: MIDI.C4, top: MIDI.C5 },
    rightBox: { lowestMin: MIDI.C4, lowestMax: MIDI.C5 + 2, top: MIDI.C6 }, maxSpan: 12,
  },
  {
    id: 'rootlessA', name: 'Rootless A form', short: 'Rootless A', hand: 'LH', group: 'rootless',
    description: '3rd on the bottom: 3-5-7-9 (maj/min), 3-13-7-9 (dom). Bill Evans / Wynton Kelly LH.',
    templates: {
      maj7: ['3 5 7 9'], maj6: ['3 5 6 9'], min7: ['b3 5 b7 9'], min6: ['b3 5 6 9'], minmaj7: ['b3 5 7 9'],
      dom7: ['3 13 b7 9'], alt: ['3 b13 b7 #9', '3 b13 b7 b9'], aug7: ['3 #5 b7 9'],
      halfdim: ['b3 b5 b7 1', 'b3 b5 b7 9'], dim7: ['b3 b5 bb7 9'], dom7sus: ['4 5 b7 9'],
    },
    box: LH_BOX, maxSpan: 12,
  },
  {
    id: 'rootlessB', name: 'Rootless B form', short: 'Rootless B', hand: 'LH', group: 'rootless',
    description: '7th on the bottom: 7-9-3-5 (maj/min), 7-9-3-13 (dom).',
    templates: {
      maj7: ['7 9 3 5'], maj6: ['6 9 3 5'], min7: ['b7 9 b3 5'], min6: ['6 9 b3 5'], minmaj7: ['7 9 b3 5'],
      dom7: ['b7 9 3 13'], alt: ['b7 #9 3 b13', 'b7 b9 3 b13'], aug7: ['b7 9 3 #5'],
      halfdim: ['b7 1 b3 b5', 'b7 9 b3 b5'], dim7: ['bb7 9 b3 b5'], dom7sus: ['b7 9 4 13'],
    },
    box: LH_BOX, maxSpan: 12,
  },
  {
    id: 'rootless3A', name: 'Rootless A (3-note)', short: '3-note A', hand: 'LH', group: 'rootless',
    description: '3-7-9 — the three-note A form.',
    templates: {
      maj7: ['3 7 9'], maj6: ['3 6 9'], min7: ['b3 b7 9'], min6: ['b3 6 9'], minmaj7: ['b3 7 9'],
      dom7: ['3 b7 9', '3 b7 13'], alt: ['3 b7 #9', '3 b7 b9'], halfdim: ['b3 b7 1', 'b3 b5 b7'], dim7: ['b3 bb7 9'],
      dom7sus: ['4 b7 9'],
    },
    box: LH_BOX, maxSpan: 12,
  },
  {
    id: 'rootless3B', name: 'Rootless B (3-note)', short: '3-note B', hand: 'LH', group: 'rootless',
    description: '7-3-5 / 7-3-13 — the three-note B form.',
    templates: {
      maj7: ['7 3 5'], maj6: ['6 3 5'], min7: ['b7 b3 5'], min6: ['6 b3 5'], minmaj7: ['7 b3 5'],
      dom7: ['b7 3 13', 'b7 3 5'], alt: ['b7 3 b13', 'b7 3 #9'], halfdim: ['b7 b3 b5'], dim7: ['bb7 b3 b5'],
      dom7sus: ['b7 4 13'],
    },
    box: LH_BOX, maxSpan: 12,
  },
  {
    id: 'drop2', name: 'Drop 2', short: 'Drop 2', hand: 'either', group: 'drop', transform: 'drop2',
    description: 'From a close 4-note voicing in any inversion, drop the 2nd voice from the top an octave.',
    templates: {
      maj7: ['1 3 5 7'], maj6: ['1 3 5 6'], min7: ['1 b3 5 b7'], min6: ['1 b3 5 6'], minmaj7: ['1 b3 5 7'],
      dom7: ['1 3 5 b7'], dom7sus: ['1 4 5 b7'], halfdim: ['1 b3 b5 b7'], dim7: ['1 b3 b5 bb7'], aug7: ['1 3 #5 b7'],
      alt: ['3 b7 b9 b13', '3 b7 #9 b13'],
    },
    box: EITHER_BOX, maxSpan: 19,
  },
  {
    id: 'drop3', name: 'Drop 3', short: 'Drop 3', hand: 'either', group: 'drop', transform: 'drop3',
    description: 'Drop the 3rd voice from the top an octave.',
    templates: {
      maj7: ['1 3 5 7'], maj6: ['1 3 5 6'], min7: ['1 b3 5 b7'], min6: ['1 b3 5 6'], minmaj7: ['1 b3 5 7'],
      dom7: ['1 3 5 b7'], dom7sus: ['1 4 5 b7'], halfdim: ['1 b3 b5 b7'], dim7: ['1 b3 b5 bb7'], aug7: ['1 3 #5 b7'],
    },
    box: EITHER_BOX, maxSpan: 24,
  },
  {
    id: 'drop24', name: 'Drop 2+4', short: 'Drop 2+4', hand: 'either', group: 'drop', transform: 'drop24',
    description: 'Drop the 2nd and 4th voices from the top an octave.',
    templates: {
      maj7: ['1 3 5 7'], maj6: ['1 3 5 6'], min7: ['1 b3 5 b7'], min6: ['1 b3 5 6'], minmaj7: ['1 b3 5 7'],
      dom7: ['1 3 5 b7'], dom7sus: ['1 4 5 b7'], halfdim: ['1 b3 b5 b7'], dim7: ['1 b3 b5 bb7'], aug7: ['1 3 #5 b7'],
    },
    box: EITHER_BOX, maxSpan: 24,
  },
  {
    id: 'fourWayClose', name: 'Four-way close (block)', short: 'Block', hand: 'both', group: 'advanced',
    description: 'Shearing block chord: close 4-note voicing in RH with the top note doubled an octave below in LH.',
    templates: {
      maj6: ['6 | 1 3 5 6', '5 | 6 1 3 5', '3 | 5 6 1 3', '1 | 3 5 6 1'],
      min6: ['6 | 1 b3 5 6', '5 | 6 1 b3 5', 'b3 | 5 6 1 b3', '1 | b3 5 6 1'],
      maj7: ['7 | 1 3 5 7', '5 | 7 1 3 5', '3 | 5 7 1 3', '1 | 3 5 7 1'],
      min7: ['b7 | 1 b3 5 b7', '5 | b7 1 b3 5', 'b3 | 5 b7 1 b3', '1 | b3 5 b7 1'],
      dom7: ['b7 | 1 3 5 b7', '5 | b7 1 3 5', '3 | 5 b7 1 3', '1 | 3 5 b7 1'],
      dim7: ['bb7 | 1 b3 b5 bb7', 'b5 | bb7 1 b3 b5', 'b3 | b5 bb7 1 b3', '1 | b3 b5 bb7 1'],
      halfdim: ['b7 | 1 b3 b5 b7', 'b5 | b7 1 b3 b5', 'b3 | b5 b7 1 b3', '1 | b3 b5 b7 1'],
    },
    box: EITHER_BOX, leftBox: { lowestMin: MIDI.C3, lowestMax: MIDI.C4 + 4, top: MIDI.C5 },
    rightBox: { lowestMin: MIDI.C4, lowestMax: MIDI.E5, top: MIDI.C6 + 4 }, maxSpan: 12, lhDoublesTop: true,
  },
  {
    id: 'quartal', name: 'Quartal', short: '4ths', hand: 'LH', group: 'quartal',
    description: 'Stacked perfect 4ths from the chord scale. McCoy / Herbie LH.',
    templates: {
      min7: ['1 4 b7 b3', '9 5 1 4', '5 1 4 b7', '13 9 5 1'],
      minmaj7: ['9 5 1 4', '5 1 4 7'],
      dom7: ['3 13 9 5', '9 5 1 4', '5 1 4 b7'],
      dom7sus: ['9 5 1 4', '5 1 4 b7', '1 4 b7 b3'],
      maj7: ['3 13 9 5', '#11 7 3 13', '13 9 5 1', '7 3 13 9'],
      maj6: ['3 13 9 5', '13 9 5 1'],
      halfdim: ['1 4 b7 b3', '11 b7 b3 b13', 'b7 b3 b13 b9'],
      alt: ['b7 #9 b13 b9', '3 b13 b9 #11'],
    },
    box: { ...LH_BOX, top: MIDI.E5 }, maxSpan: 16,
  },
  {
    id: 'quartal3', name: 'Quartal (3-note)', short: '4ths (3)', hand: 'LH', group: 'quartal',
    description: 'Three stacked 4ths.',
    templates: {
      min7: ['1 4 b7', '4 b7 b3', '9 5 1', '5 1 4', '13 9 5'],
      dom7: ['3 13 9', '13 9 5', '9 5 1', '5 1 4'],
      dom7sus: ['9 5 1', '5 1 4', '1 4 b7'],
      maj7: ['3 13 9', '13 9 5', '#11 7 3', '7 3 13'],
      maj6: ['3 13 9', '13 9 5'],
      halfdim: ['1 4 b7', '4 b7 b3', '11 b7 b3'],
    },
    box: LH_BOX, maxSpan: 11,
  },
  {
    id: 'soWhat', name: '"So What" voicing', short: 'So What', hand: 'both', group: 'quartal',
    description: 'Three perfect 4ths with a major 3rd on top (Bill Evans on Kind of Blue).',
    templates: {
      min7: ['1 4 | b7 b3 5', '4 b7 | b3 5 1'],
      dom7sus: ['1 4 | b7 9 5'],
      maj7: ['3 13 | 9 5 7'],
      dom7: ['3 13 | 9 5 b7'],
      halfdim: ['1 4 | b7 b3 b5'],
    },
    box: EITHER_BOX, leftBox: { lowestMin: MIDI.E2, lowestMax: MIDI.G3, top: MIDI.C5 }, rightBox: { lowestMin: MIDI.C4 - 5, lowestMax: MIDI.C5, top: MIDI.C6 }, maxSpan: 12, contiguous: true,
  },
  {
    id: 'spread', name: 'Two-hand spread', short: 'Spread', hand: 'both', group: 'twoHand',
    description: 'LH root + 7th (or 5th), RH 3rd + tensions. The default comping voicing with a bass player absent.',
    templates: {
      maj7: ['1 7 | 3 5 9', '1 5 | 7 9 3', '1 7 | 3 13 9', '1 5 9 | 3 7'],
      maj6: ['1 6 | 3 5 9', '1 5 | 6 9 3'],
      min7: ['1 b7 | b3 5 9', '1 5 | b7 9 b3', '1 b7 | b3 11 9', '1 5 9 | b3 b7'],
      min6: ['1 6 | b3 5 9', '1 5 | 6 9 b3'],
      minmaj7: ['1 7 | b3 5 9', '1 5 | 7 9 b3'],
      dom7: ['1 b7 | 3 13 9', '1 5 | b7 9 3', '1 b7 | 3 b13 b9', '1 3 | b7 9 13', '1 b7 | 3 #11 13'],
      alt: ['1 b7 | 3 b13 #9', '1 b7 | 3 b13 b9', '1 3 | b7 b9 #11'],
      aug7: ['1 b7 | 3 #5 9'],
      dom7sus: ['1 b7 | 4 5 9', '1 5 | b7 9 4'],
      halfdim: ['1 b7 | b3 b5 9', '1 b5 | b7 b3 9', '1 b7 | b3 b5 11'],
      dim7: ['1 bb7 | b3 b5 7', '1 b5 | bb7 b3 9'],
    },
    box: EITHER_BOX, leftBox: BASS_BOX, rightBox: RH_BOX, maxSpan: 12,
  },
  {
    id: 'twoHandRootless', name: 'Two-hand rootless', short: '2H rootless', hand: 'both', group: 'twoHand',
    description: 'LH 3-7 (or 7-3), RH tensions and 5th. For playing with a bassist.',
    templates: {
      maj7: ['3 7 | 9 5', '7 3 | 5 9', '3 7 | 9 #11', '7 3 | 13 9'],
      maj6: ['3 6 | 9 5', '6 3 | 5 9'],
      min7: ['b3 b7 | 9 5', 'b7 b3 | 5 9', 'b3 b7 | 9 11', 'b7 b3 | 11 9'],
      min6: ['b3 6 | 9 5', '6 b3 | 5 9'],
      minmaj7: ['b3 7 | 9 5', '7 b3 | 5 9'],
      dom7: ['3 b7 | 9 13', 'b7 3 | 13 9', '3 b7 | #9 13', 'b7 3 | b13 b9', '3 b7 | b9 13'],
      alt: ['3 b7 | b9 b13', 'b7 3 | b13 #9', '3 b7 | #9 b13'],
      dom7sus: ['4 b7 | 9 5', 'b7 4 | 5 9'],
      halfdim: ['b3 b7 | b5 9', 'b7 b3 | b5 11', 'b3 b7 | b5 1'],
      dim7: ['b3 bb7 | b5 7', 'bb7 b3 | b5 9'],
    },
    box: EITHER_BOX, leftBox: { lowestMin: MIDI.C3, lowestMax: MIDI.C4, top: MIDI.C5 }, rightBox: { lowestMin: MIDI.C4 + 2, lowestMax: MIDI.C5, top: MIDI.C6 }, maxSpan: 12,
  },
  {
    id: 'upperStructure', name: 'Upper-structure triads', short: 'UST', hand: 'both', group: 'advanced',
    description: 'LH 3rd & 7th, RH a major (or minor) triad built on a tension. Dominants mostly.',
    templates: {
      dom7: [
        '3 b7 | 9 #11 13',   // II  (D/C7)
        'b7 3 | 9 #11 13',
        '3 b7 | #11 b7 b9',  // #IV (F#/C7)
        '3 b7 | b13 1 #9',   // bVI (Ab/C7)
        '3 b7 | 13 b9 3',    // VI  (A/C7)
        '3 b7 | b9 3 b13',   // bII (Db/C7)
        '3 b7 | #9 5 b7',    // bIII (Eb/C7)
        'b7 3 | #11 13 1',   // #iv- (F#-/C7)
      ],
      alt: ['3 b7 | #11 b7 b9', '3 b7 | b13 1 #9', '3 b7 | b9 3 b13', 'b7 3 | b13 1 #9'],
      maj7: ['3 7 | 9 #11 13', '7 3 | 9 #11 13', '3 7 | 5 7 9'],
      min7: ['b3 b7 | 9 11 13', 'b7 b3 | 5 b7 9'],
      halfdim: ['b3 b7 | b5 b7 9', 'b7 b3 | 11 b13 1'],
      dom7sus: ['4 b7 | 9 11 13', 'b7 4 | b7 9 11'],
    },
    box: EITHER_BOX, leftBox: { lowestMin: MIDI.C3, lowestMax: MIDI.C4, top: MIDI.C5 }, rightBox: { lowestMin: MIDI.C4, lowestMax: MIDI.C5 + 2, top: MIDI.C6 + 4 }, maxSpan: 12,
  },
  {
    id: 'kennyBarron', name: 'Kenny Barron / stacked 5ths', short: 'K. Barron', hand: 'both', group: 'advanced',
    description: 'LH 1-5-9, RH b3-b7-11 (minor 11). Stacked 5ths; also the "Herbie" maj7 form.',
    templates: {
      min7: ['1 5 9 | b3 b7 11'], min6: ['1 5 9 | b3 6 9'], minmaj7: ['1 5 9 | b3 7 11'],
      maj7: ['1 5 9 | 3 7 #11', '1 5 9 | 7 3 13'], dom7sus: ['1 5 9 | 4 b7 9'], dom7: ['1 5 9 | 3 13 b7'],
      halfdim: ['1 b5 b7 | b3 b13 9'],
    },
    box: EITHER_BOX, leftBox: { lowestMin: MIDI.C2 + 4, lowestMax: MIDI.E3, top: MIDI.G4 }, rightBox: { lowestMin: MIDI.C4 - 2, lowestMax: MIDI.C5, top: MIDI.C6 }, maxSpan: 14,
  },
  {
    id: 'cluster', name: 'Clusters', short: 'Cluster', hand: 'LH', group: 'advanced',
    description: 'Tight 2nds: 7-1-9, 1-9-3, 3-11-5. Modern LH colours.',
    templates: {
      maj7: ['7 1 9', '1 9 3', '7 9 3', '3 #11 5', '9 3 #11'], maj6: ['6 1 9', '1 9 3'],
      min7: ['b7 1 9', '1 9 b3', 'b7 9 b3', 'b3 11 5', '9 b3 11'], minmaj7: ['7 1 9', '1 9 b3'],
      dom7: ['b7 1 9', '9 3 13', 'b7 9 3', '3 13 b7', 'b9 3 13'], alt: ['b7 b9 3', 'b9 3 b13', '#9 3 b13'],
      dom7sus: ['b7 1 9', '1 9 4', '4 5 b7'], halfdim: ['b7 1 9', '1 9 b3', 'b3 11 b5'], min6: ['6 1 9', '1 9 b3'],
    },
    box: { lowestMin: MIDI.C3 + 2, lowestMax: MIDI.C4, top: MIDI.C5 }, maxSpan: 7,
  },
  {
    id: 'sixNine', name: '6/9 stacks', short: '6/9', hand: 'either', group: 'advanced',
    description: 'Voicings built on the 6/9 sound: 3-6-9-5, 6-9-3-5, 1-5-9-3-6.',
    templates: {
      maj6: ['3 6 9 5', '6 9 3 5', '9 3 6 1', '5 9 3 6'], maj7: ['3 6 9 5', '6 9 3 5', '3 6 7 9'],
      maj: ['3 6 9 5', '6 9 3 5', '5 9 3 6'], min6: ['b3 6 9 5', '6 9 b3 5', '9 b3 6 1'],
    },
    box: LH_BOX, maxSpan: 12,
  },
];

export const FAMILY_BY_ID: Record<string, FamilyDef> = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));

export function familiesFor(chord: ChordSymbol): FamilyDef[] {
  const qc = qualityClass(chord);
  return FAMILIES.filter((f) => f.templates[qc]?.length);
}

// ---------------------------------------------------------------------------
// Realization
// ---------------------------------------------------------------------------

/** Standard low-interval limits: the lowest MIDI note at which an interval (semitones) still sounds clean. */
export const LOW_INTERVAL_LIMIT: Record<number, Midi> = {
  1: MIDI.E3, 2: MIDI.E3 - 1, 3: MIDI.C3, 4: MIDI.Bb2, 5: MIDI.Bb2, 6: MIDI.Bb2, 7: 34, 8: MIDI.F2, 9: MIDI.F2, 10: MIDI.F2, 11: MIDI.F2,
};

export function violatesLowIntervalLimit(notes: readonly Midi[]): boolean {
  for (let i = 0; i < notes.length - 1; i++) {
    const a = notes[i]!, b = notes[i + 1]!;
    const iv = b - a;
    if (iv > 0 && iv < 12) {
      const limit = LOW_INTERVAL_LIMIT[iv]!;
      if (a < limit) return true;
    }
  }
  return false;
}

/** Substitute template degrees to honour the symbol's alterations (dominants). */
function adaptDegrees(degrees: string[], chord: ChordSymbol): string[][] {
  const alts = chord.alterations;
  const has = (a: string) => alts.includes(a as never);
  // Each slot may expand to several alternatives; produce the cartesian product (small).
  const slots: string[][] = degrees.map((d) => {
    if (chord.quality !== 'dom' && chord.quality !== 'aug') return [d];
    if (d === '9') {
      const out: string[] = [];
      if (has('b9')) out.push('b9');
      if (has('#9')) out.push('#9');
      return out.length ? out : [d];
    }
    if (d === '13' && (has('b13') || has('#5'))) return ['b13'];
    if (d === '5' && has('b5')) return ['b5'];
    if (d === '5' && (has('#5') || chord.quality === 'aug')) return ['#5'];
    if (d === '11' && has('#11')) return ['#11'];
    return [d];
  });
  let combos: string[][] = [[]];
  for (const s of slots) combos = combos.flatMap((c) => s.map((x) => [...c, x]));
  return combos;
}

function degreesToPcs(degrees: string[], root: PitchClass): PitchClass[] {
  return degrees.map((d) => {
    const semi = DEGREE_SEMITONES[d];
    if (semi === undefined) throw new Error(`Unknown degree ${d}`);
    return pc(root + semi);
  });
}

/** Stack pitch classes bottom→top as a close voicing starting at `lowest`. */
function stackFrom(pcs: PitchClass[], lowest: Midi): Midi[] {
  const out: Midi[] = [];
  let prev = -1;
  for (let i = 0; i < pcs.length; i++) {
    const p = pcs[i]!;
    let n = i === 0 ? lowest : prev + ((p - pc(prev) + 12) % 12 || 12);
    if (i === 0) n = lowest;
    out.push(n);
    prev = n;
  }
  return out;
}

function applyTransform(close: Midi[], t: FamilyDef['transform']): Midi[] {
  const n = close.length;
  const v = [...close];
  const dropIdx = (k: number) => n - k; // k-th from top (1-based) → index
  if (t === 'drop2' && n >= 3) v[dropIdx(2)]! -= 12;
  if (t === 'drop3' && n >= 4) v[dropIdx(3)]! -= 12;
  if (t === 'drop24' && n >= 4) { v[dropIdx(2)]! -= 12; v[dropIdx(4)]! -= 12; }
  return v.sort((a, b) => a - b);
}

function rotate<T>(arr: T[], k: number): T[] {
  return [...arr.slice(k), ...arr.slice(0, k)];
}

interface Part { degrees: string[]; pcs: PitchClass[] }

function splitTemplate(t: Template): string[][] {
  return t.split('|').map((p) => p.trim().split(/\s+/).filter(Boolean));
}

/**
 * Generate every candidate voicing of `family` for `chord` inside the register boxes.
 * Deterministic order: template order, then inversion, then ascending register.
 */
export function generateVoicings(chord: ChordSymbol, familyId: string, opts: RealizeOptions = {}): Voicing[] {
  const fam = FAMILY_BY_ID[familyId];
  if (!fam) throw new Error(`Unknown family ${familyId}`);
  const qc = qualityClass(chord);
  const templates = fam.templates[qc];
  if (!templates) return [];
  const lil = opts.lowIntervalLimits ?? true;
  const out: Voicing[] = [];
  const seen = new Set<string>();

  for (const tpl of templates) {
    const parts = splitTemplate(tpl);
    if (parts.length === 1) {
      // single hand / either
      const box = { ...fam.box, ...opts.box };
      const maxSpan = opts.maxSpan ?? fam.maxSpan;
      for (const degs of adaptDegrees(parts[0]!, chord)) {
        const pcs = degreesToPcs(degs, chord.root);
        const inversionsToTry = fam.transform ? pcs.length : 1;
        for (let inv = 0; inv < inversionsToTry; inv++) {
          const rDegs = rotate(degs, inv);
          const rPcs = rotate(pcs, inv);
          for (let lowest = box.lowestMin - 12; lowest <= box.lowestMax + 12; lowest++) {
            if (pc(lowest) !== rPcs[0]) continue;
            const close = stackFrom(rPcs, lowest);
            const notes = applyTransform(close, fam.transform === 'inversions' ? undefined : fam.transform);
            const lo = notes[0]!, hi = notes[notes.length - 1]!;
            if (lo < box.lowestMin || lo > box.lowestMax || hi > box.top) continue;
            if (hi - lo > maxSpan) continue;
            if (lil && violatesLowIntervalLimit(notes)) continue;
            const key = notes.join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            // degrees bottom→top after transform: recompute from pcs
            const degByPc = new Map(rDegs.map((d, i) => [rPcs[i]!, d]));
            const degrees = notes.map((n) => degByPc.get(pc(n))!);
            const v: Voicing = { chord, family: fam.id, notes, label: degrees.join('-'), degrees };
            if (fam.transform) v.inversion = inv;
            if (opts.addBassRoot) {
              const bassRoot = lowest - ((lowest - chord.root) % 12) - 12;
              v.notes = [bassRoot, ...notes];
              v.hands = { left: [bassRoot], right: notes };
              v.degrees = ['1', ...degrees];
              v.label = `1 | ${degrees.join('-')}`;
            }
            out.push(v);
          }
        }
      }
    } else {
      // two-hand
      const lb = { ...(fam.leftBox ?? BASS_BOX), ...opts.leftBox };
      const rb = { ...(fam.rightBox ?? RH_BOX), ...opts.rightBox };
      const maxSpan = opts.maxSpan ?? fam.maxSpan;
      const leftAlts = adaptDegrees(parts[0]!, chord);
      const rightAlts = adaptDegrees(parts[1]!, chord);
      for (const ld of leftAlts) for (const rd of rightAlts) {
        const left: Part = { degrees: ld, pcs: degreesToPcs(ld, chord.root) };
        const right: Part = { degrees: rd, pcs: degreesToPcs(rd, chord.root) };
        const lefts: Midi[][] = [];
        for (let lowest = lb.lowestMin; lowest <= lb.lowestMax; lowest++) {
          if (pc(lowest) !== left.pcs[0]) continue;
          const n = stackFrom(left.pcs, lowest);
          if (n[n.length - 1]! > lb.top || n[n.length - 1]! - n[0]! > maxSpan) continue;
          if (lil && violatesLowIntervalLimit(n)) continue;
          lefts.push(n);
        }
        const rights: Midi[][] = [];
        for (let lowest = rb.lowestMin; lowest <= rb.lowestMax; lowest++) {
          if (pc(lowest) !== right.pcs[0]) continue;
          const n = stackFrom(right.pcs, lowest);
          if (n[n.length - 1]! > rb.top || n[n.length - 1]! - n[0]! > maxSpan) continue;
          rights.push(n);
        }
        for (const L of lefts) for (const R of rights) {
          const lTop = L[L.length - 1]!;
          if (R[0]! <= lTop) continue; // RH above LH
          if (fam.contiguous && R[0]! - lTop > 12) continue;
          if (fam.lhDoublesTop && R[R.length - 1]! - L[0]! !== 12) continue;
          const notes = [...L, ...R];
          if (lil && violatesLowIntervalLimit(notes)) continue;
          const key = notes.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            chord, family: fam.id, notes, hands: { left: L, right: R },
            degrees: [...left.degrees, ...right.degrees], label: `${left.degrees.join('-')} | ${right.degrees.join('-')}`,
          });
        }
      }
    }
  }
  return out;
}

/** All families' candidates for a chord. */
export function allVoicings(chord: ChordSymbol, opts?: RealizeOptions): Voicing[] {
  return familiesFor(chord).flatMap((f) => generateVoicings(chord, f.id, opts));
}

export function voicingPcs(v: Voicing): PitchClass[] {
  return [...new Set(v.notes.map(pc))].sort((a, b) => a - b) as PitchClass[];
}

export function tonesOf(chord: ChordSymbol): ChordTones {
  return chordTones(chord);
}
