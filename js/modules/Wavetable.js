import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';
import { MAX_POLY, allocateVoice, findVoiceByNote, triggerEnv } from '../core/VoiceAllocator.js';

const DEFAULT_FRAMES = 64;
const MAX_HARMONICS = 128;
const MAX_FRAMES = 256;

/**
 * Wavetable – morph moderno + loader de tablas.
 *
 * Fuentes:
 *  1) Procedural (sine→saw→pulse→metal)
 *  2) WAV/MP3 multi-ciclo (Serum/Vital export típico: N ciclos concatenados)
 *  3) JSON propio / subset Vital-like: { frameSize, frames: number[][] } o { wavetable: { ... } }
 *
 * Morph: 2× PeriodicWave adyacentes + crossfade; unison 1–5.
 */
export class Wavetable extends Module {
  constructor(audioEngine, x, y) {
    super('wavetable', audioEngine, x, y);
    this.title = 'Wavetable';
    this.width = 230;
    this.params = {
      frequency: 110,
      position: 0,
      detune: 0,
      unison: 1,
      spread: 12,
      level: 0.45,
      frameSize: 2048,
      numVoices: 4,
      steal: 'oldest',
      attack: 0.01,
      decay: 0.2,
      sustain: 0.7,
      release: 0.35,
      pcKeys: false
    };
    this._order = 0;
    this._onNote = null;
    this._unsubMidi = null;
    this._pcDown = new Map();
    this._waves = null;
    this._numFrames = DEFAULT_FRAMES;
    this._voices = [];
    this._sourceLabel = 'Built-in (procedural)';
    this._tableName = '';

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('pos', 'Pos CV', 'cv', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="freq"></div><span>Freq</span></div>' +
      '<div class="port input"><div class="port-socket cv" data-port="pos"></div><span>Pos</span></div>' +
      '<div class="port input"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<button type="button" class="btn" data-action="load" style="width:100%">Load WAV / JSON</button>' +
      '<input type="file" data-file accept="audio/*,.wav,.mp3,.ogg,.json,application/json" hidden />' +
      '<div class="sample-name" data-filename>' + this._sourceLabel + '</div>' +
      '</div>' +
      '<div class="control">' +
      '<label>Frame size</label>' +
      '<select data-param="frameSize">' +
      '<option value="auto">Auto</option>' +
      '<option value="256">256</option>' +
      '<option value="512">512</option>' +
      '<option value="1024">1024</option>' +
      '<option value="2048" selected>2048</option>' +
      '</select></div>' +
      '<div class="control" style="display:flex;gap:6px">' +
      '<button type="button" class="btn" data-action="builtin" style="flex:1">Built-in</button>' +
      '</div>' +
      '<div class="wt-preview" data-wt-preview title="Posición en la tabla"></div>' +
      '<div class="control">' +
      '<label>Freq <span class="value-display" data-display="frequency">110 Hz</span></label>' +
      '<input type="range" data-param="frequency" min="20" max="2000" step="1" value="110" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Position <span class="value-display" data-display="position">0%</span></label>' +
      '<input type="range" data-param="position" min="0" max="1" step="0.001" value="0" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Detune <span class="value-display" data-display="detune">0</span></label>' +
      '<input type="range" data-param="detune" min="-50" max="50" step="1" value="0" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Unison <span class="value-display" data-display="unison">1</span></label>' +
      '<input type="range" data-param="unison" min="1" max="5" step="1" value="1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Spread <span class="value-display" data-display="spread">12 ct</span></label>' +
      '<input type="range" data-param="spread" min="0" max="50" step="1" value="12" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Level <span class="value-display" data-display="level">0.45</span></label>' +
      '<input type="range" data-param="level" min="0" max="1" step="0.01" value="0.45" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Voces <span class="value-display" data-display="numVoices">4</span></label>' +
      '<input type="range" data-param="numVoices" min="1" max="8" step="1" value="4" />' +
      '</div>' +
      '<div class="control">' +
      '<label>A <span class="value-display" data-display="attack">0.01</span></label>' +
      '<input type="range" data-param="attack" min="0.001" max="2" step="0.001" value="0.01" />' +
      '</div>' +
      '<div class="control">' +
      '<label>R <span class="value-display" data-display="release">0.35</span></label>' +
      '<input type="range" data-param="release" min="0.01" max="3" step="0.01" value="0.35" />' +
      '</div>' +
      '<div class="control">' +
      '<label class="kb-check"><input type="checkbox" data-param="pcKeys" /> Teclado PC</label>' +
      '</div>' +
      '<div class="ps-voices" data-poly-leds></div>' +
      '<div class="wt-hint" data-wt-hint>Morph · poly · WAV multi-ciclo</div>'
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

    this.el.querySelector('[data-action="builtin"]').addEventListener('click', () => {
      this._sourceLabel = 'Built-in (procedural)';
      this._tableName = '';
      this._setNameUI();
      if (this.audioEngine.context) {
        this._waves = null;
        this._buildProceduralTable(this.audioEngine.context);
        this._rebuildUnison();
        this._setHint(this._numFrames + ' frames procedural');
      }
    });

    const fs = this.el.querySelector('[data-param="frameSize"]');
    if (fs) {
      fs.value = String(this.params.frameSize);
      fs.addEventListener('change', (e) => {
        this.params.frameSize = e.target.value === 'auto' ? 'auto' : parseInt(e.target.value, 10);
      });
    }

    const pc = this.el.querySelector('[data-param="pcKeys"]');
    if (pc) {
      pc.checked = !!this.params.pcKeys;
      pc.addEventListener('change', (e) => { this.params.pcKeys = e.target.checked; });
    }
    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector('[data-display="' + param + '"]');
        if (disp) {
          if (param === 'frequency') disp.textContent = Math.round(val) + ' Hz';
          else if (param === 'position') disp.textContent = Math.round(val * 100) + '%';
          else if (param === 'spread') disp.textContent = Math.round(val) + ' ct';
          else if (param === 'level') disp.textContent = val.toFixed(2);
          else disp.textContent = String(Math.round(val));
        }
        if (param === 'unison') this._rebuildUnison();
        this.applyParams();
        this._updatePreview();
      });
    });
    this._updatePreview();
  }

  _setNameUI() {
    const el = this.el && this.el.querySelector('[data-filename]');
    if (el) el.textContent = this._tableName || this._sourceLabel;
  }

  _setHint(text) {
    const el = this.el && this.el.querySelector('[data-wt-hint]');
    if (el) el.textContent = text;
  }

  _updatePreview() {
    const el = this.el && this.el.querySelector('[data-wt-preview]');
    if (!el) return;
    const p = Math.max(0, Math.min(1, this.params.position));
    el.style.setProperty('--wt-pos', p * 100 + '%');
  }

  async _loadFile(file) {
    const ctx = this.audioEngine.context;
    if (!ctx) {
      alert('Pulsa Start antes de cargar wavetables');
      return;
    }
    const name = file.name || 'table';
    try {
      if (/\.json$/i.test(name) || file.type === 'application/json') {
        const text = await file.text();
        const data = JSON.parse(text);
        await this._loadFromJson(data, name);
      } else {
        const arr = await file.arrayBuffer();
        const audio = await ctx.decodeAudioData(arr.slice(0));
        this._loadFromAudioBuffer(audio, name);
      }
    } catch (err) {
      console.error(err);
      alert('No se pudo cargar la wavetable:\n' + (err.message || err));
    }
  }

  /**
   * JSON soportado:
   * - { frameSize, frames: number[][] }
   * - { samples: number[], frameSize }
   * - Vital-like simplificado: { wavetable: { keyframes: [ { wave: number[] } ] } }
   * - { real: number[][], imag: number[][] } coeficientes ya en frecuencia
   */
  async _loadFromJson(data, name) {
    const ctx = this.audioEngine.context;
    let frames = null;
    let frameSize = 0;

    if (data.real && data.imag && Array.isArray(data.real)) {
      this._waves = [];
      const n = Math.min(MAX_FRAMES, data.real.length);
      for (let i = 0; i < n; i++) {
        const real = toFloat32(data.real[i]);
        const imag = toFloat32(data.imag[i]);
        this._waves.push(ctx.createPeriodicWave(real, imag, { disableNormalization: false }));
      }
      this._numFrames = this._waves.length;
      this._sourceLabel = name;
      this._tableName = name + ' (' + this._numFrames + ' frames)';
      this._setNameUI();
      this._rebuildUnison();
      this._setHint(this._numFrames + ' frames desde JSON (FFT)');
      return;
    }

    if (data.wavetable && data.wavetable.keyframes) {
      frames = data.wavetable.keyframes.map((k) => {
        if (Array.isArray(k)) return k;
        if (k.wave) return k.wave;
        if (k.samples) return k.samples;
        return null;
      }).filter(Boolean);
    } else if (Array.isArray(data.frames)) {
      frames = data.frames;
      frameSize = data.frameSize || (frames[0] && frames[0].length) || 0;
    } else if (Array.isArray(data.samples) && data.frameSize) {
      frames = splitSamples(data.samples, data.frameSize);
      frameSize = data.frameSize;
    } else if (Array.isArray(data) && Array.isArray(data[0])) {
      frames = data;
    }

    if (!frames || !frames.length) {
      throw new Error('JSON no reconocido. Usa { frames: number[][], frameSize }');
    }

    frames = frames.slice(0, MAX_FRAMES);
    this._waves = frames.map((fr) => cycleToPeriodicWave(ctx, fr));
    this._numFrames = this._waves.length;
    this._sourceLabel = name;
    this._tableName = name + ' (' + this._numFrames + ' frames)';
    this._setNameUI();
    this._rebuildUnison();
    this._setHint(this._numFrames + ' frames · JSON');
  }

  _loadFromAudioBuffer(audio, name) {
    const ctx = this.audioEngine.context;
    const ch = audio.getChannelData(0);
    const total = ch.length;

    let frameSize = this.params.frameSize;
    if (frameSize === 'auto' || !frameSize) {
      frameSize = guessFrameSize(total);
    }
    frameSize = Math.max(64, frameSize | 0);

    let numFrames = Math.floor(total / frameSize);
    if (numFrames < 1) {
      // un solo ciclo: usar todo el buffer
      frameSize = total;
      numFrames = 1;
    }
    if (numFrames > MAX_FRAMES) {
      // saltar frames equiespaciados
      const step = numFrames / MAX_FRAMES;
      const picked = [];
      for (let i = 0; i < MAX_FRAMES; i++) {
        const idx = Math.floor(i * step);
        const start = idx * frameSize;
        picked.push(ch.subarray(start, start + frameSize));
      }
      this._waves = picked.map((fr) => cycleToPeriodicWave(ctx, fr));
      this._numFrames = this._waves.length;
    } else {
      this._waves = [];
      for (let i = 0; i < numFrames; i++) {
        const start = i * frameSize;
        this._waves.push(cycleToPeriodicWave(ctx, ch.subarray(start, start + frameSize)));
      }
      this._numFrames = this._waves.length;
    }

    this._sourceLabel = name;
    this._tableName = name + ' · ' + frameSize + '×' + this._numFrames;
    this._setNameUI();
    this._rebuildUnison();
    this._setHint(this._numFrames + ' frames · ' + frameSize + ' samples/ciclo');
  }

  _buildProceduralTable(ctx) {
    this._waves = [];
    this._numFrames = DEFAULT_FRAMES;
    for (let f = 0; f < DEFAULT_FRAMES; f++) {
      const t = f / (DEFAULT_FRAMES - 1);
      const real = new Float32Array(MAX_HARMONICS);
      const imag = new Float32Array(MAX_HARMONICS);
      for (let n = 1; n < MAX_HARMONICS; n++) {
        let amp = 0;
        if (t < 0.33) {
          const u = t / 0.33;
          const sine = n === 1 ? 1 : 0;
          const saw = 1 / n;
          amp = sine * (1 - u) + saw * u;
        } else if (t < 0.66) {
          const u = (t - 0.33) / 0.33;
          const saw = 1 / n;
          const pulse = n % 2 === 1 ? 1 / n : 0;
          amp = saw * (1 - u) + pulse * u;
        } else {
          const u = (t - 0.66) / 0.34;
          const pulse = n % 2 === 1 ? 1 / n : 0;
          const metal = (1 / n) * (0.4 + 0.6 * Math.abs(Math.sin(n * 0.7 + u * 3)));
          amp = pulse * (1 - u) + metal * u;
        }
        amp *= Math.exp(-0.015 * n);
        imag[n] = amp;
      }
      this._waves.push(ctx.createPeriodicWave(real, imag, { disableNormalization: false }));
    }
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    if (!this._waves) this._buildProceduralTable(ctx);

    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.level;
    this.freqBus = this.audioEngine.context.createGain();
    this.freqBus.gain.value = 1;
    this.posConst = this.audioEngine.createConstant(0);

    this.getPort('out').node = this.outGain;
    this.getPort('freq').node = this.freqBus;
    this.getPort('pos').node = this.posConst;

    this._rebuildUnison();
    this._ensurePolyVoices();
    this._timer = setInterval(() => this._sync(), 20);
    this.applyParams();
    this._bindPolyInput();
    setTimeout(() => this._bindPolyInput(), 500);
  }

  _rebuildUnison() {
    const ctx = this.audioEngine.context;
    if (!ctx || !this.outGain || !this._waves || !this._waves.length) return;

    this._voices.forEach((v) => {
      try {
        v.oscA.stop();
        v.oscB.stop();
        v.oscA.disconnect();
        v.oscB.disconnect();
        v.gA.disconnect();
        v.gB.disconnect();
        v.mix.disconnect();
      } catch (e) {}
    });
    this._voices = [];

    const n = Math.max(1, Math.min(5, Math.round(this.params.unison || 1)));
    const voiceGain = 1 / Math.sqrt(n);
    const w0 = this._waves[0];
    const w1 = this._waves[Math.min(1, this._waves.length - 1)];

    for (let i = 0; i < n; i++) {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const gA = ctx.createGain();
      const gB = ctx.createGain();
      const mix = ctx.createGain();
      mix.gain.value = voiceGain;

      oscA.setPeriodicWave(w0);
      oscB.setPeriodicWave(w1);
      gA.gain.value = 1;
      gB.gain.value = 0;

      oscA.connect(gA);
      oscB.connect(gB);
      gA.connect(mix);
      gB.connect(mix);
      mix.connect(this.outGain);
      oscA.start();
      oscB.start();

      const center = (n - 1) / 2;
      const cents = n === 1 ? 0 : (i - center) * this.params.spread;
      this._voices.push({ oscA, oscB, gA, gB, mix, cents });
    }
    this._sync();
  }

  _readPosition() {
    let p = this.params.position;
    if (this.getPort('pos').connections.length && this.posConst) {
      const cv = this.posConst.offset.value;
      if (cv > 1) p = Math.min(1, cv / 100);
      else if (cv >= 0) p = Math.max(0, Math.min(1, cv));
    }
    return Math.max(0, Math.min(0.9999, p));
  }

  _sync() {
    if (!this._voices.length || !this.freqBus || !this.audioEngine.context || !this._waves) return;
    let f = this.params.frequency;
    const hasCv = this.getPort('freq').connections.length > 0;
    const det = Math.pow(2, (this.params.detune || 0) / 1200);
    const pos = this._readPosition();
    const last = this._waves.length - 1;
    const frame = pos * last;
    const i0 = Math.floor(frame);
    const i1 = Math.min(last, i0 + 1);
    const frac = frame - i0;
    const t = this.audioEngine.context.currentTime;

    this._voices.forEach((v) => {
      let vf = f * det * Math.pow(2, (v.cents || 0) / 1200);
      if (v.note != null) {
        vf = AudioEngine.midiToFreq(v.note) * det * Math.pow(2, (v.cents || 0) / 1200);
      }
      try {
        // CV bus solo si no hay nota polifónica
        const useCv = hasCv && v.note == null;
        v.oscA.frequency.setValueAtTime(useCv ? 0 : vf, t);
        v.oscB.frequency.setValueAtTime(useCv ? 0 : vf, t);
        if (hasCv && this.freqBus && !v._cvLinked) {
          try {
            this.freqBus.connect(v.oscA.frequency);
            this.freqBus.connect(v.oscB.frequency);
            v._cvLinked = true;
          } catch (e) {}
        }
        v.oscA.setPeriodicWave(this._waves[i0]);
        v.oscB.setPeriodicWave(this._waves[i1]);
        v.gA.gain.setValueAtTime(1 - frac, t);
        v.gB.gain.setValueAtTime(frac, t);
      } catch (e) {}
    });
  }

  applyParams() {
    if (this.outGain && this.audioEngine.context) {
      this.outGain.gain.setValueAtTime(this.params.level, this.audioEngine.context.currentTime);
    }
    if (this._voices.length > 1) {
      const n = this._voices.length;
      const center = (n - 1) / 2;
      this._voices.forEach((v, i) => {
        v.cents = (i - center) * this.params.spread;
      });
    }
    this._sync();
    this._updatePreview();
  }

  trigger(on, velocity = 1) {
    if (on) {
      let f = this.params.frequency;
      const midi = Math.round(69 + 12 * Math.log2(Math.max(20, f) / 440));
      this.noteOn(midi, velocity);
    } else {
      this._voices.forEach((v) => {
        if (v.note != null) {
          if (v.amp) triggerEnv(v.amp.gain, false, 0, this.params, this.audioEngine.context);
          v.note = null;
        }
      });
      this._renderLeds();
    }
  }

  noteOn(midi, velocity = 1) {
    if (!this._voices.length || !this.audioEngine.context) return;
    // En poly: cada "unison slot" se usa como voz de nota si numVoices y structure lo permiten
    // Asegurar al menos numVoices entradas
    this._ensurePolyVoices();
    const n = this.params.numVoices || 4;
    const idx = allocateVoice(this._voices, n, midi, this.params.steal || 'oldest');
    const v = this._voices[idx];
    if (v.note != null && v.note !== midi && v.amp) {
      triggerEnv(v.amp.gain, false, 0, this.params, this.audioEngine.context, true);
    }
    v.note = midi;
    v.order = ++this._order;
    const freq = AudioEngine.midiToFreq(midi) * Math.pow(2, (this.params.detune || 0) / 1200);
    const t = this.audioEngine.context.currentTime;
    try {
      if (v.oscA) v.oscA.frequency.setValueAtTime(freq * Math.pow(2, (v.cents || 0) / 1200), t);
      if (v.oscB) v.oscB.frequency.setValueAtTime(freq * Math.pow(2, (v.cents || 0) / 1200), t);
    } catch (e) {}
    if (v.amp) triggerEnv(v.amp.gain, true, velocity, this.params, this.audioEngine.context);
    else {
      // fallback: abrir mix
      try { v.mix.gain.setValueAtTime(0.3, t); } catch (e) {}
    }
    this._renderLeds();
  }

  noteOff(midi) {
    if (!this._voices.length) return;
    const idx = findVoiceByNote(this._voices, this.params.numVoices || 4, midi);
    if (idx < 0) return;
    const v = this._voices[idx];
    if (v.amp) triggerEnv(v.amp.gain, false, 0, this.params, this.audioEngine.context);
    v.note = null;
    this._renderLeds();
  }

  _ensurePolyVoices() {
    // Si unison < numVoices, reconstruir con numVoices oscs (spread 0)
    const need = Math.max(this.params.numVoices || 4, this.params.unison || 1);
    if (this._voices.length >= need) return;
    const prev = this.params.unison;
    this.params.unison = need;
    this._rebuildUnison();
    this.params.unison = prev;
    // add amp nodes
    this._voices.forEach((v) => {
      if (v.amp) return;
      const ctx = this.audioEngine.context;
      const amp = ctx.createGain();
      amp.gain.value = 0;
      try {
        v.mix.disconnect();
        v.mix.connect(amp);
        amp.connect(this.outGain);
      } catch (e) {}
      v.amp = amp;
      v.note = null;
      v.order = 0;
    });
  }

  _renderLeds() {
    const host = this.el && this.el.querySelector('[data-poly-leds]');
    if (!host) return;
    const n = this.params.numVoices || 4;
    let html = '';
    for (let i = 0; i < n; i++) {
      const on = this._voices[i] && this._voices[i].note != null;
      html += '<span class="ps-led' + (on ? ' on' : '') + '">' + (i + 1) + '</span>';
    }
    host.innerHTML = html;
  }

  _bindPolyInput() {
    if (this._polyBound) return;
    this._polyBound = true;
    this._onNote = (ev) => {
      const d = ev.detail || {};
      if (d.note == null) return;
      if (d.on) this.noteOn(d.note, d.velocity != null ? d.velocity : 1);
      else this.noteOff(d.note);
    };
    window.addEventListener('modsynth-note', this._onNote);
    this._keyMap = {
      z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59,
      ',': 60, l: 61, '.': 62, ';': 63, '/': 64,
      q: 60, '2': 61, w: 62, '3': 63, e: 64, r: 65, '5': 66, t: 67, '6': 68, y: 69, '7': 70, u: 71, i: 72
    };
    this._onKeyDown = (e) => {
      if (!this.params.pcKeys || e.repeat) return;
      if (e.target && e.target.matches && e.target.matches('input,select,textarea,button')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (this._keyMap[k] === undefined) return;
      e.preventDefault();
      this._pcDown.set(k, this._keyMap[k]);
      this.noteOn(this._keyMap[k], 1);
    };
    this._onKeyUp = (e) => {
      if (!this.params.pcKeys) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this._pcDown.has(k)) return;
      const m = this._pcDown.get(k);
      this._pcDown.delete(k);
      this.noteOff(m);
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    // MIDI
    try {
      const midi = window.modularSynth && window.modularSynth.midi;
      if (midi && typeof midi.on === 'function' && !this._unsubMidi) {
        this._unsubMidi = midi.on((type, data) => {
          if (type === 'noteon') this.noteOn(data.note, data.velocity != null ? data.velocity : 1);
          else if (type === 'noteoff') this.noteOff(data.note);
        });
      }
    } catch (e) {}
  }

  destroy() {
    if (this._onNote) window.removeEventListener('modsynth-note', this._onNote);
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp);
    if (typeof this._unsubMidi === 'function') try { this._unsubMidi(); } catch (e) {}
    if (this._timer) clearInterval(this._timer);
    this._voices.forEach((v) => {
      try {
        v.oscA.stop();
        v.oscB.stop();
        v.oscA.disconnect();
        v.oscB.disconnect();
        v.gA.disconnect();
        v.gB.disconnect();
        v.mix.disconnect();
      } catch (e) {}
    });
    if (this.outGain) this.outGain.disconnect();
    if (this.freqBus) try { this.freqBus.disconnect(); } catch(e) {}
    if (this.posConst) this.posConst.disconnect();
    super.destroy();
  }
}

