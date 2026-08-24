import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';

const MAX_VOICES = 8;

/**
 * PolySynth – sintetizador sustractivo polifónico (hasta 8 voces).
 * Cada voz: Oscillator → BiquadFilter → Gain (ADSR) → bus.
 * Notas: MIDI, evento modsynth-note (Keyboard) y teclado PC opcional.
 */
export class PolySynth extends Module {
  constructor(audioEngine, x, y) {
    super('polysynth', audioEngine, x, y);
    this.title = 'PolySynth';
    this.width = 220;
    this.params = {
      numVoices: 6,
      waveform: 'sawtooth',
      cutoff: 3200,
      Q: 2,
      attack: 0.01,
      decay: 0.2,
      sustain: 0.65,
      release: 0.35,
      gain: 0.35,
      steal: 'oldest',
      pcKeys: true,
      unison: 1, // 1 = off, 2–3 = detuned copies (costly)
      detune: 8 // cents between unison voices
    };
    this._voices = [];
    this._order = 0;
    this._pcDown = new Map();
    this._onNote = null;
    this._unsubMidi = null;

    this.addPort('cutoff', 'Cutoff CV', 'cv', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="cutoff"></div><span>Cut CV</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<label>Voces <span class="value-display" data-display="numVoices">' +
      this.params.numVoices +
      '</span></label>' +
      '<input type="range" data-param="numVoices" min="1" max="' +
      MAX_VOICES +
      '" step="1" value="' +
      this.params.numVoices +
      '" />' +
      '</div>' +
      '<div class="control"><label>Wave</label>' +
      '<select data-param="waveform">' +
      '<option value="sawtooth">Saw</option>' +
      '<option value="square">Square</option>' +
      '<option value="triangle">Triangle</option>' +
      '<option value="sine">Sine</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label>Cutoff <span class="value-display" data-display="cutoff">3200</span></label>' +
      '<input type="range" data-param="cutoff" min="80" max="12000" step="1" value="3200" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Res <span class="value-display" data-display="Q">2.0</span></label>' +
      '<input type="range" data-param="Q" min="0.1" max="18" step="0.1" value="2" />' +
      '</div>' +
      '<div class="control">' +
      '<label>A <span class="value-display" data-display="attack">0.01</span></label>' +
      '<input type="range" data-param="attack" min="0.001" max="2" step="0.001" value="0.01" />' +
      '</div>' +
      '<div class="control">' +
      '<label>D <span class="value-display" data-display="decay">0.20</span></label>' +
      '<input type="range" data-param="decay" min="0.001" max="2" step="0.001" value="0.2" />' +
      '</div>' +
      '<div class="control">' +
      '<label>S <span class="value-display" data-display="sustain">0.65</span></label>' +
      '<input type="range" data-param="sustain" min="0" max="1" step="0.01" value="0.65" />' +
      '</div>' +
      '<div class="control">' +
      '<label>R <span class="value-display" data-display="release">0.35</span></label>' +
      '<input type="range" data-param="release" min="0.01" max="3" step="0.01" value="0.35" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Level <span class="value-display" data-display="gain">0.35</span></label>' +
      '<input type="range" data-param="gain" min="0" max="1" step="0.01" value="0.35" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Unison <span class="value-display" data-display="unison">1</span></label>' +
      '<input type="range" data-param="unison" min="1" max="3" step="1" value="1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Detune <span class="value-display" data-display="detune">8</span> ct</label>' +
      '<input type="range" data-param="detune" min="0" max="50" step="1" value="8" />' +
      '</div>' +
      '<div class="control"><label>Steal</label>' +
      '<select data-param="steal">' +
      '<option value="oldest">Oldest</option>' +
      '<option value="highest">Highest</option>' +
      '<option value="lowest">Lowest</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label class="kb-check"><input type="checkbox" data-param="pcKeys" checked /> Teclado PC</label>' +
      '</div>' +
      '<div class="ps-voices" data-ps-leds></div>' +
      '<div class="ps-hint">MIDI · Keyboard · Z–/ Q–I · max ' +
      MAX_VOICES +
      ' voces</div>'
    );
  }

