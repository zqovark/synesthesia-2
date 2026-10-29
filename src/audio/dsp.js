import { clamp } from '../core/instrument.js';
/** Radix-2 FFT, Hann window, preallocated scratch. Used by Linux monitor capture. */
export class Spectrum {
  constructor(size = 1024, sampleRate = 24000) {
    if (size < 32 || size & size - 1) throw new Error('FFT size must be a power of two.');
    this.size = size;
    this.sampleRate = sampleRate;
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
    this.bytes = new Uint8Array(size / 2);
  }
  analyze(pcm) {
    const {
      size: n,
      re,
      im
    } = this;
    im.fill(0);
    for (let i = 0; i < n; i++) re[i] = (pcm[i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) [re[i], re[j]] = [re[j], re[i]];
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len,
        wr = Math.cos(a),
        wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let ur = 1,
          ui = 0;
        for (let j = 0; j < len / 2; j++) {
          const x = i + j,
            y = x + len / 2;
          const tr = re[y] * ur - im[y] * ui,
            ti = re[y] * ui + im[y] * ur;
          re[y] = re[x] - tr;
          im[y] = im[x] - ti;
          re[x] += tr;
          im[x] += ti;
          const next = ur * wr - ui * wi;
          ui = ur * wi + ui * wr;
          ur = next;
        }
      }
    }
    for (let i = 0; i < n / 2; i++) this.bytes[i] = Math.round(clamp((20 * Math.log10(Math.max(1e-9, Math.hypot(re[i], im[i]) * 4 / n)) + 80) / 65) * 255);
    return bands(this.bytes, this.sampleRate);
  }
}
export function bands(bytes, sampleRate) {
  const width = sampleRate / 2 / bytes.length;
  const average = (lo, hi) => {
    let sum = 0,
      count = 0;
    for (let i = Math.max(1, Math.floor(lo / width)); i < Math.min(bytes.length, Math.ceil(hi / width)); i++) {
      sum += bytes[i];
      count++;
    }
    return count ? sum / count / 255 : 0;
  };
  return {
    low: average(20, 250),
    mid: average(250, 2000),
    high: average(2000, 12000),
    level: average(20, 12000)
  };
}
export class PulseTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.average = 0;
    this.last = -Infinity;
    this.times = [];
    this.primed = false;
    this.energy = 0;
    this.bpm = 0;
    this.confidence = 0;
  }
  sample(low, time, dt) {
    const beat = this.primed && time - this.last > 0.22 && low > 0.12 && low > this.average * 1.35;
    this.average += (low - this.average) * (1 - Math.exp(-Math.min(dt, 0.1) / 0.5));
    this.primed = true;
    this.energy *= Math.exp(-Math.min(dt, 0.1) / 0.18);
    if (beat) {
      if (Number.isFinite(this.last)) {
        const gap = time - this.last;
        if (gap >= 0.25 && gap <= 1.5) {
          this.times.push(gap);
          if (this.times.length > 16) this.times.shift();
        }
      }
      this.last = time;
      this.energy = low;
      if (this.times.length >= 5) {
        const sorted = [...this.times].sort((a, b) => a - b),
          period = sorted[Math.floor(sorted.length / 2)];
        this.bpm = 60 / period;
        this.confidence = clamp(1 - this.times.reduce((s, x) => s + Math.abs(x - period), 0) / this.times.length / period);
      }
    }
    if (time - this.last > 3) {
      this.confidence = 0;
      this.bpm = 0;
      this.times = [];
    }
    return {
      beat: this.energy,
      onset: beat,
      bpm: this.bpm,
      confidence: this.confidence
    };
  }
}
