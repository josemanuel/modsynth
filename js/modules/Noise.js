import { Module } from '../core/Module.js';

export class Noise extends Module {
  constructor(audioEngine, x, y) {
    super('noise', audioEngine, x, y);
    this.title = 'Noise';
    this.params = { type: 'white', gain: 0.3 };

    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col"></div>
        <div class="ports-col">
          <div class="port output">
            <div class="port-socket audio" data-port="out"></div>
            <span>Out</span>
          </div>
        </div>
      </div>
      <div class="control">
        <label>Type</label>
        <select data-param="type">
          <option value="white">White</option>
          <option value="pink">Pink (approx)</option>
        </select>
      </div>
      <div class="control">
        <label>Level <span class="value-display" data-display="gain">0.30</span></label>
        <input type="range" data-param="gain" min="0" max="1" step="0.01" value="0.3" />
      </div>
    `;
  }

  _bindControls() {
    this.el.querySelector('[data-param="type"]').addEventListener('change', e => {
      this.params.type = e.target.value;
      // rebuild noise buffer if needed
    });
    const input = this.el.querySelector('[data-param="gain"]');
    input.addEventListener('input', e => {
      this.params.gain = parseFloat(e.target.value);
      this.el.querySelector('[data-display="gain"]').textContent = this.params.gain.toFixed(2);
      if (this.gainNode) this.gainNode.gain.value = this.params.gain;
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.start();

    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = this.params.gain;
    this.source.connect(this.gainNode);

    this.getPort('out').node = this.gainNode;
  }

  destroy() {
    if (this.source) {
      try { this.source.stop(); this.source.disconnect(); } catch(e){}
    }
    if (this.gainNode) this.gainNode.disconnect();
    super.destroy();
  }
}
