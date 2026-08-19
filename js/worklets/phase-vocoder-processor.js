/**
 * Phase Vocoder – AudioWorkletProcessor
 * STFT (Hann) → phase accumulation + bin pitch → ISTFT overlap-add
 * FFT 2048, hop 512 (~75% overlap)
 *
 * AudioParams: pitch (0.25–4), freeze (0|1), wet (0–1)
 */
class PhaseVocoderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'pitch', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' },
      { name: 'freeze', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'wet', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.N = 2048;
    this.H = 512;
    this.half = this.N >> 1;

    // Bit-reversal + twiddles
    this.rev = new Uint32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      let j = 0;
      for (let b = 1, x = i; b < this.N; b <<= 1, x >>= 1) if (x & 1) j = (j << 1) | 1;
      else j <<= 1;
      // simpler bit reverse:
    }
    this.rev = new Uint32Array(this.N);
    let jr = 0;
    for (let i = 0; i < this.N; i++) {
      this.rev[i] = jr;
      let bit = this.N >> 1;
      while (jr & bit) {
        jr ^= bit;
        bit >>= 1;
      }
      jr |= bit;
    }
    this.cosT = new Float32Array(this.N / 2);
    this.sinT = new Float32Array(this.N / 2);
    for (let i = 0; i < this.N / 2; i++) {
      const a = (-2 * Math.PI * i) / this.N;
      this.cosT[i] = Math.cos(a);
      this.sinT[i] = Math.sin(a);
    }

    this.win = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      this.win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / this.N));
    }
    // OLA window normalization (sum of hop-spaced Hann)
    this.olaNorm = 0;
    for (let i = 0; i < this.N; i += this.H) {
      this.olaNorm += this.win[i] * this.win[i];
    }
    if (this.olaNorm < 1e-6) this.olaNorm = 1.5;

    this.re = new Float32Array(this.N);
    this.im = new Float32Array(this.N);
    this.mag = new Float32Array(this.half + 1);
    this.phi = new Float32Array(this.half + 1);
    this.prevPhi = new Float32Array(this.half + 1);
    this.sumPhi = new Float32Array(this.half + 1);
    this.frozenMag = new Float32Array(this.half + 1);
    this.hasFrozen = false;
    this.expect = new Float32Array(this.half + 1);
    for (let k = 0; k <= this.half; k++) {
      this.expect[k] = (2 * Math.PI * this.H * k) / this.N;
    }

    this.inRing = new Float32Array(this.N);
    this.inIdx = 0;
    this.hopCounter = 0;

    this.ola = new Float32Array(this.N * 2);
    this.olaW = 0;

    this.outRing = new Float32Array(this.N * 2);
    this.outW = 0;
    this.outR = 0;
    this.outAvail = 0;
  }

  _fft(re, im, inv) {
    const n = this.N;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        let k = 0;
        for (let j = 0; j < half; j++) {
          const cos = this.cosT[k];
          const sin = inv ? -this.sinT[k] : this.sinT[k];
          const tr = cos * re[i + j + half] - sin * im[i + j + half];
          const ti = sin * re[i + j + half] + cos * im[i + j + half];
          re[i + j + half] = re[i + j] - tr;
          im[i + j + half] = im[i + j] - ti;
          re[i + j] += tr;
          im[i + j] += ti;
          k += step;
        }
      }
    }
    if (inv) {
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    }
  }

  _analyzeAndResynth(pitch, freeze) {
    const n = this.N;
    const half = this.half;
    const p = Math.max(0.25, Math.min(4, pitch));

    // Windowed frame in chronological order ending at inIdx
    for (let j = 0; j < n; j++) {
      const idx = (this.inIdx - n + j + n * 4) % n;
      this.re[j] = this.inRing[idx] * this.win[j];
      this.im[j] = 0;
    }
    this._fft(this.re, this.im, false);

    for (let k = 0; k <= half; k++) {
      const re = this.re[k];
      const im = this.im[k];
      this.mag[k] = Math.hypot(re, im);
      this.phi[k] = Math.atan2(im, re);
    }

    if (freeze > 0.5) {
      if (!this.hasFrozen) {
        this.frozenMag.set(this.mag);
        this.hasFrozen = true;
      }
      this.mag.set(this.frozenMag);
    } else {
      this.hasFrozen = false;
    }

    for (let k = 0; k <= half; k++) {
      // Magnitude from pitched source bin
      const src = k / p;
      const i0 = src | 0;
      const frac = src - i0;
      let m = 0;
      if (i0 >= 0 && i0 <= half) {
        m = this.mag[i0] * (1 - frac);
        if (i0 + 1 <= half) m += this.mag[i0 + 1] * frac;
      }

      let delta = this.phi[k] - this.prevPhi[k];
      this.prevPhi[k] = this.phi[k];
      delta -= this.expect[k];
      delta -= 2 * Math.PI * Math.round(delta / (2 * Math.PI));
      const omega = this.expect[k] + delta;
      this.sumPhi[k] += omega * p;

      this.re[k] = m * Math.cos(this.sumPhi[k]);
      this.im[k] = m * Math.sin(this.sumPhi[k]);
    }

    // Hermitian
    for (let k = 1; k < half; k++) {
      this.re[n - k] = this.re[k];
      this.im[n - k] = -this.im[k];
    }
    this.im[0] = 0;
    this.im[half] = 0;

    this._fft(this.re, this.im, true);

    // Overlap-add into ola buffer
    for (let i = 0; i < n; i++) {
      const oi = (this.olaW + i) % this.ola.length;
      this.ola[oi] += this.re[i] * this.win[i];
    }

    // Emit one hop of samples to outRing
    for (let i = 0; i < this.H; i++) {
      const oi = (this.olaW + i) % this.ola.length;
      let s = this.ola[oi] / this.olaNorm;
      this.ola[oi] = 0;
      this.outRing[this.outW] = s;
      this.outW = (this.outW + 1) % this.outRing.length;
      this.outAvail++;
      if (this.outAvail > this.outRing.length) {
        this.outAvail = this.outRing.length;
        this.outR = this.outW;
      }
    }
    this.olaW = (this.olaW + this.H) % this.ola.length;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const in0 = input && input[0] ? input[0] : null;
    const out0 = output[0];
    const pitch = parameters.pitch[0];
    const freeze = parameters.freeze[0];
    const wet = parameters.wet[0];

    for (let i = 0; i < out0.length; i++) {
      const x = in0 ? in0[i] : 0;
      this.inRing[this.inIdx] = x;
      this.inIdx = (this.inIdx + 1) % this.N;
      this.hopCounter++;

      if (this.hopCounter >= this.H) {
        this.hopCounter = 0;
        this._analyzeAndResynth(pitch, freeze);
      }

      let y = 0;
      if (this.outAvail > 0) {
        y = this.outRing[this.outR];
        this.outR = (this.outR + 1) % this.outRing.length;
        this.outAvail--;
      }

      out0[i] = x * (1 - wet) + y * wet;
    }

    // Mirror to other channels
    for (let c = 1; c < output.length; c++) {
      if (output[c]) output[c].set(out0);
    }
    return true;
  }
}

registerProcessor('phase-vocoder-processor', PhaseVocoderProcessor);
