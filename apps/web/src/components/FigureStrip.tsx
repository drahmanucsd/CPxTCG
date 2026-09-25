import type { FigureVerdict } from '@shed/theory';

/**
 * Where the figure goes, and where you put it.
 *
 * Rings on the top row are the figure; dots underneath are your notes, drawn at the position you
 * actually played. A flattened push is then unmistakable without reading a number: the ring sits
 * on the "and" of 4 and your dot is over the bar line on the 1.
 */
export function FigureStrip({
  expected, verdict, beatsPerBar = 4, offBeat = 0.66, live,
}: {
  /** hit positions in beats from the start of the phrase */
  expected: number[];
  verdict?: FigureVerdict | null;
  beatsPerBar?: number;
  /** where an off-beat sits, as a fraction of a beat */
  offBeat?: number;
  /** placements played so far, for the live view before a verdict exists */
  live?: number[];
}) {
  const total = Math.max(beatsPerBar, Math.ceil(Math.max(...expected, 0) + 1));
  const bars = Math.ceil(total / beatsPerBar);
  const W = 640, H = 88, padL = 14, padR = 14;
  const x = (beat: number) => padL + (beat / (bars * beatsPerBar)) * (W - padL - padR);
  const yWant = 30, yGot = 64;

  const tone = (v: string) =>
    v === 'clean' ? 'var(--color-good)' : v === 'flattened' ? 'var(--color-bad)' : v === 'missed' ? '#5b6570' : 'var(--color-warn)';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 110 }} role="img" aria-label="figure placement">
      {/* the grid: solid at the beat, faint at the off-beat, heavy at the bar line */}
      {Array.from({ length: bars * beatsPerBar }, (_, b) => (
        <g key={b}>
          <line
            x1={x(b)} y1={14} x2={x(b)} y2={H - 14}
            stroke={b % beatsPerBar === 0 ? 'var(--color-line)' : 'var(--color-line)'}
            strokeWidth={b % beatsPerBar === 0 ? 1.6 : 0.8}
            opacity={b % beatsPerBar === 0 ? 1 : 0.5}
          />
          <line x1={x(b + offBeat)} y1={22} x2={x(b + offBeat)} y2={H - 22} stroke="var(--color-line)" strokeWidth={0.8} strokeDasharray="2 3" opacity={0.6} />
          <text x={x(b) + 3} y={12} fontSize={9} fill="#5b6570">{(b % beatsPerBar) + 1}</text>
          <text x={x(b + offBeat) + 2} y={12} fontSize={8} fill="#3f4854">&amp;</text>
        </g>
      ))}
      <line x1={x(bars * beatsPerBar)} y1={14} x2={x(bars * beatsPerBar)} y2={H - 14} stroke="var(--color-line)" strokeWidth={1.6} />

      {/* the figure */}
      {expected.map((b, i) => {
        const h = verdict?.hits[i];
        return <circle key={`w${i}`} cx={x(b)} cy={yWant} r={5} fill="none" stroke={h ? tone(h.verdict) : 'var(--color-accent)'} strokeWidth={2} strokeDasharray={h?.verdict === 'missed' ? '2 2' : undefined} />;
      })}

      {/* what you played */}
      {verdict
        ? verdict.hits.map((h, i) =>
            h.playedBeat === null ? null : (
              <g key={`g${i}`}>
                <line x1={x(h.beat)} y1={yWant + 6} x2={x(h.playedBeat)} y2={yGot - 6} stroke={tone(h.verdict)} strokeWidth={1.2} opacity={0.7} />
                <circle cx={x(h.playedBeat)} cy={yGot} r={4.5} fill={tone(h.verdict)} />
              </g>
            ),
          )
        : (live ?? []).map((b, i) => <circle key={`l${i}`} cx={x(b)} cy={yGot} r={4.5} fill="var(--color-accent)" opacity={0.8} />)}

      <text x={padL} y={H - 2} fontSize={9} fill="#5b6570">the figure</text>
      <text x={W - padR} y={H - 2} fontSize={9} textAnchor="end" fill="#5b6570">what you played</text>
    </svg>
  );
}
