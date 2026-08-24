/**
 * ClockBus – transporte global para sincronizar Sequencer, Arp, LFO, Delay, Clock…
 *
 * Resolución base: corchea de semicorchea (1/32 de redonda = 1/8 de negra).
 * tick 0,1,2… cada 1/32 a BPM actual.
 *
 * Evento: { tick, bpm, time, pulse }
 * pulse = true en cada tick (para clockOut).
 */

export const NOTE_DIVISIONS = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32'];

/** Cuántos ticks de 1/32 hay por cada evento de la división */
export function divisionToTicks(div) {
  const map = {
    '1/1': 32,
    '1/2': 16,
    '1/4': 8,
    '1/8': 4,
    '1/16': 2,
    '1/32': 1
  };
  return map[div] || 8;
}

/**
 * Periodo en segundos de una división a un BPM.
 * 1/4 = una negra = 60/BPM
 */
export function divisionToSeconds(div, bpm) {
  const b = Math.max(20, Math.min(300, bpm || 120));
  const denom = parseInt(String(div).split('/')[1], 10) || 4;
  // redonda = 4 negras → 1/denom de redonda = 4/denom negras
  return (60 / b) * (4 / denom);
}

/**
 * Frecuencia (Hz) de un LFO que completa un ciclo por cada división.
 */
export function divisionToHz(div, bpm) {
  const sec = divisionToSeconds(div, bpm);
  return sec > 1e-6 ? 1 / sec : 1;
}

class ClockBusImpl {
  constructor() {
    this.bpm = 120;
    this.running = false;
    this.tick = 0;
    this.masterId = null;
    this._listeners = new Set();
    this._timer = null;
    this._lastPulse = 0;
  }

  setBpm(bpm) {
    this.bpm = Math.max(20, Math.min(300, bpm));
    if (this.running) this._reschedule();
    this._emit({ type: 'bpm', bpm: this.bpm, tick: this.tick });
  }

  /**
   * Inicia el transporte. masterId identifica el módulo maestro.
   * Si ya hay maestro distinto, lo sustituye (takeover).
   */
  start(masterId = null) {
    this.masterId = masterId;
    if (this.running) {
      this._reschedule();
      return;
    }
    this.running = true;
    this.tick = 0;
    this._emit({ type: 'start', bpm: this.bpm, tick: 0 });
    this._scheduleNext();
  }

  stop(masterId = null) {
    if (masterId && this.masterId && this.masterId !== masterId) return;
    this.running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this.masterId = null;
    this._emit({ type: 'stop', bpm: this.bpm, tick: this.tick });
  }

  /** ms de un tick 1/32 */
  tickMs() {
    return ((60 / this.bpm) * 1000) / 8;
  }

  _reschedule() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this.running) this._scheduleNext();
  }

  _scheduleNext() {
    if (!this.running) return;
    const ms = this.tickMs();
    this._timer = setTimeout(() => {
      this.tick += 1;
      this._emit({
        type: 'tick',
        tick: this.tick,
        bpm: this.bpm,
        time: performance.now(),
        pulse: true,
        // conveniencia: ¿es este tick un beat (negra = cada 8× 1/32)?
        isBeat: this.tick % 8 === 0,
        isBar: this.tick % 32 === 0
      });
      this._scheduleNext();
    }, ms);
  }

  /**
   * Suscripción. Devuelve función unsubscribe.
   * fn(event) recibe start|stop|tick|bpm
   */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(ev) {
    this._listeners.forEach((fn) => {
      try {
        fn(ev);
      } catch (e) {
        console.warn('[ClockBus]', e);
      }
    });
  }

  /** true si el tick actual cae en la rejilla de la división */
  matchesDivision(div, tick = this.tick) {
    const every = divisionToTicks(div);
    return tick % every === 0;
  }
}

/** Singleton */
export const ClockBus = new ClockBusImpl();

/** HTML helpers for UI */
export function syncModeSelectHtml(value = 'free') {
  return (
    '<select data-param="syncMode">' +
    '<option value="free"' +
    (value === 'free' ? ' selected' : '') +
    '>Free (Hz/BPM)</option>' +
    '<option value="master"' +
    (value === 'master' ? ' selected' : '') +
    '>Master</option>' +
    '<option value="slave"' +
    (value === 'slave' ? ' selected' : '') +
    '>Slave</option>' +
    '</select>'
  );
}

export function divisionSelectHtml(value = '1/8') {
  return (
    '<select data-param="division">' +
    NOTE_DIVISIONS.map(
      (d) =>
        '<option value="' +
        d +
        '"' +
        (d === value ? ' selected' : '') +
        '>' +
        d +
        '</option>'
    ).join('') +
    '</select>'
  );
}
