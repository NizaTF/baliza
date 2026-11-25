import { loadPreferences } from './preferences';

let sharedCtx: AudioContext | null = null;
let lastClickTs = 0;

function getAudioScale(kind: 'music' | 'sfx'): number {
  const prefs = loadPreferences();
  if (kind === 'music') {
    return prefs.musicEnabled ? Math.max(0, Math.min(1, prefs.musicVolume / 100)) : 0;
  }
  return prefs.sfxEnabled ? Math.max(0, Math.min(1, prefs.sfxVolume / 100)) : 0;
}

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

export type PixelClickVariant = 'tap' | 'confirm' | 'toggle';

/**
 * Sonido corto tipo "clic" pixelado 8-bit para interacciones de UI usando Web Audio API.
 */
export function playPixelUiClick(variant: PixelClickVariant = 'tap'): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const nowPerf = performance.now();
  if (nowPerf - lastClickTs < 28) return;
  lastClickTs = nowPerf;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const t0 = ctx.currentTime + 0.004;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.08 * scale, t0);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';

  if (variant === 'confirm') {
    osc.frequency.setValueAtTime(659.25, t0);
    osc.frequency.setValueAtTime(987.77, t0 + 0.022);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.42, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.065);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.075);
  } else if (variant === 'toggle') {
    osc.frequency.setValueAtTime(783.99, t0);
    osc.frequency.setValueAtTime(1046.5, t0 + 0.016);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.36, t0 + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.055);
  } else {
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.setValueAtTime(620, t0 + 0.012);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.32, t0 + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.032);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.04);
  }
}

function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function playSoftHat(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  volume: number,
  duration = 0.035
): void {
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, duration);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(6200, t0);
  bp.Q.setValueAtTime(1.8, t0);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(volume, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t0);
  src.stop(t0 + duration + 0.01);
}

function playPunchyKick(
  ctx: AudioContext,
  dest: AudioNode,
  t0: number,
  volume = 0.36
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(125, t0);
  osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.11);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(volume, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);

  osc.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + 0.15);
}

/**
 * Sintonía de suspense estilo juicio escolar de Danganronpa al iniciar la partida.
 */
export function playMatchStartSuspenseTheme(): RetroPlaybackHandle {
  const scale = getAudioScale('music');
  const ctx = getAudioContext();
  if (!ctx || scale <= 0) {
    return { stop: () => {}, wasBlocked: !ctx };
  }

  let stopped = false;
  const nodes: AudioNode[] = [];

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  const wasBlocked = ctx.state === 'suspended';

  const master = ctx.createGain();
  master.gain.value = 0.16 * scale;
  master.connect(ctx.destination);
  nodes.push(master);

  const now = ctx.currentTime + 0.03;

  const scheduleFilteredTone = (
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    cutoffHz = 1800
  ) => {
    if (stopped) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = type;
    const t0 = now + startOffset;
    const t1 = t0 + duration;
    osc.frequency.setValueAtTime(freq, t0);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    osc.start(t0);
    osc.stop(t1 + 0.02);
    nodes.push(osc, filter, gain);
  };

  // Motivo limpio en Do menor (C-Eb-G-Bb-C)
  const bassNotes: Array<[number, number]> = [
    [130.81, 0.0],
    [130.81, 0.24],
    [155.56, 0.48],
    [196.0, 0.72],
    [174.61, 0.96],
    [155.56, 1.2],
    [196.0, 1.44],
  ];
  bassNotes.forEach(([f, t]) => {
    scheduleFilteredTone(f, t, 0.22, 'triangle', 0.45, 700);
  });

  const leadNotes: Array<[number, number, number]> = [
    [523.25, 0.0, 0.16],
    [622.25, 0.16, 0.16],
    [783.99, 0.32, 0.16],
    [622.25, 0.48, 0.16],
    [932.33, 0.64, 0.18],
    [783.99, 0.84, 0.18],
    [622.25, 1.04, 0.16],
    [783.99, 1.2, 0.16],
    [932.33, 1.38, 0.16],
    [1046.5, 1.56, 0.45],
  ];
  leadNotes.forEach(([f, t, d]) => {
    scheduleFilteredTone(f, t, d, 'triangle', 0.32, 2400);
    scheduleFilteredTone(f / 2, t, d, 'sine', 0.22, 1200);
  });

  [0, 0.48, 0.96, 1.44, 1.56].forEach((t) => {
    playPunchyKick(ctx, master, now + t, 0.35);
  });

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
    } catch {
      // Ignorar
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

/**
 * Tic mecánico limpio de ruleta al cruzar cada jugador (sin zumbido agresivo).
 */
export function playRouletteTick(stepIndex = 0): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const t0 = ctx.currentTime + 0.002;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.11 * scale, t0);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  const startFreq = stepIndex % 2 === 0 ? 1120 : 980;
  osc.frequency.setValueAtTime(startFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(340, t0 + 0.022);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(0.42, t0 + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.026);

  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.032);
}

