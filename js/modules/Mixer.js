import { Module } from '../core/Module.js';

const CH = 6;

/**
 * Mixer – mezclador multi-canal (6 entradas + master).
 */
export class Mixer extends Module {
  constructor(audioEngine, x, y) {
    super('mixer', audioEngine, x, y);
    this.title = 'Mixer';
    this.width = 170;
    this.params = { master: 0.8 };
    for (let i = 1; i <= CH; i++) {
      this.params['level' + i] = 0.7;
      this.addPort('in' + i, 'In ' + i, 'audio', 'in');
    }
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    let ins = '';
    let levels = '';
    for (let i = 1; i <= CH; i++) {
      ins +=
        '<div class="port input"><div class="port-socket audio" data-port="in' +
        i +
        '"></div><span>In' +
        i +
        '</span></div>';
      levels +=
        '<div class="control">' +
        '<label>Ch' +
        i +
        ' <span class="value-display" data-display="level' +
        i +
        '">' +
        Number(this.params['level' + i]).toFixed(2) +
        '</span></label>' +
        '<input type="range" data-param="level' +
        i +
        '" min="0" max="1" step="0.01" value="' +
        this.params['level' + i] +
        '" />' +
        '</div>';
    }
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      ins +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      levels +
      '<div class="control">' +
      '<label>Master <span class="value-display" data-display="master">0.80</span></label>' +
      '<input type="range" data-param="master" min="0" max="1" step="0.01" value="0.8" />' +
      '</div>'
    );
  }

  _bindControls() {
    this.el.querySelectorAll('input[type="range"]').forEach((input) => {
      const param = input.dataset.param;
      input.addEventListener('input', (e) => {
        this.params[param] = parseFloat(e.target.value);
        const d = this.el.querySelector('[data-display="' + param + '"]');
        if (d) d.textContent = this.params[param].toFixed(2);
        this.applyParams();
      });
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;
    this.chans = [];
    this.master = ctx.createGain();
    this.master.gain.value = this.params.master;
    for (let i = 1; i <= CH; i++) {
      const g = ctx.createGain();
      g.gain.value = this.params['level' + i];
      g.connect(this.master);
      this.getPort('in' + i).node = g;
      this.chans.push(g);
    }
    this.getPort('out').node = this.master;
  }

  applyParams() {
    if (!this.master || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    this.master.gain.setValueAtTime(this.params.master, t);
    this.chans.forEach((g, i) => {
      g.gain.setValueAtTime(this.params['level' + (i + 1)], t);
    });
  }

  destroy() {
    this.chans && this.chans.forEach((g) => { try { g.disconnect(); } catch (e) {} });
    if (this.master) try { this.master.disconnect(); } catch (e) {}
    super.destroy();
  }
}
