import { Module } from '../core/Module.js';

export class Chorus extends Module {
  constructor(audioEngine, x, y) {
    super('chorus', audioEngine, x, y);
    this.title = 'Chorus';
    this.params = { rate: 1.5, depth: 0.004, mix: 0.5 };

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
        <label>Rate <span class="value-display" data-display="rate">1.50 Hz</span></label>
        <input type="range" data-param="rate" min="0.1" max="5" step="0.05" value="1.5" />
      </div>
      <div class="control">
        <label>Depth <span class="value-display" data-display="depth">0.004</span></label>
        <input type="range" data-param="depth" min="0.001" max="0.02" step="0.001" value="0.004" />
      </div>
      <div class="control">
        <label>Mix <span class="value-display" data-display="mix">0.50</span></label>
        <input type="range" data-param="mix" min="0" max="1" step="0.01" value="0.5" />
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
          if (param === 'rate') disp.textContent = this.params.rate.toFixed(2) + ' Hz';
          else disp.textContent = this.params[param].toFixed(3);
        }
        this.applyParams();
      });
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.input = ctx.createGain();
    this.delay = ctx.createDelay(0.05);
    this.lfo = ctx.createOscillator();
    this.lfoGain = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry = ctx.createGain();
    this.output = ctx.createGain();

    this.lfo.frequency.value = this.params.rate;
    this.lfoGain.gain.value = this.params.depth;
    this.delay.delayTime.value = 0.015;
    this.wet.gain.value = this.params.mix;
    this.dry.gain.value = 1 - this.params.mix;

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();

    this.input.connect(this.dry);
    this.input.connect(this.delay);
    this.delay.connect(this.wet);
    this.dry.connect(this.output);
    this.wet.connect(this.output);

    this.getPort('in').node = this.input;
    this.getPort('out').node = this.output;
  }

  applyParams() {
    if (!this.lfo) return;
    const t = this.audioEngine.context.currentTime;
    this.lfo.frequency.setValueAtTime(this.params.rate, t);
    this.lfoGain.gain.setValueAtTime(this.params.depth, t);
    this.wet.gain.setValueAtTime(this.params.mix, t);
    this.dry.gain.setValueAtTime(1 - this.params.mix, t);
  }

  destroy() {
    if (this.lfo) {
      try { this.lfo.stop(); this.lfo.disconnect(); } catch(e){}
    }
    [this.input, this.delay, this.lfoGain, this.wet, this.dry, this.output]
      .forEach(n => n && n.disconnect());
    super.destroy();
  }
}
