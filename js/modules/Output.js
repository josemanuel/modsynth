import { Module } from '../core/Module.js';

export class Output extends Module {
  constructor(audioEngine, x, y) {
    super('output', audioEngine, x, y);
    this.title = 'Output';
    this.params = { volume: 0.7 };

    this.addPort('in', 'In', 'audio', 'in');
  }

  renderBody() {
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
        <label>Volume <span class="value-display" data-display="volume">0.70</span></label>
        <input type="range" data-param="volume" min="0" max="1" step="0.01" value="0.7" />
      </div>
      <div class="level-meter"><div class="fill" data-meter></div></div>
    `;
  }

  _bindControls() {
    const input = this.el.querySelector('[data-param="volume"]');
    input.addEventListener('input', e => {
      this.params.volume = parseFloat(e.target.value);
      this.el.querySelector('[data-display="volume"]').textContent =
        this.params.volume.toFixed(2);
      if (this.gain) this.gain.gain.value = this.params.volume;
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.gain = ctx.createGain();
    this.gain.gain.value = this.params.volume;
    this.gain.connect(this.audioEngine.destination);

    this.getPort('in').node = this.gain;

    // Simple level meter
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
