import { useEffect, useRef, useState } from 'react';
import { formatChord } from '@shed/theory';
import { medianOffsetMs } from '@shed/engine';
import { getAudio, playVoicing, unlockAudio } from '../audio/context';
import { onMidiNote, selectDevice, useComputerKeyboardPiano, useMidiStatus } from '../midi/midiService';
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
        <div className="label">MIDI input</div>
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

      <section className="card space-y-4">
        <div className="label">Display</div>
        <label className="flex items-center justify-between text-sm">Chord symbols
          <select className="select" value={settings.displayStyle} onChange={(e) => settings.set({ displayStyle: e.target.value as 'realbook' | 'plain' })}><option value="realbook">Real Book (Δ − ø °)</option><option value="plain">Plain (maj7 m7 m7b5 dim7)</option></select>
        </label>
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
      if (m !== null) settings.set({ latencyOffsetMs: m });
    }, 9000);
  };
  return (
    <section className="card space-y-3">
      <div className="label">Latency calibration</div>
      <div className="text-sm text-ink-dim">Tap a key on your piano (or the space bar) on every click for 8 clicks. We measure how late your notes arrive and shift the grading window so you're never called late when you weren't.</div>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={running} onClick={() => void start()}>{running ? `Listening… ${taps} taps` : 'Calibrate'}</button>
        <span className="text-sm">Current offset: <span className="font-medium">{settings.latencyOffsetMs} ms</span>{result !== null && <span className="text-good ml-2">measured {result} ms</span>}{result === null && taps > 0 && !running && <span className="text-warn ml-2">not enough clean taps — try again</span>}</span>
        <button className="btn btn-ghost !py-1" onClick={() => settings.set({ latencyOffsetMs: 0 })}>Reset</button>
      </div>
    </section>
  );
}
