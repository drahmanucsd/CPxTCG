import { useEffect, useMemo, useRef, useState } from 'react';
import { BackLink } from '../components/BackLink';
import { useNavigate } from 'react-router';
import { layoutChart, layoutToChartText, parseChartText, slug, type OcrWord, type ScanLayout } from '@shed/theory';
import { canvasToBlob, fileToPages, ocrPage, type Page } from '../lib/ocr';
import { db } from '../db';
import { saveSong } from '../lib/songs';

export default function Scan() {
  const nav = useNavigate();
  const [pages, setPages] = useState<Page[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [words, setWords] = useState<OcrWord[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [barsPerSystem, setBarsPerSystem] = useState(4);
  const [title, setTitle] = useState('');
  const [key, setKey] = useState('C');
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const page = pages[pageIdx];

  const layout: ScanLayout | null = useMemo(() => (page && words ? layoutChart(words, { barsPerSystem, pageWidth: page.width, pageHeight: page.height }) : null), [page, words, barsPerSystem]);
  useEffect(() => { if (layout && !edited) setText(layoutToChartText(layout, { title: title || 'Scanned tune', key })); }, [layout, title, key, edited]);

  const onFile = async (f: File) => {
    setError(null); setWords(null); setEdited(false);
    try {
      const p = await fileToPages(f);
      setPages(p); setPageIdx(0);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    } catch (e) { setError((e as Error).message); }
  };
  const run = async () => {
    if (!page) return;
    setProgress(0); setError(null);
    try { setWords(await ocrPage(page, setProgress)); }
    catch (e) { setError(`OCR failed: ${(e as Error).message}. The recognizer downloads its model (~15 MB) on first use — check your connection.`); }
    finally { setProgress(null); }
  };
  const save = async () => {
    if (!page || !layout) return;
    try {
      const song = parseChartText(text, `scan-${slug(title || 'scanned')}-${Date.now().toString(36)}`);
      song.source = 'scan';
      const imageId = `img-${song.id}`;
      const blob = await canvasToBlob(page.canvas);
      await db.images.put({ id: imageId, blob, width: page.width, height: page.height, createdAt: Date.now() });
      // boxes per written bar: the layout's bars line up with the chart text bars when the user hasn't restructured it
      const boxes = song.bars.map((_, i) => { const b = layout.bars[i]; return b ? { x: b.box.x / page.width, y: b.box.y / page.height, w: b.box.w / page.width, h: b.box.h / page.height } : null; });
      song.scan = { imageId, boxes };
      await saveSong(song);
      nav(`/tunes/${encodeURIComponent(song.id)}`);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <BackLink to="/tunes" label="Tunes" />
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Scan a chart</h1>
        <p className="text-ink-dim text-sm mt-1">Photograph or upload a lead-sheet page (image or PDF). The chord symbols are read on this device, laid into bars, and you fix anything it got wrong before saving. The page image stays local and becomes your practice view.</p>
      </div>
      <div className="card flex flex-wrap items-center gap-3">
        <label className="btn btn-primary cursor-pointer">Choose image / PDF<input type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} /></label>
        {pages.length > 1 && <select className="select" value={pageIdx} onChange={(e) => { setPageIdx(+e.target.value); setWords(null); }}>{pages.map((_, i) => <option key={i} value={i}>Page {i + 1}</option>)}</select>}
        {page && <button className="btn btn-ghost" onClick={() => void run()} disabled={progress !== null}>{progress === null ? (words ? 'Read again' : 'Read the chords') : `Reading… ${Math.round(progress * 100)}%`}</button>}
        {layout && <label className="text-sm flex items-center gap-2">Bars per line <input type="number" className="input w-16" min={1} max={8} value={barsPerSystem} onChange={(e) => { setBarsPerSystem(+e.target.value); setEdited(false); }} /></label>}
        {error && <span className="text-bad text-sm">{error}</span>}
      </div>
      {page && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-2 overflow-auto max-h-[75vh]" ref={imgRef}>
            <PageView page={page} layout={layout} />
          </div>
          <div className="card space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Title<input className="input w-full" value={title} onChange={(e) => { setTitle(e.target.value); }} /></label>
              <label className="text-sm">Key<input className="input w-full" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Eb, F, Bb-" /></label>
            </div>
            <div className="text-xs text-ink-dim">{layout ? `${layout.bars.length} bars in ${layout.systems.length} lines · ${layout.ignored.length} words ignored` : 'Read the chords to fill this in, or type the chart yourself.'}</div>
            <textarea className="input w-full font-mono text-xs" rows={14} value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} placeholder={'title: …\nkey: F | time: 4/4\n[A] Gm7 C7 | F6 | …'} />
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={() => void save()} disabled={!text.trim()}>Save to my tunes</button>
              {edited && layout && <button className="btn btn-ghost" onClick={() => setEdited(false)}>Reset to detected</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PageView({ page, layout }: { page: Page; layout: ScanLayout | null }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => { setUrl(page.canvas.toDataURL('image/jpeg', 0.8)); }, [page]);
  return (
    <div className="relative inline-block w-full">
      <img src={url} alt="page" className="w-full block" />
      {layout && (
        <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${page.width} ${page.height}`} preserveAspectRatio="none">
          {layout.bars.map((b) => (
            <g key={b.index}>
              <rect x={b.box.x} y={b.box.y} width={b.box.w} height={b.box.h} fill={b.chords.length ? 'rgba(232,179,74,0.10)' : 'rgba(255,92,92,0.10)'} stroke="rgba(232,179,74,0.7)" strokeWidth={2} />
              <text x={b.box.x + 6} y={b.box.y + b.box.h - 6} fontSize={Math.max(14, b.box.h / 6)} fill="#e8b34a" fontWeight={600}>{b.chords.map((c) => c.chord.text).join(' ')}</text>
            </g>
          ))}
          {layout.ignored.map((w, i) => <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} fill="none" stroke="rgba(154,164,178,0.5)" strokeDasharray="4 3" />)}
        </svg>
      )}
    </div>
  );
}
