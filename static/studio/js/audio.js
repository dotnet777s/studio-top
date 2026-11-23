// Áudio: carregamento, efeitos sintetizados, mixagem (prévia e exportação) e detecção de batidas.
import { TL, take, mediaUrl, duracao } from './estado.js';

let ctxDecodificar = null;
const cache = new Map();

export function buffer(url) {
  if (!url) return Promise.resolve(null);
  if (!cache.has(url)) {
    ctxDecodificar ||= new AudioContext();
    const p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`áudio ${r.status}`); return r.arrayBuffer(); })
      .then((b) => ctxDecodificar.decodeAudioData(b))
      .catch((e) => { cache.delete(url); console.warn('Falha ao carregar áudio', url, e); return null; });
    cache.set(url, p);
  }
  return cache.get(url);
}
export const bufferPronto = (url) => cache.get(url);

/** URLs de todo áudio usado na timeline. */
function urlsUsadas() {
  const tl = TL();
  const urls = tl.narracoes.filter((n) => n.url).map((n) => mediaUrl(n.url));
  for (const c of tl.clips) {
    const tk = take(c.takeId);
    if ((c.volume || 0) > 0 && tk?.audio) urls.push(mediaUrl(tk.audio));
  }
  if (tl.musica?.url) urls.push(mediaUrl(tl.musica.url));
  return urls;
}
export async function precarregar() {
  const urls = urlsUsadas();
  const bufs = await Promise.all(urls.map(buffer));
  return new Map(urls.map((u, i) => [u, bufs[i]]));
}

// ---------------------------------------------------------------- efeitos sintetizados

const ruidos = new WeakMap();
function ruido(ac) {
  if (!ruidos.has(ac)) {
    const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ruidos.set(ac, b);
  }
  return ruidos.get(ac);
}

export const SFX = {
  whoosh: 'Whoosh (passagem)', impacto: 'Impacto (boom)', riser: 'Riser (suspense)',
  pop: 'Pop (etiqueta)', clique: 'Clique', dinheiro: 'Dinheiro (preço)',
};

