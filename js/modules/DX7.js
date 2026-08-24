import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';
import { allocateVoice, findVoiceByNote, triggerEnv } from '../core/VoiceAllocator.js';

/**
 * DX7-style 6-op FM + EG por operador + escalado de nivel 0–99.
 *
 * EG: ADSR por OP (simplificación del R1–4/L1–4 del DX7).
 * Level: 0–99 con curva no lineal similar a OL del DX.
 * Velocity: escala el pico del EG por operador (sens).
 */

const ALGORITHMS = [
  { id: 1,  carriers: [0],             edges: [[1,0],[2,1],[3,2],[4,3],[5,4]], fb: 5 },
  { id: 2,  carriers: [0],             edges: [[1,0],[2,1],[3,2],[4,3],[5,4]], fb: 4 },
  { id: 3,  carriers: [0, 3],          edges: [[1,0],[2,1],[4,3],[5,4]],       fb: 5 },
  { id: 4,  carriers: [0, 3],          edges: [[1,0],[2,1],[4,3],[5,4]],       fb: 3 },
  { id: 5,  carriers: [0, 2, 4],       edges: [[1,0],[3,2],[5,4]],             fb: 5 },
  { id: 6,  carriers: [0, 2, 4],       edges: [[1,0],[3,2],[5,4]],             fb: 4 },
  { id: 7,  carriers: [0, 2],          edges: [[1,0],[3,2],[4,2],[5,4]],       fb: 5 },
  { id: 8,  carriers: [0, 2],          edges: [[1,0],[3,2],[4,2],[5,4]],       fb: 3 },
  { id: 9,  carriers: [0, 2],          edges: [[1,0],[3,2],[4,2],[5,4]],       fb: 1 },
  { id: 10, carriers: [0, 3],          edges: [[1,0],[2,0],[4,3],[5,4]],       fb: 2 },
  { id: 11, carriers: [0, 3],          edges: [[1,0],[2,0],[4,3],[5,4]],       fb: 5 },
  { id: 12, carriers: [0, 2],          edges: [[1,0],[3,2],[4,2],[5,2]],       fb: 1 },
  { id: 13, carriers: [0, 2],          edges: [[1,0],[3,2],[4,2],[5,2]],       fb: 5 },
  { id: 14, carriers: [0, 2],          edges: [[1,0],[3,2],[4,3],[5,3]],       fb: 5 },
  { id: 15, carriers: [0, 2],          edges: [[1,0],[3,2],[4,3],[5,3]],       fb: 1 },
  { id: 16, carriers: [0],             edges: [[1,0],[2,0],[3,0],[4,3],[5,4]], fb: 5 },
  { id: 17, carriers: [0],             edges: [[1,0],[2,0],[3,0],[4,3],[5,4]], fb: 1 },
  { id: 18, carriers: [0],             edges: [[1,0],[2,0],[3,2],[4,2],[5,2]], fb: 2 },
  { id: 19, carriers: [0, 3, 4],       edges: [[1,0],[2,1],[5,3],[5,4]],       fb: 5 },
  { id: 20, carriers: [0, 1, 3],       edges: [[2,0],[2,1],[4,3],[5,3]],       fb: 2 },
  { id: 21, carriers: [0, 1, 3, 4],    edges: [[2,0],[2,1],[5,3],[5,4]],       fb: 2 },
  { id: 22, carriers: [0, 2, 3, 4],    edges: [[1,0],[5,2],[5,3],[5,4]],       fb: 5 },
  { id: 23, carriers: [0, 1, 3, 4],    edges: [[2,1],[5,3],[5,4]],             fb: 5 },
  { id: 24, carriers: [0, 1, 2, 3, 4], edges: [[5,2],[5,3],[5,4]],             fb: 5 },
  { id: 25, carriers: [0, 1, 2, 3, 4], edges: [[5,3],[5,4]],                   fb: 5 },
  { id: 26, carriers: [0, 1, 3],       edges: [[2,1],[4,3],[5,4]],             fb: 5 },
  { id: 27, carriers: [0, 1, 3],       edges: [[2,1],[4,3],[5,4]],             fb: 4 },
  { id: 28, carriers: [0, 2, 5],       edges: [[1,0],[3,2],[4,3]],             fb: 4 },
  { id: 29, carriers: [0, 1, 2, 4],    edges: [[3,2],[5,4]],                   fb: 5 },
  { id: 30, carriers: [0, 1, 2, 5],    edges: [[3,2],[4,3]],                   fb: 4 },
  { id: 31, carriers: [0, 1, 2, 3, 4], edges: [[5,4]],                         fb: 5 },
  { id: 32, carriers: [0, 1, 2, 3, 4, 5], edges: [],                           fb: 5 }
];


