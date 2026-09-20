/**
 * Scan import: OCR words (with boxes) → systems → bars → chart. Pure logic; the OCR engine lives in the app.
 * Robust to the usual OCR confusions in chord symbols.
 */
import { type ChordSymbol, tryParseChord } from './chord.js';

export interface OcrWord { text: string; x: number; y: number; w: number; h: number; confidence?: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface ScannedChord { text: string; chord: ChordSymbol; box: Rect }
export interface ScannedBar { index: number; box: Rect; chords: Array<{ chord: ChordSymbol; beats: number; text: string }>; systemIndex: number }
export interface ScanLayout { systems: Array<{ box: Rect; bars: ScannedBar[] }>; bars: ScannedBar[]; ignored: OcrWord[] }

/** Fix common OCR confusions before parsing: O→0? no — chord text: l→1? We normalise glyphs, not digits. */
export function normalizeOcrChord(t: string): string {
  return t
    .replace(/[|\[\]{}]/g, '')
    .replace(/[’'`´]/g, '')
    .replace(/^([A-G])[bB]/, (m, r) => `${r}b`)          // "Eb" read as "EB"
    .replace(/^([A-G])ь/, '$1b')
    .replace(/[∆△A]7$/, (m) => (m.startsWith('A') && !/^[A-G]/.test(t.slice(0, 1)) ? m : m.replace(/^[∆△A]/, 'Δ')))
    .replace(/^([A-G][#b]?)A7$/, '$1Δ7')                  // "CA7" is usually "CΔ7"
    .replace(/^([A-G][#b]?)m(aj|in)?7b5$/, '$1m7b5')
    .replace(/^([A-G][#b]?)[oO0]7$/, '$1°7')
    .replace(/^([A-G][#b]?)[oO0]$/, '$1°')
    .replace(/^([A-G][#b]?)[øØ0]7?$/, '$1ø')
    .replace(/^([A-G][#b]?)-?7\(?[bB]9\)?$/, '$17b9')
    .replace(/^([A-G][#b]?)[—–]/, '$1-')
    .replace(/[Ss]us/, 'sus')
    .replace(/\s+/g, '');
}

export function ocrWordToChord(w: OcrWord): ChordSymbol | null {
  const raw = w.text.trim();
  if (!raw || raw.length > 12) return null;
  if (!/^[A-G]/.test(raw)) return null;
  // reject plain words like "And", "But", "Bridge", "Coda", "Fine", "Ballad"
  if (/^[A-G][a-z]{2,}$/.test(raw) && !/^(Ab|Bb|Db|Eb|Gb)/.test(raw)) return null;
  if (/^(Fine|Coda|Ab|Bb|Db|Eb|Gb)$/.test(raw) && /^(Fine|Coda)$/.test(raw)) return null;
  const c = tryParseChord(normalizeOcrChord(raw)) ?? tryParseChord(raw);
  if (!c) return null;
  // very short single letters are risky (lyrics "A", "B" section labels) — need some context: accept only if a quality follows or it's 2+ chars with accidental
  if (raw.length === 1) return null;
  return c;
}

/** Cluster words into horizontal systems by vertical proximity. */
export function clusterSystems<T extends OcrWord>(words: T[]): T[][] {
  const sorted = [...words].sort((a, b) => a.y - b.y);
  const systems: T[][] = [];
  const medianH = median(sorted.map((w) => w.h)) || 10;
  for (const w of sorted) {
    const last = systems[systems.length - 1];
    if (last) {
      const cy = last.reduce((s, x) => s + x.y + x.h / 2, 0) / last.length;
      if (Math.abs(w.y + w.h / 2 - cy) < medianH * 1.6) { last.push(w); continue; }
    }
    systems.push([w]);
  }
  return systems.map((s) => s.sort((a, b) => a.x - b.x));
}

function median(xs: number[]): number { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; }

/**
 * Lay out chord words into bars. Without staff detection, every system is assumed to span the page's
 * chord extent and hold `barsPerSystem` equal bars; chords are placed by x, beats by position within the bar.
 */
export function layoutChart(words: OcrWord[], opts: { barsPerSystem?: number; beatsPerBar?: number; pageWidth: number; pageHeight: number }): ScanLayout {
  const barsPerSystem = opts.barsPerSystem ?? 4;
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const chords: Array<OcrWord & { chord: ChordSymbol }> = [];
  const ignored: OcrWord[] = [];
  for (const w of words) { const c = ocrWordToChord(w); if (c) chords.push({ ...w, chord: c }); else ignored.push(w); }
  const systemsWords = clusterSystems(chords);
  if (!systemsWords.length) return { systems: [], bars: [], ignored };
  const left = Math.min(...chords.map((c) => c.x));
  const right = Math.max(...chords.map((c) => c.x + c.w));
  // a chord sits slightly right of its barline; extend the left edge a little so first chords land in bar 1
  const pad = (right - left) * 0.02;
  const x0 = Math.max(0, left - pad), x1 = Math.min(opts.pageWidth, right + pad * 6);
  const barW = (x1 - x0) / barsPerSystem;
  const systems: ScanLayout['systems'] = [];
  const bars: ScannedBar[] = [];
  const medianH = median(chords.map((c) => c.h)) || 10;
  systemsWords.forEach((sw, si) => {
    const top = Math.min(...sw.map((w) => w.y)) - medianH * 0.5;
    const bottom = Math.max(...sw.map((w) => w.y + w.h)) + medianH * 3.5; // include the staff below the symbols
    const sysBars: ScannedBar[] = [];
    for (let b = 0; b < barsPerSystem; b++) {
      const box: Rect = { x: x0 + b * barW, y: top, w: barW, h: bottom - top };
      const inBar = sw.filter((w) => w.x + w.w / 2 >= box.x && w.x + w.w / 2 < box.x + box.w);
      const placed = inBar.map((w) => ({ w, beat: Math.min(beatsPerBar - 1, Math.max(0, Math.round(((w.x - box.x) / box.w) * beatsPerBar))) }));
      // dedupe beats: two chords rounding to the same beat → push the later one right
      placed.sort((a, b) => a.w.x - b.w.x);
      for (let i = 1; i < placed.length; i++) if (placed[i]!.beat <= placed[i - 1]!.beat) placed[i]!.beat = Math.min(beatsPerBar - 1, placed[i - 1]!.beat + 1);
      const bc = placed.map((p, i) => ({ chord: p.w.chord, text: p.w.text, beats: (i + 1 < placed.length ? placed[i + 1]!.beat : beatsPerBar) - p.beat }));
      if (bc.length && placed[0]!.beat > 0) bc[0]!.beats += placed[0]!.beat; // a chord printed a bit late still starts the bar
      const bar: ScannedBar = { index: bars.length, box, chords: bc, systemIndex: si };
      sysBars.push(bar); bars.push(bar);
    }
    systems.push({ box: { x: x0, y: top, w: x1 - x0, h: bottom - top }, bars: sysBars });
  });
  // empty bars inherit the previous chord (as the reader would)
  let last: ScannedBar['chords'] | null = null;
  for (const b of bars) {
    if (!b.chords.length && last) b.chords = last.map((c) => ({ ...c, beats: beatsPerBar / last!.length }));
    if (b.chords.length) last = b.chords;
  }
  return { systems, bars, ignored };
}

/** Chart text (our authoring format) from a layout, so the user can fix it in a textarea. */
export function layoutToChartText(layout: ScanLayout, meta: { title: string; key?: string; composer?: string; timeSig?: [number, number] }): string {
  const head = [`title: ${meta.title}`, meta.composer ? `composer: ${meta.composer}` : '', `key: ${meta.key ?? 'C'} | time: ${(meta.timeSig ?? [4, 4]).join('/')}`].filter(Boolean).join('\n');
  const lines = layout.systems.map((s) => s.bars.map((b) => (b.chords.length ? b.chords.map((c) => (c.beats === 4 || (b.chords.length === 2 && c.beats === 2) ? c.chord.text : `${c.chord.text}:${c.beats}`)).join(' ') : 'N.C.')).join(' | ') + ' |');
  return `${head}\n${lines.join('\n')}\n`;
}
