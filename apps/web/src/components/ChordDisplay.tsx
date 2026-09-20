import { formatChord, type ChordSymbol, type DisplayStyle } from '@shed/theory';

/** Render a chord symbol with superscripted quality, e.g. D-7, G7(b9), CΔ7. */
export function chordHtml(c: ChordSymbol, style: DisplayStyle): { root: string; rest: string } {
  const text = formatChord(c, style);
  const root = c.rootName;
  return { root, rest: text.slice(root.length) };
}

export function ChordText({ chord, style = 'realbook', className = '' }: { chord: ChordSymbol; style?: DisplayStyle; className?: string }) {
  const { root, rest } = chordHtml(chord, style);
  const bass = rest.includes('/') ? rest.slice(rest.indexOf('/')) : '';
  const q = bass ? rest.slice(0, rest.indexOf('/')) : rest;
  return (
    <span className={`chord-symbol ${className}`}>
      {root}<sup>{q}</sup>{bass && <span className="opacity-80">{bass}</span>}
    </span>
  );
}
