/**
 * Voice leading: choose the candidate voicing that moves least from the previous one.
 */
import type { Midi } from './pitch.js';
import { type RealizeOptions, type Voicing, FAMILY_BY_ID, generateVoicings } from './voicings.js';
import type { ChordSymbol } from './chord.js';

export interface VoiceLeadingWeights {
  /** per-semitone movement cost */
  motion: number;
  /** cost per semitone the voicing's centre drifts from the preferred centre */
  drift: number;
  /** cost per voice added/removed between voicings of different sizes */
  sizeChange: number;
  /** cost of a common tone available (same pc in both) but not held in the same octave */
  commonToneLost: number;
}

export const DEFAULT_WEIGHTS: VoiceLeadingWeights = { motion: 1, drift: 0.15, sizeChange: 4, commonToneLost: 2 };

/**
 * Minimal total |Δ| pairing between two sorted note lists, allowing unmatched notes at a fixed cost.
 * Classic DP alignment (voices never cross in the optimal non-crossing pairing for sorted lists).
 */
export function motionCost(a: readonly Midi[], b: readonly Midi[], unmatched = 6): number {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i]![0] = i * unmatched;
  for (let j = 1; j <= m; j++) dp[0]![j] = j * unmatched;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j - 1]! + Math.abs(a[i - 1]! - b[j - 1]!),
        dp[i - 1]![j]! + unmatched,
        dp[i]![j - 1]! + unmatched,
      );
    }
  }
  return dp[n]![m]!;
}

function centre(notes: readonly Midi[]): number {
  return notes.reduce((s, n) => s + n, 0) / notes.length;
}

export function voiceLeadingCost(prev: Voicing, next: Voicing, preferredCentre: number, w: VoiceLeadingWeights = DEFAULT_WEIGHTS): number {
  let cost = w.motion * motionCost(prev.notes, next.notes);
  cost += w.drift * Math.abs(centre(next.notes) - preferredCentre);
  cost += w.sizeChange * Math.abs(prev.notes.length - next.notes.length);
  // common tones: same pitch class present in both but not the same midi note
  const prevSet = new Set(prev.notes);
  for (const n of next.notes) {
    const samePcInPrev = prev.notes.some((p) => (p - n) % 12 === 0);
    if (samePcInPrev && !prevSet.has(n)) cost += w.commonToneLost;
  }
  return cost;
}

export interface ChooseOptions {
  weights?: VoiceLeadingWeights;
  /** Preferred centre (average MIDI) — defaults to the previous voicing's centre, or the family box centre. */
  preferredCentre?: number;
}

/** Choose the best next voicing from candidates given the previous one. Deterministic. */
export function chooseVoicing(prev: Voicing | null, candidates: Voicing[], opts: ChooseOptions = {}): Voicing | null {
  if (!candidates.length) return null;
  if (!prev) {
    // No context: pick the candidate closest to the family's box centre.
    const c = opts.preferredCentre ?? defaultCentre(candidates[0]!.family);
    return [...candidates].sort((a, b) => Math.abs(centre(a.notes) - c) - Math.abs(centre(b.notes) - c) || a.notes[0]! - b.notes[0]!)[0]!;
  }
  const pc = opts.preferredCentre ?? defaultCentre(prev.family);
  let best: Voicing | null = null;
  let bestCost = Infinity;
  for (const c of candidates) {
    const cost = voiceLeadingCost(prev, c, pc, opts.weights);
    if (cost < bestCost - 1e-9) { best = c; bestCost = cost; }
  }
  return best;
}

export function defaultCentre(familyId: string): number {
  const fam = FAMILY_BY_ID[familyId];
  if (!fam) return 60;
  if (fam.leftBox && fam.rightBox) return (fam.leftBox.lowestMin + fam.rightBox.top) / 2;
  return (fam.box.lowestMin + fam.box.top) / 2;
}

export interface LeadOptions extends ChooseOptions {
  realize?: RealizeOptions;
  /** Allowed families; the first is preferred when several apply. */
  families: string[];
}

/**
 * Voice-lead a whole progression: returns one voicing per chord (null when no family applies).
 */
export function leadProgression(chords: ChordSymbol[], opts: LeadOptions): (Voicing | null)[] {
  const out: (Voicing | null)[] = [];
  let prev: Voicing | null = null;
  for (const chord of chords) {
    let candidates: Voicing[] = [];
    for (const f of opts.families) {
      candidates = candidates.concat(generateVoicings(chord, f, opts.realize));
    }
    const v = chooseVoicing(prev, candidates, opts);
    out.push(v);
    if (v) prev = v;
  }
  return out;
}
