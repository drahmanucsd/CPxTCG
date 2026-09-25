import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { DrillRunner, PRESET_BY_ID, RhythmSection, type DrillSpec, type DrillSummary, type Target } from '@shed/engine';
import { STRICTNESS_LABEL, STRICTNESS_ORDER, chordTones, keyName, spellPc, type PitchClass, type Verdict } from '@shed/theory';
import { getAudio, playVoicing, unlockAudio } from '../audio/context';
import { getCapture, onMidiCC, onMidiNote, startMidi, useComputerKeyboardPiano, useMidiStore } from '../midi/midiService';
import { useSettings } from '../store/settings';
import { db } from '../db';
import { ChordText } from '../components/ChordDisplay';
import { Keyboard } from '../components/Keyboard';
import { BeatPulse } from '../components/BeatPulse';
import { ChordGrid } from '../components/ChordGrid';
import { MetronomePanel, type MetronomeConfig } from '../components/MetronomePanel';
import { YouTube, type YTPlayer } from '../components/YouTube';
import { PageImage } from './Tune';
import { StemPlayer, loadStems } from '../lib/records';
import { recentAttempts, smartWeight } from '../lib/stats';
import { FAMILY_LABEL, suffixOf } from '../lib/suffix';
import { speak, spokenChord } from '../lib/speech';

interface View {
  target: Target | null;
  upcoming: Target[];
  verdict: Verdict | null;
  verdictFinal: boolean;
  latenessMs: number | null;
  flash: 'good' | 'bad' | null;
  beat: { bar: number; beat: number; countIn: boolean; index: number };
  state: DrillRunner['state'];
  bpm: number;
  hint: number;
  ok: number;
  miss: number;
  /** the four outcomes — see docs/06-review-ux.md */
  clean: number;
  offTime: number;
  wrong: number;
  blank: number;
  lateSum: number;
  lateN: number;
  pass: number;
  /** 'onCorrect' mode: how many times the current chord has come round again */
  repeats: number;
  barResults: Map<number, boolean>;
}

const initial: View = { target: null, upcoming: [], verdict: null, verdictFinal: false, latenessMs: null, flash: null, beat: { bar: 0, beat: 0, countIn: false, index: -1 }, state: 'idle', bpm: 0, hint: 0, ok: 0, miss: 0, clean: 0, offTime: 0, wrong: 0, blank: 0, lateSum: 0, lateN: 0, pass: 1, repeats: 0, barResults: new Map() };

