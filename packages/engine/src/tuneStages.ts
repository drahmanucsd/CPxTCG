/**
 * Learning a tune is a sequence, not a page of options.
 *
 * Each stage decides what the practice screen shows and what the drill grades, so the learner
 * sees one thing to do next instead of every control at once. Order follows how working players
 * actually internalise a standard: ear first, hands after.
 */

export type TuneStageId =
  | 'listen' | 'melody' | 'roots' | 'map' | 'guide' | 'voicings' | 'band' | 'memory' | 'perform' | 'keep';

export interface TuneStage {
  id: TuneStageId;
  name: string;
  /** what you are doing, in one line */
  blurb: string;
  /** the button that starts it */
  action: string;
  /** false when nothing is scored — listening and singing are not pass/fail */
  graded: boolean;
  /** how much of the chart this stage wants on screen */
  reveal: 'chart' | 'roman' | 'sections' | 'blank';
  /** the right hand is doing something the grader should ignore */
  handSplit: boolean;
}

export const TUNE_STAGES: TuneStage[] = [
  {
    id: 'listen', name: 'Listen', graded: false, reveal: 'chart', handSplit: false,
    blurb: 'One recording, until you can sing the melody without it. Away from the piano.',
    action: 'Open the reference',
  },
  {
    id: 'melody', name: 'Melody', graded: true, reveal: 'chart', handSplit: true,
    blurb: 'The head in the right hand, from memory where you can. Pitches, not exact rhythm.',
    action: 'Play the head',
  },
  {
    id: 'roots', name: 'Roots', graded: true, reveal: 'chart', handSplit: true,
    blurb: 'Roots in the left hand under the melody. The skeleton of the harmony.',
    action: 'Play roots',
  },
  {
    id: 'map', name: 'The map', graded: true, reveal: 'chart', handSplit: false,
    blurb: 'Form, key centres, ii-V-Is, what repeats. Thirty-two chords become six ideas.',
    action: 'Quiz me on the changes',
  },
  {
    id: 'guide', name: 'Guide tones', graded: true, reveal: 'chart', handSplit: true,
    blurb: 'Thirds and sevenths under the melody. The line that makes the changes audible.',
    action: 'Play guide tones',
  },
  {
    id: 'voicings', name: 'Voicings', graded: true, reveal: 'chart', handSplit: true,
    blurb: 'The voicing family you are learning, under the melody.',
    action: 'Play the voicings',
  },
  {
    id: 'band', name: 'In time', graded: true, reveal: 'chart', handSplit: false,
    blurb: 'Comp the whole form with the band, at the tempo you last held.',
    action: 'Play with the band',
  },
  {
    id: 'memory', name: 'From memory', graded: true, reveal: 'roman', handSplit: false,
    blurb: 'The chart fades: numerals, then section boxes, then nothing.',
    action: 'Play from memory',
  },
  {
    id: 'perform', name: 'With the record', graded: true, reveal: 'blank', handSplit: false,
    blurb: 'Your own audio, piano stem down. The record is the clock and it does not wait.',
    action: 'Play with the record',
  },
  {
    id: 'keep', name: 'Keep it', graded: true, reveal: 'blank', handSplit: false,
    blurb: 'Learned. It goes on the repertoire list and comes back before you lose it.',
    action: 'Run it once',
  },
];

export const TUNE_STAGE_BY_ID: Record<TuneStageId, TuneStage> =
  Object.fromEntries(TUNE_STAGES.map((s) => [s.id, s])) as Record<TuneStageId, TuneStage>;

export function tuneStageIndex(id: TuneStageId): number {
  return TUNE_STAGES.findIndex((s) => s.id === id);
}

export function nextTuneStage(id: TuneStageId): TuneStage | null {
  return TUNE_STAGES[tuneStageIndex(id) + 1] ?? null;
}

/** The memory stage steps its own fade as you get clean runs. */
export function memoryReveal(cleanRuns: number): 'chart' | 'roman' | 'sections' | 'blank' {
  return cleanRuns <= 0 ? 'chart' : cleanRuns === 1 ? 'roman' : cleanRuns === 2 ? 'sections' : 'blank';
}