/** DFT simple → PeriodicWave (ciclo en dominio del tiempo). */
function cycleToPeriodicWave(ctx, samples) {
  const N = samples.length;
  const maxH = Math.min(MAX_HARMONICS, Math.floor(N / 2));
  const real = new Float32Array(maxH);
  const imag = new Float32Array(maxH);
  // remove DC
  let mean = 0;
  for (let i = 0; i < N; i++) mean += samples[i];
  mean /= N;

  for (let k = 1; k < maxH; k++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / N;
    for (let n = 0; n < N; n++) {
      const s = samples[n] - mean;
      re += s * Math.cos(w * n);
      im -= s * Math.sin(w * n);
    }
    re /= N;
    im /= N;
    real[k] = re;
    imag[k] = im;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

function toFloat32(arr) {
  if (arr instanceof Float32Array) return arr;
  const a = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) a[i] = arr[i];
  return a;
}

function splitSamples(samples, frameSize) {
  const frames = [];
  for (let i = 0; i + frameSize <= samples.length && frames.length < MAX_FRAMES; i += frameSize) {
    frames.push(samples.slice(i, i + frameSize));
  }
  return frames;
}

/** Elige potencia de 2 típica (256–2048) que divida el buffer. */
function guessFrameSize(total) {
  const candidates = [2048, 1024, 512, 256, 4096];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (total >= c && total % c === 0) {
      const frames = total / c;
      if (frames >= 1 && frames <= 512) return c;
    }
  }
  // mejor aproximación: potencia de 2 cercana a total/64
  let best = 2048;
  let bestScore = Infinity;
  candidates.forEach((c) => {
    const frames = Math.floor(total / c);
    if (frames < 1) return;
    const rem = total % c;
    const score = rem + Math.abs(frames - 64);
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  });
  return best;
}