export default function Drill() {
  const { id } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const midi = useMidiStore();
  const [spec, setSpec] = useState<DrillSpec | null>(null);
  const [view, setView] = useState<View>(initial);
  const [ready, setReady] = useState(false);
  const [armed, setArmed] = useState(false);
  const [tapBpm, setTapBpm] = useState<number | null>(null);
  const taps = useRef<number[]>([]);
  const ytRef = useRef<YTPlayer | null>(null);
  const runnerRef = useRef<DrillRunner | null>(null);
  const bandRef = useRef<RhythmSection | null>(null);
  const recRef = useRef<{ t0: number; events: Array<[number, number, number, number]>; off: () => void } | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const stemRef = useRef<StemPlayer | null>(null);
  const [stems, setStems] = useState<Array<{ key: string; name: string; gain: number; muted: boolean }>>([]);
  const [recordReady, setRecordReady] = useState(false);
  const syncPoll = useRef<number | null>(null);
  const [showPage, setShowPage] = useState(true);
  const [metroOpen, setMetroOpen] = useState(false);
  const abandoned = useRef(false);
  useEffect(() => {
    let url: string | null = null;
    if (spec?.song?.scan) void db.images.get(spec.song.scan.imageId).then((row) => { if (row) { url = URL.createObjectURL(row.blob); setPageUrl(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [spec]);
  const flashKey = useRef(0);
  useComputerKeyboardPiano(ready, 3);

  useEffect(() => {
    let alive = true;
    (async () => {
      const preset = PRESET_BY_ID[id ?? ''];
      if (preset) { setSpec(preset); return; }
      const row = await db.drills.get(id ?? '');
      if (alive) setSpec(row?.spec ?? null);
    })();
    return () => { alive = false; };
  }, [id]);

  const start = useCallback(async () => {
    if (!spec) return;
    startMidi();
    try { await Promise.race([unlockAudio(), new Promise((r) => setTimeout(r, 1500))]); } catch { /* audio stays locked; drill still runs */ }
    const { ctx, clock, transport } = getAudio();
    const capture = getCapture();
    capture.reset();
    const smart = spec.generator.kind === 'random' && spec.generator.smart;
    const weight = smart ? smartWeight(await recentAttempts(60)) : undefined;
    // microphone input can't hear octaves reliably: never grade stricter than octaveFree
    const micMode = useMidiStore.getState().inputMode === 'mic';
    const effective: DrillSpec = micMode && STRICTNESS_ORDER.indexOf(spec.strictness) < STRICTNESS_ORDER.indexOf('octaveFree') ? { ...spec, strictness: 'octaveFree' } : spec;
    const runner = new DrillRunner({ spec: effective, clock, capture, transport, weight, latencyOffsetMs: micMode ? settings.latencyOffsetMs + 60 : settings.latencyOffsetMs });
    runnerRef.current = runner;
    // record what is actually played (MIDI only, never audio) so the review can replay it
    recRef.current?.off();
    const rec = { t0: clock.now(), events: [] as Array<[number, number, number, number]>, off: () => {} };
    rec.off = onMidiNote((e) => { if (rec.events.length < 20000) rec.events.push([e.type === 'on' ? 1 : 0, e.note, Math.round((e.time - rec.t0) * 1000) / 1000, e.velocity]); });
    recRef.current = rec;
    if (spec.band && spec.pacing.mode === 'timed') {
      bandRef.current?.stop();
      const formBars = spec.song ? spec.song.to - spec.song.from + 1 : 8;
      bandRef.current = new RhythmSection(ctx, transport, (b) => {
        const c = runner.chordAtBeat(b);
        if (c && bandRef.current) {
          const fi = c.target.pc.formIndex;
          bandRef.current.form = { bar: fi === undefined ? 0 : fi - (spec.song?.from ?? 0), formBars, chorus: c.target.pass };
          return { ...c, voicing: c.target.voicing.notes };
        }
        return c;
      }, spec.band);
      bandRef.current.start();
    }
    setView({ ...initial, bpm: spec.pacing.bpm, state: 'idle', barResults: new Map() });
    runner.on('state', ({ state }) => setView((v) => ({ ...v, state })));
    runner.on('target', ({ target, upcoming }) => {
      setView((v) => {
        const barResults = new Map(v.barResults);
        if (target.pc.formIndex !== undefined && target.pc.formIndex === (spec.song?.from ?? 0)) barResults.clear(); // new chorus
        return { ...v, target, upcoming, verdict: null, verdictFinal: false, latenessMs: null, hint: 0, flash: null, pass: target.pass, repeats: 0, barResults };
      });
      if (useSettings.getState().speakPrompts) speak(spokenChord(target.chord));
      window.__shedTarget = { notes: target.voicing.notes, chord: target.chord.text, family: target.voicing.family, index: target.index };
    });
    runner.on('verdict', ({ verdict, latenessMs, final, target }) => {
      flashKey.current++;
      setView((v) => {
        const barResults = v.barResults;
        if (target.pc.formIndex !== undefined && (final || verdict.ok)) {
          const prev = barResults.get(target.pc.formIndex);
          barResults.set(target.pc.formIndex, prev === false ? false : verdict.ok);
        }
        const ok = verdict.ok ? v.ok + 1 : v.ok;
        const miss = final && !verdict.ok ? v.miss + 1 : v.miss;
        const lateSum = verdict.ok && latenessMs !== null ? v.lateSum + latenessMs : v.lateSum;
        const lateN = verdict.ok && latenessMs !== null ? v.lateN + 1 : v.lateN;
        // right notes outside the window are their own outcome, not a pass
        const window = spec.pacing.timingWindowMs ?? 120;
        const inTime = latenessMs === null || Math.abs(latenessMs) <= window;
        const clean = verdict.ok && inTime ? v.clean + 1 : v.clean;
        const offTime = verdict.ok && !inTime ? v.offTime + 1 : v.offTime;
        const blank = final && !verdict.ok && verdict.diagnosis.includes('nothingPlayed') ? v.blank + 1 : v.blank;
        const wrong = final && !verdict.ok && !verdict.diagnosis.includes('nothingPlayed') ? v.wrong + 1 : v.wrong;
        return { ...v, verdict, verdictFinal: final, latenessMs, flash: verdict.ok ? (inTime ? 'good' : 'bad') : 'bad', ok, miss, clean, offTime, wrong, blank, lateSum, lateN };
      });
    });
    runner.on('hint', ({ level, target }) => { setView((v) => ({ ...v, hint: level })); if (level >= 3) playVoicing(target.voicing.notes); });
    runner.on('tempo', ({ bpm }) => setView((v) => ({ ...v, bpm })));
    runner.on('repeat', ({ repeats }) => setView((v) => ({ ...v, repeats, verdict: null, verdictFinal: false, latenessMs: null, flash: null })));
    runner.on('end', ({ summary }) => { if (abandoned.current) return; window.__shedTarget = null; bandRef.current?.stop(); bandRef.current = null; stemRef.current?.stop(); if (syncPoll.current) cancelAnimationFrame(syncPoll.current); void saveAndReview(spec, summary); });
    transport.on('beat', (b) => setView((v) => ({ ...v, beat: { bar: b.bar, beat: b.beat, countIn: b.countIn, index: b.index } })));
    setReady(true);
    if (spec.backing) {
      transport.muted = true;
      const b = spec.backing;
      const countInSec = (spec.pacing.countInBars * spec.pacing.timeSig.beats * 60) / (b.bpm ?? spec.pacing.bpm);
      if (b.bpm) runner.setBpm(b.bpm);
      if (b.kind === 'record') {
        const rec = await db.records.get(b.recordId);
        if (!rec) { setArmed(true); return; }
        const player = new StemPlayer(ctx, await loadStems(ctx, rec));
        stemRef.current = player;
        setStems(player.stems.map((st) => ({ key: st.ref.name + st.ref.blobId, name: st.ref.name, gain: st.ref.gain, muted: st.ref.muted })));
        setRecordReady(true);
        const S = ctx.currentTime + 0.15;
        if (b.anchorSec !== undefined) {
          // known anchor: start the record and the count-in so beat 1 lands exactly on anchorSec
          const at = S + b.anchorSec - countInSec;
          const offset = at < ctx.currentTime + 0.05 ? countInSec - b.anchorSec : 0; // anchor too early for a full count-in: skip into the record
          player.play(S, offset);
          runner.start({ at: at + offset });
        } else { player.play(S); setArmed(true); }
        return;
      }
      if (b.anchorSec !== undefined && ytRef.current) {
        // known anchor: seek before it, then start the count-in when the video reaches the pre-roll point
        const p = ytRef.current;
        const pre = Math.max(0, b.anchorSec - countInSec);
        p.seekTo(pre, true); p.playVideo();
        const poll = () => {
          const cur = p.getCurrentTime();
          if (p.getPlayerState() === 1 && cur >= pre) {
            // start the count-in so beat 1 lands exactly on the anchor
            runner.start({ at: ctx.currentTime + (b.anchorSec! - cur) - countInSec });
            return;
          }
          syncPoll.current = requestAnimationFrame(poll);
        };
        syncPoll.current = requestAnimationFrame(poll);
        return;
      }
      setArmed(true); return; // wait for the tap on beat 1
    }
    runner.start();
  }, [spec, settings.latencyOffsetMs]);

  /** Backing track: tap tempo (t) and go on beat 1 (space / sustain pedal). */
  const tapTempo = useCallback(() => {
    const now = performance.now();
    taps.current = taps.current.filter((x) => now - x < 4000);
    taps.current.push(now);
    if (taps.current.length >= 3) {
      const iv = taps.current.slice(1).map((x, i) => x - taps.current[i]!);
      iv.sort((a, b) => a - b);
      const med = iv[Math.floor(iv.length / 2)]!;
      const bpm = Math.round(60000 / med);
      setTapBpm(bpm);
      runnerRef.current?.setBpm(bpm);
    }
  }, []);
  const saveSync = useCallback((anchorSec: number, bpm: number) => {
    const b = spec?.backing; const song = spec?.song;
    if (!b || !song) return;
    if (b.kind === 'record') void db.records.update(b.recordId, { anchorSec: Math.round(anchorSec * 1000) / 1000, bpm });
    // a YouTube reference is never synced (see docs/12): only your own audio carries an anchor
    void bpm;
  }, [spec]);
  const goOnOne = useCallback(() => {
    const run = runnerRef.current;
    if (!run) return;
    const b = spec?.backing;
    if (run.state === 'idle') {
      const { ctx } = getAudio();
      run.start(); setArmed(false);
      // remember where beat 1 was so next time it's automatic
      if (b?.kind === 'record' && stemRef.current) saveSync(stemRef.current.position(ctx.currentTime), run.bpm);
      else if (b?.kind === 'youtube' && ytRef.current) saveSync(ytRef.current.getCurrentTime(), run.bpm);
    }
    else if (run.state === 'running' || run.state === 'countIn') { run.pause(); run.resume(); } // re-anchor on this chord
    else if (run.state === 'paused') run.resume();
  }, []);

  const saveAndReview = async (s: DrillSpec, summary: DrillSummary) => {
    const sessionId = crypto.randomUUID();
    const ts = Date.now();
    const rec = recRef.current; rec?.off(); recRef.current = null;
    await db.sessions.put({ id: sessionId, specId: s.id, specName: s.name, startedAt: ts - Math.round((summary.endedAt - summary.startedAt) * 1000), endedAt: ts, total: summary.total, correct: summary.correct, avgLatenessMs: summary.avgLatenessMs, finalBpm: summary.finalBpm, hintsUsed: summary.hintsUsed, summary, midi: rec?.events ?? [] });
    await db.attempts.bulkAdd(summary.results.map((r) => ({ ...r, sessionId, specId: s.id, ts, root: r.chord.root, suffix: suffixOf(r.chord) })));
    nav(`/review/${sessionId}`, { replace: true });
  };

  // keyboard shortcuts + MIDI hands-free
  useEffect(() => {
    if (!ready) return;
    const r = () => runnerRef.current;
    const kd = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      const run = r(); if (!run) return;
      if (e.key === ' ') { e.preventDefault(); if (run.state === 'paused') run.resume(); else run.pause(); }
      else if (e.key === 'Escape') { run.pause(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { run.skip(); }
      else if (e.key === 'h' || e.key === '?') { run.hint(); }   // a no-op when the drill has hints off
      else if (e.key === 'p' || e.key === 'l') { const t = run.currentTarget; if (t) playVoicing(t.voicing.notes); }
      else if (e.key === '-') { run.setBpm(Math.max(30, run.bpm - 1)); }
      else if (e.key === '=') { run.setBpm(Math.min(300, run.bpm + 1)); }
      else if (e.key === '_') { run.setBpm(Math.max(30, run.bpm - 5)); }
      else if (e.key === '+') { run.setBpm(Math.min(300, run.bpm + 5)); }
      else if (e.key === 'm') { setMetroOpen((o) => !o); }
    };
    window.addEventListener('keydown', kd);
    let lastSustain = 0;
    const offCC = onMidiCC(({ controller, value }) => {
      const run = r(); if (!run) return;
      if (controller === 64 && value >= 64) {
        if (spec?.backing && run.state === 'idle') { goOnOne(); return; }
        const now = performance.now();
        if (now - lastSustain < 400) { if (run.state === 'paused') run.resume(); else run.pause(); }
        lastSustain = now;
      }
    });
    return () => { window.removeEventListener('keydown', kd); offCC(); };
  }, [ready, spec, goOnOne, tapTempo]);

  useEffect(() => () => { runnerRef.current?.end(); bandRef.current?.stop(); recRef.current?.off(); stemRef.current?.stop(); if (syncPoll.current) cancelAnimationFrame(syncPoll.current); const t = getAudio().transport; t.stop(); t.muted = false; }, []);

  const run = runnerRef.current;
  const t = view.target;
  /** One writer for every metronome setting, live during a run and before it starts. */
  const metro: MetronomeConfig = {
    bpm: (view.bpm || spec?.pacing.bpm) ?? 120,
    timeSig: spec?.pacing.timeSig ?? { beats: 4, unit: 4 },
    subdivision: spec?.pacing.subdivision ?? 1,
    countInBars: spec?.pacing.countInBars ?? 1,
    clickBeats: spec?.pacing.clickBeats ?? null,
  };
  const setMetro = (patch: Partial<MetronomeConfig>) => {
    setSpec((prev) => (prev ? { ...prev, pacing: { ...prev.pacing, ...patch } } : prev));
    if (patch.bpm !== undefined) {
      if (runnerRef.current) runnerRef.current.setBpm(patch.bpm);
      else setView((v) => ({ ...v, bpm: patch.bpm! }));
    }
    if (patch.subdivision !== undefined) getAudio().transport.subdivision = patch.subdivision;
    if (patch.clickBeats !== undefined) getAudio().transport.clickBeats = patch.clickBeats;
    if (patch.timeSig !== undefined && !runnerRef.current) getAudio().transport.timeSig = patch.timeSig;
    if (patch.countInBars !== undefined && !runnerRef.current) getAudio().transport.countInBars = patch.countInBars;
  };
  const tones = useMemo(() => (t ? chordTones(t.chord) : null), [t]);
  const beatsPerBar = spec?.pacing.timeSig.beats ?? 4;
  const showNext = spec?.lookAhead === 'always' || (spec?.lookAhead === 'lastBeat' && t && view.beat.index >= (t.beatIndex ?? 0) + t.beats - 1);
  const showDiff = view.verdict && !view.verdict.ok;
  // hints can land as text, on the keyboard, or both (Settings → Hints)
  const hintsOff = spec?.hints === 'off' || settings.hintStyle === 'off';
  const hintOnKeys = !hintsOff && settings.hintStyle !== 'text';
  const hintAsText = !hintsOff && settings.hintStyle !== 'keyboard';
  // a miss reveals the shape — unless the drill is explicitly testing you
  const revealOnMiss = !hintsOff && !!view.verdict && !view.verdict.ok && view.verdictFinal;
  const hintNotes = t && (revealOnMiss || (hintOnKeys && view.hint >= 2) || view.hint >= 3) ? t.voicing.notes : [];
  const hintTones = t && tones && hintOnKeys && view.hint >= 1 ? tones.memberPcs : [];
  const toneLabels = useMemo(() => {
    if (!t || !tones) return {};
    const out: Record<number, string> = {};
    for (const iv of tones.members) out[(t.chord.root + iv) % 12] = DEGREE[iv] ?? String(iv);
    return out;
  }, [t, tones]);
  const avgLate = view.lateN ? Math.round(view.lateSum / view.lateN) : null;
  const tuneMode = !!spec?.song;
  const reveal = spec?.song?.reveal ?? 'chart';
  const gridBars = useMemo(() => {
    const s = spec?.song;
    if (!s) return [];
    return s.bars.map((b) => {
      if (reveal === 'chart') return { key: b.formIndex, chords: b.chords, section: b.section };
      if (reveal === 'roman') {
        const r = s.romans?.[b.formIndex] ?? null;
        return { key: b.formIndex, chords: r ? [{ text: r, beats: 4 }] : [], section: b.section };
      }
      // 'sections' and 'blank': bar boxes only, so you still know where you are in the form
      return { key: b.formIndex, chords: [], section: reveal === 'sections' ? b.section : undefined };
    });
  }, [spec, reveal]);

  if (!spec) return <div className="p-8 text-ink-dim">Loading drill…</div>;

  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div>
          <div className="label mb-2">Drill</div>
          <h1 className="text-3xl font-semibold tracking-tight">{spec.name}</h1>
          {spec.description && <p className="text-ink-dim mt-2 max-w-md">{spec.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2 justify-center text-xs text-ink-dim">
          <Chip>{spec.families.map((f) => FAMILY_LABEL[f] ?? f).join(' / ')}</Chip>
          <Chip>{STRICTNESS_LABEL[spec.strictness]}</Chip>
          <Chip>{spec.voiceLeading === 'strict' ? 'Voice leading on' : 'Any voicing in family'}</Chip>
          <Chip>{spec.pacing.mode === 'free' ? 'Free time' : `${spec.pacing.beatsPerChord} beats/chord`}</Chip>
          {spec.ladder && <Chip>Speed ladder +{spec.ladder.up}/−{spec.ladder.down}</Chip>}
          {spec.band && <Chip>Band: {[spec.band.bass && 'bass', spec.band.drums && 'drums'].filter(Boolean).join(' + ')} · {spec.band.style}</Chip>}
          {spec.backing && <Chip>{spec.backing.kind === 'record' ? 'Your recording (stems)' : 'YouTube backing track'}{spec.backing.anchorSec !== undefined ? ' · auto-sync' : ''}</Chip>}
          {midi.inputMode === 'mic' && <Chip>Microphone input · graded at pitch-class level</Chip>}
        </div>
        {spec.pacing.mode === 'timed' && (
          <div className="card w-full max-w-md text-left space-y-4">
            <MetronomePanel value={metro} onChange={setMetro} />
            {!spec.song && <div className="flex items-center gap-2">
              <div className="label w-20 shrink-0">If you miss</div>
              <div className="flex gap-1 flex-1">
                {([['onTime', 'the bar moves on'], ['onCorrect', 'the chord waits']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    aria-pressed={(spec.pacing.advance ?? 'onTime') === mode}
                    className={`flex-1 rounded-lg px-2.5 py-1 text-sm ${(spec.pacing.advance ?? 'onTime') === mode ? 'bg-accent/25 text-ink' : 'bg-panel-2 text-ink-dim hover:text-ink'}`}
                    onClick={() => setSpec((prev) => (prev ? { ...prev, pacing: { ...prev.pacing, advance: mode } } : prev))}
                  >{label}</button>
                ))}
              </div>
            </div>}
            <div className="text-xs text-ink-faint">
              {spec.song
                ? 'A tune always moves with the bar — the form does not wait.'
                : (spec.pacing.advance ?? 'onTime') === 'onTime'
                  ? 'The click carries on and so does the drill, hit or miss. This is playing a tune.'
                  : 'The click carries on but this chord comes round again until you play it. Same pulse, no wall of misses. Press → to give up on one.'}
              {' '}&ldquo;In time&rdquo; means within ±{spec.pacing.timingWindowMs ?? 120} ms of the beat.
            </div>
          </div>
        )}
        {spec.pacing.mode === 'timed' && !settings.calibratedAt && (
          <div className="card w-full max-w-md text-left border-warn/60">
            <div className="label text-warn">Not calibrated</div>
            <div className="text-sm text-ink-dim mt-1">
              This drill grades <em>when</em> you play, and until the input delay is measured, &ldquo;late&rdquo; is not a real
              verdict. It takes about twenty seconds.
            </div>
            <Link to="/settings" className="btn btn-ghost !py-1 mt-2">Calibrate first</Link>
          </div>
        )}
        <button className="btn btn-primary text-lg px-8 py-4" onClick={() => void start()}>Start</button>
        <div className="text-xs text-ink-faint max-w-sm">
          {midi.connected ? <>Listening on <span className="text-ink-dim">{midi.deviceName}</span>.</> : midi.supported ? <>No MIDI device yet — plug one in, or use the computer keyboard (<kbd>z</kbd>–<kbd>m</kbd>, <kbd>q</kbd>–<kbd>p</kbd>, <kbd>,</kbd>/<kbd>.</kbd> octave).</> : <>This browser has no Web MIDI (Safari). Use Chrome/Edge/Firefox, or the computer keyboard.</>}
          <div className="mt-2">Space pause · → skip · h hint · p play it · m metronome · −/= ±1 bpm · sustain-pedal double-tap pause</div>
        </div>
        <button className="text-ink-faint text-sm hover:text-ink" onClick={() => nav(-1)}>Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col select-none">
      {/* status bar */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-4 text-xs text-ink-dim">
        <div className="flex-1"><BeatPulse beats={beatsPerBar} current={view.beat.beat} countIn={view.beat.countIn} /></div>
      </div>
      <div className="px-4 flex items-center gap-3 text-xs text-ink-dim">
        <button className="hover:text-ink" title="Leave without saving this run" onClick={() => { abandoned.current = true; runnerRef.current?.end(); nav(-1); }}>&larr; Leave</button>
        {spec.pacing.mode === 'timed' && (
          <button className="font-medium text-ink hover:text-accent tabular-nums" onClick={() => setMetroOpen(true)} title="Tempo and metronome (m)">{view.bpm} bpm ▾</button>
        )}
        <span className="truncate">{spec.name}</span>
        <span className="ml-auto" />
        <span className="text-good" title="right notes, in time">✓ {view.clean}</span>
        {view.offTime > 0 && <span className="text-warn" title="right notes, outside the timing window">⏱ {view.offTime}</span>}
        <span className="text-bad" title="wrong notes or nothing played">✗ {view.wrong + view.blank}</span>
        {avgLate !== null && <span title="median offset of correct chords">{avgLate > 0 ? '+' : ''}{avgLate} ms</span>}
        <button className="btn btn-ghost !py-1 !px-2" onClick={() => (run?.state === 'paused' ? run.resume() : run?.pause())}>{view.state === 'paused' ? 'Resume' : 'Pause'}</button>
      </div>

      {spec.backing && (
        <div className="px-4 pt-2 flex flex-col md:flex-row gap-3 items-start">
          {spec.backing.kind === 'youtube' && <YouTube videoId={spec.backing.videoId} onReady={(p) => { ytRef.current = p; }} className="w-full md:w-72 aspect-video rounded-xl overflow-hidden bg-black shrink-0" />}
          {spec.backing.kind === 'record' && (
            <div className="card text-sm w-full md:w-72 shrink-0 space-y-1">
              <div className="label">Stems</div>
              {!recordReady && <div className="text-ink-faint">decoding…</div>}
              {stems.map((st) => (
                <div key={st.key} className="flex items-center gap-2">
                  <button className={`w-16 text-left text-xs rounded px-1.5 py-0.5 ${st.muted ? 'bg-panel-2 text-ink-faint line-through' : 'bg-accent/20 text-ink'}`} onClick={() => setStems((all) => all.map((x) => { if (x.key !== st.key) return x; const m = !x.muted; stemRef.current?.setStem(x.key, x.gain, m); return { ...x, muted: m }; }))}>{st.name}</button>
                  <input type="range" min={0} max={1.5} step={0.05} value={st.gain} className="flex-1" onChange={(e) => { const g = +e.target.value; setStems((all) => all.map((x) => { if (x.key !== st.key) return x; stemRef.current?.setStem(x.key, g, x.muted); return { ...x, gain: g }; })); }} />
                </div>
              ))}
            </div>
          )}
          <div className="card text-sm space-y-2 flex-1">
            <div className="label">{spec.backing.anchorSec !== undefined ? 'Synced automatically' : 'Sync to the track'}</div>
            {spec.backing.anchorSec !== undefined && !armed ? (
              <div className="text-ink-dim">Beat 1 is known for this track — just play. If it drifts, <kbd>space</kbd> on beat 1 re-anchors and updates the saved sync.</div>
            ) : armed ? (
              <div className="text-ink-dim">{spec.backing.kind === 'record' ? '1. The record is playing.' : '1. Play the video.'} 2. Tap <kbd>t</kbd> on a few beats to set the tempo{tapBpm ? <span className="text-ink"> — {tapBpm} bpm</span> : ''}. 3. Press <kbd>space</kbd> (or the sustain pedal) exactly on beat 1 of the form. That's saved — next time it's automatic.</div>
            ) : (
              <div className="text-ink-dim">Drifting? Press <kbd>space</kbd> on beat 1 of the current chord to re-anchor, <kbd>[</kbd>/<kbd>]</kbd> to nudge 50 ms, <kbd>t</kbd>×4 to retap the tempo.</div>
            )}
            <div className="flex flex-wrap gap-2">
              {spec.backing.kind === 'youtube' && <button className="btn btn-ghost !py-1" onClick={() => ytRef.current?.playVideo()}>Play video</button>}
              <button className="btn btn-ghost !py-1" onClick={tapTempo}>Tap tempo{tapBpm ? ` (${tapBpm})` : ''}</button>
              <button className="btn btn-primary !py-1" onClick={goOnOne}>{armed ? 'Go — on beat 1' : 'Re-anchor on 1'}</button>
              <button className="btn btn-ghost !py-1" onClick={() => getAudio().transport.nudge(-0.05)}>−50 ms</button>
              <button className="btn btn-ghost !py-1" onClick={() => getAudio().transport.nudge(0.05)}>+50 ms</button>
            </div>
          </div>
        </div>
      )}
      {/* chord display */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
        {view.state === 'countIn' && <div className="label text-warn">Counting in…</div>}
        <div className="flex items-baseline justify-center gap-[6vw] w-full">
          <div className="w-[18vw] text-right text-[6vw] leading-none text-ink-faint truncate">
            {run?.resultsSoFar.at(-1) && t && run.resultsSoFar.at(-1)!.index === t.index - 1 ? <ChordText chord={run.resultsSoFar.at(-1)!.chord} style={settings.displayStyle} /> : null}
          </div>
          <div key={flashKey.current} className={`${tuneMode ? 'text-[9vw] md:text-[7vw]' : 'text-[16vw] md:text-[13vw]'} leading-none font-semibold tracking-tight ${view.flash === 'good' ? 'flash-good' : view.flash === 'bad' ? 'flash-bad' : ''}`}>
            {t ? <Prompt t={t} spec={spec} revealed={!!view.verdict} style={settings.displayStyle} /> : '—'}
          </div>
          <div className="w-[18vw] text-left text-[6vw] leading-none text-ink-faint truncate">
            {showNext && view.upcoming[0] ? <ChordText chord={view.upcoming[0].chord} style={settings.displayStyle} /> : null}
          </div>
        </div>
        {t && (
          <div className="text-center text-sm text-ink-dim min-h-[3.5rem]">
            {t.pc.roman && spec.prompt !== 'roman' && <span className="mr-3 text-ink-faint">{t.pc.roman}</span>}
            <span>{FAMILY_LABEL[t.voicing.family] ?? t.voicing.family}</span>
            {hintAsText && view.hint >= 1 && tones && <div className="mt-1 text-ink">Chord tones: {tones.memberPcs.map((p) => spellPc(p as PitchClass, 'flat')).join(' ')}</div>}
            {hintAsText && view.hint >= 2 && <div className="text-accent">{t.voicing.label} → {t.voicing.notes.map((n) => noteName(n)).join(' ')}</div>}
            {hintNotes.length > 0 && t.moved.length > 0 && t.held.length > 0 && (
              <div className="text-ink-dim">{t.moved.length === 1 ? 'One note moves' : `${t.moved.length} notes move`}: {t.moved.map((n) => noteName(n)).join(' ')} · {t.held.length} held</div>
            )}
            {view.repeats > 0 && <div className="text-warn">Again — take {view.repeats + 1}</div>}
            {view.verdict && <div className={view.verdict.ok ? 'text-good' : 'text-bad'}>{view.verdict.message}{view.latenessMs !== null && view.verdict.ok ? ` · ${view.latenessMs > 0 ? '+' : ''}${view.latenessMs} ms` : ''}</div>}
          </div>
        )}
        {tuneMode && (
          <div className="w-full max-w-5xl max-h-[42vh] overflow-y-auto px-2">
            {spec.song?.scan && pageUrl && showPage
              ? <PageImage url={pageUrl} boxes={spec.song.scan.boxes} cursor={t?.pc.barIndex} />
              : <ChordGrid bars={gridBars} compact cursor={t?.pc.formIndex} results={view.barResults} />}
            {spec.song?.scan && pageUrl && <button className="text-xs text-ink-faint hover:text-ink mt-1" onClick={() => setShowPage((v) => !v)}>{showPage ? 'show grid' : 'show page'}</button>}
          </div>
        )}
        <div className={`w-full ${tuneMode ? 'max-w-xl' : 'max-w-3xl'} transition-opacity`} style={{ opacity: showDiff || hintNotes.length || hintTones.length || midi.held.length ? 1 : tuneMode ? 0 : 0.25, display: tuneMode && !(showDiff || hintNotes.length || hintTones.length) ? 'none' : undefined }}>
          <Keyboard
            from={KB_FROM}
            to={KB_TO}
            good={showDiff ? view.verdict!.correctNotes : []}
            bad={showDiff ? view.verdict!.wrongNotes : []}
            missed={showDiff ? view.verdict!.missedNotes : []}
            hint={hintNotes}
            moved={hintNotes.length ? (t?.moved ?? []) : []}
            tones={hintTones}
            toneLabels={toneLabels}
            held={showDiff ? [] : midi.held}
            labels
          />
        </div>
      </div>

      {/* controls */}
      <div className="px-4 pb-4 flex items-center gap-2 text-sm">
        {!hintsOff && <button className="btn btn-ghost" onClick={() => run?.hint()}>Hint {view.hint > 0 && <span className="text-accent">{view.hint}/3</span>}</button>}
        {!hintsOff && <button className="btn btn-ghost" onClick={() => t && playVoicing(t.voicing.notes)}>Play it</button>}
        {(spec.pacing.mode === 'free' || (spec.pacing.advance ?? 'onTime') === 'onCorrect') && <button className="btn btn-ghost" onClick={() => run?.skip()} title="Move on even if it is marked wrong (→)">Skip</button>}
        {spec.pacing.mode === 'timed' && <button className="btn btn-ghost tabular-nums" onClick={() => setMetroOpen(true)}>Tempo {view.bpm}</button>}
        <span className="ml-auto text-xs text-ink-faint">{midi.inputMode === 'mic' ? 'microphone' : midi.connected ? midi.deviceName : 'computer keyboard'}{midi.sustain ? ' · pedal' : ''}</span>
        <button className="btn btn-danger" onClick={() => run?.end()}>End</button>
      </div>

      {metroOpen && view.state !== 'paused' && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-bg/95" onClick={() => setMetroOpen(false)}>
          <div className="card w-96 max-w-[96vw] space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="label">Metronome</div>
              <button className="text-ink-faint hover:text-ink text-sm" onClick={() => setMetroOpen(false)}>close</button>
            </div>
            <MetronomePanel value={metro} onChange={setMetro} showTimeSig={false} showCountIn={false} />
            <div className="text-xs text-ink-faint">Also: <kbd>−</kbd>/<kbd>=</kbd> ±1 bpm · <kbd>_</kbd>/<kbd>+</kbd> ±5 · <kbd>m</kbd> opens this. Time signature and count-in are set before the run starts.</div>
          </div>
        </div>
      )}

      {view.state === 'paused' && (
        <div className="fixed inset-0 bg-bg/95 flex items-center justify-center z-30">
          <div className="card w-96 max-w-[92vw] text-center space-y-3">
            <div className="label">Paused</div>
            <div className="text-2xl font-semibold">{view.clean} ✓{view.offTime > 0 && <span className="text-warn"> · {view.offTime} ⏱</span>} · {view.wrong + view.blank} ✗</div>
            {avgLate !== null && <div className="text-ink-dim text-sm">median {avgLate > 0 ? '+' : ''}{avgLate} ms</div>}
            {spec.pacing.mode === 'timed' && <MetronomePanel value={metro} onChange={setMetro} showTimeSig={false} showCountIn={false} />}
            <button className="btn btn-primary w-full" onClick={() => run?.resume()}>Resume</button>
            <button className="btn btn-danger w-full" onClick={() => run?.end()}>End block</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Prompt({ t, spec, revealed, style }: { t: Target; spec: DrillSpec; revealed: boolean; style: 'realbook' | 'plain' }) {
  if (spec.prompt === 'hidden' && !revealed) return <span className="text-ink-faint">?</span>;
  if (spec.prompt === 'roman' && t.pc.roman) return <span className="chord-symbol">{t.pc.key && <span className="text-[0.35em] text-ink-dim align-middle mr-[0.3em]">in {keyName(t.pc.key)}</span>}{t.pc.roman}</span>;
  return <ChordText chord={t.chord} style={style} />;
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-panel-2 px-3 py-1">{children}</span>;
}

/** Interval from the root → the degree name a player reads. */
const DEGREE: Record<number, string> = { 0: '1', 1: 'b9', 2: '9', 3: 'b3', 4: '3', 5: '11', 6: 'b5', 7: '5', 8: 'b13', 9: '13', 10: 'b7', 11: '7' };

/** Fixed keyboard window. Auto-fitting per chord made it jump size on every change. */
const KB_FROM = 36;
const KB_TO = 84;

function noteName(n: number): string {
  const names = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  return `${names[n % 12]}${Math.floor(n / 12) - 1}`;
}
