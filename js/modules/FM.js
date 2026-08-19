import { Module } from '../core/Module.js';

/**
 * FM – síntesis por modulación de frecuencia (Chowning / DX-style simple).
 * Carrier + 1 operador modulador. Ratio e índice (profundidad).
 * Freq CV = frecuencia del carrier (Hz).
 */
export class FM extends Module {
  constructor(audioEngine, x, y) {
    super('fm', audioEngine, x, y);
    this.title = 'FM';
    this.width = 200;
    this.params = {
      frequency: 220,
      ratio: 2,
      index: 100, // Hz de desviación del modulador → carrier.frequency
      modLevel: 1,
      carrierWave: 'sine',
      modWave: 'sine'
    };

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('mod', 'Mod CV', 'cv', 'in'); // escala el índice
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="freq"></div><span>Freq</span></div>' +
      '<div class="port input"><div class="port-socket cv" data-port="mod"></div><span>Index</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control"><label>Carrier</label>' +
      '<select data-param="carrierWave">' +
      '<option value="sine">Sine</option><option value="triangle">Tri</option>' +
      '<option value="square">Square</option><option value="sawtooth">Saw</option>' +
      '</select></div>' +
      '<div class="control"><label>Modulator</label>' +
      '<select data-param="modWave">' +
      '<option value="sine">Sine</option><option value="triangle">Tri</option>' +
      '<option value="square">Square</option><option value="sawtooth">Saw</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label>Freq <span class="value-display" data-display="frequency">220 Hz</span></label>' +
      '<input type="range" data-param="frequency" min="20" max="2000" step="1" value="220" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Ratio <span class="value-display" data-display="ratio">2.00</span></label>' +
      '<input type="range" data-param="ratio" min="0.25" max="16" step="0.01" value="2" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Index <span class="value-display" data-display="index">100</span></label>' +
      '<input type="range" data-param="index" min="0" max="2000" step="1" value="100" />' +
      '</div>'
    );
  }

  _bindControls() {
    this.el.querySelectorAll('select[data-param]').forEach((sel) => {
      const p = sel.dataset.param;
      sel.value = this.params[p];
      sel.addEventListener('change', (e) => {
        this.params[p] = e.target.value;
        this.applyParams();
      });
    });
    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector('[data-display="' + param + '"]');
        if (disp) {
          if (param === 'frequency') disp.textContent = Math.round(val) + ' Hz';
          else if (param === 'ratio') disp.textContent = val.toFixed(2);
          else disp.textContent = String(Math.round(val));
        }
        this.applyParams();
      });
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    // Modulator → modGain (index) → carrier.frequency
    this.modOsc = ctx.createOscillator();
    this.modOsc.type = this.params.modWave;
    this.modOsc.frequency.value = this.params.frequency * this.params.ratio;

    this.modGain = ctx.createGain();
    this.modGain.gain.value = this.params.index;

    this.carrier = ctx.createOscillator();
    this.carrier.type = this.params.carrierWave;
    this.carrier.frequency.value = this.params.frequency;

    this.outGain = ctx.createGain();
    this.outGain.gain.value = 0.4;

    this.modOsc.connect(this.modGain);
    this.modGain.connect(this.carrier.frequency);
    this.carrier.connect(this.outGain);

    this.modOsc.start();
    this.carrier.start();

    this.indexConst = this.audioEngine.createConstant(1);
    this.getPort('out').node = this.outGain;
    // Freq CV → carrier.frequency (y mod = ratio * carrier vía sync)
    this.getPort('freq').node = this.carrier.frequency;
    this.getPort('mod').node = this.indexConst;

    this._timer = setInterval(() => this._sync(), 25);
    this.applyParams();
  }

  _sync() {
    if (!this.carrier || !this.audioEngine.context) return;
    const hasCv = this.getPort('freq').connections.length > 0;
    const f = hasCv ? 0 : this.params.frequency;
    const ratio = this.params.ratio;
    const idxScale = Math.max(0, this.indexConst ? this.indexConst.offset.value : 1);
    let scale = 1;
    if (this.getPort('mod').connections.length) {
      scale = idxScale > 2 ? Math.min(1, idxScale / 100) : idxScale;
    }
    const t = this.audioEngine.context.currentTime;
    try {
      this.carrier.frequency.setValueAtTime(f, t);
      // mod osc: sin CV usa f*ratio; con CV se aproxima con ratio sobre última nota via timer
      if (!hasCv) this.modOsc.frequency.setValueAtTime(this.params.frequency * ratio, t);
      this.modGain.gain.setValueAtTime(this.params.index * scale, t);
    } catch (e) {}
  }

  applyParams() {
    if (!this.carrier) return;
    this.carrier.type = this.params.carrierWave;
    this.modOsc.type = this.params.modWave;
    this._sync();
  }

  destroy() {
    if (this._timer) clearInterval(this._timer);
    [this.modOsc, this.carrier].forEach((o) => {
      if (o) try { o.stop(); o.disconnect(); } catch (e) {}
    });
    [this.modGain, this.outGain, this.freqConst, this.indexConst].forEach((n) => {
      if (n) try { n.disconnect(); } catch (e) {}
    });
    super.destroy();
  }
}
