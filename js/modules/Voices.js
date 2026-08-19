import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';

const MAX_VOICES = 8;

/**
 * Voices – asignador polifónico (CV + Gate por voz).
 */
export class Voices extends Module {
  constructor(audioEngine, x, y) {
    super('voices', audioEngine, x, y);
    this.title = 'Voices';
    this.width = 230;
    this.params = {
      numVoices: 4,
      steal: 'oldest'
    };
    this.voices = [];
    this._order = 0;
    this._unsubMidi = null;
    this._onNote = null;

    for (let i = 0; i < MAX_VOICES; i++) {
      this.addPort('cv' + (i + 1), 'CV ' + (i + 1), 'cv', 'out');
      this.addPort('gate' + (i + 1), 'Gate ' + (i + 1), 'gate', 'out');
    }
  }

  renderBody() {
    let ports = '';
    for (let i = 1; i <= MAX_VOICES; i++) {
      ports +=
        '<div class="voice-row" data-voice-row="' + i + '">' +
        '<span class="voice-label">V' + i + '</span>' +
        '<div class="port output"><div class="port-socket cv" data-port="cv' + i + '"></div><span>CV</span></div>' +
        '<div class="port output"><div class="port-socket gate" data-port="gate' + i + '"></div><span>G</span></div>' +
        '<span class="voice-note" data-voice-note="' + i + '">-</span>' +
        '</div>';
    }

    return (
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
      '<div class="control">' +
      '<label>Steal</label>' +
      '<select data-param="steal">' +
      '<option value="oldest">Oldest</option>' +
      '<option value="highest">Highest</option>' +
      '<option value="lowest">Lowest</option>' +
      '</select>' +
      '</div>' +
      '<div class="voices-ports">' +
      ports +
      '</div>' +
      '<div class="voices-hint">Cada voz → VCO + ADSR + VCA. Notas desde Keyboard / MIDI.</div>'
    );
  }

  _bindControls() {
    const range = this.el.querySelector('[data-param="numVoices"]');
    if (range) {
      range.value = String(this.params.numVoices);
      range.addEventListener('input', (e) => {
        this.params.numVoices = parseInt(e.target.value, 10) || 1;
        const disp = this.el.querySelector('[data-display="numVoices"]');
        if (disp) disp.textContent = String(this.params.numVoices);
        this._updateVoiceVisibility();
        this._releaseUnusedVoices();
      });
    }

    const steal = this.el.querySelector('[data-param="steal"]');
    if (steal) {
      steal.value = this.params.steal || 'oldest';
      steal.addEventListener('change', (e) => {
        this.params.steal = e.target.value;
      });
    }

    this._onNote = (e) => {
      const detail = (e && e.detail) || {};
      const note = detail.note;
      if (note == null) return;
      if (detail.on) this.noteOn(note, detail.velocity != null ? detail.velocity : 1);
      else this.noteOff(note);
    };
    window.addEventListener('modsynth-note', this._onNote);

    // MIDI opcional (sin romper si aún no existe modularSynth)
    this._trySubscribeMidi();

    this._updateVoiceVisibility();
  }

  _trySubscribeMidi() {
    try {
      const midi =
        (window.modularSynth && window.modularSynth.midi) ||
        null;
      if (!midi || typeof midi.on !== 'function') return;
      if (this._unsubMidi) return;
      this._unsubMidi = midi.on((type, data) => {
        if (type === 'noteon') this.noteOn(data.note, data.velocity);
        else if (type === 'noteoff') this.noteOff(data.note);
      });
    } catch (err) {
      console.warn('[Voices] MIDI subscribe:', err);
    }
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.voices = [];
    for (let i = 0; i < MAX_VOICES; i++) {
      const freqNode = this.audioEngine.createConstant(0);
      const gateNode = this.audioEngine.createConstant(0);
      const cvPort = this.getPort('cv' + (i + 1));
      const gatePort = this.getPort('gate' + (i + 1));
      if (cvPort) cvPort.node = freqNode;
      if (gatePort) gatePort.node = gateNode;
      this.voices.push({
        note: null,
        order: 0,
        velocity: 1,
        freqNode: freqNode,
        gateNode: gateNode
      });
    }

    // Por si se creó el módulo antes de exponer modularSynth
    this._trySubscribeMidi();
  }

