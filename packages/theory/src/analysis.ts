/**
 * Song analysis: the shape of a tune, so a learner can see they already know most of it.
 *
 * Answers the questions a teacher answers in the first minute with a new standard — what is the
 * form, where does it change key, where are the ii-V-Is, and which eight bars are a repeat of
 * eight bars you already played. See docs/11-platform.md, loop 2 stage 2.
 */
import { type ChordSymbol, qualityClass } from './chord.js';
import { type PitchClass, pc } from './pitch.js';
import { type Key, chordToRoman, keyName } from './roman.js';
import { type FormBar, type Song, formToChords, resolveForm } from './song.js';

export interface Cadence {
  /** form-bar index of the first chord in the cadence */
  from: number;
  to: number;
  /** tonic the cadence points at */
  target: PitchClass;
  minor: boolean;
  /** 'iiV' when it never resolves */
  kind: 'iiVI' | 'iiV' | 'VI';
  label: string;
}

export interface SectionAnalysis {
  label: string;
  from: number;
  to: number;
  bars: number;
  /** the key this section sits in, inferred from its chords */
  key: Key;
  /** label of an earlier section this one duplicates, if any */
  sameAs?: string;
  /** bars that differ from the section it duplicates (form-bar indices) */
  differsAt?: number[];
}

export interface SongAnalysis {
  /** "AABA", "ABAC", "12-bar blues", "AAB"… */
  form: string;
  bars: number;
  sections: SectionAnalysis[];
  cadences: Cadence[];
  /** every distinct key the tune passes through, most-used first */
  keys: Array<{ key: Key; bars: number }>;
  /** one line a player can read before they start */
  summary: string;
}

const isMin7 = (c: ChordSymbol) => qualityClass(c) === 'min7';
const isDom = (c: ChordSymbol) => { const q = qualityClass(c); return q === 'dom7' || q === 'alt' || q === 'dom7sus'; };
const isTonic = (c: ChordSymbol) => ['maj7', 'maj6', 'maj'].includes(qualityClass(c));
const isMinTonic = (c: ChordSymbol) => ['min7', 'min6', 'minmaj7', 'min'].includes(qualityClass(c));
const isHalfDim = (c: ChordSymbol) => qualityClass(c) === 'halfdim';

/**
 * Every chord in playing order, not one per bar. A ii-V is very often two chords inside a single
 * bar ("Cm7 F7 |"), so analysing bar-firsts finds none of them in rhythm changes.
 */
function allChords(form: FormBar[]): Array<{ formIndex: number; chord: ChordSymbol }> {
  return formToChords(form).map((c) => ({ formIndex: c.formIndex, chord: c.chord }));
}

/**
 * ii-V-I detection over the flat chord stream. Works on consecutive chords rather than bars, so
 * it catches two-per-bar ii-Vs as well as one-per-bar.
 */
export function findCadences(chords: Array<{ chord: ChordSymbol; formIndex: number }>): Cadence[] {
  const out: Cadence[] = [];
  for (let i = 0; i < chords.length - 1; i++) {
    const a = chords[i]!, b = chords[i + 1]!;
    const two = isMin7(a.chord) || isHalfDim(a.chord);
    if (!two || !isDom(b.chord)) continue;
    // ii and V a fourth apart
    if (pc(b.chord.root - a.chord.root) !== 5) continue;
    const target = pc(b.chord.root + 5) as PitchClass;
    const c = chords[i + 2];
    const resolves = c && c.chord.root === target && (isTonic(c.chord) || isMinTonic(c.chord));
    const minor = isHalfDim(a.chord) || (!!resolves && isMinTonic(c!.chord));
    out.push({
      from: a.formIndex,
      to: resolves ? c!.formIndex : b.formIndex,
      target,
      minor,
      kind: resolves ? 'iiVI' : 'iiV',
      label: `ii-V${resolves ? '-I' : ''} in ${keyName({ tonic: target, mode: minor ? 'minor' : 'major' })}`,
    });
    if (resolves) i += 2; else i += 1;
  }
  return out;
}

/** The key a run of chords sits in: score every tonic by how much cadential evidence points at it. */
export function inferKey(chords: ChordSymbol[], fallback: Key): Key {
  if (!chords.length) return fallback;
  const score = new Map<number, number>();
  const bump = (t: number, n: number, minor: boolean) => {
    const k = t * 2 + (minor ? 1 : 0);
    score.set(k, (score.get(k) ?? 0) + n);
  };
  for (let i = 0; i < chords.length; i++) {
    const c = chords[i]!;
    if (isTonic(c)) bump(c.root, 3, false);
    if (isMinTonic(c)) bump(c.root, 2, true);
    if (isDom(c)) bump(pc(c.root + 5), 2, false);
    if (isMin7(c)) bump(pc(c.root + 10), 1, false);
    if (isHalfDim(c)) bump(pc(c.root + 10), 1, true);
  }
  // A run of dominants (the rhythm-changes bridge: D7 G7 C7 F7) points at four tonics equally.
  // Break the tie toward the written key, so that bridge reads III7-VI7-II7-V7 in Bb rather than
  // modulating to whichever dominant happened to be enumerated first.
  const home = fallback.tonic * 2 + (fallback.mode === 'minor' ? 1 : 0);
  score.set(home, (score.get(home) ?? 0) + 1.5);
  let best = home;
  let bestN = -1;
  for (const [k, n] of score) if (n > bestN) { best = k; bestN = n; }
  return { tonic: Math.floor(best / 2) as PitchClass, mode: best % 2 ? 'minor' : 'major' };
}

