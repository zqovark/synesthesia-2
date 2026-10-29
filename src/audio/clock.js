/** Explicit manual tempo supplies the beat envelope as well as the BPM display. */
export class TempoClock {
  constructor() {
    this.anchor = 0;
    this.lastIndex = null;
    this.mode = false;
    this.bpm = 120;
  }
  reset(time) {
    this.anchor = time;
    this.lastIndex = null;
  }
  sample(sound, scene, time) {
    if (!scene.manualTempo) {
      this.mode = false;
      return sound;
    }
    if (!this.mode || this.bpm !== scene.bpm) {
      this.reset(time);
      this.bpm = scene.bpm;
      this.mode = true;
    }
    const period = 60 / scene.bpm,
      position = (time - this.anchor) / period,
      index = Math.floor(position),
      onset = this.lastIndex !== null && index !== this.lastIndex;
    this.lastIndex = index;
    return {
      ...sound,
      beat: Math.exp(-(position - index) * period / .15),
      onset,
      bpm: scene.bpm,
      confidence: 1
    };
  }
}
