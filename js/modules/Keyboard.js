import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';

/** 4 octavas: C2 (36) → C6 (84) */
function buildNotes(startMidi = 36, octaves = 4) {
  const notes = [];
  const labels = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const blacks = new Set([1, 3, 6, 8, 10]);
  const count = octaves * 12 + 1;
  for (let i = 0; i < count; i++) {
    const midi = startMidi + i;
    const deg = midi % 12;
    notes.push({
      note: midi,
      label: labels[deg] + Math.floor(midi / 12 - 1),
      black: blacks.has(deg)
    });
  }
  return notes;
}

export class Keyboard extends Module {
  constructor(audioEngine, x, y) {
    super('keyboard', audioEngine, x, y);
    this.title = 'Keyboard';
    this.width = 520;
    this.params = {
      octave: 0,
      hold: false,
      pcKeys: true
    };
    this.activeNotes = new Set();
    this.notes = buildNotes(36, 4);
    /** @type {Map<string, number>} teclas PC actualmente bajadas */
    this._pcDown = new Map();

    this.addPort('cv', 'CV', 'cv', 'out');
    this.addPort('gate', 'Gate', 'gate', 'out');
  }

  renderBody() {
    let keysHtml = '';
    this.notes.forEach((n) => {
      keysHtml += `<div class="key ${n.black ? 'black' : ''}" data-note="${n.note}" title="${n.label}"></div>`;
    });

    return `
      <div class="ports-row">
        <div class="ports-col"></div>
        <div class="ports-col">
          <div class="port output"><div class="port-socket cv" data-port="cv"></div><span>CV</span></div>
          <div class="port output"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>
        </div>
      </div>
      <div class="keyboard-keys keyboard-4oct">${keysHtml}</div>
      <div class="control" style="margin-top:6px">
        <label>Transpose <span class="value-display" data-display="octave">0</span></label>
        <input type="range" data-param="octave" min="-2" max="2" step="1" value="0" />
      </div>
      <div class="keyboard-opts">
        <label class="kb-check"><input type="checkbox" data-param="hold" /> HOLD</label>
        <label class="kb-check"><input type="checkbox" data-param="pcKeys" checked /> Teclado PC</label>
        <button type="button" class="btn" data-action="panic" title="Soltar todas las notas">Panic</button>
      </div>
      <div class="kb-hint">Z–/ y Q–I = notas · HOLD mantiene el Gate</div>
    `;
  }

