import { Module } from '../core/Module.js';

/**
 * MidiCC – módulo visual para mapear Control Change → parámetros de otros módulos.
 *
 * Flujo:
 * 1. Pulsa "Learn CC" y mueve un knob/fader del controlador MIDI.
 * 2. Pulsa "Learn Param" y haz clic en un slider/select de otro módulo del patch.
 * 3. El mapeo queda guardado y el LED indica actividad.
 *
 * También puedes añadir filas manualmente y elegir CC + módulo + param.
 */
export class MidiCC extends Module {
  constructor(audioEngine, x, y, midiManager = null, patchManager = null) {
    super('midicc', audioEngine, x, y);
    this.title = 'MIDI CC';
    this.width = 260;
    this.midi = midiManager;
    this.patch = patchManager;

    // Lista de mapeos: { id, cc, moduleId, param, min, max }
    this.mappings = [];
    this._mappingId = 1;

    // Estados de learn
    this.learnCC = false;
    this.learnParam = false;
    this.pending = null; // { cc? } mientras se completa el mapeo

    this._unsub = null;
  }

  /** Inyectar referencias que no están en el constructor base */
  setManagers(midiManager, patchManager) {
    this.midi = midiManager;
    this.patch = patchManager;
    this._bindMidi();
  }

  renderBody() {
    return `
      <div class="midicc-toolbar">
        <button class="btn midicc-btn" data-action="learn-cc" title="Mueve un control MIDI">Learn CC</button>
        <button class="btn midicc-btn" data-action="learn-param" title="Clic en un slider de otro módulo">Learn Param</button>
        <button class="btn midicc-btn" data-action="add-row" title="Añadir fila vacía">+</button>
      </div>
      <div class="midicc-status" data-status>Listo</div>
      <div class="midicc-list" data-list></div>
    `;
  }

  _bindControls() {
    this.el.querySelector('[data-action="learn-cc"]').addEventListener('click', () => {
      this._startLearnCC();
    });
    this.el.querySelector('[data-action="learn-param"]').addEventListener('click', () => {
      this._startLearnParam();
    });
    this.el.querySelector('[data-action="add-row"]').addEventListener('click', () => {
      this._addMapping({ cc: 1, moduleId: '', param: '', min: 0, max: 1 });
    });

    this._bindMidi();
    this._renderList();
  }

  _bindMidi() {
    if (!this.midi || this._unsub) return;
    this._unsub = this.midi.on((type, data) => {
      if (type === 'cc') this._onCC(data);
    });
  }

  _setStatus(text, mode = '') {
    const el = this.el.querySelector('[data-status]');
    if (!el) return;
    el.textContent = text;
    el.className = 'midicc-status' + (mode ? ' ' + mode : '');
  }

  _startLearnCC() {
    this.learnCC = true;
    this.learnParam = false;
    this.pending = this.pending || {};
    this._setStatus('Mueve un knob/fader del controlador MIDI…', 'learning');
    this.el.querySelector('[data-action="learn-cc"]').classList.add('active');
    this.el.querySelector('[data-action="learn-param"]').classList.remove('active');
  }

  _startLearnParam() {
    this.learnParam = true;
    this.learnCC = false;
    this.pending = this.pending || {};
    this._setStatus('Haz clic en un slider o select de otro módulo…', 'learning');
    this.el.querySelector('[data-action="learn-param"]').classList.add('active');
    this.el.querySelector('[data-action="learn-cc"]').classList.remove('active');

    // Captura global de un solo clic en un control de parámetro
    const handler = (e) => {
      const control = e.target.closest('[data-param]');
      if (!control) return;
      const modEl = control.closest('.module');
      if (!modEl || modEl.dataset.id === this.id) return; // no mapear a sí mismo

      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener('mousedown', handler, true);

      const moduleId = modEl.dataset.id;
      const param = control.dataset.param;
      this.pending = { ...this.pending, moduleId, param };

      // Inferir min/max del input si es range
      let min = 0, max = 1;
      if (control.type === 'range') {
        min = parseFloat(control.min) || 0;
        max = parseFloat(control.max) || 1;
      }

      this.learnParam = false;
      this.el.querySelector('[data-action="learn-param"]').classList.remove('active');

      if (this.pending.cc != null) {
        this._finalizeMapping(min, max);
      } else {
        this._setStatus(`Param: ${param} — ahora Learn CC o elige CC`, 'ok');
        // Si no hay CC aún, crear fila parcial y esperar CC
        this._addMapping({
          cc: this.pending.cc ?? 1,
          moduleId,
          param,
          min,
          max
        });
        this.pending = null;
      }
    };
    document.addEventListener('mousedown', handler, true);
  }

