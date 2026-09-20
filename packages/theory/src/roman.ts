/**
 * Roman numeral ↔ chord in a key. Handles ii-7, V7, IΔ7, bVII7, #iv°7, V7/ii, subV7/V, iiø7.
 */
import { type ChordSymbol, formatChord, parseChord } from './chord.js';
import { type PitchClass, keySpelling, pc, relativeMajor, spellPc } from './pitch.js';

export interface Key { tonic: PitchClass; mode: 'major' | 'minor' }

// Jazz convention: numerals are placed relative to the MAJOR scale of the tonic in both modes,
// so a minor key reads i-7 iiø7 bIIIΔ7 iv-7 V7 bVIΔ7 bVII7.
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export function keyOf(tonicName: string, mode: 'major' | 'minor' = 'major'): Key {
  const c = parseChord(tonicName);
  return { tonic: c.root, mode };
}

export function keyName(key: Key): string {
  return `${spellPc(key.tonic, keySpelling(relativeMajor(key.tonic, key.mode)))}${key.mode === 'minor' ? ' minor' : ''}`;
}

export function scaleOf(_key: Key): number[] {
  return MAJOR_SCALE;
}

/** Default diatonic 7th-chord suffix per (major-scale) degree. */
const MAJOR_DIATONIC = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];
function minorDiatonic(degree: number, acc: number, lower: boolean): string {
  if (degree === 1) return 'm7b5';
  if (lower) return 'm7';
  if (degree === 4 || (degree === 6 && acc === -1)) return '7';
  return acc === -1 ? 'maj7' : '7';
}

/**
 * Parse a roman numeral like "ii-7", "V7", "bVII7", "#iv°7", "V7/ii", "subV7", "IΔ", "iiø7", "iv-6", "I".
 * Suffix after the numeral is parsed by the chord parser; lowercase with no suffix = minor triad, uppercase = major triad.
 * A bare uppercase numeral with "7" gets a dominant 7th; a bare degree with no suffix gets the diatonic 7th when `seventh` is true.
 */
export function romanToChord(numeral: string, key: Key, opts: { seventh?: boolean } = {}): ChordSymbol {
  let s = numeral.trim();
  // secondary: X/Y → X relative to the root of Y
  let target: Key = key;
  const slash = /\/([#b]?[ivIV]+.*)$/.exec(s);
  if (slash) {
    const ofChord = romanToChord(slash[1]!, key);
    target = { tonic: ofChord.root, mode: ofChord.quality === 'min' || ofChord.quality === 'halfdim' ? 'minor' : 'major' };
    s = s.slice(0, slash.index);
  }
  let sub = false;
  if (/^sub/i.test(s)) { sub = true; s = s.slice(3); }
  const m = /^([#b])?(vii|vi|iv|v|iii|ii|i|VII|VI|IV|V|III|II|I)(.*)$/.exec(s);
  if (!m) throw new Error(`Bad roman numeral: ${numeral}`);
  const acc = m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0;
  const num = m[2]!;
  const degree = NUMERALS.indexOf(num.toUpperCase());
  let suffix = m[3]!;
  const scale = scaleOf(target);
  let root = pc(target.tonic + scale[degree]! + acc);
  if (sub) root = pc(root + 6); // tritone substitute
  const lower = num === num.toLowerCase();
  if (suffix === '') {
    if (opts.seventh) suffix = target.mode === 'major' ? MAJOR_DIATONIC[degree]! : minorDiatonic(degree, acc, lower);
    else suffix = lower ? 'm' : '';
  } else if (lower && /^[0-9]/.test(suffix)) {
    // "ii7" → minor 7
    suffix = 'm' + suffix;
  } else if (lower && /^(Δ|maj)/.test(suffix)) {
    suffix = 'm' + suffix; // iΔ7 → minor-major
  }
  // Spelling: an explicit accidental in the numeral wins; otherwise the key's.
  const spelling = acc === 1 ? 'sharp' : acc === -1 ? 'flat' : keySpelling(relativeMajor(key.tonic, key.mode));
  return parseChord(spellPc(root, spelling) + suffix);
}

/** Chord → roman numeral text in a key, e.g. Dm7 in C → "ii-7", Bb7 in C → "bVII7", A7 in C → "VI7". */
export function chordToRoman(chord: ChordSymbol, key: Key): string {
  const scale = scaleOf(key);
  const iv = pc(chord.root - key.tonic);
  let degree = scale.indexOf(iv);
  let acc = '';
  if (degree < 0) {
    // chromatic: prefer flat spelling of the degree above, except #iv
    const upIdx = scale.findIndex((d) => d > iv);
    const flatDeg = upIdx >= 0 ? upIdx : 0;
    if (iv === 6 && key.mode === 'major') { degree = 3; acc = '#'; }
    else { degree = flatDeg; acc = 'b'; }
  }
  const minorish = ['min', 'halfdim', 'dim', 'minmaj'].includes(chord.quality);
  let num = NUMERALS[degree]!;
  if (minorish) num = num.toLowerCase();
  // suffix: reuse the display formatting minus the root
  const text = formatChord(chord, 'realbook');
  let suffix = text.slice(chord.rootName.length);
  if (minorish) suffix = suffix.replace(/^-/, '-');
  return `${acc}${num}${suffix}`;
}

/** Parse a whole progression written in numerals: "ii-7 V7 IΔ7" → chords in key. */
export function romanProgression(text: string, key: Key): ChordSymbol[] {
  return text.trim().split(/\s+/).filter(Boolean).map((n) => romanToChord(n, key, { seventh: true }));
}
