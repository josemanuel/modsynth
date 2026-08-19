import { Module } from '../core/Module.js';

/**
 * VCA con CV de amplitud correcto.
 * Cadena: in → modGain (0..1 vía CV/env) → levelGain (knob) → out
 *
 * En Web Audio, conectar una señal a un AudioParam SUMA al valor del parámetro.
 * Por eso, con CV conectado, modGain.gain debe ser 0 (solo habla la envolvente).
 * Sin CV, modGain.gain = 1 y el knob level controla el volumen.
 */
export class VCA extends Module {
  constructor(audioEngine, x, y) {
    super('vca', audioEngine, x, y);
    this.title = 'VCA';
    this.params = { gain: 0.8 };

    this.addPort('in', 'In', 'audio', 'in');
    this.addPort('cv', 'CV', 'cv', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input">
            <div class="port-socket audio" data-port="in"></div>
            <span>In</span>
          </div>
          <div class="port input">
            <div class="port-socket cv" data-port="cv"></div>
            <span>CV</span>
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
        <label>Level <span class="value-display" data-display="gain">0.80</span></label>
        <input type="range" data-param="gain" min="0" max="1" step="0.01" value="0.8" />
      </div>
      <div class="vca-hint" data-vca-hint></div>
    `;
  }

  _bindControls() {
    const input = this.el.querySelector('[data-param="gain"]');
    input.value = this.params.gain;
    input.addEventListener('input', (e) => {
      this.params.gain = parseFloat(e.target.value);
      this.el.querySelector('[data-display="gain"]').textContent = this.params.gain.toFixed(2);
      this.applyParams();
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    // modGain: cerrado (0) si hay CV; abierto (1) si no hay CV
    this.modGain = ctx.createGain();
    this.modGain.gain.value = 1;

    // levelGain: volumen del panel
    this.levelGain = ctx.createGain();
    this.levelGain.gain.value = this.params.gain;

    this.modGain.connect(this.levelGain);

    this.getPort('in').node = this.modGain;
    this.getPort('out').node = this.levelGain;
    // CV suma sobre modGain.gain → base 0 cuando hay cable
    this.getPort('cv').node = this.modGain.gain;

    this.applyParams();
  }

  /** Llamar tras conectar/desconectar CV */
  applyParams() {
    if (!this.modGain || !this.levelGain || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    const hasCV = this.getPort('cv').connections.length > 0;

    // Con CV: base 0 (solo envolvente). Sin CV: pasa señal completa al level.
    this.modGain.gain.setValueAtTime(hasCV ? 0 : 1, t);
    this.levelGain.gain.setValueAtTime(this.params.gain, t);

    const hint = this.el && this.el.querySelector('[data-vca-hint]');
    if (hint) {
      hint.textContent = hasCV
        ? 'CV activo: el Level es el tope; el Gate/ADSR abre el VCA'
        : 'Sin CV: siempre abierto (Level = volumen)';
    }
  }

  destroy() {
    if (this.modGain) this.modGain.disconnect();
    if (this.levelGain) this.levelGain.disconnect();
    super.destroy();
  }
}
