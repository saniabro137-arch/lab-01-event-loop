import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function join(page: Page, path: string, name: string, room: string) {
  await page.goto(path);
  await page.locator('#name').fill(name);
  await page.locator('#room').fill(room);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Підключено');
}

async function remoteShipPosition(page: Page) {
  return page.locator('#arena').evaluate(element => {
    if (!(element instanceof HTMLCanvasElement)) return null;
    const context = element.getContext('2d');
    if (!context) return null;

    const { width, height } = element;
    const pixels = context.getImageData(0, 0, width, height).data;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      // The remote ship is drawn in orange (#ffab73).
      if (pixels[i] !== 255 || pixels[i + 1] !== 171 || pixels[i + 2] !== 115) continue;
      const pixel = i / 4;
      sumX += pixel % width;
      sumY += Math.floor(pixel / width);
      count++;
    }

    return count ? { x: sumX / count, y: sumY / count } : null;
  });
}

test('Binary і JSON бачать рух іншого гравця та отримують чат', async ({ browser, baseURL }) => {
  const binaryContext = await browser.newContext({ baseURL });
  const jsonContext = await browser.newContext({ baseURL });

  try {
    const a = await binaryContext.newPage();
    const b = await jsonContext.newPage();
    const room = 'e2e-' + Date.now();

    await join(a, '/lab05.html', 'Pilot1', room);
    await join(b, '/lab05.html?codec=json', 'Pilot2', room);

    await expect(a.locator('#netgraph')).toContainText('Binary');
    await expect(b.locator('#netgraph')).toContainText('JSON');
    for (const page of [a, b]) {
      await expect(page.locator('#netgraph')).toContainText('Кораблів 2');
      for (const id of ['latency', 'jitter', 'drop']) {
        await page.locator('#' + id).fill('0');
      }
    }

    await expect.poll(() => remoteShipPosition(b)).not.toBeNull();
    const before = await remoteShipPosition(b);
    if (!before) throw new Error('Не знайдено чужого корабля на Canvas');

    await a.locator('#arena').focus();
    await a.keyboard.down('KeyW');
    try {
      await expect.poll(async () => {
        const position = await remoteShipPosition(b);
        return position ? Math.hypot(position.x - before.x, position.y - before.y) : 0;
      }).toBeGreaterThan(12);
    } finally {
      await a.keyboard.up('KeyW');
    }

    const message = 'Перевірка чату Lab 07';
    await a.locator('#text').fill(message);
    await a.locator('#chat button[type="submit"], #chat button:not([type])').first().click();
    await expect(b.locator('#messages')).toContainText(message);
  } finally {
    await Promise.all([binaryContext.close(), jsonContext.close()]);
  }
});
