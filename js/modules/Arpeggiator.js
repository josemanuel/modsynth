import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';

/**
 * Arpeggiator clásico.
 * Entrada: notas vía noteOn/noteOff (desde Keyboard o MIDI) o lista interna.
 * Controles: mode up/down/up-down/random, octavas 1–3, rate, latch, gate length.
 */
export class Arpeggiator extends Module {
  constructor(audioEngine, x, y) {
    super('arp', audioEngine, x, y);
    this.title = 'Arp';
    this.width = 200;
    this.params = {
      mode: 'up',
      octaves: 1,
      rate: 8, // notes per beat-ish: Hz of steps
      latch: false,
      gateLen: 0.5
    };
    this.heldNotes = []; // midi notes held
    this.pattern = [];
    this.patternIndex = 0;
    this.isRunning = false;
    this.timer = null;
    this.direction = 1;

    this.addPort('cv', 'CV', 'cv', 'out');
    this.addPort('gate', 'Gate', 'gate', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col"></div>
        <div class="ports-col">
          <div class="port output"><div class="port-socket cv" data-port="cv"></div><span>CV</span></div>
          <div class="port output"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>
        </div>
      </div>
      <div class="control">
        <label>Mode</label>
        <select data-param="mode">
          <option value="up">Up</option>
          <option value="down">Down</option>
          <option value="updown">Up-Down</option>
          <option value="random">Random</option>
        </select>
      </div>
      <div class="control">
        <label>Octaves</label>
        <select data-param="octaves">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </div>
      <div class="control">
        <label>Rate <span class="value-display" data-display="rate">8.0 Hz</span></label>
        <input type="range" data-param="rate" min="0.5" max="20" step="0.1" value="8" />
      </div>
      <div class="control">
        <label>Gate <span class="value-display" data-display="gateLen">0.50</span></label>
        <input type="range" data-param="gateLen" min="0.05" max="1" step="0.05" value="0.5" />
      </div>
      <div class="control">
        <label><input type="checkbox" data-param="latch" /> Latch</label>
      </div>
      <div class="arp-held" data-held>—</div>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="btn" data-action="clear" style="flex:1">Clear</button>
      </div>
    `;
  }

  _bindControls() {
    const modeSel = this.el.querySelector('[data-param="mode"]');
    modeSel.value = this.params.mode;
    modeSel.addEventListener('change', (e) => {
      this.params.mode = e.target.value;
      this._rebuildPattern();
    });

    const octSel = this.el.querySelector('[data-param="octaves"]');
    octSel.value = String(this.params.octaves);
    octSel.addEventListener('change', (e) => {
      this.params.octaves = parseInt(e.target.value, 10);
      this._rebuildPattern();
    });

    this.el.querySelectorAll('input[type="range"]').forEach((input) => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector(`[data-display="${param}"]`);
        if (disp) {
          disp.textContent =
            param === 'rate' ? val.toFixed(1) + ' Hz' : val.toFixed(2);
        }
      });
    });

    const latch = this.el.querySelector('[data-param="latch"]');
    latch.checked = !!this.params.latch;
    latch.addEventListener('change', (e) => {
      this.params.latch = e.target.checked;
    });

    this.el.querySelector('[data-action="clear"]').addEventListener('click', () => {
      this.heldNotes = [];
      this._rebuildPattern();
      this._stopClock();
      this._updateHeldUI();
    });

    // Escuchar teclas del Keyboard global vía eventos custom y QWERTY local
    this._onNoteEvent = (e) => {
      const { note, on, velocity } = e.detail || {};
      if (note == null) return;
      if (on) this.noteOn(note, velocity);
      else this.noteOff(note);
    };
    window.addEventListener('modsynth-note', this._onNoteEvent);
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;
    this.freqNode = this.audioEngine.createConstant(0);
    this.gateNode = this.audioEngine.createConstant(0);
    this.getPort('cv').node = this.freqNode;
    this.getPort('gate').node = this.gateNode;
  }

  noteOn(midi, velocity = 1) {
    if (!this.heldNotes.includes(midi)) {
      this.heldNotes.push(midi);
      this.heldNotes.sort((a, b) => a - b);
    }
    this._rebuildPattern();
    this._updateHeldUI();
    if (this.pattern.length && !this.isRunning) this._startClock();
  }

  noteOff(midi) {
    if (this.params.latch) return;
    this.heldNotes = this.heldNotes.filter((n) => n !== midi);
    this._rebuildPattern();
    this._updateHeldUI();
    if (!this.pattern.length) this._stopClock();
  }

  _rebuildPattern() {
    const octs = this.params.octaves || 1;
    const base = [...this.heldNotes];
    const expanded = [];
    for (let o = 0; o < octs; o++) {
      base.forEach((n) => expanded.push(n + o * 12));
    }
    const unique = [...new Set(expanded)].sort((a, b) => a - b);

    switch (this.params.mode) {
      case 'down':
        this.pattern = [...unique].reverse();
        break;
      case 'updown': {
        if (unique.length <= 1) this.pattern = unique;
        else this.pattern = [...unique, ...unique.slice(1, -1).reverse()];
        break;
      }
      case 'random':
        this.pattern = unique;
        break;
      default:
        this.pattern = unique;
    }
    this.patternIndex = 0;
    this.direction = 1;
  }

  _startClock() {
    this.isRunning = true;
    this._tick();
  }

  _stopClock() {
    this.isRunning = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.gateNode && this.audioEngine.context) {
      this.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
      this._notifyGate(false);
    }
  }

  _tick() {
    if (!this.isRunning || !this.pattern.length) {
      this.isRunning = false;
      return;
    }

    let note;
    if (this.params.mode === 'random') {
      note = this.pattern[Math.floor(Math.random() * this.pattern.length)];
    } else {
      note = this.pattern[this.patternIndex % this.pattern.length];
      this.patternIndex = (this.patternIndex + 1) % this.pattern.length;
    }

    const t = this.audioEngine.context.currentTime;
    const freq = AudioEngine.midiToFreq(note);
    this.freqNode.offset.setValueAtTime(freq, t);
    this.gateNode.offset.setValueAtTime(1, t);
    this._notifyGate(true);

    const stepMs = 1000 / Math.max(0.1, this.params.rate);
    const gateMs = stepMs * this.params.gateLen;

    setTimeout(() => {
      if (!this.isRunning) return;
      this.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
      this._notifyGate(false);
    }, gateMs);

    this.timer = setTimeout(() => this._tick(), stepMs);
  }

  _notifyGate(on) {
    this.getPort('gate').connections.forEach((wire) => {
      const target = wire.to.module;
      if ((target.type === 'adsr' || target.type === 'sample' || target.type === 'la' || target.type === 'granular' || target.type === 'dx7') &&
          typeof target.trigger === 'function') {
        target.trigger(on);
      }
    });
  }

  _updateHeldUI() {
    const el = this.el && this.el.querySelector('[data-held]');
    if (!el) return;
    el.textContent = this.heldNotes.length
      ? this.heldNotes.join(' ')
      : '— (toca notas / MIDI)';
  }

  destroy() {
    this._stopClock();
    window.removeEventListener('modsynth-note', this._onNoteEvent);
    if (this.freqNode) this.freqNode.disconnect();
    if (this.gateNode) this.gateNode.disconnect();
    super.destroy();
  }
}