/**
 * Acorde limpio de revelación cuando la ruleta fija un buscador.
 */
export function playRouletteLock(isFinal = false): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.008;
  const master = ctx.createGain();
  master.gain.value = 0.2 * scale;
  master.connect(ctx.destination);

  playPunchyKick(ctx, master, now, 0.45);

  const chord = isFinal
    ? [523.25, 659.25, 783.99, 1046.5]
    : [523.25, 622.25, 783.99];

  chord.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const t0 = now + idx * 0.04;
    const t1 = t0 + 0.36;
    osc.frequency.setValueAtTime(freq, t0);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, t0);
    filter.frequency.exponentialRampToValueAtTime(900, t1);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.32, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}

/**
 * Música de ruleta rítmica y limpia con scheduler de precisión (138 BPM).
 */
export function startRouletteMusicLoop(): RetroPlaybackHandle {
  const ctx = getAudioContext();
  if (!ctx) {
    return { stop: () => {}, wasBlocked: true };
  }

  let stopped = false;
  let timerId = 0;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.12;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.28 * getAudioScale('music');
  master.connect(compressor);

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  const wasBlocked = ctx.state === 'suspended';

  const stepSec = 60 / 138 / 4; // semicorchea ~0.1087s
  let stepIndex = 0;
  let nextStepTime = ctx.currentTime + 0.04;

  // Progresión en La menor elegante con subida de tensión progresiva por compás
  const bassSeq = [
    110.0, 110.0, 220.0, 110.0, 110.0, 110.0, 196.0, 220.0,
    87.31, 87.31, 174.61, 87.31, 82.41, 82.41, 164.81, 196.0,
  ];
  const arpSeq = [
    440.0, 523.25, 659.25, 523.25, 440.0, 523.25, 659.25, 880.0,
    349.23, 440.0, 523.25, 440.0, 329.63, 440.0, 493.88, 659.25,
  ];

  const scheduleStep = (time: number, idx: number) => {
    const s = idx % 16;
    const barIdx = Math.floor(idx / 16);
    // Sube suavemente por semitonos cada 2 compases (máx +3 semitonos) para incrementar la tensión
    const tensionSteps = Math.min(3, Math.floor(barIdx / 2));
    const pitchMult = Math.pow(2, tensionSteps / 12);

    // Bombo en pulsos 0, 4, 8, 12 (y doble golpe en compases avanzados)
    if (s % 4 === 0 || (barIdx >= 2 && s % 8 === 6)) {
      playPunchyKick(ctx, master, time, 0.38);
    }
    // Charles que se acelera en tensión avanzada
    if (s % 2 === 1 || barIdx >= 2) {
      playSoftHat(ctx, master, time, s % 2 === 1 ? 0.095 : 0.055, 0.028);
    }

    // Bajo sintético cálido con filtro paso-bajo
    const bassFreq = bassSeq[s] * pitchMult;
    const bassOsc = ctx.createOscillator();
    const bassFilter = ctx.createBiquadFilter();
    const bassGain = ctx.createGain();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(bassFreq, time);
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(640 + tensionSteps * 100, time);
    bassFilter.frequency.exponentialRampToValueAtTime(260, time + stepSec * 0.9);
    bassGain.gain.setValueAtTime(0.0001, time);
    bassGain.gain.linearRampToValueAtTime(0.3, time + 0.008);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, time + stepSec * 0.95);
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(master);
    bassOsc.start(time);
    bassOsc.stop(time + stepSec + 0.01);

    // Arpegio cristalino
    const arpFreq = arpSeq[s] * pitchMult;
    const arpOsc = ctx.createOscillator();
    const arpGain = ctx.createGain();
    arpOsc.type = 'triangle';
    arpOsc.frequency.setValueAtTime(arpFreq, time);
    arpGain.gain.setValueAtTime(0.0001, time);
    arpGain.gain.linearRampToValueAtTime(0.24, time + 0.006);
    arpGain.gain.exponentialRampToValueAtTime(0.0001, time + stepSec * 0.9);
    arpOsc.connect(arpGain);
    arpGain.connect(master);
    arpOsc.start(time);
    arpOsc.stop(time + stepSec + 0.01);
  };

  const pump = () => {
    if (stopped) return;
    master.gain.setValueAtTime(0.28 * getAudioScale('music'), ctx.currentTime);
    while (nextStepTime < ctx.currentTime + 0.14) {
      scheduleStep(nextStepTime, stepIndex);
      nextStepTime += stepSec;
      stepIndex++;
    }
    timerId = window.setTimeout(pump, 30);
  };

  pump();

  return {
    wasBlocked,
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timerId);
      try {
        master.gain.setValueAtTime(0.0001, ctx.currentTime);
        master.disconnect();
        compressor.disconnect();
      } catch {
        // Ignorar
      }
    },
  };
}

/**
 * Música de tensión cinematográfica con alto volumen y presencia en altavoces móviles (Fa# menor).
 */
