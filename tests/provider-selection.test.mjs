import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseImageProvider } from '../src/generation/provider-selection.js';

const openai = { id: 'openai', configured: true, paid: true };
const gemini = { id: 'gemini', configured: false, paid: true };
const a1111 = { id: 'a1111', configured: true, paid: false };
const fresh = [openai, gemini, a1111];

test('fresh preferences choose the configured local A1111 before paid providers', () => {
  assert.equal(chooseImageProvider(fresh, ''), 'a1111');
  assert.equal(chooseImageProvider(fresh, undefined), 'a1111');
});

test('an invalid or removed saved provider falls back to the configured local A1111', () => {
  assert.equal(chooseImageProvider(fresh, 'removed-provider'), 'a1111');
});

test('an explicit saved provider is respected, even when it is not the default', () => {
  assert.equal(chooseImageProvider(fresh, 'openai'), 'openai');
  assert.equal(chooseImageProvider(fresh, 'gemini'), 'gemini');
});

test('without a configured A1111 the first configured provider applies', () => {
  assert.equal(chooseImageProvider([openai, gemini], ''), 'openai');
});

test('an unconfigured A1111 is never preferred over a configured provider', () => {
  assert.equal(chooseImageProvider([{ ...a1111, configured: false }, openai], ''), 'openai');
});

test('no configured providers selects the first listed provider, and an empty list selects nothing', () => {
  assert.equal(chooseImageProvider([gemini], ''), 'gemini');
  assert.equal(chooseImageProvider([], ''), '');
});
