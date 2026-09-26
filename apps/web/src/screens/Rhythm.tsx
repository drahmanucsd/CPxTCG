import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CallResponse, type Answer, type CallContent, type CallResponseSpec, type Phase, figureCall, phraseCall,
} from '@shed/engine';
import { FIGURES, type Figure, figureCount, pushIndices, swingRatio } from '@shed/theory';
import { getAudio, unlockAudio } from '../audio/context';
import { onMidiNote, startMidi, useComputerKeyboardPiano } from '../midi/midiService';
import { useSettings } from '../store/settings';
import { db } from '../db';
import { loadSong } from '../lib/songs';
import { BackLink } from '../components/BackLink';
import { BeatPulse } from '../components/BeatPulse';
import { FigureStrip } from '../components/FigureStrip';
import { MelodyView, NoteList } from '../components/MelodyView';
import { TempoControl } from '../components/TempoControl';

/**
 * Hear a phrase, play it back, be told exactly what you did.
 *
 * Two sources, because there are two different problems:
 *
 *   - **the ladder** — placement on one note. For when you cannot feel where the "and of 4" is
 *     at all, and pitches would only be in the way.
 *   - **the head** — real bars of the tune, graded on pitch, duration and placement together.
 *     For when you learned it off a recording and the errors are specific: a held note you play
 *     twice, an F sharp where the book has F natural, a syncopation you flatten onto the
 *     downbeat, a triplet you play as two eighths.
 *
 * The second is the one that needs the book. It only appears once this tune has a melody.
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
  const [last, setLast] = useState<Answer | null>(null);
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
  const melody = head?.melody ?? null;
  const beatsPerBar = melody?.beatsPerBar || 4;
  const headBars = melody ? Math.max(1, Math.round(head!.formBeats / beatsPerBar)) : 0;
  const source: 'ladder' | 'head' = melody && cfg.source === 'head' ? 'head' : 'ladder';

  const figure: Figure = FIGURES.find((f) => f.id === figureId) ?? FIGURES[0]!;
  const fromBar = Math.min(cfg.fromBar, Math.max(0, headBars - cfg.bars));

  const call: CallContent = useMemo(
    () => (source === 'head' && melody
      ? phraseCall(melody, fromBar, cfg.bars, cfg.bpm, cfg.swing)
      : figureCall(figure, cfg.bpm, cfg.swing)),
    [source, melody, fromBar, cfg.bars, cfg.bpm, cfg.swing, figure],
  );
  const pushes = source === 'head' ? [] : pushIndices(figure);
  const offBeat = cfg.swing ? swingRatio(cfg.bpm) : 0.5;

  const spec = useCallback((): CallResponseSpec => ({
    call,
    bpm: cfg.bpm,
    timeSig: { beats: beatsPerBar, unit: 4 },
    countInBars: 1,
    swing: cfg.swing,
    clickBeats: cfg.clickBeats,
    callEvery: cfg.callEvery,
    target: cfg.target,
    windowMs: cfg.windowMs,
    latencyMs: settings.latencyOffsetMs,
    maxRounds: 24,
  }), [call, beatsPerBar, cfg, settings.latencyOffsetMs]);

  const wire = (cr: CallResponse) => {
    const { piano } = getAudio();
    cr.on('play', (p) => piano.playChord(p.notes, p.time, p.duration, p.velocity));
  };

  const hear = async () => {
    await unlockAudio();
    const { clock, transport } = getAudio();
    const cr = new CallResponse({ spec: spec(), transport });
    wire(cr);
    cr.preview(clock.now());
  };

  const start = useCallback(async () => {
    startMidi();
    try { await Promise.race([unlockAudio(), new Promise((r) => setTimeout(r, 1500))]); } catch { /* silent click; it still grades */ }
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
      setLast(r.answer); setStreak(r.streak); setBest(r.best);
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
            {source === 'head'
              ? `${call.label} of ${title ?? 'the head'} — pitch, length and placement all count.`
              : 'Placement only — play it on any note.'}
            {' '}{cfg.target} clean in a row and you are done.
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!running && <button className="btn btn-ghost" onClick={() => void hear()}>Hear it</button>}
          {!running
            ? <button className="btn btn-primary text-base px-6 py-3" onClick={() => void start()}>{done ? 'Again' : 'Start'}</button>
            : <button className="btn btn-ghost" onClick={stop}>Stop</button>}
        </div>
      </div>

      {/* --------------------------------------------------------- what you are playing */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <div className="text-lg font-medium">{call.label}</div>
          {source === 'ladder' && <code className="text-sm text-accent tabular-nums">{figureCount(figure)}</code>}
          {pushes.length > 0 && (
            <span className="text-[10px] rounded px-1.5 py-0.5 bg-warn/20 text-warn">
              {pushes.length} push{pushes.length > 1 ? 'es' : ''} across the bar line
            </span>
          )}
          <span className="ml-auto text-sm text-ink-dim">{call.bars} bar{call.bars > 1 ? 's' : ''}</span>
        </div>
        {source === 'ladder' && figure.blurb && <div className="text-sm text-ink-dim">{figure.blurb}</div>}

        {source === 'head' && last?.melody
          ? <MelodyView comparison={last.melody} beatsPerBar={beatsPerBar} bars={cfg.bars} />
          : source === 'head'
            ? <div className="text-sm text-ink-faint">Press Hear it, then play it back. The book&rsquo;s notes and yours both appear here afterwards.</div>
            : <FigureStrip expected={call.notes.map((n) => n.beat)} verdict={last?.figure ?? null} offBeat={offBeat} live={live} beatsPerBar={beatsPerBar} />}
      </section>

      {/* --------------------------------------------------------- running */}
      {running && (
        <section className={`card space-y-3 ${phase === 'response' ? 'border-accent/60' : ''}`}>
          <BeatPulse beats={beatsPerBar} current={beat.beat} countIn={beat.countIn} />
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
        <section className={`card space-y-2 ${last.ok ? 'border-good/50' : 'border-bad/50'}`}>
          <div className={`text-lg font-medium ${last.ok ? 'text-good' : 'text-bad'}`}>{last.headline}</div>
          {last.melody
            ? <NoteList comparison={last.melody} />
            : last.advice && <div className="text-sm text-ink-dim">{last.advice}</div>}
        </section>
      )}

      {done && (
        <section className="card">
          <div className="text-lg font-medium">
            {done.best >= cfg.target ? `${cfg.target} in a row — that one is yours.` : `Stopped after ${done.rounds} rounds. Best run: ${done.best}.`}
          </div>
          <div className="text-sm text-ink-dim mt-1">
            {done.best >= cfg.target
              ? 'Take it up ten bpm, or move on to the next bars.'
              : 'Slow it down until it is easy, then creep it back up. Placement never improves by trying harder at a tempo you cannot hold.'}
          </div>
        </section>
      )}

      {/* --------------------------------------------------------- pick what to drill */}
      {!running && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="label flex-1">What to drill</div>
            {melody && (
              <div className="flex gap-1">
                <Seg on={source === 'ladder'} onClick={() => setCfg({ source: 'ladder' })}>rhythm ladder</Seg>
                <Seg on={source === 'head'} onClick={() => setCfg({ source: 'head' })}>this tune&rsquo;s head</Seg>
              </div>
            )}
          </div>

          {source === 'head' ? (
            <div className="card space-y-3">
              <Row label="Bars">
                {[1, 2, 4].map((n) => (
                  <Seg key={n} on={cfg.bars === n} onClick={() => setCfg({ bars: n })}>{n} at a time</Seg>
                ))}
              </Row>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: Math.max(1, Math.ceil(headBars / cfg.bars)) }, (_, i) => i * cfg.bars).map((b) => (
                  <button
                    key={b}
                    className={`rounded-md px-2 py-1 text-xs tabular-nums ${b === fromBar ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-faint hover:text-ink'}`}
                    onClick={() => setCfg({ fromBar: b })}
                  >{b + 1}–{Math.min(headBars, b + cfg.bars)}</button>
                ))}
              </div>
              <div className="text-xs text-ink-faint">
                The head has {headBars} bars. Pick the ones you keep getting wrong.
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {FIGURES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFigureId(f.id)}
                  className={`card text-left hover:border-accent/60 ${f.id === figure.id ? 'border-accent' : ''}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{f.name}</span>
                    <code className="text-xs text-accent tabular-nums">{figureCount(f)}</code>
                    <span className="ml-auto text-[10px] text-ink-faint">level {f.level}</span>
                  </div>
                  {f.blurb && <div className="text-xs text-ink-dim mt-1 line-clamp-2">{f.blurb}</div>}
                </button>
              ))}
            </div>
          )}

          {id && !melody && (
            <div className="text-xs text-ink-faint">
              To drill the actual notes of this tune, load its melody first —{' '}
              <button className="text-accent hover:underline" onClick={() => nav(`/melody/${encodeURIComponent(id)}`)}>drop a MIDI file or paste notation</button>.
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
                <span className="text-xs text-ink-faint ml-2">Swing puts written off-beats where they should sound, so playing them correctly is not marked late.</span>
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
                <span className="text-xs text-ink-faint ml-2">Never wide enough to confuse a triplet with an eighth, whatever you set.</span>
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
