import { Module } from '../core/Module.js';

export class Output extends Module {
  constructor(audioEngine, x, y) {
    super('output', audioEngine, x, y);
    this.title = 'Output';
    this.width = 200;
    this.params = { volume: 0.7, engine: 'webaudio' };

    this.addPort('in', 'In', 'audio', 'in');
  }

  renderBody() {
    const engines = [
      { id: 'webaudio', label: 'Web Audio API', ok: true },
      { id: 'asio', label: 'ASIO (escritorio)', ok: false },
      { id: 'wasapi', label: 'WASAPI', ok: false },
      { id: 'coreaudio', label: 'Core Audio', ok: false },
      { id: 'jack', label: 'JACK', ok: false }
    ];
    let opts = engines
      .map(
        (e) =>
          '<option value="' +
          e.id +
          '"' +
          (e.id === this.params.engine ? ' selected' : '') +
          (e.ok ? '' : ' disabled') +
          '>' +
          e.label +
          (e.ok ? '' : ' — n/d') +
          '</option>'
      )
      .join('');

    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input">
            <div class="port-socket audio" data-port="in"></div>
            <span>In</span>
          </div>
        </div>
        <div class="ports-col"></div>
      </div>
      <div class="control">
        <label>Audio engine</label>
        <select data-param="engine">${opts}</select>
      </div>
      <div class="out-engine-hint" data-engine-hint>Activo: Web Audio API (navegador)</div>
      <div class="control">
        <label>Volume <span class="value-display" data-display="volume">0.70</span></label>
        <input type="range" data-param="volume" min="0" max="1" step="0.01" value="0.7" />
      </div>
      <div class="level-meter"><div class="fill" data-meter></div></div>
    `;
  }

  _bindControls() {
    const input = this.el.querySelector('[data-param="volume"]');
    input.addEventListener('input', (e) => {
      this.params.volume = parseFloat(e.target.value);
      this.el.querySelector('[data-display="volume"]').textContent =
        this.params.volume.toFixed(2);
      if (this.gain) this.gain.gain.value = this.params.volume;
    });
    const eng = this.el.querySelector('[data-param="engine"]');
    eng.addEventListener('change', (e) => {
      this.params.engine = e.target.value;
      const hint = this.el.querySelector('[data-engine-hint]');
      if (this.params.engine === 'webaudio') {
        hint.textContent = 'Activo: Web Audio API (navegador)';
      } else {
        hint.textContent =
          'ASIO/WASAPI/Core/JACK requieren app nativa (p. ej. JUCE). En el navegador solo Web Audio.';
        // revert visual selection
        eng.value = 'webaudio';
        this.params.engine = 'webaudio';
      }
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.gain = ctx.createGain();
    this.gain.gain.value = this.params.volume;
    this.gain.connect(this.audioEngine.destination);

    this.getPort('in').node = this.gain;

    this._meterInterval = setInterval(() => this._updateMeter(), 50);
  }

  _updateMeter() {
    if (!this.audioEngine.analyser) return;
    const data = new Uint8Array(this.audioEngine.analyser.frequencyBinCount);
    this.audioEngine.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length / 255;
    const meter = this.el.querySelector('[data-meter]');
    if (meter) meter.style.width = Math.min(100, avg * 300) + '%';
  }

  destroy() {
    clearInterval(this._meterInterval);
    if (this.gain) this.gain.disconnect();
    super.destroy();
  }
}