  _onCC(data) {
    // LED visual de actividad en la lista
    this._flashCC(data.controller);

    if (this.learnCC) {
      this.pending = { ...this.pending, cc: data.controller };
      this.learnCC = false;
      this.el.querySelector('[data-action="learn-cc"]').classList.remove('active');

      if (this.pending.moduleId && this.pending.param) {
        this._finalizeMapping();
      } else {
        this._setStatus(`CC ${data.controller} capturado — ahora Learn Param`, 'ok');
      }
      return;
    }

    // Aplicar mapeos activos
    this.mappings.forEach(m => {
      if (m.cc !== data.controller) return;
      this._applyMapping(m, data.value);
    });
  }

  _finalizeMapping(min, max) {
    const { cc, moduleId, param } = this.pending;
    if (cc == null || !moduleId || !param) return;

    // Evitar duplicados exactos
    const exists = this.mappings.some(
      m => m.cc === cc && m.moduleId === moduleId && m.param === param
    );
    if (!exists) {
      this._addMapping({
        cc,
        moduleId,
        param,
        min: min ?? 0,
        max: max ?? 1
      });
    }

    // Registrar también en MidiManager para consistencia
    if (this.midi && this.patch) {
      const mod = this.patch.modules.get(moduleId);
      if (mod) {
        this.midi.mapCC(cc, mod, param, min ?? 0, max ?? 1);
      }
    }

    this.pending = null;
    this._setStatus(`Mapeado: CC${cc} → ${param}`, 'ok');
    setTimeout(() => this._setStatus('Listo'), 2000);
  }

  _addMapping({ cc, moduleId, param, min = 0, max = 1 }) {
    const id = this._mappingId++;
    this.mappings.push({ id, cc, moduleId, param, min, max });
    this._renderList();
    this._syncMidiManager();
  }

  _removeMapping(id) {
    const m = this.mappings.find(x => x.id === id);
    if (m && this.midi) this.midi.unmapCC(m.cc);
    this.mappings = this.mappings.filter(x => x.id !== id);
    this._renderList();
    this._syncMidiManager();
  }

  _syncMidiManager() {
    if (!this.midi || !this.patch) return;
    // Re-registrar todos (simple)
    this.mappings.forEach(m => {
      const mod = this.patch.modules.get(m.moduleId);
      if (mod && m.param) {
        this.midi.mapCC(m.cc, mod, m.param, m.min, m.max);
      }
    });
  }

  _applyMapping(m, normalizedValue) {
    if (!this.patch || !m.moduleId || !m.param) return;
    const mod = this.patch.modules.get(m.moduleId);
    if (!mod || !mod.params) return;

    const value = m.min + normalizedValue * (m.max - m.min);
    mod.params[m.param] = value;
    if (typeof mod.applyParams === 'function') mod.applyParams();

    // Actualizar UI del control
    if (mod.el) {
      const input = mod.el.querySelector(`[data-param="${m.param}"]`);
      if (input) {
        input.value = value;
        const disp = mod.el.querySelector(`[data-display="${m.param}"]`);
        if (disp) {
          if (m.param === 'frequency' || m.param.toLowerCase().includes('freq')) {
            disp.textContent = Math.round(value) + ' Hz';
          } else if (typeof value === 'number') {
            disp.textContent = value < 10 ? value.toFixed(2) : Math.round(value);
          }
        }
      }
    }

    // Feedback visual en la fila
    const row = this.el.querySelector(`[data-map-id="${m.id}"]`);
    if (row) {
      row.classList.add('active');
      clearTimeout(row._flash);
      row._flash = setTimeout(() => row.classList.remove('active'), 100);
      const bar = row.querySelector('.midicc-bar-fill');
      if (bar) bar.style.width = (normalizedValue * 100) + '%';
    }
  }

