import { Module } from '../core/Module.js';

const CHANNELS = 4;
const BUF = 2048;

/**
 * Scope – osciloscopio multi-canal (hasta 4 entradas).
 */
export class Scope extends Module {
  constructor(audioEngine, x, y) {
    super('scope', audioEngine, x, y);
    this.title = 'Scope';
    this.width = 280;
    this.params = {
      time: 0.02, // segundos de ventana aproximada
      gain: 1,
      freeze: false
    };
    this.analysers = [];
    this._raf = null;

    for (let i = 0; i < CHANNELS; i++) {
      this.addPort('in' + (i + 1), 'In ' + (i + 1), 'audio', 'in');
    }
  }

  renderBody() {
    let ports = '';
    for (let i = 1; i <= CHANNELS; i++) {
      ports +=
        '<div class="port input"><div class="port-socket audio" data-port="in' +
        i +
        '"></div><span>Ch' +
        i +
        '</span></div>';
    }
    return (
      '<div class="ports-row"><div class="ports-col">' +
      ports +
      '</div></div>' +
      '<canvas class="scope-canvas" data-scope width="260" height="120"></canvas>' +
      '<div class="scope-legend">' +
      '<span class="sc-ch c0">Ch1</span><span class="sc-ch c1">Ch2</span>' +
      '<span class="sc-ch c2">Ch3</span><span class="sc-ch c3">Ch4</span></div>' +
      '<div class="control">' +
      '<label>Time <span class="value-display" data-display="time">0.02</span></label>' +
      '<input type="range" data-param="time" min="0.005" max="0.1" step="0.001" value="0.02" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Gain <span class="value-display" data-display="gain">1.00</span></label>' +
      '<input type="range" data-param="gain" min="0.1" max="5" step="0.05" value="1" />' +
      '</div>' +
      '<div class="control">' +
      '<label><input type="checkbox" data-param="freeze" /> Freeze</label>' +
      '</div>'
    );
  }

  _bindControls() {
    this.canvas = this.el.querySelector('[data-scope]');
    this.ctx2d = this.canvas.getContext('2d');

    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const p = input.dataset.param;
      input.value = this.params[p];
      input.addEventListener('input', (e) => {
        this.params[p] = parseFloat(e.target.value);
        const d = this.el.querySelector('[data-display="' + p + '"]');
        if (d) d.textContent = this.params[p].toFixed(p === 'gain' ? 2 : 3);
      });
    });
    const fr = this.el.querySelector('[data-param="freeze"]');
    if (fr) {
      fr.checked = this.params.freeze;
      fr.addEventListener('change', (e) => {
        this.params.freeze = e.target.checked;
      });
    }
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.analysers = [];
    for (let i = 0; i < CHANNELS; i++) {
      const a = ctx.createAnalyser();
      a.fftSize = BUF;
      a.smoothingTimeConstant = 0;
      // passthrough gain so signal continues if needed (tap)
      const g = ctx.createGain();
      g.gain.value = 1;
      g.connect(a);
      this.getPort('in' + (i + 1)).node = g;
      this.analysers.push({ analyser: a, input: g, data: new Float32Array(a.fftSize) });
    }
    this._startDraw();
  }

  _startDraw() {
    if (this._raf) cancelAnimationFrame(this._raf);
    const colors = ['#4fc3f7', '#81c784', '#ffb74d', '#ef5350'];
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      if (!this.ctx2d || !this.canvas) return;
      if (this.params.freeze) return;

      const w = this.canvas.width;
      const h = this.canvas.height;
      const g = this.params.gain || 1;
      this.ctx2d.fillStyle = '#0a0c10';
      this.ctx2d.fillRect(0, 0, w, h);
      this.ctx2d.strokeStyle = '#1a2230';
      this.ctx2d.beginPath();
      this.ctx2d.moveTo(0, h / 2);
      this.ctx2d.lineTo(w, h / 2);
      this.ctx2d.stroke();

      this.analysers.forEach((ch, idx) => {
        if (!ch.analyser) return;
        ch.analyser.getFloatTimeDomainData(ch.data);
        // sample window
        const n = ch.data.length;
        this.ctx2d.strokeStyle = colors[idx];
        this.ctx2d.lineWidth = 1.2;
        this.ctx2d.beginPath();
        for (let i = 0; i < w; i++) {
          const si = Math.floor((i / w) * n);
          const v = ch.data[si] * g;
          const y = h / 2 - v * (h / 2) * 0.9;
          if (i === 0) this.ctx2d.moveTo(i, y);
          else this.ctx2d.lineTo(i, y);
        }
        this.ctx2d.stroke();
      });
    };
    loop();
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this.analysers.forEach((ch) => {
      try {
        ch.input.disconnect();
        ch.analyser.disconnect();
      } catch (e) {}
    });
    super.destroy();
  }
}
