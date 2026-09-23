/**
 * Courses: a voicing family, staged (docs/11-platform.md).
 *
 * A course is the object a learner picks. The stages decide the drill settings — strictness,
 * pacing, hints, which keys — so the learner never sets a bpm or a strictness level. Each stage
 * compiles to a DrillSpec, so everything downstream (runner, review, progress) is unchanged.
 */
import type { PitchClass } from '@shed/theory';
import type { DrillSpec, Pacing } from './drill.js';

export type StageId = 'show' | 'copy' | 'find' | 'waits' | 'clock' | 'apply';

export interface Stage {
  id: StageId;
  name: string;
  /** what the learner is doing, in one line */
  blurb: string;
  /** stages before this one that must be passed */
  needs: StageId | null;
}

export const STAGES: Stage[] = [
  { id: 'show', name: 'Show me', blurb: 'The shape, the degrees, and what it sounds like in a ii-V-I.', needs: null },
  { id: 'copy', name: 'Copy it', blurb: 'No clock. The notes are on the keyboard; the ones that move are lit.', needs: 'show' },
  { id: 'find', name: 'Find it', blurb: 'No clock, no notes shown. Hints appear only when you stall.', needs: 'copy' },
  { id: 'waits', name: 'In time, waiting', blurb: 'The click runs and the chord waits for you. We measure the tempo you actually held.', needs: 'find' },
  { id: 'clock', name: 'In time', blurb: 'The bar moves whether you do or not. Clean passes push the tempo up.', needs: 'waits' },
  { id: 'apply', name: 'On a tune', blurb: 'Comp a standard with this voicing and a band.', needs: 'clock' },
];

export const STAGE_BY_ID: Record<StageId, Stage> = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<StageId, Stage>;

export interface Course {
  id: string;
  name: string;
  /** one line, in the learner's terms, not the engine's */
  blurb: string;
  /** voicing families this course drills */
  families: string[];
  /** ladder position */
  order: number;
  /** chord qualities that appear — a ii-V-I needs only three */
  qualities: string[];
  /** the tempo "in time" means for this course */
  targetBpm: number;
  /** keys to learn first, before all twelve */
  firstKeys: PitchClass[];
  /** true when the right hand plays something the drill should not grade */
  gradeLeftHandOnly?: boolean;
  /**
   * 'strict' — play the exact voice-led form. Right when choosing between A and B by which moves
   *            less IS the skill (rootless, guide tones, shells).
   * 'off'    — any valid voicing of the family passes. Right when the family has many equally
   *            good forms and picking one would be arbitrary (drop 2 inversions, quartal stacks).
   */
  voiceLeading: 'strict' | 'off';
}

/** C, F, Bb, Eb, Ab, G — the flat keys jazz lives in, plus C and G to start. */
const FIRST_KEYS: PitchClass[] = [0, 5, 10, 3, 8, 7];

export const COURSES: Course[] = [
  {
    id: 'root37', name: 'LH root, RH 3-7', order: 1,
    blurb: 'The smallest thing that sounds like jazz piano. The root anchors the key in the bass; the right hand plays the two notes that say what the chord is.',
    families: ['root37'], qualities: ['maj7', 'm7', '7'], voiceLeading: 'strict', targetBpm: 80, firstKeys: FIRST_KEYS,
  },
  {
    id: 'guide', name: 'Guide tones (LH 3-7)', order: 2,
    blurb: 'The same two notes with no root under them. Now you have to hear the voice leading instead of seeing it.',
    families: ['guide'], qualities: ['maj7', 'm7', '7', 'm7b5'], voiceLeading: 'strict', targetBpm: 100, firstKeys: FIRST_KEYS,
  },
  {
    id: 'shell', name: 'Shells (1-3-7)', order: 3,
    blurb: 'Root, third, seventh in the left hand. Bud Powell. Holds a tune up on its own.',
    families: ['shell'], qualities: ['maj7', 'm7', '7'], voiceLeading: 'strict', targetBpm: 100, firstKeys: FIRST_KEYS,
  },
  {
    id: 'rootless', name: 'Rootless A and B', order: 4,
    blurb: 'The working left hand for playing with a bass player. The app picks A or B by whichever moves less.',
    families: ['rootlessA', 'rootlessB'], qualities: ['maj7', 'm7', '7', 'm7b5', '7alt'], voiceLeading: 'strict', targetBpm: 120, firstKeys: FIRST_KEYS,
  },
  {
    id: 'rootless3', name: 'Rootless, three notes', order: 5,
    blurb: 'A and B with one note taken out. Lighter, and easier to move fast.',
    families: ['rootless3A', 'rootless3B'], qualities: ['maj7', 'm7', '7', 'm7b5'], voiceLeading: 'strict', targetBpm: 130, firstKeys: FIRST_KEYS,
  },
  {
    id: 'twoHand', name: 'Two-hand rootless', order: 6,
    blurb: 'Guide tones under tensions, split across both hands. The full comping sound.',
    families: ['twoHandRootless'], qualities: ['maj7', 'm7', '7', 'm7b5', '7alt'], voiceLeading: 'strict', targetBpm: 110, firstKeys: FIRST_KEYS,
  },
  {
    id: 'spread', name: 'Two-hand spread', order: 7,
    blurb: 'Root and seventh down low, thirds and tensions on top. For when there is no bass player.',
    families: ['spread'], qualities: ['maj7', 'm7', '7', 'm7b5'], voiceLeading: 'off', targetBpm: 100, firstKeys: FIRST_KEYS,
  },
  {
    id: 'quartal', name: 'Quartal', order: 8,
    blurb: 'Stacked fourths. McCoy and Herbie. Modal, open, no thirds to place you.',
    families: ['quartal', 'quartal3'], qualities: ['m7', '7', 'maj7'], voiceLeading: 'off', targetBpm: 100, firstKeys: FIRST_KEYS,
  },
  {
    id: 'drop2', name: 'Drop 2', order: 9,
    blurb: 'Take a close voicing and drop the second voice from the top an octave. Any inversion counts.',
    families: ['drop2'], qualities: ['maj7', 'm7', '7', 'm7b5'], voiceLeading: 'off', targetBpm: 90, firstKeys: FIRST_KEYS,
  },
  {
    id: 'upperStructure', name: 'Upper structures', order: 10,
    blurb: 'Guide tones in the left hand, a plain triad on a tension in the right. Where altered dominants come from.',
    families: ['upperStructure'], qualities: ['7', '7alt', '7b9', '7#11'], voiceLeading: 'off', targetBpm: 80, firstKeys: FIRST_KEYS,
  },
];

