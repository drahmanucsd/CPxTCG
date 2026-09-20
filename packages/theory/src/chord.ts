/**
 * Chord symbols: parsing real-world jazz notation into a normalized model,
 * deriving chord tones / tensions, and formatting back for display.
 */
import { type PitchClass, parsePitchName, pc, spellPc, type Spelling } from './pitch.js';

export type Quality =
  | 'maj' | 'min' | 'dom' | 'halfdim' | 'dim' | 'aug' | 'sus4' | 'sus2' | 'minmaj' | 'power';

export type Alteration = 'b5' | '#5' | 'b9' | '#9' | '#11' | 'b13';

export interface ChordSymbol {
  root: PitchClass;
  /** Root as written, e.g. "Eb" (kept for display / enharmonic fidelity). */
  rootName: string;
  quality: Quality;
  /** Explicit seventh. dom always implies 'min7'; dim with 7 implies 'dim7'. */
  seventh: 'maj7' | 'min7' | 'dim7' | null;
  sixth: boolean;
  /** Natural extensions explicitly written (9, 11, 13). Each implies the 7th. */
  extensions: number[];
  alterations: Alteration[];
  /** "alt" — altered dominant: b9 #9 #11 b13 pool. */
  alt: boolean;
  /** add9 / add11 / add2 / add4 (no 7th implied) */
  adds: number[];
  bass: PitchClass | null;
  bassName: string | null;
  /** Original text as parsed. */
  text: string;
}

/** Quality class: what a voicing template is written for. */
export type QualityClass =
  | 'maj' | 'maj6' | 'maj7' | 'min' | 'min6' | 'min7' | 'minmaj7' | 'dom7' | 'dom7sus' | 'alt'
  | 'halfdim' | 'dim7' | 'aug' | 'aug7' | 'sus4' | 'sus2' | 'power';

