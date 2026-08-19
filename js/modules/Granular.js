import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';

/**
 * Granular – síntesis granular avanzada.
 * - Envolvente Hann / linear / exp por grano
 * - Freeze / Scan de posición
 * - Pan spray estéreo
 * - Pitch CV (rate)
 */
export class Granular extends Module {
  constructor(audioEngine, x, y) {
    super('granular', audioEngine, x, y);
    this.title = 'Granular';
    this.width = 240;
    this.params = {
      density: 12,
      grainSize: 0.08,
      position: 0,
      spray: 0.1,
      pitch: 1,
      sprayPitch: 0,
      panSpray: 0.5, // 0 = mono centro, 1 = L/R total aleatorio
      scanRate: 0.05, // ciclos del buffer por segundo (modo scan)
      window: 'hann', // hann | linear | exp
      mode: 'freeze', // freeze | scan
      gain: 0.7,
      gateMode: false
    };
    this.buffer = null;
    this.fileName = '';
    this._running = false;
    this._gateOn = true;
    this._timer = null;
    this._scanPos = 0;
    this._lastTick = 0;

    this.addPort('pos', 'Pos CV', 'cv', 'in');
    this.addPort('pitch', 'Pitch CV', 'cv', 'in');
    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="pos"></div><span>Pos</span></div>' +
      '<div class="port input"><div class="port-socket cv" data-port="pitch"></div><span>Pitch</span></div>' +
      '<div class="port input"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<button type="button" class="btn" data-action="load" style="width:100%">Load WAV / MP3</button>' +
      '<input type="file" data-file accept="audio/*,.wav,.mp3,.ogg" hidden />' +
      '<div class="sample-name" data-filename">—</div></div>' +
      '<div class="control"><label>Mode</label>' +
      '<select data-param="mode">' +
      '<option value="freeze">Freeze</option>' +
      '<option value="scan">Scan</option>' +
      '</select></div>' +
      '<div class="control"><label>Window</label>' +
      '<select data-param="window">' +
      '<option value="hann">Hann</option>' +
      '<option value="linear">Linear</option>' +
      '<option value="exp">Exponential</option>' +
      '</select></div>' +
      '<div class="control">' +
      '<label>Density <span class="value-display" data-display="density">12 /s</span></label>' +
      '<input type="range" data-param="density" min="1" max="40" step="1" value="12" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Grain <span class="value-display" data-display="grainSize">0.08 s</span></label>' +
      '<input type="range" data-param="grainSize" min="0.02" max="0.4" step="0.01" value="0.08" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Position <span class="value-display" data-display="position">0%</span></label>' +
      '<input type="range" data-param="position" min="0" max="1" step="0.01" value="0" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Scan rate <span class="value-display" data-display="scanRate">0.05</span></label>' +
      '<input type="range" data-param="scanRate" min="-0.5" max="0.5" step="0.01" value="0.05" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Spray <span class="value-display" data-display="spray">0.10</span></label>' +
      '<input type="range" data-param="spray" min="0" max="0.5" step="0.01" value="0.1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Pitch <span class="value-display" data-display="pitch">1.00</span></label>' +
      '<input type="range" data-param="pitch" min="0.25" max="4" step="0.01" value="1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Pitch spray <span class="value-display" data-display="sprayPitch">0.00</span></label>' +
      '<input type="range" data-param="sprayPitch" min="0" max="0.5" step="0.01" value="0" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Pan spray <span class="value-display" data-display="panSpray">0.50</span></label>' +
      '<input type="range" data-param="panSpray" min="0" max="1" step="0.01" value="0.5" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Gain <span class="value-display" data-display="gain">0.70</span></label>' +
      '<input type="range" data-param="gain" min="0" max="1" step="0.01" value="0.7" />' +
      '</div>' +
      '<div class="control">' +
      '<label><input type="checkbox" data-param="gateMode" /> Solo con Gate</label>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-top:4px">' +
      '<button type="button" class="btn" data-action="start" style="flex:1">▶</button>' +
      '<button type="button" class="btn" data-action="stop" style="flex:1">■</button>' +
      '</div>'
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

    this.el.querySelectorAll('select[data-param]').forEach((sel) => {
      const p = sel.dataset.param;
      sel.value = this.params[p];
      sel.addEventListener('change', (e) => {
        this.params[p] = e.target.value;
        if (p === 'mode' && this.params.mode === 'scan') {
          this._scanPos = this.params.position;
        }
      });
    });

    this.el.querySelectorAll('input[type="range"][data-param]').forEach((input) => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector('[data-display="' + param + '"]');
        if (disp) {
          if (param === 'density') disp.textContent = Math.round(val) + ' /s';
          else if (param === 'grainSize') disp.textContent = val.toFixed(2) + ' s';
          else if (param === 'position') disp.textContent = Math.round(val * 100) + '%';
          else disp.textContent = val < 10 ? val.toFixed(2) : String(Math.round(val));
        }
        if (param === 'gain' && this.outGain && this.audioEngine.context) {
          this.outGain.gain.setValueAtTime(val, this.audioEngine.context.currentTime);
        }
        if (param === 'density' && this._running) {
          this._stopEngine();
          this._startEngine();
        }
        if (param === 'position' && this.params.mode === 'freeze') {
          this._scanPos = val;
        }
      });
    });

    const gm = this.el.querySelector('[data-param="gateMode"]');
    if (gm) {
      gm.checked = !!this.params.gateMode;
      gm.addEventListener('change', (e) => {
        this.params.gateMode = e.target.checked;
        if (!this.params.gateMode) this._gateOn = true;
      });
    }

    this.el.querySelector('[data-action="start"]').addEventListener('click', () => this._startEngine());
    this.el.querySelector('[data-action="stop"]').addEventListener('click', () => this._stopEngine());
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
      alert('Error cargando audio: ' + err.message);
    }
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;
    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.gain;
    this.posConst = this.audioEngine.createConstant(0);
    this.pitchConst = this.audioEngine.createConstant(1);
    this.gateNode = this.audioEngine.createConstant(0);
    this.getPort('out').node = this.outGain;
    this.getPort('pos').node = this.posConst;
    this.getPort('pitch').node = this.pitchConst;
    this.getPort('gate').node = this.gateNode;
  }

  trigger(on) {
    this._gateOn = !!on;
    if (on && this.params.gateMode && !this._running) this._startEngine();
  }

  _startEngine() {
    if (this._running) return;
    if (!this.buffer) {
      alert('Carga un sample primero');
      return;
    }
    if (!this.audioEngine.context) return;
    this._running = true;
    this._lastTick = performance.now();
    this._scanPos = this.params.position;
    this._scheduleLoop();
  }

  _stopEngine() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _scheduleLoop() {
    if (!this._running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastTick) / 1000);
    this._lastTick = now;

    // Scan: avanzar posición
    if (this.params.mode === 'scan') {
      this._scanPos += this.params.scanRate * dt;
      // wrap 0..1
      this._scanPos = ((this._scanPos % 1) + 1) % 1;
    }

    if (!this.params.gateMode || this._gateOn) {
      this._spawnGrain();
    }
    const ms = 1000 / Math.max(1, this.params.density);
    this._timer = setTimeout(() => this._scheduleLoop(), ms);
  }

  /** Curva Hann (o similar) para setValueCurveAtTime */
  _windowCurve(type, n = 64) {
    const arr = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      if (type === 'linear') {
        arr[i] = x < 0.5 ? x * 2 : (1 - x) * 2;
      } else if (type === 'exp') {
        // ataque rápido, release exponencial suave
        arr[i] = x < 0.15 ? x / 0.15 : Math.exp(-5 * ((x - 0.15) / 0.85));
      } else {
        // Hann
        arr[i] = 0.5 * (1 - Math.cos(2 * Math.PI * x));
      }
    }
    return arr;
  }

  _spawnGrain() {
    const ctx = this.audioEngine.context;
    if (!ctx || !this.buffer || !this.outGain) return;

    // --- posición ---
    let pos = this.params.mode === 'scan' ? this._scanPos : this.params.position;
    if (this.getPort('pos').connections.length && this.posConst) {
      const cv = this.posConst.offset.value;
      // 0..1 directo, o Hz mal cableado → ignorar si > 2
      if (cv >= 0 && cv <= 1.5) pos = Math.max(0, Math.min(1, cv > 1 ? cv / 100 : cv));
    }
    pos += (Math.random() * 2 - 1) * this.params.spray;
    pos = Math.max(0, Math.min(1, pos));

    const dur = this.buffer.duration;
    const grainDur = Math.min(this.params.grainSize, Math.max(0.015, dur * 0.5));
    const start = pos * Math.max(0, dur - grainDur);

    // --- pitch / rate ---
    let rate = this.params.pitch;
    if (this.getPort('pitch').connections.length && this.pitchConst) {
      const pcv = this.pitchConst.offset.value;
      // 0.25..4 rate, o Hz → convertir aprox desde A4
      if (pcv > 20) {
        // tratar como Hz respecto a 440
        rate = Math.max(0.25, Math.min(4, pcv / 440));
      } else if (pcv > 0) {
        rate = Math.max(0.25, Math.min(4, pcv));
      }
    }
    rate *= 1 + (Math.random() * 2 - 1) * this.params.sprayPitch;
    rate = Math.max(0.1, Math.min(4, rate));

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = rate;

    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    // Envolvente Hann / linear / exp
    try {
      const curve = this._windowCurve(this.params.window, 64);
      g.gain.setValueCurveAtTime(curve, t0, grainDur);
    } catch (e) {
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, t0 + grainDur * 0.3);
      g.gain.linearRampToValueAtTime(0, t0 + grainDur);
    }

    // --- pan spray ---
    const panVal = (Math.random() * 2 - 1) * this.params.panSpray;
    let panNode = null;
    if (ctx.createStereoPanner) {
      panNode = ctx.createStereoPanner();
      panNode.pan.value = panVal;
      src.connect(g);
      g.connect(panNode);
      panNode.connect(this.outGain);
    } else {
      // fallback equal-power
      const splitL = ctx.createGain();
      const splitR = ctx.createGain();
      const merger = ctx.createChannelMerger(2);
      const l = Math.cos((panVal + 1) * 0.25 * Math.PI);
      const r = Math.sin((panVal + 1) * 0.25 * Math.PI);
      splitL.gain.value = l;
      splitR.gain.value = r;
      src.connect(g);
      g.connect(splitL);
      g.connect(splitR);
      splitL.connect(merger, 0, 0);
      splitR.connect(merger, 0, 1);
      merger.connect(this.outGain);
      panNode = merger;
    }

    try {
      src.start(t0, start, grainDur / Math.max(0.1, rate));
      src.stop(t0 + grainDur + 0.05);
    } catch (e) {}

    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
        if (panNode) panNode.disconnect();
      } catch (e) {}
    };
  }

  destroy() {
    this._stopEngine();
    if (this.outGain) try { this.outGain.disconnect(); } catch (e) {}
    if (this.posConst) try { this.posConst.disconnect(); } catch (e) {}
    if (this.pitchConst) try { this.pitchConst.disconnect(); } catch (e) {}
    if (this.gateNode) try { this.gateNode.disconnect(); } catch (e) {}
    super.destroy();
  }
}
