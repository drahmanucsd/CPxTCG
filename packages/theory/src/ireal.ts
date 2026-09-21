/**
 * iReal Pro import: irealbook:// and irealb:// URLs (single songs or playlists), and exported HTML.
 */
import { type ChordSymbol, tryParseChord } from './chord.js';
import { parsePitchName } from './pitch.js';
import { slug } from './chartText.js';
import type { Bar, BarChord, Song, Style } from './song.js';

/** Undo the irealb:// 50-character block scramble. */
export function unscramble(s: string): string {
  let r = '';
  while (s.length > 50) {
    const p = s.slice(0, 50);
    s = s.slice(50);
    r += s.length < 2 ? p : obfusc50(p);
  }
  return r + s;
}
function obfusc50(s: string): string {
  const a = s.split('');
  for (let i = 0; i < 5; i++) { a[49 - i] = s[i]!; a[i] = s[49 - i]!; }
  for (let i = 10; i < 24; i++) { a[49 - i] = s[i]!; a[i] = s[49 - i]!; }
  return a.join('');
}

const STYLE_MAP: Array<[RegExp, Style]> = [
  [/bossa|samba|latin|afro|calypso|chacha|mambo|salsa|cuban/i, 'bossa'], [/ballad/i, 'ballad'], [/waltz|3\/4/i, 'waltz'],
  [/funk|rock|pop|even|straight|fusion|reggae|hip|r&b|shuffle|blues/i, 'straight'], [/swing|bebop|up|medium|gypsy|dixie|jazz/i, 'swing'],
];

export function irealStyle(s: string): Style {
  for (const [re, st] of STYLE_MAP) if (re.test(s)) return st;
  return 'swing';
}

