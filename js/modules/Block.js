import { Module } from '../core/Module.js';
import { Wire } from '../core/Wire.js';

/**
 * Block – contenedor reutilizable estilo FlowStone.
 *
 * - Modo operacional: carátula + puertos expuestos + macros (knobs globales).
 * - Doble clic: editor interno (módulos/cables del bloque).
 * - Definición JSON importable/exportable y mergeable en el patch.
 *
 * Definición (params.definition):
 * {
 *   name, description,
 *   modules: [{ id, type, x, y, params }],
 *   wires: [{ from: "id:port", to: "id:port" }],
 *   expose: [{ id, name, type, direction, target: "id:port" }],
 *   macros: [{ id, label, min, max, step, value, target: "id", param: "mix" }]
 * }
 */

// Import map se rellena desde PatchManager para evitar dependencias circulares
let MODULE_MAP_REF = null;
export function setBlockModuleMap(map) {
  MODULE_MAP_REF = map;
}

export class Block extends Module {
  constructor(audioEngine, x, y) {
    super('block', audioEngine, x, y);
    this.title = 'Block';
    this.width = 280;
    this.params = {
      name: 'Block',
      definition: defaultMultiFxDefinition()
    };
    this.innerModules = new Map(); // localId → Module instance
    this.innerWires = [];
    this._expanded = false;

    // ports se recrean desde definition
    this._rebuildExposedPorts();
  }

  _rebuildExposedPorts() {
    this.ports.clear();
    const def = this.params.definition || {};
    (def.expose || []).forEach((ex) => {
      this.addPort(ex.id, ex.name || ex.id, ex.type || 'audio', ex.direction || 'in');
    });
  }

  renderBody() {
    const def = this.params.definition || {};
    const macros = def.macros || [];
    const panel = def.panel || null;

    let portsIn = '';
    let portsOut = '';
    (def.expose || []).forEach((ex) => {
      const html =
        '<div class="port ' +
        (ex.direction === 'out' ? 'output' : 'input') +
        '"><div class="port-socket ' +
        (ex.type || 'audio') +
        '" data-port="' +
        ex.id +
        '"></div><span>' +
        (ex.name || ex.id) +
        '</span></div>';
      if (ex.direction === 'out') portsOut += html;
      else portsIn += html;
    });

    let face = '';
    if (panel && Array.isArray(panel.sections) && panel.sections.length) {
      face = '<div class="block-panel ' + (panel.theme || 'wood') + '">';
      face += '<div class="block-panel-side left"></div>';
      face += '<div class="block-panel-main">';
      face += '<div class="block-panel-title">' + escapeHtml(def.name || 'Block') + '</div>';
      panel.sections.forEach((sec) => {
        face += '<div class="block-section">';
        face += '<div class="block-section-title">' + escapeHtml(sec.title || '') + '</div>';
        face += '<div class="block-section-knobs">';
        (sec.macros || []).forEach((mid) => {
          const m = macros.find((x) => x.id === mid);
          if (!m) return;
          const val = m.value != null ? m.value : 0;
          face +=
            '<div class="block-knob-wrap" title="' +
            escapeAttr(m.label || m.id) +
            '">' +
            '<input type="range" class="block-knob" data-macro="' +
            m.id +
            '" min="' +
            (m.min != null ? m.min : 0) +
            '" max="' +
            (m.max != null ? m.max : 1) +
            '" step="' +
            (m.step != null ? m.step : 0.01) +
            '" value="' +
            val +
            '" />' +
            '<span class="block-knob-label">' +
            escapeHtml(m.label || m.id) +
            '</span>' +
            '<span class="block-knob-val" data-macro-disp="' +
            m.id +
            '">' +
            Number(val).toFixed(2) +
            '</span></div>';
        });
        face += '</div></div>';
      });
      face += '</div><div class="block-panel-side right"></div></div>';
    } else {
      // carátula simple + macros lineales
      const nMods = (def.modules || []).length;
      face =
        '<div class="block-cover">' +
        '<div class="block-badge">BLOCK · ' +
        nMods +
        ' modules</div>' +
        '<div class="block-name">' +
        escapeHtml(def.name || this.params.name || 'Block') +
        '</div>' +
        '<div class="block-desc">' +
        escapeHtml(def.description || 'Doble clic para editar') +
        '</div>' +
        '<div class="block-meta">' +
        (def.expose || []).length +
        ' puertos · ' +
        macros.length +
        ' macros</div></div>';
      macros.forEach((m) => {
        const val = m.value != null ? m.value : 0;
        face +=
          '<div class="control"><label>' +
          escapeHtml(m.label || m.id) +
          ' <span class="value-display" data-macro-disp="' +
          m.id +
          '">' +
          Number(val).toFixed(2) +
          '</span></label>' +
          '<input type="range" data-macro="' +
          m.id +
          '" min="' +
          (m.min != null ? m.min : 0) +
          '" max="' +
          (m.max != null ? m.max : 1) +
          '" step="' +
          (m.step != null ? m.step : 0.01) +
          '" value="' +
          val +
          '" /></div>';
      });
    }

    return (
      face +
      '<div class="ports-row"><div class="ports-col">' +
      portsIn +
      '</div><div class="ports-col">' +
      portsOut +
      '</div></div>' +
      '<div class="control" style="display:flex;gap:4px;flex-wrap:wrap">' +
      '<button type="button" class="btn" data-action="edit" style="flex:1">Editar</button>' +
      '<button type="button" class="btn" data-action="export" style="flex:1">Export</button>' +
      '<button type="button" class="btn" data-action="import" style="flex:1">Import</button>' +
      '<input type="file" data-block-file accept=".json,application/json" hidden />' +
      '</div>'
    );
  }