export function startSeekerTensionMusic(): RetroPlaybackHandle {
  const ctx = getAudioContext();
  if (!ctx) {
    return { stop: () => {}, wasBlocked: true };
  }

  let stopped = false;
  let timerId = 0;

  // Limitador dinámico para ganar volumen y pegada sin distorsionar altavoces de móvil
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 10;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.58 * getAudioScale('music');
  master.connect(compressor);

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  const wasBlocked = ctx.state === 'suspended';

  // Pulso cinematográfico a 116 BPM en Fa# menor (F#m - D - E - C#m)
  const stepSec = 60 / 116 / 4; // ~0.1293s
  let stepIndex = 0;
  let nextStepTime = ctx.currentTime + 0.04;

  // 32 pasos (2 compases completos) para que suene profundo y envolvente, nunca repetitivo ni estridente
  const bassRootByBar = [92.5, 92.5, 73.42, 82.41]; // F#2, F#2, D2, E2
  const padNotes: Array<number | null> = [
    369.99, null, 554.37, null, 440.0, null, 554.37, null,
    369.99, null, 554.37, null, 493.88, null, 440.0, null,
    293.66, null, 440.0, null, 369.99, null, 440.0, null,
    329.63, null, 493.88, null, 440.0, null, 369.99, null,
  ];

  const scheduleStep = (time: number, idx: number) => {
    const step32 = idx % 32;
    const barIdx = Math.floor(step32 / 8);
    const bassFreq = bassRootByBar[barIdx];

    // Doble latido grave con pegada al inicio de cada pulso de 8 semicorcheas
    if (step32 % 8 === 0) {
      playPunchyKick(ctx, master, time, 0.58);
    } else if (step32 % 8 === 3) {
      playPunchyKick(ctx, master, time, 0.36);
    }

    // Reloj de tensión marcado cada negra
    if (step32 % 4 === 2) {
      playSoftHat(ctx, master, time, 0.15, 0.03);
    }

    // Sub-bajo + armónico medio en octava para proyectar claramente en móvil
    if (step32 % 2 === 0) {
      const sub = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(bassFreq, time);

      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(480, time);

      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.38, time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, time + stepSec * 1.9);

      sub.connect(lp);
      lp.connect(g);
      g.connect(master);
      sub.start(time);
      sub.stop(time + stepSec * 2 + 0.01);

      // Capa armónica cálida audible incluso en altavoces pequeños de teléfono
      const midBass = ctx.createOscillator();
      const midLp = ctx.createBiquadFilter();
      const midG = ctx.createGain();
      midBass.type = 'sawtooth';
      midBass.frequency.setValueAtTime(bassFreq * 2, time);

      midLp.type = 'lowpass';
      midLp.frequency.setValueAtTime(860, time);

      midG.gain.setValueAtTime(0.0001, time);
      midG.gain.linearRampToValueAtTime(0.24, time + 0.01);
      midG.gain.exponentialRampToValueAtTime(0.0001, time + stepSec * 1.65);

      midBass.connect(midLp);
      midLp.connect(midG);
      midG.connect(master);
      midBass.start(time);
      midBass.stop(time + stepSec * 1.75);
    }

    // Pluck atmosférico de misterio con cuerpo medio-agudo
    const pluckFreq = padNotes[step32];
    if (pluckFreq !== null) {
      const pOsc = ctx.createOscillator();
      const pFilter = ctx.createBiquadFilter();
      const pGain = ctx.createGain();
      pOsc.type = 'triangle';
      pOsc.frequency.setValueAtTime(pluckFreq, time);

      pFilter.type = 'lowpass';
      pFilter.frequency.setValueAtTime(2200, time);

      pGain.gain.setValueAtTime(0.0001, time);
      pGain.gain.linearRampToValueAtTime(0.34, time + 0.01);
      pGain.gain.exponentialRampToValueAtTime(0.0001, time + stepSec * 2.4);

      pOsc.connect(pFilter);
      pFilter.connect(pGain);
      pGain.connect(master);
      pOsc.start(time);
      pOsc.stop(time + stepSec * 2.5);

      // Octava superior suave para presencia en el pulso
      const hiOsc = ctx.createOscillator();
      const hiGain = ctx.createGain();
      hiOsc.type = 'sine';
      hiOsc.frequency.setValueAtTime(pluckFreq * 2, time);
      hiGain.gain.setValueAtTime(0.0001, time);
      hiGain.gain.linearRampToValueAtTime(0.14, time + 0.008);
      hiGain.gain.exponentialRampToValueAtTime(0.0001, time + stepSec * 1.4);
      hiOsc.connect(hiGain);
      hiGain.connect(master);
      hiOsc.start(time);
      hiOsc.stop(time + stepSec * 1.5);
    }
  };

  const pump = () => {
    if (stopped) return;
    master.gain.setValueAtTime(0.58 * getAudioScale('music'), ctx.currentTime);
    while (nextStepTime < ctx.currentTime + 0.14) {
      scheduleStep(nextStepTime, stepIndex);
      nextStepTime += stepSec;
      stepIndex++;
    }
    timerId = window.setTimeout(pump, 30);
  };

  pump();

  return {
    wasBlocked,
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timerId);
      try {
        master.gain.setValueAtTime(0.0001, ctx.currentTime);
        master.disconnect();
        compressor.disconnect();
      } catch {
        // Ignorar
      }
    },
  };
}

