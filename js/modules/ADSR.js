import { Module } from '../core/Module.js';

export class ADSR extends Module {
  constructor(audioEngine, x, y) {
    super('adsr', audioEngine, x, y);
    this.title = 'ADSR';
    this.params = {
      attack: 0.05,
      decay: 0.2,
      sustain: 0.6,
      release: 0.4
    };
    this._gateOn = false;

    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('out', 'Env', 'cv', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input">
            <div class="port-socket gate" data-port="gate"></div>
            <span>Gate</span>
          </div>
        </div>
        <div class="ports-col">
          <div class="port output">
            <div class="port-socket cv" data-port="out"></div>
            <span>Env</span>
          </div>
        </div>
      </div>
      <div class="control">
        <label>A <span class="value-display" data-display="attack">0.05</span></label>
        <input type="range" data-param="attack" min="0.001" max="2" step="0.001" value="0.05" />
      </div>
      <div class="control">
        <label>D <span class="value-display" data-display="decay">0.20</span></label>
        <input type="range" data-param="decay" min="0.001" max="2" step="0.001" value="0.2" />
      </div>
      <div class="control">
        <label>S <span class="value-display" data-display="sustain">0.60</span></label>
        <input type="range" data-param="sustain" min="0" max="1" step="0.01" value="0.6" />
      </div>
      <div class="control">
        <label>R <span class="value-display" data-display="release">0.40</span></label>
        <input type="range" data-param="release" min="0.001" max="3" step="0.001" value="0.4" />
      </div>
    `;
  }

  _bindControls() {
    this.el.querySelectorAll('input[type="range"]').forEach(input => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector(`[data-display="${param}"]`);
        if (disp) disp.textContent = val.toFixed(2);
        this._drawEnvelope();
      });
    });
    this._drawEnvelope();
  }

  _drawEnvelope() {
    const canvas = this.el && this.el.querySelector('[data-adsr-vis]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const { attack, decay, sustain, release } = this.params;
    const total = attack + decay + 0.35 + release; // sustain visual dwell
    const pad = 4;
    const xA = pad + (attack / total) * (w - pad * 2);
    const xD = xA + (decay / total) * (w - pad * 2);
    const xS = xD + (0.35 / total) * (w - pad * 2);
    const xR = w - pad;
    const y0 = h - pad;
    const yPeak = pad;
    const ySus = pad + (1 - sustain) * (h - pad * 2);

    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1a2230';
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(w, y0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pad, y0);
    ctx.lineTo(xA, yPeak);
    ctx.lineTo(xD, ySus);
    ctx.lineTo(xS, ySus);
    ctx.lineTo(xR, y0);
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(pad, y0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(79,195,247,0.15)';
    ctx.fill();

    // labels
    ctx.fillStyle = '#8a93a8';
    ctx.font = '9px system-ui,sans-serif';
    ctx.fillText('A', (pad + xA) / 2 - 3, h - 6);
    ctx.fillText('D', (xA + xD) / 2 - 3, h - 6);
    ctx.fillText('S', (xD + xS) / 2 - 3, h - 6);
    ctx.fillText('R', (xS + xR) / 2 - 3, h - 6);
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    // Constant source que modulamos con gain (el envelope)
    this.constant = ctx.createConstantSource();
    this.constant.offset.value = 1;
    this.constant.start();

    this.envGain = ctx.createGain();
    this.envGain.gain.value = 0;
    this.constant.connect(this.envGain);

    this.getPort('out').node = this.envGain;

    // Gate: usamos un GainNode como "detector" de gate
    // En la práctica el Keyboard/Sequencer conectará y llamará trigger
    this.gateNode = ctx.createGain();
    this.gateNode.gain.value = 0;
    this.getPort('gate').node = this.gateNode;

    // Monitoreamos el gate de forma simple con un script o polling
    // Para simplicidad usamos un método público trigger
  }

  /**
   * @param {boolean} on
   * @param {number} [velocity=1] - 0..1, escala el pico del envelope
   */
  trigger(on, velocity = 1) {
    if (!this.envGain) return;
    const t = this.audioEngine.context.currentTime;
    const g = this.envGain.gain;
    const { attack, decay, sustain, release } = this.params;
    const peak = Math.max(0.01, Math.min(1, velocity));

    g.cancelScheduledValues(t);
    if (on) {
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(peak, t + attack);
      g.linearRampToValueAtTime(sustain * peak, t + attack + decay);
      this._gateOn = true;
    } else {
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + release);
      this._gateOn = false;
    }
  }

  destroy() {
    if (this.constant) {
      try { this.constant.stop(); this.constant.disconnect(); } catch(e){}
    }
    if (this.envGain) this.envGain.disconnect();
    super.destroy();
  }
}
