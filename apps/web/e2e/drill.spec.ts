import { expect, test } from '@playwright/test';

test('free drill: wrong then right advances; review saved', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto('/drill/learn-rootless-iiVI');
  await expect(page.getByRole('heading', { name: 'Learn: rootless ii-V-I' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  // first target is Dm7 rootless A: F3 A3 C4 E4 = 53 57 60 64
  await expect(page.locator('.chord-symbol').first()).toBeVisible();
  await page.evaluate(() => window.__shed!.chord([60, 64, 67]));
  await expect(page.getByText(/missing|not in chord|extra/i)).toBeVisible();
  await page.screenshot({ path: 'test-results/drill-miss.png' });
  await page.evaluate(() => window.__shed!.chord([53, 57, 60, 64]));
  await expect(page.getByText('✓ 1')).toBeVisible();
  // next: G7 rootless B (voice-led): F3 A3 B3 E4 = 53 57 59 64
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__shed!.chord([53, 57, 59, 64]));
  await expect(page.getByText('✓ 2')).toBeVisible();
  await page.screenshot({ path: 'test-results/drill-good.png' });
  await page.getByRole('button', { name: 'End' }).click();
  await expect(page).toHaveURL(/\/review\//);
  await expect(page.getByText('Verdict')).toBeVisible();
  await page.screenshot({ path: 'test-results/review.png' });
});

test('review names the four outcomes and separates late from wrong', async ({ page }) => {
  await page.goto('/drill/rung1-iiVI');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.waitForFunction(() => !!window.__shedTarget, null, { timeout: 15000 });
  // chord 1: right notes, right away. chord 2: right notes, deliberately late.
  const first = await page.evaluate(() => window.__shedTarget!);
  await page.evaluate((ns) => window.__shed!.chord(ns as number[]), first.notes);
  await page.waitForFunction((i) => (window.__shedTarget?.index ?? -1) > (i as number), first.index, { timeout: 10000 });
  const second = await page.evaluate(() => window.__shedTarget!);
  await page.waitForTimeout(900); // well outside the +-120 ms window at 80 bpm
  await page.evaluate((ns) => window.__shed!.chord(ns as number[]), second.notes);
  await page.waitForFunction((i) => (window.__shedTarget?.index ?? -1) > (i as number), second.index, { timeout: 10000 });
  await page.getByRole('button', { name: 'End' }).click();
  await expect(page).toHaveURL(/\/review\//);
  for (const label of ['Clean', 'Late / early', 'Wrong notes', 'Blank']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  // the analytics live behind a fold now: verdict and outcomes first
  await expect(page.getByText('Where it broke')).toBeHidden();
  await page.getByRole('button', { name: /Why \(timing, keys/ }).click();
  await expect(page.getByText('Where it broke')).toBeVisible();
  await expect(page.getByText('Timing')).toBeVisible();
  await page.screenshot({ path: 'test-results/review-outcomes.png', fullPage: true });
});

test('timed drill runs a count-in and grades on the beat', async ({ page }) => {
  await page.goto('/drill/rootless-iiVI-4ths-120');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Counting in…')).toBeVisible();
  await expect(page.getByText('Counting in…')).toBeHidden({ timeout: 5000 });
  await page.evaluate(() => window.__shed!.chord([53, 57, 60, 64]));
  await expect(page.getByText(/Exact|Right notes/)).toBeVisible();
  await page.screenshot({ path: 'test-results/drill-timed.png' });
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused')).toBeVisible();
});

test('today, drills, progress, devices render', async ({ page }) => {
  await page.goto('/');
  // Today leads with the course you are on and one Start button
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.getByText('LH root, RH 3-7')).toBeVisible();
  await page.screenshot({ path: 'test-results/today.png' });
  await page.goto('/drills');
  await expect(page.getByText('Rootless ii-V-I · cycle of 4ths · 120')).toBeVisible();
  await page.getByRole('button', { name: 'New drill' }).click();
  await expect(page.getByText('What to play')).toBeVisible();
  await page.screenshot({ path: 'test-results/editor.png' });
  await page.goto('/devices');
  await expect(page.getByText('Latency calibration')).toBeVisible();
  await page.goto('/progress');
  await expect(page.getByText('Heatmap')).toBeVisible();
});

test('voicings: the ladder, a course, and its stages', async ({ page }) => {
  await page.goto('/voicings');
  await expect(page.getByText('Ten families, in order')).toBeVisible();
  await expect(page.getByText('0/12 keys').first()).toBeVisible();
  await page.getByText('LH root, RH 3-7').first().click();
  await expect(page).toHaveURL(/\/voicings\/root37/);
  // stage 1 is a screen, not a drill: the shape and the sound before you play
  await expect(page.getByText('Show me').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hear the whole ii-V-I' })).toBeVisible();
  await page.screenshot({ path: 'test-results/course.png', fullPage: true });
  await page.getByRole('button', { name: 'Done, next' }).click();
  await page.getByRole('button', { name: 'Start' }).first().click();
  await expect(page).toHaveURL(/\/drill\/course%3Aroot37%3Acopy|\/drill\/course:root37:copy/);
});

test('a tune shows its shape before you play it', async ({ page }) => {
  await page.goto('/tunes/builtin-i-got-rhythm');
  // a tune opens on a stage, not a wall of controls
  await expect(page.getByText(/Stage 1 of 10 · Listen/)).toBeVisible();
  await page.getByRole('button', { name: '4. The map' }).click();
  // the one-line summary: bars, form, key centres, and ii-Vs the analyser found
  await expect(page.getByText(/^32 bars · AABA/)).toBeVisible();
  // the analyser must see ii-Vs that live two-to-a-bar, as nearly all of them do
  await expect(page.getByText(/ii-V-Is \(\d+\)/)).toBeVisible();
  await page.screenshot({ path: 'test-results/tune-shape.png', fullPage: true });
});

test('tunes: library, tune page, play the changes with the band', async ({ page }) => {
  await page.goto('/tunes');
  await expect(page.getByText('I Got Rhythm')).toBeVisible();
  await page.getByText('I Got Rhythm').click();
  await expect(page.getByRole('heading', { name: 'I Got Rhythm' })).toBeVisible();
  await page.screenshot({ path: 'test-results/tune.png' });
  await page.getByRole('button', { name: '5. Guide tones' }).click();
  await page.screenshot({ path: 'test-results/tune-guide.png' });
  await page.getByRole('button', { name: '7. In time' }).click();
  await page.getByRole('button', { name: 'B', exact: true }).click();
  await expect(page.getByText(/bars 17–24/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Play with the band', exact: true }).click();
  await expect(page.getByRole('heading', { name: /I Got Rhythm — play the changes/ })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Counting in…')).toBeHidden({ timeout: 6000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/tune-drill.png' });
  await page.getByRole('button', { name: 'End' }).click();
  await expect(page).toHaveURL(/\/review\//);
});

test('import an iReal link', async ({ page }) => {
  await page.goto('/tunes');
  await page.getByRole('button', { name: 'Import' }).click();
  await page.locator('textarea').fill('irealbook://My%20Import=Doe%20Jane=Medium%20Swing=F=n=T44*A{C-7 F7 |Bb^7 |N1Bb^7 |}N2Bb^7 |Z');
  await page.locator('.card').getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('1 tune imported')).toBeVisible();
  await expect(page.getByText('My Import')).toBeVisible();
});

test('scan page renders and accepts chart text without OCR', async ({ page }) => {
  await page.goto('/scan');
  await expect(page.getByRole('heading', { name: 'Scan a chart' })).toBeVisible();
});

test('the new tunes are in the library as changes', async ({ page }) => {
  await page.goto('/tunes');
  for (const t of ['Tune Up', 'Misty', 'Autumn Leaves']) await expect(page.getByText(t, { exact: true })).toBeVisible();
  await page.goto('/tunes/builtin-autumn-leaves');
  await expect(page.getByRole('heading', { name: 'Autumn Leaves' })).toBeVisible();
  await page.getByRole('button', { name: '4. The map' }).click();
  await expect(page.getByText(/^32 bars/)).toBeVisible();
});

test('timing a head: the click runs, the take is analysed, nothing is failed', async ({ page }) => {
  await page.goto('/melody/builtin-autumn-leaves');
  await expect(page.getByRole('heading', { name: 'Play the head in time' })).toBeVisible();
  // no melody ships, so the default is timing against the click
  await expect(page.getByText(/timed against the click/)).toBeVisible();

  await page.getByRole('button', { name: 'Start' }).click();
  // wait for the count-in to arrive before waiting for it to go: unlocking audio is async, so
  // "not visible yet" and "finished" look identical if you only check for absence
  await expect(page.getByText('Counting in…')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Counting in…')).toBeHidden({ timeout: 8000 });

  // eight notes, roughly a beat apart at 120 — deliberately sloppy, since the point is that it
  // measures rather than judges
  await page.evaluate(async () => {
    const line = [71, 72, 74, 79, 77, 76, 74, 71];
    for (const n of line) {
      window.__shed!.noteOn(n);
      await new Promise((r) => setTimeout(r, 120));
      window.__shed!.noteOff(n);
      await new Promise((r) => setTimeout(r, 380));
    }
  });
  await page.getByRole('button', { name: 'Stop' }).click();

  await expect(page.getByText('How your time was')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Spread', { exact: true })).toBeVisible();
  await expect(page.getByText('Every note against the beat')).toBeVisible();
  // the four facts, none of which a metronome gives you
  await expect(page.getByText('Sits', { exact: true })).toBeVisible();
  await expect(page.getByText('Your tempo', { exact: true })).toBeVisible();
  await expect(page.getByText('Your eighths', { exact: true })).toBeVisible();
  await expect(page.getByText(/Where in the bar/)).toBeVisible();
  // a take you can keep as the reference head for the tune
  await expect(page.getByRole('button', { name: /Save the head|Replace/ })).toBeVisible();
  // and it is remembered
  await expect(page.getByText('Earlier takes')).toBeVisible();
  await page.screenshot({ path: 'test-results/melody-report.png', fullPage: true });
});

test('the click can be moved off the downbeat', async ({ page }) => {
  await page.goto('/melody');
  await page.getByText('Setup', { exact: true }).click();
  await expect(page.getByRole('button', { name: '2 and 4', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'beat 2 only', exact: true }).click();
  await expect(page.getByText(/click on 2 ·/)).toBeVisible();
  await expect(page.getByText(/not on the downbeat/)).toBeVisible();
});
