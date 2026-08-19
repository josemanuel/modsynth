import { Module } from '../core/Module.js';
import { AudioEngine } from '../core/AudioEngine.js';

/**
 * Granular – síntesis granular simplificada.
 * Carga un sample y dispara granos (fragmentos cortos) con densidad,
 * tamaño, posición, spray y pitch.
 */
export class Granular extends Module {
  constructor(audioEngine, x, y) {
    super('granular', audioEngine, x, y);
    this.title = 'Granular';
    this.width = 220;
    this.params = {
      density: 12, // granos / segundo
      grainSize: 0.08, // segundos
      position: 0, // 0..1 en el buffer
      spray: 0.1, // dispersión de posición 0..1
      pitch: 1, // playback rate
      sprayPitch: 0,
      gain: 0.7,
      gateMode: false // si true, solo emite con gate on
    };
    this.buffer = null;
    this.fileName = '';
    this._running = false;
    this._gateOn = true;
    this._timer = null;

    this.addPort('pos', 'Pos CV', 'cv', 'in');
    this.addPort('gate', 'Gate', 'gate', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket cv" data-port="pos"></div><span>Pos</span></div>' +
      '<div class="port input"><div class="port-socket gate" data-port="gate"></div><span>Gate</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<button type="button" class="btn" data-action="load" style="width:100%">Load WAV / MP3</button>' +
      '<input type="file" data-file accept="audio/*,.wav,.mp3,.ogg" hidden />' +
      '<div class="sample-name" data-filename">—</div></div>' +
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
      '<label>Spray <span class="value-display" data-display="spray">0.10</span></label>' +
      '<input type="range" data-param="spray" min="0" max="0.5" step="0.01" value="0.1" />' +
      '</div>' +
      '<div class="control">' +
      '<label>Pitch <span class="value-display" data-display="pitch">1.00</span></label>' +
      '<input type="range" data-param="pitch" min="0.25" max="4" step="0.01" value="1" />' +
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
    const ctx = this.audioEngine.context;
    if (!ctx) {
      alert('Pulsa Start antes de cargar samples');
      return;
    }
    try {
      const arr = await file.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(arr.slice(0));
      this.fileName = file.name;
      const el = this.el.querySelector('[data-filename]');
      if (el) el.textContent = file.name;
    } catch (err) {
      console.error(err);
      alert('No se pudo decodificar el audio');
    }
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.outGain = ctx.createGain();
    this.outGain.gain.value = this.params.gain;
    this.posConst = this.audioEngine.createConstant(0);
    this.gateNode = ctx.createGain();
    this.gateNode.gain.value = 0;

    this.getPort('out').node = this.outGain;
    this.getPort('pos').node = this.posConst;
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
    if (!this.params.gateMode || this._gateOn) {
      this._spawnGrain();
    }
    const ms = 1000 / Math.max(1, this.params.density);
    this._timer = setTimeout(() => this._scheduleLoop(), ms);
  }

  _spawnGrain() {
    const ctx = this.audioEngine.context;
    if (!ctx || !this.buffer || !this.outGain) return;

    let pos = this.params.position;
    if (this.getPort('pos').connections.length) {
      const cv = this.posConst.offset.value;
      // 0..1 o 0..100
      pos = cv > 1 ? Math.min(1, cv / 100) : Math.max(0, Math.min(1, cv));
    }
    pos += (Math.random() * 2 - 1) * this.params.spray;
    pos = Math.max(0, Math.min(1, pos));

    const dur = this.buffer.duration;
    const start = pos * Math.max(0, dur - this.params.grainSize);
    const grainDur = Math.min(this.params.grainSize, Math.max(0.01, dur - start));
    const rate = this.params.pitch * (1 + (Math.random() * 2 - 1) * this.params.sprayPitch);

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = Math.max(0.1, Math.min(4, rate));

    const g = ctx.createGain();
    // envelope triangular simple del grano
    const t = ctx.currentTime;
    const half = grainDur / 2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + half * 0.5);
    g.gain.linearRampToValueAtTime(0, t + grainDur);

    src.connect(g);
    g.connect(this.outGain);
    try {
      src.start(t, start, grainDur);
      src.stop(t + grainDur + 0.02);
    } catch (e) {}
    src.onended = () => {
      try { src.disconnect(); g.disconnect(); } catch (e) {}
    };
  }

  destroy() {
    this._stopEngine();
    if (this.outGain) this.outGain.disconnect();
    if (this.posConst) this.posConst.disconnect();
    if (this.gateNode) this.gateNode.disconnect();
    super.destroy();
  }
}