export interface ChordTones {
  /** Semitones from root of every explicitly-present chord member (3rd, 5th, 7th, ext…). */
  members: number[];
  /** Semitones from root a voicing must contain to represent the chord (usually 3 & 7). */
  essential: number[];
  /** Tensions that may be added without changing the chord's identity. */
  tensions: number[];
  /** Notes to avoid sustaining (e.g. 11 on maj7 / dom7). */
  avoid: number[];
  /** Pitch classes (absolute) for members ∪ tensions. */
  allowedPcs: PitchClass[];
  memberPcs: PitchClass[];
  essentialPcs: PitchClass[];
  qualityClass: QualityClass;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const ROOT_RE = /^([A-G])([#♯]|[b♭])?/;

function normalizeGlyphs(s: string): string {
  return s
    .replace(/[∆△]/g, 'Δ')
    .replace(/[ØΦ]/g, 'ø')
    .replace(/[º˚]/g, '°')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/–|—/g, '-')
    .replace(/\s+/g, '');
}

export class ChordParseError extends Error {
  constructor(public readonly input: string, message: string) {
    super(`Cannot parse chord "${input}": ${message}`);
  }
}

/** Sentinel results for chart tokens that are not chords. */
export type ChartToken = { kind: 'chord'; chord: ChordSymbol } | { kind: 'nc' } | { kind: 'repeat' };

export function parseChartToken(input: string): ChartToken {
  const t = input.trim();
  if (/^(N\.?C\.?|NC|n\.c\.)$/i.test(t)) return { kind: 'nc' };
  if (t === '%' || t === '𝄎' || t === '/') return { kind: 'repeat' };
  return { kind: 'chord', chord: parseChord(t) };
}

export function tryParseChord(input: string): ChordSymbol | null {
  try {
    return parseChord(input);
  } catch {
    return null;
  }
}

/**
 * Parse a chord symbol. Accepts the common jazz spellings:
 *   Cmaj7 CΔ7 CΔ CM7 Cma7 | C-7 Cm7 Cmin7 Cmi7 | C7 C9 C13 | Cø Cø7 Cm7b5 C-7b5 | C°7 Cdim7 C° Cdim
 *   C6 C-6 C69 C6/9 | Csus Csus4 C7sus4 C9sus C13sus4 Csus2 | Cadd9 C2 | C-Δ7 CmM7 Cm(maj7) CminMaj7
 *   C7alt C7b9 C7(b9) C7(b9,#11) C7#9b13 C7+ C+7 C+ Caug Cmaj7#11 Cmaj7#5 C7b5 C5 | C/E C7/Bb
 */
export function parseChord(input: string): ChordSymbol {
  const text = input.trim();
  let s = normalizeGlyphs(text);
  const rm = ROOT_RE.exec(s);
  if (!rm) throw new ChordParseError(input, 'no root');
  const rootName = rm[1]! + (rm[2] ?? '');
  const root = parsePitchName(rootName)!;
  s = s.slice(rm[0].length);

  // Slash bass: only when the RHS starts with a letter A–G (so "6/9" stays an extension).
  let bass: PitchClass | null = null;
  let bassName: string | null = null;
  const slash = /\/([A-G][#b]?)$/.exec(s);
  if (slash) {
    bassName = slash[1]!;
    bass = parsePitchName(bassName);
    s = s.slice(0, slash.index);
  }

  const c: ChordSymbol = {
    root, rootName, quality: 'maj', seventh: null, sixth: false, extensions: [], alterations: [],
    alt: false, adds: [], bass, bassName, text,
  };

  // Strip decorative parens/commas but keep contents.
  s = s.replace(/[(),]/g, '');

  // --- quality prefix ------------------------------------------------------
  // Order matters: longer / more specific first.
  const qualityRules: Array<[RegExp, (m: RegExpExecArray) => void]> = [
    [/^(m|min|mi|-)(Δ|maj|Maj|MA|M|ma)(7|9|11|13)?/, (m) => { c.quality = 'minmaj'; c.seventh = 'maj7'; if (m[3]) addExt(c, +m[3]); }],
    [/^(Δ|maj|Maj|MA|Ma|ma|M)(7|9|11|13)?/, (m) => { c.quality = 'maj'; c.seventh = 'maj7'; if (m[2]) addExt(c, +m[2]); }],
    [/^(m7b5|-7b5|min7b5)/, () => { c.quality = 'halfdim'; c.seventh = 'min7'; }],
    [/^(ø|h)(7)?/, () => { c.quality = 'halfdim'; c.seventh = 'min7'; }],
    [/^(°|dim|o)(7)?/, (m) => { c.quality = 'dim'; c.seventh = m[2] ? 'dim7' : null; }],
    [/^(aug|\+)(7|9|13)?/, (m) => { c.quality = 'aug'; if (m[2]) { c.seventh = 'min7'; addExt(c, +m[2]); } }],
    [/^(min|mi|m|-)(?![aA])/, () => { c.quality = 'min'; }],
    [/^(7|9|11|13)?sus(4|2)?/, (m) => { c.quality = m[2] === '2' ? 'sus2' : 'sus4'; if (m[1]) { c.seventh = 'min7'; addExt(c, +m[1]); } }],
    [/^5$/, () => { c.quality = 'power'; }],
  ];
  for (const [re, apply] of qualityRules) {
    const m = re.exec(s);
    if (m) { apply(m); s = s.slice(m[0].length); break; }
  }

  // --- numeric body: 6, 69, 7, 9, 11, 13, maj7 after minor, sus after number, alt, alterations, adds
  let guard = 0;
  while (s.length && guard++ < 20) {
    let m: RegExpExecArray | null;
    if ((m = /^(Δ|maj|Maj|M|ma)(7|9|11|13)?/.exec(s))) {
      // e.g. "Cm" + "maj7" (handled above mostly), "C6" + "maj7"? rare. Treat as maj7 flag.
      if (c.quality === 'min') c.quality = 'minmaj';
      c.seventh = 'maj7'; if (m[2]) addExt(c, +m[2]);
    } else if ((m = /^6\/9|^69/.exec(s))) {
      c.sixth = true; c.adds.push(9);
    } else if ((m = /^6/.exec(s))) {
      c.sixth = true;
    } else if ((m = /^(7|9|11|13)/.exec(s))) {
      const n = +m[1]!;
      if (c.quality === 'maj' && c.seventh === null) { c.quality = 'dom'; }
      if (c.quality === 'dim' && n === 7) c.seventh = 'dim7';
      else if (c.seventh === null || c.seventh === 'min7') c.seventh = c.quality === 'dim' ? 'dim7' : c.seventh ?? 'min7';
      if (c.quality === 'dom' || c.quality === 'min' || c.quality === 'halfdim' || c.quality === 'aug' || c.quality === 'sus4' || c.quality === 'sus2') {
        if (c.seventh === null) c.seventh = 'min7';
      }
      if (n > 7) addExt(c, n);
    } else if ((m = /^sus(4|2)?/.exec(s))) {
      // "C7sus4", "C9sus" → dominant sus
      const prevQ = c.quality;
      c.quality = m[1] === '2' ? 'sus2' : 'sus4';
      if (prevQ === 'dom' && c.seventh === null) c.seventh = 'min7';
    } else if ((m = /^alt/.exec(s))) {
      c.alt = true; if (c.seventh === null) c.seventh = 'min7'; if (c.quality === 'maj') c.quality = 'dom';
    } else if ((m = /^add(2|4|9|11|13)/.exec(s))) {
      const n = +m[1]!; c.adds.push(n === 2 ? 9 : n === 4 ? 11 : n);
    } else if ((m = /^(b|-|#|\+)(5|9|11|13)/.exec(s))) {
      const acc = m[1] === 'b' || m[1] === '-' ? 'b' : '#';
      const n = +m[2]!;
      const a = `${acc}${n}` as Alteration;
      if (acc === '#' && n === 13) throw new ChordParseError(input, '#13 is not a thing');
      if (acc === 'b' && n === 11) throw new ChordParseError(input, 'b11 is not a thing');
      if (a === '#5' && c.quality === 'dom') { c.alterations.push('#5'); }
      else if (a === 'b5' && (c.quality === 'min') && c.seventh === 'min7') { c.quality = 'halfdim'; }
      else c.alterations.push(a);
      // an alteration on a plain triad symbol like "C7b9" already set dom above; "Cb9" is weird but accept as dom
      if (c.quality === 'maj' && c.seventh === null && n >= 9) c.quality = 'dom';
      if (n >= 9 && c.seventh === null && c.quality !== 'maj') c.seventh = 'min7';
    } else if ((m = /^(2|4)$/.exec(s))) {
      c.adds.push(m[1] === '2' ? 9 : 11);
    } else if ((m = /^\+$/.exec(s))) {
      c.alterations.push('#5');
    } else {
      throw new ChordParseError(input, `unexpected "${s}"`);
    }
    s = s.slice(m[0].length);
  }
  if (s.length) throw new ChordParseError(input, `unexpected "${s}"`);

  // "C9" with no explicit 7th on a maj quality means dom9.
  if (c.quality === 'maj' && c.seventh === null && c.extensions.length) c.quality = 'dom';
  if (c.quality === 'dom' && c.seventh === null) c.seventh = 'min7';
  if (c.quality === 'aug' && c.extensions.length && c.seventh === null) c.seventh = 'min7';
  c.extensions = [...new Set(c.extensions)].sort((a, b) => a - b);
  c.alterations = [...new Set(c.alterations)];
  c.adds = [...new Set(c.adds)].sort((a, b) => a - b);
  return c;
}

function addExt(c: ChordSymbol, n: number): void {
  if (n === 7) return;
  c.extensions.push(n);
  if (n === 11) c.extensions.push(9);
  if (n === 13) c.extensions.push(9);
}

// ---------------------------------------------------------------------------
// Quality class & chord tones
// ---------------------------------------------------------------------------

export function qualityClass(c: ChordSymbol): QualityClass {
  switch (c.quality) {
    case 'maj':
      if (c.seventh === 'maj7') return 'maj7';
      if (c.sixth) return 'maj6';
      return 'maj';
    case 'min':
      if (c.seventh === 'min7') return 'min7';
      if (c.sixth) return 'min6';
      return 'min';
    case 'minmaj': return 'minmaj7';
    case 'dom':
      if (c.alt) return 'alt';
      if (c.alterations.includes('#5') && !c.alterations.some((a) => a === 'b9' || a === '#9' || a === '#11')) return 'aug7';
      return 'dom7';
    case 'halfdim': return 'halfdim';
    case 'dim': return 'dim7'; // a dim triad in a jazz chart is voiced as dim7
    case 'aug': return c.seventh ? 'aug7' : 'aug';
    case 'sus4': return c.seventh ? 'dom7sus' : 'sus4';
    case 'sus2': return 'sus2';
    case 'power': return 'power';
  }
}

/** Semitone of a scale degree name: '3' 'b3' '#11' etc. Literal (not chord-adapted). */
export const DEGREE_SEMITONES: Record<string, number> = {
  '1': 0, 'b9': 1, '9': 2, '#9': 3, 'b3': 3, '3': 4, '4': 5, '11': 5, '#11': 6, 'b5': 6, '5': 7,
  '#5': 8, 'b13': 8, 'b6': 8, '6': 9, '13': 9, 'bb7': 9, 'b7': 10, '7': 11,
};

export function chordTones(c: ChordSymbol): ChordTones {
  const qc = qualityClass(c);
  const has = (a: Alteration) => c.alterations.includes(a);
  const members = new Set<number>([0]);
  let essential: number[] = [];
  let tensions: number[] = [];
  let avoid: number[] = [];

  // third
  const third = c.quality === 'sus4' ? 5 : c.quality === 'sus2' ? 2 : c.quality === 'power' ? null
    : ['min', 'halfdim', 'dim', 'minmaj'].includes(c.quality) ? 3 : 4;
  if (third !== null) members.add(third);
  // fifth
  let fifth = 7;
  if (c.quality === 'halfdim' || c.quality === 'dim' || has('b5')) fifth = 6;
  if (c.quality === 'aug' || has('#5')) fifth = 8;
  members.add(fifth);
  // seventh / sixth
  const seventh = c.seventh === 'maj7' ? 11 : c.seventh === 'min7' ? 10 : c.seventh === 'dim7' ? 9 : null;
  if (seventh !== null) members.add(seventh);
  if (c.sixth) members.add(9);
  // extensions / alterations / adds
  for (const e of c.extensions) {
    if (e === 9 && !has('b9') && !has('#9')) members.add(2);
    if (e === 11 && !has('#11')) members.add(5);
    if (e === 13 && !has('b13')) members.add(9);
  }
  for (const a of c.alterations) members.add(DEGREE_SEMITONES[a]!);
  for (const a of c.adds) members.add(DEGREE_SEMITONES[String(a)]!);
  if (c.alt) { for (const t of [1, 3, 6, 8]) members.add(t); }

  switch (qc) {
    case 'maj': essential = [4]; tensions = [2, 6, 9, 11]; avoid = [5]; break;
    case 'maj6': essential = [4, 9]; tensions = [2, 6, 11]; avoid = [5]; break;
    case 'maj7': essential = [4, 11]; tensions = [2, 6, 9]; avoid = [5]; break;
    case 'min': essential = [3]; tensions = [2, 5, 9, 10]; avoid = []; break;
    case 'min6': essential = [3, 9]; tensions = [2, 5]; avoid = []; break;
    case 'min7': essential = [3, 10]; tensions = [2, 5, 9]; avoid = []; break;
    case 'minmaj7': essential = [3, 11]; tensions = [2, 5, 9]; avoid = []; break;
    case 'dom7': {
      essential = [4, 10];
      const pool = [2, 1, 3, 6, 9, 8];
      // symbol alterations restrict the natural counterpart
      tensions = pool.filter((t) => {
        if (t === 2 && (has('b9') || has('#9'))) return false;
        if (t === 9 && (has('b13') || has('#5'))) return false;
        if ((t === 1 || t === 3) && c.extensions.includes(9) && !has('b9') && !has('#9')) return false;
        if (t === 8 && c.extensions.includes(13) && !has('b13')) return false;
        return true;
      });
      avoid = [5]; break;
    }
    case 'alt': essential = [4, 10]; tensions = [1, 3, 6, 8]; avoid = [5, 2, 9, 7]; break;
    case 'dom7sus': essential = [5, 10]; tensions = [2, 9]; avoid = [4]; break;
    case 'halfdim': essential = [3, 6, 10]; tensions = [2, 5, 8]; avoid = []; break;
    case 'dim7': essential = [3, 6, 9]; tensions = [2, 5, 8, 11]; avoid = []; break;
    case 'aug': essential = [4, 8]; tensions = [2, 6]; avoid = []; break;
    case 'aug7': essential = [4, 8, 10]; tensions = [2, 3, 1, 6]; avoid = []; break;
    case 'sus4': essential = [5]; tensions = [2, 9, 10]; avoid = [4]; break;
    case 'sus2': essential = [2]; tensions = [9, 10]; avoid = []; break;
    case 'power': essential = [7]; tensions = []; avoid = []; break;
  }
  // essential tones must reflect explicit alterations (e.g. 7#5: the #5 is essential)
  if (has('#5') && qc === 'dom7') essential = [...essential, 8];
  if (has('b5') && qc === 'dom7') essential = [...essential, 6];
  if (qc === 'alt') {
    // the seventh & third are essential, plus the 5th must be altered (any of b5/#5 present in voicing is fine)
    tensions = [1, 3, 6, 8];
  }
  const memberArr = [...members].sort((a, b) => a - b);
  const tensionArr = tensions.filter((t) => !members.has(t));
  const allowed = [...new Set([...memberArr, ...tensionArr])].sort((a, b) => a - b);
  return {
    members: memberArr,
    essential,
    tensions: tensionArr,
    avoid,
    allowedPcs: allowed.map((i) => pc(c.root + i)),
    memberPcs: memberArr.map((i) => pc(c.root + i)),
    essentialPcs: essential.map((i) => pc(c.root + i)),
    qualityClass: qc,
  };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export type DisplayStyle = 'realbook' | 'plain';

/** Format a chord for display. 'realbook' uses Δ - ø °, 'plain' uses maj7 m7 m7b5 dim7. */
export function formatChord(c: ChordSymbol, style: DisplayStyle = 'realbook', spelling?: Spelling): string {
  const root = spelling ? spellPc(c.root, spelling) : c.rootName;
  const rb = style === 'realbook';
  let q = '';
  const ext = c.extensions.length ? Math.max(...c.extensions) : 7;
  switch (c.quality) {
    case 'maj':
      if (c.seventh === 'maj7') q = (rb ? 'Δ' : 'maj') + (ext > 7 ? ext : 7);
      else if (c.sixth) q = c.adds.includes(9) ? '6/9' : '6';
      break;
    case 'min':
      q = rb ? '-' : 'm';
      if (c.seventh === 'min7') q += ext > 7 ? ext : 7;
      else if (c.sixth) q += c.adds.includes(9) ? '6/9' : '6';
      break;
    case 'minmaj': q = (rb ? '-Δ' : 'm(maj') + (ext > 7 ? ext : 7) + (rb ? '' : ')'); break;
    case 'dom': q = String(ext); break;
    case 'halfdim': q = rb ? 'ø' + (ext > 7 ? ext : '') : 'm' + (ext > 7 ? ext : 7) + 'b5'; break;
    case 'dim': q = (rb ? '°' : 'dim') + (c.seventh === 'dim7' ? '7' : ''); break;
    case 'aug': q = (rb ? '+' : 'aug') + (c.seventh ? String(ext) : ''); break;
    case 'sus4': q = (c.seventh ? String(ext) : '') + 'sus4'; break;
    case 'sus2': q = (c.seventh ? String(ext) : '') + 'sus2'; break;
    case 'power': q = '5'; break;
  }
  if (c.alt) q += 'alt';
  const alts = c.alterations.filter((a) => !(a === '#5' && c.quality === 'aug'));
  if (alts.length) q += rb ? `(${alts.join(',')})` : alts.join('');
  const adds = c.adds.filter((a) => !(c.sixth && a === 9));
  if (adds.length) q += adds.map((a) => `add${a}`).join('');
  const bass = c.bass !== null ? `/${spelling ? spellPc(c.bass, spelling) : c.bassName}` : '';
  return `${root}${q}${bass}`;
}

/** Transpose a chord by n semitones, re-spelling the root. */
export function transposeChord(c: ChordSymbol, n: number, spelling: Spelling = 'flat'): ChordSymbol {
  const root = pc(c.root + n);
  const bass = c.bass === null ? null : pc(c.bass + n);
  const out: ChordSymbol = {
    ...c, root, rootName: spellPc(root, spelling), bass, bassName: bass === null ? null : spellPc(bass, spelling),
    extensions: [...c.extensions], alterations: [...c.alterations], adds: [...c.adds],
  };
  out.text = formatChord(out, 'realbook');
  return out;
}

/** Build a chord from parts (used by progression generators). */
export function makeChord(root: PitchClass, suffix: string, spelling: Spelling = 'flat'): ChordSymbol {
  return parseChord(spellPc(root, spelling) + suffix);
}

/** Two chords are the same harmony (ignoring spelling/text). */
export function sameChord(a: ChordSymbol, b: ChordSymbol): boolean {
  return a.root === b.root && a.quality === b.quality && a.seventh === b.seventh && a.sixth === b.sixth
    && a.alt === b.alt && a.bass === b.bass
    && a.extensions.join() === b.extensions.join()
    && [...a.alterations].sort().join() === [...b.alterations].sort().join()
    && a.adds.join() === b.adds.join();
}
