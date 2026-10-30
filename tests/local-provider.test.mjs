import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviders, validateRequest } from '../server/providers.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1kAAAAASUVORK5CYII=';
const parameters = validateRequest({ prompt: 'A local landscape', seed: 42 });

async function generate(env) {
  let payload;
  const adapter = createProviders({ A1111_URL: 'http://127.0.0.1:7860', ...env }, async (url, options) => {
    assert.equal(String(url), 'http://127.0.0.1:7860/sdapi/v1/txt2img');
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ images: [png] }));
  }).get('a1111');
  const result = await adapter.generate(parameters);
  assert.deepEqual(result.parameters, payload);
  return payload;
}

test('A1111 uses configured image width and height', async () => {
  const payload = await generate({ A1111_WIDTH: '512', A1111_HEIGHT: '768' });
  assert.equal(payload.width, 512);
  assert.equal(payload.height, 768);
});

test('A1111 defaults each unspecified dimension to 1024', async () => {
  for (const [env, width, height] of [
    [{}, 1024, 1024],
    [{ A1111_WIDTH: '512' }, 512, 1024],
    [{ A1111_HEIGHT: '512' }, 1024, 512]
  ]) {
    const payload = await generate(env);
    assert.equal(payload.width, width);
    assert.equal(payload.height, height);
  }
});

test('A1111 accepts inclusive dimension boundaries and multiples of eight', async () => {
  for (const value of ['256', '264', '2040', '2048']) {
    const payload = await generate({ A1111_WIDTH: value, A1111_HEIGHT: value });
    assert.equal(payload.width, Number(value));
    assert.equal(payload.height, Number(value));
  }
});

test('A1111 dimension settings do not affect providers when the local adapter is disabled', () => {
  const providers = createProviders({ A1111_WIDTH: '', A1111_HEIGHT: 'invalid' });
  assert.equal(providers.has('a1111'), false);
  assert.ok(providers.has('openai'));
});

test('A1111 rejects explicitly provided invalid dimensions before making a request', () => {
  let calls = 0;
  for (const key of ['A1111_WIDTH', 'A1111_HEIGHT']) {
    for (const value of ['', ' ', 'abc', 'NaN', 'Infinity', '512px', '512.5', '257', '248', '2056', '0', '-512']) {
      assert.throws(() => createProviders({
        A1111_URL: 'http://127.0.0.1:7860',
        [key]: value
      }, async () => { calls++; }), new RegExp(key), `${key}=${JSON.stringify(value)}`);
    }
  }
  assert.equal(calls, 0);
});
