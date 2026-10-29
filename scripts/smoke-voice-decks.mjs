import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const port = 4321,
  base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server/index.mjs'], {
  env: {
    ...process.env,
    PORT: String(port)
  },
  stdio: 'inherit'
});
let browser, page;
const errors = [];
let transcriptions = 0,
  generations = 0;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1kAAAAASUVORK5CYII=', 'base64');
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 1000
    }
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__pad = null;
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => window.__pad ? [window.__pad] : []
    });
  });
  await page.route('**/api/session', route => route.fulfill({
    json: {
      token: 'test',
      voice: {
        configured: true
      },
      providers: [{
        id: 'nvidia-sdxl',
        name: 'NVIDIA test',
        configured: true,
        paid: true
      }]
    }
  }));
  await page.route('**/api/voice/transcribe', route => {
    const body = route.request().postDataJSON();
    assert.ok(body.confirmed && body.audio.length > 1000);
    transcriptions++;
    return route.fulfill({
      json: {
        text: transcriptions === 1 ? 'Um portal de ouro no oceano' : 'Anéis de fogo no deserto'
      }
    });
  });
  await page.route('**/api/jobs', route => {
    generations++;
    assert.ok(route.request().postDataJSON().confirmed);
    return route.fulfill({
      status: 202,
      json: {
        id: 'voice-' + generations,
        state: 'running',
        stage: 'Gerando imagem'
      }
    });
  });
  await page.route(/\/api\/jobs\/voice-\d+$/, route => route.fulfill({
    json: {
      id: 'voice-' + generations,
      state: 'completed',
      stage: 'Imagem pronta',
      hasImage: true,
      metadata: {
        provider: 'nvidia-sdxl',
        model: 'simulated',
        prompt: 'voice test',
        seed: 42
      }
    }
  }));
  await page.route(/\/api\/jobs\/voice-\d+\/image$/, route => route.fulfill({
    contentType: 'image/png',
    body: png
  }));
  await page.goto(base);
  await page.waitForFunction(async () => {
    const {
      app
    } = await import('/src/app.js');
    return !!app.voice && !!app.decks;
  });
  assert.equal(await page.locator('#image-play').count(), 1);
  await page.locator('#voice-open').click();
  await page.locator('#voice-enabled').check();
  await page.locator('#voice-record').click();
  await page.waitForFunction(() => document.querySelector('#voice-phase').textContent.startsWith('Gravando'));
  await page.waitForTimeout(800);
  await page.locator('#voice-record').click();
  await page.waitForFunction(() => document.querySelector('#voice-phase').textContent === 'Imagem pronta no deck B');
  assert.match(await page.locator('#deck-name-b').textContent(), /portal de ouro/);
  assert.equal(generations, 1);
  assert.equal(transcriptions, 1);
  await page.locator('#drawer-close').click();
  await page.locator('#duration-a').fill('2');
  await page.locator('#duration-a').dispatchEvent('input');
  await page.locator('#image-play').click();
  await page.waitForFunction(() => document.querySelector('#deck-name-a').textContent.includes('portal de ouro'), {
    timeout: 15000
  });
  assert.equal(generations, 1, 'timer must not create paid generations');
  await page.locator('#image-play').click();
  const paused = await page.evaluate(async () => (await import('/src/app.js')).app.transport.elapsed);
  await page.waitForTimeout(350);
  const after = await page.evaluate(async () => (await import('/src/app.js')).app.transport.elapsed);
  assert.equal(after, paused);
  await page.locator('#image-cue').click();
  assert.equal(await page.evaluate(async () => (await import('/src/app.js')).app.transport.elapsed), 0);
  // LS starts and stops recording through the same optional voice capability.
  await page.evaluate(() => window.__pad = {
    index: 0,
    id: 'Xbox simulated',
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({
      length: 16
    }, () => ({
      value: 0
    }))
  });
  await page.waitForFunction(async () => (await import('/src/app.js')).app.gamepad.neutral);
  await page.evaluate(() => window.__pad.buttons[10].value = 1);
  await page.waitForFunction(() => document.querySelector('#voice-phase')?.textContent.startsWith('Gravando'));
  await page.evaluate(() => window.__pad.buttons[10].value = 0);
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__pad.buttons[10].value = 1);
  await page.waitForFunction(() => document.querySelector('#voice-phase').textContent === 'Imagem pronta no deck B');
  assert.equal(generations, 2);
  await page.evaluate(() => window.__pad.buttons[10].value = 0);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__pad.buttons[10].value = 1);
  await page.waitForFunction(() => document.querySelector('#voice-phase').textContent.startsWith('Gravando'));
  await page.evaluate(() => window.__pad = null);
  await page.waitForFunction(() => document.querySelector('#voice-phase').textContent === 'Pedido cancelado');
  assert.equal(generations, 2);
  await page.locator('#drawer-close').click();
  await page.locator('#image-free').click();
  await page.evaluate(async () => {
    const {
      loadScene
    } = await import('/src/app.js');
    const {
      createScene
    } = await import('/src/core/instrument.js');
    await loadScene(createScene());
  });
  await mkdir('test-results', {
    recursive: true
  });
  await page.evaluate(() => window.requestAnimationFrame = () => 0);
  await page.screenshot({
    path: 'test-results/decks-desktop.png',
    fullPage: true
  });
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({
    path: 'test-results/decks-mobile.png',
    fullPage: true
  });
  assert.deepEqual(errors, []);
  console.log('Voice/decks passed: real MediaRecorder with synthetic microphone, mocked ASR/image APIs, next cue, timed playback, LS and disconnect cancellation.');
} catch (error) {
  if (page) {
    console.error('Voice/decks:', await page.locator('#status').textContent().catch(() => '?'));
    await mkdir('test-results', {
      recursive: true
    });
    await page.evaluate(() => window.requestAnimationFrame = () => 0).catch(() => {});
    await page.screenshot({
      path: 'test-results/voice-failure.png',
      fullPage: true,
      timeout: 15000
    }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