/** Regiones (% sobre la carta) para resaltar el algoritmo activo */
const ALGO_HIGHLIGHT = {
  1:  { x: 1,  y: 70, w: 11, h: 28 },
  2:  { x: 12, y: 70, w: 11, h: 28 },
  3:  { x: 24, y: 70, w: 12, h: 28 },
  4:  { x: 36, y: 70, w: 12, h: 28 },
  5:  { x: 49, y: 70, w: 12, h: 28 },
  6:  { x: 61, y: 70, w: 12, h: 28 },
  7:  { x: 74, y: 70, w: 8,  h: 28 },
  8:  { x: 82, y: 70, w: 8,  h: 28 },
  9:  { x: 90, y: 70, w: 9,  h: 28 },
  10: { x: 1,  y: 48, w: 10, h: 20 },
  11: { x: 11, y: 48, w: 10, h: 20 },
  12: { x: 22, y: 48, w: 10, h: 20 },
  13: { x: 33, y: 48, w: 10, h: 20 },
  14: { x: 44, y: 48, w: 10, h: 20 },
  15: { x: 55, y: 48, w: 10, h: 20 },
  16: { x: 66, y: 48, w: 10, h: 20 },
  17: { x: 77, y: 48, w: 10, h: 20 },
  18: { x: 88, y: 48, w: 11, h: 20 },
  19: { x: 1,  y: 26, w: 13, h: 20 },
  20: { x: 15, y: 26, w: 13, h: 20 },
  21: { x: 29, y: 26, w: 13, h: 20 },
  22: { x: 43, y: 26, w: 13, h: 20 },
  23: { x: 57, y: 26, w: 13, h: 20 },
  24: { x: 71, y: 26, w: 13, h: 20 },
  25: { x: 85, y: 26, w: 14, h: 20 },
  26: { x: 1,  y: 2,  w: 13, h: 22 },
  27: { x: 15, y: 2,  w: 13, h: 22 },
  28: { x: 29, y: 2,  w: 13, h: 22 },
  29: { x: 43, y: 2,  w: 13, h: 22 },
  30: { x: 57, y: 2,  w: 13, h: 22 },
  31: { x: 71, y: 2,  w: 13, h: 22 },
  32: { x: 85, y: 2,  w: 14, h: 22 }
};

/**
 * Presets por algoritmo: ratios, levels 0–99, feedback, EG tipicos.
 * Inspirados en usos clasicos (piano, brass, bell, organ…).
 */
function presetForAlgorithm(id) {
  const egCar = { a: 0.02, d: 0.25, s: 0.65, r: 0.35, velSens: 0.4 };
  const egMod = { a: 0.01, d: 0.35, s: 0.3, r: 0.25, velSens: 0.55 };
  const egPerc = { a: 0.001, d: 0.45, s: 0.0, r: 0.2, velSens: 0.7 };
  const egSlow = { a: 0.15, d: 0.4, s: 0.8, r: 0.8, velSens: 0.25 };

  // defaults
  let ratios = [1, 1, 1, 1, 1, 1];
  let levels = [99, 70, 70, 70, 70, 70];
  let feedback = 0.25;
  let egs = [0,1,2,3,4,5].map(() => ({ ...egCar }));

  switch (id) {
    case 1: // stack brass/lead
      ratios = [1, 1, 1, 1, 1, 1];
      levels = [99, 75, 70, 65, 55, 45];
      feedback = 0.35;
      egs = [egCar, egMod, egMod, egMod, egMod, egMod].map((e) => ({ ...e }));
      break;
    case 2:
      ratios = [1, 1, 1, 1, 2, 3];
      levels = [99, 70, 65, 60, 50, 40];
      feedback = 0.2;
      break;
    case 5: // pairs – e.piano-ish
      ratios = [1, 14, 1, 1, 1, 1];
      levels = [99, 72, 90, 55, 85, 50];
      feedback = 0.15;
      egs = [egPerc, egMod, egPerc, egMod, egPerc, egMod].map((e) => ({ ...e }));
      break;
    case 6:
      ratios = [1, 3, 1, 2, 1, 4];
      levels = [99, 60, 90, 55, 80, 45];
      feedback = 0.2;
      egs = [egPerc, egMod, egPerc, egMod, egPerc, egMod].map((e) => ({ ...e }));
      break;
    case 8:
      ratios = [1, 1, 1, 2, 3, 3];
      levels = [99, 65, 90, 70, 55, 45];
      feedback = 0.25;
      break;
    case 16:
      ratios = [1, 1, 2, 3, 3, 4];
      levels = [99, 55, 50, 70, 60, 45];
      feedback = 0.3;
      egs = [egCar, egMod, egMod, egMod, egMod, egMod].map((e) => ({ ...e }));
      break;
    case 18:
      ratios = [1, 1, 1, 2, 3, 5];
      levels = [99, 60, 55, 50, 45, 40];
      feedback = 0.4;
      break;
    case 22:
      ratios = [1, 1, 1, 1, 1, 2];
      levels = [85, 80, 75, 70, 65, 55];
      feedback = 0.2;
      egs = [egSlow, egSlow, egSlow, egSlow, egSlow, egMod].map((e) => ({ ...e }));
      break;
    case 32: // additive-ish organ
      ratios = [1, 2, 3, 4, 5, 6];
      levels = [99, 70, 55, 40, 30, 25];
      feedback = 0.1;
      egs = [egSlow, egSlow, egSlow, egSlow, egSlow, egSlow].map((e) => ({ ...e }));
      break;
    default: {
      // generico segun carriers del algoritmo
      const algo = ALGORITHMS[id - 1];
      if (algo) {
        levels = [0, 0, 0, 0, 0, 0];
        ratios = [1, 1, 2, 2, 3, 3];
        algo.carriers.forEach((c) => { levels[c] = 90; });
        algo.edges.forEach(([m], i) => { levels[m] = Math.max(levels[m], 55 - (i % 5) * 5); });
        if (levels[algo.fb] < 40) levels[algo.fb] = 45;
        feedback = 0.25;
        egs = [0,1,2,3,4,5].map((i) =>
          algo.carriers.includes(i) ? { ...egCar } : { ...egMod }
        );
      }
      break;
    }
  }
  return { ratios, levels, feedback, eg: egs };
}