/** A section's chord signature, for spotting "the second A is the first A with a different ending". */
function signature(form: FormBar[], from: number, to: number): string[] {
  return form.slice(from, to + 1).map((b) => b.chords.map((c) => (c.chord ? `${c.chord.root}:${qualityClass(c.chord)}` : '-')).join(','));
}

/** Name the form from the section labels: A A B A → "AABA". */
function formName(labels: string[], bars: number): string {
  if (!labels.length) return `${bars} bars`;
  const letters = labels.map((l) => l.trim()[0]?.toUpperCase() ?? '?').join('');
  if (bars === 12 && new Set(letters).size <= 2) return '12-bar blues';
  return letters;
}

export function analyzeSong(song: Song): SongAnalysis {
  const form = resolveForm(song);
  const flat = allChords(form);

  // sections: contiguous runs sharing a label; unlabelled charts become one section
  const ranges: Array<{ label: string; from: number; to: number }> = [];
  for (const b of form) {
    const label = b.section ?? (ranges.length ? ranges[ranges.length - 1]!.label : 'A');
    const last = ranges[ranges.length - 1];
    if (last && last.label === label && b.section === undefined) last.to = b.formIndex;
    else if (b.section !== undefined || !last) ranges.push({ label, from: b.formIndex, to: b.formIndex });
    else last.to = b.formIndex;
  }

  const seen = new Map<string, { label: string; sig: string[] }>();
  const sections: SectionAnalysis[] = ranges.map((r) => {
    const sig = signature(form, r.from, r.to);
    const chords = flat.filter((c) => c.formIndex >= r.from && c.formIndex <= r.to).map((c) => c.chord);
    const key = inferKey(chords, song.key);
    const joined = sig.join('|');
    let sameAs: string | undefined;
    let differsAt: number[] | undefined;
    for (const [k, prev] of seen) {
      if (k === joined) { sameAs = prev.label; break; }
      if (prev.sig.length === sig.length) {
        const diff = sig.map((x, i) => (x === prev.sig[i] ? -1 : r.from + i)).filter((x) => x >= 0);
        // "the same eight bars except the last one or two"
        if (diff.length && diff.length <= Math.max(1, Math.floor(sig.length / 4))) { sameAs = prev.label; differsAt = diff; break; }
      }
    }
    if (!seen.has(joined)) seen.set(joined, { label: r.label, sig });
    return { label: r.label, from: r.from, to: r.to, bars: r.to - r.from + 1, key, ...(sameAs ? { sameAs } : {}), ...(differsAt ? { differsAt } : {}) };
  });

  const cadences = findCadences(flat);

  const keyCount = new Map<string, { key: Key; bars: number }>();
  for (const s of sections) {
    const id = `${s.key.tonic}:${s.key.mode}`;
    const e = keyCount.get(id) ?? { key: s.key, bars: 0 };
    e.bars += s.bars;
    keyCount.set(id, e);
  }
  const keys = [...keyCount.values()].sort((a, b) => b.bars - a.bars);

  const form_ = formName(sections.map((s) => s.label), form.length);
  const repeated = sections.filter((s) => s.sameAs).length;
  const summary = [
    `${form.length} bars`,
    form_ !== `${form.length} bars` ? form_ : null,
    keys.length > 1 ? `${keys.length} key centres (${keys.map((k) => keyName(k.key)).join(', ')})` : `in ${keyName(keys[0]?.key ?? song.key)}`,
    cadences.length ? `${cadences.length} ii-V${cadences.some((c) => c.kind === 'iiVI') ? '-I' : ''}${cadences.length > 1 ? 's' : ''}` : null,
    repeated ? `${repeated} section${repeated > 1 ? 's repeat' : ' repeats'} material you have already played` : null,
  ].filter(Boolean).join(' · ');

  return { form: form_, bars: form.length, sections, cadences, keys, summary };
}

/** Roman numerals per form bar, relative to the local section key rather than the tune's key. */
export function romanPerBar(song: Song, analysis: SongAnalysis): Array<string | null> {
  const form = resolveForm(song);
  return form.map((b) => {
    const sec = analysis.sections.find((s) => b.formIndex >= s.from && b.formIndex <= s.to);
    const first = b.chords.find((c) => c.chord);
    if (!first?.chord || !sec) return null;
    return chordToRoman(first.chord, sec.key);
  });
}
