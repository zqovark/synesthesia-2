import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageTransport, transportConfig } from '../src/core/transport.js';
const make = config => {
  const t = new ImageTransport();
  t.configure(config, ['a', 'b', 'c'], ['a', 'b']);
  return t;
};
test('image timer advances once per duration and pauses without drifting', () => {
  const t = make({
    duration: 10
  });
  t.play();
  assert.equal(t.tick(9), false);
  assert.equal(t.current, 'a');
  t.pause();
  t.tick(30);
  assert.equal(t.elapsed, 9);
  t.play();
  assert.equal(t.tick(1), true);
  assert.equal(t.current, 'b');
  assert.equal(t.elapsed, 0);
});
test('timer holds during GPU preparation, seeks and crossfades at the end', () => {
  const t = make({
    duration: 10,
    transition: 2
  });
  t.play();
  t.ready = false;
  t.tick(30);
  assert.equal(t.elapsed, 0);
  t.ready = true;
  t.seek(9);
  assert.equal(t.mix, .5);
  assert.equal(t.progress, .9);
  t.cue();
  assert.equal(t.elapsed, 0);
  assert.equal(t.playing, false);
});
test('queue insertion changes only the cued image; per-image duration and loop are predictable', () => {
  const t = make({
    duration: 10,
    loop: false,
    durations: {
      b: 5
    }
  });
  t.select('b');
  t.enqueueNext('new');
  assert.equal(t.current, 'b');
  assert.equal(t.next, 'new');
  assert.equal(t.duration, 5);
  t.advance();
  assert.equal(t.current, 'new');
  t.select('c');
  t.play();
  assert.equal(t.tick(10), false);
  assert.equal(t.playing, false);
  assert.equal(t.current, 'c');
});
test('transport config sanitizes data and old scenes can use defaults', () => {
  assert.equal(transportConfig().duration, 20);
  assert.equal(transportConfig({
    duration: 1
  }).duration, 2);
  assert.deepEqual(transportConfig({
    order: ['a', 'a', 7],
    durations: {
      a: 0
    }
  }).order, ['a']);
});
test('reordering an earlier image does not move the active deck', () => {
  const t = make({});
  t.select('c');
  t.enqueueNext('a');
  assert.equal(t.current, 'c');
  assert.equal(t.next, 'a');
});
