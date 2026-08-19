import { Module } from '../core/Module.js';

/**
 * LA – Linear Arithmetic estilo Roland D-50 (Upper + Lower).
 * Cada tono: PCM/ataque + synth filtrado. Mezcla Upper/Lower y balance PCM/synth.
 */
export class LA extends Module {
  constructor(audioEngine, x, y) {
    super('la', audioEngine, x, y);
    this.title = 'LA';
    this.width = 250;
    this.params = {
      frequency: 220,
      // Structure
      upperLevel: 0.7,
      lowerLevel: 0.7,
      lowerDetune: -7, // cents
      // PCM shared options
      pcmType: 'noise',
      pcmLevel: 0.8,
      pcmDecay: 0.3,
      // Upper synth
      uWave: 'sawtooth',
      uCutoff: 3200,
      uRes: 1.5,
      uTone: 1,
      // Lower synth
      lWave: 'square',
      lCutoff: 1800,
      lRes: 2,
      lTone: 0.85,
      // Mix envelope
      mixAttack: 0.02,
      mixRelease: 0.45
    };
    this.buffer = null;
    this.fileName = '';

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="freq"></div><span>Freq</span></div>' +
      '<div class="port input"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="la-section">Estructura</div>' +
      '<div class="control">' +
      '<label>Upper <span class="value-display" data-display="upperLevel">0.70</span></label>' +
      '<input type="range" data-param="upperLevel" min="0" max="1" step="0.01" value="0.7" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Lower <span class="value-display" data-display="lowerLevel">0.70</span></label>' +
      '<input type="range" data-param="lowerLevel" min="0" max="1" step="0.01" value="0.7" />' +
      '</div>' +
      '<div class="control">' +
      '<label>L detune <span class="value-display" data-display="lowerDetune">-7 ct</span></label>' +
      '<input type="range" data-param="lowerDetune" min="-50" max="50" step="1" value="-7" />' +
      '</div>' +
      '<div class="la-section">PCM / ataque</div>' +
      '<div class="control"><label>Tipo</label>' +
      '<select data-param="pcmType">' +
      '<option value="noise">Noise burst</option>' +
      '<option value="click">Click</option>' +
      '<option value="file">Sample</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<button type="button" class="btn" data-action="load" style="width:100%">Load sample</button>' +
      '<input type="file" data-file accept="audio/*,.wav,.mp3,.ogg" hidden />' +
      '<div class="sample-name" data-filename">—</div></div>' +
      '<div class="control">' +
      '<label>PCM lvl <span class="value-display" data-display="pcmLevel">0.80</span></label>' +
      '<input type="range" data-param="pcmLevel" min="0" max="1" step="0.01" value="0.8" />' +
      '</div>' +
      '<div class="control">' +
      '<label>PCM decay <span class="value-display" data-display="pcmDecay">0.30</span></label>' +
      '<input type="range" data-param="pcmDecay" min="0.02" max="2" step="0.01" value="0.3" />' +
      '</div>' +
      '<div class="la-section">Upper (synth)</div>' +
      '<div class="control"><label>Wave</label>' +
      '<select data-param="uWave">' +
      '<option value="sawtooth">Saw</option><option value="square">Square</option>' +
      '<option value="triangle">Tri</option><option value="sine">Sine</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label>Cutoff <span class="value-display" data-display="uCutoff">3200 Hz</span></label>' +
      '<input type="range" data-param="uCutoff" min="100" max="12000" step="1" value="3200" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Res <span class="value-display" data-display="uRes">1.5</span></label>' +
      '<input type="range" data-param="uRes" min="0.1" max="18" step="0.1" value="1.5" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Tone <span class="value-display" data-display="uTone">1.00</span></label>' +
      '<input type="range" data-param="uTone" min="0" max="1" step="0.01" value="1" />' +
      '</div>' +
      '<div class="la-section">Lower (synth)</div>' +
      '<div class="control"><label>Wave</label>' +
      '<select data-param="lWave">' +
      '<option value="square">Square</option><option value="sawtooth">Saw</option>' +
      '<option value="triangle">Tri</option><option value="sine">Sine</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label>Cutoff <span class="value-display" data-display="lCutoff">1800 Hz</span></label>' +
      '<input type="range" data-param="lCutoff" min="100" max="12000" step="1" value="1800" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Res <span class="value-display" data-display="lRes">2.0</span></label>' +
      '<input type="range" data-param="lRes" min="0.1" max="18" step="0.1" value="2" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Tone <span class="value-display" data-display="lTone">0.85</span></label>' +
      '<input type="range" data-param="lTone" min="0" max="1" step="0.01" value="0.85" />' +
      '</div>' +
      '<div class="la-section">Mezcla</div>' +
      '<div class="control">' +
      '<label>Mix A <span class="value-display" data-display="mixAttack">0.02</span></label>' +
      '<input type="range" data-param="mixAttack" min="0.001" max="0.5" step="0.001" value="0.02" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Mix R <span class="value-display" data-display="mixRelease">0.45</span></label>' +
      '<input type="range" data-param="mixRelease" min="0.05" max="3" step="0.01" value="0.45" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Freq <span class="value-display" data-display="frequency">220 Hz</span></label>' +
      '<input type="range" data-param="frequency" min="40" max="2000" step="1" value="220" />' +
      '</div>'
    );
  }

  _bindControls() {
    const fileInput = this.el.querySelector('[data-file]');
    this.el.querySelector('[data-action="load"]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await this._loadFile(file);
      fileInput.value = '';
    });

    this.el.querySelectorAll('select[data-param]').forEach((sel) => {
      const p = sel.dataset.param;
      sel.value = this.params[p];
      sel.addEventListener('change', (e) => {
        this.params[p] = e.target.value;
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
          if (param === 'frequency' || param === 'uCutoff' || param === 'lCutoff') {
            disp.textContent = Math.round(val) + ' Hz';
          } else if (param === 'lowerDetune') {
            disp.textContent = Math.round(val) + ' ct';
          } else if (param === 'uRes' || param === 'lRes') {
            disp.textContent = val.toFixed(1);
          } else {
            disp.textContent = val < 10 ? val.toFixed(2) : String(Math.round(val));
          }
        }
        this.applyParams();
      });
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
      this.params.pcmType = 'file';
      const sel = this.el.querySelector('[data-param="pcmType"]');
      if (sel) sel.value = 'file';
      const nameEl = this.el.querySelector('[data-filename]');
      if (nameEl) nameEl.textContent = file.name;
    } catch (err) {
      console.error(err);
      alert('No se pudo decodificar el audio');
    }
  }

  _makeTone(ctx, wave, cutoff, res) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = this.params.frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    filter.Q.value = res;
    const tone = ctx.createGain();
    tone.gain.value = 0;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    osc.connect(filter);
    filter.connect(tone);
    tone.connect(bus);
    osc.start();
    return { osc, filter, tone, bus };
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.upper = this._makeTone(ctx, this.params.uWave, this.params.uCutoff, this.params.uRes);
    this.lower = this._makeTone(ctx, this.params.lWave, this.params.lCutoff, this.params.lRes);

    this.upperBus = ctx.createGain();
    this.lowerBus = ctx.createGain();
    this.upperBus.gain.value = this.params.upperLevel;
    this.lowerBus.gain.value = this.params.lowerLevel;
    this.upper.bus.connect(this.upperBus);
    this.lower.bus.connect(this.lowerBus);

    this.pcmGain = ctx.createGain();
    this.pcmGain.gain.value = 0;

    this.outGain = ctx.createGain();
    this.outGain.gain.value = 0.55;
    this.upperBus.connect(this.outGain);
    this.lowerBus.connect(this.outGain);
    this.pcmGain.connect(this.outGain);

    this.freqConst = this.audioEngine.createConstant(this.params.frequency);
    this.gateNode = ctx.createGain();
    this.gateNode.gain.value = 0;

    this.getPort('out').node = this.outGain;
    this.getPort('freq').node = this.freqConst;
    this.getPort('gate').node = this.gateNode;

    this._freqTimer = setInterval(() => this._syncFreq(), 25);
    this.applyParams();
  }

  _syncFreq() {
    if (!this.upper || !this.freqConst || !this.audioEngine.context) return;
    let f = this.params.frequency;
    const cv = this.freqConst.offset.value;
    if (cv > 20) f = cv;
    const t = this.audioEngine.context.currentTime;
    const det = Math.pow(2, (this.params.lowerDetune || 0) / 1200);
    try {
      this.upper.osc.frequency.setValueAtTime(f, t);
      this.lower.osc.frequency.setValueAtTime(f * det, t);
    } catch (e) {}
  }

  trigger(on, velocity) {
    if (velocity == null) velocity = 1;
    if (!this.upper || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    const vel = Math.max(0.05, Math.min(1, velocity));
    const a = this.params.mixAttack;
    const r = this.params.mixRelease;

    if (on) {
      this._firePcm(vel);
      [this.upper, this.lower].forEach((tone, idx) => {
        const peak = (idx === 0 ? this.params.uTone : this.params.lTone) * vel;
        tone.tone.gain.cancelScheduledValues(t);
        tone.tone.gain.setValueAtTime(tone.tone.gain.value, t);
        tone.tone.gain.linearRampToValueAtTime(peak, t + a);
      });
    } else {
      [this.upper, this.lower].forEach((tone) => {
        tone.tone.gain.cancelScheduledValues(t);
        tone.tone.gain.setValueAtTime(tone.tone.gain.value, t);
        tone.tone.gain.linearRampToValueAtTime(0, t + r);
      });
      if (this.pcmGain) {
        this.pcmGain.gain.cancelScheduledValues(t);
        this.pcmGain.gain.setValueAtTime(this.pcmGain.gain.value, t);
        this.pcmGain.gain.linearRampToValueAtTime(0, t + Math.min(this.params.pcmDecay, r));
      }
    }
  }

  _firePcm(velocity) {
    const ctx = this.audioEngine.context;
    if (!ctx || !this.pcmGain) return;
    const t = ctx.currentTime;
    const level = this.params.pcmLevel * velocity;
    const decay = this.params.pcmDecay;

    if (this._pcmSrc) {
      try { this._pcmSrc.stop(); this._pcmSrc.disconnect(); } catch (e) {}
      this._pcmSrc = null;
    }

    let src;
    if (this.params.pcmType === 'file' && this.buffer) {
      src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.pcmGain);
      src.start();
      this._pcmSrc = src;
    } else {
      const len = Math.floor(ctx.sampleRate * (this.params.pcmType === 'click' ? 0.04 : Math.max(0.05, decay)));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = this.params.pcmType === 'click'
          ? Math.pow(1 - i / len, 2)
          : Math.exp(-3 * (i / len));
        d[i] = (Math.random() * 2 - 1) * env;
      }
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.pcmGain);
      src.start();
      this._pcmSrc = src;
    }

    this.pcmGain.gain.cancelScheduledValues(t);
    this.pcmGain.gain.setValueAtTime(0, t);
    this.pcmGain.gain.linearRampToValueAtTime(level, t + 0.005);
    this.pcmGain.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.02, decay));
  }

  applyParams() {
    if (!this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    if (this.upperBus) this.upperBus.gain.setValueAtTime(this.params.upperLevel, t);
    if (this.lowerBus) this.lowerBus.gain.setValueAtTime(this.params.lowerLevel, t);
    if (this.upper) {
      this.upper.osc.type = this.params.uWave;
      this.upper.filter.frequency.setValueAtTime(this.params.uCutoff, t);
      this.upper.filter.Q.setValueAtTime(this.params.uRes, t);
    }
    if (this.lower) {
      this.lower.osc.type = this.params.lWave;
      this.lower.filter.frequency.setValueAtTime(this.params.lCutoff, t);
      this.lower.filter.Q.setValueAtTime(this.params.lRes, t);
    }
    this._syncFreq();
  }

  destroy() {
    if (this._freqTimer) clearInterval(this._freqTimer);
    if (this._pcmSrc) {
      try { this._pcmSrc.stop(); this._pcmSrc.disconnect(); } catch (e) {}
    }
    [this.upper, this.lower].forEach((tone) => {
      if (!tone) return;
      try { tone.osc.stop(); tone.osc.disconnect(); } catch (e) {}
      try { tone.filter.disconnect(); tone.tone.disconnect(); tone.bus.disconnect(); } catch (e) {}
    });
    [this.upperBus, this.lowerBus, this.pcmGain, this.outGain, this.freqConst, this.gateNode].forEach((n) => {
      if (n) try { n.disconnect(); } catch (e) {}
    });
    super.destroy();
  }
}