  _flashCC(cc) {
    // Resaltar filas con ese CC
    this.el.querySelectorAll(`[data-cc="${cc}"]`).forEach(row => {
      row.classList.add('active');
      clearTimeout(row._flash);
      row._flash = setTimeout(() => row.classList.remove('active'), 100);
    });
  }

  _moduleOptions() {
    if (!this.patch) return '';
    let html = '<option value="">— módulo —</option>';
    this.patch.modules.forEach(mod => {
      if (mod.id === this.id) return;
      html += `<option value="${mod.id}">${mod.title} (${mod.id.slice(-4)})</option>`;
    });
    return html;
  }

  _paramOptions(moduleId) {
    if (!this.patch || !moduleId) return '<option value="">—</option>';
    const mod = this.patch.modules.get(moduleId);
    if (!mod || !mod.params) return '<option value="">—</option>';
    let html = '<option value="">— param —</option>';
    Object.keys(mod.params).forEach(p => {
      html += `<option value="${p}">${p}</option>`;
    });
    return html;
  }

  _renderList() {
    const list = this.el.querySelector('[data-list]');
    if (!list) return;

    if (this.mappings.length === 0) {
      list.innerHTML = '<div class="midicc-empty">Sin mapeos. Usa Learn CC + Learn Param.</div>';
      return;
    }

    list.innerHTML = this.mappings.map(m => `
      <div class="midicc-row" data-map-id="${m.id}" data-cc="${m.cc}">
        <div class="midicc-row-main">
          <label>CC
            <input type="number" min="0" max="127" value="${m.cc}" data-field="cc" data-id="${m.id}" />
          </label>
          <label>Mod
            <select data-field="moduleId" data-id="${m.id}">${this._moduleOptions()}</select>
          </label>
          <label>Param
            <select data-field="param" data-id="${m.id}">${this._paramOptions(m.moduleId)}</select>
          </label>
          <button class="btn midicc-del" data-del="${m.id}" title="Eliminar">×</button>
        </div>
        <div class="midicc-bar"><div class="midicc-bar-fill"></div></div>
        <div class="midicc-range">
          <input type="number" step="any" value="${m.min}" data-field="min" data-id="${m.id}" title="Min" />
          <span>→</span>
          <input type="number" step="any" value="${m.max}" data-field="max" data-id="${m.id}" title="Max" />
        </div>
      </div>
    `).join('');

    // Set selected values
    this.mappings.forEach(m => {
      const row = list.querySelector(`[data-map-id="${m.id}"]`);
      if (!row) return;
      const modSel = row.querySelector('[data-field="moduleId"]');
      const paramSel = row.querySelector('[data-field="param"]');
      if (modSel) modSel.value = m.moduleId || '';
      if (paramSel) {
        paramSel.innerHTML = this._paramOptions(m.moduleId);
        paramSel.value = m.param || '';
      }
    });

    // Bind events
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => this._removeMapping(parseInt(btn.dataset.del)));
    });

    list.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', () => {
        const id = parseInt(el.dataset.id);
        const field = el.dataset.field;
        const m = this.mappings.find(x => x.id === id);
        if (!m) return;

        if (field === 'cc' || field === 'min' || field === 'max') {
          m[field] = parseFloat(el.value);
        } else {
          m[field] = el.value;
        }

        // Si cambió el módulo, refrescar params
        if (field === 'moduleId') {
          const paramSel = list.querySelector(`[data-map-id="${id}"] [data-field="param"]`);
          if (paramSel) {
            paramSel.innerHTML = this._paramOptions(m.moduleId);
            m.param = '';
          }
        }

        this._syncMidiManager();
      });
    });
  }

  buildAudio() {
    // No genera audio; solo control
  }

  toJSON() {
    return {
      ...super.toJSON(),
      mappings: this.mappings.map(({ cc, moduleId, param, min, max }) => ({
        cc, moduleId, param, min, max
      }))
    };
  }

  fromJSON(data) {
    super.fromJSON(data);
    if (data.mappings) {
      this.mappings = [];
      data.mappings.forEach(m => this._addMapping(m));
    }
  }

  destroy() {
    if (this._unsub) this._unsub();
    // Limpiar mapeos del MidiManager
    if (this.midi) {
      this.mappings.forEach(m => this.midi.unmapCC(m.cc));
    }
    super.destroy();
  }
}
