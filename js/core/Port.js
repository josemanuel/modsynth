/**
 * Port – punto de conexión de un módulo.
 * Tipos: 'audio' | 'cv' | 'gate'
 * Dirección: 'in' | 'out'
 */
export class Port {
  constructor(module, id, name, type, direction) {
    this.module = module;
    this.id = id;           // único dentro del módulo
    this.name = name;
    this.type = type;       // audio | cv | gate
    this.direction = direction; // in | out
    this.connections = [];  // array de Wire
    this.node = null;       // AudioNode o AudioParam asociado
    this.el = null;         // DOM element del socket
  }

  get fullId() {
    return `${this.module.id}:${this.id}`;
  }

  isCompatible(other) {
    if (this.direction === other.direction) return false;
    // audio puede ir a audio o a cv (modulación)
    if (this.type === 'audio' && (other.type === 'audio' || other.type === 'cv')) return true;
    if (other.type === 'audio' && (this.type === 'audio' || this.type === 'cv')) return true;
    return this.type === other.type;
  }

  connect(wire) {
    this.connections.push(wire);
    if (this.el) this.el.classList.add('connected');
  }

  disconnect(wire) {
    this.connections = this.connections.filter(w => w !== wire);
    if (this.connections.length === 0 && this.el) {
      this.el.classList.remove('connected');
    }
  }
}
