/**
 * A compact text format for authoring charts:
 *
 *   title: Body and Soul
 *   composer: John Green
 *   key: Db | style: ballad | tempo: 60 | time: 4/4
 *   [A] Ebm7 | Bb7b9 | Ebm7 Ab7 | Dbmaj7 Gb7 |
 *   [B] {  D7 | Gmaj7 | ... }2   <- braces repeat, trailing number = times
 *   1) ... | 2) ...               <- numbered endings (bar-level)
 *   %  repeats the previous bar; N.C. for no chord; chords in a bar share beats equally,
 *   or give explicit beats with a colon:  Dm7:3 G7:1
 *   markers inside a bar: $ segno, @ to-coda, @@ coda, !DS !DC !DSC !DCC !DSF !DCF (jump at end of bar), !fine
 */
import { type ChordSymbol, parseChartToken } from './chord.js';
import { parsePitchName } from './pitch.js';
import type { Bar, BarChord, Song, Style } from './song.js';

export function parseChartText(text: string, id?: string): Song {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const meta: Record<string, string> = {};
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (/^[a-z]+:\s*/i.test(line) && !line.includes('|')) {
      for (const part of line.split(/\s+\|\s+|\s{2,}/)) { const m = /^([a-z]+):\s*(.*)$/i.exec(part.trim()); if (m) meta[m[1]!.toLowerCase()] = m[2]!.trim(); }
    } else if (/^(key|style|tempo|time|title|composer):/i.test(line)) {
      for (const part of line.split(/\s+\|\s+/)) { const m = /^([a-z]+):\s*(.*)$/i.exec(part.trim()); if (m) meta[m[1]!.toLowerCase()] = m[2]!.trim(); }
    } else bodyLines.push(line);
  }
  const timeSig = parseTimeSig(meta['time'] ?? '4/4');
  const keyText = meta['key'] ?? 'C';
  const minor = /-$|m$|min$/.test(keyText);
  const tonic = parsePitchName(keyText.replace(/(-|m|min)$/, '')) ?? 0;
  const bars: Bar[] = [];
  let pendingSection: string | undefined;
  let pendingRepeatStart = false;
  let endingActive: number | undefined;   // current numbered ending
  let firstEndingLen = 0;                  // bars in the first ending; later endings last as long
  let endingRemaining = 0;
  let prevBar: Bar | null = null;
  let beatsPerBar = timeSig[0];

  for (const line of bodyLines) {
    // tokenize by bar lines, keeping section / repeat markers
    const s = line.replace(/\}/g, '}|');   // a closing repeat also ends the bar
    const cells = s.split('|');
    for (let ci = 0; ci < cells.length; ci++) {
      let cell = cells[ci]!.trim();
      if (!cell) continue;
      // section label
      const sec = /^\[([^\]]+)\]\s*/.exec(cell);
      if (sec) { pendingSection = sec[1]!; cell = cell.slice(sec[0].length).trim(); }
      if (cell.startsWith('{')) { pendingRepeatStart = true; cell = cell.slice(1).trim(); }
      const end = /^(\d)\)\s*/.exec(cell);
      if (end) {
        endingActive = +end[1]!; cell = cell.slice(end[0].length).trim();
        if (endingActive === 1) firstEndingLen = 0; else endingRemaining = firstEndingLen || 1;
      }
      let repeatEnd: number | undefined;
      const re = /\}\s*(\d+)?\s*$/.exec(cell);
      if (re) { repeatEnd = re[1] ? +re[1] : 2; cell = cell.slice(0, re.index).trim(); }
      if (!cell) { if (repeatEnd !== undefined && prevBar) prevBar.repeatEnd = repeatEnd; continue; }
      const bar: Bar = { chords: [] };
      const ts = /^T?(\d+)\/(\d+)\s*/.exec(cell);
      if (ts) { bar.timeSig = [+ts[1]!, +ts[2]!]; beatsPerBar = +ts[1]!; cell = cell.slice(ts[0].length).trim(); }
      const tokens = cell.split(/\s+/).filter(Boolean);
      const chordToks: string[] = [];
      for (const tok of tokens) {
        if (tok === '$') bar.segno = true;
        else if (tok === '@@') bar.coda = true;
        else if (tok === '@') bar.toCoda = true;
        else if (tok === '!fine') bar.fine = true;
        else if (tok === '!DS') bar.jump = 'DS';
        else if (tok === '!DC') bar.jump = 'DC';
        else if (tok === '!DSC') bar.jump = 'DS_alCoda';
        else if (tok === '!DCC') bar.jump = 'DC_alCoda';
        else if (tok === '!DSF') bar.jump = 'DS_alFine';
        else if (tok === '!DCF') bar.jump = 'DC_alFine';
        else chordToks.push(tok);
      }
      if (chordToks.length === 1 && chordToks[0] === '%') {
        if (!prevBar) throw new Error('% with no previous bar');
        bar.chords = prevBar.chords.map((c) => ({ ...c }));
      } else {
        const parsed: Array<{ chord: ChordSymbol | null; beats: number | null }> = chordToks.map((tok) => {
          const [sym, b] = tok.split(':');
          const t = parseChartToken(sym!);
          const chord = t.kind === 'chord' ? t.chord : t.kind === 'repeat' ? (prevBar?.chords.at(-1)?.chord ?? null) : null;
          return { chord, beats: b ? +b : null };
        });
        const explicit = parsed.reduce((a, p) => a + (p.beats ?? 0), 0);
        const free = parsed.filter((p) => p.beats === null).length;
        const remaining = Math.max(0, beatsPerBar - explicit);
        const each = free ? remaining / free : 0;
        bar.chords = parsed.map((p): BarChord => ({ chord: p.chord, beats: p.beats ?? each }));
      }
      if (pendingSection) { bar.section = pendingSection; pendingSection = undefined; }
      if (pendingRepeatStart) { bar.repeatStart = true; pendingRepeatStart = false; }
      if (endingActive !== undefined) {
        bar.ending = endingActive;
        if (endingActive === 1) firstEndingLen++;
        else if (--endingRemaining <= 0) endingActive = undefined;
      }
      if (repeatEnd !== undefined) { bar.repeatEnd = repeatEnd; if (endingActive === 1) endingActive = undefined; }
      bars.push(bar);
      prevBar = bar;
    }
  }
  const song: Song = {
    id: id ?? slug(meta['title'] ?? 'untitled'), title: meta['title'] ?? 'Untitled', key: { tonic, mode: minor ? 'minor' : 'major' },
    style: (meta['style'] as Style) ?? 'swing', timeSig, bars, source: 'custom', raw: text,
  };
  if (meta['composer']) song.composer = meta['composer'];
  if (meta['tempo']) song.tempo = +meta['tempo'];
  return song;
}

function parseTimeSig(s: string): [number, number] {
  const m = /^(\d+)\/(\d+)$/.exec(s.trim());
  return m ? [+m[1]!, +m[2]!] : [4, 4];
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Normalized title for catalog lookups: "(Back Home Again in) Indiana" → "back-home-again-in-indiana", "The Girl From Ipanema" → "girl-from-ipanema". */
export function titleKey(title: string): string {
  return slug(title.toLowerCase().replace(/[()]/g, ' ').replace(/^\s*(the|a|an)\s+/, '').replace(/\s*\((?:take|alt|version).*?\)\s*$/, ''));
}
