/** Top-edge beat indicator: n segments, the current beat lit. */
export function BeatPulse({ beats, current, countIn }: { beats: number; current: number; countIn: boolean; bar?: number }) {
  return (
    <div className="flex gap-1.5 h-2.5 w-full">
      {Array.from({ length: beats }, (_, i) => (
        <div key={i} className={`flex-1 rounded-full ${i === current ? (countIn ? 'bg-warn' : i === 0 ? 'bg-accent' : 'bg-ink') : 'bg-line'}`} />
      ))}
    </div>
  );
}
