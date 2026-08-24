import { Module } from '../core/Module.js';
import { ClockBus, divisionToHz } from '../core/ClockBus.js';

export class LFO extends Module {
  constructor(audioEngine, x, y) {
    super('lfo', audioEngine, x, y);
    this.title = 'LFO';
    this.params = {
      waveform: 'sine',
      rate: 2,
      depth: 1
    };

    this.addPort('clockIn', 'Clk In', 'gate', 'in');
    this.addPort('clockOut', 'Clk Out', 'gate', 'out');
    this.addPort('out', 'Out', 'cv', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input">
            <div class="port-socket gate" data-port="clockIn"></div>
            <span>Clk In</span>
          </div>
        </div>
        <div class="ports-col">
          <div class="port output">
            <div class="port-socket cv" data-port="out"></div>
            <span>Out</span>
          </div>
          <div class="port output">
            <div class="port-socket gate" data-port="clockOut"></div>
            <span>Clk Out</span>
          </div>
        </div>
      </div>
      <div class="control">
        <label>Wave</label>
        <select data-param="waveform">
          <option value="sine">Sine</option>
          <option value="triangle">Triangle</option>
          <option value="sawtooth">Saw</option>
          <option value="square">Square</option>
        </select>
      </div>
      <div class="control">
        <label>Sync</label>
        <select data-param="syncMode">
          <option value="free">Free (Hz)</option>
          <option value="master">Master</option>
          <option value="slave">Slave</option>
        </select>
      </div>
      <div class="control">
        <label>División</label>
        <select data-param="division">
          <option value="1/1">1/1</option><option value="1/2">1/2</option>
          <option value="1/4" selected>1/4</option><option value="1/8">1/8</option>
          <option value="1/16">1/16</option><option value="1/32">1/32</option>
        </select>
      </div>
      <div class="control">
        <label>Rate <span class="value-display" data-display="rate">2.0 Hz</span></label>
        <input type="range" data-param="rate" min="0.05" max="30" step="0.05" value="2" />
      </div>
      <div class="control">
        <label>Depth <span class="value-display" data-display="depth">1.00</span></label>
        <input type="range" data-param="depth" min="0" max="5" step="0.01" value="1" />
      </div>
    `;
  }

  _bindControls() {
    const wave = this.el.querySelector('[data-param="waveform"]');
    wave.value = this.params.waveform;
    wave.addEventListener('change', e => {
      this.params.waveform = e.target.value;
      if (this.osc) this.osc.type = this.params.waveform;
    });

    this.el.querySelectorAll('input[type="range"]').forEach(input => {
      const param = input.dataset.param;
      input.value = this.params[param];
      input.addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        this.params[param] = val;
        const disp = this.el.querySelector(`[data-display="${param}"]`);
        if (disp) {
          disp.textContent = param === 'rate' ? val.toFixed(2) + ' Hz' : val.toFixed(2);
        }
        this.applyParams();
      });
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.osc = ctx.createOscillator();
    this.osc.type = this.params.waveform;
    this.osc.frequency.value = this.params.rate;
    this.clockOutNode = this.audioEngine.createConstant(0);
    this.clockInNode = this.audioEngine.createConstant(0);
    if (this.getPort('clockOut')) this.getPort('clockOut').node = this.clockOutNode;
    if (this.getPort('clockIn')) this.getPort('clockIn').node = this.clockInNode;
    this._clockUnsub = ClockBus.subscribe((ev) => {
      if (ev.type === 'bpm' || ev.type === 'start' || (ev.type === 'tick' && ev.isBeat)) {
        this.applyParams();
      }
      if (ev.type === 'tick' && (this.params.syncMode === 'master' || this.params.syncMode === 'slave')) {
        if (ClockBus.matchesDivision(this.params.division, ev.tick)) {
          // soft pulse out
          if (this.clockOutNode && this.audioEngine.context) {
            const t = this.audioEngine.context.currentTime;
            this.clockOutNode.offset.setValueAtTime(1, t);
            this.clockOutNode.offset.setValueAtTime(0, t + 0.008);
          }
        }
      }
    });
    this.osc.start();

    this.depthGain = ctx.createGain();
    this.depthGain.gain.value = this.params.depth;
    this.osc.connect(this.depthGain);

    this.getPort('out').node = this.depthGain;
  }

  applyParams() {
    if (!this.osc) return;
    const t = this.audioEngine.context.currentTime;
    this.osc.type = this.params.waveform;
    let rate = this.params.rate;
    if (this.params.syncMode === 'master' || this.params.syncMode === 'slave') {
      const bpm = ClockBus.bpm || 120;
      rate = divisionToHz(this.params.division, bpm);
    }
    this.osc.frequency.setValueAtTime(rate, t);
    this.depthGain.gain.setValueAtTime(this.params.depth, t);
  }

  destroy() {
    if (this._clockUnsub) this._clockUnsub();
    ClockBus.stop(this.id);
    if (this.osc) {
      try { this.osc.stop(); this.osc.disconnect(); } catch(e){}
    }
    if (this.depthGain) this.depthGain.disconnect();
    super.destroy();
  }
}
