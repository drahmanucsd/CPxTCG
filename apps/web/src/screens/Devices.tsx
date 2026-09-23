import { useEffect, useRef, useState } from 'react';
import { formatChord } from '@shed/theory';
import { medianOffsetMs } from '@shed/engine';
import { getAudio, playVoicing, unlockAudio } from '../audio/context';
import { onMidiNote, selectDevice, setInputMode, useComputerKeyboardPiano, useMidiStatus } from '../midi/midiService';
import { useSettings } from '../store/settings';
import { Keyboard } from '../components/Keyboard';
import { FAMILY_LABEL } from '../lib/suffix';

export default function Devices() {
  const midi = useMidiStatus();
  const settings = useSettings();
  useComputerKeyboardPiano(true, 3);
  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Devices & settings</h1>

      <section className="card space-y-3">
        <div className="flex items-center gap-3">
          <div className="label">Input</div>
          <div className="flex gap-1 text-xs">
            <button className={`rounded-full px-3 py-1 ${midi.inputMode === 'midi' ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-dim'}`} onClick={() => void setInputMode('midi')}>MIDI</button>
            <button className={`rounded-full px-3 py-1 ${midi.inputMode === 'mic' ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-dim'}`} onClick={() => void unlockAudio().then(() => setInputMode('mic'))}>Microphone</button>
          </div>
          {midi.inputMode === 'mic' && <div className="flex-1 h-2 rounded-full bg-panel-2 overflow-hidden"><div className="h-full bg-good transition-[width]" style={{ width: `${Math.round(midi.micLevel * 100)}%` }} /></div>}
        </div>
        {midi.micError && <div className="text-bad text-sm">{midi.micError}</div>}
        {midi.inputMode === 'mic' && <div className="text-xs text-ink-dim">Acoustic piano through the laptop mic. Octaves are guessed, so mic drills grade pitch classes (any octave). Stay quiet for a second after switching so the noise floor can settle. Hearing: {midi.micNotes.length ? midi.micNotes.map((n) => noteName(n)).join(' ') : '—'}</div>}
        {!midi.supported && <div className="text-warn text-sm">This browser has no Web MIDI API. Chrome, Edge, Opera and Firefox on desktop/Android support it; Safari and iOS do not. The microphone mode (coming) works everywhere.</div>}
        {midi.error && <div className="text-bad text-sm">{midi.error}</div>}
        {midi.supported && (
          <select className="select" value={settings.midiDeviceId ?? ''} onChange={(e) => selectDevice(e.target.value || null)}>
            <option value="">All connected inputs</option>
            {midi.devices.map((d) => <option key={d.id} value={d.id}>{d.name} {d.state !== 'connected' ? '(disconnected)' : ''}</option>)}
          </select>
        )}
        <div className="text-sm">
          <span className="text-ink-dim">You're playing: </span>
          {midi.held.length ? (
            <span className="font-medium">{midi.ident.slice(0, 2).map((i) => `${formatChord(i.chord, settings.displayStyle)}${i.family ? ` (${FAMILY_LABEL[i.family] ?? i.family} ${i.label})` : ''}`).join('  /  ') || 'notes'}</span>
          ) : <span className="text-ink-faint">nothing — play a chord</span>}
        </div>
        <Keyboard held={midi.held} labels />
        <div className="text-xs text-ink-faint">No piano handy? Computer keys work here: z–m is one octave, q–p the next; , and . shift octaves.</div>
      </section>

      <LatencyCalibration />

      <section className="card flex flex-wrap items-center gap-3 text-sm">
        <div>
          <div className="label">Build</div>
          <div className="text-ink-dim tabular-nums mt-0.5">{__BUILD__}</div>
        </div>
        <button className="btn btn-ghost !py-1 ml-auto" onClick={() => {
          void (async () => {
            const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
            await Promise.all(regs.map((r) => r.unregister()));
            const keys = await caches?.keys?.() ?? [];
            await Promise.all(keys.map((k) => caches.delete(k)));
            window.location.reload();
          })();
        }}>Force update</button>
      </section>


      <section className="card space-y-4">
        <div className="label">Display</div>
        <label className="flex items-center justify-between text-sm">Chord symbols
          <select className="select" value={settings.displayStyle} onChange={(e) => settings.set({ displayStyle: e.target.value as 'realbook' | 'plain' })}><option value="realbook">Real Book (Δ − ø °)</option><option value="plain">Plain (maj7 m7 m7b5 dim7)</option></select>
        </label>
        <label className="flex items-center justify-between text-sm">Hints
          <select className="select" value={settings.hintStyle} onChange={(e) => settings.set({ hintStyle: e.target.value as 'text' | 'keyboard' | 'both' | 'off' })}>
            <option value="both">On the keyboard and as text</option>
            <option value="keyboard">On the keyboard only</option>
            <option value="text">As text only</option>
            <option value="off">Never show me the notes</option>
          </select>
        </label>
        <div className="text-xs text-ink-dim">Hint 1 outlines the chord tones on the keyboard with their degrees, hint 2 shows the actual voicing, hint 3 plays it.</div>
        <label className="flex items-center justify-between text-sm">Speak chord names (hands-free)<input type="checkbox" checked={settings.speakPrompts} onChange={(e) => settings.set({ speakPrompts: e.target.checked })} /></label>
      </section>

      <section className="card space-y-4">
        <div className="label">Sound</div>
        <label className="flex items-center justify-between text-sm">Click volume<input type="range" min={0} max={1} step={0.05} value={settings.clickVolume} onChange={(e) => settings.set({ clickVolume: +e.target.value })} /></label>
        <label className="flex items-center justify-between text-sm">Piano volume<input type="range" min={0} max={1} step={0.05} value={settings.pianoVolume} onChange={(e) => settings.set({ pianoVolume: +e.target.value })} /></label>
        <button className="btn btn-ghost" onClick={() => { void unlockAudio().then(() => playVoicing([53, 57, 60, 64])); }}>Test piano</button>
      </section>
    </div>
  );
}

