import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';
import { ClockBus, divisionToTicks, divisionToHz } from '../core/ClockBus.js';

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
      rate: 8, // Hz in free mode
      latch: false,
      gateLen: 0.5,
      syncMode: 'free',
      division: '1/8'
    };
    this._clockUnsub = null;
    this.heldNotes = []; // midi notes held
    this.pattern = [];
    this.patternIndex = 0;
    this.isRunning = false;
    this.timer = null;
    this.direction = 1;

    this.addPort('clockIn', 'Clk In', 'gate', 'in');
    this.addPort('cv', 'CV', 'cv', 'out');
    this.addPort('gate', 'Gate', 'gate', 'out');
    this.addPort('clockOut', 'Clk Out', 'gate', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input"><div class="port-socket gate" data-port="clockIn"></div><span>Clk In</span></div>
        </div>
        <div class="ports-col">
          <div class="port output"><div class="port-socket cv" data-port="cv"></div><span>CV</span></div>
          <div class="port output"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>
          <div class="port output"><div class="port-socket gate" data-port="clockOut"></div><span>Clk Out</span></div>
        </div>
      </div>
      <div class="control"><label>Sync</label>
        <select data-param="syncMode">
          <option value="free">Free (Hz)</option>
          <option value="master">Master</option>
          <option value="slave">Slave</option>
        </select>
      </div>
      <div class="control"><label>División</label>
        <select data-param="division">
          <option value="1/1">1/1</option><option value="1/2">1/2</option>
          <option value="1/4">1/4</option><option value="1/8" selected>1/8</option>
          <option value="1/16">1/16</option><option value="1/32">1/32</option>
        </select>
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
    this.clockOutNode = this.audioEngine.createConstant(0);
    this.clockInNode = this.audioEngine.createConstant(0);
    this.getPort('cv').node = this.freqNode;
    this.getPort('gate').node = this.gateNode;
    this.getPort('clockOut').node = this.clockOutNode;
    this.getPort('clockIn').node = this.clockInNode;

    this._clockUnsub = ClockBus.subscribe((ev) => {
      if (!this.isRunning) return;
      if ((this.params.syncMode || 'free') === 'free') return;
      if (ev.type === 'tick' && ClockBus.matchesDivision(this.params.division, ev.tick)) {
        this._stepOnce();
        this._pulseClockOut();
      }
    });
  }

  _pulseClockOut() {
    if (!this.clockOutNode || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    this.clockOutNode.offset.setValueAtTime(1, t);
    this.clockOutNode.offset.setValueAtTime(0, t + 0.008);
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
    const mode = this.params.syncMode || 'free';
    if (mode === 'master') {
      // BPM from rate≈ approx: use 120 default or ClockBus
      if (!ClockBus.running) {
        ClockBus.setBpm(ClockBus.bpm || 120);
        ClockBus.start(this.id);
      }
    }
    if (mode === 'free') this._tickFree();
  }

  _stopClock() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if ((this.params.syncMode || 'free') === 'master') {
      ClockBus.stop(this.id);
    }
    if (this.gateNode && this.audioEngine.context) {
      this.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
      this._notifyGate(false);
    }
  }

  _stepOnce() {
    if (!this.isRunning || !this.pattern.length || !this.audioEngine.context) return;
    let note;
    if (this.params.mode === 'random') {
      note = this.pattern[Math.floor(Math.random() * this.pattern.length)];
    } else {
      note = this.pattern[this.patternIndex % this.pattern.length];
      this.patternIndex = (this.patternIndex + 1) % this.pattern.length;
    }
    const t = this.audioEngine.context.currentTime;
    this.freqNode.offset.setValueAtTime(AudioEngine.midiToFreq(note), t);
    this.gateNode.offset.setValueAtTime(1, t);
    this._notifyGate(true);

    const bpm = ClockBus.running ? ClockBus.bpm : 120;
    let stepMs;
    if ((this.params.syncMode || 'free') === 'free') {
      stepMs = 1000 / Math.max(0.1, this.params.rate);
    } else {
      stepMs = divisionToTicks(this.params.division) * ((60 / bpm) * 1000) / 8;
    }
    const gateMs = stepMs * this.params.gateLen;
    setTimeout(() => {
      if (!this.isRunning) return;
      this.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
      this._notifyGate(false);
    }, Math.max(10, gateMs));
  }

  _tickFree() {
    if (!this.isRunning || !this.pattern.length) {
      this.isRunning = false;
      return;
    }
    this._stepOnce();
    this._pulseClockOut();
    const stepMs = 1000 / Math.max(0.1, this.params.rate);
    this.timer = setTimeout(() => this._tickFree(), stepMs);
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
    if (this._clockUnsub) this._clockUnsub();
    window.removeEventListener('modsynth-note', this._onNoteEvent);
    if (this.freqNode) this.freqNode.disconnect();
    if (this.gateNode) this.gateNode.disconnect();
    super.destroy();
  }
}