export const COURSE_BY_ID: Record<string, Course> = Object.fromEntries(COURSES.map((c) => [c.id, c]));

export interface StageOpts {
  /** keys this run covers; defaults to the course's first keys */
  keys?: PitchClass[];
  /** for 'clock', the tempo to run at; defaults to the course target */
  bpm?: number;
  /** melody in the other hand: grade one hand only */
  handSplit?: boolean;
}

const free = (holdMs = 350): Pacing => ({ mode: 'free', bpm: 0, beatsPerChord: 4, countInBars: 0, timeSig: { beats: 4, unit: 4 }, advance: 'onCorrect', holdMs });
const timed = (bpm: number, advance: 'onTime' | 'onCorrect'): Pacing =>
  ({ mode: 'timed', bpm, beatsPerChord: 4, countInBars: 1, timeSig: { beats: 4, unit: 4 }, advance, timingWindowMs: 120, maxRepeats: 8 });

/**
 * Compile a course stage into a drill. This is the only place stage → settings is decided, so
 * the learner never picks a strictness or a bpm.
 */
export function stageSpec(course: Course, stage: StageId, opts: StageOpts = {}): DrillSpec {
  const keys = opts.keys?.length ? opts.keys : course.firstKeys;
  const base = {
    id: `course:${course.id}:${stage}`,
    families: course.families,
    strictness: course.voiceLeading === 'strict' ? ('shape' as const) : ('family' as const),
    voiceLeading: course.voiceLeading,
    tags: ['course', course.id, stage],
    ...(opts.handSplit || course.gradeLeftHandOnly ? { hands: { grade: 'below' as const } } : {}),
  };
  const iiVI = { kind: 'iiVI' as const, order: 'fourths' as const, keys };

  switch (stage) {
    case 'show':
    case 'copy':
      return {
        ...base, name: `${course.name} · copy it`, description: STAGE_BY_ID.copy.blurb,
        generator: iiVI, pacing: free(250), lookAhead: 'always', length: { passes: 1 },
        autoHint: 2, // the notes are on the keyboard before you play
      };
    case 'find':
      return {
        ...base, name: `${course.name} · find it`, description: STAGE_BY_ID.find.blurb,
        generator: iiVI, pacing: free(), lookAhead: 'always', length: { passes: 1 },
        autoHint: 'adaptive',
      };
    case 'waits':
      return {
        ...base, name: `${course.name} · in time, waiting`, description: STAGE_BY_ID.waits.blurb,
        generator: iiVI, pacing: timed(Math.round(course.targetBpm * 0.75), 'onCorrect'),
        lookAhead: 'always', length: { passes: 1 }, autoHint: 'adaptive',
      };
    case 'clock':
    case 'apply':
    default:
      return {
        ...base, name: `${course.name} · in time`, description: STAGE_BY_ID.clock.blurb,
        generator: iiVI, pacing: timed(opts.bpm ?? course.targetBpm, 'onTime'),
        lookAhead: 'always', length: { passes: 1 },
        ladder: { up: 4, down: 6, min: 40, max: 260 },
      };
  }
}