/**
 * Pulso claro de reloj por cada segundo de espera inicial (para buscadores y fugitivos).
 */
export function playSeekerCountdownBeep(remainingSec: number): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const t0 = ctx.currentTime + 0.003;
  const master = ctx.createGain();
  master.gain.setValueAtTime((remainingSec <= 5 ? 0.3 : 0.18) * scale, t0);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(remainingSec <= 5 ? 987.77 : 659.25, t0);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(0.38, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.095);

  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.11);
}

/**
 * Tics de cuenta atrás para los últimos 30 segundos antes de acabar la partida.
 */
export function playEndgameCountdownTick(remainingSec: number): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const t0 = ctx.currentTime + 0.003;
  const isFinalFive = remainingSec <= 5;
  const isFinalTen = remainingSec <= 10;

  const master = ctx.createGain();
  master.gain.setValueAtTime(
    (isFinalFive ? 0.34 : isFinalTen ? 0.24 : 0.16) * scale,
    t0
  );
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = isFinalFive ? 'square' : 'triangle';

  const baseFreq = isFinalFive
    ? 1174.66
    : isFinalTen
    ? 932.33
    : remainingSec % 2 === 0
    ? 783.99
    : 659.25;

  osc.frequency.setValueAtTime(baseFreq, t0);
  if (isFinalFive) {
    osc.frequency.setValueAtTime(1318.51, t0 + 0.045);
  }

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(isFinalFive ? 2600 : 1900, t0);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(0.38, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (isFinalFive ? 0.12 : 0.08));

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + (isFinalFive ? 0.135 : 0.09));
}

/**
 * Alerta limpia de inicio de cacería cuando los buscadores salen.
 */
export function playHuntStartSting(): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = 0.34 * scale;
  master.connect(ctx.destination);

  playPunchyKick(ctx, master, now, 0.55);

  [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const t0 = now + idx * 0.05;
    const t1 = t0 + 0.34;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.38, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}

/**
 * Señal sonora para todos los jugadores justo al comenzar la partida.
 */
export function playMatchStartSignal(): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = 0.2 * scale;
  master.connect(ctx.destination);

  playPunchyKick(ctx, master, now, 0.5);

  const notes: Array<[number, number, number]> = [
    [392.0, 0.0, 0.14],   // G4
    [523.25, 0.11, 0.14], // C5
    [659.25, 0.22, 0.14], // E5
    [783.99, 0.33, 0.36], // G5
  ];

  notes.forEach(([freq, offset, dur]) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const t0 = now + offset;
    const t1 = t0 + dur;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.34, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}

/**
 * Aviso sonoro global para toda la sala cuando un jugador es eliminado.
 */
