import { db, type AttemptRow } from '../db';
import type { HeatCell } from '../components/Heatmap';
import type { PitchClass } from '@shed/theory';

export async function recentAttempts(days = 30): Promise<AttemptRow[]> {
  const since = Date.now() - days * 86_400_000;
  return db.attempts.where('ts').above(since).toArray();
}

export function heatByFamily(rows: AttemptRow[]): { cells: HeatCell[]; cols: string[] } {
  const m = new Map<string, HeatCell>();
  const cols = new Set<string>();
  for (const r of rows) {
    cols.add(r.family);
    const k = `${r.root}:${r.family}`;
    let c = m.get(k);
    if (!c) { c = { root: r.root, col: r.family, total: 0, correct: 0 }; m.set(k, c); }
    c.total++; if (r.ok) c.correct++;
  }
  return { cells: [...m.values()], cols: [...cols] };
}

export function heatByQuality(rows: AttemptRow[]): { cells: HeatCell[]; cols: string[] } {
  const m = new Map<string, HeatCell>();
  const cols = new Set<string>();
  for (const r of rows) {
    cols.add(r.suffix);
    const k = `${r.root}:${r.suffix}`;
    let c = m.get(k);
    if (!c) { c = { root: r.root, col: r.suffix, total: 0, correct: 0 }; m.set(k, c); }
    c.total++; if (r.ok) c.correct++;
  }
  return { cells: [...m.values()], cols: [...cols] };
}

/** Weak spots: (root, suffix) cells with the lowest recency-weighted accuracy, min 3 attempts. */
export function weakSpots(rows: AttemptRow[], n = 5): Array<{ root: PitchClass; suffix: string; family: string; acc: number; total: number }> {
  const m = new Map<string, { root: PitchClass; suffix: string; family: string; w: number; ok: number }>();
  const now = Date.now();
  for (const r of rows) {
    const age = (now - r.ts) / 86_400_000;
    const w = Math.exp(-age / 14);
    const k = `${r.root}:${r.suffix}:${r.family}`;
    let c = m.get(k);
    if (!c) { c = { root: r.root as PitchClass, suffix: r.suffix, family: r.family, w: 0, ok: 0 }; m.set(k, c); }
    c.w += w; if (r.ok) c.ok += w;
  }
  return [...m.values()].filter((c) => c.w >= 2.5).map((c) => ({ root: c.root, suffix: c.suffix, family: c.family, acc: c.ok / c.w, total: Math.round(c.w) }))
    .sort((a, b) => a.acc - b.acc).slice(0, n);
}

/** Weight function for smart-random: weak cells are up to 4× more likely, unseen cells 2×. */
export function smartWeight(rows: AttemptRow[]): (root: PitchClass, suffix: string) => number {
  const m = new Map<string, { w: number; ok: number }>();
  const now = Date.now();
  for (const r of rows) {
    const w = Math.exp(-(now - r.ts) / 86_400_000 / 14);
    const k = `${r.root}:${r.suffix}`;
    const c = m.get(k) ?? { w: 0, ok: 0 };
    c.w += w; if (r.ok) c.ok += w; m.set(k, c);
  }
  return (root, suffix) => {
    const c = m.get(`${root}:${suffix}`);
    if (!c || c.w < 1) return 2;
    const acc = c.ok / c.w;
    return 1 + 3 * (1 - acc);
  };
}

export function streakDays(sessions: Array<{ startedAt: number }>): number {
  const days = new Set(sessions.map((s) => new Date(s.startedAt).toDateString()));
  let streak = 0;
  const d = new Date();
  for (;;) {
    if (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
    else if (streak === 0 && d.toDateString() === new Date().toDateString()) { d.setDate(d.getDate() - 1); } // today not yet practiced doesn't break the streak
    else break;
  }
  return streak;
}
