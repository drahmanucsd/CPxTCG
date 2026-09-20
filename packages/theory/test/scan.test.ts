import { describe, expect, it } from 'vitest';
import { clusterSystems, layoutChart, layoutToChartText, normalizeOcrChord, ocrWordToChord, type OcrWord } from '../src/scan.js';
import { parseChartText } from '../src/chartText.js';
import { formatChord } from '../src/chord.js';

const w = (text: string, x: number, y: number, wd = 40, h = 14): OcrWord => ({ text, x, y, w: wd, h });

describe('scan layout', () => {
  it('normalises OCR confusions', () => {
    expect(normalizeOcrChord('CA7')).toBe('CΔ7');
    expect(normalizeOcrChord('EB7')).toBe('Eb7');
    expect(normalizeOcrChord('Co7')).toBe('C°7');
    expect(normalizeOcrChord('D–7')).toBe('D-7');
    expect(ocrWordToChord(w('Bridge', 0, 0))).toBeNull();
    expect(ocrWordToChord(w('And', 0, 0))).toBeNull();
    expect(ocrWordToChord(w('A', 0, 0))).toBeNull();
    expect(formatChord(ocrWordToChord(w('Ebmaj7', 0, 0))!, 'plain')).toBe('Ebmaj7');
  });
  it('clusters words into systems by y', () => {
    const sys = clusterSystems([w('C7', 10, 100), w('F7', 300, 102), w('G7', 10, 300), w('C7', 300, 299)]);
    expect(sys).toHaveLength(2);
    expect(sys[0]!.map((x) => x.text)).toEqual(['C7', 'F7']);
  });
  it('lays out a two-system chart into 4-bar systems with beats from position', () => {
    // page 1000 wide; 4 bars of 240px each from x=20
    const words: OcrWord[] = [
      w('Dm7', 25, 100), w('G7', 145, 100), w('Cmaj7', 265, 100), w('A7', 505, 100),        // bar1: Dm7 G7 (2+2), bar2: Cmaj7, bar3: A7, bar4: empty→A7
      w('Dm7', 25, 300), w('G7', 265, 300), w('Cmaj7', 505, 300), w('Am7', 745, 300), w('D7', 865, 300),
      w('Bridge', 400, 200), w('lyrics', 30, 130),
    ];
    const layout = layoutChart(words, { barsPerSystem: 4, pageWidth: 1000, pageHeight: 1400 });
    expect(layout.systems).toHaveLength(2);
    expect(layout.bars).toHaveLength(8);
    const bar = (i: number) => layout.bars[i]!.chords.map((c) => `${formatChord(c.chord, 'plain')}:${c.beats}`).join(' ');
    expect(bar(0)).toBe('Dm7:2 G7:2');
    expect(bar(1)).toBe('Cmaj7:4');
    expect(bar(2)).toBe('A7:4');
    expect(bar(3)).toBe('A7:4');
    expect(bar(7)).toBe('Am7:2 D7:2');
    expect(layout.ignored.map((x) => x.text)).toEqual(['Bridge', 'lyrics']);
    const text = layoutToChartText(layout, { title: 'Scan', key: 'C' });
    const song = parseChartText(text);
    expect(song.bars).toHaveLength(8);
    expect(song.bars[0]!.chords.map((c) => c.beats)).toEqual([2, 2]);
  });
});