  _bindControls() {
    this.el.querySelectorAll('input[data-macro]').forEach((input) => {
      input.addEventListener('input', () => {
        const id = input.dataset.macro;
        const val = parseFloat(input.value);
        const def = this.params.definition;
        const macro = (def.macros || []).find((m) => m.id === id);
        if (macro) macro.value = val;
        this.el.querySelectorAll('[data-macro-disp="' + id + '"]').forEach((d) => {
          d.textContent = val.toFixed(2);
        });
        this._applyMacro(id, val);
      });
    });

    this.el.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEditor();
    });
    this.el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.port-socket, input, select, button')) return;
      this.openEditor();
    });

    this.el.querySelector('[data-action="export"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportBlockFile();
    });
    const fileIn = this.el.querySelector('[data-block-file]');
    this.el.querySelector('[data-action="import"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileIn.click();
    });
    fileIn?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await this.importBlockFile(file);
      fileIn.value = '';
    });
  }

  _applyMacro(macroId, value) {
    const def = this.params.definition;
    const macro = (def.macros || []).find((m) => m.id === macroId);
    if (!macro) return;
    const mod = this.innerModules.get(macro.target);
    if (!mod || !mod.params) return;
    mod.params[macro.param] = value;
    if (typeof mod.applyParams === 'function') mod.applyParams();
    if (mod.el) {
      const input = mod.el.querySelector('[data-param="' + macro.param + '"]');
      if (input) {
        input.value = value;
        const disp = mod.el.querySelector('[data-display="' + macro.param + '"]');
        if (disp) disp.textContent = Number(value).toFixed(2);
      }
    }
  }

  buildAudio() {
    this._buildInnerGraph();
  }

  _buildInnerGraph() {
    const ctx = this.audioEngine.context;
    if (!ctx || !MODULE_MAP_REF) return;

    // destroy previous
    this._teardownInner();

    const def = this.params.definition || {};
    const idMap = new Map(); // def id → instance

    (def.modules || []).forEach((mdata) => {
      const Cls = MODULE_MAP_REF[mdata.type];
      if (!Cls) {
        console.warn('[Block] unknown type', mdata.type);
        return;
      }
      const mod = new Cls(this.audioEngine, mdata.x || 0, mdata.y || 0);
      if (mdata.params) Object.assign(mod.params, mdata.params);
      // apply macros defaults onto targets
      (def.macros || []).forEach((macro) => {
        if (macro.target === mdata.id && macro.value != null) {
          mod.params[macro.param] = macro.value;
        }
      });
      mod.buildAudio();
      this.innerModules.set(mdata.id, mod);
      idMap.set(mdata.id, mod);
    });

    // inner wires
    (def.wires || []).forEach((w) => {
      const [fromId, fromPort] = w.from.split(':');
      const [toId, toPort] = w.to.split(':');
      const a = idMap.get(fromId);
      const b = idMap.get(toId);
      if (!a || !b) return;
      const fp = a.getPort(fromPort);
      const tp = b.getPort(toPort);
      if (!fp || !tp) return;
      const wire = new Wire(fp, tp);
      fp.connect(wire);
      tp.connect(wire);
      try { wire.connectAudio(); } catch (e) { console.warn(e); }
      this.innerWires.push(wire);
    });

    // bridge expose ports: outer port node = inner target node
    (def.expose || []).forEach((ex) => {
      const [tid, tport] = (ex.target || '').split(':');
      const mod = idMap.get(tid);
      const port = this.getPort(ex.id);
      if (!mod || !port) return;
      const inner = mod.getPort(tport);
      if (inner && inner.node) {
        port.node = inner.node;
      } else {
        // fallback gain
        const g = ctx.createGain();
        g.gain.value = 1;
        port.node = g;
      }
    });
  }

  _teardownInner() {
    this.innerWires.forEach((w) => {
      try { w.disconnect(); } catch (e) {}
    });
    this.innerWires = [];
    this.innerModules.forEach((m) => {
      try { m.destroy(); } catch (e) {}
    });
    this.innerModules.clear();
  }

  openEditor() {
    const def = JSON.parse(JSON.stringify(this.params.definition || {}));
    if (!def.modules) def.modules = [];
    if (!def.wires) def.wires = [];
    if (!def.expose) def.expose = [];
    if (!def.macros) def.macros = [];

    const existing = document.getElementById('block-editor-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'block-editor-modal';
    modal.className = 'modal';
    modal.innerHTML =
      '<div class="modal-backdrop" data-close></div>' +
      '<div class="modal-dialog modal-dialog-block">' +
      '<div class="modal-header">' +
      '<h2>Sub-canvas · <span data-ed-title></span></h2>' +
      '<button type="button" class="btn modal-close" data-close>×</button></div>' +
      '<div class="modal-body block-editor-body">' +
      '<div class="block-editor-toolbar">' +
      '<input type="text" data-ed-name class="block-ed-input" placeholder="Nombre" style="max-width:160px" />' +
      '<select data-add-type class="block-ed-input" style="max-width:130px">' +
      '<option value="vco">VCO</option><option value="vcf">VCF</option><option value="vca">VCA</option>' +
      '<option value="adsr">ADSR</option><option value="lfo">LFO</option><option value="mixer">Mixer</option>' +
      '<option value="delay">Delay</option><option value="chorus">Chorus</option><option value="reverb">Reverb</option>' +
      '<option value="noise">Noise</option><option value="splitter">Splitter</option><option value="panner">Panner</option>' +
      '</select>' +
      '<button type="button" class="btn" data-action="add-mod">+ Módulo</button>' +
      '<button type="button" class="btn danger" data-action="del-mod">Eliminar</button>' +
      '<span class="block-ed-hint" style="margin:0">Arrastra módulos · clic salida→entrada para cablear</span>' +
      '</div>' +
      '<div class="block-subcanvas-wrap">' +
      '<div class="block-subcanvas" data-subcanvas>' +
      '<svg class="block-sub-wires" data-sub-wires></svg>' +
      '<div class="block-sub-layer" data-sub-layer></div>' +
      '</div></div>' +
      '<div class="block-ed-cols">' +
      '<div><h4 class="block-ed-h">Expose / Macros (JSON)</h4>' +
      '<textarea data-ed-json rows="8" class="block-ed-json"></textarea></div>' +
      '<div><h4 class="block-ed-h">Panel (secciones)</h4>' +
      '<textarea data-ed-panel rows="8" class="block-ed-json" placeholder=\'{"theme":"wood","sections":[{"title":"FILTER","macros":["cut"]}]}\'></textarea></div>' +
      '</div></div>' +
      '<div class="modal-footer">' +
      '<button type="button" class="btn primary" data-action="apply">Aplicar y cerrar</button>' +
      '<button type="button" class="btn" data-close>Cancelar</button>' +
      '</div></div>';

    document.body.appendChild(modal);
    modal.querySelector('[data-ed-title]').textContent = def.name || 'Block';
    modal.querySelector('[data-ed-name]').value = def.name || '';
    modal.querySelector('[data-ed-json]').value = JSON.stringify(
      { expose: def.expose, macros: def.macros },
      null,
      2
    );
    modal.querySelector('[data-ed-panel]').value = def.panel
      ? JSON.stringify(def.panel, null, 2)
      : '';

    const state = {
      def,
      selectedId: null,
      wireFrom: null // { modId, portId, el }
    };

    const layer = modal.querySelector('[data-sub-layer]');
    const wiresSvg = modal.querySelector('[data-sub-wires]');
    const canvas = modal.querySelector('[data-subcanvas]');

    const render = () => this._renderSubcanvas(state, layer, wiresSvg, canvas);
    render();

    modal.querySelector('[data-action="add-mod"]').addEventListener('click', () => {
      const type = modal.querySelector('[data-add-type]').value;
      const id = 'm' + (Date.now() % 100000);
      def.modules.push({
        id,
        type,
        x: 40 + (def.modules.length % 5) * 30,
        y: 40 + (def.modules.length % 4) * 30,
        params: {}
      });
      render();
    });

    modal.querySelector('[data-action="del-mod"]').addEventListener('click', () => {
      if (!state.selectedId) {
        alert('Selecciona un módulo en el sub-canvas');
        return;
      }
      def.modules = def.modules.filter((m) => m.id !== state.selectedId);
      def.wires = def.wires.filter(
        (w) => !w.from.startsWith(state.selectedId + ':') && !w.to.startsWith(state.selectedId + ':')
      );
      def.expose = (def.expose || []).filter((e) => !(e.target || '').startsWith(state.selectedId + ':'));
      def.macros = (def.macros || []).filter((m) => m.target !== state.selectedId);
      state.selectedId = null;
      render();
    });

    modal.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => modal.remove());
    });

    modal.querySelector('[data-action="apply"]').addEventListener('click', () => {
      try {
        const meta = JSON.parse(modal.querySelector('[data-ed-json]').value || '{}');
        if (meta.expose) def.expose = meta.expose;
        if (meta.macros) def.macros = meta.macros;
        const panelTxt = modal.querySelector('[data-ed-panel]').value.trim();
        if (panelTxt) def.panel = JSON.parse(panelTxt);
        else delete def.panel;
        def.name = modal.querySelector('[data-ed-name]').value || def.name;
        this.loadDefinition(def);
        modal.remove();
      } catch (err) {
        alert('JSON inválido: ' + err.message);
      }
    });
  }

  _renderSubcanvas(state, layer, wiresSvg, canvas) {
    const def = state.def;
    layer.innerHTML = '';
    const typesPorts = {
      vco: { in: ['freq', 'fm', 'ring'], out: ['out'] },
      vcf: { in: ['in', 'cutoff'], out: ['out'] },
      vca: { in: ['in', 'cv'], out: ['out'] },
      adsr: { in: ['gate'], out: ['out'] },
      lfo: { in: [], out: ['out'] },
      mixer: { in: ['in1', 'in2', 'in3', 'in4', 'in5', 'in6'], out: ['out'] },
      delay: { in: ['in'], out: ['out'] },
      chorus: { in: ['in'], out: ['out'] },
      reverb: { in: ['in'], out: ['out'] },
      noise: { in: [], out: ['out'] },
      splitter: { in: ['in'], out: ['out1', 'out2', 'out3', 'out4'] },
      panner: { in: ['in', 'pan'], out: ['outL', 'outR', 'out'] }
    };

    def.modules.forEach((m) => {
      const card = document.createElement('div');
      card.className = 'block-sub-mod' + (state.selectedId === m.id ? ' selected' : '');
      card.style.left = (m.x || 0) + 'px';
      card.style.top = (m.y || 0) + 'px';
      card.dataset.mid = m.id;

      const ports = typesPorts[m.type] || { in: ['in'], out: ['out'] };
      let inHtml = ports.in
        .map(
          (p) =>
            '<div class="bs-port in" data-mid="' +
            m.id +
            '" data-pid="' +
            p +
            '" data-dir="in" title="' +
            p +
            '"></div>'
        )
        .join('');
      let outHtml = ports.out
        .map(
          (p) =>
            '<div class="bs-port out" data-mid="' +
            m.id +
            '" data-pid="' +
            p +
            '" data-dir="out" title="' +
            p +
            '"></div>'
        )
        .join('');

      card.innerHTML =
        '<div class="bs-head">' +
        (m.type || '').toUpperCase() +
        ' <span class="bs-id">' +
        m.id +
        '</span></div>' +
        '<div class="bs-ports"><div class="bs-col">' +
        inHtml +
        '</div><div class="bs-col">' +
        outHtml +
        '</div></div>';

      // drag
      let dragging = false;
      let ox = 0,
        oy = 0;
      card.querySelector('.bs-head').addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragging = true;
        state.selectedId = m.id;
        ox = e.clientX - (m.x || 0);
        oy = e.clientY - (m.y || 0);
        const onMove = (ev) => {
          if (!dragging) return;
          m.x = Math.max(0, ev.clientX - ox);
          m.y = Math.max(0, ev.clientY - oy);
          card.style.left = m.x + 'px';
          card.style.top = m.y + 'px';
          this._drawSubWires(def, wiresSvg, layer);
        };
        const onUp = () => {
          dragging = false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          this._renderSubcanvas(state, layer, wiresSvg, canvas);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });

      card.addEventListener('click', (e) => {
        if (e.target.closest('.bs-port')) return;
        state.selectedId = m.id;
        this._renderSubcanvas(state, layer, wiresSvg, canvas);
      });

      layer.appendChild(card);
    });

    // port click wiring
    layer.querySelectorAll('.bs-port').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const mid = el.dataset.mid;
        const pid = el.dataset.pid;
        const dir = el.dataset.dir;
        if (dir === 'out') {
          state.wireFrom = { mid, pid };
          layer.querySelectorAll('.bs-port').forEach((p) => p.classList.remove('wire-src'));
          el.classList.add('wire-src');
        } else if (dir === 'in' && state.wireFrom) {
          const from = state.wireFrom.mid + ':' + state.wireFrom.pid;
          const to = mid + ':' + pid;
          if (!def.wires.some((w) => w.from === from && w.to === to)) {
            def.wires.push({ from, to });
          }
          state.wireFrom = null;
          layer.querySelectorAll('.bs-port').forEach((p) => p.classList.remove('wire-src'));
          this._drawSubWires(def, wiresSvg, layer);
        }
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const mid = el.dataset.mid;
        const pid = el.dataset.pid;
        def.wires = def.wires.filter(
          (w) =>
            !(w.from === mid + ':' + pid || w.to === mid + ':' + pid)
        );
        this._drawSubWires(def, wiresSvg, layer);
      });
    });

    this._drawSubWires(def, wiresSvg, layer);

    // size canvas
    let maxX = 400,
      maxY = 300;
    def.modules.forEach((m) => {
      maxX = Math.max(maxX, (m.x || 0) + 180);
      maxY = Math.max(maxY, (m.y || 0) + 100);
    });
    canvas.style.minWidth = maxX + 'px';
    canvas.style.minHeight = maxY + 'px';
  }

  _drawSubWires(def, wiresSvg, layer) {
    if (!wiresSvg) return;
    const cards = {};
    layer.querySelectorAll('.block-sub-mod').forEach((c) => {
      cards[c.dataset.mid] = c;
    });
    let html = '';
    const wrap = wiresSvg.parentElement;
    const wr = wrap.getBoundingClientRect();
    (def.wires || []).forEach((w) => {
      const [a, ap] = w.from.split(':');
      const [b, bp] = w.to.split(':');
      const ca = cards[a];
      const cb = cards[b];
      if (!ca || !cb) return;
      const pa = ca.querySelector('.bs-port.out[data-pid="' + ap + '"]') || ca.querySelector('.bs-port.out');
      const pb = cb.querySelector('.bs-port.in[data-pid="' + bp + '"]') || cb.querySelector('.bs-port.in');
      if (!pa || !pb) return;
      const ra = pa.getBoundingClientRect();
      const rb = pb.getBoundingClientRect();
      const x1 = ra.left + ra.width / 2 - wr.left + wrap.scrollLeft;
      const y1 = ra.top + ra.height / 2 - wr.top + wrap.scrollTop;
      const x2 = rb.left + rb.width / 2 - wr.left + wrap.scrollLeft;
      const y2 = rb.top + rb.height / 2 - wr.top + wrap.scrollTop;
      const cx = (x1 + x2) / 2;
      html +=
        '<path d="M' +
        x1 +
        ' ' +
        y1 +
        ' C' +
        cx +
        ' ' +
        y1 +
        ',' +
        cx +
        ' ' +
        y2 +
        ',' +
        x2 +
        ' ' +
        y2 +
        '" fill="none" stroke="#4fc3f7" stroke-width="2"/>';
    });
    wiresSvg.innerHTML = html;
    wiresSvg.setAttribute('width', String(wrap.scrollWidth || 800));
    wiresSvg.setAttribute('height', String(wrap.scrollHeight || 500));
  }

  loadDefinition(def) {
    this.params.definition = def;
    this.params.name = def.name || 'Block';
    this.title = def.name || 'Block';
    // rebuild DOM ports
    const parent = this.el && this.el.parentNode;
    const x = this.x;
    const y = this.y;
    if (this.el) this.el.remove();
    this._rebuildExposedPorts();
    const el = this.createDOM();
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (parent) parent.appendChild(el);
    if (window.modularSynth && window.modularSynth.patch) {
      const patch = window.modularSynth.patch;
      if (typeof patch._makeDraggable === 'function') patch._makeDraggable(this);
      if (typeof patch._bindClose === 'function') patch._bindClose(this);
      if (typeof patch._bindSelect === 'function') patch._bindSelect(this);
    }
    if (this.audioEngine.isRunning) this._buildInnerGraph();
    const titleEl = this.el.querySelector('.module-title');
    if (titleEl) titleEl.textContent = this.title;
  }

  exportBlockFile() {
    const def = this.params.definition || {};
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (def.name || 'block').replace(/\s+/g, '-').toLowerCase() + '.block.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async importBlockFile(file) {
    try {
      const text = await file.text();
      const def = JSON.parse(text);
      this.loadDefinition(def);
    } catch (err) {
      alert('No se pudo importar el bloque: ' + err.message);
    }
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      params: {
        name: this.params.name,
        definition: this.params.definition
      }
    };
  }

  fromJSON(data) {
    if (data.params && data.params.definition) {
      this.params.definition = data.params.definition;
      this.params.name = data.params.name || data.params.definition.name || 'Block';
      this.title = this.params.name;
      // Reconstruir puertos expuestos y grafo tras cargar patch
      if (this.el) {
        this.loadDefinition(this.params.definition);
      }
    }
  }

  destroy() {
    this._teardownInner();
    super.destroy();
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Plantilla de ejemplo: Delay → Chorus → Reverb en serie */
function defaultMultiFxDefinition() {
  return {
    name: 'MultiFX',
    description: 'Delay → Chorus → Reverb (serie)',
    modules: [
      { id: 'del', type: 'delay', x: 40, y: 60, params: { time: 0.25, feedback: 0.35, mix: 0.35 } },
      { id: 'cho', type: 'chorus', x: 220, y: 60, params: {} },
      { id: 'rev', type: 'reverb', x: 400, y: 60, params: {} }
    ],
    wires: [
      { from: 'del:out', to: 'cho:in' },
      { from: 'cho:out', to: 'rev:in' }
    ],
    expose: [
      { id: 'in', name: 'In', type: 'audio', direction: 'in', target: 'del:in' },
      { id: 'out', name: 'Out', type: 'audio', direction: 'out', target: 'rev:out' }
    ],
    macros: [
      { id: 'delayMix', label: 'Delay Mix', min: 0, max: 1, step: 0.01, value: 0.35, target: 'del', param: 'mix' },
      { id: 'delayTime', label: 'Time', min: 0.01, max: 1, step: 0.01, value: 0.25, target: 'del', param: 'time' },
      { id: 'choMix', label: 'Chorus', min: 0, max: 1, step: 0.01, value: 0.4, target: 'cho', param: 'mix' },
      { id: 'revMix', label: 'Reverb', min: 0, max: 1, step: 0.01, value: 0.3, target: 'rev', param: 'mix' }
    ],
    panel: {
      theme: 'wood',
      sections: [
        { title: 'DELAY', macros: ['delayTime', 'delayMix'] },
        { title: 'CHORUS', macros: ['choMix'] },
        { title: 'REVERB', macros: ['revMix'] }
      ]
    }
  };
}
