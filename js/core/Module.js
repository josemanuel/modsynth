import { Port } from './Port.js';

let moduleIdCounter = 1;

/**
 * Clase base de todos los módulos.
 * Cada módulo tiene:
 *  - id único
 *  - posición (x,y)
 *  - ports (entradas/salidas)
 *  - parámetros
 *  - nodos Web Audio
 */
export class Module {
  constructor(type, audioEngine, x = 100, y = 100) {
    this.id = `mod_${moduleIdCounter++}`;
    this.type = type;
    this.audioEngine = audioEngine;
    this.x = x;
    this.y = y;
    this.width = 180;
    this.height = 120;
    this.ports = new Map(); // id → Port
    this.params = {};
    this.el = null;         // DOM root
    this.title = type.toUpperCase();
  }

  /** Registrar un puerto */
  addPort(id, name, type, direction) {
    const port = new Port(this, id, name, type, direction);
    this.ports.set(id, port);
    return port;
  }

  getPort(id) {
    return this.ports.get(id);
  }

  /** Crear el DOM del módulo (debe ser sobreescrito o extendido) */
  createDOM() {
    const div = document.createElement('div');
    div.className = 'module';
    div.dataset.id = this.id;
    div.style.left = this.x + 'px';
    div.style.top = this.y + 'px';

    // Header
    const header = document.createElement('div');
    header.className = 'module-header';
    header.innerHTML = `
      <span class="module-title">${this.title}</span>
      <button class="module-close" title="Eliminar">×</button>
    `;
    div.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'module-body';
    body.innerHTML = this.renderBody();
    div.appendChild(body);

    this.el = div;
    this._bindPorts();
    this._bindControls();
    return div;
  }

  /** Subclases deben implementar esto */
  renderBody() {
    return '<div>Base module</div>';
  }

  /** Conecta los elementos DOM de los puertos */
  _bindPorts() {
    this.ports.forEach(port => {
      const socket = this.el.querySelector(`[data-port="${port.id}"]`);
      if (socket) {
        port.el = socket;
        socket.dataset.moduleId = this.id;
        socket.dataset.portId = port.id;
        socket.dataset.direction = port.direction;
        socket.dataset.type = port.type;
      }
    });
  }

  /** Subclases pueden sobrescribir para bind de knobs/sliders */
  _bindControls() {}

  /** Actualizar posición visual */
  setPosition(x, y) {
    this.x = x;
    this.y = y;
    if (this.el) {
      this.el.style.left = x + 'px';
      this.el.style.top = y + 'px';
    }
  }

  /** Posición del centro de un puerto en coords del canvas-world (sin zoom) */
  getPortPosition(portId) {
    const port = this.ports.get(portId);
    if (!port || !port.el || !this.el) return { x: this.x, y: this.y };
    const zoom = (window.modularSynth && window.modularSynth.zoom) || 1;
    const portRect = port.el.getBoundingClientRect();
    const modRect = this.el.getBoundingClientRect();
    return {
      x: this.x + (portRect.left + portRect.width / 2 - modRect.left) / zoom,
      y: this.y + (portRect.top + portRect.height / 2 - modRect.top) / zoom
    };
  }

  /** Crear nodos de audio (llamar después de start del engine) */
  buildAudio() {
    // override
  }

  /** Destruir nodos */
  destroy() {
    this.ports.forEach(p => {
      p.connections.forEach(w => w.disconnect());
    });
    if (this.el) this.el.remove();
  }

  /** Serialización */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      params: { ...this.params }
    };
  }

  fromJSON(data) {
    this.x = data.x ?? this.x;
    this.y = data.y ?? this.y;
    Object.assign(this.params, data.params || {});
    this.setPosition(this.x, this.y);
    this.applyParams();
  }

  applyParams() {
    // override
  }
}
