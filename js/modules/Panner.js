import { Module } from '../core/Module.js';

/**
 * Panner – panoramizador L/R (divisor estéreo).
 * In mono → Out L / Out R con pan -1..+1.
 * También Out stereo (merge) para cadenas mono.
 */
export class Panner extends Module {
  constructor(audioEngine, x, y) {
    super('panner', audioEngine, x, y);
    this.title = 'Panner';
    this.width = 160;
    this.params = { pan: 0, level: 1 }; // -1 L .. +1 R
    this.addPort('in', 'In', 'audio', 'in');
    this.addPort('pan', 'Pan CV', 'cv', 'in');
    this.addPort('outL', 'Out L', 'audio', 'out');
    this.addPort('outR', 'Out R', 'audio', 'out');
    this.addPort('out', 'Out M', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket audio" data-port="in"></div><span>In</span></div>' +
      '<div class="port input"><div class="port-socket cv" data-port="pan"></div><span>Pan</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="outL"></div><span>L</span></div>' +
      '<div class="port output"><div class="port-socket audio" data-port="outR"></div><span>R</span></div>' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>M</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<label>Pan <span class="value-display" data-display="pan">C</span></label>' +
      '<input type="range" data-param="pan" min="-1" max="1" step="0.01" value="0" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Level <span class="value-display" data-display="level">1.00</span></label>' +
      '<input type="range" data-param="level" min="0" max="1" step="0.01" value="1" />' +
      '</div>'
    );
  }

  _bindControls() {
    this.el.querySelectorAll('input[type="range"]').forEach((input) => {
      const p = input.dataset.param;
      input.addEventListener('input', (e) => {
        this.params[p] = parseFloat(e.target.value);
        const d = this.el.querySelector('[data-display="' + p + '"]');
        if (d) {
          if (p === 'pan') {
            const v = this.params.pan;
            d.textContent = Math.abs(v) < 0.05 ? 'C' : v < 0 ? 'L' + Math.abs(v).toFixed(2) : 'R' + v.toFixed(2);
          } else d.textContent = this.params[p].toFixed(2);
        }
        this.applyParams();
      });
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = this.params.level;
    this.gainL = ctx.createGain();
    this.gainR = ctx.createGain();
    this.merge = ctx.createGain();

    this.inputGain.connect(this.gainL);
    this.inputGain.connect(this.gainR);
    this.gainL.connect(this.merge);
    this.gainR.connect(this.merge);

    this.panConst = this.audioEngine.createConstant(0);

    this.getPort('in').node = this.inputGain;
    this.getPort('pan').node = this.panConst;
    this.getPort('outL').node = this.gainL;
    this.getPort('outR').node = this.gainR;
    this.getPort('out').node = this.merge;

    this._timer = setInterval(() => this._syncPan(), 30);
    this.applyParams();
  }

  _syncPan() {
    if (!this.gainL || !this.audioEngine.context) return;
    let pan = this.params.pan;
    if (this.getPort('pan').connections.length && this.panConst) {
      const cv = this.panConst.offset.value;
      // -1..1 or 0..1 → map
      if (cv >= 0 && cv <= 1 && Math.abs(this.params.pan) < 0.01) pan = cv * 2 - 1;
      else if (cv >= -1 && cv <= 1) pan = cv;
    }
    pan = Math.max(-1, Math.min(1, pan));
    // equal-power
    const l = Math.cos((pan + 1) * 0.25 * Math.PI);
    const r = Math.sin((pan + 1) * 0.25 * Math.PI);
    const t = this.audioEngine.context.currentTime;
    this.gainL.gain.setValueAtTime(l, t);
    this.gainR.gain.setValueAtTime(r, t);
  }

  applyParams() {
    if (!this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    if (this.inputGain) this.inputGain.gain.setValueAtTime(this.params.level, t);
    this._syncPan();
  }

  destroy() {
    if (this._timer) clearInterval(this._timer);
    [this.inputGain, this.gainL, this.gainR, this.merge, this.panConst].forEach((n) => {
      if (n) try { n.disconnect(); } catch (e) {}
    });
    super.destroy();
  }
}
