import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';

/**
 * Sample – WAV/MP3 con pitch, ADSR y filtro resonante.
 * Cadena: source → filter → envGain → outGain → out
 */
export class Sample extends Module {
  constructor(audioEngine, x, y) {
    super('sample', audioEngine, x, y);
    this.title = 'Sample';
    this.width = 210;
    this.params = {
      rootKey: 60,
      detune: 0,
      gain: 0.8,
      loop: false,
      retrig: true,
      attack: 0.01,
      decay: 0.15,
      sustain: 0.7,
      release: 0.3,
      filterType: 'lowpass',
      cutoff: 8000,
      resonance: 1
    };
    this.buffer = null;
    this.fileName = '';
    this._gateOn = false;

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('cutoff', 'Cutoff CV', 'cv', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input"><div class="port-socket cv" data-port="freq"></div><span>Freq</span></div>
          <div class="port input"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>
          <div class="port input"><div class="port-socket cv" data-port="cutoff"></div><span>Cutoff</span></div>
        </div>
        <div class="ports-col">
          <div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>
        </div>
      </div>
      <div class="control">
        <button class="btn" data-action="load" style="width:100%">Load WAV / MP3</button>
        <input type="file" data-file accept="audio/*,.wav,.mp3,.ogg" hidden />
        <div class="sample-name" data-filename>—</div>
      </div>
      <div class="control">
        <label>Root key <span class="value-display" data-display="rootKey">60</span></label>
        <input type="range" data-param="rootKey" min="24" max="96" step="1" value="60" />
      </div>
      <div class="control">
        <label>Detune <span class="value-display" data-display="detune">0</span></label>
        <input type="range" data-param="detune" min="-100" max="100" step="1" value="0" />
      </div>
      <div class="control">
        <label>Gain <span class="value-display" data-display="gain">0.80</span></label>
        <input type="range" data-param="gain" min="0" max="1" step="0.01" value="0.8" />
      </div>
      <div class="control" style="display:flex;gap:12px;flex-wrap:wrap">
        <label><input type="checkbox" data-param="loop" /> Loop</label>
        <label><input type="checkbox" data-param="retrig" checked /> Retrig</label>
      </div>
      <div class="sample-adsr-title">Filter</div>
      <div class="control">
        <label>Type</label>
        <select data-param="filterType">
          <option value="lowpass">Lowpass</option>
          <option value="highpass">Highpass</option>
          <option value="bandpass">Bandpass</option>
        </select>
      </div>
      <div class="control">
        <label>Cutoff <span class="value-display" data-display="cutoff">8000 Hz</span></label>
        <input type="range" data-param="cutoff" min="40" max="16000" step="1" value="8000" />
      </div>
      <div class="control">
        <label>Resonance <span class="value-display" data-display="resonance">1.0</span></label>
        <input type="range" data-param="resonance" min="0.1" max="24" step="0.1" value="1" />
      </div>
      <div class="sample-adsr-title">Envelope ADSR</div>
      <div class="control">
        <label>A <span class="value-display" data-display="attack">0.01</span></label>
        <input type="range" data-param="attack" min="0.001" max="2" step="0.001" value="0.01" />
      </div>
      <div class="control">
        <label>D <span class="value-display" data-display="decay">0.15</span></label>
        <input type="range" data-param="decay" min="0.001" max="2" step="0.001" value="0.15" />
      </div>
      <div class="control">
        <label>S <span class="value-display" data-display="sustain">0.70</span></label>
        <input type="range" data-param="sustain" min="0" max="1" step="0.01" value="0.7" />
      </div>
      <div class="control">
        <label>R <span class="value-display" data-display="release">0.30</span></label>
        <input type="range" data-param="release" min="0.001" max="3" step="0.001" value="0.3" />
      </div>
    `;
  }

  _bindControls() {
    const fileInput = this.el.querySelector('[data-file]');
    this.el.querySelector('[data-action="load"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await this._loadFile(file);
      fileInput.value = '';
    });

    const typeSel = this.el.querySelector('[data-param="filterType"]');
    typeSel.value = this.params.filterType;
    typeSel.addEventListener('change', (e) => {
      this.params.filterType = e.target.value;
      if (this.filter) this.filter.type = this.params.filterType;
    });

    this.el.querySelectorAll('input[type="range"]').forEach((input) => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector(`[data-display="${param}"]`);
        if (disp) {
          if (param === 'cutoff') disp.textContent = Math.round(val) + ' Hz';
          else if (param === 'resonance') disp.textContent = val.toFixed(1);
          else if (['gain', 'sustain', 'attack', 'decay', 'release'].includes(param)) {
            disp.textContent = val < 10 ? val.toFixed(2) : String(Math.round(val));
          } else {
            disp.textContent = String(Math.round(val));
          }
        }
        this.applyParams();
      });
    });

    const loopCb = this.el.querySelector('[data-param="loop"]');
    loopCb.checked = !!this.params.loop;
    loopCb.addEventListener('change', (e) => {
      this.params.loop = e.target.checked;
      if (this.source) this.source.loop = this.params.loop;
    });

    const retrigCb = this.el.querySelector('[data-param="retrig"]');
    retrigCb.checked = !!this.params.retrig;
    retrigCb.addEventListener('change', (e) => {
      this.params.retrig = e.target.checked;
    });
  }

  async _loadFile(file) {
    const ctx = this.audioEngine.context;
    if (!ctx) {
      alert('Pulsa Start antes de cargar samples');
      return;
    }
    try {
      const arr = await file.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(arr.slice(0));
      this.fileName = file.name;
      const nameEl = this.el.querySelector('[data-filename]');
      if (nameEl) nameEl.textContent = file.name;
      this._ensureSource(false);
    } catch (err) {
      console.error(err);
      alert('No se pudo decodificar el audio');
    }
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    // source → filter → envGain → outGain
    this.filter = ctx.createBiquadFilter();
    this.filter.type = this.params.filterType;
    this.filter.frequency.value = this.params.cutoff;
    this.filter.Q.value = this.params.resonance;

    this.envGain = ctx.createGain();
    this.envGain.gain.value = 0;
    this.filter.connect(this.envGain);

    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.gain;
    this.envGain.connect(this.outGain);

    this.rateConst = this.audioEngine.createConstant(1);
    this.gateNode = ctx.createGain();
    this.gateNode.gain.value = 0;

    this.getPort('out').node = this.outGain;
    this.getPort('freq').node = this.rateConst;
    this.getPort('gate').node = this.gateNode;
    this.getPort('cutoff').node = this.filter.frequency;

    this._baseFreq = AudioEngine.midiToFreq(this.params.rootKey);
    this._pollFreq();
    if (this.buffer) this._ensureSource(false);
  }

  trigger(on, velocity = 1) {
    if (!this.envGain || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    const g = this.envGain.gain;
    const { attack, decay, sustain, release } = this.params;
    const peak = Math.max(0.01, Math.min(1, velocity));

    g.cancelScheduledValues(t);

    if (on) {
      if (this.params.retrig || !this.source) {
        this._ensureSource(true);
      }
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(peak, t + attack);
      g.linearRampToValueAtTime(sustain * peak, t + attack + decay);
      this._gateOn = true;
    } else {
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + release);
      this._gateOn = false;
    }
  }

  _ensureSource(startNow) {
    const ctx = this.audioEngine.context;
    if (!ctx || !this.buffer || !this.filter) return;

    if (this.source) {
      try {
        this.source.stop();
        this.source.disconnect();
      } catch (e) {}
      this.source = null;
    }

    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.loop = !!this.params.loop;
    this.source.connect(this.filter);
    if (startNow) {
      try {
        this.source.start();
      } catch (e) {}
    }
    this.applyParams();
  }

  _pollFreq() {
    if (this._freqTimer) clearInterval(this._freqTimer);
    this._freqTimer = setInterval(() => {
      if (!this.source || !this.rateConst) return;
      const hz = this.rateConst.offset.value;
      let rate = 1;
      if (hz > 20) rate = hz / this._baseFreq;
      else if (hz > 0.01) rate = hz;
      rate *= Math.pow(2, this.params.detune / 1200);
      try {
        this.source.playbackRate.setValueAtTime(
          Math.max(0.05, Math.min(8, rate)),
          this.audioEngine.context.currentTime
        );
      } catch (e) {}
    }, 30);
  }

  applyParams() {
    this._baseFreq = AudioEngine.midiToFreq(this.params.rootKey);
    if (!this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    if (this.outGain) {
      this.outGain.gain.setValueAtTime(this.params.gain, t);
    }
    if (this.filter) {
      this.filter.type = this.params.filterType;
      // Solo actualizamos cutoff por UI si no hay CV conectado
      if (!this.getPort('cutoff').connections.length) {
        this.filter.frequency.setValueAtTime(this.params.cutoff, t);
      }
      this.filter.Q.setValueAtTime(this.params.resonance, t);
    }
  }

  destroy() {
    if (this._freqTimer) clearInterval(this._freqTimer);
    if (this.source) {
      try {
        this.source.stop();
        this.source.disconnect();
      } catch (e) {}
    }
    [this.filter, this.envGain, this.outGain, this.rateConst, this.gateNode].forEach((n) => {
      if (n) try { n.disconnect(); } catch (e) {}
    });
    super.destroy();
  }
}
