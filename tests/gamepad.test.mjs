import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GamepadInput, deadzone } from '../src/input/gamepad.js';
const pad = () => ({
  index: 0,
  id: 'Xbox test',
  mapping: 'standard',
  connected: true,
  axes: [0, 0, 0, 0],
  buttons: Array.from({
    length: 16
  }, () => ({
    value: 0
  }))
});
test('deadzone rejects drift and rescales travel', () => {
  assert.equal(deadzone(.1), 0);
  assert.equal(deadzone(-.1), 0);
  assert.equal(deadzone(1), 1);
});
test('held buttons fire once; reconnect requires neutral', () => {
  const events = [],
    g = new GamepadInput((...x) => events.push(x)),
    p = pad();
  p.buttons[0].value = 1;
  g.poll([p], .016, 0);
  g.poll([p], .016, .1);
  assert.equal(events.length, 1);
  p.buttons[0].value = 0;
  g.poll([p], .016, .2);
  p.buttons[0].value = 1;
  g.poll([p], .016, .3);
  g.poll([p], .016, .4);
  assert.equal(events.filter(x => x[0] === 'accept').length, 1);
  g.poll([], .016, .5);
  g.poll([p], .016, .6);
  g.poll([p], .016, .7);
  assert.equal(events.filter(x => x[0] === 'accept').length, 1);
});
