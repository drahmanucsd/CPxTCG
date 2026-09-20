/**
 * Chord matching: grade played notes against a target voicing, and identify
 * what chord/voicing a set of notes is.
 */
import { type ChordSymbol, type QualityClass, chordTones, makeChord } from './chord.js';
import { type Midi, type PitchClass, pc, uniqueSorted } from './pitch.js';
import { type Voicing, familiesFor, generateVoicings, violatesLowIntervalLimit, voicingPcs } from './voicings.js';
import { motionCost } from './voiceLeading.js';

/**
 * exact      – these MIDI notes
 * shape      – the same voicing, any octave (same intervals bottom→top)
 * octaveFree – the same pitch classes, any arrangement
 * family     – any valid voicing of the target's family for this chord
 * chordTones – contains the essential tones and nothing outside the chord's allowed tones
 */
export type Strictness = 'exact' | 'shape' | 'octaveFree' | 'family' | 'chordTones';
export const STRICTNESS_ORDER: Strictness[] = ['exact', 'shape', 'octaveFree', 'family', 'chordTones'];
export const STRICTNESS_LABEL: Record<Strictness, string> = {
  exact: 'Exact notes', shape: 'Same voicing, any octave', octaveFree: 'Same notes, any arrangement', family: 'Any voicing in the family', chordTones: 'Chord tones only',
};

function sameShape(a: readonly Midi[], b: readonly Midi[]): boolean {
  if (a.length !== b.length || !a.length) return false;
  const d = a[0]! - b[0]!;
  if (d % 12 !== 0) return false;
  return a.every((n, i) => n - b[i]! === d);
}

export type Diagnosis =
  | 'missing' | 'extra' | 'wrongInversion' | 'wrongRegister' | 'wrongFamily' | 'lowIntervalLimit' | 'nothingPlayed';

export interface Verdict {
  ok: boolean;
  /** The strictest level the attempt satisfies (null if not even chordTones). */
  met: Strictness | null;
  diagnosis: Diagnosis[];
  missingPcs: PitchClass[];
  extraPcs: PitchClass[];
  /** Notes played that are correct / wrong (for the keyboard diff). */
  correctNotes: Midi[];
  wrongNotes: Midi[];
  /** Target notes not played (hollow on the keyboard diff). */
  missedNotes: Midi[];
  /** A one-line human explanation. */
  message: string;
  /** Voicing recognized among the target family, if any. */
  matchedVoicing?: Voicing;
}

const DEGREE_NAMES: Record<number, string> = { 0: 'root', 1: 'b9', 2: '9', 3: 'b3/#9', 4: '3', 5: '11', 6: '#11/b5', 7: '5', 8: 'b13/#5', 9: '13/6', 10: 'b7', 11: '7' };

function degreeName(chord: ChordSymbol, p: PitchClass): string {
  return DEGREE_NAMES[pc(p - chord.root)] ?? '?';
}

