import { NavLink, Route, Routes, useLocation } from 'react-router';
import Today from './screens/Today';
import Drills from './screens/Drills';
import Drill from './screens/Drill';
import Review from './screens/Review';
import Progress from './screens/Progress';
import Devices from './screens/Devices';
import Voicings from './screens/Voicings';
import Course from './screens/Course';
import Tunes from './screens/Tunes';
import Tune from './screens/Tune';
import Scan from './screens/Scan';
import { useMidiStatus } from './midi/midiService';

function Nav() {
  const midi = useMidiStatus();
  // Five surfaces (docs/11-platform.md). Drills, Scan and Progress are still routed, but they
  // are reached from the surface they belong to rather than competing in the nav.
  const items: Array<[string, string]> = [['/', 'Today'], ['/voicings', 'Voicings'], ['/tunes', 'Tunes'], ['/settings', 'Settings']];
  return (
    <nav className="flex items-center gap-1 px-4 py-2 border-b border-line/60 bg-bg sticky top-0 z-20">
      <span className="font-semibold tracking-tight mr-3 text-accent">Shed</span>
      {items.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm ${isActive ? 'bg-panel-2 text-ink' : 'text-ink-dim hover:text-ink'}`}>{label}</NavLink>
      ))}
      <span className="ml-auto flex items-center gap-2 text-xs text-ink-dim">
        <span className={`inline-block w-2 h-2 rounded-full ${midi.connected ? 'bg-good' : midi.supported ? 'bg-warn' : 'bg-ink-faint'}`} />
        {midi.connected ? midi.deviceName : midi.supported ? 'No MIDI device' : 'MIDI unsupported'}
      </span>
    </nav>
  );
}

export default function App() {
  const loc = useLocation();
  const fullscreen = loc.pathname.startsWith('/drill/');
  return (
    <div className="min-h-full flex flex-col">
      {!fullscreen && <Nav />}
      <main className={fullscreen ? 'flex-1' : 'flex-1 max-w-5xl w-full mx-auto px-4 py-6'}>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/voicings" element={<Voicings />} />
          <Route path="/voicings/:courseId" element={<Course />} />
          <Route path="/drills" element={<Drills />} />
          <Route path="/drill/:id" element={<Drill />} />
          <Route path="/review/:sessionId" element={<Review />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/settings" element={<Devices />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/tunes" element={<Tunes />} />
          <Route path="/tunes/:id" element={<Tune />} />
          <Route path="/scan" element={<Scan />} />
        </Routes>
      </main>
    </div>
  );
}
