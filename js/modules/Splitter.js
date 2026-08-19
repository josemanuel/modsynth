import { Module } from '../core/Module.js';

/**
 * Splitter – 1 entrada audio → 4 salidas (misma señal).
 */
export class Splitter extends Module {
  constructor(audioEngine, x, y) {
    super('splitter', audioEngine, x, y);
    this.title = 'Splitter';
    this.width = 140;
    this.params = { gain: 1 };
    this.addPort('in', 'In', 'audio', 'in');
    for (let i = 1; i <= 4; i++) {
      this.addPort('out' + i, 'Out ' + i, 'audio', 'out');
    }
  }

  renderBody() {
    let outs = '';
    for (let i = 1; i <= 4; i++) {
      outs +=
        '<div class="port output"><div class="port-socket audio" data-port="out' +
        i +
        '"></div><span>Out' +
        i +
        '</span></div>';
    }
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket audio" data-port="in"></div><span>In</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      outs +
      '</div></div>' +
      '<div class="control">' +
      '<label>Gain <span class="value-display" data-display="gain">1.00</span></label>' +
      '<input type="range" data-param="gain" min="0" max="2" step="0.01" value="1" />' +
      '</div>'
    );
  }

  _bindControls() {
    const input = this.el.querySelector('[data-param="gain"]');
    input.addEventListener('input', (e) => {
      this.params.gain = parseFloat(e.target.value);
      this.el.querySelector('[data-display="gain"]').textContent = this.params.gain.toFixed(2);
      this.applyParams();
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = this.params.gain;
    this.getPort('in').node = this.inputGain;
    for (let i = 1; i <= 4; i++) {
      // same node can fan-out via multiple Wire connections from one port
      this.getPort('out' + i).node = this.inputGain;
    }
  }

  applyParams() {
    if (this.inputGain && this.audioEngine.context) {
      this.inputGain.gain.setValueAtTime(
        this.params.gain,
        this.audioEngine.context.currentTime
      );
    }
  }

  destroy() {
    if (this.inputGain) try { this.inputGain.disconnect(); } catch (e) {}
    super.destroy();
  }
}