export function playGlobalEliminationAlert(): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = 0.2 * scale;
  master.connect(ctx.destination);

  playPunchyKick(ctx, master, now, 0.42);

  // Campana de anuncio dramática (Do6 -> Sol5 -> Lab5 -> Do5)
  const chime: Array<[number, number, number]> = [
    [1046.5, 0.0, 0.16],  // C6
    [783.99, 0.13, 0.16], // G5
    [830.61, 0.26, 0.18], // Ab5
    [523.25, 0.42, 0.42], // C5
  ];

  chime.forEach(([freq, offset, dur]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = now + offset;
    const t1 = t0 + dur;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.36, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}

/**
 * Sintonía 8-bit estilo Danganronpa de ELIMINACIÓN (alerta -> escaneo de objetivo -> transformación a calavera -> cadencia arcade).
 */
export function playElimination8BitTheme(): RetroPlaybackHandle {
  const scale = getAudioScale('music');
  const ctx = getAudioContext();
  if (!ctx || scale <= 0) {
    return { stop: () => {}, wasBlocked: !ctx };
  }

  let stopped = false;
  const nodes: AudioNode[] = [];
  const timers: number[] = [];

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const wasBlocked = ctx.state === 'suspended';

  const master = ctx.createGain();
  master.gain.value = 0.2 * scale;
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

  // FASE 1 (0.00s - 0.48s): Alarma inicial
  const introNotes = [880, 622.25, 830.61, 587.33, 783.99, 523.25];
  introNotes.forEach((f, idx) => {
    scheduleTone(f, idx * 0.075, 0.068, 'square', 0.3);
  });
  scheduleNoise(0.0, 0.12, 0.18, 1600);

  // FASE 2 (0.50s - 1.72s): Arpegio de escaneo y bloqueo de objetivo
  const tensionLead: Array<[number, number, number]> = [
    [523.25, 0.52, 0.14],
    [622.25, 0.67, 0.14],
    [587.33, 0.82, 0.14],
    [554.37, 0.97, 0.14],
    [523.25, 1.12, 0.14],
    [493.88, 1.27, 0.14],
    [466.16, 1.42, 0.14],
    [622.25, 1.57, 0.15],
  ];

  tensionLead.forEach(([freq, t, d]) => {
    scheduleTone(freq, t, d, 'square', 0.28);
    scheduleTone(freq / 2, t, d * 0.85, 'triangle', 0.36);
  });

  [0.52, 0.82, 1.12, 1.42].forEach((t) => {
    scheduleNoise(t + 0.14, 0.055, 0.14, 2000);
  });

  // FASE 3 (1.76s - 2.30s): Sello digital de ELIMINADO + transformación a calavera negra
  scheduleTone(987.77, 1.76, 0.12, 'square', 0.32, 1318.5);
  scheduleTone(523.25, 1.88, 0.38, 'triangle', 0.34, 130.81);
  scheduleNoise(1.76, 0.24, 0.28, 900);

  // FASE 4 (2.36s - 3.65s): Cadencia clásica 8-bit de "ELIMINADO" en Do menor
  const defeatCadence: Array<[number, number, number]> = [
    [392.0, 2.36, 0.2],
    [369.99, 2.58, 0.2],
    [349.23, 2.8, 0.2],
    [311.13, 3.02, 0.24],
    [261.63, 3.28, 0.65],
  ];

  defeatCadence.forEach(([freq, t, d], idx) => {
    scheduleTone(
      freq,
      t,
      d,
      'square',
      idx === defeatCadence.length - 1 ? 0.28 : 0.24,
      idx === defeatCadence.length - 1 ? freq * 0.96 : undefined
    );
    scheduleTone(freq / 2, t, d, 'triangle', 0.38);
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

/**
 * Señal luminosa sonora cuando la Baliza de Extracción se desbloquea para los fugitivos.
 */
export function playBeaconUnlockAlert(): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = 0.28 * scale;
  master.connect(ctx.destination);

  [587.33, 783.99, 987.77, 1174.66].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = now + idx * 0.065;
    const t1 = t0 + 0.28;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.36, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}

/**
 * Alerta corta de infracción si alguien desactiva la ubicación GPS en partida.
 */
export function playLocationTamperAlarm(): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = 0.3 * scale;
  master.connect(ctx.destination);

  [880, 622.25, 880].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = now + idx * 0.11;
    const t1 = t0 + 0.09;
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.28, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}

/**
 * Fanfarria final automática al declararse equipo ganador.
 */
export function playVictoryFanfare(didIWin: boolean): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.value = 0.3 * scale;
  master.connect(ctx.destination);

  playPunchyKick(ctx, master, now, 0.5);
  playPunchyKick(ctx, master, now + 0.28, 0.44);

  const notes: Array<[number, number, number]> = didIWin
    ? [
        [523.25, 0.0, 0.14],
        [659.25, 0.12, 0.14],
        [783.99, 0.24, 0.14],
        [1046.5, 0.36, 0.52],
      ]
    : [
        [392.0, 0.0, 0.18],
        [349.23, 0.18, 0.18],
        [311.13, 0.36, 0.2],
        [261.63, 0.56, 0.52],
      ];

  notes.forEach(([freq, offset, dur]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = now + offset;
    const t1 = t0 + dur;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.38, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}

/**
 * Sonido estilizado estilo Danganronpa al expulsar a un jugador de la sala.
 */
export function playPlayerKickedSting(isVictim = false): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = (isVictim ? 0.34 : 0.24) * scale;
  master.connect(ctx.destination);

  const tone = (
    freq: number,
    offset: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    endFreq?: number
  ) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const t0 = now + offset;
    const t1 = t0 + dur;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t1);
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  };

  if (isVictim) {
    // Golpe dramático de expulsión estilo juicio (alarma + bajada + doble mazo)
    playPunchyKick(ctx, master, now, 0.65);
    playSoftHat(ctx, master, now, 0.24, 0.09);
    tone(1046.5, 0.0, 0.11, 'square', 0.32, 622.25);
    tone(880.0, 0.11, 0.11, 'square', 0.32, 523.25);
    tone(783.99, 0.22, 0.22, 'sawtooth', 0.28, 261.63);

    playPunchyKick(ctx, master, now + 0.46, 0.72);
    playPunchyKick(ctx, master, now + 0.64, 0.76);
    tone(311.13, 0.46, 0.16, 'square', 0.34);
    tone(261.63, 0.64, 0.48, 'sawtooth', 0.36, 130.81);
    tone(130.81, 0.64, 0.5, 'triangle', 0.45);
  } else {
    // Confirmación rápida para el anfitrión al expulsar
    playPunchyKick(ctx, master, now, 0.5);
    playSoftHat(ctx, master, now + 0.06, 0.14, 0.05);
    tone(659.25, 0.0, 0.08, 'triangle', 0.34);
    tone(440.0, 0.08, 0.16, 'triangle', 0.36, 220.0);
  }
}

