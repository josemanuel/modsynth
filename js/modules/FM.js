import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';
import {
  MAX_POLY,
  allocateVoice,
  findVoiceByNote,
  triggerEnv
} from '../core/VoiceAllocator.js';

/**
 * FM polifónico – carrier + 1 modulador por voz.
 */
export class FM extends Module {
  constructor(audioEngine, x, y) {
    super('fm', audioEngine, x, y);
    this.title = 'FM';
    this.width = 210;
    this.params = {
      frequency: 220,
      ratio: 2,
      index: 100,
      carrierWave: 'sine',
      modWave: 'sine',
      numVoices: 4,
      steal: 'oldest',
      attack: 0.01,
      decay: 0.15,
      sustain: 0.7,
      release: 0.3,
      level: 0.35,
      pcKeys: false
    };
    this._voices = [];
    this._order = 0;
    this._pcDown = new Map();
    this._onNote = null;
    this._unsubMidi = null;

    this.addPort('freq', 'Freq CV', 'cv', 'in');
    this.addPort('mod', 'Mod CV', 'cv', 'in');
    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="freq"></div><span>Freq</span></div>' +
      '<div class="port input"><div class="port-socket cv" data-port="mod"></div><span>Index</span></div>' +
      '<div class="port input"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<label>Voces <span class="value-display" data-display="numVoices">4</span></label>' +
      '<input type="range" data-param="numVoices" min="1" max="' + MAX_POLY + '" step="1" value="4" />' +
      '</div>' +
      '<div class="control"><label>Carrier</label>' +
      '<select data-param="carrierWave">' +
      '<option value="sine">Sine</option><option value="triangle">Tri</option>' +
      '<option value="square">Square</option><option value="sawtooth">Saw</option>' +
      '</select></div>' +
      '<div class="control"><label>Modulator</label>' +
      '<select data-param="modWave">' +
      '<option value="sine">Sine</option><option value="triangle">Tri</option>' +
      '<option value="square">Square</option><option value="sawtooth">Saw</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label>Freq <span class="value-display" data-display="frequency">220 Hz</span></label>' +
      '<input type="range" data-param="frequency" min="20" max="2000" step="1" value="220" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Ratio <span class="value-display" data-display="ratio">2.00</span></label>' +
      '<input type="range" data-param="ratio" min="0.25" max="16" step="0.01" value="2" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Index <span class="value-display" data-display="index">100</span></label>' +
      '<input type="range" data-param="index" min="0" max="800" step="1" value="100" />' +
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
      '<label>Level <span class="value-display" data-display="level">0.35</span></label>' +
      '<input type="range" data-param="level" min="0" max="1" step="0.01" value="0.35" />' +
      '</div>' +
      '<div class="control"><label>Steal</label>' +
      '<select data-param="steal">' +
      '<option value="oldest">Oldest</option><option value="highest">Highest</option><option value="lowest">Lowest</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label class="kb-check"><input type="checkbox" data-param="pcKeys" /> Teclado PC</label>' +
      '</div>' +
      '<div class="ps-voices" data-poly-leds></div>'
    );
  }

  _bindControls() {
    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const p = input.dataset.param;
      input.value = this.params[p];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[p] = p === 'numVoices' ? parseInt(e.target.value, 10) : val;
        const d = this.el.querySelector('[data-display="' + p + '"]');
        if (d) {
          if (p === 'frequency') d.textContent = Math.round(val) + ' Hz';
          else if (p === 'numVoices') d.textContent = String(this.params.numVoices);
          else d.textContent = val < 10 && p !== 'index' ? val.toFixed(2) : String(Math.round(val * 100) / 100);
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
    const pc = this.el.querySelector('[data-param="pcKeys"]');
    if (pc) {
      pc.checked = !!this.params.pcKeys;
      pc.addEventListener('change', (e) => { this.params.pcKeys = e.target.checked; });
    }

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

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.bus = ctx.createGain();
    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.level;
    this.bus.connect(this.outGain);

    this.indexConst = this.audioEngine.createConstant(1);
    this.freqConst = this.audioEngine.createConstant(this.params.frequency);
    this.gateNode = this.audioEngine.createConstant(0);

    this.getPort('out').node = this.outGain;
    this.getPort('freq').node = this.freqConst;
    this.getPort('mod').node = this.indexConst;
    this.getPort('gate').node = this.gateNode;

    this._voices = [];
    for (let i = 0; i < MAX_POLY; i++) {
      const modOsc = ctx.createOscillator();
      modOsc.type = this.params.modWave;
      const modGain = ctx.createGain();
      modGain.gain.value = this.params.index;
      const carrier = ctx.createOscillator();
      carrier.type = this.params.carrierWave;
      carrier.frequency.value = this.params.frequency;
      const amp = ctx.createGain();
      amp.gain.value = 0;
      modOsc.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(amp);
      amp.connect(this.bus);
      modOsc.start();
      carrier.start();
      this._voices.push({ modOsc, modGain, carrier, amp, note: null, order: 0 });
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
      let f = this.params.frequency;
      if (this.getPort('freq').connections.length && this.freqConst) {
        const cv = this.freqConst.offset.value;
        if (cv > 20) f = cv;
      }
      const midi = Math.round(69 + 12 * Math.log2(Math.max(20, f) / 440));
      this.noteOn(midi, velocity);
    } else {
      this._voices.forEach((v) => {
        if (v.note != null) {
          triggerEnv(v.amp.gain, false, 0, this.params, this.audioEngine.context);
          v.note = null;
        }
      });
      this._renderLeds();
    }
  }

  noteOn(midi, velocity = 1) {
    if (!this._voices.length || !this.audioEngine.context) return;
    const n = this.params.numVoices || 4;
    const idx = allocateVoice(this._voices, n, midi, this.params.steal);
    const v = this._voices[idx];
    if (v.note != null && v.note !== midi) {
      triggerEnv(v.amp.gain, false, 0, this.params, this.audioEngine.context, true);
    }
    v.note = midi;
    v.order = ++this._order;
    const freq = AudioEngine.midiToFreq(midi);
    const t = this.audioEngine.context.currentTime;
    try {
      v.carrier.frequency.setValueAtTime(freq, t);
      v.modOsc.frequency.setValueAtTime(freq * this.params.ratio, t);
      v.modGain.gain.setValueAtTime(this.params.index, t);
    } catch (e) {}
    triggerEnv(v.amp.gain, true, velocity, this.params, this.audioEngine.context);
    this._renderLeds();
  }

  noteOff(midi) {
    if (!this._voices.length || !this.audioEngine.context) return;
    const idx = findVoiceByNote(this._voices, this.params.numVoices || 4, midi);
    if (idx < 0) return;
    triggerEnv(this._voices[idx].amp.gain, false, 0, this.params, this.audioEngine.context);
    this._voices[idx].note = null;
    this._renderLeds();
  }

  applyParams() {
    if (!this._voices.length || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    if (this.outGain) this.outGain.gain.setValueAtTime(this.params.level, t);
    this._voices.forEach((v) => {
      try {
        v.carrier.type = this.params.carrierWave;
        v.modOsc.type = this.params.modWave;
        if (v.note == null) {
          v.carrier.frequency.setValueAtTime(this.params.frequency, t);
          v.modOsc.frequency.setValueAtTime(this.params.frequency * this.params.ratio, t);
        } else {
          const freq = AudioEngine.midiToFreq(v.note);
          v.modOsc.frequency.setValueAtTime(freq * this.params.ratio, t);
          v.modGain.gain.setValueAtTime(this.params.index, t);
        }
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
      try {
        v.modOsc.stop(); v.carrier.stop();
        v.modOsc.disconnect(); v.carrier.disconnect();
        v.modGain.disconnect(); v.amp.disconnect();
      } catch (e) {}
    });
    this._voices = [];
    if (this.bus) try { this.bus.disconnect(); } catch (e) {}
    if (this.outGain) try { this.outGain.disconnect(); } catch (e) {}
    super.destroy();
  }
}
