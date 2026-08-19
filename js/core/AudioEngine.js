/**
 * AudioEngine – gestiona el AudioContext y el grafo de audio.
 * Soporta selección de sample rate (útil en escritorio).
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isRunning = false;
    this.sampleRate = 48000;
    this.masterGain = null;
    this.analyser = null;
  }

  async start(sampleRate = 48000) {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
        this.isRunning = true;
        return this.ctx;
      }
      return this.ctx;
    }

    const opts = { sampleRate, latencyHint: 'interactive' };
    this.ctx = new (window.AudioContext || window.webkitAudioContext)(opts);
    this.sampleRate = this.ctx.sampleRate;

    // Master chain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.7;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.isRunning = true;
    console.log(`[AudioEngine] Started @ ${this.sampleRate} Hz`);
    return this.ctx;
  }

  async stop() {
    if (this.ctx) {
      await this.ctx.close();
      this.ctx = null;
      this.isRunning = false;
      this.masterGain = null;
      this.analyser = null;
    }
  }

  get context() {
    return this.ctx;
  }

  get destination() {
    return this.masterGain;
  }

  /** Crea un ConstantSourceNode (útil para CV) */
  createConstant(value = 0) {
    const node = this.ctx.createConstantSource();
    node.offset.value = value;
    node.start();
    return node;
  }

  /** Utilidad: frecuencia MIDI → Hz */
  static midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}
