import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { PRESETS, type DrillSpec } from '@shed/engine';
import { FAMILIES, STRICTNESS_LABEL, TURNAROUNDS, BLUES_FORMS, PC_NAMES_FLAT, type KeyOrder, type Strictness } from '@shed/theory';
import { db } from '../db';
import { FAMILY_LABEL } from '../lib/suffix';

const ORDERS: Array<[KeyOrder, string]> = [['fourths', 'Cycle of 4ths'], ['fifths', 'Cycle of 5ths'], ['chromaticUp', 'Chromatic up'], ['chromaticDown', 'Chromatic down'], ['wholeStepUp', 'Whole steps up'], ['wholeStepDown', 'Whole steps down'], ['minorThirds', 'Minor 3rds'], ['random', 'Random']];
const SUFFIXES = ['maj7', '6', 'm7', 'm6', '7', '7b9', '7#11', '7alt', '7sus4', 'm7b5', 'dim7', 'mMaj7', '+7', 'maj7#11'];

export default function Drills() {
  const custom = useLiveQuery(() => db.drills.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const [editing, setEditing] = useState<DrillSpec | null>(null);
  const groups: Array<[string, DrillSpec[]]> = [
    ['Start here', PRESETS.filter((p) => p.tags?.includes('beginner'))],
    ['Core', PRESETS.filter((p) => p.tags?.includes('core'))],
    ['Drop voicings', PRESETS.filter((p) => p.tags?.includes('drop'))],
    ['Advanced', PRESETS.filter((p) => p.tags?.includes('advanced'))],
    ['Tunes & forms', PRESETS.filter((p) => p.tags?.includes('tunes'))],
  ];
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Drills</h1>
        <button className="btn btn-primary" onClick={() => setEditing(blankSpec())}>New drill</button>
      </div>
      {custom.length > 0 && (
        <section>
          <div className="label mb-3">Mine</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {custom.map((d) => <DrillCard key={d.id} spec={d.spec} onEdit={() => setEditing(d.spec)} onDelete={() => void db.drills.delete(d.id)} />)}
          </div>
        </section>
      )}
      {groups.map(([title, specs]) => specs.length > 0 && (
        <section key={title}>
          <div className="label mb-3">{title}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {specs.map((s) => <DrillCard key={s.id} spec={s} onEdit={() => setEditing({ ...s, id: crypto.randomUUID(), name: `${s.name} (copy)` })} />)}
          </div>
        </section>
      ))}
      {editing && <Editor spec={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function DrillCard({ spec, onEdit, onDelete }: { spec: DrillSpec; onEdit: () => void; onDelete?: () => void }) {
  return (
    <div className="card flex flex-col gap-2">
      <Link to={`/drill/${spec.id}`} className="font-medium hover:text-accent">{spec.name}</Link>
      {spec.description && <div className="text-sm text-ink-dim">{spec.description}</div>}
      <div className="text-xs text-ink-faint mt-auto flex flex-wrap gap-x-3 gap-y-1">
        <span>{spec.families.map((f) => FAMILY_LABEL[f] ?? f).join(' / ')}</span>
        <span>{spec.pacing.mode === 'free' ? 'free time' : `${spec.pacing.bpm} bpm`}</span>
        <span>{STRICTNESS_LABEL[spec.strictness].toLowerCase()}</span>
      </div>
      <div className="flex gap-2 mt-1">
        <Link to={`/drill/${spec.id}`} className="btn btn-primary !py-1.5 flex-1">Start</Link>
        <button className="btn btn-ghost !py-1.5" onClick={onEdit}>{onDelete ? 'Edit' : 'Customize'}</button>
        {onDelete && <button className="btn btn-danger !py-1.5" onClick={onDelete}>Delete</button>}
      </div>
    </div>
  );
}

export function blankSpec(): DrillSpec {
  return {
    id: crypto.randomUUID(), name: 'My drill', generator: { kind: 'iiVI', order: 'fourths' }, families: ['rootlessA', 'rootlessB'], strictness: 'shape', voiceLeading: 'strict',
    pacing: { mode: 'timed', bpm: 100, beatsPerChord: 4, countInBars: 1, timeSig: { beats: 4, unit: 4 }, holdMs: 350 }, lookAhead: 'always', length: { passes: 1 }, prompt: 'symbol',
  };
}

function Editor({ spec: initialSpec, onClose }: { spec: DrillSpec; onClose: () => void }) {
  const [s, setS] = useState<DrillSpec>(structuredClone(initialSpec));
  const up = (patch: Partial<DrillSpec>) => setS((x) => ({ ...x, ...patch }));
  const g = s.generator;
  const setG = (patch: Record<string, unknown>) => up({ generator: { ...g, ...patch } as DrillSpec['generator'] });
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const save = async () => {
    const now = Date.now();
    await db.drills.put({ id: s.id, spec: s, createdAt: now, updatedAt: now, custom: true });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-40 bg-bg/80 backdrop-blur flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl space-y-5 my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <input className="input flex-1 text-lg" value={s.name} onChange={(e) => up({ name: e.target.value })} />
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void save()}>Save</button>
        </div>

        <Section title="What to play">
          <Row label="Generator">
            <select className="select" value={g.kind} onChange={(e) => {
              const kind = e.target.value as DrillSpec['generator']['kind'];
              const defaults: Record<string, DrillSpec['generator']> = {
                random: { kind: 'random', suffixes: ['maj7', 'm7', '7'], smart: true }, iiVI: { kind: 'iiVI', order: 'fourths' }, cycle: { kind: 'cycle', suffix: '7', order: 'fourths' },
                turnaround: { kind: 'turnaround', id: 'IviiiV', order: 'fourths' }, blues: { kind: 'blues', id: 'jazz', tonic: 5 }, custom: { kind: 'custom', text: '| Dm7 G7 | Cmaj7 % |' },
              };
              up({ generator: defaults[kind]! });
            }}>
              <option value="random">Random chords</option><option value="iiVI">ii-V-I in 12 keys</option><option value="cycle">One chord type around a cycle</option>
              <option value="turnaround">Turnaround / cell</option><option value="blues">Blues form</option><option value="custom">Custom progression</option>
            </select>
          </Row>
          {g.kind === 'random' && (
            <>
              <Row label="Chord types"><Toggles options={SUFFIXES} value={g.suffixes} onChange={(suffixes) => setG({ suffixes })} /></Row>
              <Row label="Smart random"><input type="checkbox" checked={!!g.smart} onChange={(e) => setG({ smart: e.target.checked })} /> <span className="text-xs text-ink-dim">weight towards your weak spots</span></Row>
            </>
          )}
          {(g.kind === 'iiVI' || g.kind === 'cycle' || g.kind === 'turnaround') && (
            <Row label="Key order">
              <select className="select" value={g.order} onChange={(e) => setG({ order: e.target.value })}>
                {ORDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                {g.kind === 'turnaround' && <option value="single">One key</option>}
              </select>
            </Row>
          )}
          {g.kind === 'iiVI' && (
            <>
              <Row label="Shape"><select className="select" value={g.shape ?? 'iiVI'} onChange={(e) => setG({ shape: e.target.value })}><option value="iiVI">ii – V – I</option><option value="iiV">ii – V</option><option value="VI">V – I</option><option value="iiVIVI">ii – V – I – VI</option></select></Row>
              <Row label="Minor"><input type="checkbox" checked={!!g.minor} onChange={(e) => setG({ minor: e.target.checked })} /></Row>
              <Row label="Altered V"><input type="checkbox" checked={!!g.altered} onChange={(e) => setG({ altered: e.target.checked })} /></Row>
            </>
          )}
          {g.kind === 'cycle' && <Row label="Chord type"><select className="select" value={g.suffix} onChange={(e) => setG({ suffix: e.target.value })}>{SUFFIXES.map((x) => <option key={x} value={x}>{x}</option>)}</select></Row>}
          {g.kind === 'turnaround' && (
            <>
              <Row label="Cell"><select className="select" value={g.id} onChange={(e) => setG({ id: e.target.value })}>{Object.entries(TURNAROUNDS).map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}</select></Row>
              {g.order === 'single' && <Row label="Key"><KeySelect value={g.tonic ?? 0} onChange={(tonic) => setG({ tonic })} /></Row>}
            </>
          )}
          {g.kind === 'blues' && (
            <>
              <Row label="Form"><select className="select" value={g.id} onChange={(e) => setG({ id: e.target.value })}>{Object.entries(BLUES_FORMS).map(([id, b]) => <option key={id} value={id}>{b.name}</option>)}</select></Row>
              <Row label="Key"><KeySelect value={g.tonic} onChange={(tonic) => setG({ tonic })} /></Row>
            </>
          )}
          {g.kind === 'custom' && (
            <Row label="Chords">
              <textarea className="input w-full font-mono" rows={3} value={g.text} onChange={(e) => setG({ text: e.target.value })} placeholder="| Dm7 G7 | Cmaj7 % |  or  ii-7 V7 IΔ7" />
              <div className="text-xs text-ink-faint mt-1">Bars with |, % repeats, roman numerals allowed (key below).</div>
              <div className="mt-2 flex items-center gap-2 text-xs"><span>Key for numerals</span><KeySelect value={g.key?.tonic ?? 0} onChange={(tonic) => setG({ key: { tonic, mode: g.key?.mode ?? 'major' } })} /></div>
            </Row>
          )}
        </Section>

        <Section title="How to play it">
          <Row label="Voicing families"><Toggles options={FAMILIES.map((f) => f.id)} value={s.families} onChange={(families) => up({ families })} render={(f) => FAMILY_LABEL[f] ?? f} /></Row>
          <Row label="Voice leading">
            <select className="select" value={s.voiceLeading} onChange={(e) => up({ voiceLeading: e.target.value as DrillSpec['voiceLeading'] })}>
              <option value="strict">On — play the voice-led voicing</option><option value="off">Off — any voicing in the family</option>
            </select>
          </Row>
          <Row label="Strictness">
            <select className="select" value={s.strictness} onChange={(e) => up({ strictness: e.target.value as Strictness })}>
              {(Object.keys(STRICTNESS_LABEL) as Strictness[]).map((k) => <option key={k} value={k}>{STRICTNESS_LABEL[k]}</option>)}
            </select>
          </Row>
          <Row label="Prompt">
            <select className="select" value={s.prompt ?? 'symbol'} onChange={(e) => up({ prompt: e.target.value as DrillSpec['prompt'] })}>
              <option value="symbol">Chord symbol</option><option value="roman">Roman numeral (when available)</option><option value="hidden">Hidden until you play</option>
            </select>
          </Row>
        </Section>

        <Section title="Pacing">
          <Row label="Mode">
            <select className="select" value={s.pacing.mode} onChange={(e) => up({ pacing: { ...s.pacing, mode: e.target.value as 'free' | 'timed' } })}><option value="free">Free — wait until correct</option><option value="timed">Timed — metronome</option></select>
          </Row>
          {s.pacing.mode === 'timed' && (
            <>
              <Row label="Tempo"><input type="number" className="input w-24" min={30} max={300} value={s.pacing.bpm} onChange={(e) => up({ pacing: { ...s.pacing, bpm: +e.target.value } })} /> <span className="text-xs text-ink-dim">bpm</span></Row>
              <Row label="Beats per chord"><select className="select" value={s.pacing.beatsPerChord} onChange={(e) => up({ pacing: { ...s.pacing, beatsPerChord: +e.target.value } })}>{[1, 2, 4, 8].map((b) => <option key={b} value={b}>{b}</option>)}</select>
                {(g.kind === 'blues' || g.kind === 'custom') && <label className="ml-3 text-xs text-ink-dim"><input type="checkbox" checked={!!s.pacing.overrideBeats} onChange={(e) => up({ pacing: { ...s.pacing, overrideBeats: e.target.checked } })} /> override the form's rhythm</label>}
              </Row>
              <Row label="Count-in"><select className="select" value={s.pacing.countInBars} onChange={(e) => up({ pacing: { ...s.pacing, countInBars: +e.target.value } })}><option value={0}>None</option><option value={1}>1 bar</option><option value={2}>2 bars</option></select></Row>
              <Row label="Look-ahead"><select className="select" value={s.lookAhead} onChange={(e) => up({ lookAhead: e.target.value as DrillSpec['lookAhead'] })}><option value="always">Show next chord</option><option value="lastBeat">Only on the last beat</option><option value="never">Never</option></select></Row>
              <Row label="Speed ladder">
                <label className="text-sm"><input type="checkbox" checked={!!s.ladder} onChange={(e) => up({ ladder: e.target.checked ? { up: 4, down: 6, min: 40, max: 260 } : undefined })} /> on</label>
                {s.ladder && <span className="ml-3 text-xs text-ink-dim">+<input type="number" className="input w-16 !py-1" value={s.ladder.up} onChange={(e) => up({ ladder: { ...s.ladder!, up: +e.target.value } })} /> clean pass · −<input type="number" className="input w-16 !py-1" value={s.ladder.down} onChange={(e) => up({ ladder: { ...s.ladder!, down: +e.target.value } })} /> miss</span>}
              </Row>
            </>
          )}
          <Row label="Length">
            <select className="select" value={s.length.minutes ? 'minutes' : s.length.reps ? 'reps' : 'passes'} onChange={(e) => {
              const v = e.target.value; up({ length: v === 'minutes' ? { minutes: 5 } : v === 'reps' ? { reps: 24 } : { passes: 1 } });
            }}><option value="passes">Passes through the progression</option><option value="reps">Number of chords</option><option value="minutes">Minutes</option></select>
            <input type="number" className="input w-20 ml-2" min={1} value={s.length.minutes ?? s.length.reps ?? s.length.passes ?? 1} onChange={(e) => {
              const n = +e.target.value; up({ length: s.length.minutes ? { minutes: n } : s.length.reps ? { reps: n } : { passes: n } });
            }} />
          </Row>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><div className="label">{title}</div>{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[140px_1fr] items-center gap-3 text-sm"><div className="text-ink-dim">{label}</div><div>{children}</div></div>;
}
function Toggles({ options, value, onChange, render }: { options: string[]; value: string[]; onChange: (v: string[]) => void; render?: (o: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return <button key={o} className={`rounded-full px-3 py-1 text-xs border ${on ? 'bg-accent text-bg border-accent' : 'border-line text-ink-dim hover:text-ink'}`} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>{render ? render(o) : o}</button>;
      })}
    </div>
  );
}
function KeySelect({ value, onChange }: { value: number; onChange: (v: import('@shed/theory').PitchClass) => void }) {
  return <select className="select" value={value} onChange={(e) => onChange(+e.target.value as import('@shed/theory').PitchClass)}>{PC_NAMES_FLAT.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>;
}