/** Parse an iReal Pro URL (or HTML containing them) into songs. Unparseable songs are skipped with a reason. */
export function importIReal(text: string): { songs: Song[]; errors: string[] } {
  const songs: Song[] = [];
  const errors: string[] = [];
  const urls: string[] = [];
  const hrefRe = /href="(ireal(?:book|b):\/\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(text))) urls.push(decodeHtml(m[1]!));
  if (!urls.length) { const t = text.trim(); if (/^ireal(book|b):\/\//.test(t)) urls.push(t); }
  if (!urls.length) return { songs, errors: ['No irealbook:// or irealb:// link found'] };
  for (const url of urls) {
    const isB = url.startsWith('irealb://');
    const body = decodeURIComponent(url.replace(/^ireal(book|b):\/\//, '').replace(/\+/g, ' '));
    // playlists end with "===PlaylistName"
    const parts = body.split('===');
    for (const part of parts) {
      if (!part.includes('=')) continue;
      try {
        const s = isB ? parseIrealb(part) : parseIrealbook(part);
        if (s) songs.push(s);
      } catch (e) { errors.push(`${part.split('=')[0]}: ${(e as Error).message}`); }
    }
  }
  return { songs, errors };
}

function decodeHtml(s: string): string { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }

function parseIrealbook(part: string): Song | null {
  // Title=Composer=Style=Key=n=chords
  const f = part.split('=');
  if (f.length < 6) return null;
  const [title, composer, style, key] = f;
  const chords = f.slice(5).join('=');
  return build(title!, composer!, style!, key!, chords, part);
}

function parseIrealb(part: string): Song | null {
  // Title=Composer==Style=Key=n=1r34LbKcu7<scrambled>=... (fields after the chords vary: transpose, comp style, bpm, repeats)
  const f = part.split('=');
  if (f.length < 6) return null;
  const title = f[0]!, composer = f[1]!;
  const style = f[3] ?? '', key = f[4] ?? 'C';
  const idx = part.indexOf('1r34LbKcu7');
  if (idx < 0) return null;
  const rest = part.slice(idx + '1r34LbKcu7'.length);
  const scrambled = rest.split('=')[0]!;
  const tail = rest.split('=').slice(1);
  let chords = unscramble(scrambled);
  chords = chords.replace(/XyQ/g, '   ').replace(/LZ/g, ' |').replace(/Kcl/g, '| x');
  const song = build(title, composer, style, key, chords, part);
  if (song && tail[2] && +tail[2] > 0) song.tempo = +tail[2];
  return song;
}

function build(title: string, composer: string, styleText: string, keyText: string, chords: string, raw: string): Song {
  const minor = /-$/.test(keyText);
  const tonic = parsePitchName(keyText.replace(/-$/, '')) ?? 0;
  const bars = parseIrealChords(chords);
  const timeSig = bars.find((b) => b.timeSig)?.timeSig ?? [4, 4];
  const song: Song = {
    id: `ireal-${slug(title)}-${slug(composer || '')}`.replace(/-+$/, ''), title: title.trim(), key: { tonic, mode: minor ? 'minor' : 'major' },
    style: irealStyle(styleText), timeSig, bars, source: 'ireal', raw, tags: [styleText],
  };
  if (composer.trim()) song.composer = flipName(composer.trim());
  return song;
}

/** iReal stores "Last First"; show "First Last". */
function flipName(s: string): string {
  const p = s.split(' ');
  return p.length === 2 ? `${p[1]} ${p[0]}` : s;
}

/** Map iReal chord spelling onto ours. */
export function irealChordToText(t: string): string {
  return t
    .replace(/\^/g, 'maj').replace(/h7?/g, 'ø').replace(/o(7)?(?![a-z])/g, '°$1')
    .replace(/W/g, '');
}

/**
 * Parse the iReal chord string into bars. Cells: each chord token and each single space is one cell;
 * a bar's cells are scaled to its beats.
 */
export function parseIrealChords(text: string): Bar[] {
  let s = text;
  s = s.replace(/<[^>]*>/g, '');        // comments/text
  s = s.replace(/[lsUY]/g, (ch) => (ch === 'U' || ch === 'Y' ? ' ' : ''));      // size markers, end, vertical space
  s = s.replace(/\([^)]*\)/g, '');       // alternate chords
  const bars: Bar[] = [];
  let timeSig: [number, number] = [4, 4];
  let pending: Partial<Bar> = {};
  let cur: string[] = [];               // cells of the current bar (chord token or '')
  const st: { prev: Bar | null; prev2: Bar | null } = { prev: null, prev2: null };
  let i = 0;
  let endingActive: number | undefined;
  let firstEndingLen = 0;
  let endingRemaining = 0;

  const flush = (extra: Partial<Bar> = {}) => {
    if (!cur.some((c) => c !== '' && c !== undefined)) {
      // empty bar contents (e.g. "|}" right after a barline): a repeat end belongs to the previous bar
      if (extra.repeatEnd !== undefined && st.prev) { st.prev.repeatEnd = extra.repeatEnd; if (endingActive === 1) endingActive = undefined; }
      else if (Object.keys(extra).length) pending = { ...pending, ...extra };
      cur = [];
      return;
    }
    const prev = st.prev, prev2 = st.prev2;
    const bar: Bar = { chords: cellsToChords(cur, timeSig[0], prev), ...pending, ...extra };
    if (endingActive !== undefined) {
      bar.ending = endingActive;
      if (endingActive === 1) firstEndingLen++;
      else if (--endingRemaining <= 0) endingActive = undefined;
    }
    if (extra.repeatEnd !== undefined && endingActive === 1) endingActive = undefined;
    if (cur.length === 1 && cur[0] === 'x' && prev) bar.chords = prev.chords.map((c) => ({ ...c }));
    if (cur.length === 1 && cur[0] === 'r' && prev2 && prev) {
      // repeat previous two bars: this bar = bar-2, next bar = bar-1
      bar.chords = prev2.chords.map((c) => ({ ...c }));
      bars.push(bar);
      const bar2: Bar = { chords: prev.chords.map((c) => ({ ...c })) };
      st.prev2 = bar; st.prev = bar2; bars.push(bar2); pending = {}; cur = [];
      return;
    }
    bars.push(bar);
    st.prev2 = prev; st.prev = bar; pending = {}; cur = [];
  };

  while (i < s.length) {
    const ch = s[i]!;
    if (ch === '|' || ch === '[' || ch === ']' || ch === 'Z') { flush(); i++; continue; }
    if (ch === '{') { flush(); pending.repeatStart = true; i++; continue; }
    if (ch === '}') { flush({ repeatEnd: 2 }); i++; continue; }
    if (ch === 'T' && /\d\d/.test(s.slice(i + 1, i + 3))) { timeSig = [+s[i + 1]!, +s[i + 2]!]; pending.timeSig = timeSig; i += 3; continue; }
    if (ch === '*' && s[i + 1]) { pending.section = s[i + 1]!.toUpperCase(); i += 2; continue; }
    if (ch === 'N' && /\d/.test(s[i + 1] ?? '')) {
      flush();
      endingActive = +s[i + 1]!;
      if (endingActive === 1) firstEndingLen = 0; else endingRemaining = firstEndingLen || 1;
      i += 2; continue;
    }
    if (ch === 'S') { pending.segno = true; i++; continue; }
    if (ch === 'Q') {
      // first coda sign = "to coda" (attached to the bar before it), second = the coda itself (next bar)
      flush();
      const seen = bars.some((b) => b.toCoda);
      if (!seen && st.prev) st.prev.toCoda = true; else pending.coda = true;
      i++; continue;
    }
    if (ch === 'f') { pending.fine = true; i++; continue; }
    if (ch === ' ') { cur.push(''); i++; continue; }
    if (ch === ',') { i++; continue; }
    if (ch === 'x' || ch === 'r' || ch === 'p' || ch === 'n') { cur.push(ch); i++; continue; }
    // chord token: root letter + anything up to space/bar/marker
    const m = /^[A-G][^\s|[\]{}ZTSQNfxrpnl*<(,]*/.exec(s.slice(i));
    if (m) { cur.push(m[0]); i += m[0].length; continue; }
    i++; // unknown char
  }
  flush();
  // a "to coda" with no coda: treat it as the coda marker itself being absent — leave as is
  return bars;
}

function cellsToChords(cells: string[], beatsPerBar: number, prev: Bar | null): BarChord[] {
  // collapse: each chord token consumes its cell plus following empty cells
  const items: Array<{ tok: string; cells: number }> = [];
  for (const c of cells) {
    if (c === '' || c === undefined) { if (items.length) items[items.length - 1]!.cells++; }
    else items.push({ tok: c, cells: 1 });
  }
  if (!items.length) return [{ chord: null, beats: beatsPerBar }];
  const total = items.reduce((a, it) => a + it.cells, 0);
  let out: BarChord[];
  if (total <= beatsPerBar) {
    out = items.map((it) => ({ chord: tokToChord(it.tok, prev), beats: it.cells }));
    out[out.length - 1]!.beats += beatsPerBar - total; // pad last
  } else {
    // more cells than beats: the spaces were separators, not empty cells — split the bar equally
    out = items.map((it) => ({ chord: tokToChord(it.tok, prev), beats: beatsPerBar / items.length }));
  }
  // merge consecutive 'p' (same chord) placeholders
  const merged: BarChord[] = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    if (last && c.chord === last.chord && c.chord === null) last.beats += c.beats;
    else if (last && c.chord && last.chord && c.chord.text === last.chord.text && c.chord === last.chord) last.beats += c.beats;
    else merged.push(c);
  }
  return merged;
}

let lastChord: ChordSymbol | null = null;
function tokToChord(tok: string, prev: Bar | null): ChordSymbol | null {
  if (tok === 'n') return null;
  if (tok === 'p' || tok === 'x' || tok === 'r') return lastChord ?? prev?.chords.at(-1)?.chord ?? null;
  const c = tryParseChord(irealChordToText(tok));
  if (c) lastChord = c;
  return c;
}
