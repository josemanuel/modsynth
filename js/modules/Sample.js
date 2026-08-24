import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';
import {
  MAX_POLY,
  allocateVoice,
  findVoiceByNote,
  triggerEnv
} from '../core/VoiceAllocator.js';

/**
 * Sample polifónico – pool de BufferSource + filtro + ADSR por voz.
 */
export class Sample extends Module {
  constructor(audioEngine, x, y) {
    super('sample', audioEngine, x, y);
    this.title = 'Sample';
    this.width = 220;
    this.params = {
      rootKey: 60,
      detune: 0,
      gain: 0.8,
      loop: false,
      numVoices: 4,
      steal: 'oldest',
      attack: 0.01,
      decay: 0.15,
      sustain: 0.7,
      release: 0.3,
      filterType: 'lowpass',
      cutoff: 8000,
      resonance: 1,
      pcKeys: false
    };
    this.buffer = null;
    this.fileName = '';
    this._voices = [];
    this._order = 0;
    this._pcDown = new Map();
    this._onNote = null;
    this._unsubMidi = null;

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('cutoff', 'Cutoff CV', 'cv', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="freq"></div><span>Freq</span></div>' +
      '<div class="port input"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>' +
      '<div class="port input"><div class="port-socket cv" data-port="cutoff"></div><span>Cutoff</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<button type="button" class="btn" data-action="load" style="width:100%">Load WAV / MP3</button>' +
      '<input type="file" data-file accept="audio/*,.wav,.mp3,.ogg" hidden />' +
      '<div class="sample-name" data-filename>—</div></div>' +
      '<div class="control">' +
      '<label>Voces <span class="value-display" data-display="numVoices">4</span></label>' +
      '<input type="range" data-param="numVoices" min="1" max="' + MAX_POLY + '" step="1" value="4" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Root key <span class="value-display" data-display="rootKey">60</span></label>' +
      '<input type="range" data-param="rootKey" min="24" max="96" step="1" value="60" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Detune <span class="value-display" data-display="detune">0</span></label>' +
      '<input type="range" data-param="detune" min="-100" max="100" step="1" value="0" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Gain <span class="value-display" data-display="gain">0.80</span></label>' +
      '<input type="range" data-param="gain" min="0" max="1" step="0.01" value="0.8" />' +
      '</div>' +
      '<div class="control"><label>Filter</label>' +
      '<select data-param="filterType">' +
      '<option value="lowpass">LP</option><option value="highpass">HP</option><option value="bandpass">BP</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label>Cutoff <span class="value-display" data-display="cutoff">8000</span></label>' +
      '<input type="range" data-param="cutoff" min="80" max="16000" step="1" value="8000" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Res <span class="value-display" data-display="resonance">1.0</span></label>' +
      '<input type="range" data-param="resonance" min="0.1" max="20" step="0.1" value="1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>A <span class="value-display" data-display="attack">0.01</span></label>' +
      '<input type="range" data-param="attack" min="0.001" max="2" step="0.001" value="0.01" />' +
      '</div>' +
      '<div class="control">' +
      '<label>D <span class="value-display" data-display="decay">0.15</span></label>' +
      '<input type="range" data-param="decay" min="0.001" max="2" step="0.001" value="0.15" />' +
      '</div>' +
      '<div class="control">' +
      '<label>S <span class="value-display" data-display="sustain">0.70</span></label>' +
      '<input type="range" data-param="sustain" min="0" max="1" step="0.01" value="0.7" />' +
      '</div>' +
      '<div class="control">' +
      '<label>R <span class="value-display" data-display="release">0.30</span></label>' +
      '<input type="range" data-param="release" min="0.01" max="3" step="0.01" value="0.3" />' +
      '</div>' +
      '<div class="control">' +
      '<label><input type="checkbox" data-param="loop" /> Loop</label> ' +
      '<label class="kb-check"><input type="checkbox" data-param="pcKeys" /> Teclado PC</label>' +
      '</div>' +
      '<div class="ps-voices" data-poly-leds></div>'
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

    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const p = input.dataset.param;
      input.value = this.params[p];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[p] = p === 'numVoices' || p === 'rootKey' || p === 'detune' ? parseInt(e.target.value, 10) : val;
        const d = this.el.querySelector('[data-display="' + p + '"]');
        if (d) {
          if (p === 'numVoices' || p === 'rootKey' || p === 'detune' || p === 'cutoff') d.textContent = String(Math.round(this.params[p]));
          else d.textContent = val.toFixed(2);
        }
        this.applyParams();
        if (p === 'numVoices') this._renderLeds();
      });
    });
    this.el.querySelectorAll('select[data-param]').forEach((sel) => {
      sel.value = this.params[sel.dataset.param];
      sel.addEventListener('change', (e) => {
        this.params[sel.dataset.param] = e.target.value;
        this.applyParams();
      });
    });
    ['loop', 'pcKeys'].forEach((p) => {
      const el = this.el.querySelector('[data-param="' + p + '"]');
      if (!el) return;
      el.checked = !!this.params[p];
      el.addEventListener('change', (e) => { this.params[p] = e.target.checked; });
    });

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
    this._onNote = (ev) => {
      const d = ev.detail || {};
      if (d.note == null) return;
      if (d.on) this.noteOn(d.note, d.velocity != null ? d.velocity : 1);
      else this.noteOff(d.note);
    };
    window.addEventListener('modsynth-note', this._onNote);
  }

  async _loadFile(file) {
    if (!this.audioEngine.context) {
      alert('Pulsa Start primero');
      return;
    }
    try {
      const arr = await file.arrayBuffer();
      this.buffer = await this.audioEngine.context.decodeAudioData(arr.slice(0));
      this.fileName = file.name;
      const el = this.el.querySelector('[data-filename]');
      if (el) el.textContent = file.name;
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.bus = ctx.createGain();
    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.gain;
    this.bus.connect(this.outGain);

    this.rateConst = this.audioEngine.createConstant(1);
    this.gateNode = this.audioEngine.createConstant(0);
    this.cutoffConst = this.audioEngine.createConstant(this.params.cutoff);

    this.getPort('out').node = this.outGain;
    this.getPort('freq').node = this.rateConst;
    this.getPort('gate').node = this.gateNode;
    this.getPort('cutoff').node = this.cutoffConst;

    this._voices = [];
    for (let i = 0; i < MAX_POLY; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = this.params.filterType;
      filter.frequency.value = this.params.cutoff;
      filter.Q.value = this.params.resonance;
      const amp = ctx.createGain();
      amp.gain.value = 0;
      filter.connect(amp);
      amp.connect(this.bus);
      this._voices.push({
        filter,
        amp,
        source: null,
        note: null,
        order: 0
      });
    }
    this.applyParams();
    this._trySubscribeMidi();
    setTimeout(() => this._trySubscribeMidi(), 500);
    this._renderLeds();
  }

  _trySubscribeMidi() {
    try {
      if (this._unsubMidi) return;
      const midi = window.modularSynth && window.modularSynth.midi;
      if (!midi || typeof midi.on !== 'function') return;
      this._unsubMidi = midi.on((type, data) => {
        if (type === 'noteon') this.noteOn(data.note, data.velocity != null ? data.velocity : 1);
        else if (type === 'noteoff') this.noteOff(data.note);
      });
    } catch (e) {}
  }

  trigger(on, velocity = 1) {
    if (on) {
      let midi = this.params.rootKey;
      if (this.getPort('freq').connections.length && this.rateConst) {
        const hz = this.rateConst.offset.value;
        if (hz > 20) midi = Math.round(69 + 12 * Math.log2(hz / 440));
      }
      this.noteOn(midi, velocity);
    } else {
      this._voices.forEach((v) => {
        if (v.note != null) this._releaseVoice(v);
      });
      this._renderLeds();
    }
  }

  noteOn(midi, velocity = 1) {
    if (!this.buffer || !this._voices.length || !this.audioEngine.context) return;
    const n = this.params.numVoices || 4;
    const idx = allocateVoice(this._voices, n, midi, this.params.steal);
    const v = this._voices[idx];
    if (v.note != null) this._stopSource(v, true);

    v.note = midi;
    v.order = ++this._order;

    const ctx = this.audioEngine.context;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = !!this.params.loop;
    const rootFreq = AudioEngine.midiToFreq(this.params.rootKey);
    const noteFreq = AudioEngine.midiToFreq(midi);
    let rate = noteFreq / rootFreq;
    rate *= Math.pow(2, (this.params.detune || 0) / 1200);
    src.playbackRate.value = Math.max(0.05, Math.min(8, rate));
    src.connect(v.filter);
    try {
      src.start();
    } catch (e) {}
    v.source = src;
    src.onended = () => {
      if (v.source === src) v.source = null;
    };

    triggerEnv(v.amp.gain, true, velocity, this.params, ctx);
    this._renderLeds();
  }

  noteOff(midi) {
    if (!this._voices.length) return;
    const idx = findVoiceByNote(this._voices, this.params.numVoices || 4, midi);
    if (idx < 0) return;
    this._releaseVoice(this._voices[idx]);
    this._renderLeds();
  }

  _releaseVoice(v) {
    if (!v) return;
    triggerEnv(v.amp.gain, false, 0, this.params, this.audioEngine.context);
    v.note = null;
    const src = v.source;
    if (src && !this.params.loop) {
      const rel = Math.max(0.05, this.params.release || 0.3);
      setTimeout(() => this._stopSource(v, false, src), rel * 1000 + 50);
    }
  }

  _stopSource(v, immediate, srcRef) {
    const src = srcRef || v.source;
    if (!src) return;
    try {
      if (immediate) src.stop();
      else src.stop();
      src.disconnect();
    } catch (e) {}
    if (v.source === src) v.source = null;
  }

  applyParams() {
    if (!this.audioEngine.context || !this._voices.length) return;
    const t = this.audioEngine.context.currentTime;
    if (this.outGain) this.outGain.gain.setValueAtTime(this.params.gain, t);
    let cut = this.params.cutoff;
    if (this.getPort('cutoff').connections.length && this.cutoffConst) {
      const cv = this.cutoffConst.offset.value;
      if (cv > 20) cut = Math.max(80, Math.min(16000, cv));
    }
    this._voices.forEach((v) => {
      try {
        v.filter.type = this.params.filterType;
        v.filter.frequency.setValueAtTime(cut, t);
        v.filter.Q.setValueAtTime(this.params.resonance, t);
      } catch (e) {}
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

  destroy() {
    if (this._onNote) window.removeEventListener('modsynth-note', this._onNote);
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp);
    if (typeof this._unsubMidi === 'function') try { this._unsubMidi(); } catch (e) {}
    this._voices.forEach((v) => {
      this._stopSource(v, true);
      try { v.filter.disconnect(); v.amp.disconnect(); } catch (e) {}
    });
    this._voices = [];
    if (this.bus) try { this.bus.disconnect(); } catch (e) {}
    if (this.outGain) try { this.outGain.disconnect(); } catch (e) {}
    super.destroy();
  }
}
