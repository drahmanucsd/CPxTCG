/**
 * Tune-level progress: how well you know a standard, and when you last touched it.
 *
 * Derived from sessions rather than stored, so it cannot drift out of sync with what you played.
 * Tune drills carry the song id in their spec id (`tune-<songId>-<mode>…`).
 */
import type { SessionRow } from '../db';

export type TuneStatus = 'new' | 'learning' | 'known' | 'rusty';

/** Known tunes go rusty after this long without being played. */
export const RUSTY_DAYS = 21;
/** A full run this clean counts as knowing it. */
const KNOWN_RATE = 0.9;
const KNOWN_MIN_CHORDS = 16;

export interface TuneProgress {
  songId: string;
  status: TuneStatus;
  lastPlayedAt: number | null;
  /** best clean rate on a run of this tune */
  best: number;
  plays: number;
  daysSince: number | null;
}

export function songIdOf(specId: string): string | null {
  if (!specId.startsWith('tune-')) return null;
  // tune-<songId>-<mode>[-extra]; song ids can contain dashes, so strip from the known modes
  const m = /^tune-(.+?)-(changes|quiz|iiVs|track|record)(-|$)/.exec(specId);
  return m ? m[1]! : null;
}

export function tuneProgress(sessions: SessionRow[], songId: string): TuneProgress {
  const mine = sessions.filter((s) => songIdOf(s.specId) === songId);
  const plays = mine.length;
  const lastPlayedAt = plays ? Math.max(...mine.map((s) => s.startedAt)) : null;
  const daysSince = lastPlayedAt === null ? null : Math.floor((Date.now() - lastPlayedAt) / 86_400_000);

  let best = 0;
  let knownRun = false;
  for (const s of mine) {
    const total = s.summary?.total ?? s.total ?? 0;
    const clean = s.summary?.clean ?? s.correct ?? 0;
    if (!total) continue;
    const rate = clean / total;
    if (rate > best) best = rate;
    if (rate >= KNOWN_RATE && total >= KNOWN_MIN_CHORDS) knownRun = true;
  }

  const status: TuneStatus = !plays ? 'new'
    : knownRun ? (daysSince !== null && daysSince >= RUSTY_DAYS ? 'rusty' : 'known')
    : 'learning';

  return { songId, status, lastPlayedAt, best, plays, daysSince };
}

export const STATUS_LABEL: Record<TuneStatus, string> = { new: 'Not started', learning: 'Learning', known: 'Know it', rusty: 'Rusty' };
export const STATUS_TONE: Record<TuneStatus, string> = {
  new: 'bg-panel-2 text-ink-faint',
  learning: 'bg-warn/20 text-warn',
  known: 'bg-good/20 text-good',
  rusty: 'bg-bad/15 text-bad',
};

/** The tune Today should pull: the rustiest known one, else the one in progress. */
export function dueTune(all: TuneProgress[]): TuneProgress | null {
  const rusty = all.filter((t) => t.status === 'rusty').sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
  if (rusty.length) return rusty[0]!;
  const learning = all.filter((t) => t.status === 'learning').sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
  return learning[0] ?? null;
}
