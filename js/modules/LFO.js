import { Module } from '../core/Module.js';

export class LFO extends Module {
  constructor(audioEngine, x, y) {
    super('lfo', audioEngine, x, y);
    this.title = 'LFO';
    this.params = {
      waveform: 'sine',
      rate: 2,
      depth: 1
    };

    this.addPort('out', 'Out', 'cv', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col"></div>
        <div class="ports-col">
          <div class="port output">
            <div class="port-socket cv" data-port="out"></div>
            <span>Out</span>
          </div>
        </div>
      </div>
      <div class="control">
        <label>Wave</label>
        <select data-param="waveform">
          <option value="sine">Sine</option>
          <option value="triangle">Triangle</option>
          <option value="sawtooth">Saw</option>
          <option value="square">Square</option>
        </select>
      </div>
      <div class="control">
        <label>Rate <span class="value-display" data-display="rate">2.0 Hz</span></label>
        <input type="range" data-param="rate" min="0.05" max="30" step="0.05" value="2" />
      </div>
      <div class="control">
        <label>Depth <span class="value-display" data-display="depth">1.00</span></label>
        <input type="range" data-param="depth" min="0" max="5" step="0.01" value="1" />
      </div>
    `;
  }

  _bindControls() {
    const wave = this.el.querySelector('[data-param="waveform"]');
    wave.value = this.params.waveform;
    wave.addEventListener('change', e => {
      this.params.waveform = e.target.value;
      if (this.osc) this.osc.type = this.params.waveform;
    });

    this.el.querySelectorAll('input[type="range"]').forEach(input => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector(`[data-display="${param}"]`);
        if (disp) {
          disp.textContent = param === 'rate' ? val.toFixed(2) + ' Hz' : val.toFixed(2);
        }
        this.applyParams();
      });
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.osc = ctx.createOscillator();
    this.osc.type = this.params.waveform;
    this.osc.frequency.value = this.params.rate;
    this.osc.start();

    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = this.params.depth;
    this.osc.connect(this.depthGain);

    this.getPort('out').node = this.depthGain;
  }

  applyParams() {
    if (!this.osc) return;
    const t = this.audioEngine.context.currentTime;
    this.osc.type = this.params.waveform;
    this.osc.frequency.setValueAtTime(this.params.rate, t);
    this.depthGain.gain.setValueAtTime(this.params.depth, t);
  }

  destroy() {
    if (this.osc) {
      try { this.osc.stop(); this.osc.disconnect(); } catch(e){}
    }
    if (this.depthGain) this.depthGain.disconnect();
    super.destroy();
  }
}