export function sfx(ac, tipo, q, vol = 0.8, dest = ac.destination, semente = 0) {
  const v = semente ? 1 + ((Math.abs(semente) % 31) - 15) / 100 : 1; // cada efeito soa um pouco diferente
  const g = ac.createGain();
  g.connect(dest);
  g.gain.setValueAtTime(0, q);
  const fonteRuido = (dur) => { const n = ac.createBufferSource(); n.buffer = ruido(ac); n.start(q, Math.random(), dur); return n; };
  const osc = (tipoOnda, f0, f1, dur) => {
    const o = ac.createOscillator(); o.type = tipoOnda;
    o.frequency.setValueAtTime(f0, q); o.frequency.exponentialRampToValueAtTime(f1, q + dur);
    o.start(q); o.stop(q + dur + 0.05); return o;
  };
  switch (tipo) {
    case 'whoosh': {
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(350 * v, q); f.frequency.exponentialRampToValueAtTime(4200 * v, q + 0.22 * v); f.frequency.exponentialRampToValueAtTime(700 * v, q + 0.5);
      fonteRuido(0.55).connect(f).connect(g);
      g.gain.linearRampToValueAtTime(vol * 1.1, q + 0.18); g.gain.exponentialRampToValueAtTime(0.001, q + 0.52);
      break;
    }
    case 'impacto': {
      osc('sine', 130 * v, 38 * v, 0.6).connect(g);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const gr = ac.createGain(); gr.gain.setValueAtTime(vol * 0.7, q); gr.gain.exponentialRampToValueAtTime(0.001, q + 0.25);
      fonteRuido(0.3).connect(f).connect(gr).connect(dest);
      g.gain.linearRampToValueAtTime(vol * 1.2, q + 0.01); g.gain.exponentialRampToValueAtTime(0.001, q + 0.7);
      break;
    }
    case 'riser': {
      const dur = 1.2;
      const f = ac.createBiquadFilter(); f.type = 'highpass';
      f.frequency.setValueAtTime(300 * v, q); f.frequency.exponentialRampToValueAtTime(7000 * v, q + dur);
      fonteRuido(dur).connect(f).connect(g);
      const go = ac.createGain(); go.gain.value = 0.25; go.connect(g);
      osc('sawtooth', 180, 900, dur).connect(go);
      g.gain.linearRampToValueAtTime(vol * 0.6, q + dur * 0.95); g.gain.linearRampToValueAtTime(0, q + dur);
      break;
    }
    case 'pop': {
      osc('sine', 480 * v, 1500 * v, 0.07).connect(g);
      g.gain.linearRampToValueAtTime(vol * 0.9, q + 0.005); g.gain.exponentialRampToValueAtTime(0.001, q + 0.14);
      break;
    }
    case 'clique': {
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
      fonteRuido(0.03).connect(f).connect(g);
      g.gain.linearRampToValueAtTime(vol, q + 0.002); g.gain.exponentialRampToValueAtTime(0.001, q + 0.03);
      break;
    }
    case 'dinheiro': {
      for (const [atraso, freq] of [[0, 2093], [0.07, 2637], [0.07, 3136]]) {
        const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
        const go = ac.createGain(); go.gain.setValueAtTime(0, q + atraso);
        go.gain.linearRampToValueAtTime(vol * 0.35, q + atraso + 0.005); go.gain.exponentialRampToValueAtTime(0.001, q + atraso + 0.7);
        o.connect(go).connect(dest); o.start(q + atraso); o.stop(q + atraso + 0.75);
      }
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
      fonteRuido(0.25).connect(f).connect(g);
      g.gain.linearRampToValueAtTime(vol * 0.25, q + 0.01); g.gain.exponentialRampToValueAtTime(0.001, q + 0.3);
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- agendamento (prévia e exportação usam o mesmo)

/** Intervalos com voz (narração ou som original alto), para baixar a música. */
function intervalosDeVoz() {
  const tl = TL();
  const iv = tl.narracoes.filter((n) => n.url).map((n) => [n.inicio, n.inicio + n.dur]);
  for (const c of tl.clips) if ((c.volume || 0) >= 0.3) iv.push([c.start, c.start + c.dur]);
  return iv;
}

function ganhoMusica(t, m, total, voz) {
  let g = m.volume ?? 0.4;
  if (m.ducking !== false) {
    let duck = 0;
    for (const [a, b] of voz) {
      if (t >= a - 0.15 && t <= b + 0.25) {
        const entrada = Math.min(1, (t - (a - 0.15)) / 0.15);
        const saida = Math.min(1, ((b + 0.25) - t) / 0.25);
        duck = Math.max(duck, Math.min(entrada, saida));
      }
    }
    g *= 1 - duck * 0.7; // música cai para 30% sob a voz
  }
  if (t < 0.3) g *= t / 0.3;
  if (t > total - 1.2) g *= Math.max(0, (total - t) / 1.2);
  return Math.max(0, g);
}

/**
 * Agenda todo o áudio da timeline a partir do tempo `t0` da timeline.
 * `base` = horário do AudioContext que corresponde a t0. Retorna os nós para poder parar.
 */
export function agendar(ac, dest, t0, base, bufs) {
  const tl = TL();
  const total = duracao();
  const nos = [];

  const tocar = (buf, inicioTL, offset, dur, rate, saida) => {
    if (!buf) return;
    let ini = inicioTL, off = offset, d = dur;
    if (t0 > ini) { const pulo = t0 - ini; off += pulo * rate; d -= pulo; ini = t0; }
    if (d <= 0.02) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(saida);
    if (off >= buf.duration) { if (!src.loop) return; off %= buf.duration; }
    src.start(base + (ini - t0), off, src.loop ? undefined : d * rate);
    if (src.loop) src.stop(base + (ini - t0) + d);
    nos.push(src);
    return src;
  };

  for (const n of tl.narracoes) {
    if (!n.url) continue;
    const g = ac.createGain(); g.gain.value = n.volume ?? 1; g.connect(dest);
    tocar(bufs.get(mediaUrl(n.url)), n.inicio, n.in || 0, n.dur, 1, g); // n.in: fala que começa no meio do take
  }
  for (const c of tl.clips) {
    const tk = take(c.takeId);
    if (!((c.volume || 0) > 0 && tk?.audio)) continue;
    const g = ac.createGain(); g.gain.value = c.volume; g.connect(dest);
    tocar(bufs.get(mediaUrl(tk.audio)), c.start, c.in, c.dur, c.speed || 1, g);
  }
  for (const s of tl.sfx) {
    if (s.inicio + 0.05 < t0) continue;
    sfx(ac, s.tipo, base + (s.inicio - t0), s.volume ?? 0.8, dest, [...String(s.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
  }
  const m = tl.musica;
  const mb = m && bufs.get(mediaUrl(m.url));
  if (mb) {
    const g = ac.createGain(); g.connect(dest);
    const voz = intervalosDeVoz();
    const passo = 0.04;
    const ini = Math.max(t0, m.inicio || 0);
    const n = Math.max(2, Math.ceil((total - ini) / passo) + 1);
    const curva = new Float32Array(n);
    for (let i = 0; i < n; i++) curva[i] = ganhoMusica(ini + i * passo, m, total, voz);
    g.gain.setValueAtTime(curva[0], base + (ini - t0));
    g.gain.setValueCurveAtTime(curva, base + (ini - t0), Math.max(0.05, (n - 1) * passo));
    const src = ac.createBufferSource();
    src.buffer = mb; src.loop = true; src.connect(g);
    const offset = ((m.offset || 0) + Math.max(0, t0 - (m.inicio || 0))) % mb.duration;
    src.start(base + (ini - t0), offset);
    src.stop(base + (total - t0) + 0.05);
    nos.push(src);
  }
  return nos;
}

export class PlayerAudio {
  constructor() { this.ac = null; this.nos = []; this.saida = null; this.base = 0; }
  async tocar(t0) {
    this.parar();
    this.ac ||= new AudioContext({ latencyHint: 'interactive' });
    await this.ac.resume();
    const bufs = await precarregar();
    this.saida = this.ac.createGain();
    this.saida.connect(this.ac.destination);
    this.base = this.ac.currentTime + 0.08;
    this.nos = agendar(this.ac, this.saida, t0, this.base, bufs);
    return this.base;
  }
  agora() { return this.ac ? this.ac.currentTime : 0; }
  parar() {
    for (const n of this.nos) { try { n.stop(); } catch { /* já parou */ } }
    this.nos = [];
    if (this.saida) { try { this.saida.disconnect(); } catch { /* */ } this.saida = null; }
  }
  /** Toca um efeito avulso (botões de prévia). */
  async previa(tipo) {
    this.ac ||= new AudioContext();
    await this.ac.resume();
    sfx(this.ac, tipo, this.ac.currentTime + 0.02, 0.8);
  }
}

export async function mixar() {
  const total = duracao();
  const sr = 48000;
  const ac = new OfflineAudioContext(2, Math.ceil((total + 0.1) * sr), sr);
  const bufs = await precarregar();
  const limit = ac.createDynamicsCompressor(); // segura picos (limitador simples)
  limit.threshold.value = -3; limit.knee.value = 2; limit.ratio.value = 12; limit.attack.value = 0.003; limit.release.value = 0.15;
  limit.connect(ac.destination);
  agendar(ac, limit, 0, 0, bufs);
  return ac.startRendering();
}

export function paraWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const dados = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => dados.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); dados.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dados.setUint32(16, 16, true); dados.setUint16(20, 1, true); dados.setUint16(22, ch, true);
  dados.setUint32(24, sr, true); dados.setUint32(28, sr * ch * 2, true); dados.setUint16(32, ch * 2, true);
  dados.setUint16(34, 16, true); str(36, 'data'); dados.setUint32(40, n * ch * 2, true);
  const canais = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, canais[c][i]));
      dados.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
    }
  }
  return new Blob([dados], { type: 'audio/wav' });
}

