import { Wire } from './Wire.js';
import { VCO } from '../modules/VCO.js';
import { VCF } from '../modules/VCF.js';
import { VCA } from '../modules/VCA.js';
import { ADSR } from '../modules/ADSR.js';
import { LFO } from '../modules/LFO.js';
import { Noise } from '../modules/Noise.js';
import { Mixer } from '../modules/Mixer.js';
import { Delay } from '../modules/Delay.js';
import { Reverb } from '../modules/Reverb.js';
import { Chorus } from '../modules/Chorus.js';
import { Keyboard } from '../modules/Keyboard.js';
import { Sequencer } from '../modules/Sequencer.js';
import { Output } from '../modules/Output.js';
import { MidiCC } from '../modules/MidiCC.js';
import { Sample } from '../modules/Sample.js';
import { Arpeggiator } from '../modules/Arpeggiator.js';
import { Voices } from '../modules/Voices.js';
import { Additive } from '../modules/Additive.js';
import { LA } from '../modules/LA.js';
import { FM } from '../modules/FM.js';
import { Granular } from '../modules/Granular.js';
import { PhaseVocoder } from '../modules/PhaseVocoder.js';
import { Wavetable } from '../modules/Wavetable.js';
import { DX7 } from '../modules/DX7.js';
import { Scope } from '../modules/Scope.js';
import { Splitter } from '../modules/Splitter.js';
import { Panner } from '../modules/Panner.js';
import { Block, setBlockModuleMap } from '../modules/Block.js';

const MODULE_MAP = {
  vco: VCO,
  vcf: VCF,
  vca: VCA,
  adsr: ADSR,
  lfo: LFO,
  noise: Noise,
  mixer: Mixer,
  delay: Delay,
  reverb: Reverb,
  chorus: Chorus,
  keyboard: Keyboard,
  sequencer: Sequencer,
  output: Output,
  midicc: MidiCC,
  sample: Sample,
  arp: Arpeggiator,
  voices: Voices,
  additive: Additive,
  la: LA,
  fm: FM,
  granular: Granular,
  phasevocoder: PhaseVocoder,
  wavetable: Wavetable,
  dx7: DX7,
  scope: Scope,
  splitter: Splitter,
  panner: Panner,
  block: Block
};

setBlockModuleMap(MODULE_MAP);

export class PatchManager {
  constructor(audioEngine, midiManager = null) {
    this.audioEngine = audioEngine;
    this.midiManager = midiManager;
    this.modules = new Map();
    this.wires = [];
    this.selectedIds = new Set();
    this.modulesLayer = document.getElementById('modules-layer');
    this.wiresSvg = document.getElementById('wires-svg');
  }

  clearSelection() {
    this.selectedIds.forEach((id) => {
      const m = this.modules.get(id);
      if (m && m.el) m.el.classList.remove('selected');
    });
    this.selectedIds.clear();
  }

