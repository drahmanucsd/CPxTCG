/**
 * Screenshot pass: drives the real app to produce the screen views used in the deck.
 * One test = one browser profile, so the practice history seeded at the start is there
 * when Today and Progress are captured at the end.
 * Run: pnpm --filter @shed/web build && PW_CHROMIUM=… npx playwright test shots --workers=1
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'test-results/shots';
mkdirSync(OUT, { recursive: true });
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const target = (page: Page) => page.evaluate(() => window.__shedTarget);
const play = (page: Page, notes: number[], hold = 160) =>
  page.evaluate(([ns, h]) => window.__shed!.chord(ns as number[], h as number), [notes, hold]);
const bend = (notes: number[], i = 1) => notes.map((n, k) => (k === i ? n + 1 : n));

async function answer(page: Page, wrong = false) {
  const t = await target(page);
  if (!t) return null;
  await play(page, wrong ? bend(t.notes) : t.notes);
  await page.waitForTimeout(wrong ? 140 : 430);
  return t;
}
async function nextTarget(page: Page, from: number) {
  await page.waitForFunction((i) => (window.__shedTarget?.index ?? -1) > (i as number), from, { timeout: 8000 });
  return (await target(page))!;
}
const started = (page: Page) => page.waitForFunction(() => !!window.__shedTarget, null, { timeout: 15000 });
const onDrill = (page: Page) => /\/drill\//.test(page.url());
/** A drill ends either because we press End or because it ran out of chords. Handle both. */
async function finishDrill(page: Page) {
  if (onDrill(page)) {
    const end = page.getByRole('button', { name: 'End' });
    if (await end.isVisible().catch(() => false)) await end.click();
  }
  await expect(page).toHaveURL(/\/review\//, { timeout: 15000 });
}

test('screen views', async ({ page }) => {
  test.setTimeout(420_000);

  // --- onboard
  await page.goto('/');
  await page.getByText('Chasing fluency').click();

  // --- real practice history: consistent misses in a few keys, so the heatmap has cold cells
  //     and Today can build a weak-spot block out of them
  const WEAK = /^(Eb|Ab|Db)/;
  const runFree = async (drill: string, reps: number) => {
    await page.goto(`/drill/${drill}`);
    await page.getByRole('button', { name: 'Start' }).click();
    await started(page);
    for (let i = 0; i < reps; i++) {
      const t = await target(page);
      if (!t) break;
      if (!onDrill(page)) break;
      if (WEAK.test(t.chord)) {
        await play(page, bend(t.notes));           // wrong, and left wrong
        await page.waitForTimeout(140);
        await page.getByRole('button', { name: 'Skip' }).click();
        await page.waitForTimeout(120);
      } else {
        await play(page, t.notes);
        await page.waitForTimeout(430);
      }
    }
    await finishDrill(page);
  };
  const runTimed = async (drill: string, reps: number) => {
    await page.goto(`/drill/${drill}`);
    await page.getByRole('button', { name: 'Start' }).click();
    await started(page);
    await expect(page.getByText('Count-in')).toBeHidden({ timeout: 8000 });
    for (let i = 0; i < reps; i++) {
      const t = await target(page);
      if (!t) break;
      if (!onDrill(page)) break;
      await play(page, WEAK.test(t.chord) ? bend(t.notes) : t.notes);   // a miss is simply left to expire
      await nextTarget(page, t.index).catch(() => null);
    }
    await finishDrill(page);
  };

  for (let pass = 0; pass < 3; pass++) await runFree('learn-rootless-iiVI', 36);
  await runFree('drop2-any-inversion', 16);
  await runTimed('rootless-iiVI-4ths-120', 12);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/review.png` });

  // --- timed drill, a genuine miss with the fix on the keyboard
  await page.goto('/drill/rootless-iiVI-4ths-120');
  await page.getByRole('button', { name: 'Start' }).click();
  await started(page);
  await expect(page.getByText('Count-in')).toBeHidden({ timeout: 8000 });
  const first = await answer(page, false);            // one clean chord, so the counters read 1 / 0
  const second = await nextTarget(page, first!.index); // wrong on the FIRST attempt of a fresh chord
  await play(page, bend(second.notes, 0));
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${OUT}/drill-miss.png` });
  await finishDrill(page);

  // --- free drill with the hint ladder open
  await page.goto('/drill/learn-rootless-iiVI');
  await page.getByRole('button', { name: 'Start' }).click();
  await started(page);
  await answer(page, false);
  await page.getByRole('button', { name: /Hint/ }).click();
  await page.getByRole('button', { name: /Hint/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/drill-hint.png` });
  await finishDrill(page);

  // --- a tune, chart with the bar cursor and per-bar results
  await page.goto('/tunes');
  await page.getByText('I Got Rhythm').click();
  await page.getByRole('button', { name: /Play with the band/ }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await started(page);
  await expect(page.getByText('Count-in')).toBeHidden({ timeout: 8000 });
  for (let i = 0; i < 9; i++) await answer(page, i === 3 || i === 6);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/drill-tune.png` });
  await finishDrill(page);

  // --- the rest
  await page.goto('/');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/today.png` });

  await page.goto('/progress');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/progress.png` });

  await page.goto('/drills');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/drills.png` });
  await page.getByRole('button', { name: 'New drill' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/drill-editor.png` });

  await page.goto('/tunes');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/tunes.png` });

  await page.goto('/tunes/builtin-body-and-soul');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/tune.png` });
  await page.getByText('Guide tones').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/tune-guide.png` });

  await page.goto('/devices');
  await page.evaluate(() => { for (const n of [53, 57, 60, 64]) window.__shed!.noteOn(n); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/devices.png` });
});