  noteOn(midi, velocity) {
    if (velocity == null) velocity = 1;
    if (!this.voices || !this.voices.length) return;
    if (!this.audioEngine.context) return;

    const n = Math.max(1, Math.min(MAX_VOICES, this.params.numVoices || 1));

    let idx = -1;
    for (let i = 0; i < n; i++) {
      if (this.voices[i].note === midi) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      for (let i = 0; i < n; i++) {
        if (this.voices[i].note == null) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) idx = this._stealIndex(n);

    const v = this.voices[idx];
    v.note = midi;
    v.order = ++this._order;
    v.velocity = velocity;

    const t = this.audioEngine.context.currentTime;
    const freq = AudioEngine.midiToFreq(midi);
    v.freqNode.offset.setValueAtTime(freq, t);
    v.gateNode.offset.setValueAtTime(Math.max(0.01, velocity), t);
    this._notifyGate(idx, true, velocity);
    this._updateVoiceLabels();
  }

  noteOff(midi) {
    if (!this.voices || !this.voices.length) return;
    if (!this.audioEngine.context) return;

    const n = Math.max(1, Math.min(MAX_VOICES, this.params.numVoices || 1));
    let idx = -1;
    for (let i = 0; i < n; i++) {
      if (this.voices[i].note === midi) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;

    const v = this.voices[idx];
    v.note = null;
    const t = this.audioEngine.context.currentTime;
    v.gateNode.offset.setValueAtTime(0, t);
    this._notifyGate(idx, false);
    this._updateVoiceLabels();
  }

  _stealIndex(n) {
    const active = [];
    for (let i = 0; i < n; i++) {
      if (this.voices[i].note != null) active.push({ v: this.voices[i], i: i });
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

  _notifyGate(voiceIndex, on, velocity) {
    if (velocity == null) velocity = 1;
    const port = this.getPort('gate' + (voiceIndex + 1));
    if (!port || !port.connections) return;
    port.connections.forEach((wire) => {
      const target = wire.to && wire.to.module;
      if (
        target &&
        (target.type === 'adsr' || target.type === 'sample' || target.type === 'la' || target.type === 'granular' || target.type === 'dx7') &&
        typeof target.trigger === 'function'
      ) {
        target.trigger(on, velocity);
      }
    });
  }

  _updateVoiceVisibility() {
    if (!this.el) return;
    const n = this.params.numVoices || 1;
    this.el.querySelectorAll('[data-voice-row]').forEach((row) => {
      const i = parseInt(row.getAttribute('data-voice-row'), 10);
      row.style.display = i <= n ? 'flex' : 'none';
    });
  }

  _releaseUnusedVoices() {
    if (!this.voices || !this.voices.length) return;
    if (!this.audioEngine.context) return;
    const n = this.params.numVoices || 1;
    for (let i = n; i < MAX_VOICES; i++) {
      const v = this.voices[i];
      if (!v || v.note == null) continue;
      v.note = null;
      v.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
      this._notifyGate(i, false);
    }
    this._updateVoiceLabels();
  }

  _updateVoiceLabels() {
    if (!this.el) return;
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (let i = 0; i < MAX_VOICES; i++) {
      const el = this.el.querySelector('[data-voice-note="' + (i + 1) + '"]');
      if (!el) continue;
      const v = this.voices && this.voices[i];
      if (!v || v.note == null) {
        el.textContent = '-';
        el.classList.remove('active');
      } else {
        el.textContent = names[v.note % 12] + (Math.floor(v.note / 12) - 1);
        el.classList.add('active');
      }
    }
  }

  destroy() {
    if (this._onNote) {
      window.removeEventListener('modsynth-note', this._onNote);
    }
    if (typeof this._unsubMidi === 'function') {
      try {
        this._unsubMidi();
      } catch (e) {}
    }
    if (this.voices) {
      this.voices.forEach((v) => {
        if (v.freqNode) {
          try {
            v.freqNode.disconnect();
          } catch (e) {}
        }
        if (v.gateNode) {
          try {
            v.gateNode.disconnect();
          } catch (e) {}
        }
      });
    }
    super.destroy();
  }
}
