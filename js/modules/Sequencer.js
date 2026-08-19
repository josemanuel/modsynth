import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';

const MAX_STEPS = 32;
const NOTE_MIN = 0;   // rest
const NOTE_MAX = 84;  // C6

function defaultSteps(n) {
  const s = new Array(n).fill(0);
  // small pattern on first 8
  const seed = [60, 0, 64, 0, 67, 64, 60, 55];
  for (let i = 0; i < Math.min(n, seed.length); i++) s[i] = seed[i];
  return s;
}

export class Sequencer extends Module {
  constructor(audioEngine, x, y) {
    super('sequencer', audioEngine, x, y);
    this.title = 'Sequencer';
    this.width = 420;
    this.params = {
      bpm: 120,
      length: 16,
      steps: defaultSteps(MAX_STEPS),
      scaleMode: 'chromatic',
      scaleRoot: 0
    };
    this.currentStep = 0;
    this.isPlaying = false;
    this.timer = null;

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
        <label>Steps <span class="value-display" data-display="length">${this.params.length}</span></label>
        <input type="range" data-param="length" min="1" max="${MAX_STEPS}" step="1" value="${this.params.length}" />
      </div>
      <div class="seq-sliders" data-sliders></div>
      <div class="control" style="margin-top:6px">
        <label>BPM <span class="value-display" data-display="bpm">${this.params.bpm}</span></label>
        <input type="range" data-param="bpm" min="40" max="240" step="1" value="${this.params.bpm}" />
      </div>
      <div class="control">
        <label>Escala
          <select data-param="scaleMode">
            <option value="chromatic">Cromática</option>
            <option value="major">Mayor</option>
            <option value="minor">Menor</option>
            <option value="random">Aleatorio</option>
          </select>
        </label>
      </div>
      <div class="control">
        <label>Tónica
          <select data-param="scaleRoot">
            <option value="0">C</option><option value="1">C#</option><option value="2">D</option>
            <option value="3">D#</option><option value="4">E</option><option value="5">F</option>
            <option value="6">F#</option><option value="7">G</option><option value="8">G#</option>
            <option value="9">A</option><option value="10">A#</option><option value="11">B</option>
          </select>
        </label>
      </div>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="btn" data-action="fill-scale" style="flex:1" title="Rellenar pasos con la escala">Fill</button>
        <button class="btn" data-action="play" style="flex:1">▶</button>
        <button class="btn" data-action="stop" style="flex:1">■</button>
      </div>
    `;
  }

  _bindControls() {
    this._renderSliders();

    this.el.querySelector('[data-param="bpm"]').addEventListener('input', (e) => {
      this.params.bpm = parseInt(e.target.value, 10);
      this.el.querySelector('[data-display="bpm"]').textContent = this.params.bpm;
    });

    this.el.querySelector('[data-param="length"]').addEventListener('input', (e) => {
      this.params.length = parseInt(e.target.value, 10);
      this.el.querySelector('[data-display="length"]').textContent = this.params.length;
      this._renderSliders();
      if (this.currentStep >= this.params.length) this.currentStep = 0;
    });

    this.el.querySelector('[data-action="play"]').addEventListener('click', () => this.play());
    this.el.querySelector('[data-action="stop"]').addEventListener('click', () => this.stop());
    this.el.querySelector('[data-action="fill-scale"]').addEventListener('click', () => this.fillScale());
    const sm = this.el.querySelector('[data-param="scaleMode"]');
    if (sm) {
      sm.value = this.params.scaleMode;
      sm.addEventListener('change', (e) => { this.params.scaleMode = e.target.value; });
    }
    const sr = this.el.querySelector('[data-param="scaleRoot"]');
    if (sr) {
      sr.value = String(this.params.scaleRoot);
      sr.addEventListener('change', (e) => { this.params.scaleRoot = parseInt(e.target.value, 10); });
    }
  }

  _scaleDegrees() {
    const root = this.params.scaleRoot | 0;
    const major = [0, 2, 4, 5, 7, 9, 11];
    const minor = [0, 2, 3, 5, 7, 8, 10];
    if (this.params.scaleMode === 'major') return major.map((d) => (root + d) % 12);
    if (this.params.scaleMode === 'minor') return minor.map((d) => (root + d) % 12);
    return null; // chromatic / random handled aparte
  }

  fillScale() {
    const len = this.params.length;
    const mode = this.params.scaleMode;
    const root = this.params.scaleRoot | 0;
    const major = [0, 2, 4, 5, 7, 9, 11].map((d) => (root + d) % 12);
    const minor = [0, 2, 3, 5, 7, 8, 10].map((d) => (root + d) % 12);

    if (mode === 'random') {
      const pool = major; // aleatorio sobre mayor de la tónica
      for (let i = 0; i < len; i++) {
        if (Math.random() < 0.22) {
          this.params.steps[i] = 0;
        } else {
          const d = pool[Math.floor(Math.random() * pool.length)];
          const oct = Math.floor(Math.random() * 3);
          this.params.steps[i] = Math.min(NOTE_MAX, 36 + oct * 12 + d);
        }
      }
    } else if (mode === 'chromatic') {
      for (let i = 0; i < len; i++) {
        this.params.steps[i] = Math.min(NOTE_MAX, 48 + (i % 24));
      }
    } else {
      const deg = mode === 'minor' ? minor : major;
      for (let i = 0; i < len; i++) {
        const d = deg[i % deg.length];
        const oct = Math.floor(i / deg.length) % 3;
        this.params.steps[i] = Math.min(NOTE_MAX, 36 + oct * 12 + d);
      }
    }
    this._renderSliders();
  }

  _midiToLabel(m) {
    if (!m) return '·';
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return names[m % 12] + (Math.floor(m / 12) - 1);
  }

  _renderSliders() {
    const host = this.el.querySelector('[data-sliders]');
    if (!host) return;
    const len = this.params.length;
    // Ensure array size
    while (this.params.steps.length < MAX_STEPS) this.params.steps.push(0);

    host.innerHTML = '';
    for (let i = 0; i < len; i++) {
      const val = this.params.steps[i] || 0;
      const col = document.createElement('div');
      col.className = 'seq-col';
      col.dataset.step = String(i);
      col.innerHTML = `
        <span class="seq-note-label">${this._midiToLabel(val)}</span>
        <input type="range" class="seq-vslider" min="${NOTE_MIN}" max="${NOTE_MAX}" step="1" value="${val}" data-step="${i}" orient="vertical" />
        <span class="seq-idx">${i + 1}</span>
      `;
      host.appendChild(col);
    }

    host.querySelectorAll('.seq-vslider').forEach((sl) => {
      sl.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.step, 10);
        const v = parseInt(e.target.value, 10);
        this.params.steps[i] = v;
        const label = e.target.parentElement.querySelector('.seq-note-label');
        if (label) label.textContent = this._midiToLabel(v);
        e.target.classList.toggle('has-note', v > 0);
      });
      sl.classList.toggle('has-note', parseInt(sl.value, 10) > 0);
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;
    this.freqNode = this.audioEngine.createConstant(0);
    this.gateNode = this.audioEngine.createConstant(0);
    this.getPort('cv').node = this.freqNode;
    this.getPort('gate').node = this.gateNode;
  }

  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.currentStep = 0;
    this._tick();
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) clearTimeout(this.timer);
    if (this.gateNode && this.audioEngine.context) {
      this.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
      this._notifyGate(false);
    }
    this.el.querySelectorAll('.seq-col').forEach((el) => el.classList.remove('playing'));
  }

  _tick() {
    if (!this.isPlaying) return;
    const len = Math.max(1, Math.min(MAX_STEPS, this.params.length));
    const step = this.params.steps[this.currentStep] || 0;
    const t = this.audioEngine.context.currentTime;

    this.el.querySelectorAll('.seq-col').forEach((el, i) => {
      el.classList.toggle('playing', i === this.currentStep);
    });

    if (step > 0) {
      const freq = AudioEngine.midiToFreq(step);
      this.freqNode.offset.setValueAtTime(freq, t);
      this.gateNode.offset.setValueAtTime(1, t);
      this._notifyFreqTargets();
      this._notifyGate(true);
      setTimeout(() => {
        if (!this.isPlaying) return;
        this.gateNode.offset.setValueAtTime(0, this.audioEngine.context.currentTime);
        this._notifyGate(false);
      }, (60 / this.params.bpm) * 1000 * 0.55);
    } else {
      this.gateNode.offset.setValueAtTime(0, t);
      this._notifyGate(false);
    }

    this.currentStep = (this.currentStep + 1) % len;
    const ms = (60 / this.params.bpm) * 1000;
    this.timer = setTimeout(() => this._tick(), ms);
  }

  _notifyFreqTargets() {
    this.getPort('cv').connections.forEach((wire) => {
      const mod = wire.to.module;
      if (mod && typeof mod.applyParams === 'function') mod.applyParams();
    });
  }

  _notifyGate(on) {
    this.getPort('gate').connections.forEach((wire) => {
      const targetMod = wire.to.module;
      if (targetMod && typeof targetMod.trigger === 'function') {
        targetMod.trigger(on);
      }
    });
  }

  fromJSON(data) {
    super.fromJSON(data);
    if (data.params && data.params.steps) {
      const steps = data.params.steps.slice(0, MAX_STEPS);
      while (steps.length < MAX_STEPS) steps.push(0);
      this.params.steps = steps;
    }
    if (data.params && data.params.length) {
      this.params.length = Math.max(1, Math.min(MAX_STEPS, data.params.length));
    }
    if (this.el) this._renderSliders();
  }

  destroy() {
    this.stop();
    if (this.freqNode) this.freqNode.disconnect();
    if (this.gateNode) this.gateNode.disconnect();
    super.destroy();
  }
}
