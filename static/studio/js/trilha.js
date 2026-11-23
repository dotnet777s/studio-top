// Trilhas automáticas sintetizadas no navegador (sem direitos autorais).
// Como o app gera a música, sabe exatamente onde cai cada batida — os cortes encaixam perfeitamente.

export const ESTILOS_TRILHA = {
  phonk: { nome: 'Phonk (car edit)', bpm: 130 },
  trap: { nome: 'Trap escuro (premium/revelação)', bpm: 140 },
  house: { nome: 'House energético', bpm: 124 },
  funk: { nome: 'Funk BR (batidão)', bpm: 130 },
  chill: { nome: 'Chill / lo-fi (calmo)', bpm: 96 },
};

const NOTA = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

function rng(semente) {
  let s = semente >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// progressões em Lá menor / Mi menor (graus em semitons a partir da tônica)
const PROGRESSOES = [[0, 8, 3, 10], [0, 5, 8, 7], [0, 10, 8, 7], [0, 3, 8, 10]];

export async function gerarTrilha({ estilo = 'house', dur = 40, semente = Date.now() } = {}) {
  const cfg = ESTILOS_TRILHA[estilo] || ESTILOS_TRILHA.house;
  const bpm = cfg.bpm;
  const sr = 44100;
  const ac = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const r = rng(semente);
  const beat = 60 / bpm, bar = beat * 4, s16 = beat / 4;
  const nBars = Math.ceil(dur / bar);
  const tonica = estilo === 'phonk' || estilo === 'trap' ? 40 : 45; // E2 / A2
  const prog = PROGRESSOES[Math.floor(r() * PROGRESSOES.length)];

  // mix: compressão "bombando" + saturação leve
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.12;
  const master = ac.createGain(); master.gain.value = 0.9;
  comp.connect(master).connect(ac.destination);
  const bus = ac.createGain(); bus.connect(comp);
  // sidechain fake: abaixa os sons harmônicos a cada bumbo
  const duck = ac.createGain(); duck.connect(bus);

  const ruidoBuf = ac.createBuffer(1, sr, sr);
  const rd = ruidoBuf.getChannelData(0);
  for (let i = 0; i < rd.length; i++) rd[i] = Math.random() * 2 - 1;
  const ruido = (t, d) => { const n = ac.createBufferSource(); n.buffer = ruidoBuf; n.start(t, Math.random() * 0.5, d); return n; };
  const env = (g, t, a, v, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); };
  const satura = (() => { const w = ac.createWaveShaper(); const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 2.5); } w.curve = c; return w; })();
  satura.connect(bus);

  const kick = (t, longo = false, v = 1) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(longo ? 120 : 160, t); o.frequency.exponentialRampToValueAtTime(longo ? 42 : 48, t + 0.11);
    env(g, t, 0.003, 1.0 * v, longo ? 0.7 : 0.32);
    o.connect(g).connect(satura); o.start(t); o.stop(t + 0.8);
    duck.gain.setValueAtTime(0.35, t); duck.gain.linearRampToValueAtTime(1, t + beat * 0.6);
  };
  const clap = (t, v = 0.6) => {
    for (const k of [0, 0.012, 0.024]) {
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.9;
      const g = ac.createGain(); env(g, t + k, 0.001, v, t + k + (k === 0.024 ? 0.18 : 0.02) - (t + k) + 0.001);
      ruido(t + k, 0.2).connect(f).connect(g).connect(bus);
    }
  };
  const snare = (t, v = 0.55) => {
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    const g = ac.createGain(); env(g, t, 0.001, v, 0.16);
    ruido(t, 0.2).connect(f).connect(g).connect(bus);
    const o = ac.createOscillator(), go = ac.createGain(); o.frequency.value = 190; env(go, t, 0.001, v * 0.5, 0.08);
    o.connect(go).connect(bus); o.start(t); o.stop(t + 0.1);
  };
  const hat = (t, aberto = false, v = 0.22) => {
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ac.createGain(); env(g, t, 0.001, v, aberto ? 0.22 : 0.035);
    ruido(t, aberto ? 0.25 : 0.05).connect(f).connect(g).connect(bus);
  };
  const baixo808 = (t, nota, d, v = 0.8, glideDe = null) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    if (glideDe) { o.frequency.setValueAtTime(NOTA(glideDe), t); o.frequency.exponentialRampToValueAtTime(NOTA(nota), t + 0.08); } else o.frequency.setValueAtTime(NOTA(nota), t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.setValueAtTime(v, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(satura); o.start(t); o.stop(t + d + 0.05);
  };
  const baixoSynth = (t, nota, d, v = 0.35) => {
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = NOTA(nota); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + d);
    env(g, t, 0.005, v, d); o.connect(f).connect(g).connect(duck); o.start(t); o.stop(t + d + 0.05);
  };
  const acorde = (t, raiz, d, v = 0.12, tipo = 'sawtooth', corte = 1600) => {
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = corte;
    const g = ac.createGain(); env(g, t, 0.01, v, d); f.connect(g).connect(duck);
    for (const iv of [0, 3, 7, 12]) for (const det of [-6, 6]) {
      const o = ac.createOscillator(); o.type = tipo; o.frequency.value = NOTA(raiz + iv); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.05);
    }
  };
  const cowbell = (t, nota, v = 0.22) => { // timbre clássico do phonk
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 1.2;
    const g = ac.createGain(); env(g, t, 0.001, v, 0.28); f.connect(g).connect(duck);
    for (const m of [1, 1.48]) { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = NOTA(nota) * m; o.connect(f); o.start(t); o.stop(t + 0.3); }
  };
  const piano = (t, raiz, d, v = 0.1) => {
    const g = ac.createGain(); env(g, t, 0.005, v, d); g.connect(duck);
    for (const iv of [0, 3, 7, 10]) { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = NOTA(raiz + 12 + iv); o.connect(g); o.start(t); o.stop(t + d + 0.05); }
  };
  const crash = (t, v = 0.25) => {
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
    const g = ac.createGain(); env(g, t, 0.002, v, 1.6); ruido(t, 1.0).connect(f).connect(g).connect(bus);
  };

  const escala = [0, 3, 5, 7, 10, 12]; // pentatônica menor
  const riff = [...Array(8)].map(() => escala[Math.floor(r() * escala.length)]);

  for (let b = 0; b < nBars; b++) {
    const t0 = b * bar;
    const raiz = tonica + prog[b % prog.length];
    const intro = b === 0;
    const virada = b % 8 === 7;
    if (b % 8 === 0) crash(t0, intro ? 0.18 : 0.28);

    if (estilo === 'house') {
      for (let k = 0; k < 4; k++) { if (!intro || k > 1) kick(t0 + k * beat); hat(t0 + k * beat + beat / 2, true, 0.18); }
      clap(t0 + beat); clap(t0 + 3 * beat);
      for (let k = 0; k < 16; k++) if (k % 2) hat(t0 + k * s16, false, 0.1);
      for (let k = 0; k < 4; k++) baixoSynth(t0 + k * beat + beat / 2, raiz, beat * 0.45);
      for (const k of [0, 3, 6, 10, 12]) acorde(t0 + k * s16, raiz + 12, s16 * 1.6, 0.07, 'sawtooth', 2400);
    } else if (estilo === 'phonk' || estilo === 'trap') {
      // meio-tempo: bumbo no 1, caixa no 3
      kick(t0, true); if (r() > 0.4) kick(t0 + 2.5 * beat, true, 0.8);
      if (estilo === 'phonk') clap(t0 + 2 * beat, 0.7); else snare(t0 + 2 * beat, 0.6);
      for (let k = 0; k < 16; k++) {
        const rolo = (virada && k >= 12) || (estilo === 'trap' && r() > 0.85);
        hat(t0 + k * s16, false, 0.12);
        if (rolo) hat(t0 + k * s16 + s16 / 2, false, 0.09);
      }
      baixo808(t0, raiz, beat * 2.2, 0.75, b % 2 ? raiz + 12 : null);
      baixo808(t0 + 2.5 * beat, raiz + (estilo === 'phonk' ? 0 : -2), beat * 1.3, 0.6);
      if (estilo === 'phonk') for (let k = 0; k < 8; k++) cowbell(t0 + k * beat / 2, tonica + 36 + riff[(k + b) % riff.length], 0.2);
      else acorde(t0, raiz + 12, bar * 0.95, 0.06, 'triangle', 900);
    } else if (estilo === 'funk') {
      // tamborzão: 3-3-2 nas semicolcheias
      for (const k of [0, 3, 6, 8, 11, 14]) kick(t0 + k * s16, false, k % 8 === 0 ? 1 : 0.8);
      for (const k of [4, 12]) clap(t0 + k * s16, 0.6);
      for (const k of [2, 7, 10, 15]) snare(t0 + k * s16, 0.25);
      for (let k = 0; k < 8; k++) hat(t0 + k * beat / 2 + s16, false, 0.12);
      if (b % 2 === 0) for (const k of [0, 6, 10]) acorde(t0 + k * s16, raiz + 12, s16 * 1.2, 0.08, 'square', 2600);
      baixo808(t0, raiz, beat * 1.4, 0.6);
    } else { // chill
      kick(t0, false, 0.7); kick(t0 + 2.5 * beat, false, 0.5);
      snare(t0 + beat, 0.3); snare(t0 + 3 * beat, 0.3);
      for (let k = 0; k < 8; k++) hat(t0 + k * beat / 2, false, k % 2 ? 0.06 : 0.1);
      piano(t0, raiz, bar * 0.9, 0.09);
      baixoSynth(t0, raiz, beat * 1.8, 0.25); baixoSynth(t0 + 2 * beat, raiz + 7, beat * 1.8, 0.2);
    }
    if (virada) { for (let k = 12; k < 16; k++) snare(t0 + k * s16, 0.25 + k * 0.03); }
  }
  const buf = await ac.startRendering();
  const batidas = [];
  for (let t = 0; t < dur; t += beat) batidas.push(+t.toFixed(4));
  return { buffer: buf, bpm, batidas, nome: `${cfg.nome} · ${bpm} BPM` };
}

/** Estilo de trilha recomendado para o formato/tom do roteiro. */
export function estiloPara(formato, tom = '') {
  if (/premium|sofistic/i.test(tom)) return formato === 'car_edit' ? 'phonk' : 'trap';
  if (/calmo|confian|próximo/i.test(tom)) return 'chill';
  return {
    car_edit: 'phonk', revelacao: 'trap', detalhes: 'trap', pov: 'house', tour_rapido: 'house', para_quem: 'house',
    tres_motivos: 'funk', adivinhe_preco: 'funk', unidade_unica: 'phonk', checklist: 'house', mito_verdade: 'house', comparativo: 'house',
  }[formato] || 'house';
}
