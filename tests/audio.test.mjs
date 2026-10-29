import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spectrum, PulseTracker } from '../src/audio/dsp.js';
test('FFT separates synthetic low/mid/high signals and silence', () => {
  const fft = new Spectrum();
  const data = new Float32Array(1024);
  for (const [hz, band] of [[93.75, 'low'], [750, 'mid'], [6000, 'high']]) {
    for (let i = 0; i < data.length; i++) data[i] = .8 * Math.sin(2 * Math.PI * hz * i / 24000);
    const b = fft.analyze(data);
    for (const other of ['low', 'mid', 'high']) if (other !== band) assert.ok(b[band] > b[other] * 2, JSON.stringify(b));
  }
  assert.equal(fft.analyze(new Float32Array(1024)).level, 0);
});
test('beat detector uses seconds, estimates tempo and expires silence', () => {
  const p = new PulseTracker();
  let result;
  for (let i = 0; i < 600; i++) {
    const t = i / 60;
    result = p.sample(i % 30 < 2 ? .8 : .01, t, 1 / 60);
  }
  assert.ok(Math.abs(result.bpm - 120) < 3);
  assert.ok(result.confidence > .9);
  for (let i = 600; i < 900; i++) result = p.sample(0, i / 60, 1 / 60);
  assert.equal(result.confidence, 0);
});
