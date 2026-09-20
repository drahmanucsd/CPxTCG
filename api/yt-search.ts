/**
 * Vercel serverless function: YouTube backing-track search.
 * Needs YOUTUBE_API_KEY in the deployment environment; without it the app falls back to paste-a-URL.
 *   GET /api/yt-search?q=all+the+things+you+are+backing+track
 */
export default async function handler(req: { query?: Record<string, string | string[]>; url?: string }, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  const key = process.env['YOUTUBE_API_KEY'];
  const q = typeof req.query?.['q'] === 'string' ? req.query['q'] : new URL(req.url ?? '', 'http://x').searchParams.get('q') ?? '';
  if (!key) return res.status(501).json({ error: 'YOUTUBE_API_KEY not configured' });
  if (!q) return res.status(400).json({ error: 'q required' });
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=8&q=${encodeURIComponent(q)}&key=${key}`;
  const r = await fetch(url);
  if (!r.ok) return res.status(502).json({ error: `youtube ${r.status}` });
  const data = (await r.json()) as { items: Array<{ id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { default: { url: string } } } }> };
  return res.status(200).json({ items: data.items.map((i) => ({ videoId: i.id.videoId, title: i.snippet.title, channel: i.snippet.channelTitle, thumb: i.snippet.thumbnails.default.url })) });
}