  _bindControls() {
    const octaveInput = this.el.querySelector('[data-param="octave"]');
    octaveInput.addEventListener('input', (e) => {
      this.params.octave = parseInt(e.target.value, 10);
      this.el.querySelector('[data-display="octave"]').textContent = this.params.octave;
    });

    const holdCb = this.el.querySelector('[data-param="hold"]');
    holdCb.checked = !!this.params.hold;
    holdCb.addEventListener('change', (e) => {
      this.params.hold = e.target.checked;
      if (!this.params.hold) {
        // Al soltar HOLD, liberar notas que ya no están físicamente pulsadas
        this._releaseIfIdle();
      }
    });

    const pcCb = this.el.querySelector('[data-param="pcKeys"]');
    pcCb.checked = this.params.pcKeys !== false;
    pcCb.addEventListener('change', (e) => {
      this.params.pcKeys = e.target.checked;
      if (!this.params.pcKeys) {
        this._pcDown.clear();
        if (!this.params.hold) this.allNotesOff();
      }
    });

    this.el.querySelector('[data-action="panic"]').addEventListener('click', () => {
      this.allNotesOff();
    });

    this.el.querySelectorAll('.key').forEach((key) => {
      const note = parseInt(key.dataset.note, 10);
      key.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.noteOn(note, 1, { absolute: true });
      });
      key.addEventListener('mouseup', () => {
        if (!this.params.hold) this.noteOff(note, { absolute: true });
      });
      key.addEventListener('mouseleave', () => {
        if (this.params.hold) return;
        const midi = note + this.params.octave * 12;
        if (this.activeNotes.has(midi)) this.noteOff(note, { absolute: true });
      });
    });

    // Mapa PC → MIDI (dos filas)
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
      this.noteOn(midi, 1, { absolute: true });
    };

    this._onKeyUp = (e) => {
      if (!this.params.pcKeys) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this._pcDown.has(k)) return;
      this._pcDown.delete(k);
      if (!this.params.hold) {
        const midi = this._keyMap[k];
        if (midi !== undefined) this.noteOff(midi, { absolute: true });
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;
    this.freqNode = this.audioEngine.createConstant(220);
    this.gateNode = this.audioEngine.createConstant(0);
    this.getPort('cv').node = this.freqNode;
    this.getPort('gate').node = this.gateNode;
  }

  noteOn(midiNote, velocity = 1, opts = {}) {
    if (!this.freqNode || !this.gateNode) return;

    const midi = midiNote + this.params.octave * 12;
    this.activeNotes.add(midi);
    this.lastVelocity = velocity;

    const freq = AudioEngine.midiToFreq(midi);
    const t = this.audioEngine.context.currentTime;
    this.freqNode.offset.setValueAtTime(freq, t);
    this.gateNode.offset.setValueAtTime(Math.max(0.01, velocity), t);

    this._notifyGate(true, velocity);
    this._highlightKey(midiNote, true);
    this._broadcastNote(midi, true, velocity);
  }

  noteOff(midiNote, opts = {}) {
    if (!this.gateNode) return;
    if (this.params.hold) return; // HOLD: no apaga hasta Panic o desactivar HOLD

    const midi = midiNote + this.params.octave * 12;
    this.activeNotes.delete(midi);
    this._highlightKey(midiNote, false);
    this._broadcastNote(midi, false, 0);

    if (this.activeNotes.size === 0) {
      const t = this.audioEngine.context.currentTime;
      this.gateNode.offset.setValueAtTime(0, t);
      this._notifyGate(false);
    } else {
      // Última nota aún activa (mono): actualizar CV a una nota restante
      const last = [...this.activeNotes].pop();
      const t = this.audioEngine.context.currentTime;
      this.freqNode.offset.setValueAtTime(AudioEngine.midiToFreq(last), t);
    }
  }

  allNotesOff() {
    const notes = [...this.activeNotes];
    this.activeNotes.clear();
    this._pcDown.clear();
    this.el.querySelectorAll('.key.active').forEach((k) => k.classList.remove('active'));
    if (this.gateNode && this.audioEngine.context) {
      this.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
    }
    this._notifyGate(false);
    notes.forEach((m) => this._broadcastNote(m, false, 0));
  }

  _releaseIfIdle() {
    // Si HOLD se desactiva y no hay teclas PC abajo, soltar todo
    if (this._pcDown.size === 0) {
      this.allNotesOff();
    }
  }

  _broadcastNote(note, on, velocity) {
    window.dispatchEvent(
      new CustomEvent('modsynth-note', { detail: { note, on, velocity } })
    );
    if (window.modularSynth && window.modularSynth.patch) {
      window.modularSynth.patch.modules.forEach((mod) => {
        if (mod.type === 'arp') {
          if (on) mod.noteOn(note, velocity);
          else mod.noteOff(note);
        }
      });
    }
  }

  _highlightKey(midiNote, on) {
    if (!this.el) return;
    const key = this.el.querySelector(`.key[data-note="${midiNote}"]`);
    if (key) key.classList.toggle('active', on);
  }

  _notifyGate(on, velocity = 1) {
    this.getPort('gate').connections.forEach((wire) => {
      const targetMod = wire.to.module;
      if (
        (targetMod.type === 'adsr' || targetMod.type === 'sample' || targetMod.type === 'la' || targetMod.type === 'granular' || targetMod.type === 'dx7' || targetMod.type === 'dx7') &&
        typeof targetMod.trigger === 'function'
      ) {
        targetMod.trigger(on, velocity);
      }
    });
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this.freqNode) this.freqNode.disconnect();
    if (this.gateNode) this.gateNode.disconnect();
    super.destroy();
  }
}
