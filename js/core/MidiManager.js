/**
 * MidiManager – integración completa de Web MIDI API
 *
 * Características:
 * - Enumeración de inputs / outputs
 * - Note On / Note Off / Velocity
 * - Control Change (CC) mapeable a parámetros de módulos
 * - Pitch Bend
 * - Selección de dispositivo activo
 * - Hot-plug (statechange)
 * - Eventos personalizados para que los módulos reaccionen
 */
export class MidiManager {
  constructor() {
    this.access = null;
    this.inputs = new Map();   // id → MIDIInput
    this.outputs = new Map();  // id → MIDIOutput
    this.activeInputId = null;
    this.activeOutputId = null;

    // Listeners: (type, data) => void
    // type: 'noteon' | 'noteoff' | 'cc' | 'pitchbend' | 'devices'
    this.listeners = new Set();

    // Mapeo CC → { moduleId, param, min, max }
    this.ccMap = new Map();

    this.supported = typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
  }

  /** Inicializar Web MIDI (hay que llamar tras un gesto de usuario en algunos navegadores) */
  async init() {
    if (!this.supported) {
      this._emit('devices', { error: 'Web MIDI no soportado en este navegador' });
      return false;
    }

    try {
      // sysex:false es suficiente para notas y CC
      this.access = await navigator.requestMIDIAccess({ sysex: false });

      this.access.onstatechange = (e) => this._onStateChange(e);
      this._refreshDevices();

      // Auto-seleccionar el primer input disponible
      if (this.inputs.size > 0 && !this.activeInputId) {
        const first = this.inputs.keys().next().value;
        this.setActiveInput(first);
      }

      this._emit('devices', this.getDeviceList());
      return true;
    } catch (err) {
      console.error('[MIDI] Access denied or error:', err);
      this._emit('devices', { error: err.message || 'Acceso MIDI denegado' });
      return false;
    }
  }

  _refreshDevices() {
    this.inputs.clear();
    this.outputs.clear();

    for (const input of this.access.inputs.values()) {
      this.inputs.set(input.id, input);
    }
    for (const output of this.access.outputs.values()) {
      this.outputs.set(output.id, output);
    }
  }

  _onStateChange(e) {
    const port = e.port;
    console.log(`[MIDI] ${port.type} ${port.name} → ${port.state}`);
    this._refreshDevices();

    // Si el input activo se desconectó, limpiar
    if (port.state === 'disconnected' && port.id === this.activeInputId) {
      this.activeInputId = null;
    }

    this._emit('devices', this.getDeviceList());
  }

  getDeviceList() {
    return {
      inputs: [...this.inputs.values()].map(p => ({
        id: p.id,
        name: p.name,
        manufacturer: p.manufacturer || '',
        state: p.state
      })),
      outputs: [...this.outputs.values()].map(p => ({
        id: p.id,
        name: p.name,
        manufacturer: p.manufacturer || '',
        state: p.state
      })),
      activeInputId: this.activeInputId,
      activeOutputId: this.activeOutputId
    };
  }

  setActiveInput(id) {
    // Quitar listener del anterior
    if (this.activeInputId && this.inputs.has(this.activeInputId)) {
      this.inputs.get(this.activeInputId).onmidimessage = null;
    }

    this.activeInputId = id || null;

    if (id && this.inputs.has(id)) {
      const input = this.inputs.get(id);
      input.onmidimessage = (msg) => this._handleMessage(msg);
      console.log(`[MIDI] Active input: ${input.name}`);
    }

    this._emit('devices', this.getDeviceList());
  }

  setActiveOutput(id) {
    this.activeOutputId = id || null;
    this._emit('devices', this.getDeviceList());
  }

  /** Parsear mensaje MIDI crudo */
  _handleMessage(msg) {
    const [status, data1, data2] = msg.data;
    const cmd = status & 0xf0;
    const channel = status & 0x0f; // 0-15

    switch (cmd) {
      case 0x90: // Note On
        if (data2 > 0) {
          this._emit('noteon', {
            note: data1,
            velocity: data2 / 127,
            velocityRaw: data2,
            channel
          });
        } else {
          // Note On con velocity 0 = Note Off
          this._emit('noteoff', { note: data1, velocity: 0, channel });
        }
        break;

      case 0x80: // Note Off
        this._emit('noteoff', {
          note: data1,
          velocity: data2 / 127,
          velocityRaw: data2,
          channel
        });
        break;

      case 0xb0: // Control Change
        this._emit('cc', {
          controller: data1,
          value: data2 / 127,
          valueRaw: data2,
          channel
        });
        this._applyCC(data1, data2 / 127);
        break;

      case 0xe0: // Pitch Bend
        // 14-bit: data2 << 7 | data1  →  centrado en 8192
        const bend = ((data2 << 7) | data1) - 8192;
        this._emit('pitchbend', {
          value: bend / 8192, // -1 … +1
          valueRaw: bend,
          channel
        });
        break;

      case 0xd0: // Channel Aftertouch
        this._emit('aftertouch', {
          value: data1 / 127,
          channel
        });
        break;

      default:
        // Ignorar otros (Program Change, etc.) por ahora
        break;
    }
  }

  /** Aplicar CC mapeados a parámetros de módulos */
  _applyCC(controller, normalizedValue) {
    const mapping = this.ccMap.get(controller);
    if (!mapping) return;

    const { module, param, min = 0, max = 1 } = mapping;
    if (!module || !module.params) return;

    const value = min + normalizedValue * (max - min);
    module.params[param] = value;

    if (typeof module.applyParams === 'function') {
      module.applyParams();
    }

    // Actualizar UI del control si existe
    if (module.el) {
      const input = module.el.querySelector(`[data-param="${param}"]`);
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  /**
   * Mapear un CC a un parámetro de módulo
   * @param {number} cc - número de controlador (0-127)
   * @param {object} module - instancia del módulo
   * @param {string} param - nombre del parámetro
   * @param {number} min
   * @param {number} max
   */
  mapCC(cc, module, param, min = 0, max = 1) {
    this.ccMap.set(cc, { module, param, min, max });
  }

  unmapCC(cc) {
    this.ccMap.delete(cc);
  }

  clearCCMaps() {
    this.ccMap.clear();
  }

  /** Enviar Note On por el output activo (útil para feedback o thru) */
  sendNoteOn(note, velocity = 100, channel = 0) {
    this._send([0x90 | channel, note & 0x7f, velocity & 0x7f]);
  }

  sendNoteOff(note, velocity = 0, channel = 0) {
    this._send([0x80 | channel, note & 0x7f, velocity & 0x7f]);
  }

  sendCC(controller, value, channel = 0) {
    this._send([0xb0 | channel, controller & 0x7f, Math.round(value * 127) & 0x7f]);
  }

  _send(data) {
    if (!this.activeOutputId) return;
    const out = this.outputs.get(this.activeOutputId);
    if (out && out.state === 'connected') {
      out.send(data);
    }
  }

  /** Suscribirse a eventos MIDI */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(type, data) {
    this.listeners.forEach(fn => {
      try { fn(type, data); } catch (e) { console.error(e); }
    });
  }
}
