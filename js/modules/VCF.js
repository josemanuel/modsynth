import { Module } from '../core/Module.js';

export class VCF extends Module {
  constructor(audioEngine, x, y) {
    super('vcf', audioEngine, x, y);
    this.title = 'VCF';
    this.params = {
      type: 'lowpass',
      frequency: 1000,
      Q: 1
    };

    this.addPort('in', 'In', 'audio', 'in');
    this.addPort('freq', 'Cutoff CV', 'cv', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input">
            <div class="port-socket audio" data-port="in"></div>
            <span>In</span>
          </div>
          <div class="port input">
            <div class="port-socket cv" data-port="freq"></div>
            <span>Cutoff</span>
          </div>
        </div>
        <div class="ports-col">
          <div class="port output">
            <div class="port-socket audio" data-port="out"></div>
            <span>Out</span>
          </div>
        </div>
      </div>
      <div class="control">
        <label>Type</label>
        <select data-param="type">
          <option value="lowpass">Lowpass</option>
          <option value="highpass">Highpass</option>
          <option value="bandpass">Bandpass</option>
          <option value="notch">Notch</option>
        </select>
      </div>
      <div class="control">
        <label>Cutoff <span class="value-display" data-display="frequency">1000 Hz</span></label>
        <input type="range" data-param="frequency" min="20" max="12000" step="1" value="1000" />
      </div>
      <div class="control">
        <label>Resonance <span class="value-display" data-display="Q">1.0</span></label>
        <input type="range" data-param="Q" min="0.1" max="20" step="0.1" value="1" />
      </div>
    `;
  }

  _bindControls() {
    const typeSel = this.el.querySelector('[data-param="type"]');
    typeSel.value = this.params.type;
    typeSel.addEventListener('change', e => {
      this.params.type = e.target.value;
      if (this.filter) this.filter.type = this.params.type;
    });

    this.el.querySelectorAll('input[type="range"]').forEach(input => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector(`[data-display="${param}"]`);
        if (disp) {
          disp.textContent = param === 'frequency' ? Math.round(val) + ' Hz' : val.toFixed(1);
        }
        this.applyParams();
      });
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = this.params.type;
    this.filter.frequency.value = this.params.frequency;
    this.filter.Q.value = this.params.Q;

    this.getPort('in').node = this.filter;
    this.getPort('out').node = this.filter;
    this.getPort('freq').node = this.filter.frequency;
  }

  applyParams() {
    if (!this.filter) return;
    const t = this.audioEngine.context.currentTime;
    this.filter.type = this.params.type;
    this.filter.frequency.setValueAtTime(this.params.frequency, t);
    this.filter.Q.setValueAtTime(this.params.Q, t);
  }

  destroy() {
    if (this.filter) this.filter.disconnect();
    super.destroy();
  }
}