const DEFAULT_RATIOS = [1, 1, 1, 2, 3, 3];
const DEFAULT_LEVELS = [99, 75, 70, 65, 60, 55]; // 0–99 DX-style

function defaultEG() {
  return { a: 0.01, d: 0.2, s: 0.7, r: 0.35, velSens: 0.5 };
}

/**
 * Curva de nivel DX aproximada: OL 0–99 → ganancia perceptualmente no lineal.
 * Por encima de ~80 crece más rápido (característico del DX).
 */
function dxLevelScale(level99) {
  const x = Math.max(0, Math.min(99, level99)) / 99;
  // aproximación suave a la tabla OL del DX7
  const y = Math.pow(x, 1.6);
  return y;
}

export class DX7 extends Module {
  constructor(audioEngine, x, y) {
    super('dx7', audioEngine, x, y);
    this.title = 'DX7 FM';
    this.width = 320;
    this.params = {
      numVoices: 4,
      steal: 'oldest',
      frequency: 220,
      algorithm: 1,
      feedback: 0.25,
      ratios: DEFAULT_RATIOS.slice(),
      levels: DEFAULT_LEVELS.slice(),
      waves: ['sine', 'sine', 'sine', 'sine', 'sine', 'sine'],
      eg: [0, 1, 2, 3, 4, 5].map(() => defaultEG()),
      editOp: 0,
      autoPreset: true
    };
    this.ops = [];
    this._algoConns = [];
    this._lastVel = 1;

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    let algoOpts = '';
    for (let i = 1; i <= 32; i++) {
      algoOpts += '<option value="' + i + '"' + (i === 1 ? ' selected' : '') + '>Algo ' + i + '</option>';
    }
    let opTabs = '';
    for (let i = 0; i < 6; i++) {
      opTabs +=
        '<button type="button" class="dx-tab' + (i === 0 ? ' active' : '') +
        '" data-edit-op="' + i + '">OP' + (i + 1) + '</button>';
    }
    let opsHtml = '';
    for (let i = 0; i < 6; i++) {
      const wv = this.params.waves[i] || 'sine';
      opsHtml +=
        '<div class="dx-op" data-op="' + i + '">' +
        '<div class="dx-op-title">OP' + (i + 1) + '</div>' +
        '<label>Wave</label>' +
        '<select data-wave="' + i + '">' +
        '<option value="sine"' + (wv === 'sine' ? ' selected' : '') + '>Sine</option>' +
        '<option value="triangle"' + (wv === 'triangle' ? ' selected' : '') + '>Tri</option>' +
        '<option value="sawtooth"' + (wv === 'sawtooth' ? ' selected' : '') + '>Saw</option>' +
        '<option value="square"' + (wv === 'square' ? ' selected' : '') + '>Square</option>' +
        '</select>' +
        '<label>Ratio <span data-disp-ratio="' + i + '">' + this.params.ratios[i] + '</span></label>' +
        '<input type="range" data-ratio="' + i + '" min="0.5" max="31" step="0.01" value="' + this.params.ratios[i] + '" />' +
        '<label>Level <span data-disp-level="' + i + '">' + this.params.levels[i] + '</span></label>' +
        '<input type="range" data-level="' + i + '" min="0" max="99" step="1" value="' + this.params.levels[i] + '" />' +
        '</div>';
    }
    const eg = this.params.eg[0];
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="freq"></div><span>Freq</span></div>' +
      '<div class="port input"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control"><label>Algorithm</label>' +
      '<select data-param="algorithm">' + algoOpts + '</select></div>' +
      '<div class="control" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
      '<label style="flex-direction:row;gap:6px;align-items:center;margin:0">' +
      '<input type="checkbox" data-param="autoPreset"' + (this.params.autoPreset ? ' checked' : '') + ' /> Auto preset' +
      '</label>' +
      '<button type="button" class="btn" data-action="load-preset" style="flex:1">Cargar preset</button>' +
      '</div>' +
      '<div class="dx-algo-chart-wrap">' +
      '<div class="dx-algo-chart-box">' +
      '<img class="dx-algo-chart" src="docs/algoritmos_dx7.png" alt="Algoritmos DX7" data-algo-chart />' +
      '<div class="dx-algo-hl" data-algo-hl></div>' +
      '</div>' +
      '<div class="dx-algo-visual" data-algo-visual title="Estructura del algoritmo seleccionado"></div>' +
      '</div>' +
      '<div class="control">' +
      '<label>Feedback <span class="value-display" data-display="feedback">0.25</span></label>' +
      '<input type="range" data-param="feedback" min="0" max="1" step="0.01" value="0.25" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Voces <span class="value-display" data-display="numVoices">4</span></label>' +
      '<input type="range" data-param="numVoices" min="1" max="4" step="1" value="4" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Freq <span class="value-display" data-display="frequency">220 Hz</span></label>' +
      '<input type="range" data-param="frequency" min="20" max="2000" step="1" value="220" />' +
      '</div>' +
      '<div class="dx-ops">' + opsHtml + '</div>' +
      '<div class="la-section">EG operador</div>' +
      '<div class="dx-tabs">' + opTabs + '</div>' +
      '<div class="dx-eg" data-eg-panel>' +
      '<div class="control">' +
      '<label>A <span data-eg-disp="a">' + eg.a.toFixed(2) + '</span></label>' +
      '<input type="range" data-eg="a" min="0.001" max="2" step="0.001" value="' + eg.a + '" />' +
      '</div>' +
      '<div class="control">' +
      '<label>D <span data-eg-disp="d">' + eg.d.toFixed(2) + '</span></label>' +
      '<input type="range" data-eg="d" min="0.001" max="2" step="0.001" value="' + eg.d + '" />' +
      '</div>' +
      '<div class="control">' +
      '<label>S <span data-eg-disp="s">' + eg.s.toFixed(2) + '</span></label>' +
      '<input type="range" data-eg="s" min="0" max="1" step="0.01" value="' + eg.s + '" />' +
      '</div>' +
      '<div class="control">' +
      '<label>R <span data-eg-disp="r">' + eg.r.toFixed(2) + '</span></label>' +
      '<input type="range" data-eg="r" min="0.01" max="3" step="0.01" value="' + eg.r + '" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Vel sens <span data-eg-disp="velSens">' + eg.velSens.toFixed(2) + '</span></label>' +
      '<input type="range" data-eg="velSens" min="0" max="1" step="0.01" value="' + eg.velSens + '" />' +
      '</div>' +
      '</div>' +
      '<div class="dx-algo-hint" data-algo-hint>Algo 1 · Level 0–99 · EG por OP</div>'
    );
  }

  _bindControls() {
    const algoSel = this.el.querySelector('[data-param="algorithm"]');
    algoSel.value = String(this.params.algorithm);
    algoSel.addEventListener('change', (e) => {
      this.params.algorithm = parseInt(e.target.value, 10);
      if (this.params.autoPreset) this._applyPreset(this.params.algorithm);
      this._applyAlgorithm();
      this._updateAlgoHint();
      this._syncOpUI();
    });

    const autoCb = this.el.querySelector('[data-param="autoPreset"]');
    if (autoCb) {
      autoCb.addEventListener('change', (e) => {
        this.params.autoPreset = !!e.target.checked;
      });
    }
    this.el.querySelector('[data-action="load-preset"]')?.addEventListener('click', () => {
      this._applyPreset(this.params.algorithm);
      this._applyAlgorithm();
      this._syncOpUI();
      this._loadEgUI();
    });

    this.el.querySelectorAll('select[data-wave]').forEach((sel) => {
      const i = parseInt(sel.dataset.wave, 10);
      sel.addEventListener('change', (e) => {
        this.params.waves[i] = e.target.value;
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
          else disp.textContent = val.toFixed(2);
        }
        if (param === 'feedback') this._updateFeedback();
        else this.applyParams();
      });
    });

    this.el.querySelectorAll('input[data-ratio]').forEach((input) => {
      const i = parseInt(input.dataset.ratio, 10);
      input.addEventListener('input', (e) => {
        this.params.ratios[i] = parseFloat(e.target.value);
        const d = this.el.querySelector('[data-disp-ratio="' + i + '"]');
        if (d) d.textContent = this.params.ratios[i].toFixed(2);
        this.applyParams();
      });
    });

    this.el.querySelectorAll('input[data-level]').forEach((input) => {
      const i = parseInt(input.dataset.level, 10);
      input.addEventListener('input', (e) => {
        this.params.levels[i] = parseInt(e.target.value, 10);
        const d = this.el.querySelector('[data-disp-level="' + i + '"]');
        if (d) d.textContent = String(this.params.levels[i]);
        this.applyParams();
      });
    });

    this.el.querySelectorAll('[data-edit-op]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.params.editOp = parseInt(btn.dataset.editOp, 10);
        this.el.querySelectorAll('[data-edit-op]').forEach((b) => {
          b.classList.toggle('active', parseInt(b.dataset.editOp, 10) === this.params.editOp);
        });
        this._loadEgUI();
      });
    });

    this.el.querySelectorAll('input[data-eg]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const key = input.dataset.eg;
        const op = this.params.editOp;
        this.params.eg[op][key] = parseFloat(e.target.value);
        const d = this.el.querySelector('[data-eg-disp="' + key + '"]');
        if (d) d.textContent = this.params.eg[op][key].toFixed(2);
      });
    });

    this._updateAlgoHint();
  }

  _loadEgUI() {
    const eg = this.params.eg[this.params.editOp];
    if (!eg || !this.el) return;
    ['a', 'd', 's', 'r', 'velSens'].forEach((key) => {
      const input = this.el.querySelector('input[data-eg="' + key + '"]');
      if (input) input.value = eg[key];
      const d = this.el.querySelector('[data-eg-disp="' + key + '"]');
      if (d) d.textContent = Number(eg[key]).toFixed(2);
    });
  }

  _applyPreset(algoId) {
    const p = presetForAlgorithm(algoId || this.params.algorithm);
    this.params.ratios = p.ratios.slice();
    this.params.levels = p.levels.slice();
    this.params.feedback = p.feedback;
    this.params.eg = p.eg.map((e) => ({ ...e }));
  }

  _syncOpUI() {
    if (!this.el) return;
    for (let i = 0; i < 6; i++) {
      const r = this.el.querySelector('input[data-ratio="' + i + '"]');
      const l = this.el.querySelector('input[data-level="' + i + '"]');
      const w = this.el.querySelector('select[data-wave="' + i + '"]');
      const dr = this.el.querySelector('[data-disp-ratio="' + i + '"]');
      const dl = this.el.querySelector('[data-disp-level="' + i + '"]');
      if (r) r.value = this.params.ratios[i];
      if (l) l.value = this.params.levels[i];
      if (w) w.value = this.params.waves[i] || 'sine';
      if (dr) dr.textContent = Number(this.params.ratios[i]).toFixed(2);
      if (dl) dl.textContent = String(this.params.levels[i]);
    }
    const fb = this.el.querySelector('[data-param="feedback"]');
    const fbd = this.el.querySelector('[data-display="feedback"]');
    if (fb) fb.value = this.params.feedback;
    if (fbd) fbd.textContent = Number(this.params.feedback).toFixed(2);
  }

  _updateAlgoHighlight() {
    const hl = this.el && this.el.querySelector('[data-algo-hl]');
    if (!hl) return;
    const box = ALGO_HIGHLIGHT[this.params.algorithm] || ALGO_HIGHLIGHT[1];
    hl.style.left = box.x + '%';
    hl.style.top = box.y + '%';
    hl.style.width = box.w + '%';
    hl.style.height = box.h + '%';
  }

  _updateAlgoHint() {
    const algo = ALGORITHMS[this.params.algorithm - 1];
    const el = this.el && this.el.querySelector('[data-algo-hint]');
    if (el && algo) {
      const cars = algo.carriers.map((c) => 'OP' + (c + 1)).join('+');
      el.textContent = 'Algo ' + algo.id + ' · carriers ' + cars + ' · FB OP' + (algo.fb + 1);
    }
    this._updateAlgoHighlight();
    this._renderAlgoDiagram(algo);
  }

  /**
   * Dibuja el grafo del algoritmo estilo DX7 (ops 1–6).
   * Carriers abajo, moduladores encima según aristas.
   */
  _renderAlgoDiagram(algo) {
    const host = this.el && this.el.querySelector('[data-algo-visual]');
    if (!host || !algo) return;

    // profundidad: carriers = 0; quien modula a X = depth(X)+1
    const depth = new Array(6).fill(0);
    const carSet = new Set(algo.carriers);
    // construir mapa hijos (modulado por)
    const modsOf = Array.from({ length: 6 }, () => []);
    algo.edges.forEach(([m, c]) => { modsOf[c].push(m); });

    function compute(i, seen) {
      if (carSet.has(i) && !modsOf[i].length) return 0;
      if (seen.has(i)) return depth[i] || 0;
      seen.add(i);
      let d = carSet.has(i) ? 0 : 0;
      // depth = 1 + max depth of targets this modulates? better: distance from carrier
      return d;
    }

    // BFS from carriers upward via reverse edges
    const parents = Array.from({ length: 6 }, () => []); // who modulates me
    algo.edges.forEach(([m, c]) => parents[c].push(m));
    const q = [...algo.carriers];
    const seen = new Set(q);
    depth.fill(-1);
    algo.carriers.forEach((c) => { depth[c] = 0; });
    while (q.length) {
      const c = q.shift();
      parents[c].forEach((m) => {
        const nd = depth[c] + 1;
        if (nd > depth[m]) depth[m] = nd;
        if (!seen.has(m)) {
          seen.add(m);
          q.push(m);
        }
      });
    }
    for (let i = 0; i < 6; i++) if (depth[i] < 0) depth[i] = 0;

    const maxD = Math.max(0, ...depth);
    // columnas: agrupar por profundidad y ordenar por índice
    const cols = Array.from({ length: maxD + 1 }, () => []);
    for (let i = 0; i < 6; i++) cols[depth[i]].push(i);

    const boxW = 28;
    const boxH = 22;
    const gapX = 12;
    const gapY = 28;
    const pad = 10;

    // posiciones: depth row from bottom (carriers at bottom)
    const pos = {};
    let maxX = 0;
    for (let d = 0; d <= maxD; d++) {
      const row = cols[d];
      const rowY = pad + (maxD - d) * (boxH + gapY);
      const totalW = row.length * boxW + Math.max(0, row.length - 1) * gapX;
      let x0 = pad;
      // center each row
      const approxW = 6 * boxW + 5 * gapX;
      x0 = pad + Math.max(0, (approxW - totalW) / 2);
      row.forEach((op, idx) => {
        const x = x0 + idx * (boxW + gapX);
        pos[op] = { x, y: rowY };
        maxX = Math.max(maxX, x + boxW);
      });
    }
    const maxY = pad + (maxD + 1) * boxH + maxD * gapY + pad;

    let svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      (maxX + pad) +
      '" height="' +
      maxY +
      '" viewBox="0 0 ' +
      (maxX + pad) +
      ' ' +
      maxY +
      '">';

    // edges
    algo.edges.forEach(([m, c]) => {
      const a = pos[m];
      const b = pos[c];
      if (!a || !b) return;
      const x1 = a.x + boxW / 2;
      const y1 = a.y + boxH;
      const x2 = b.x + boxW / 2;
      const y2 = b.y;
      svg +=
        '<path d="M' +
        x1 +
        ' ' +
        y1 +
        ' C' +
        x1 +
        ' ' +
        (y1 + 12) +
        ',' +
        x2 +
        ' ' +
        (y2 - 12) +
        ',' +
        x2 +
        ' ' +
        y2 +
        '" fill="none" stroke="#4fc3f7" stroke-width="1.5"/>';
    });

    // feedback loop on fb op
    const fb = pos[algo.fb];
    if (fb) {
      const fx = fb.x + boxW;
      const fy = fb.y + boxH / 2;
      svg +=
        '<path d="M' +
        fx +
        ' ' +
        fy +
        ' c8,-10 8,10 0,0" fill="none" stroke="#ffb74d" stroke-width="1.5"/>';
      svg +=
        '<text x="' +
        (fx + 10) +
        '" y="' +
        (fy + 3) +
        '" fill="#ffb74d" font-size="8">FB</text>';
    }

    // boxes
    for (let i = 0; i < 6; i++) {
      const p = pos[i];
      if (!p) continue;
      const isCar = carSet.has(i);
      const fill = isCar ? '#1565c0' : '#2a3140';
      const stroke = isCar ? '#4fc3f7' : '#5a6578';
      svg +=
        '<rect x="' +
        p.x +
        '" y="' +
        p.y +
        '" width="' +
        boxW +
        '" height="' +
        boxH +
        '" rx="4" fill="' +
        fill +
        '" stroke="' +
        stroke +
        '" stroke-width="1.2"/>';
      svg +=
        '<text x="' +
        (p.x + boxW / 2) +
        '" y="' +
        (p.y + boxH / 2 + 4) +
        '" text-anchor="middle" fill="#e0e6f0" font-size="11" font-family="system-ui,sans-serif" font-weight="600">' +
        (i + 1) +
        '</text>';
    }

    svg += '</svg>';
    host.innerHTML = svg;
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.mix = ctx.createGain();
    this.mix.gain.value = 1;
    this.outGain = ctx.createGain();
    this.outGain.gain.value = 0.4;
    this.mix.connect(this.outGain);

    this.ops = [];
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = this.params.waves[i] || 'sine';
      osc.frequency.value = this.params.frequency * this.params.ratios[i];

      // EG por operador
      const envGain = ctx.createGain();
      envGain.gain.value = 0;

      // Nivel escalado (0–99 → curva DX) — se aplica encima del EG
      const levelGain = ctx.createGain();
      levelGain.gain.value = dxLevelScale(this.params.levels[i]);

      // Rutas carrier / modulator
      const outLevel = ctx.createGain();
      outLevel.gain.value = 0;
      const modDepth = ctx.createGain();
      modDepth.gain.value = 0;

      osc.connect(envGain);
      envGain.connect(levelGain);
      levelGain.connect(outLevel);
      levelGain.connect(modDepth);
      osc.start();

      this.ops.push({ osc, envGain, levelGain, outLevel, modDepth });
    }

    this.fbGain = ctx.createGain();
    this.fbGain.gain.value = 0;

    this.freqBus = this.audioEngine.context.createGain();
    this.freqBus.gain.value = 1;
    this.gateNode = ctx.createGain();
    this.gateNode.gain.value = 0;

    this.getPort('out').node = this.outGain;
    this.getPort('freq').node = this.freqBus;
    this.getPort('gate').node = this.gateNode;

    this.voiceEngines = [{ ops: this.ops, note: null, order: 0 }];
    // 3 voces extra (total 4) — algoritmo simplificado por voz
    for (let v = 0; v < 3; v++) {
      const ops = [];
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        osc.type = this.params.waves[i] || 'sine';
        osc.frequency.value = this.params.frequency * (this.params.ratios[i] || 1);
        const envGain = ctx.createGain();
        envGain.gain.value = 0;
        const levelGain = ctx.createGain();
        levelGain.gain.value = dxLevelScale(this.params.levels[i]);
        const outLevel = ctx.createGain();
        outLevel.gain.value = 0;
        const modDepth = ctx.createGain();
        modDepth.gain.value = 0;
        osc.connect(envGain);
        envGain.connect(levelGain);
        levelGain.connect(outLevel);
        levelGain.connect(modDepth);
        osc.start();
        ops.push({ osc, envGain, levelGain, outLevel, modDepth });
      }
      const algo = ALGORITHMS[Math.max(0, Math.min(31, (this.params.algorithm || 1) - 1))];
      algo.carriers.forEach((ci) => {
        try {
          ops[ci].outLevel.connect(this.mix);
          ops[ci].outLevel.gain.value = 0.45;
        } catch (e) {}
      });
      (algo.edges || []).forEach(([from, to]) => {
        try { ops[from].modDepth.connect(ops[to].osc.frequency); } catch (e) {}
      });
      this.voiceEngines.push({ ops, note: null, order: 0 });
    }

    this._applyAlgorithm();
    this._timer = setInterval(() => this._syncFreq(), 25);
    this.applyParams();
    this._bindPolyNotes();
    setTimeout(() => this._bindPolyNotes(), 500);
  }

  _clearAlgoConnections() {
    this._algoConns.forEach((fn) => {
      try { fn(); } catch (e) {}
    });
    this._algoConns = [];
  }

  _applyAlgorithm() {
    if (!this.ops.length || !this.audioEngine.context) return;
    this._clearAlgoConnections();

    const algo = ALGORITHMS[Math.max(0, Math.min(31, (this.params.algorithm || 1) - 1))];
    const carrierSet = new Set(algo.carriers);

    this.ops.forEach((op, i) => {
      try { op.outLevel.disconnect(); } catch (e) {}
      if (carrierSet.has(i)) {
        op.outLevel.connect(this.mix);
      }
    });

    algo.edges.forEach(([modIdx, carIdx]) => {
      const mod = this.ops[modIdx];
      const car = this.ops[carIdx];
      try {
        mod.modDepth.connect(car.osc.frequency);
        this._algoConns.push(() => {
          try { mod.modDepth.disconnect(car.osc.frequency); } catch (e) {}
        });
      } catch (e) {}
    });

    this._fbOp = algo.fb;
    const fbOp = this.ops[this._fbOp];
    if (fbOp) {
      try {
        // Feedback desde señal ya escalada por EG+level
        fbOp.levelGain.connect(this.fbGain);
        this.fbGain.connect(fbOp.osc.frequency);
        this._algoConns.push(() => {
          try {
            fbOp.levelGain.disconnect(this.fbGain);
            this.fbGain.disconnect(fbOp.osc.frequency);
          } catch (e) {}
        });
      } catch (e) {}
    }

    this._updateFeedback();
    this.applyParams();
  }

  _updateFeedback() {
    if (!this.fbGain || !this.audioEngine.context) return;
    const amt = (this.params.feedback || 0) * 600;
    this.fbGain.gain.setValueAtTime(amt, this.audioEngine.context.currentTime);
  }

  _baseFreq() {
    return this.params.frequency;
  }

  _hasFreqCv() {
    const p = this.getPort('freq');
    return !!(p && p.connections && p.connections.length);
  }

  _syncFreq() {
    if (!this.ops.length || !this.audioEngine.context) return;
    const f = this._baseFreq();
    const hasCv = this._hasFreqCv();
    const t = this.audioEngine.context.currentTime;
    for (let i = 0; i < 6; i++) {
      const freq = Math.min(20000, f * (this.params.ratios[i] || 1));
      try {
        this.ops[i].osc.frequency.setValueAtTime(hasCv ? 0 : freq, t);
        if (hasCv && this.freqBus && this.ops[i] && !this.ops[i]._cvLinked) {
          const rg = this.audioEngine.context.createGain();
          rg.gain.value = this.params.ratios[i] || 1;
          this.freqBus.connect(rg);
          rg.connect(this.ops[i].osc.frequency);
          this.ops[i]._cvLinked = true;
          this.ops[i]._ratioGain = rg;
        } else if (this.ops[i] && this.ops[i]._ratioGain) {
          this.ops[i]._ratioGain.gain.setValueAtTime(this.params.ratios[i] || 1, t);
        }
      } catch (e) {}
    }
  }

  applyParams() {
    if (!this.ops.length || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    const f = this._baseFreq();
    const hasCv = this._hasFreqCv();
    const algo = ALGORITHMS[Math.max(0, Math.min(31, (this.params.algorithm || 1) - 1))];
    const carrierSet = new Set(algo.carriers);

    for (let i = 0; i < 6; i++) {
      const level99 = this.params.levels[i] || 0;
      const scaled = dxLevelScale(level99);
      const ratio = this.params.ratios[i] || 1;
      const freq = Math.min(20000, f * ratio);

      try {
        this.ops[i].osc.type = this.params.waves[i] || 'sine';
        this.ops[i].osc.frequency.setValueAtTime(hasCv ? 0 : freq, t);
        if (hasCv && this.freqBus && this.ops[i] && !this.ops[i]._cvLinked) {
          const rg = this.audioEngine.context.createGain();
          rg.gain.value = this.params.ratios[i] || 1;
          this.freqBus.connect(rg);
          rg.connect(this.ops[i].osc.frequency);
          this.ops[i]._cvLinked = true;
          this.ops[i]._ratioGain = rg;
        } else if (this.ops[i] && this.ops[i]._ratioGain) {
          this.ops[i]._ratioGain.gain.setValueAtTime(this.params.ratios[i] || 1, t);
        }
        this.ops[i].levelGain.gain.setValueAtTime(scaled, t);
      } catch (e) {}

      // Carrier: amplitud fija post-EG (el EG ya modela la dinámica)
      if (carrierSet.has(i)) {
        this.ops[i].outLevel.gain.setValueAtTime(0.45, t);
      } else {
        this.ops[i].outLevel.gain.setValueAtTime(0, t);
      }

      // Profundidad FM: escalada por nivel DX × frecuencia del modulador
      const isMod = algo.edges.some((e) => e[0] === i);
      if (isMod || i === algo.fb) {
        const depth = scaled * freq * 3;
        this.ops[i].modDepth.gain.setValueAtTime(depth, t);
      } else {
        this.ops[i].modDepth.gain.setValueAtTime(0, t);
      }
    }

    this._updateFeedback();
  }

  _triggerVoiceOps(ops, on, velocity) {
    if (!ops || !ops.length || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    for (let i = 0; i < 6; i++) {
      const eg = this.params.eg[i] || defaultEG();
      const g = ops[i].envGain.gain;
      const peak = (1 - eg.velSens) + eg.velSens * Math.max(0.05, Math.min(1, velocity));
      g.cancelScheduledValues(t);
      if (on) {
        g.setValueAtTime(Math.max(0, g.value), t);
        g.linearRampToValueAtTime(peak, t + eg.a);
        g.linearRampToValueAtTime(peak * eg.s, t + eg.a + eg.d);
      } else {
        g.setValueAtTime(Math.max(0, g.value), t);
        g.linearRampToValueAtTime(0, t + (on ? eg.r : Math.min(eg.r, 0.5)));
      }
    }
  }

  /**
   * Gate mono (compatibilidad).
   */
  trigger(on, velocity) {
    if (velocity == null) velocity = 1;
    if (on) {
      let f = this.params.frequency;
      if (this.getPort('freq').connections.length) {
        // CV Hz
        f = f;
      }
      const midi = Math.round(69 + 12 * Math.log2(Math.max(20, f) / 440));
      this.noteOn(midi, velocity);
    } else {
      (this.voiceEngines || []).forEach((ve) => {
        if (ve.note != null) {
          this._triggerVoiceOps(ve.ops, false, 0);
          ve.note = null;
        }
      });
      this._renderPolyLeds();
    }
  }

  noteOn(midi, velocity) {
    if (velocity == null) velocity = 1;
    if (!this.voiceEngines || !this.voiceEngines.length) {
      // fallback mono
      if (this.ops.length) {
        const freq = AudioEngine.midiToFreq(midi);
        this.params.frequency = freq;
        this.applyParams();
        this._triggerVoiceOps(this.ops, true, velocity);
      }
      return;
    }
    const n = Math.min(4, this.params.numVoices || 4);
    const idx = allocateVoice(this.voiceEngines, n, midi, this.params.steal || 'oldest');
    const ve = this.voiceEngines[idx];
    if (ve.note != null && ve.note !== midi) {
      this._triggerVoiceOps(ve.ops, false, 0);
    }
    ve.note = midi;
    ve.order = ++this._noteOrder;
    const freq = AudioEngine.midiToFreq(midi);
    const t = this.audioEngine.context.currentTime;
    for (let i = 0; i < 6; i++) {
      try {
        ve.ops[i].osc.frequency.setValueAtTime(
          Math.min(20000, freq * (this.params.ratios[i] || 1)),
          t
        );
      } catch (e) {}
    }
    this._triggerVoiceOps(ve.ops, true, velocity);
    this._renderPolyLeds();
  }

  noteOff(midi) {
    if (!this.voiceEngines) return;
    const n = Math.min(4, this.params.numVoices || 4);
    const idx = findVoiceByNote(this.voiceEngines, n, midi);
    if (idx < 0) return;
    this._triggerVoiceOps(this.voiceEngines[idx].ops, false, 0);
    this.voiceEngines[idx].note = null;
    this._renderPolyLeds();
  }

  _renderPolyLeds() {
    const host = this.el && this.el.querySelector('[data-poly-leds]');
    if (!host || !this.voiceEngines) return;
    const n = Math.min(4, this.params.numVoices || 4);
    let html = '';
    for (let i = 0; i < n; i++) {
      const on = this.voiceEngines[i] && this.voiceEngines[i].note != null;
      html += '<span class="ps-led' + (on ? ' on' : '') + '">' + (i + 1) + '</span>';
    }
    host.innerHTML = html;
  }

  _bindPolyNotes() {
    if (this._polyBound) return;
    this._polyBound = true;
    this._noteOrder = 0;
    this._onNote = (ev) => {
      const d = ev.detail || {};
      if (d.note == null) return;
      if (d.on) this.noteOn(d.note, d.velocity != null ? d.velocity : 1);
      else this.noteOff(d.note);
    };
    window.addEventListener('modsynth-note', this._onNote);
    try {
      const midi = window.modularSynth && window.modularSynth.midi;
      if (midi && typeof midi.on === 'function') {
        this._unsubMidi = midi.on((type, data) => {
          if (type === 'noteon') this.noteOn(data.note, data.velocity != null ? data.velocity : 1);
          else if (type === 'noteoff') this.noteOff(data.note);
        });
      }
    } catch (e) {}
  }

  destroy() {
    if (this._onNote) window.removeEventListener('modsynth-note', this._onNote);
    if (typeof this._unsubMidi === 'function') try { this._unsubMidi(); } catch (e) {}
    if (this._timer) clearInterval(this._timer);
    this._clearAlgoConnections();
    (this.voiceEngines || [{ ops: this.ops }]).forEach((ve) => {
      (ve.ops || []).forEach((op) => {
        try { op.osc.stop(); op.osc.disconnect(); } catch (e) {}
        try {
          op.envGain.disconnect();
          op.levelGain.disconnect();
          op.outLevel.disconnect();
          op.modDepth.disconnect();
        } catch (e) {}
      });
    });
    this.ops.forEach((op) => {
      try { op.osc.stop(); op.osc.disconnect(); } catch (e) {}
      try {
        op.envGain.disconnect();
        op.levelGain.disconnect();
        op.outLevel.disconnect();
        op.modDepth.disconnect();
      } catch (e) {}
    });
    [this.fbGain, this.mix, this.outGain, this.freqBus, this.gateNode].forEach((n) => {
      if (n) try { n.disconnect(); } catch (e) {}
    });
    super.destroy();
  }
}
