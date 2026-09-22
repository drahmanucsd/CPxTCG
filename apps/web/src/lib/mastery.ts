/**
 * Course progress, derived from attempts rather than stored as its own truth.
 *
 * "Keys mastered out of 12" is the learner-facing progress number (docs/11-platform.md §UX 8).
 * A key counts as mastered when you have played that course's voicings in that key, in time, at
 * something close to the course tempo, and got them clean.
 */
import type { Course, StageId } from '@shed/engine';
import { STAGES } from '@shed/engine';
import type { PitchClass } from '@shed/theory';
import type { AttemptRow } from '../db';

/** A key is mastered on this many clean-enough chords. */
const MIN_CHORDS = 6;
const CLEAN_RATE = 0.9;
/** Tempo counts toward mastery from 90% of the course target. */
const TEMPO_SLACK = 0.9;
const WINDOW_DAYS = 60;

export interface KeyProgress {
  key: PitchClass;
  total: number;
  clean: number;
  rate: number;
  mastered: boolean;
}

export interface CourseProgress {
  courseId: string;
  keys: KeyProgress[];
  mastered: number;
  /** attempts seen at all, any tempo — used to decide whether a stage has been touched */
  touched: number;
  /** highest stage with any recorded attempt */
  reached: StageId | null;
}

const ALL_KEYS: PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** A chord belongs to a key: the ii-V-I's tonic when we know it, else the chord's own root. */
function keyOf(r: AttemptRow): number {
  return r.keyTonic ?? r.chord.root;
}

export function courseProgress(rows: AttemptRow[], course: Course): CourseProgress {
  const since = Date.now() - WINDOW_DAYS * 86_400_000;
  const fam = new Set(course.families);
  const mine = rows.filter((r) => r.ts > since && fam.has(r.family));
  const atTempo = mine.filter((r) => r.bpm >= course.targetBpm * TEMPO_SLACK);

  const keys: KeyProgress[] = ALL_KEYS.map((key) => {
    const cells = atTempo.filter((r) => keyOf(r) === key);
    const clean = cells.filter((r) => r.outcome === 'clean').length;
    const total = cells.length;
    const rate = total ? clean / total : 0;
    return { key, total, clean, rate, mastered: total >= MIN_CHORDS && rate >= CLEAN_RATE };
  });

  let reached: StageId | null = null;
  for (const s of STAGES) if (mine.some((r) => r.specId === `course:${course.id}:${s.id}`)) reached = s.id;

  return {
    courseId: course.id,
    keys,
    mastered: keys.filter((k) => k.mastered).length,
    touched: mine.length,
    reached,
  };
}

/** The stage a learner should be on: the one after the last they passed. */
export function nextStage(saved: StageId | undefined, p: CourseProgress): StageId {
  if (saved) return saved;
  if (!p.touched) return 'show';
  const i = p.reached ? STAGES.findIndex((s) => s.id === p.reached) : -1;
  return STAGES[Math.min(STAGES.length - 1, i + 1)]!.id;
}

/**
 * Did this run pass its stage? Stages before the clock only need you to get through them;
 * the clock stage is the one with a real bar.
 */
export function stagePassed(stage: StageId, cleanRate: number, total: number): boolean {
  if (total < 3) return false;
  switch (stage) {
    case 'show': return true;
    case 'copy': return cleanRate >= 0.7;
    case 'find': return cleanRate >= 0.7;
    case 'waits': return cleanRate >= 0.8;
    case 'clock': return cleanRate >= CLEAN_RATE;
    case 'apply': return cleanRate >= 0.8;
  }
}

/** Courses in ladder order, with the one to work on next flagged. */
export function suggestCourse(all: Course[], progress: Map<string, CourseProgress>): Course | null {
  const ordered = [...all].sort((a, b) => a.order - b.order);
  for (const c of ordered) {
    const p = progress.get(c.id);
    if (!p || p.mastered < 12) return c;
  }
  return ordered[0] ?? null;
}
