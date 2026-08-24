import { Module } from '../core/Module.js';
import { ClockBus, divisionSelectHtml, divisionToTicks } from '../core/ClockBus.js';

/**
 * Clock – maestro de transporte global.
 * Genera pulsos de reloj (1/32 internos) y clockOut para cablear.
 */
export class Clock extends Module {
  constructor(audioEngine, x, y) {
    super('clock', audioEngine, x, y);
    this.title = 'Clock';
    this.width = 180;
    this.params = {
      bpm: 120,
      division: '1/4', // división del pulso en clockOut
      running: false
    };
    this._unsub = null;

    this.addPort('clockOut', 'Clk Out', 'gate', 'out');
    this.addPort('reset', 'Reset', 'gate', 'in');
  }

  renderBody() {
    return (
      '<div class="ports-row">' +
      '<div class="ports-col">' +
      '<div class="port input"><div class="port-socket gate" data-port="reset"></div><span>Reset</span></div>' +
      '</div>' +
      '<div class="ports-col">' +
      '<div class="port output"><div class="port-socket gate" data-port="clockOut"></div><span>Clk</span></div>' +
      '</div></div>' +
      '<div class="control">' +
      '<label>BPM <span class="value-display" data-display="bpm">120</span></label>' +
      '<input type="range" data-param="bpm" min="40" max="240" step="1" value="120" />' +
      '</div>' +
      '<div class="control"><label>Pulse div</label>' +
      divisionSelectHtml(this.params.division) +
      '</div>' +
      '<div class="clock-status" data-clock-st>Stopped</div>' +
      '<div style="display:flex;gap:6px;margin-top:6px">' +
      '<button type="button" class="btn primary" data-action="start" style="flex:1">▶</button>' +
      '<button type="button" class="btn" data-action="stop" style="flex:1">■</button>' +
      '</div>' +
      '<div class="ps-hint">Master global · ClockBus</div>'
    );
  }

  _bindControls() {
    const bpm = this.el.querySelector('[data-param="bpm"]');
    bpm.value = this.params.bpm;
    bpm.addEventListener('input', (e) => {
      this.params.bpm = parseInt(e.target.value, 10);
      this.el.querySelector('[data-display="bpm"]').textContent = String(this.params.bpm);
      ClockBus.setBpm(this.params.bpm);
    });

    const div = this.el.querySelector('[data-param="division"]');
    if (div) {
      div.value = this.params.division;
      div.addEventListener('change', (e) => {
        this.params.division = e.target.value;
      });
    }

    this.el.querySelector('[data-action="start"]').addEventListener('click', () => this.start());
    this.el.querySelector('[data-action="stop"]').addEventListener('click', () => this.stop());
  }

  buildAudio() {
    const ctx = this.audioEngine.context;
    if (!ctx) return;
    this.pulse = this.audioEngine.createConstant(0);
    this.getPort('clockOut').node = this.pulse;
    this.getPort('reset').node = this.audioEngine.createConstant(0);

    this._unsub = ClockBus.subscribe((ev) => {
      if (ev.type === 'tick' && this.params.running) {
        const every = divisionToTicks(this.params.division);
        if (ev.tick % every === 0) this._firePulse();
      }
      if (ev.type === 'start' || ev.type === 'stop') this._updateStatus();
    });
  }

  _firePulse() {
    if (!this.pulse || !this.audioEngine.context) return;
    const t = this.audioEngine.context.currentTime;
    this.pulse.offset.setValueAtTime(1, t);
    this.pulse.offset.setValueAtTime(0, t + 0.01);
  }

  start() {
    this.params.running = true;
    ClockBus.setBpm(this.params.bpm);
    ClockBus.start(this.id);
    this._updateStatus();
  }

  stop() {
    this.params.running = false;
    ClockBus.stop(this.id);
    this._updateStatus();
  }

  _updateStatus() {
    const el = this.el && this.el.querySelector('[data-clock-st]');
    if (!el) return;
    el.textContent = ClockBus.running
      ? '▶ ' + Math.round(ClockBus.bpm) + ' BPM · t' + ClockBus.tick
      : 'Stopped';
  }

  destroy() {
    if (this.params.running) ClockBus.stop(this.id);
    if (this._unsub) this._unsub();
    if (this.pulse) try { this.pulse.disconnect(); } catch (e) {}
    super.destroy();
  }
}

