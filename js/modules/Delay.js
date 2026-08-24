import { Module } from '../core/Module.js';
import { ClockBus, divisionToSeconds } from '../core/ClockBus.js';

export class Delay extends Module {
  constructor(audioEngine, x, y) {
    super('delay', audioEngine, x, y);
    this.title = 'Delay';
    this.params = {
      syncMode: 'free',
      division: '1/8', time: 0.3, feedback: 0.4, mix: 0.4 };

    this.addPort('clockIn', 'Clk In', 'gate', 'in');
    this.addPort('in', 'In', 'audio', 'in');
    this.addPort('out', 'Out', 'audio', 'out');
    this.addPort('clockOut', 'Clk Out', 'gate', 'out');
  }

  renderBody() {
    return `
      <div class="ports-row">
        <div class="ports-col">
          <div class="port input"><div class="port-socket gate" data-port="clockIn"></div><span>Clk In</span></div>
          <div class="port input"><div class="port-socket audio" data-port="in"></div><span>In</span></div>
        </div>
        <div class="ports-col">
          <div class="port output"><div class="port-socket audio" data-port="out"></div><span>Out</span></div>
          <div class="port output"><div class="port-socket gate" data-port="clockOut"></div><span>Clk Out</span></div>
        </div>
      </div>
      <div class="control"><label>Sync</label>
        <select data-param="syncMode">
          <option value="free">Free (s)</option>
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
        <label>Time <span class="value-display" data-display="time">0.30 s</span></label>
        <input type="range" data-param="time" min="0.01" max="1.5" step="0.01" value="0.3" />
      </div>
      <div class="control">
        <label>Feedback <span class="value-display" data-display="feedback">0.40</span></label>
        <input type="range" data-param="feedback" min="0" max="0.95" step="0.01" value="0.4" />
      </div>
      <div class="control">
        <label>Mix <span class="value-display" data-display="mix">0.40</span></label>
        <input type="range" data-param="mix" min="0" max="1" step="0.01" value="0.4" />
      </div>
    `;
  }

  _bindControls() {
    this.el.querySelectorAll('select[data-param]').forEach((sel) => {
      const p = sel.dataset.param;
      sel.value = this.params[p];
      sel.addEventListener('change', (e) => {
        this.params[p] = e.target.value;
        if (p === 'syncMode' && e.target.value === 'master') {
          if (!ClockBus.running) {
            ClockBus.setBpm(ClockBus.bpm || 120);
            ClockBus.start(this.id);
          }
        }
        if (p === 'syncMode' && e.target.value !== 'master') ClockBus.stop(this.id);
        this.applyParams();
      });
    });
    this.el.querySelectorAll('input[type="range"]').forEach(input => {
      const param = input.dataset.param;
      input.addEventListener('input', e => {
        this.params[param] = parseFloat(e.target.value);
        const disp = this.el.querySelector(`[data-display="${param}"]`);
        if (disp) {
          disp.textContent = param === 'time'
            ? this.params.time.toFixed(2) + ' s'
            : this.params[param].toFixed(2);
        }
        this.applyParams();
      });
    });
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;

    this.input = ctx.createGain();
    this.delay = ctx.createDelay(2.0);
    this.feedback = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry = ctx.createGain();
    this.output = ctx.createGain();

    this.delay.delayTime.value = this.params.time; // applyParams overrides if sync
    this.feedback.gain.value = this.params.feedback;
    this.wet.gain.value = this.params.mix;
    this.dry.gain.value = 1 - this.params.mix;

    this.input.connect(this.dry);
    this.input.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.dry.connect(this.output);
    this.wet.connect(this.output);

    this.getPort('in').node = this.input;
    this.getPort('out').node = this.output;
  }

  applyParams() {
    if (!this.delay) return;
    const t = this.audioEngine.context.currentTime;
    this.delay.delayTime.setValueAtTime(this.params.time, t);
    this.feedback.gain.setValueAtTime(this.params.feedback, t);
    this.wet.gain.setValueAtTime(this.params.mix, t);
    this.dry.gain.setValueAtTime(1 - this.params.mix, t);
  }

  destroy() {
    [this.input, this.delay, this.feedback, this.wet, this.dry, this.output]
      .forEach(n => n && n.disconnect());
    super.destroy();
  }
}
