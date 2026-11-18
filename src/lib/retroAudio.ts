let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioCtx();
  }
  return sharedCtx;
}

/**
 * Desbloquea Web Audio API durante gestos de usuario (necesario en iOS / Android).
 */
export function unlockRetroAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Ignorar si el navegador aún bloquea antes del gesto
  }
}

export interface RetroPlaybackHandle {
  stop: () => void;
  wasBlocked: boolean;
}

function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Ruido cuantizado estilo chip 8-bit (LFSR escalonado)
  let stepVal = 0;
  const hold = 6;
  for (let i = 0; i < length; i++) {
    if (i % hold === 0) {
      stepVal = Math.random() > 0.5 ? 0.85 : -0.85;
    }
    data[i] = stepVal;
  }
  return buffer;
}

/**
 * Reproduce una sintonía 8-bit dramática de eliminación estilo Danganronpa / Game Over.
 */
export function playElimination8BitTheme(): RetroPlaybackHandle {
  const ctx = getAudioContext();
  if (!ctx) {
    return { stop: () => {}, wasBlocked: true };
  }

  let stopped = false;
  const nodes: AudioNode[] = [];
  const timers: number[] = [];

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const wasBlocked = ctx.state === 'suspended';

  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  nodes.push(master);

  const now = ctx.currentTime + 0.04;

  const scheduleTone = (
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFreq?: number
  ) => {
    if (stopped) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;

    const t0 = now + startOffset;
    const t1 = t0 + duration;

    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, endFreq), t1);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.setValueAtTime(volume * 0.88, Math.max(t0 + 0.015, t1 - 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t0);
    osc.stop(t1 + 0.02);
    nodes.push(osc, gain);
  };

  const scheduleNoise = (
    startOffset: number,
    duration: number,
    volume: number,
    highpassHz = 900
  ) => {
    if (stopped) return;
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx, duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpassHz;

    const gain = ctx.createGain();
    const t0 = now + startOffset;
    const t1 = t0 + duration;
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    src.start(t0);
    src.stop(t1 + 0.01);
    nodes.push(src, filter, gain);
  };

  // FASE 1 (0.00s - 0.48s): Alarma / glitch de impacto inicial
  const introNotes = [880, 622.25, 830.61, 587.33, 783.99, 523.25];
  introNotes.forEach((f, idx) => {
    scheduleTone(f, idx * 0.075, 0.068, 'square', 0.36);
  });
  scheduleNoise(0.0, 0.14, 0.25, 1400);

  // FASE 2 (0.50s - 1.72s): Marcha cromática descendente de tensión (estilo juicio / ejecución)
  const tensionLead: Array<[number, number, number]> = [
    // [freq, startSec, durSec]
    [523.25, 0.52, 0.14], // C5
    [622.25, 0.67, 0.14], // Eb5
    [587.33, 0.82, 0.14], // D5
    [554.37, 0.97, 0.14], // Db5
    [523.25, 1.12, 0.14], // C5
    [493.88, 1.27, 0.14], // B4
    [466.16, 1.42, 0.14], // Bb4
    [415.3, 1.57, 0.15], // Ab4
  ];

  tensionLead.forEach(([freq, t, d]) => {
    scheduleTone(freq, t, d, 'square', 0.34);
    // Octava grave de acompañamiento
    scheduleTone(freq / 2, t, d * 0.85, 'triangle', 0.42);
  });

  // Caja 8-bit marcando el pulso
  [0.52, 0.82, 1.12, 1.42].forEach((t) => {
    scheduleNoise(t + 0.14, 0.06, 0.22, 1800);
  });

  // FASE 3 (1.76s - 2.35s): Golpe de ejecución / sello X + dispersión de píxeles
  scheduleTone(660, 1.76, 0.45, 'sawtooth', 0.4, 72);
  scheduleTone(196, 1.76, 0.5, 'square', 0.38, 48);
  scheduleNoise(1.76, 0.42, 0.52, 320);

  // FASE 4 (2.42s - 3.65s): Cadencia clásica de derrota 8-bit en Do menor
  const defeatCadence: Array<[number, number, number]> = [
    [392.0, 2.42, 0.22], // G4
    [369.99, 2.66, 0.22], // F#4
    [349.23, 2.9, 0.22], // F4
    [311.13, 3.14, 0.24], // Eb4
    [261.63, 3.4, 0.65], // C4 (final sostenido)
  ];

  defeatCadence.forEach(([freq, t, d], idx) => {
    scheduleTone(
      freq,
      t,
      d,
      'square',
      idx === defeatCadence.length - 1 ? 0.34 : 0.3,
      idx === defeatCadence.length - 1 ? freq * 0.96 : undefined
    );
    scheduleTone(freq / 2, t, d, 'triangle', 0.45);
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    timers.forEach((id) => window.clearTimeout(id));
    try {
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
    } catch {
      // Ignorar si ya cerró
    }
    nodes.forEach((n) => {
      try {
        n.disconnect();
      } catch {
        // Ignorar
      }
    });
  };

  return { stop, wasBlocked };
}
