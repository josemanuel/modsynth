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
      black: blacks.has(deg),
      deg
    });
  }
  return notes;
}

/** Intervalos en semitonos desde la tónica (modos diatónicos / griegos) */
const MODES = {
  chromatic: { name: 'Cromática', intervals: [0,1,2,3,4,5,6,7,8,9,10,11] },
  major:     { name: 'Mayor (Jónico)', intervals: [0,2,4,5,7,9,11] },
  minor:     { name: 'Menor (Eólico)', intervals: [0,2,3,5,7,8,10] },
  dorian:    { name: 'Dórico', intervals: [0,2,3,5,7,9,10] },
  phrygian:  { name: 'Frigio', intervals: [0,1,3,5,7,8,10] },
  lydian:    { name: 'Lidio', intervals: [0,2,4,6,7,9,11] },
  mixolydian:{ name: 'Mixolidio', intervals: [0,2,4,5,7,9,10] },
  locrian:   { name: 'Locrio', intervals: [0,1,3,5,6,8,10] },
  harmonic:  { name: 'Menor armónica', intervals: [0,2,3,5,7,8,11] },
  melodic:   { name: 'Menor melódica', intervals: [0,2,3,5,7,9,11] }
};

const ROOTS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export class Keyboard extends Module {
  constructor(audioEngine, x, y) {
    super('keyboard', audioEngine, x, y);
    this.title = 'Keyboard';
    this.width = 560;
    this.params = {
      octave: 0,
      hold: false,
      pcKeys: true,
      root: 0,       // 0=C … 11=B
      mode: 'chromatic',
      quantize: false // si true, solo permite notas del modo
    };
    this.activeNotes = new Set();
    this.notes = buildNotes(36, 4);
    this._pcDown = new Map();

    // Puertos a ambos lados (mismo nodo de audio compartido)
    this.addPort('cv', 'CV', 'cv', 'out');
    this.addPort('gate', 'Gate', 'gate', 'out');
    this.addPort('cv2', 'CV', 'cv', 'out');
    this.addPort('gate2', 'Gate', 'gate', 'out');
  }

  _scaleSet() {
    const mode = MODES[this.params.mode] || MODES.chromatic;
    const root = this.params.root | 0;
    return new Set(mode.intervals.map((i) => (root + i) % 12));
  }

  _isInScale(midi) {
    if (this.params.mode === 'chromatic') return true;
    return this._scaleSet().has(((midi % 12) + 12) % 12);
  }

  renderBody() {
    let keysHtml = '';
    this.notes.forEach((n) => {
      keysHtml +=
        '<div class="key ' +
        (n.black ? 'black' : '') +
        '" data-note="' +
        n.note +
        '" data-deg="' +
        n.deg +
        '" title="' +
        n.label +
        '"></div>';
    });

    let modeOpts = '';
    Object.keys(MODES).forEach((k) => {
      modeOpts +=
        '<option value="' +
        k +
        '"' +
        (k === this.params.mode ? ' selected' : '') +
        '>' +
        MODES[k].name +
        '</option>';
    });
    let rootOpts = '';
    ROOTS.forEach((r, i) => {
      rootOpts +=
        '<option value="' +
        i +
        '"' +
        (i === this.params.root ? ' selected' : '') +
        '>' +
        r +
        '</option>';
    });

    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket cv" data-port="cv"></div><span>CV</span></div>' +
      '<div class="port output"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket cv" data-port="cv2"></div><span>CV</span></div>' +
      '<div class="port output"><div class="port-socket gate" data-port="gate2"></div><span>Gate</span></div>' +
      '</div></div>' +
      '<div class="kb-scale-row">' +
      '<label>Tónica <select data-param="root">' +
      rootOpts +
      '</select></label>' +
      '<label>Modo <select data-param="mode">' +
      modeOpts +
      '</select></label>' +
      '<label class="kb-check"><input type="checkbox" data-param="quantize" /> Solo escala</label>' +
      '</div>' +
      '<div class="keyboard-keys keyboard-4oct">' +
      keysHtml +
      '</div>' +
      '<div class="control" style="margin-top:6px">' +
      '<label>Transpose <span class="value-display" data-display="octave">0</span></label>' +
      '<input type="range" data-param="octave" min="-2" max="2" step="1" value="0" />' +
      '</div>' +
      '<div class="keyboard-opts">' +
      '<label class="kb-check"><input type="checkbox" data-param="hold" /> HOLD</label>' +
      '<label class="kb-check"><input type="checkbox" data-param="pcKeys" checked /> Teclado PC</label>' +
      '<button type="button" class="btn" data-action="panic">Panic</button>' +
      '</div>' +
      '<div class="kb-hint">CV = Hz (A4=440) · 1V/oct vía f=440·2^((m-69)/12) · Z–/ Q–I</div>'
    );
  }

  _bindControls() {
    this._refreshScaleMarks();

    const octaveInput = this.el.querySelector('[data-param="octave"]');
    if (octaveInput) {
      octaveInput.value = this.params.octave;
      octaveInput.addEventListener('input', (e) => {
        this.params.octave = parseInt(e.target.value, 10);
        this.el.querySelector('[data-display="octave"]').textContent = String(this.params.octave);
      });
    }

    ['hold', 'pcKeys', 'quantize'].forEach((p) => {
      const el = this.el.querySelector('[data-param="' + p + '"]');
      if (!el) return;
      el.checked = !!this.params[p];
      el.addEventListener('change', (e) => {
        this.params[p] = e.target.checked;
        if (p === 'quantize') this._refreshScaleMarks();
      });
    });

    const rootSel = this.el.querySelector('[data-param="root"]');
    if (rootSel) {
      rootSel.value = String(this.params.root);
      rootSel.addEventListener('change', (e) => {
        this.params.root = parseInt(e.target.value, 10);
        this._refreshScaleMarks();
      });
    }
    const modeSel = this.el.querySelector('[data-param="mode"]');
    if (modeSel) {
      modeSel.value = this.params.mode;
      modeSel.addEventListener('change', (e) => {
        this.params.mode = e.target.value;
        this._refreshScaleMarks();
      });
    }

    this.el.querySelector('[data-action="panic"]')?.addEventListener('click', () => this.allNotesOff());

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

  _refreshScaleMarks() {
    if (!this.el) return;
    const set = this._scaleSet();
    const chromatic = this.params.mode === 'chromatic';
    this.el.querySelectorAll('.key').forEach((key) => {
      const deg = parseInt(key.dataset.deg, 10);
      key.classList.toggle('in-scale', !chromatic && set.has(deg));
      key.classList.toggle('out-scale', !chromatic && !set.has(deg));
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;
    // CV en Hz (A4 = 440). Con VCO base=0 al cablear → afinación correcta.
    this.freqNode = this.audioEngine.createConstant(440);
    this.gateNode = this.audioEngine.createConstant(0);
    this.getPort('cv').node = this.freqNode;
    this.getPort('cv2').node = this.freqNode;
    this.getPort('gate').node = this.gateNode;
    this.getPort('gate2').node = this.gateNode;
  }

  noteOn(midiNote, velocity = 1, opts = {}) {
    if (!this.freqNode || !this.gateNode) return;

    let midi = midiNote + this.params.octave * 12;
    if (this.params.quantize && !this._isInScale(midi)) {
      // snap a la nota de escala más cercana
      midi = this._snapToScale(midi);
    }

    this.activeNotes.add(midi);
    this.lastVelocity = velocity;

    const freq = AudioEngine.midiToFreq(midi);
    const t = this.audioEngine.context.currentTime;
    this.freqNode.offset.setValueAtTime(freq, t);
    this.gateNode.offset.setValueAtTime(Math.max(0.01, velocity), t);

    // Avisar a VCOs conectados para poner base en 0
    this._notifyFreqTargets();

    this._highlightKey(midiNote, true);
    this._notifyGate(true, velocity);
    this._broadcastNote(midi, true, velocity);
  }

  _snapToScale(midi) {
    const set = this._scaleSet();
    let best = midi;
    let bestD = 99;
    for (let d = -6; d <= 6; d++) {
      const n = midi + d;
      if (set.has(((n % 12) + 12) % 12) && Math.abs(d) < bestD) {
        best = n;
        bestD = Math.abs(d);
      }
    }
    return best;
  }

  noteOff(midiNote, opts = {}) {
    if (!this.freqNode || !this.gateNode) return;
    const midi = midiNote + this.params.octave * 12;
    this.activeNotes.delete(midi);
    this._highlightKey(midiNote, false);

    const t = this.audioEngine.context.currentTime;
    if (this.activeNotes.size === 0) {
      if (!this.params.hold) {
        this.gateNode.offset.setValueAtTime(0, t);
        this._notifyGate(false);
      }
    } else {
      const last = [...this.activeNotes].pop();
      this.freqNode.offset.setValueAtTime(AudioEngine.midiToFreq(last), t);
      this._notifyFreqTargets();
    }
    this._broadcastNote(midi, false, 0);
  }

  allNotesOff() {
    const notes = [...this.activeNotes];
    this.activeNotes.clear();
    this._pcDown.clear();
    if (this.el) this.el.querySelectorAll('.key.active').forEach((k) => k.classList.remove('active'));
    if (this.gateNode && this.audioEngine.context) {
      this.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
    }
    this._notifyGate(false);
    notes.forEach((m) => this._broadcastNote(m, false, 0));
  }

  _notifyFreqTargets() {
    ['cv', 'cv2'].forEach((pid) => {
      const port = this.getPort(pid);
      if (!port) return;
      port.connections.forEach((wire) => {
        const mod = wire.to.module;
        if (mod && typeof mod.applyParams === 'function') mod.applyParams();
      });
    });
  }

  _broadcastNote(note, on, velocity) {
    window.dispatchEvent(new CustomEvent('modsynth-note', { detail: { note, on, velocity } }));
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
    // resaltar tecla visual (sin transpose de octava en el dataset)
    let base = midiNote;
    // si está fuera del rango visual, intentar normalizar
    const key = this.el.querySelector('.key[data-note="' + base + '"]');
    if (key) key.classList.toggle('active', on);
  }

  _notifyGate(on, velocity = 1) {
    ['gate', 'gate2'].forEach((pid) => {
      const port = this.getPort(pid);
      if (!port) return;
      port.connections.forEach((wire) => {
        const targetMod = wire.to.module;
        if (targetMod && typeof targetMod.trigger === 'function') {
          targetMod.trigger(on, velocity);
        }
      });
    });
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this.freqNode) try { this.freqNode.disconnect(); } catch (e) {}
    if (this.gateNode) try { this.gateNode.disconnect(); } catch (e) {}
    super.destroy();
  }
}