/**
 * Música animada y pegadiza estilo Danganronpa para la pantalla de VICTORIA o DERROTA.
 * Usa un secuenciador de pasos real con compresor dinámico, batería, bajo de octavas,
 * acordes staccato y melodía sintetizada protagonista en bucle.
 */
export function playMatchResultTheme(didIWin: boolean): RetroPlaybackHandle {
  const ctx = getAudioContext();
  if (!ctx) {
    return { stop: () => {}, wasBlocked: true };
  }

  let stopped = false;
  let timerId = 0;

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  const wasBlocked = ctx.state === 'suspended';

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -11;
  compressor.knee.value = 10;
  compressor.ratio.value = 5.5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = (didIWin ? 0.36 : 0.34) * getAudioScale('music');
  master.connect(compressor);

  const playSnareClap = (time: number, vol = 0.24) => {
    // Cuerpo tonal
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(195, time);
    osc.frequency.exponentialRampToValueAtTime(95, time + 0.085);
    og.gain.setValueAtTime(0.0001, time);
    og.gain.linearRampToValueAtTime(vol * 0.85, time + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
    osc.connect(og);
    og.connect(master);
    osc.start(time);
    osc.stop(time + 0.11);

    // Ruido crujiente
    const src = ctx.createBufferSource();
    src.buffer = createNoiseBuffer(ctx, 0.12);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, time);
    bp.Q.setValueAtTime(0.9, time);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, time);
    ng.gain.linearRampToValueAtTime(vol, time + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(master);
    src.start(time);
    src.stop(time + 0.12);
  };

  const playSynthTone = (
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    cutoff = 3600,
    detuneCents = 0
  ) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (detuneCents !== 0) osc.detune.setValueAtTime(detuneCents, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(420, cutoff * 0.45), time + dur);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.008);
    gain.gain.setValueAtTime(vol * 0.82, Math.max(time + 0.01, time + dur * 0.72));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + dur + 0.015);
  };

  if (didIWin) {
    // Nueva sintonía de VICTORIA: himno arcade/anime electro-pop en La Mayor a 158 BPM (A - E - F#m - D -> E)
    const stepSec = 60 / 158 / 4; // ~0.0949s

    // Bajo saltarín octavado (A2/A3 -> E2/E3 -> F#2/F#3 -> D2/D3-E2/E3)
    const bassFreqs: number[] = [
      // Compás 1 (A -> E)
      110.0, 220.0, 110.0, 220.0, 110.0, 220.0, 138.59, 220.0,
      82.41, 164.81, 82.41, 164.81, 82.41, 164.81, 98.0, 164.81,
      // Compás 2 (F#m -> D -> E)
      92.5, 185.0, 92.5, 185.0, 92.5, 185.0, 110.0, 185.0,
      73.42, 146.83, 73.42, 146.83, 82.41, 164.81, 98.0, 196.0,
      // Compás 3 (A -> E)
      110.0, 220.0, 110.0, 220.0, 110.0, 220.0, 138.59, 220.0,
      82.41, 164.81, 82.41, 164.81, 103.83, 207.65, 82.41, 164.81,
      // Compás 4 (D -> E -> A triunfo)
      73.42, 146.83, 73.42, 146.83, 82.41, 164.81, 103.83, 207.65,
      110.0, 220.0, 110.0, 220.0, 138.59, 164.81, 196.0, 220.0,
    ];

    // Nueva melodía protagonista en La Mayor (gancho brillante estilo "¡Bala de la Verdad!")
    const leadPattern: Array<[number, number] | null> = new Array(64).fill(null);
    const putLead = (step: number, freq: number, lenSteps: number) => {
      leadPattern[step] = [freq, lenSteps];
    };

    // Frase 1: E6 - C#6 - A5 - B5 - C#6 - E6 - G#5 - B5
    putLead(0, 1318.51, 1.7);  // E6
    putLead(2, 1108.73, 1.7);  // C#6
    putLead(4, 880.0, 2.2);    // A5
    putLead(7, 987.77, 1.4);   // B5
    putLead(9, 1108.73, 1.8);  // C#6
    putLead(11, 1318.51, 2.4); // E6
    putLead(14, 1244.51, 1.6); // D#6 paso brillante

    // Frase 2: F#6 - E6 - C#6 - A5 - D6 - E6 - B5
    putLead(16, 1479.98, 2.2); // F#6
    putLead(19, 1318.51, 1.6); // E6
    putLead(21, 1108.73, 1.8); // C#6
    putLead(23, 880.0, 1.6);   // A5
    putLead(25, 1174.66, 2.0); // D6
    putLead(28, 1318.51, 1.8); // E6
    putLead(30, 987.77, 1.8);  // B5

    // Frase 3 (subida eufórica): A5 - C#6 - E6 - A6!! - G#6 - E6
    putLead(32, 880.0, 1.5);   // A5
    putLead(34, 1108.73, 1.5); // C#6
    putLead(36, 1318.51, 2.2); // E6
    putLead(39, 1760.0, 3.4);  // A6!
    putLead(43, 1661.22, 1.8); // G#6
    putLead(45, 1318.51, 2.4); // E6

    // Frase 4 (remate triunfal): F#6 - E6 - D6 - E6 - A6!!
    putLead(48, 1479.98, 1.8); // F#6
    putLead(50, 1318.51, 1.6); // E6
    putLead(52, 1174.66, 1.8); // D6
    putLead(54, 1318.51, 1.8); // E6
    putLead(56, 1760.0, 4.4);  // A6!
    putLead(61, 1318.51, 1.2); // E6 pickup
    putLead(62, 1479.98, 1.2); // F#6 pickup

    const chordStabs: Record<number, number[]> = {
      0: [440.0, 554.37, 659.25],    // A
      8: [329.63, 415.3, 493.88],    // E
      16: [369.99, 440.0, 554.37],   // F#m
      24: [293.66, 369.99, 440.0],   // D
      28: [329.63, 415.3, 493.88],   // E
      32: [440.0, 554.37, 659.25],   // A
      40: [329.63, 415.3, 493.88],   // E
      48: [293.66, 369.99, 440.0],   // D
      52: [329.63, 415.3, 493.88],   // E
      56: [440.0, 554.37, 659.25],   // A
    };

    const arpScale = [880.0, 1108.73, 1318.51, 1661.22, 1760.0, 1318.51, 1108.73, 1479.98];

    let stepIndex = 0;
    let nextTime = ctx.currentTime + 0.03;

    const scheduleStep = (time: number, idx: number) => {
      const s = idx % 64;

      if (s % 4 === 0 || (s >= 60 && s % 2 === 0)) {
        playPunchyKick(ctx, master, time, 0.54);
      }
      if (s % 8 === 4 || (s >= 60 && s % 2 === 1)) {
        playSnareClap(time, s >= 60 ? 0.24 : 0.3);
      }
      playSoftHat(ctx, master, time, s % 2 === 0 ? 0.11 : 0.065, s % 4 === 2 ? 0.065 : 0.025);

      playSynthTone(bassFreqs[s], time, stepSec * 0.88, 'sawtooth', 0.26, 1020);

      const stab = chordStabs[s];
      if (stab) {
        stab.forEach((f) => {
          playSynthTone(f, time, stepSec * 2.4, 'triangle', 0.12, 2800);
        });
      }

      if (s % 2 === 1) {
        const arpF = arpScale[(s >> 1) % arpScale.length];
        playSynthTone(arpF, time, stepSec * 0.85, 'sine', 0.095, 4400);
      }

      const hit = leadPattern[s];
      if (hit) {
        const [f, len] = hit;
        const dur = stepSec * len;
        playSynthTone(f, time, dur, 'triangle', 0.28, 4600, -6);
        playSynthTone(f, time, dur, 'sawtooth', 0.18, 3800, 6);
        playSynthTone(f / 2, time, dur, 'sine', 0.14, 1600);
      }
    };

    const pump = () => {
      if (stopped) return;
      master.gain.setValueAtTime(0.36 * getAudioScale('music'), ctx.currentTime);
      while (nextTime < ctx.currentTime + 0.14) {
        scheduleStep(nextTime, stepIndex);
        nextTime += stepSec;
        stepIndex++;
      }
      timerId = window.setTimeout(pump, 28);
    };
    pump();
  } else {
    // Nueva sintonía de DERROTA: groove rítmico estilo juicio en Re menor / frigio a 136 BPM (Dm - Bb - Gm - A7)
    const stepSec = 60 / 136 / 4; // ~0.1103s

    const bassPattern: Array<number | null> = [
      146.83, null, 293.66, 146.83, null, 174.61, 196.0, null,
      116.54, null, 233.08, null, 130.81, null, 110.0, 123.47,
      98.0, null, 196.0, 98.0, null, 174.61, 164.81, null,
      110.0, null, 220.0, 110.0, 138.59, null, 164.81, 110.0,
    ];

    const leadPattern: Array<[number, number] | null> = new Array(32).fill(null);
    leadPattern[0] = [587.33, 1.8];  // D5
    leadPattern[2] = [698.46, 1.6];  // F5
    leadPattern[4] = [880.0, 2.2];   // A5
    leadPattern[7] = [830.61, 1.6];  // Ab5 (tensión juicio)
    leadPattern[9] = [783.99, 1.8];  // G5
    leadPattern[11] = [698.46, 1.8]; // F5
    leadPattern[13] = [659.25, 1.6]; // E5
    leadPattern[15] = [554.37, 1.6]; // C#5

    leadPattern[16] = [880.0, 2.0];  // A5
    leadPattern[19] = [932.33, 1.8]; // Bb5
    leadPattern[21] = [880.0, 1.8];  // A5
    leadPattern[23] = [783.99, 1.8]; // G5
    leadPattern[25] = [698.46, 1.8]; // F5
    leadPattern[27] = [659.25, 1.8]; // E5
    leadPattern[29] = [587.33, 2.6]; // D5

    const defeatStabs: Record<number, number[]> = {
      0: [293.66, 349.23, 440.0],  // Dm
      8: [233.08, 293.66, 349.23], // Bb
      16: [196.0, 233.08, 293.66], // Gm
      24: [220.0, 277.18, 329.63], // A
    };

    let stepIndex = 0;
    let nextTime = ctx.currentTime + 0.03;

    const scheduleStep = (time: number, idx: number) => {
      const s = idx % 32;

      if (s % 4 === 0 || s % 16 === 14) {
        playPunchyKick(ctx, master, time, 0.5);
      }
      if (s % 8 === 4) {
        playSnareClap(time, 0.27);
      }
      if (s % 2 === 1) {
        playSoftHat(ctx, master, time, 0.09, 0.03);
      }

      const b = bassPattern[s];
      if (b !== null) {
        playSynthTone(b, time, stepSec * 1.4, 'sawtooth', 0.28, 820);
      }

      const stab = defeatStabs[s];
      if (stab) {
        stab.forEach((f) => {
          playSynthTone(f, time, stepSec * 2.2, 'triangle', 0.11, 1900);
        });
      }

      const hit = leadPattern[s];
      if (hit) {
        const [f, len] = hit;
        const dur = stepSec * len;
        playSynthTone(f, time, dur, 'square', 0.16, 2400, -5);
        playSynthTone(f, time, dur, 'triangle', 0.25, 3200, 5);
      }
    };

    const pump = () => {
      if (stopped) return;
      master.gain.setValueAtTime(0.34 * getAudioScale('music'), ctx.currentTime);
      while (nextTime < ctx.currentTime + 0.14) {
        scheduleStep(nextTime, stepIndex);
        nextTime += stepSec;
        stepIndex++;
      }
      timerId = window.setTimeout(pump, 28);
    };
    pump();
  }

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timerId);
    try {
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.disconnect();
      compressor.disconnect();
    } catch {
      // Ignorar
    }
  };

  return { stop, wasBlocked };
}

