/** Optional real-browser integration suite. npm install --no-save playwright@1.62.1 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const port = 4319,
  base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server/index.mjs'], {
  env: {
    ...process.env,
    PORT: String(port)
  },
  stdio: 'inherit'
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({
      viewport: {
        width: 1440,
        height: 1000
      }
    }),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__pad = null;
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => window.__pad ? [window.__pad] : []
    });
  });
  await page.goto(base);
  await page.waitForFunction(() => /\d+ FPS/.test(document.querySelector('#gpu-status').textContent));
  await page.waitForFunction(async () => !!(await import('/src/app.js')).app.db);
  await page.waitForFunction(() => !!document.querySelector('#macro-edit').onclick && !!document.querySelector('#generate-open').onclick);
  await page.locator('#param-zoom').fill('1.7');
  await page.locator('#param-zoom').dispatchEvent('input');
  await page.locator('#scenes-open').click();
  await page.getByLabel('Nome da composição').fill('Visão persistida');
  await page.getByRole('button', {
    name: 'Salvar cena',
    exact: true
  }).click();
  await page.locator('#drawer-close').click();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#scene-title').textContent === 'Visão persistida');
  assert.equal(await page.locator('#param-zoom').inputValue(), '1.7');
  await page.locator('#macro-edit').click();
  await page.getByLabel('Nome', {
    exact: true
  }).fill('Macro de teste');
  await page.getByRole('button', {
    name: 'Salvar macro',
    exact: true
  }).click();
  await page.waitForFunction(() => document.querySelectorAll('.macro').length === 4);
  // Upload a valid PNG and verify the texture reaches the actual WebGL cache.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1kAAAAASUVORK5CYII=', 'base64');
  await page.locator('#image-file').setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: png
  });
  await page.waitForFunction(async () => {
    const {
      app
    } = await import('/src/app.js');
    return app.renderer.cache.size === 1;
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#asset-count').textContent.startsWith('03'));
  // Synthetic WAV through the real browser decoder and Web Audio analyser.
  const rate = 24000,
    count = rate * 3,
    wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF');
  wav.writeUInt32LE(36 + count * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 94 / rate) * 24000), 44 + i * 2);
  await page.locator('#audio-open').click();
  await page.getByLabel('Arquivo de áudio').setInputFiles({
    name: 'sine.wav',
    mimeType: 'audio/wav',
    buffer: wav
  });
  await page.waitForFunction(async () => {
    const {
      app
    } = await import('/src/app.js');
    return app.audio.sample(performance.now() / 1000, 1 / 60).low > .05;
  });
  // Standard Xbox simulation: RT adjusts the macro and never toggles performance.
  await page.evaluate(() => window.__pad = {
    index: 0,
    id: 'Simulated Xbox',
    mapping: 'standard',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({
      length: 16
    }, () => ({
      value: 0
    }))
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__pad.buttons[7].value = 1);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('body').evaluate(b => b.classList.contains('performance')), false);
  await page.evaluate(() => window.__pad = null);
  // Exercise generation UI against simulated HTTP responses; no paid API calls.
  await page.route('**/api/session', route => route.fulfill({
    json: {
      token: 'test',
      providers: [{
        id: 'nvidia-sdxl',
        name: 'NVIDIA test',
        configured: true,
        paid: true
      }]
    }
  }));
  await page.route('**/api/jobs', route => route.fulfill({
    status: 202,
    json: {
      id: 'test-job',
      state: 'running',
      stage: 'Aguardando provedor'
    }
  }));
  await page.route('**/api/jobs/test-job', route => route.fulfill({
    json: {
      id: 'test-job',
      state: 'completed',
      stage: 'Pronta',
      hasImage: true,
      metadata: {
        provider: 'nvidia-sdxl',
        model: 'simulated',
        prompt: 'test',
        seed: 123
      }
    }
  }));
  await page.route('**/api/jobs/test-job/image', route => route.fulfill({
    contentType: 'image/png',
    body: png
  }));
  await page.locator('#generate-open').click();
  await page.getByRole('button', {
    name: 'Gerar uma imagem',
    exact: true
  }).click();
  await page.waitForFunction(() => document.querySelector('#drawer-error').textContent.includes('confirmação'));
  await page.locator('#generation-consent').check();
  await page.getByRole('button', {
    name: 'Gerar uma imagem',
    exact: true
  }).click();
  await page.waitForFunction(() => document.querySelector('#asset-count').textContent.startsWith('04'));
  await page.locator('#drawer-close').click();
  await mkdir('test-results', {
    recursive: true
  });
  await page.screenshot({
    path: 'test-results/desktop.png',
    fullPage: true
  });
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  await page.screenshot({
    path: 'test-results/mobile.png',
    fullPage: true
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile page overflows horizontally');
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: GPU, upload persistence, macros, scenes, Web Audio, simulated Xbox and generation.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