  _bindControls() {
    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const p = input.dataset.param;
      input.value = this.params[p];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[p] =
          p === 'numVoices' || p === 'unison' || p === 'detune'
            ? parseInt(e.target.value, 10)
            : val;
        const d = this.el.querySelector('[data-display="' + p + '"]');
        if (d) {
          if (p === 'numVoices' || p === 'unison' || p === 'detune') d.textContent = String(Math.round(this.params[p]));
          else if (p === 'cutoff') d.textContent = String(Math.round(val));
          else d.textContent = val < 10 ? val.toFixed(2) : String(Math.round(val));
        }
        this.applyParams();
        if (p === 'numVoices') this._releaseBeyond();
        if (p === 'unison' || p === 'detune') this._applyUnisonDetune();
      });
    });

    this.el.querySelectorAll('select[data-param]').forEach((sel) => {
      const p = sel.dataset.param;
      sel.value = this.params[p];
      sel.addEventListener('change', (e) => {
        this.params[p] = e.target.value;
        this.applyParams();
      });
    });

    const pc = this.el.querySelector('[data-param="pcKeys"]');
    if (pc) {
      pc.checked = !!this.params.pcKeys;
      pc.addEventListener('change', (e) => {
        this.params.pcKeys = e.target.checked;
      });
    }

    this._keyMap = {
      z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59,
      ',': 60, l: 61, '.': 62, ';': 63, '/': 64,
      q: 60, '2': 61, w: 62, '3': 63, e: 64, r: 65, '5': 66, t: 67, '6': 68, y: 69, '7': 70, u: 71, i: 72
    };

    this._onKeyDown = (e) => {
      if (!this.params.pcKeys) return;
      if (e.repeat) return;
      if (e.target && e.target.matches && e.target.matches('input, select, textarea, button')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const midi = this._keyMap[k];
      if (midi === undefined) return;
      e.preventDefault();
      this._pcDown.set(k, midi);
      this.noteOn(midi, 1);
    };
    this._onKeyUp = (e) => {
      if (!this.params.pcKeys) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this._pcDown.has(k)) return;
      const midi = this._pcDown.get(k);
      this._pcDown.delete(k);
      this.noteOff(midi);
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    this._onNote = (ev) => {
      const d = ev.detail || {};
      const note = d.note;
      if (note == null) return;
      if (d.on) this.noteOn(note, d.velocity != null ? d.velocity : 1);
      else this.noteOff(note);
    };
    window.addEventListener('modsynth-note', this._onNote);

    this._renderLeds();
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.gain;
    this.bus.connect(this.outGain);

    this.cutoffConst = this.audioEngine.createConstant(this.params.cutoff);
    this.getPort('out').node = this.outGain;
    this.getPort('cutoff').node = this.cutoffConst;

    this._voices = [];
    for (let i = 0; i < MAX_VOICES; i++) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = this.params.cutoff;
      filter.Q.value = this.params.Q;
      const amp = ctx.createGain();
      amp.gain.value = 0;
      filter.connect(amp);
      amp.connect(this.bus);

      // Hasta 3 osciladores por voz (unison)
      const oscs = [];
      const oscGains = [];
      for (let u = 0; u < 3; u++) {
        const osc = ctx.createOscillator();
        osc.type = this.params.waveform;
        osc.frequency.value = 440;
        osc.detune.value = 0;
        const og = ctx.createGain();
        og.gain.value = u === 0 ? 1 : 0;
        osc.connect(og);
        og.connect(filter);
        osc.start();
        oscs.push(osc);
        oscGains.push(og);
      }

      this._voices.push({
        oscs,
        oscGains,
        filter,
        amp,
        note: null,
        order: 0,
        velocity: 1
      });
    }
    this._applyUnisonDetune();

    this.applyParams();
    this._timer = setInterval(() => this._syncCutoffCv(), 40);
    this._trySubscribeMidi();
    setTimeout(() => this._trySubscribeMidi(), 500);
  }

  _trySubscribeMidi() {
    try {
      if (this._unsubMidi) return;
      const midi = (window.modularSynth && window.modularSynth.midi) || null;
      if (!midi || typeof midi.on !== 'function') return;
      this._unsubMidi = midi.on((type, data) => {
        if (type === 'noteon') {
          const vel = data.velocity != null ? data.velocity : 1;
          this.noteOn(data.note, Math.max(0.05, Math.min(1, vel)));
        } else if (type === 'noteoff') {
          this.noteOff(data.note);
        }
      });
    } catch (err) {
      console.warn('[PolySynth] MIDI:', err);
    }
  }

  _syncCutoffCv() {
    if (!this._voices.length || !this.audioEngine.context) return;
    let cut = this.params.cutoff;
    if (this.getPort('cutoff').connections.length && this.cutoffConst) {
      const cv = this.cutoffConst.offset.value;
      if (cv > 20) cut = Math.max(80, Math.min(12000, cv));
      else if (cv >= 0 && cv <= 1) cut = 80 + cv * 11920;
    }
    const t = this.audioEngine.context.currentTime;
    this._voices.forEach((v) => {
      try {
        v.filter.frequency.setValueAtTime(cut, t);
      } catch (e) {}
    });
  }

  /** Cents offsets for unison count */
  _unisonOffsets() {
    const n = Math.max(1, Math.min(3, this.params.unison | 0 || 1));
    const d = this.params.detune || 0;
    if (n === 1) return [0];
    if (n === 2) return [-d / 2, d / 2];
    return [-d, 0, d];
  }

  _applyUnisonDetune() {
    if (!this._voices.length || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    const offsets = this._unisonOffsets();
    const n = offsets.length;
    // Nivel por osc para no disparar el volumen con unison
    const level = 1 / Math.sqrt(n);
    this._voices.forEach((v) => {
      for (let u = 0; u < 3; u++) {
        try {
          if (u < n) {
            v.oscGains[u].gain.setValueAtTime(level, t);
            v.oscs[u].detune.setValueAtTime(offsets[u], t);
          } else {
            v.oscGains[u].gain.setValueAtTime(0, t);
            v.oscs[u].detune.setValueAtTime(0, t);
          }
        } catch (e) {}
      }
    });
  }

  applyParams() {
    if (!this._voices.length || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    if (this.outGain) this.outGain.gain.setValueAtTime(this.params.gain, t);
    this._voices.forEach((v) => {
      try {
        v.oscs.forEach((osc) => {
          osc.type = this.params.waveform;
        });
        v.filter.Q.setValueAtTime(this.params.Q, t);
        if (!this.getPort('cutoff').connections.length) {
          v.filter.frequency.setValueAtTime(this.params.cutoff, t);
        }
      } catch (e) {}
    });
    this._applyUnisonDetune();
  }

  noteOn(midi, velocity) {
    if (velocity == null) velocity = 1;
    if (!this._voices.length || !this.audioEngine.context) return;

    const n = Math.max(1, Math.min(MAX_VOICES, this.params.numVoices || 1));
    let idx = -1;

    for (let i = 0; i < n; i++) {
      if (this._voices[i].note === midi) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      for (let i = 0; i < n; i++) {
        if (this._voices[i].note == null) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) idx = this._stealIndex(n);

    const v = this._voices[idx];
    // Si robamos, soltar EG rápido
    if (v.note != null && v.note !== midi) {
      this._releaseVoice(v, true);
    }

    v.note = midi;
    v.order = ++this._order;
    v.velocity = Math.max(0.05, Math.min(1, velocity));

    const t = this.audioEngine.context.currentTime;
    const freq = AudioEngine.midiToFreq(midi);
    try {
      v.oscs.forEach((osc) => {
        osc.frequency.setValueAtTime(freq, t);
      });
    } catch (e) {}
    this._applyUnisonDetune();

    const peak = v.velocity;
    const { attack, decay, sustain } = this.params;
    const g = v.amp.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0, g.value), t);
    g.linearRampToValueAtTime(peak, t + Math.max(0.001, attack));
    g.linearRampToValueAtTime(peak * sustain, t + Math.max(0.001, attack) + Math.max(0.001, decay));

    this._renderLeds();
  }

  noteOff(midi) {
    if (!this._voices.length || !this.audioEngine.context) return;
    const n = Math.max(1, Math.min(MAX_VOICES, this.params.numVoices || 1));
    for (let i = 0; i < n; i++) {
      if (this._voices[i].note === midi) {
        this._releaseVoice(this._voices[i], false);
        this._voices[i].note = null;
      }
    }
    this._renderLeds();
  }

  _releaseVoice(v, fast) {
    if (!v || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    const rel = fast ? 0.02 : Math.max(0.01, this.params.release);
    const g = v.amp.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0, g.value), t);
    g.linearRampToValueAtTime(0, t + rel);
  }

  _stealIndex(n) {
    const active = [];
    for (let i = 0; i < n; i++) {
      if (this._voices[i].note != null) active.push({ v: this._voices[i], i });
    }
    if (!active.length) return 0;
    if (this.params.steal === 'highest') {
      active.sort((a, b) => b.v.note - a.v.note);
      return active[0].i;
    }
    if (this.params.steal === 'lowest') {
      active.sort((a, b) => a.v.note - b.v.note);
      return active[0].i;
    }
    active.sort((a, b) => a.v.order - b.v.order);
    return active[0].i;
  }

  _releaseBeyond() {
    const n = Math.max(1, Math.min(MAX_VOICES, this.params.numVoices || 1));
    for (let i = n; i < MAX_VOICES; i++) {
      if (this._voices[i] && this._voices[i].note != null) {
        this._releaseVoice(this._voices[i], true);
        this._voices[i].note = null;
      }
    }
    this._renderLeds();
  }

  _renderLeds() {
    const host = this.el && this.el.querySelector('[data-ps-leds]');
    if (!host) return;
    const n = Math.max(1, Math.min(MAX_VOICES, this.params.numVoices || 1));
    let html = '';
    for (let i = 0; i < n; i++) {
      const on = this._voices[i] && this._voices[i].note != null;
      html +=
        '<span class="ps-led' +
        (on ? ' on' : '') +
        '" title="V' +
        (i + 1) +
        '">' +
        (i + 1) +
        '</span>';
    }
    host.innerHTML = html;
  }

  destroy() {
    if (this._timer) clearInterval(this._timer);
    if (this._onNote) window.removeEventListener('modsynth-note', this._onNote);
    if (this._onKeyDown) window.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) window.removeEventListener('keyup', this._onKeyUp);
    if (typeof this._unsubMidi === 'function') {
      try {
        this._unsubMidi();
      } catch (e) {}
    }
    this._voices.forEach((v) => {
      try {
        (v.oscs || []).forEach((osc) => {
          try {
            osc.stop();
            osc.disconnect();
          } catch (e2) {}
        });
        (v.oscGains || []).forEach((g) => {
          try {
            g.disconnect();
          } catch (e2) {}
        });
        v.filter.disconnect();
        v.amp.disconnect();
      } catch (e) {}
    });
    this._voices = [];
    if (this.bus) try { this.bus.disconnect(); } catch (e) {}
    if (this.outGain) try { this.outGain.disconnect(); } catch (e) {}
    if (this.cutoffConst) try { this.cutoffConst.disconnect(); } catch (e) {}
    super.destroy();
  }
}