/**
 * Pulso limpio de sonar para el Modo Radar.
 */
export function playRadarSweepPing(detectedCount = 0): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.005;
  const master = ctx.createGain();
  master.gain.value = (detectedCount > 0 ? 0.22 : 0.1) * scale;
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(detectedCount > 0 ? 1318.5 : 880, now);
  osc.frequency.exponentialRampToValueAtTime(
    detectedCount > 0 ? 987.77 : 660,
    now + 0.28
  );

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + 0.36);

  if (detectedCount > 0) {
    const blip = ctx.createOscillator();
    const bGain = ctx.createGain();
    blip.type = 'triangle';
    blip.frequency.setValueAtTime(1760, now + 0.12);
    bGain.gain.setValueAtTime(0.0001, now + 0.12);
    bGain.gain.linearRampToValueAtTime(0.28, now + 0.13);
    bGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    blip.connect(bGain);
    bGain.connect(master);
    blip.start(now + 0.12);
    blip.stop(now + 0.34);
  }
}

/**
 * Aviso sonoro cuando comienza el reto de hacerse una foto con el cazador.
 */
export function playPhotoChallengeAlert(): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.008;
  const master = ctx.createGain();
  master.gain.value = 0.26 * scale;
  master.connect(ctx.destination);

  [783.99, 1046.5, 1318.5].forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = now + idx * 0.08;
    const t1 = t0 + 0.16;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.36, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}

