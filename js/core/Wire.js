/**
 * Wire – conexión entre dos puertos.
 * Maneja tanto la conexión visual (SVG) como la de audio.
 */
export class Wire {
  constructor(fromPort, toPort) {
    this.from = fromPort; // Port (output)
    this.to = toPort;     // Port (input)
    this.pathEl = null;
    this.id = `wire_${fromPort.fullId}_${toPort.fullId}`;
  }

  /** Conectar los nodos Web Audio */
  connectAudio() {
    const src = this.from.node;
    const dst = this.to.node;

    if (!src || !dst) {
      console.warn('Wire: missing audio nodes', this.from.fullId, this.to.fullId);
      return;
    }

    try {
      // Si el destino es un AudioParam
      if (dst instanceof AudioParam) {
        src.connect(dst);
      } else {
        src.connect(dst);
      }
    } catch (e) {
      console.error('Wire connect error:', e);
    }
  }

  disconnect() {
    const src = this.from.node;
    const dst = this.to.node;
    if (src && dst) {
      try {
        if (dst instanceof AudioParam) {
          src.disconnect(dst);
        } else {
          src.disconnect(dst);
        }
      } catch (e) {
        // already disconnected
      }
    }
    this.from.disconnect(this);
    this.to.disconnect(this);
    if (this.pathEl) this.pathEl.remove();
  }

  /** Genera path SVG tipo cable curvado */
  static makePath(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const cp = Math.max(dx * 0.45, 40);
    return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;
  }

  updatePath() {
    if (!this.pathEl) return;
    const p1 = this.from.module.getPortPosition(this.from.id);
    const p2 = this.to.module.getPortPosition(this.to.id);
    this.pathEl.setAttribute('d', Wire.makePath(p1.x, p1.y, p2.x, p2.y));
  }

  toJSON() {
    return {
      from: this.from.fullId,
      to: this.to.fullId
    };
  }
}
