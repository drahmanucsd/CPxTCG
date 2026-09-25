import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { MelodyRun, type LiveNote, type MelodyRunReport } from '@shed/engine';
import { resolveForm, type Song, type Subdivision } from '@shed/theory';
import { getAudio, unlockAudio } from '../audio/context';
import { onMidiNote, startMidi, useComputerKeyboardPiano } from '../midi/midiService';
import { useSettings } from '../store/settings';
import { db } from '../db';
import { loadSong } from '../lib/songs';
import { BackLink } from '../components/BackLink';
import { BeatPulse } from '../components/BeatPulse';
import { ChordGrid, formBars } from '../components/ChordGrid';
import { MetronomePanel, type MetronomeConfig } from '../components/MetronomePanel';
import { TimingReportView } from '../components/TimingReportView';

/**
 * Play the head against the click, then find out where it actually sat.
 *
 * The metronome tells you *that* you were off. It cannot tell you whether you were off the same
 * way every time (a lay-back, which is a choice) or off at random (unsteady, which is the
 * problem), whether your eighths were really swung, or whether you sped up. That is the whole
 * point of this screen — see docs/13-melody-timing.md.
 *
 * Nothing is failed here. The run records and then talks.
 */
export default function Melody() {
  const { songId } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const cfg = settings.melodyRun;
  const [song, setSong] = useState<Song | null>(null);
  const [bpm, setBpm] = useState(120);
  const [state, setState] = useState<'idle' | 'countIn' | 'running' | 'ended'>('idle');
  const [beat, setBeat] = useState({ bar: 0, beat: 0, countIn: false, index: -1 });
  const [live, setLive] = useState<LiveNote[]>([]);
  const [report, setReport] = useState<MelodyRunReport | null>(null);
  const [showChart, setShowChart] = useState(true);
  const [setup, setSetup] = useState(false);
  const runRef = useRef<MelodyRun | null>(null);
  const offRef = useRef<(() => void) | null>(null);
  /** set when the screen unmounts mid-run: the transport still has to be stopped, but a
   *  half-finished take is noise in the history and nothing may touch React state. */
  const abandoned = useRef(false);
  useComputerKeyboardPiano(state === 'running' || state === 'countIn', 3);

  const id = songId ? decodeURIComponent(songId) : null;
  useEffect(() => {
    if (!id) return;
    void loadSong(id).then((s) => { setSong(s); if (s?.tempo) setBpm(s.tempo); });
  }, [id]);

  const stored = useLiveQuery(async () => (id ? await db.melodies.get(id) : undefined), [id]);
  const takes = useLiveQuery(
    async () => (id ? (await db.takes.where('songId').equals(id).sortBy('at')).reverse() : await db.takes.orderBy('at').reverse().limit(12).toArray()),
    [id],
  ) ?? [];

  const form = useMemo(() => (song ? resolveForm(song) : []), [song]);
  const beatsPerBar = song?.timeSig[0] ?? 4;
  const formBeats = useMemo(
    () => (form.length ? form.reduce((a, b) => a + b.chords.reduce((x, c) => x + c.beats, 0), 0) : 16 * beatsPerBar),
    [form, beatsPerBar],
  );
  const barsPerChorus = form.length || 16;
  const totalBars = barsPerChorus * Math.max(1, cfg.choruses);

  /** Every run is kept, so "is my time getting better" has an answer rather than an impression. */
  const save = useCallback(async (r: MelodyRunReport) => {
    if (!r.timing.count) return;
    await db.takes.add({
      songId: id ?? '', title: r.spec.title, at: Date.now(),
      bpm: r.spec.bpm, swing: r.spec.swing, clickBeats: r.spec.clickBeats, bars: r.bars,
      steadiness: r.timing.steadiness, spreadMs: r.timing.spreadMs, medianMs: r.timing.medianMs,
      playedBpm: r.timing.playedBpm, swingRatio: r.timing.swing?.ratio ?? null,
      melodyMatch: r.melody ? r.melody.pitch.match : null,
      report: r.timing,
    });
  }, [id]);

  // ------------------------------------------------------------------ run
  const start = useCallback(async () => {
    startMidi();
    try { await Promise.race([unlockAudio(), new Promise((r) => setTimeout(r, 1500))]); } catch { /* the click may be silent; the run still measures */ }
    const { clock, transport } = getAudio();
    const useWritten = cfg.useWritten && !!stored?.melody;
    const run = new MelodyRun({
      clock, transport,
      spec: {
        title: song?.title ?? 'Free time',
        ...(id ? { songId: id } : {}),
        bpm,
        timeSig: { beats: beatsPerBar, unit: song?.timeSig[1] ?? 4 },
        countInBars: cfg.countInBars,
        bars: totalBars,
        swing: cfg.swing,
        subdivision: cfg.subdivision,
        clickBeats: cfg.clickBeats,
        clickSubdivision: cfg.clickSubdivision,
        melody: useWritten ? stored!.melody : null,
        formBeats: stored?.formBeats ?? formBeats,
        latencyMs: settings.latencyOffsetMs,
      },
    });
    runRef.current = run;
    setReport(null);
    setLive([]);
    run.on('state', ({ state: s }) => setState(s));
    run.on('beat', (b) => setBeat(b));
    run.on('note', (n) => setLive((xs) => [...xs.slice(-31), n]));
    run.on('end', ({ report: r }) => { if (abandoned.current) return; setReport(r); void save(r); });
    offRef.current?.();
    offRef.current = onMidiNote((e) => run.feed(e));
    run.start();
  }, [bpm, beatsPerBar, cfg, formBeats, id, save, settings.latencyOffsetMs, song, stored, totalBars]);

  const stop = useCallback(() => { runRef.current?.stop(); }, []);

  // leaving mid-run must not leave the click running
  useEffect(() => () => {
    abandoned.current = true;
    offRef.current?.();
    runRef.current?.stop();
  }, []);

  const saveHead = async () => {
    if (!id || !report) return;
    await db.melodies.put({ songId: id, title: song?.title ?? '', melody: report.take, formBeats, updatedAt: Date.now() });
  };

  const metro: MetronomeConfig = {
    bpm, timeSig: { beats: beatsPerBar, unit: song?.timeSig[1] ?? 4 },
    subdivision: cfg.clickSubdivision, countInBars: cfg.countInBars, clickBeats: cfg.clickBeats,
  };
  const setMetro = (patch: Partial<MetronomeConfig>) => {
    if (patch.bpm !== undefined) setBpm(patch.bpm);
    const next = { ...cfg };
    if (patch.clickBeats !== undefined) next.clickBeats = patch.clickBeats;
    if (patch.countInBars !== undefined) next.countInBars = patch.countInBars;
    if (patch.subdivision !== undefined) next.clickSubdivision = patch.subdivision;
    settings.set({ melodyRun: next });
  };
  const setCfg = (patch: Partial<typeof cfg>) => settings.set({ melodyRun: { ...cfg, ...patch } });

  const running = state === 'running' || state === 'countIn';
  const barNow = Math.max(0, beat.countIn ? 0 : beat.bar) + 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <BackLink to={id ? `/tunes/${encodeURIComponent(id)}` : '/tunes'} label={song?.title ?? 'Tunes'} />
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Play the head in time</h1>
          <div className="text-ink-dim mt-1">
            {song ? `${song.title} · ${barsPerChorus} bars` : 'Free time — no tune selected'}
            {' · '}
            {stored ? 'graded against your recorded head' : 'timed against the click'}
          </div>
        </div>
        {!running && (
          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-ghost" onClick={() => nav(id ? `/rhythm/${encodeURIComponent(id)}` : '/rhythm')}>Drill a rhythm</button>
            <button className="btn btn-primary text-base px-6 py-3" onClick={() => void start()}>
              {report ? 'Run it again' : 'Start'}
            </button>
          </div>
        )}
        {running && <button className="btn btn-ghost ml-auto" onClick={stop}>Stop</button>}
      </div>

      {/* ---------------------------------------------------------- running */}
      {running && (
        <section className="card space-y-3">
          <BeatPulse beats={beatsPerBar} current={beat.beat} countIn={beat.countIn} />
          <div className="flex items-baseline gap-4">
            <div className="text-2xl font-semibold tabular-nums">
              {beat.countIn ? 'Counting in…' : `Bar ${barNow} / ${totalBars}`}
            </div>
            <div className="text-ink-dim tabular-nums">{bpm} bpm</div>
            <div className="ml-auto text-right">
              <div className="label">Last note</div>
              <LiveOffset notes={live} />
            </div>
          </div>
          <LiveStrip notes={live} />
          <div className="text-xs text-ink-faint">
            Play the melody from the book. Nothing is being marked right or wrong — the analysis comes after.
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- report */}
      {report && !running && (
        <>
          <TimingReportView report={report.timing} melody={report.melody} bpm={bpm} />
          {id && report.take.notes.length >= 8 && (
            <section className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{stored ? 'Replace the reference head' : 'Keep this as the head'}</div>
                <div className="text-sm text-ink-dim">
                  {stored
                    ? 'Overwrite the head you saved before with this take.'
                    : 'Save this take as the written melody for this tune. From then on your pitches get checked too, and timing is measured against where each note belongs rather than against the nearest click.'}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={() => void saveHead()}>{stored ? 'Replace' : 'Save the head'}</button>
            </section>
          )}
        </>
      )}

      {/* ---------------------------------------------------------- setup */}
      {!running && (
        <section className="card space-y-4">
          <button className="flex items-center gap-2 w-full text-left" onClick={() => setSetup((v) => !v)}>
            <div className="label flex-1">Setup</div>
            <div className="text-sm text-ink-dim">
              {bpm} bpm · {cfg.swing ? 'swing' : 'straight'} · click on {describeClick(cfg.clickBeats)} · {cfg.choruses} chorus{cfg.choruses > 1 ? 'es' : ''}
            </div>
            <span className="text-ink-faint">{setup ? '▴' : '▾'}</span>
          </button>
          {setup && (
            <div className="space-y-4 pt-1">
              <MetronomePanel value={metro} onChange={setMetro} showTimeSig={false} />

              <Row label="Feel">
                <Seg on={cfg.swing} onClick={() => setCfg({ swing: true })}>swing</Seg>
                <Seg on={!cfg.swing} onClick={() => setCfg({ swing: false })}>straight</Seg>
                <span className="text-xs text-ink-faint ml-2">
                  {cfg.swing
                    ? 'Off-beats are expected where the tempo puts them, and your actual ratio is measured either way.'
                    : 'Off-beats are expected halfway. Even eighths — bossa, or a ballad head played straight.'}
                </span>
              </Row>

              <Row label="Grid">
                {(['quarter', 'eighth', 'triplet', 'sixteenth'] as Subdivision[]).map((s) => (
                  <Seg key={s} on={cfg.subdivision === s} onClick={() => setCfg({ subdivision: s })}>
                    {s === 'quarter' ? 'quarters' : s === 'eighth' ? '8ths' : s === 'triplet' ? 'triplets' : '16ths'}
                  </Seg>
                ))}
                <span className="text-xs text-ink-faint ml-2">The finest place a note is allowed to land.</span>
              </Row>

              <Row label="Length">
                {[1, 2, 3].map((n) => (
                  <Seg key={n} on={cfg.choruses === n} onClick={() => setCfg({ choruses: n })}>{n} chorus{n > 1 ? 'es' : ''}</Seg>
                ))}
                <span className="text-xs text-ink-faint ml-2">{totalBars} bars.</span>
              </Row>

              {stored && (
                <Row label="Head">
                  <Seg on={cfg.useWritten} onClick={() => setCfg({ useWritten: true })}>check my pitches</Seg>
                  <Seg on={!cfg.useWritten} onClick={() => setCfg({ useWritten: false })}>time only</Seg>
                  <button className="text-xs text-ink-faint hover:text-bad ml-2" onClick={() => void db.melodies.delete(id!)}>forget the saved head</button>
                </Row>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------- chart */}
      {song && !report && (
        <section className="space-y-2">
          <button className="label hover:text-ink" onClick={() => setShowChart((v) => !v)}>{showChart ? 'Hide the changes' : 'Show the changes'}</button>
          {showChart && <ChordGrid bars={formBars(form)} cursor={running && !beat.countIn ? beat.bar % barsPerChorus : undefined} />}
        </section>
      )}

      {/* ---------------------------------------------------------- history */}
      {takes.length > 0 && !running && (
        <section className="card space-y-2">
          <div className="label">Earlier takes</div>
          <div className="space-y-1 text-sm">
            {takes.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center gap-3 tabular-nums">
                <span className="text-ink-faint w-28 shrink-0">{new Date(t.at).toLocaleDateString()} {new Date(t.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {!id && <span className="text-ink-dim flex-1 truncate">{t.title}</span>}
                <span className="w-16 text-ink-dim">{t.bpm} bpm</span>
                <span className="w-24 text-ink-dim">±{Math.round(t.spreadMs / 2)} ms</span>
                <span className="w-20 text-ink-dim">{t.medianMs > 0 ? '+' : ''}{Math.round(t.medianMs)} ms</span>
                <span className="w-20">{t.swingRatio === null ? '—' : `${t.swingRatio.toFixed(1)}:1`}</span>
                <span className="ml-auto font-medium">{t.steadiness}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!song && !id && (
        <div className="text-sm text-ink-dim">
          No tune selected — this is a bare click with timing analysis, which is all you need if the book is on the stand.
          <button className="btn btn-ghost ml-2 !py-1" onClick={() => nav('/tunes')}>Pick a tune</button>
        </div>
      )}
    </div>
  );
}

function describeClick(beats: number[] | null): string {
  if (!beats) return 'every beat';
  if (beats.length === 2 && beats[0] === 1 && beats[1] === 3) return '2 and 4';
  return beats.map((b) => b + 1).join(' & ');
}

/** The offset of the note you just played, big enough to read out of the corner of your eye. */
function LiveOffset({ notes }: { notes: LiveNote[] }) {
  const last = notes[notes.length - 1];
  if (!last) return <div className="text-2xl text-ink-faint tabular-nums">—</div>;
  const ms = Math.round(last.offsetMs);
  const tone = Math.abs(ms) <= 30 ? 'text-good' : Math.abs(ms) <= 70 ? 'text-warn' : 'text-bad';
  return <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{ms > 0 ? '+' : ''}{ms} ms</div>;
}

/** The last 32 notes, so a drift shows up while there is still time to correct it. */
function LiveStrip({ notes }: { notes: LiveNote[] }) {
  const W = 640, H = 44, mid = H / 2, range = 150;
  const y = (ms: number) => mid - (Math.max(-range, Math.min(range, ms)) / range) * (mid - 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 52 }} role="img" aria-label="recent note placement">
      <rect x={0} y={y(30)} width={W} height={y(-30) - y(30)} fill="var(--color-good)" opacity={0.12} />
      <line x1={0} y1={mid} x2={W} y2={mid} stroke="var(--color-good)" strokeWidth={1} opacity={0.5} />
      {notes.map((n, i) => (
        <circle key={i} cx={8 + (i / 31) * (W - 16)} cy={y(n.offsetMs)} r={3}
          fill={Math.abs(n.offsetMs) <= 30 ? 'var(--color-good)' : 'var(--color-warn)'} opacity={0.85} />
      ))}
    </svg>
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