/**
 * Muestra rápida de música para probar el volumen en Configuración.
 */
export function playMusicPreviewSample(): void {
  unlockRetroAudio();
  const handle = playMatchStartSuspenseTheme();
  window.setTimeout(() => {
    handle.stop();
  }, 1900);
}

/**
 * Aviso sonoro cuando un fugitivo es infectado y pasa al bando de los buscadores.
 */
export function playInfectionAlert(isSelfInfected = false): void {
  const scale = getAudioScale('sfx');
  if (scale <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.008;
  const master = ctx.createGain();
  master.gain.value = (isSelfInfected ? 0.34 : 0.22) * scale;
  master.connect(ctx.destination);

  playPunchyKick(ctx, master, now, isSelfInfected ? 0.6 : 0.42);

  const notes: Array<[number, number, number]> = isSelfInfected
    ? [
        [329.63, 0.0, 0.1],
        [440.0, 0.09, 0.1],
        [622.25, 0.18, 0.12],
        [880.0, 0.29, 0.34],
      ]
    : [
        [622.25, 0.0, 0.12],
        [493.88, 0.11, 0.12],
        [739.99, 0.22, 0.28],
      ];

  notes.forEach(([freq, offset, dur]) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const t0 = now + offset;
    const t1 = t0 + dur;

    osc.type = isSelfInfected ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2400, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.36, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  });
}