/** Which strictness levels the played notes satisfy for the target. */
export function evaluate(played: readonly Midi[], target: Voicing, strictness: Strictness, allowDoubledRoot = true): Verdict {
  const playedSorted = uniqueSorted(played);
  const chord = target.chord;
  const tones = chordTones(chord);
  const targetPcs = voicingPcs(target);
  const playedPcs = [...new Set(playedSorted.map(pc))].sort((a, b) => a - b) as PitchClass[];

  if (!playedSorted.length) {
    return { ok: false, met: null, diagnosis: ['nothingPlayed'], missingPcs: targetPcs, extraPcs: [], correctNotes: [], wrongNotes: [], missedNotes: target.notes, message: 'Nothing played' };
  }

  // --- exact / shape / octaveFree
  const exact = playedSorted.length === target.notes.length && playedSorted.every((n, i) => n === target.notes[i]);
  const shape = exact || sameShape(playedSorted, target.notes);
  const octaveFree = playedPcs.length === targetPcs.length && playedPcs.every((p, i) => p === targetPcs[i]);
  // --- family: any candidate of the same family with the same shape (any octave)
  let matchedVoicing: Voicing | undefined;
  let family = shape;
  if (shape) matchedVoicing = target;
  else {
    const candidates = generateVoicings(chord, target.family, { lowIntervalLimits: false, maxSpan: 40 });
    for (const c of candidates) {
      if (sameShape(playedSorted, c.notes)) { family = true; matchedVoicing = c; break; }
    }
    if (!matchedVoicing) {
      // name what they did play, if it's a known voicing of this chord in any family
      outer: for (const f of familiesFor(chord)) {
        for (const c of generateVoicings(chord, f.id, { lowIntervalLimits: false, maxSpan: 40 })) {
          if (sameShape(playedSorted, c.notes)) { matchedVoicing = c; break outer; }
        }
      }
    }
  }
  family = family || octaveFree;
  // --- chordTones: essential tones present, nothing outside allowed tones (optionally root doubled)
  const allowed = new Set<PitchClass>(tones.allowedPcs);
  if (allowDoubledRoot) allowed.add(chord.root);
  if (chord.bass !== null) allowed.add(chord.bass);
  const missingEssential = tones.essentialPcs.filter((p) => !playedPcs.includes(p));
  const outside = playedPcs.filter((p) => !allowed.has(p));
  const chordTonesOk = missingEssential.length === 0 && outside.length === 0 && playedPcs.length >= Math.min(2, tones.essentialPcs.length);

  const met: Strictness | null = exact ? 'exact' : shape ? 'shape' : octaveFree ? 'octaveFree' : family ? 'family' : chordTonesOk ? 'chordTones' : null;
  const ok = met !== null && STRICTNESS_ORDER.indexOf(met) <= STRICTNESS_ORDER.indexOf(strictness);

  // --- diagnosis
  const diagnosis: Diagnosis[] = [];
  const missingPcs = targetPcs.filter((p) => !playedPcs.includes(p));
  const extraPcs = playedPcs.filter((p) => !targetPcs.includes(p));
  const targetSet = new Set(target.notes);
  const targetPcSet = new Set(targetPcs);
  const correctNotes = playedSorted.filter((n) => (strictness === 'exact' ? targetSet.has(n) : targetPcSet.has(pc(n))));
  const wrongNotes = playedSorted.filter((n) => !correctNotes.includes(n));
  const missedNotes = strictness === 'exact'
    ? target.notes.filter((n) => !playedSorted.includes(n))
    : target.notes.filter((n) => !playedPcs.includes(pc(n)));

  let message = '';
  if (ok) {
    message = met === 'exact' || met === 'shape' ? 'Exact' : met === 'octaveFree' ? 'Right notes' : met === 'family' ? `Valid ${target.family} voicing` : 'Chord tones OK';
    if (violatesLowIntervalLimit(playedSorted)) { diagnosis.push('lowIntervalLimit'); message += ' — muddy: too low for that interval'; }
  } else if (missingPcs.length && !extraPcs.length && !family) {
    diagnosis.push('missing');
    message = `Missing ${missingPcs.map((p) => degreeName(chord, p)).join(', ')}`;
  } else if (extraPcs.length && !missingPcs.length && !family) {
    diagnosis.push('extra');
    message = `Extra ${extraPcs.map((p) => degreeName(chord, p)).join(', ')}`;
  } else if (shape && strictness === 'exact') {
    diagnosis.push('wrongRegister');
    message = 'Right voicing, wrong octave';
  } else if ((octaveFree || family) && !shape) {
    diagnosis.push('wrongInversion');
    message = `Right notes, wrong form — asked for ${target.label}`;
    if (matchedVoicing && matchedVoicing !== target) message += `, you played ${matchedVoicing.label}`;
  } else if (chordTonesOk && !family) {
    diagnosis.push('wrongFamily');
    message = `Chord tones fine, but not a ${target.family} voicing`;
  } else {
    if (missingPcs.length) diagnosis.push('missing');
    if (extraPcs.length) diagnosis.push('extra');
    const parts: string[] = [];
    if (missingEssential.length) parts.push(`missing ${missingEssential.map((p) => degreeName(chord, p)).join(', ')}`);
    else if (missingPcs.length) parts.push(`missing ${missingPcs.map((p) => degreeName(chord, p)).join(', ')}`);
    if (outside.length) parts.push(`${outside.map((p) => degreeName(chord, p)).join(', ')} not in chord`);
    else if (extraPcs.length) parts.push(`extra ${extraPcs.map((p) => degreeName(chord, p)).join(', ')}`);
    message = parts.join('; ') || 'Not the chord';
  }
  const v: Verdict = { ok, met, diagnosis, missingPcs, extraPcs, correctNotes, wrongNotes, missedNotes, message };
  if (matchedVoicing) v.matchedVoicing = matchedVoicing;
  return v;
}