// ---------------------------------------------------------------- batidas e forma de onda

export function detectarBatidas(buf) {
  const sr = buf.sampleRate, d = buf.getChannelData(0);
  const hop = 512, n = Math.floor(d.length / hop);
  const env = new Float32Array(n);
  let ant = 0;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) e += d[j] * d[j];
    e = Math.sqrt(e / hop);
    env[i] = Math.max(0, e - ant); // fluxo positivo = ataques
    ant = e;
  }
  const fps = sr / hop;
  // autocorrelação para achar o BPM (70–180)
  let melhor = 0, lagMelhor = 0;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let s = 0;
    for (let i = 0; i + lag < n; i += 1) s += env[i] * env[Math.round(i + lag)];
    if (s > melhor) { melhor = s; lagMelhor = lag; }
  }
  const periodo = lagMelhor / fps;
  // fase: desloca a grade até casar com os ataques
  let fase = 0, best = -1;
  for (let k = 0; k < 40; k++) {
    const f = (k / 40) * periodo;
    let s = 0;
    for (let t = f; t < buf.duration; t += periodo) s += env[Math.round(t * fps)] || 0;
    if (s > best) { best = s; fase = f; }
  }
  const batidas = [];
  for (let t = fase; t < buf.duration; t += periodo) batidas.push(+t.toFixed(3));
  return { bpm: Math.round(60 / periodo), batidas };
}

export function picos(buf, colunas) {
  const d = buf.getChannelData(0);
  const passo = Math.max(1, Math.floor(d.length / colunas));
  const out = new Float32Array(colunas);
  for (let i = 0; i < colunas; i++) {
    let m = 0;
    for (let j = i * passo; j < Math.min(d.length, (i + 1) * passo); j += 8) m = Math.max(m, Math.abs(d[j]));
    out[i] = m;
  }
  return out;
}