  toggleSelect(id, additive = false) {
    if (!additive) this.clearSelection();
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      const m = this.modules.get(id);
      if (m && m.el) m.el.classList.remove('selected');
    } else {
      this.selectedIds.add(id);
      const m = this.modules.get(id);
      if (m && m.el) m.el.classList.add('selected');
    }
  }

  selectOnly(id) {
    this.clearSelection();
    this.selectedIds.add(id);
    const m = this.modules.get(id);
    if (m && m.el) m.el.classList.add('selected');
  }

  /**
   * Crea un Block a partir de los módulos seleccionados.
   * Cables internos se encapsulan; cables hacia fuera → puertos expuestos.
   */
  createBlockFromSelection(name = 'Custom Block') {
    if (this.selectedIds.size < 1) {
      alert('Selecciona al menos un módulo (Ctrl+clic).');
      return null;
    }
    const ids = [...this.selectedIds].filter((id) => {
      const m = this.modules.get(id);
      return m && m.type !== 'block' && m.type !== 'output' && m.type !== 'keyboard';
    });
    if (!ids.length) {
      alert('La selección no contiene módulos encapsulables.');
      return null;
    }

    const idSet = new Set(ids);
    // posiciones relativas
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach((id) => {
      const m = this.modules.get(id);
      minX = Math.min(minX, m.x);
      minY = Math.min(minY, m.y);
      maxX = Math.max(maxX, m.x + (m.width || 180));
      maxY = Math.max(maxY, m.y + 120);
    });

    const short = new Map();
    ids.forEach((id, i) => short.set(id, 'm' + (i + 1)));

    const modules = ids.map((id) => {
      const m = this.modules.get(id);
      const j = m.toJSON();
      return {
        id: short.get(id),
        type: m.type,
        x: m.x - minX,
        y: m.y - minY,
        params: j.params ? { ...j.params } : { ...m.params }
      };
    });

    const wires = [];
    const external = []; // { fromOuter, toOuter, exposeSide, localPortFull, type, direction on block }

    this.wires.forEach((w) => {
      const aIn = idSet.has(w.from.module.id);
      const bIn = idSet.has(w.to.module.id);
      if (aIn && bIn) {
        wires.push({
          from: short.get(w.from.module.id) + ':' + w.from.id,
          to: short.get(w.to.module.id) + ':' + w.to.id
        });
      } else if (aIn && !bIn) {
        // salida del bloque → módulo externo
        external.push({
          kind: 'out',
          localMod: w.from.module.id,
          localPort: w.from.id,
          type: w.from.type,
          outerMod: w.to.module.id,
          outerPort: w.to.id
        });
      } else if (!aIn && bIn) {
        external.push({
          kind: 'in',
          localMod: w.to.module.id,
          localPort: w.to.id,
          type: w.to.type,
          outerMod: w.from.module.id,
          outerPort: w.from.id
        });
      }
    });

    // agrupar expose por local port
    const exposeMap = new Map(); // key localMod:localPort → expose id
    const expose = [];
    let ei = 1, eo = 1;
    external.forEach((ex) => {
      const key = ex.localMod + ':' + ex.localPort;
      if (!exposeMap.has(key)) {
        const id = ex.kind === 'in' ? 'in' + (ei++) : 'out' + (eo++);
        const name = (ex.kind === 'in' ? 'In ' : 'Out ') + (ex.kind === 'in' ? ei - 1 : eo - 1);
        exposeMap.set(key, id);
        expose.push({
          id,
          name: ex.localPort.toUpperCase(),
          type: ex.type,
          direction: ex.kind === 'in' ? 'in' : 'out',
          target: short.get(ex.localMod) + ':' + ex.localPort
        });
      }
      ex.exposeId = exposeMap.get(key);
    });

    // macros: primeros params numéricos de cada módulo
    const macros = [];
    modules.forEach((md) => {
      const entries = Object.entries(md.params || {});
      let n = 0;
      for (const [k, v] of entries) {
        if (typeof v === 'number' && n < 2) {
          macros.push({
            id: md.id + '_' + k,
            label: md.type.toUpperCase() + ' ' + k,
            min: 0,
            max: v > 1 ? Math.max(v * 2, 10) : 1,
            step: v > 1 ? 0.1 : 0.01,
            value: v,
            target: md.id,
            param: k
          });
          n++;
        }
      }
    });

    const definition = {
      name: name || 'Custom Block',
      description: modules.length + ' módulos · creado desde selección',
      modules,
      wires,
      expose,
      macros: macros.slice(0, 8)
    };

    const bx = minX;
    const by = minY;
    const block = this.createModule('block', bx, by);
    if (!block) return null;
    block.loadDefinition(definition);

    // reconectar exteriores al bloque
    external.forEach((ex) => {
      const outerMod = this.modules.get(ex.outerMod);
      if (!outerMod) return;
      const blockPort = block.getPort(ex.exposeId);
      const outerPort = outerMod.getPort(ex.outerPort);
      if (!blockPort || !outerPort) return;
      if (ex.kind === 'out') {
        this.connect(blockPort, outerPort);
      } else {
        this.connect(outerPort, blockPort);
      }
    });

    // eliminar módulos originales (y sus cables)
    ids.forEach((id) => this.removeModule(id));
    this.clearSelection();
    this.updateStatus();
    return block;
  }

  setMidiManager(midiManager) {
    this.midiManager = midiManager;
  }

  createModule(type, x = 100, y = 100) {
    const Cls = MODULE_MAP[type];
    if (!Cls) {
      console.warn('Unknown module type:', type);
      return null;
    }
    try {
      const mod = new Cls(this.audioEngine, x, y);
      this.modules.set(mod.id, mod);

      // MidiCC necesita referencias a midi + patch
      if (type === 'midicc' && typeof mod.setManagers === 'function') {
        mod.setManagers(this.midiManager, this);
      }

      const el = mod.createDOM();
      this.modulesLayer.appendChild(el);

      if (this.audioEngine.isRunning) {
        mod.buildAudio();
      }

      this._makeDraggable(mod);
      this._bindClose(mod);
      this._bindSelect(mod);
      this.updateStatus();
      return mod;
    } catch (err) {
      console.error('[PatchManager] Error creando módulo', type, err);
      alert('No se pudo crear el módulo "' + type + '":\n' + (err && err.message ? err.message : err));
      return null;
    }
  }

  removeModule(id) {
    const mod = this.modules.get(id);
    if (!mod) return;

    // Remove connected wires
    const toRemove = this.wires.filter(
      w => w.from.module.id === id || w.to.module.id === id
    );
    toRemove.forEach(w => this.removeWire(w));

    mod.destroy();
    this.modules.delete(id);
    this.updateStatus();
  }

  connect(fromPort, toPort) {
    if (!fromPort.isCompatible(toPort)) {
      console.warn('Incompatible ports');
      return null;
    }
    // Ensure direction: from must be out, to must be in
    if (fromPort.direction !== 'out') {
      [fromPort, toPort] = [toPort, fromPort];
    }
    if (fromPort.direction !== 'out' || toPort.direction !== 'in') return null;

    // Avoid duplicates
    const exists = this.wires.some(
      w => w.from === fromPort && w.to === toPort
    );
    if (exists) return null;

    const wire = new Wire(fromPort, toPort);
    fromPort.connect(wire);
    toPort.connect(wire);
    this.wires.push(wire);

    // Visual
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add(fromPort.type);
    path.dataset.wireId = wire.id;
    this.wiresSvg.appendChild(path);
    wire.pathEl = path;

    // Click to delete wire
    path.style.pointerEvents = 'stroke';
    path.addEventListener('click', e => {
      e.stopPropagation();
      this.removeWire(wire);
    });

    wire.updatePath();

    // Audio connection
    if (this.audioEngine.isRunning) {
      wire.connectAudio();
    }

    // VCA y similares deben reaccionar a CV conectado/desconectado
    if (typeof fromPort.module.applyParams === 'function') fromPort.module.applyParams();
    if (typeof toPort.module.applyParams === 'function') toPort.module.applyParams();

    this.updateStatus();
    return wire;
  }

  removeWire(wire) {
    const fromMod = wire.from && wire.from.module;
    const toMod = wire.to && wire.to.module;
    wire.disconnect();
    this.wires = this.wires.filter(w => w !== wire);
    if (fromMod && typeof fromMod.applyParams === 'function') fromMod.applyParams();
    if (toMod && typeof toMod.applyParams === 'function') toMod.applyParams();
    this.updateStatus();
  }

  updateAllWires() {
    this.wires.forEach(w => w.updatePath());
  }

  _makeDraggable(mod) {
    const header = mod.el.querySelector('.module-header');
    let startX, startY, origX, origY;

    const onMove = e => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      mod.setPosition(origX + dx, origY + dy);
      this.updateAllWires();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    header.addEventListener('mousedown', e => {
      if (e.target.classList.contains('module-close')) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      origX = mod.x;
      origY = mod.y;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  _bindClose(mod) {
    mod.el.querySelector('.module-close').addEventListener('click', () => {
      this.removeModule(mod.id);
    });
  }

  /** Llamar después de arrancar el audio engine */
  buildAllAudio() {
    this.modules.forEach(mod => mod.buildAudio());
    // Reconectar wires
    this.wires.forEach(w => w.connectAudio());
  }

  clear() {
    [...this.modules.keys()].forEach(id => this.removeModule(id));
  }

  toJSON() {
    return {
      version: 1,
      modules: [...this.modules.values()].map(m => m.toJSON()),
      wires: this.wires.map(w => w.toJSON())
    };
  }

  fromJSON(data) {
    this.clear();
    if (!data || !data.modules) return;

    const idMap = new Map(); // oldId → newModule

    data.modules.forEach(mdata => {
      const mod = this.createModule(mdata.type, mdata.x, mdata.y);
      if (mod) {
        mod.fromJSON(mdata);
        idMap.set(mdata.id, mod);
      }
    });

    // Rebuild audio if engine running
    if (this.audioEngine.isRunning) {
      this.modules.forEach(m => {
        // rebuild already done in createModule if running
      });
    }

    data.wires?.forEach(wdata => {
      const [fromModId, fromPortId] = wdata.from.split(':');
      const [toModId, toPortId] = wdata.to.split(':');
      const fromMod = idMap.get(fromModId);
      const toMod = idMap.get(toModId);
      if (fromMod && toMod) {
        const fromPort = fromMod.getPort(fromPortId);
        const toPort = toMod.getPort(toPortId);
        if (fromPort && toPort) this.connect(fromPort, toPort);
      }
    });

    // Reaplicar params (p.ej. VCA con CV ya cableado)
    this.modules.forEach((m) => {
      if (typeof m.applyParams === 'function') m.applyParams();
    });

    this.updateStatus();
  }


  _bindSelect(mod) {
    if (!mod.el) return;
    mod.el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.port-socket, input, select, button, a')) return;
      if (e.ctrlKey || e.metaKey) {
        e.stopPropagation();
        this.toggleSelect(mod.id, true);
      } else if (e.shiftKey) {
        e.stopPropagation();
        this.toggleSelect(mod.id, true);
      } else {
        // selección simple solo si no se arrastra mucho — al click
        this.selectOnly(mod.id);
      }
    }, true);
  }

  updateStatus() {
    const info = document.getElementById('patch-info');
    if (info) {
      info.textContent = `Modules: ${this.modules.size} | Wires: ${this.wires.length}`;
    }
    this.updateConnectionsTable();
  }

  updateConnectionsTable() {
    const tbody = document.getElementById('connections-tbody');
    if (!tbody) return;

    if (!this.wires.length) {
      tbody.innerHTML = '<tr class="connections-empty"><td colspan="8">Sin conexiones</td></tr>';
      return;
    }

    tbody.innerHTML = this.wires.map((w, i) => {
      const fromMod = w.from.module;
      const toMod = w.to.module;
      const type = w.from.type || 'audio';
      return `<tr data-wire-index="${i}">
        <td>${i + 1}</td>
        <td class="mod-name">${escapeHtml(fromMod.title || fromMod.type)}</td>
        <td class="port-name">${escapeHtml(w.from.name || w.from.id)}</td>
        <td class="arrow">→</td>
        <td class="mod-name">${escapeHtml(toMod.title || toMod.type)}</td>
        <td class="port-name">${escapeHtml(w.to.name || w.to.id)}</td>
        <td><span class="type-pill ${type}">${type}</span></td>
        <td><button type="button" class="btn-del-wire" data-wire-index="${i}" title="Eliminar">×</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-del-wire').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.wireIndex, 10);
        const wire = this.wires[idx];
        if (wire) this.removeWire(wire);
      });
    });
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