// ---------------------------------------------------------------------------
// Identification: what chord is this?
// ---------------------------------------------------------------------------

export interface Identification {
  chord: ChordSymbol;
  score: number;
  /** Family + label if the notes are a known voicing of this chord. */
  family?: string;
  label?: string;
  rootless: boolean;
}

const CLASS_SUFFIX: Record<QualityClass, string> = {
  maj: '', maj6: '6', maj7: 'maj7', min: 'm', min6: 'm6', min7: 'm7', minmaj7: 'mMaj7', dom7: '7', dom7sus: '7sus4',
  alt: '7alt', halfdim: 'm7b5', dim7: 'dim7', aug: '+', aug7: '7#5', sus4: 'sus4', sus2: 'sus2', power: '5',
};

/** Rank plausible chord names for a set of notes. Lowest note as root is preferred; rootless forms allowed. */
export function identify(notes: readonly Midi[], maxResults = 5): Identification[] {
  const sorted = uniqueSorted(notes);
  if (!sorted.length) return [];
  const pcs = [...new Set(sorted.map(pc))] as PitchClass[];
  const lowest = pc(sorted[0]!);
  const results: Identification[] = [];
  const classes = Object.keys(CLASS_SUFFIX) as QualityClass[];
  for (let root = 0; root < 12; root++) {
    for (const qc of classes) {
      const chord = makeChord(root as PitchClass, CLASS_SUFFIX[qc]);
      const t = chordTones(chord);
      const memberSet = new Set(t.memberPcs);
      const allowedSet = new Set(t.allowedPcs);
      const essentialHit = t.essentialPcs.filter((p) => pcs.includes(p)).length;
      const essentialMiss = t.essentialPcs.length - essentialHit;
      const inMembers = pcs.filter((p) => memberSet.has(p)).length;
      const inTensions = pcs.filter((p) => !memberSet.has(p) && allowedSet.has(p)).length;
      const outside = pcs.length - inMembers - inTensions;
      if (essentialMiss > 0 && t.essentialPcs.length > 1) continue;
      if (outside > 0) continue;
      let score = inMembers * 2 + inTensions * 0.5 - essentialMiss * 3;
      const hasRoot = pcs.includes(chord.root);
      if (hasRoot) score += 1.5;
      if (lowest === chord.root) score += 2;
      // prefer simpler names: fewer members not played
      const unplayedMembers = t.memberPcs.filter((p) => !pcs.includes(p)).length;
      score -= unplayedMembers * 0.75;
      if (pcs.length <= 2 && !hasRoot) continue;
      results.push({ chord, score, rootless: !hasRoot });
    }
  }
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, maxResults);
  // annotate with family membership: exact note match wins, else the pc-equivalent voicing closest to what was played
  for (const r of top) {
    let bestDist = Infinity;
    for (const fam of familiesFor(r.chord)) {
      for (const v of generateVoicings(r.chord, fam.id, { lowIntervalLimits: false, maxSpan: 40 })) {
        const vp = voicingPcs(v);
        if (vp.length !== pcs.length || !vp.every((p) => pcs.includes(p))) continue;
        const exact = v.notes.length === sorted.length && v.notes.every((n, i) => n === sorted[i]);
        const dist = exact ? -1 : motionCost(v.notes, sorted);
        if (dist < bestDist) { bestDist = dist; r.family = fam.id; r.label = v.label; }
      }
    }
  }
  return top;
}
