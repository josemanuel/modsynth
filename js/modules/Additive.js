import { Module } from '../core/Module.js';

const MAX_PARTIALS = 16;

/**
 * Additive – Fourier + stretch / inarmonicidad.
 * f_n ≈ f0 * n^stretch  (stretch=1 armónico; >1 tipo barra/campana; <1 comprimido)
 * offset inarmónico adicional por parcial.
 */
export class Additive extends Module {
  constructor(audioEngine, x, y) {
    super('additive', audioEngine, x, y);
    this.title = 'Additive';
    this.width = 230;
    this.params = {
      frequency: 110,
      detune: 0,
      partials: 8,
      stretch: 1, // 1 = harmonic
      inharm: 0, // 0..1 amount of extra inharmonic drift
      levels: defaultLevels()
    };
    this.oscs = [];
    this.gains = [];

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    let bars = '';
    for (let i = 0; i < MAX_PARTIALS; i++) {
      const lv = this.params.levels[i] || 0;
      bars +=
        '<div class="add-partial" data-partial="' + i + '">' +
        '<span class="add-n">' + (i + 1) + '</span>' +
        '<input type="range" class="add-bar" data-level="' + i + '" min="0" max="1" step="0.01" value="' + lv + '" />' +
        '</div>';
    }
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="freq"></div><span>Freq</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<label>Freq <span class="value-display" data-display="frequency">110 Hz</span></label>' +
      '<input type="range" data-param="frequency" min="20" max="1000" step="1" value="110" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Detune <span class="value-display" data-display="detune">0</span></label>' +
      '<input type="range" data-param="detune" min="-50" max="50" step="1" value="0" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Partials <span class="value-display" data-display="partials">8</span></label>' +
      '<input type="range" data-param="partials" min="1" max="' + MAX_PARTIALS + '" step="1" value="8" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Stretch <span class="value-display" data-display="stretch">1.00</span></label>' +
      '<input type="range" data-param="stretch" min="0.5" max="2.5" step="0.01" value="1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Inharm <span class="value-display" data-display="inharm">0.00</span></label>' +
      '<input type="range" data-param="inharm" min="0" max="1" step="0.01" value="0" />' +
      '</div>' +
      '<div class="add-bars" data-bars>' + bars + '</div>' +
      '<div class="control" style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">' +
      '<button type="button" class="btn" data-action="saw">Saw</button>' +
      '<button type="button" class="btn" data-action="square">Square</button>' +
      '<button type="button" class="btn" data-action="triangle">Tri</button>' +
      '<button type="button" class="btn" data-action="bell">Bell</button>' +
      '<button type="button" class="btn" data-action="clear">Clear</button>' +
      '</div>' +
      '<div class="wt-hint">Stretch 1 = armónico · &gt;1 barra/campana · Inharm = deriva</div>'
    );
  }

  _bindControls() {
    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector('[data-display="' + param + '"]');
        if (disp) {
          if (param === 'frequency') disp.textContent = Math.round(val) + ' Hz';
          else if (param === 'stretch' || param === 'inharm') disp.textContent = val.toFixed(2);
          else disp.textContent = String(Math.round(val));
        }
        if (param === 'partials') this._updatePartialVisibility();
        this.applyParams();
      });
    });

    this.el.querySelectorAll('input[data-level]').forEach((input) => {
      const i = parseInt(input.dataset.level, 10);
      input.addEventListener('input', (e) => {
        this.params.levels[i] = parseFloat(e.target.value);
        this.applyParams();
      });
    });

    const presets = {
      saw: () => {
        for (let i = 0; i < MAX_PARTIALS; i++) this.params.levels[i] = 1 / (i + 1);
        this.params.stretch = 1;
        this.params.inharm = 0;
      },
      square: () => {
        for (let i = 0; i < MAX_PARTIALS; i++) {
          this.params.levels[i] = i % 2 === 0 ? 1 / (i + 1) : 0;
        }
        this.params.stretch = 1;
        this.params.inharm = 0;
      },
      triangle: () => {
        for (let i = 0; i < MAX_PARTIALS; i++) {
          this.params.levels[i] = i % 2 === 0 ? 1 / ((i + 1) * (i + 1)) : 0;
        }
        this.params.stretch = 1;
        this.params.inharm = 0;
      },
      bell: () => {
        // campana: pocos parciales, stretch > 1
        for (let i = 0; i < MAX_PARTIALS; i++) this.params.levels[i] = 0;
        this.params.levels[0] = 1;
        this.params.levels[1] = 0.55;
        this.params.levels[2] = 0.35;
        this.params.levels[4] = 0.25;
        this.params.levels[6] = 0.15;
        this.params.stretch = 1.4;
        this.params.inharm = 0.15;
        this.params.partials = 8;
      },
      clear: () => {
        for (let i = 0; i < MAX_PARTIALS; i++) this.params.levels[i] = i === 0 ? 1 : 0;
      }
    };

    this.el.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fn = presets[btn.dataset.action];
        if (!fn) return;
        fn();
        this._syncLevelUI();
        this._syncParamUI();
        this._updatePartialVisibility();
        this.applyParams();
      });
    });

    this._updatePartialVisibility();
  }

  _syncLevelUI() {
    this.el.querySelectorAll('input[data-level]').forEach((input) => {
      const i = parseInt(input.dataset.level, 10);
      input.value = this.params.levels[i] || 0;
    });
  }

  _syncParamUI() {
    ['stretch', 'inharm', 'partials'].forEach((param) => {
      const input = this.el.querySelector('[data-param="' + param + '"]');
      if (input) input.value = this.params[param];
      const disp = this.el.querySelector('[data-display="' + param + '"]');
      if (disp) {
        if (param === 'stretch' || param === 'inharm') disp.textContent = Number(this.params[param]).toFixed(2);
        else disp.textContent = String(Math.round(this.params[param]));
      }
    });
  }

  _updatePartialVisibility() {
    const n = this.params.partials || 1;
    this.el.querySelectorAll('[data-partial]').forEach((el) => {
      const i = parseInt(el.dataset.partial, 10);
      el.style.opacity = i < n ? '1' : '0.25';
      el.style.pointerEvents = i < n ? 'auto' : 'none';
    });
  }

  /** Ratio de frecuencia del parcial n (0-based): n^stretch + deriva inarmónica */
  _partialRatio(n) {
    const stretch = this.params.stretch || 1;
    const inharm = this.params.inharm || 0;
    // clásico stretch de cuerda/barra: (n+1)^stretch
    let ratio = Math.pow(n + 1, stretch);
    if (inharm > 0 && n > 0) {
      // deriva no lineal tipo parciales de campana
      ratio += inharm * Math.sin(n * 1.7) * n * 0.15;
      ratio += inharm * n * n * 0.02;
    }
    return Math.max(0.1, ratio);
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.outGain = ctx.createGain();
    this.outGain.gain.value = 0.35;
    this.merge = ctx.createGain();
    this.merge.gain.value = 1;
    this.merge.connect(this.outGain);

    this.oscs = [];
    this.gains = [];
    for (let i = 0; i < MAX_PARTIALS; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.params.frequency * this._partialRatio(i);
      const g = ctx.createGain();
      g.gain.value = this.params.levels[i] || 0;
      osc.connect(g);
      g.connect(this.merge);
      osc.start();
      this.oscs.push(osc);
      this.gains.push(g);
    }

    this.freqConst = this.audioEngine.createConstant(this.params.frequency);
    this.getPort('out').node = this.outGain;
    this.getPort('freq').node = this.freqConst;

    this._freqTimer = setInterval(() => this._syncFromCv(), 25);
    this.applyParams();
  }

  _syncFromCv() {
    if (!this.oscs.length || !this.freqConst || !this.audioEngine.context) return;
    let f = this.params.frequency;
    const cv = this.freqConst.offset.value;
    if (cv > 20) f = cv;
    const det = Math.pow(2, (this.params.detune || 0) / 1200);
    const n = this.params.partials || 1;
    const t = this.audioEngine.context.currentTime;
    for (let i = 0; i < MAX_PARTIALS; i++) {
      const freq = Math.min(f * this._partialRatio(i) * det, 20000);
      try {
        this.oscs[i].frequency.setValueAtTime(freq, t);
        this.gains[i].gain.setValueAtTime(i < n ? this.params.levels[i] || 0 : 0, t);
      } catch (e) {}
    }
  }

  applyParams() {
    this._syncFromCv();
  }

  destroy() {
    if (this._freqTimer) clearInterval(this._freqTimer);
    this.oscs.forEach((o) => {
      try { o.stop(); o.disconnect(); } catch (e) {}
    });
    this.gains.forEach((g) => {
      try { g.disconnect(); } catch (e) {}
    });
    if (this.merge) this.merge.disconnect();
    if (this.outGain) this.outGain.disconnect();
    if (this.freqConst) this.freqConst.disconnect();
    super.destroy();
  }
}

function defaultLevels() {
  const a = [];
  for (let i = 0; i < MAX_PARTIALS; i++) a.push(i === 0 ? 1 : 1 / (i + 1));
  return a;
}