function LatencyCalibration() {
  const settings = useSettings();
  const [running, setRunning] = useState(false);
  const [taps, setTaps] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const clicks = useRef<number[]>([]);
  const tapTimes = useRef<number[]>([]);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => () => stopRef.current(), []);

  const start = async () => {
    await unlockAudio();
    const { transport, clock } = getAudio();
    clicks.current = []; tapTimes.current = []; setTaps(0); setResult(null); setRunning(true);
    transport.bpm = 100; transport.countInBars = 0; transport.timeSig = { beats: 4, unit: 4 };
    const offBeat = transport.on('beat', (b) => { clicks.current.push(b.time); });
    const offNote = onMidiNote((e) => { if (e.type === 'on') { tapTimes.current.push(e.time); setTaps(tapTimes.current.length); } });
    const kd = (ev: KeyboardEvent) => { if (ev.key === ' ') { ev.preventDefault(); tapTimes.current.push(clock.now()); setTaps(tapTimes.current.length); } };
    window.addEventListener('keydown', kd);
    transport.start();
    const stop = () => { transport.stop(); offBeat(); offNote(); window.removeEventListener('keydown', kd); setRunning(false); };
    stopRef.current = stop;
    setTimeout(() => {
      stop();
      const m = medianOffsetMs(clicks.current, tapTimes.current);
      setResult(m);
      if (m !== null) settings.set({ latencyOffsetMs: m, calibratedAt: Date.now() });
    }, 9000);
  };
  return (
    <section className="card space-y-3">
      <div className="label">Latency calibration</div>
      <div className="text-sm text-ink-dim">Tap a key on your piano (or the space bar) on every click for 8 clicks. We measure how late your notes arrive and shift the grading window so you're never called late when you weren't.</div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={running} onClick={() => void start()}>{running ? `Listening… ${taps} taps` : 'Calibrate'}</button>
        {settings.calibratedAt && <span className="text-xs text-ink-faint ml-2">last measured {new Date(settings.calibratedAt).toLocaleDateString()}</span>}
        <span className="text-sm">Current offset: <span className="font-medium">{settings.latencyOffsetMs} ms</span>{result !== null && <span className="text-good ml-2">measured {result} ms</span>}{result === null && taps > 0 && !running && <span className="text-warn ml-2">not enough clean taps — try again</span>}</span>
        <button className="btn btn-ghost !py-1" onClick={() => settings.set({ latencyOffsetMs: 0 })}>Reset</button>
      </div>
    </section>
  );
}

function noteName(n: number): string { return ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][n % 12]! + (Math.floor(n / 12) - 1); }
