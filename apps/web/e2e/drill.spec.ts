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
  await expect(page.getByText('Session review')).toBeVisible();
  await page.screenshot({ path: 'test-results/review.png' });
});

test('timed drill runs a count-in and grades on the beat', async ({ page }) => {
  await page.goto('/drill/rootless-iiVI-4ths-120');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Count-in')).toBeVisible();
  await expect(page.getByText('Count-in')).toBeHidden({ timeout: 5000 });
  await page.evaluate(() => window.__shed!.chord([53, 57, 60, 64]));
  await expect(page.getByText(/Exact|Right notes/)).toBeVisible();
  await page.screenshot({ path: 'test-results/drill-timed.png' });
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused')).toBeVisible();
});

test('today, drills, progress, devices render', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Where are you?')).toBeVisible();
  await page.getByText('Chasing fluency').click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
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
