import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CallResponse, type CallResponseSpec, type Phase } from '@shed/engine';
import {
  FIGURES, type Figure, type FigureVerdict, figureBeats, figureCount, figuresFromMelody, pushIndices, swingRatio,
} from '@shed/theory';
import { getAudio, unlockAudio } from '../audio/context';
import { onMidiNote, startMidi, useComputerKeyboardPiano } from '../midi/midiService';
import { useSettings } from '../store/settings';
import { db } from '../db';
import { loadSong } from '../lib/songs';
import { BackLink } from '../components/BackLink';
import { BeatPulse } from '../components/BeatPulse';
import { FigureStrip } from '../components/FigureStrip';
import { TempoControl } from '../components/TempoControl';

/**
 * Hear a bar, play it back, be told where you put it.
 *
 * The pitches do not matter here and are not graded — play it on one note if you like. What is
 * being trained is placement, and specifically the push: the note that belongs to the next bar,
 * played an eighth early. Getting that wrong is what makes a head sound stiff, and it is
 * invisible to every other screen in this app, because playing it on the downbeat is not a wrong
 * note and it is not really "late" either — it is a different rhythm.
 *
 * You are done when you get it right N times in a row. Once is luck.
 */
export default function Rhythm() {
  const { songId } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const cfg = settings.rhythm;
  const id = songId ? decodeURIComponent(songId) : null;

  const [title, setTitle] = useState<string | null>(null);
  const [figureId, setFigureId] = useState('push-into-1');
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState(0);
  const [beat, setBeat] = useState({ bar: 0, beat: 0, countIn: false, index: -1 });
  const [live, setLive] = useState<number[]>([]);
  const [last, setLast] = useState<FigureVerdict | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [done, setDone] = useState<{ rounds: number; best: number } | null>(null);
  const [setup, setSetup] = useState(false);
  const crRef = useRef<CallResponse | null>(null);
  const offRef = useRef<(() => void) | null>(null);
  const abandoned = useRef(false);
  useComputerKeyboardPiano(phase === 'call' || phase === 'response', 3);

  useEffect(() => { if (id) void loadSong(id).then((s) => setTitle(s?.title ?? null)); }, [id]);
  const head = useLiveQuery(async () => (id ? await db.melodies.get(id) : undefined), [id]);

  /** The ladder, plus the phrases of your own head when there is one to cut up. */
  const figures: Figure[] = useMemo(() => {
    if (!head?.melody) return FIGURES;
    const cut = figuresFromMelody(head.melody.notes, {
      bars: 2, beatsPerBar: head.melody.beatsPerBar, bpm: cfg.bpm, swing: cfg.swing,
      totalBars: Math.round(head.formBeats / head.melody.beatsPerBar),
    });
    // the bars with a push in them are the reason you are here, so they come first
    const withPush = cut.filter((f) => pushIndices(f).length);
    return [...FIGURES, ...withPush, ...cut.filter((f) => !pushIndices(f).length)];
  }, [head, cfg.bpm, cfg.swing]);

  const figure = figures.find((f) => f.id === figureId) ?? figures[0]!;
  const beats = useMemo(() => figureBeats(figure, cfg.bpm, cfg.swing), [figure, cfg.bpm, cfg.swing]);
  const pushes = pushIndices(figure);
  const offBeat = cfg.swing ? swingRatio(cfg.bpm) : 0.5;

  const spec = useCallback((): CallResponseSpec => ({
    figure,
    bpm: cfg.bpm,
    timeSig: { beats: 4, unit: 4 },
    countInBars: 1,
    swing: cfg.swing,
    clickBeats: cfg.clickBeats,
    callEvery: cfg.callEvery,
    target: cfg.target,
    windowMs: cfg.windowMs,
    voice: [72],
    latencyMs: settings.latencyOffsetMs,
    maxRounds: 24,
  }), [cfg, figure, settings.latencyOffsetMs]);

  const wire = (cr: CallResponse) => {
    const { piano } = getAudio();
    cr.on('play', (p) => piano.playChord(p.notes, p.time, p.duration, p.velocity));
  };

  /** Play it once without committing to a run. */
  const hear = async () => {
    await unlockAudio();
    const { clock, transport } = getAudio();
    const cr = new CallResponse({ spec: spec(), transport });
    wire(cr);
    cr.preview(clock.now());
  };

  const start = useCallback(async () => {
    startMidi();
    try { await Promise.race([unlockAudio(), new Promise((r) => setTimeout(r, 1500))]); } catch { /* silent click; the drill still grades */ }
    const { transport } = getAudio();
    const cr = new CallResponse({ spec: spec(), transport });
    crRef.current = cr;
    setLast(null); setLive([]); setStreak(0); setBest(0); setDone(null); setRound(1);
    wire(cr);
    cr.on('phase', (p) => {
      if (abandoned.current) return;
      setPhase(p.phase); setRound(p.round);
      if (p.phase === 'response') { setLive([]); setLast(null); }
    });
    cr.on('beat', (b) => { if (!abandoned.current) setBeat(b); });
    cr.on('hit', (h) => { if (!abandoned.current) setLive((xs) => [...xs, h.beat]); });
    cr.on('result', (r) => {
      if (abandoned.current) return;
      setLast(r.verdict); setStreak(r.streak); setBest(r.best);
    });
    cr.on('end', (e) => { if (!abandoned.current) { setDone({ rounds: e.rounds, best: e.best }); setPhase('ended'); } });
    offRef.current?.();
    offRef.current = onMidiNote((e) => cr.feed(e));
    cr.start();
  }, [spec]);

  const stop = () => crRef.current?.stop();
  useEffect(() => () => { abandoned.current = true; offRef.current?.(); crRef.current?.stop(); }, []);

  const setCfg = (patch: Partial<typeof cfg>) => settings.set({ rhythm: { ...cfg, ...patch } });
  const running = phase === 'call' || phase === 'response' || phase === 'countIn';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <BackLink to={id ? `/tunes/${encodeURIComponent(id)}` : '/tunes'} label={title ?? 'Tunes'} />
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Hear it, play it back</h1>
          <div className="text-ink-dim mt-1">
            Placement only — play it on any note. {cfg.target} clean in a row and you are done.
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!running && <button className="btn btn-ghost" onClick={() => void hear()}>Hear it</button>}
          {!running
            ? <button className="btn btn-primary text-base px-6 py-3" onClick={() => void start()}>{done ? 'Again' : 'Start'}</button>
            : <button className="btn btn-ghost" onClick={stop}>Stop</button>}
        </div>
      </div>

      {/* --------------------------------------------------------- the figure */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <div className="text-lg font-medium">{figure.name}</div>
          <code className="text-sm text-accent tabular-nums">{figureCount(figure)}</code>
          {pushes.length > 0 && (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-warn/20 text-warn">
              {pushes.length} push{pushes.length > 1 ? 'es' : ''} across the bar line
            </span>
          )}
          <span className="ml-auto text-sm text-ink-dim">{figure.bars} bar{figure.bars > 1 ? 's' : ''}</span>
        </div>
        {figure.blurb && <div className="text-sm text-ink-dim">{figure.blurb}</div>}
        <FigureStrip expected={beats} verdict={last} offBeat={offBeat} live={live} />
      </section>

      {/* --------------------------------------------------------- running */}
      {running && (
        <section className={`card space-y-3 ${phase === 'response' ? 'border-accent/60' : ''}`}>
          <BeatPulse beats={4} current={beat.beat} countIn={beat.countIn} />
          <div className="flex flex-wrap items-baseline gap-4">
            <div className="text-2xl font-semibold">
              {beat.countIn ? 'Counting in…' : phase === 'call' ? 'Listen' : 'Your turn'}
            </div>
            <div className="text-ink-dim">round {round}</div>
            <div className="ml-auto flex items-center gap-1.5">
              {Array.from({ length: cfg.target }, (_, i) => (
                <span key={i} className={`w-3 h-3 rounded-full ${i < streak ? 'bg-good' : 'bg-panel-2'}`} />
              ))}
              <span className="text-sm text-ink-dim ml-2 tabular-nums">{streak}/{cfg.target}</span>
              {best > streak && <span className="text-xs text-ink-faint ml-1 tabular-nums">best {best}</span>}
            </div>
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- feedback */}
      {last && (
        <section className={`card space-y-1 ${last.ok ? 'border-good/50' : last.flattened ? 'border-bad/50' : ''}`}>
          <div className={`text-lg font-medium ${last.ok ? 'text-good' : last.flattened ? 'text-bad' : 'text-warn'}`}>{last.headline}</div>
          {last.advice && <div className="text-sm text-ink-dim">{last.advice}</div>}
        </section>
      )}

      {done && (
        <section className="card">
          <div className="text-lg font-medium">
            {done.best >= cfg.target ? `${cfg.target} in a row — that placement is yours.` : `Stopped after ${done.rounds} rounds. Best run: ${done.best}.`}
          </div>
          <div className="text-sm text-ink-dim mt-1">
            {done.best >= cfg.target
              ? 'Take it up ten bpm, or move to the next figure.'
              : 'Slow the tempo down until it is easy, then creep it back up. Placement never improves by trying harder at a tempo you cannot hold.'}
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- pick one */}
      {!running && (
        <section className="space-y-2">
          <div className="label">The ladder</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {figures.map((f) => (
              <button
                key={f.id}
                onClick={() => setFigureId(f.id)}
                className={`card text-left hover:border-accent/60 ${f.id === figure.id ? 'border-accent' : ''}`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{f.name}</span>
                  <code className="text-xs text-accent tabular-nums">{figureCount(f)}</code>
                  <span className="ml-auto text-[10px] text-ink-faint">
                    {f.source === 'head' ? 'your head' : `level ${f.level}`}
                  </span>
                </div>
                {f.blurb && <div className="text-xs text-ink-dim mt-1 line-clamp-2">{f.blurb}</div>}
              </button>
            ))}
          </div>
          {id && !head && (
            <div className="text-xs text-ink-faint">
              Record the head on{' '}
              <button className="text-accent hover:underline" onClick={() => nav(`/melody/${encodeURIComponent(id)}`)}>the timing screen</button>
              {' '}and its own bars appear here, with the pushes marked.
            </div>
          )}
        </section>
      )}

      {/* --------------------------------------------------------- setup */}
      {!running && (
        <section className="card space-y-4">
          <button className="flex items-center gap-2 w-full text-left" onClick={() => setSetup((v) => !v)}>
            <div className="label flex-1">Setup</div>
            <div className="text-sm text-ink-dim">
              {cfg.bpm} bpm · {cfg.swing ? 'swing' : 'straight'} · call {cfg.callEvery ? 'every time' : 'once'} · {cfg.target} in a row
            </div>
            <span className="text-ink-faint">{setup ? '▴' : '▾'}</span>
          </button>
          {setup && (
            <div className="space-y-4 pt-1">
              <TempoControl bpm={cfg.bpm} onChange={(bpm) => setCfg({ bpm })} />
              <Row label="Feel">
                <Seg on={cfg.swing} onClick={() => setCfg({ swing: true })}>swing</Seg>
                <Seg on={!cfg.swing} onClick={() => setCfg({ swing: false })}>straight</Seg>
                <span className="text-xs text-ink-faint ml-2">Swing puts the off-beats where the tempo wants them, not halfway.</span>
              </Row>
              <Row label="Call">
                <Seg on={cfg.callEvery} onClick={() => setCfg({ callEvery: true })}>every time</Seg>
                <Seg on={!cfg.callEvery} onClick={() => setCfg({ callEvery: false })}>once, then keep going</Seg>
              </Row>
              <Row label="Target">
                {[1, 3, 5, 10].map((n) => (
                  <Seg key={n} on={cfg.target === n} onClick={() => setCfg({ target: n })}>{n} in a row</Seg>
                ))}
              </Row>
              <Row label="Window">
                {[50, 80, 120].map((n) => (
                  <Seg key={n} on={cfg.windowMs === n} onClick={() => setCfg({ windowMs: n })}>±{n} ms</Seg>
                ))}
                <span className="text-xs text-ink-faint ml-2">How close counts as hitting it.</span>
              </Row>
              <Row label="Click on">
                <Seg on={cfg.clickBeats === null} onClick={() => setCfg({ clickBeats: null })}>every beat</Seg>
                <Seg on={!!cfg.clickBeats && cfg.clickBeats.length === 2} onClick={() => setCfg({ clickBeats: [1, 3] })}>2 and 4</Seg>
                <Seg on={!!cfg.clickBeats && cfg.clickBeats.length === 1} onClick={() => setCfg({ clickBeats: [1] })}>beat 2 only</Seg>
              </Row>
            </div>
          )}
        </section>
      )}
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
