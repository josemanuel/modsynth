import { Module } from '../core/Module.js';

let workletLoadPromise = null;

function ensureWorklet(ctx) {
  if (!ctx || !ctx.audioWorklet) {
    return Promise.reject(new Error('AudioWorklet no soportado en este contexto'));
  }
  if (ctx._modsynthPvLoaded) return Promise.resolve();
  if (!workletLoadPromise) {
    // Ruta relativa al documento (GitHub Pages / local)
    const url = new URL('js/worklets/phase-vocoder-processor.js', document.baseURI || window.location.href);
    workletLoadPromise = ctx.audioWorklet
      .addModule(url.href)
      .then(() => {
        ctx._modsynthPvLoaded = true;
      })
      .catch((err) => {
        workletLoadPromise = null;
        throw err;
      });
  }
  return workletLoadPromise;
}

/**
 * PhaseVocoder – pitch shift / freeze espectral vía AudioWorklet (STFT).
 * In audio → Out audio. Pitch CV opcional (rate 0.25–4 o Hz/440).
 */
export class PhaseVocoder extends Module {
  constructor(audioEngine, x, y) {
    super('phasevocoder', audioEngine, x, y);
    this.title = 'Phase Vocoder';
    this.width = 200;
    this.params = {
      pitch: 1,
      freeze: false,
      wet: 1,
      gain: 0.85
    };
    this._node = null;
    this._ready = false;
    this._error = '';

    this.addPort('in', 'In', 'audio', 'in');
    this.addPort('pitch', 'Pitch CV', 'cv', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket audio" data-port="in"></div><span>In</span></div>' +
      '<div class="port input"><div class="port-socket cv" data-port="pitch"></div><span>Pitch</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="pv-status" data-pv-status>Worklet: —</div>' +
      '<div class="control">' +
      '<label>Pitch <span class="value-display" data-display="pitch">1.00</span></label>' +
      '<input type="range" data-param="pitch" min="0.25" max="4" step="0.01" value="1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Wet <span class="value-display" data-display="wet">1.00</span></label>' +
      '<input type="range" data-param="wet" min="0" max="1" step="0.01" value="1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Gain <span class="value-display" data-display="gain">0.85</span></label>' +
      '<input type="range" data-param="gain" min="0" max="1" step="0.01" value="0.85" />' +
      '</div>' +
      '<div class="control">' +
      '<label><input type="checkbox" data-param="freeze" /> Freeze espectral</label>' +
      '</div>' +
      '<div class="pv-hint">STFT 2048 · hop 512 · AudioWorklet</div>'
    );
  }

  _bindControls() {
    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const p = input.dataset.param;
      input.value = this.params[p];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[p] = val;
        const d = this.el.querySelector('[data-display="' + p + '"]');
        if (d) d.textContent = val.toFixed(2);
        this.applyParams();
      });
    });
    const fr = this.el.querySelector('[data-param="freeze"]');
    if (fr) {
      fr.checked = !!this.params.freeze;
      fr.addEventListener('change', (e) => {
        this.params.freeze = e.target.checked;
        this.applyParams();
      });
    }
  }

  _setStatus(msg) {
    const el = this.el && this.el.querySelector('[data-pv-status]');
    if (el) el.textContent = msg;
  }

  async buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.inGain = ctx.createGain();
    this.inGain.gain.value = 1;
    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.gain;
    this.pitchConst = this.audioEngine.createConstant(1);

    this.getPort('in').node = this.inGain;
    this.getPort('pitch').node = this.pitchConst;
    this.getPort('out').node = this.outGain;

    this._setStatus('Cargando worklet…');
    try {
      await ensureWorklet(ctx);
      this._node = new AudioWorkletNode(ctx, 'phase-vocoder-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.inGain.connect(this._node);
      this._node.connect(this.outGain);
      this._ready = true;
      this._setStatus('Worklet: OK');
      this.applyParams();
      // Pitch CV polling
      this._timer = setInterval(() => this._syncPitchCv(), 40);
    } catch (err) {
      console.error('[PhaseVocoder]', err);
      this._error = err.message || String(err);
      this._setStatus('Error: ' + this._error);
      // Bypass dry
      try {
        this.inGain.connect(this.outGain);
      } catch (e) {}
    }
  }

  _syncPitchCv() {
    if (!this._ready || !this._node) return;
    if (this.getPort('pitch').connections.length && this.pitchConst) {
      let p = this.pitchConst.offset.value;
      if (p > 20) p = p / 440; // Hz → ratio aprox
      p = Math.max(0.25, Math.min(4, p));
      try {
        this._node.parameters.get('pitch').setValueAtTime(p, this.audioEngine.context.currentTime);
      } catch (e) {}
    }
  }

  applyParams() {
    if (!this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    if (this.outGain) this.outGain.gain.setValueAtTime(this.params.gain, t);
    if (!this._node) return;
    try {
      const pitch = this.getPort('pitch').connections.length
        ? this._node.parameters.get('pitch').value
        : this.params.pitch;
      if (!this.getPort('pitch').connections.length) {
        this._node.parameters.get('pitch').setValueAtTime(this.params.pitch, t);
      }
      this._node.parameters.get('freeze').setValueAtTime(this.params.freeze ? 1 : 0, t);
      this._node.parameters.get('wet').setValueAtTime(this.params.wet, t);
    } catch (e) {}
  }

  destroy() {
    if (this._timer) clearInterval(this._timer);
    if (this._node) {
      try {
        this._node.disconnect();
      } catch (e) {}
      this._node = null;
    }
    if (this.inGain) try { this.inGain.disconnect(); } catch (e) {}
    if (this.outGain) try { this.outGain.disconnect(); } catch (e) {}
    if (this.pitchConst) try { this.pitchConst.disconnect(); } catch (e) {}
    super.destroy();
  }
}
