import { TempoControl } from './TempoControl';
import { useSettings } from '../store/settings';

export interface MetronomeConfig {
  bpm: number;
  timeSig: { beats: number; unit: number };
  subdivision: number;
  countInBars: number;
  /** which beats of the bar sound, 0-based; null = all of them */
  clickBeats?: number[] | null;
}

const TIME_SIGS: Array<{ beats: number; unit: number }> = [
  { beats: 4, unit: 4 }, { beats: 3, unit: 4 }, { beats: 2, unit: 4 }, { beats: 5, unit: 4 }, { beats: 6, unit: 8 }, { beats: 12, unit: 8 },
];
const SUBS: Array<{ v: number; label: string }> = [
  { v: 1, label: '♩' }, { v: 2, label: '♪♪' }, { v: 3, label: 'triplets' }, { v: 4, label: '16ths' },
];

/**
 * Where the click sits in the bar.
 *
 * "2 and 4" is the one every jazz teacher asks for: the downbeat stops being handed to you, so
 * holding the form becomes your job. "Beat 2 only" is the same idea turned up — at that point
 * the click is a collaborator rather than a crutch.
 */
const PLACEMENTS: Array<{ id: string; label: string; beats: number[] | null; hint: string }> = [
  { id: 'all', label: 'every beat', beats: null, hint: 'Every beat of the bar clicks.' },
  { id: '24', label: '2 and 4', beats: [1, 3], hint: 'The classic jazz setting: the click is the backbeat, and keeping 1 is on you.' },
  { id: '1', label: 'beat 1', beats: [0], hint: 'One click a bar. You are holding the time; it only checks you.' },
  { id: '2', label: 'beat 2 only', beats: [1], hint: 'One click a bar, and not on the downbeat. Hard, and the fastest way to find out if your time is real.' },
];

function placementId(beats: number[] | null | undefined): string {
  if (!beats) return 'all';
  const k = [...beats].sort().join(',');
  return PLACEMENTS.find((p) => p.beats && [...p.beats].sort().join(',') === k)?.id ?? 'all';
}

/**
 * Every metronome setting in one place: tempo (typed / slider / ±1 / ±5 / tap), time signature,
 * click subdivision, count-in, and how loud the click is.
 *
 * The drill screen opens this over the chord; the editor embeds it. There is no other place in
 * the app that changes a tempo, so there is no "the bpm is here but the +/- is over there".
 */
export function MetronomePanel({ value, onChange, showCountIn = true, showTimeSig = true, showPlacement = true, disabled }: {
  value: MetronomeConfig;
  onChange: (patch: Partial<MetronomeConfig>) => void;
  showCountIn?: boolean;
  showTimeSig?: boolean;
  showPlacement?: boolean;
  disabled?: boolean;
}) {
  const { clickVolume, set } = useSettings();
  const muted = clickVolume === 0;

  return (
    <div className="space-y-4">
      <TempoControl bpm={value.bpm} onChange={(bpm) => onChange({ bpm })} disabled={disabled} />

      {showTimeSig && (
        <Row label="Time">
          {TIME_SIGS.map((ts) => (
            <Seg key={`${ts.beats}/${ts.unit}`} on={value.timeSig.beats === ts.beats && value.timeSig.unit === ts.unit} onClick={() => onChange({ timeSig: ts })}>
              {ts.beats}/{ts.unit}
            </Seg>
          ))}
        </Row>
      )}

      <Row label="Click">
        {SUBS.map((s) => (
          <Seg key={s.v} on={value.subdivision === s.v} onClick={() => onChange({ subdivision: s.v })}>{s.label}</Seg>
        ))}
      </Row>

      {showPlacement && (
        <>
          <Row label="Click on">
            {PLACEMENTS.map((p) => (
              <Seg key={p.id} on={placementId(value.clickBeats) === p.id} onClick={() => onChange({ clickBeats: p.beats })}>{p.label}</Seg>
            ))}
          </Row>
          {placementId(value.clickBeats) !== 'all' && (
            <div className="text-xs text-ink-faint -mt-2 pl-22">{PLACEMENTS.find((p) => p.id === placementId(value.clickBeats))!.hint}</div>
          )}
        </>
      )}

      {showCountIn && (
        <Row label="Count-in">
          {[0, 1, 2].map((n) => (
            <Seg key={n} on={value.countInBars === n} onClick={() => onChange({ countInBars: n })}>{n === 0 ? 'none' : `${n} bar${n > 1 ? 's' : ''}`}</Seg>
          ))}
        </Row>
      )}

      <Row label="Volume">
        <button className="btn btn-ghost !py-1 !px-2 w-14" onClick={() => set({ clickVolume: muted ? 0.6 : 0 })}>{muted ? 'muted' : 'on'}</button>
        <input type="range" min={0} max={1} step={0.05} value={clickVolume} className="flex-1 min-w-24" aria-label="Click volume" onChange={(e) => set({ clickVolume: +e.target.value })} />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="label w-20 shrink-0">{label}</div>
      <div className="flex items-center gap-1 flex-wrap flex-1">{children}</div>
    </div>
  );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`rounded-lg px-2.5 py-1 text-sm ${on ? 'bg-accent/25 text-ink' : 'bg-panel-2 text-ink-dim hover:text-ink'}`} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  );
}
