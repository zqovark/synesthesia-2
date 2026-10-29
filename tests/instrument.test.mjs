import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Instrument, createScene, validateScene, PARAMETERS } from '../src/core/instrument.js';
test('modulation is additive, bounded and non-accumulating', () => {
  const k = new Instrument();
  k.setMacro('travessia', 1);
  for (let i = 0; i < 600; i++) k.step({
    low: 1,
    mid: 1,
    high: 1
  }, 1 / 60);
  const first = k.effective.zoom;
  for (let i = 0; i < 600; i++) k.step({
    low: 1,
    mid: 1,
    high: 1
  }, 1 / 60);
  assert.ok(Math.abs(first - k.effective.zoom) < 0.001);
  for (const [key, p] of Object.entries(PARAMETERS)) assert.ok(k.effective[key] >= p.min && k.effective[key] <= p.max);
  assert.equal(k.sources.zoom.manual, 1);
  assert.ok(k.sources.zoom.macro > 1);
  assert.ok(k.sources.zoom.audio > 0);
});
test('macro removal and scene switches glide; silence returns to baseline', () => {
  const k = new Instrument();
  k.setMacro('travessia', 1);
  for (let i = 0; i < 240; i++) k.step({
    low: 1
  }, 1 / 60);
  const before = k.effective.zoom;
  k.setScene(createScene());
  k.step({}, 1 / 60);
  assert.ok(Math.abs(k.effective.zoom - before) < 0.4);
  for (let i = 0; i < 600; i++) k.step({}, 1 / 60);
  assert.ok(Math.abs(k.effective.zoom - 1) < 0.001);
});
test('scene validation rejects broken imports and supports inverted macros', () => {
  assert.throws(() => validateScene({
    version: 99
  }));
  const s = createScene();
  s.base.zoom = NaN;
  assert.throws(() => validateScene(s));
  const t = createScene();
  t.macros[0].targets = [{
    parameter: 'zoom',
    min: 0,
    max: -0.4,
    curve: 'linear'
  }];
  const k = new Instrument(t);
  k.setMacro('firmamento', 1);
  for (let i = 0; i < 300; i++) k.step({}, 1 / 60);
  assert.ok(k.effective.zoom < 0.7);
});
