import { Module } from '../core/Module.js';

export class Reverb extends Module {
  constructor(audioEngine, x, y) {
    super('reverb', audioEngine, x, y);
    this.title = 'Reverb';
    this.params = { decay: 2.5, mix: 0.35 };

    this.addPort('in', 'In', 'audio', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input"><div class="port-socket audio" data-port="in"></div><span>In</span></div>
        </div>
        <div class="ports-col">
          <div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>
        </div>
      </div>
      <div class="control">
        <label>Decay <span class="value-display" data-display="decay">2.5 s</span></label>
        <input type="range" data-param="decay" min="0.5" max="8" step="0.1" value="2.5" />
      </div>
      <div class="control">
        <label>Mix <span class="value-display" data-display="mix">0.35</span></label>
        <input type="range" data-param="mix" min="0" max="1" step="0.01" value="0.35" />
      </div>
    `;
  }

  _bindControls() {
    this.el.querySelectorAll('input[type="range"]').forEach(input => {
      const param = input.dataset.param;
      input.addEventListener('input', e => {
        this.params[param] = parseFloat(e.target.value);
        const disp = this.el.querySelector(`[data-display="${param}"]`);
        if (disp) {
          disp.textContent = param === 'decay'
            ? this.params.decay.toFixed(1) + ' s'
            : this.params.mix.toFixed(2);
        }
        this.applyParams();
      });
    });
  }

  _createImpulse(seconds) {
    const ctx = this.audioEngine.context;
    const rate = ctx.sampleRate;
    const length = rate * seconds;
    const impulse = ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    return impulse;
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.input = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this._createImpulse(this.params.decay);
    this.wet = ctx.createGain();
    this.dry = ctx.createGain();
    this.output = ctx.createGain();

    this.wet.gain.value = this.params.mix;
    this.dry.gain.value = 1 - this.params.mix;

    this.input.connect(this.dry);
    this.input.connect(this.convolver);
    this.convolver.connect(this.wet);
    this.dry.connect(this.output);
    this.wet.connect(this.output);

    this.getPort('in').node = this.input;
    this.getPort('out').node = this.output;
  }

  applyParams() {
    if (!this.convolver) return;
    this.convolver.buffer = this._createImpulse(this.params.decay);
    this.wet.gain.value = this.params.mix;
    this.dry.gain.value = 1 - this.params.mix;
  }

  destroy() {
    [this.input, this.convolver, this.wet, this.dry, this.output]
      .forEach(n => n && n.disconnect());
    super.destroy();
  }
}
