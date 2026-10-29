/** Pure performance kernel: no DOM, network, storage or GPU dependencies. */
import {transportConfig} from './transport.js';
export const PARAMETERS = Object.freeze({
  blend: {
    label: 'Mescla',
    min: 0,
    max: 1,
    initial: 0.35
  },
  displacement: {
    label: 'Deslocamento',
    min: 0,
    max: 1,
    initial: 0.12
  },
  spiral: {
    label: 'Espiral',
    min: -3,
    max: 3,
    initial: 0.15
  },
  rings: {
    label: 'Anéis',
    min: 0,
    max: 1,
    initial: 0.2
  },
  tunnel: {
    label: 'Travessia',
    min: 0,
    max: 1,
    initial: 0.12
  },
  symmetry: {
    label: 'Simetria',
    min: 0,
    max: 1,
    initial: 0
  },
  zoom: {
    label: 'Profundidade',
    min: 0.5,
    max: 3,
    initial: 1
  },
  brightness: {
    label: 'Luz',
    min: 0.1,
    max: 1.5,
    initial: 0.8
  }
});
export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
export const smooth = (current, target, dt, seconds = 0.18) => current + (target - current) * (1 - Math.exp(-clamp(dt, 0, 0.1) / Math.max(0.01, seconds)));
export const curve = (v, kind) => kind === 'ease' ? v * v * (3 - 2 * v) : kind === 'square' ? v * v : kind === 'sqrt' ? Math.sqrt(v) : v;
export const DEFAULT_MACROS = [{
  id: 'firmamento',
  name: 'Firmamento',
  description: 'Abre a luz, a simetria e os anéis.',
  value: 0.25,
  targets: [{
    parameter: 'rings',
    min: 0,
    max: 0.65,
    curve: 'ease'
  }, {
    parameter: 'symmetry',
    min: 0,
    max: 0.5,
    curve: 'linear'
  }, {
    parameter: 'brightness',
    min: 0,
    max: 0.2,
    curve: 'sqrt'
  }]
}, {
  id: 'travessia',
  name: 'Travessia',
  description: 'Aprofunda o túnel e aproxima a matéria.',
  value: 0,
  targets: [{
    parameter: 'tunnel',
    min: 0,
    max: 0.8,
    curve: 'ease'
  }, {
    parameter: 'zoom',
    min: 0,
    max: 1.2,
    curve: 'linear'
  }, {
    parameter: 'displacement',
    min: 0,
    max: 0.3,
    curve: 'square'
  }]
}, {
  id: 'rodas',
  name: 'Rodas de Fogo',
  description: 'Entrelaça espirais, anéis e texturas.',
  value: 0,
  targets: [{
    parameter: 'spiral',
    min: 0,
    max: 2,
    curve: 'ease'
  }, {
    parameter: 'rings',
    min: 0,
    max: 0.4,
    curve: 'linear'
  }, {
    parameter: 'blend',
    min: 0,
    max: 0.5,
    curve: 'linear'
  }]
}];
export function createScene(name = 'Primeira luz') {
  return {
    version: 1,
    id: 'scene-' + Date.now(),
    name,
    images: ['builtin-0', 'builtin-1'],
    transport: transportConfig(),
    base: Object.fromEntries(Object.entries(PARAMETERS).map(([k, p]) => [k, p.initial])),
    macros: structuredClone(DEFAULT_MACROS),
    bindings: [{
      parameter: 'zoom',
      band: 'low',
      amount: 0.35,
      smoothing: 0.2,
      min: 0,
      max: 1
    }, {
      parameter: 'displacement',
      band: 'mid',
      amount: 0.18,
      smoothing: 0.3,
      min: 0,
      max: 1
    }, {
      parameter: 'brightness',
      band: 'high',
      amount: 0.12,
      smoothing: 0.35,
      min: 0,
      max: 1
    }],
    bpm: 120,
    manualTempo: false,
    beatTransition: false,
    pulse: 0,
    luminance: 0.85,
    reducedMotion: false
  };
}
export function validateScene(input) {
  if (!input || input.version !== 1 || typeof input.name !== 'string' || input.name.length > 100 || !input.base || !Array.isArray(input.macros) || !Array.isArray(input.bindings) || !Array.isArray(input.images)) throw new Error('Cena inválida ou versão incompatível.');
  const scene = structuredClone(input);
  scene.transport = transportConfig(scene.transport);
  if (scene.macros.length > 24 || scene.bindings.length > 64 || scene.images.length > 2 || !scene.images.every(x => typeof x === 'string')) throw new Error('Limites da cena excedidos.');
  for (const [key, p] of Object.entries(PARAMETERS)) {
    if (!Number.isFinite(scene.base[key])) throw new Error('Parâmetro inválido: ' + key);
    scene.base[key] = clamp(scene.base[key], p.min, p.max);
  }
  const ids = new Set();
  for (const m of scene.macros) {
    if (typeof m.id !== 'string' || ids.has(m.id) || typeof m.name !== 'string' || !Number.isFinite(m.value) || !Array.isArray(m.targets) || m.targets.length > 32) throw new Error('Macro inválida.');
    ids.add(m.id);
    m.value = clamp(m.value);
    for (const t of m.targets) if (!PARAMETERS[t.parameter] || !Number.isFinite(t.min) || !Number.isFinite(t.max) || !['linear', 'ease', 'square', 'sqrt'].includes(t.curve)) throw new Error('Destino de macro inválido.');
  }
  for (const b of scene.bindings) if (!PARAMETERS[b.parameter] || !['low', 'mid', 'high', 'beat', 'level'].includes(b.band) || ![b.amount, b.smoothing, b.min, b.max].every(Number.isFinite) || b.min > b.max) throw new Error('Associação de áudio inválida.');
  scene.bpm = clamp(scene.bpm, 40, 240);
  scene.luminance = clamp(scene.luminance, 0.1, 1);
  scene.pulse = clamp(scene.pulse, 0, 0.3);
  return scene;
}
export class Instrument {
  constructor(scene = createScene()) {
    this.effective = {
      ...scene.base
    };
    this.macroLevels = new Map();
    this.audioLevels = new Map();
    this.setScene(scene);
  }
  setScene(scene) {
    this.scene = validateScene(scene);
    this.macroLevels.clear();
    this.audioLevels.clear(); /* Effective values survive scene changes for a smooth arrival. */
  }
  setBase(key, value) {
    const p = PARAMETERS[key];
    if (p) this.scene.base[key] = clamp(value, p.min, p.max);
  }
  setMacro(id, value) {
    const m = this.scene.macros.find(m => m.id === id);
    if (m) m.value = clamp(value);
  }
  step(audio = {}, dt = 1 / 60) {
    const macro = Object.fromEntries(Object.keys(PARAMETERS).map(k => [k, 0]));
    const sound = {
      ...macro
    };
    for (const m of this.scene.macros) {
      const level = smooth(this.macroLevels.get(m.id) ?? 0, m.value, dt, 0.22);
      this.macroLevels.set(m.id, level);
      for (const t of m.targets) macro[t.parameter] += (t.min + (t.max - t.min) * curve(level, t.curve)) * level;
    }
    this.scene.bindings.forEach((b, i) => {
      const target = clamp(audio[b.band] ?? 0, b.min, b.max);
      const level = smooth(this.audioLevels.get(i) ?? 0, target, dt, b.smoothing);
      this.audioLevels.set(i, level);
      sound[b.parameter] += level * b.amount;
    });
    this.sources = {};
    for (const [key, p] of Object.entries(PARAMETERS)) {
      const base = this.scene.base[key];
      const target = clamp(base + macro[key] + sound[key], p.min, p.max);
      this.effective[key] = smooth(this.effective[key] ?? target, target, dt, 0.08);
      this.sources[key] = {
        manual: base,
        macro: macro[key],
        audio: sound[key],
        target,
        effective: this.effective[key]
      };
    }
    return this.effective;
  }
}
