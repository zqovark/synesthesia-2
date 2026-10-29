import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/visuals/renderer.js';
import { TempoClock } from '../src/audio/clock.js';
test('manual tempo actually drives beats at 120 BPM and can return to audio', () => {
  const c = new TempoClock(),
    scene = {
      manualTempo: true,
      bpm: 120
    };
  let beats = 0;
  for (let i = 0; i <= 120; i++) {
    const f = c.sample({
      beat: 0
    }, scene, i / 60);
    if (f.onset) beats++;
    assert.ok(f.beat >= 0 && f.beat <= 1);
  }
  assert.equal(beats, 4);
  assert.equal(c.sample({
    beat: .3
  }, {
    ...scene,
    manualTempo: false
  }, 3).beat, .3);
});
test('texture requests keep concurrent loads alive and release all GPU allocations on dispose', async () => {
  const deleted = new Set(),
    created = new Set(),
    decodes = [];
  let serial = 0;
  const gl = new Proxy({
    createTexture() {
      const v = {
        id: ++serial
      };
      created.add(v);
      return v;
    },
    deleteTexture(v) {
      if (v) deleted.add(v);
    },
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    createShader: () => ({}),
    createProgram: () => ({}),
    createBuffer: () => ({}),
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    getExtension: () => ({
      loseContext() {}
    })
  }, {
    get: (o, k) => k in o ? o[k] : typeof k === 'string' && k === k.toUpperCase() ? 1 : () => {}
  });
  const oldImage = globalThis.Image,
    oldDocument = globalThis.document;
  globalThis.Image = class {
    width = 100;
    height = 100;
    decode() {
      return new Promise(resolve => decodes.push(resolve));
    }
  };
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {}
      })
    })
  };
  const r = new Renderer({
    getContext: () => gl,
    addEventListener() {},
    removeEventListener() {}
  });
  const asset = id => ({
    id,
    blob: new Blob(['x'], {
      type: 'image/png'
    })
  });
  try {
    const first = r.setImages([asset('a'), asset('b')]);
    const second = r.setImages([asset('c'), asset('d')]);
    decodes[2]();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(r.cache.has('c'));
    decodes[0]();
    decodes[1]();
    await first;
    assert.ok(r.cache.has('c'), 'stale request must not evict an active pending texture');
    decodes[3]();
    await second;
    assert.deepEqual(r.current, ['c', 'd']);
    assert.equal(r.cache.size, 2);
    r.dispose();
    assert.equal(r.cache.size, 0);
    assert.equal(deleted.size, created.size);
    const late = new Renderer({
      getContext: () => gl,
      addEventListener() {},
      removeEventListener() {}
    });
    const pending = late.setImages([asset('late')]);
    late.dispose();
    decodes.at(-1)();
    await pending;
    assert.equal(late.cache.size, 0);
  } finally {
    globalThis.Image = oldImage;
    globalThis.document = oldDocument;
  }
});
