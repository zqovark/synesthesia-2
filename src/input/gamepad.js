import { clamp } from '../core/instrument.js';
export const DEFAULT_MAPPING = {
  accept: 0,
  back: 1,
  nextImage: 2,
  nextScene: 3,
  previousMacro: 4,
  nextMacro: 5,
  previousParameter: 8,
  nextParameter: 11,
  performance: 9
};
export const deadzone = (v, zone = .16) => Math.abs(v) <= zone ? 0 : Math.sign(v) * (Math.abs(v) - zone) / (1 - zone);
/** Buttons are edge-triggered; relative controls require neutral after reconnect. */
export class GamepadInput {
  constructor(dispatch, mapping = DEFAULT_MAPPING) {
    this.dispatch = dispatch;
    this.mapping = {
      ...mapping
    };
    this.previous = [];
    this.id = null;
    this.neutral = false;
    this.lastNav = 0;
    this.deadzone = .16;
  }
  poll(pads, dt, time) {
    const pad = Array.from(pads ?? []).find(p => p?.connected && p.mapping === 'standard');
    if (!pad) {
      if (this.id !== null) this.dispatch('connection', null);
      this.id = null;
      this.previous = [];
      this.neutral = false;
      return;
    }
    const buttons = pad.buttons.map(b => typeof b === 'number' ? b : b.value);
    if (this.id !== pad.index + ':' + pad.id) {
      this.id = pad.index + ':' + pad.id;
      this.previous = buttons;
      this.neutral = false;
      this.dispatch('connection', pad.id);
      return;
    }
    const axes = pad.axes.map(v => deadzone(v, this.deadzone));
    if (!this.neutral) {
      this.neutral = axes.every(v => v === 0) && buttons.every(v => v < .1);
      this.previous = buttons;
      return;
    }
    for (const [action, index] of Object.entries(this.mapping)) if (buttons[index] > .5 && (this.previous[index] ?? 0) <= .5) this.dispatch(action);
    for (const [index, name] of [[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']]) if (buttons[index] > .5 && ((this.previous[index] ?? 0) <= .5 || time - this.lastNav > .18)) {
      this.dispatch('navigate', name);
      this.lastNav = time;
    }
    const trigger = (buttons[7] ?? 0) - (buttons[6] ?? 0);
    if (trigger) this.dispatch('macroDelta', trigger * clamp(dt, 0, .05) * .45);
    if (axes[2]) this.dispatch('parameterDelta', axes[2] * clamp(dt, 0, .05) * .35);
    this.previous = buttons;
  }
}
