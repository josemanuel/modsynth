import { Module } from '../core/Module.js';

/**
 * VCO con ring modulation.
 * ring in: señal moduladora; si no hay cable, el oscilador interno 2 actúa como modulador.
 */
export class VCO extends Module {
  constructor(audioEngine, x, y) {
    super('vco', audioEngine, x, y);
    this.title = 'VCO';
    this.params = {
      waveform: 'sawtooth',
      frequency: 220,
      detune: 0,
      pw: 0.5,
      ring: 0,
      ringRatio: 1
    };

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('fm', 'FM', 'cv', 'in');
    this.addPort('ring', 'Ring In', 'audio', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input">
            <div class="port-socket cv" data-port="freq"></div>
            <span>Freq</span>
          </div>
          <div class="port input">
            <div class="port-socket cv" data-port="fm"></div>
            <span>FM</span>
          </div>
          <div class="port input">
            <div class="port-socket audio" data-port="ring"></div>
            <span>Ring</span>
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
        <label>Wave</label>
        <select data-param="waveform">
          <option value="sine">Sine</option>
          <option value="sawtooth" selected>Saw</option>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
        </select>
      </div>
      <div class="control">
        <label>Freq <span class="value-display" data-display="frequency">220 Hz</span></label>
        <input type="range" data-param="frequency" min="20" max="2000" step="1" value="220" />
      </div>
      <div class="control">
        <label>Detune <span class="value-display" data-display="detune">0</span></label>
        <input type="range" data-param="detune" min="-100" max="100" step="1" value="0" />
      </div>
      <div class="control">
        <label>Ring <span class="value-display" data-display="ring">0%</span></label>
        <input type="range" data-param="ring" min="0" max="1" step="0.01" value="0" />
      </div>
      <div class="control">
        <label>Ring ratio <span class="value-display" data-display="ringRatio">1.00</span></label>
        <input type="range" data-param="ringRatio" min="0.25" max="4" step="0.01" value="1" />
      </div>
    `;
  }

  _bindControls() {
    const wave = this.el.querySelector('[data-param="waveform"]');
    wave.value = this.params.waveform;
    wave.addEventListener('change', (e) => {
      this.params.waveform = e.target.value;
      if (this.osc) this.osc.type = this.params.waveform;
      if (this.ringOsc) this.ringOsc.type = this.params.waveform;
    });

    this.el.querySelectorAll('input[type="range"]').forEach((input) => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        this._updateDisplay(param, val);
        this.applyParams();
      });
    });
  }

  _updateDisplay(param, val) {
    const el = this.el.querySelector(`[data-display="${param}"]`);
    if (!el) return;
    if (param === 'frequency') el.textContent = Math.round(val) + ' Hz';
    else if (param === 'ring') el.textContent = Math.round(val * 100) + '%';
    else if (param === 'ringRatio') el.textContent = val.toFixed(2);
    else el.textContent = val;
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    // Carrier
    this.osc = ctx.createOscillator();
    this.osc.type = this.params.waveform;
    this.osc.frequency.value = this.params.frequency;
    this.osc.detune.value = this.params.detune;
    this.osc.start();

    // Internal ring modulator oscillator
    this.ringOsc = ctx.createOscillator();
    this.ringOsc.type = this.params.waveform;
    this.ringOsc.frequency.value = this.params.frequency * this.params.ringRatio;
    this.ringOsc.start();

    this.ringInGain = ctx.createGain();
    this.ringInGain.gain.value = 1;
    this.ringOsc.connect(this.ringInGain);

    // Ring = carrier * modulator (Web Audio: connect carrier to gain.gain)
    this.ringMult = ctx.createGain();
    this.ringMult.gain.value = 0;
    this.osc.connect(this.ringMult);
    this.ringInGain.connect(this.ringMult.gain);

    // Dry / wet mix
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;
    this.osc.connect(this.dryGain);
    this.ringMult.connect(this.wetGain);

    this.outGain = ctx.createGain();
    this.outGain.gain.value = 0.5;
    this.dryGain.connect(this.outGain);
    this.wetGain.connect(this.outGain);

    this.getPort('out').node = this.outGain;
    this.getPort('freq').node = this.osc.frequency;
    this.getPort('fm').node = this.osc.frequency;
    this.getPort('ring').node = this.ringInGain;

    this.applyParams();
  }

  applyParams() {
    if (!this.osc) return;
    const t = this.audioEngine.context.currentTime;
    this.osc.type = this.params.waveform;
    this.osc.frequency.setValueAtTime(this.params.frequency, t);
    this.osc.detune.setValueAtTime(this.params.detune, t);
    if (this.ringOsc) {
      this.ringOsc.type = this.params.waveform;
      this.ringOsc.frequency.setValueAtTime(
        this.params.frequency * this.params.ringRatio,
        t
      );
    }
    const ring = this.params.ring;
    if (this.dryGain) this.dryGain.gain.setValueAtTime(1 - ring, t);
    if (this.wetGain) this.wetGain.gain.setValueAtTime(ring, t);
  }

  destroy() {
    [this.osc, this.ringOsc].forEach((n) => {
      if (n) {
        try {
          n.stop();
          n.disconnect();
        } catch (e) {}
      }
    });
    [this.ringInGain, this.ringMult, this.dryGain, this.wetGain, this.outGain].forEach(
      (n) => n && n.disconnect()
    );
    super.destroy();
  }
}
