/**
 * VoiceAllocator – pool de voces para motores polifónicos.
 *
 * voice = { note: number|null, order: number, ...engine fields }
 */

export const MAX_POLY = 8;

/**
 * @param {Array} voices
 * @param {number} n - voces activas permitidas
 * @param {number} midi
 * @param {'oldest'|'highest'|'lowest'} steal
 * @returns {number} index
 */
export function allocateVoice(voices, n, midi, steal = 'oldest') {
  const limit = Math.max(1, Math.min(voices.length, n));
  for (let i = 0; i < limit; i++) {
    if (voices[i].note === midi) return i;
  }
  for (let i = 0; i < limit; i++) {
    if (voices[i].note == null) return i;
  }
  return stealIndex(voices, limit, steal);
}

export function stealIndex(voices, n, steal = 'oldest') {
  const active = [];
  for (let i = 0; i < n; i++) {
    if (voices[i].note != null) active.push({ v: voices[i], i });
  }
  if (!active.length) return 0;
  if (steal === 'highest') {
    active.sort((a, b) => b.v.note - a.v.note);
    return active[0].i;
  }
  if (steal === 'lowest') {
    active.sort((a, b) => a.v.note - b.v.note);
    return active[0].i;
  }
  active.sort((a, b) => (a.v.order || 0) - (b.v.order || 0));
  return active[0].i;
}

export function findVoiceByNote(voices, n, midi) {
  const limit = Math.max(1, Math.min(voices.length, n));
  for (let i = 0; i < limit; i++) {
    if (voices[i].note === midi) return i;
  }
  return -1;
}

/**
 * ADSR sobre AudioParam gain
 */
export function triggerEnv(gainParam, on, velocity, params, ctx, fastRelease) {
  if (!gainParam || !ctx) return;
  const t = ctx.currentTime;
  const peak = Math.max(0.01, Math.min(1, velocity == null ? 1 : velocity));
  const a = Math.max(0.001, params.attack != null ? params.attack : 0.01);
  const d = Math.max(0.001, params.decay != null ? params.decay : 0.2);
  const s = params.sustain != null ? params.sustain : 0.6;
  const r = fastRelease ? 0.02 : Math.max(0.01, params.release != null ? params.release : 0.3);
  gainParam.cancelScheduledValues(t);
  gainParam.setValueAtTime(Math.max(0, gainParam.value), t);
  if (on) {
    gainParam.linearRampToValueAtTime(peak, t + a);
    gainParam.linearRampToValueAtTime(peak * s, t + a + d);
  } else {
    gainParam.linearRampToValueAtTime(0, t + r);
  }
}
