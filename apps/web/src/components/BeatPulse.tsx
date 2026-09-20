import { useEffect, useRef } from 'react';

/** Top-edge beat indicator: n segments, current beat lit; a bright pulse on each beat. */
export function BeatPulse({ beats, current, countIn, bar }: { beats: number; current: number; countIn: boolean; bar: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('pulse-beat');
    void el.offsetWidth; // restart animation
    el.classList.add('pulse-beat');
  }, [current, bar]);
  return (
    <div className="flex gap-1.5 h-2.5 w-full">
      {Array.from({ length: beats }, (_, i) => (
        <div key={i} ref={i === current ? ref : undefined} className={`flex-1 rounded-full ${i === current ? (countIn ? 'bg-warn' : i === 0 ? 'bg-accent' : 'bg-ink') : 'bg-line'}`} />
      ))}
    </div>
  );
}
