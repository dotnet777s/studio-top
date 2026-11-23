// Motor de renderização: desenha um quadro da timeline em um canvas 2D (1080x1920 lógicos).
// O mesmo código é usado na prévia e na exportação (o que você vê é o que sai).
import { S, TL, take, mediaUrl, marcaUrl, clamp } from './estado.js';

export const W = 1080, H = 1920;
// cores da marca (Kit da Marca) — os estilos usam nomes, resolvidos na hora de desenhar
const PADRAO_CORES = { acento: '#7DC242', primaria: '#7DC242', secundaria: '#9AA0A6', cta: '#7DC242', escuro: '#0E0F10', claro: '#ffffff' }; // TopCar: verde, cinza, preto e branco
/** Preto ou branco, o que tiver mais contraste com o fundo. */
export function contraste(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex || '');
  if (!m) return '#111';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#111' : '#fff';
}
/** Duas cores quase iguais? */
function parecidas(a, b) {
  const p = (h) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(h || ''); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null; };
  const x = p(a), y = p(b);
  return !!(x && y) && Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 90;
}
export function comAlpha(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex || '');
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : hex;
}
const corTexto = (it, est) => it.cor || (est.cor === 'auto' ? contraste(cor(est.caixa)) : cor(est.cor));
export const cor = (v) => (!v || v[0] === '#' || v.startsWith('rgb') ? v : (S.marca?.cores?.[v] || PADRAO_CORES[v] || v));

export const E = {
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inCubic: (x) => x * x * x,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outBack: (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (x) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
};
const suave = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const ruido = (s) => { const x = Math.sin(s * 127.1) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
const hash = (str) => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; };

// ---------------------------------------------------------------- catálogos (usados no inspetor)

export const FILTROS = {
  nenhum: { nome: 'Nenhum', css: '' },
  vivo: { nome: 'Vivo', css: 'saturate(1.35) contrast(1.08)' },
  cinema: { nome: 'Cinema', css: 'contrast(1.15) saturate(0.85) brightness(0.96)', tinta: 'rgba(0,70,90,0.10)' },
  premium: { nome: 'Premium', css: 'contrast(1.22) saturate(1.05) brightness(0.94)' },
  noturno: { nome: 'Noturno', css: 'contrast(1.25) saturate(1.15) brightness(0.88) hue-rotate(-8deg)', tinta: 'rgba(0,40,120,0.12)' },
  quente: { nome: 'Quente', css: 'sepia(0.22) saturate(1.25) contrast(1.05)' },
  frio: { nome: 'Frio', css: 'saturate(0.92) hue-rotate(-10deg) contrast(1.08) brightness(1.03)' },
  pb: { nome: 'Preto e branco', css: 'grayscale(1) contrast(1.25)' },
  comercial: { nome: 'Comercial (anúncio)', css: 'contrast(1.1) saturate(1.12) brightness(1.02)', tinta: 'rgba(255,190,140,0.07)' },
  showroom: { nome: 'Showroom (branco limpo)', css: 'contrast(1.06) saturate(1.04) brightness(1.06)', tinta: 'rgba(150,200,255,0.06)' },
  noite_neon: { nome: 'Noite neon', css: 'contrast(1.2) saturate(1.3) brightness(0.9)', tinta: 'rgba(40,0,120,0.14)' },
};

export const TRANSICOES = {
  corte: 'Corte seco', whip: 'Chicote (whip)', whip_v: 'Chicote vertical', zoom: 'Zoom através', flash: 'Flash branco', luz: 'Luz (light leak)',
  giro: 'Giro', slide: 'Empurrar', glitch: 'Glitch', desfoque: 'Desfoque', crossfade: 'Dissolver', wipe: 'Cortina diagonal',
};
export const MOVIMENTOS = {
  deriva: 'Deriva suave (padrão)', zoom_in: 'Zoom lento (aproxima)', zoom_out: 'Zoom revelando (afasta)',
  pan_esq: 'Pan para a esquerda', pan_dir: 'Pan para a direita', subir: 'Sobe (tilt up)', descer: 'Desce (tilt down)',
  orbita: 'Órbita (gira + zoom)', parado: 'Parado',
};
export const RAMPAS = {
  nenhuma: 'Velocidade normal', rapido_lento: 'Rampa: rápido → câmera lenta', lento_rapido: 'Rampa: lento → rápido',
  rampa_meio: 'Rampa: rápido → lento → rápido', slowmo: 'Câmera lenta', rapido: 'Acelerado',
};
export const ANIMACOES = {
  palavras: 'Palavra por palavra', slam: 'Slam (bate na tela)', pop: 'Pop', mascara: 'Máscara (sobe)', desfoque: 'Desfoque',
  subir: 'Subir', zoom: 'Zoom', deslizar: 'Deslizar', quique: 'Quicar', digitar: 'Digitar', nenhuma: 'Nenhuma',
};
export const SAIDAS = { fade: 'Sumir', zoom: 'Zoom out', desfoque: 'Desfoque', descer: 'Descer', subir: 'Subir', deslizar: 'Deslizar', nenhuma: 'Corte' };
export const VIDAS = { batida: 'Pulsa na batida da música', nenhuma: 'Parado', flutuar: 'Flutuar', pulsar: 'Pulsar', balancar: 'Balançar', tremer: 'Tremer' };

const F_FORTE = (px, peso) => `${peso || S.marca?.pesoTitulo || 900} ${px}px "${S.marca?.fonteTitulo || 'Montserrat'}", Montserrat, "Arial Black", sans-serif`;
const F_ALTA = (px) => `${S.marca?.pesoNumeros || 800} ${px}px "${S.marca?.fonteNumeros || 'Anton'}", Anton, Impact, "Arial Black", sans-serif`;

export const ESTILOS = {
  gancho: { nome: 'Gancho (gigante)', fonte: F_FORTE, tam: 112, cor: '#fff', contorno: '#000', lw: 18, maius: true, sombra: true, dest: 'acento' },
  impacto: { nome: 'Impacto', fonte: F_FORTE, tam: 92, cor: '#fff', contorno: '#000', lw: 16, maius: true, sombra: true, dest: 'acento' },
  destaque: { nome: 'Faixa (cor de destaque)', fonte: F_FORTE, tam: 76, cor: 'auto', caixa: 'acento', maius: true, dest: 'secundaria' },
  lista: { nome: 'Opcionais: pílulas com ✓', fonte: F_FORTE, tam: 64, cor: '#fff', maius: false, dest: 'acento', lista: true, opc: 'lista' },
  cards: { nome: 'Opcionais: cards com ícone', fonte: F_FORTE, tam: 66, cor: '#111', maius: true, dest: 'secundaria', opc: 'cards' },
  grade: { nome: 'Opcionais: grade 2×2', fonte: F_FORTE, tam: 54, cor: '#fff', maius: true, dest: 'acento', opc: 'grade' },
  contador: { nome: 'Opcionais: contagem 3-2-1', fonte: F_FORTE, tam: 76, cor: '#fff', contorno: '#000', lw: 14, maius: true, dest: 'acento', opc: 'contador' },
  letreiro: { nome: 'Opcionais: letreiro diagonal', fonte: F_FORTE, tam: 68, cor: '#111', maius: true, dest: 'secundaria', opc: 'letreiro' },
  checklist: { nome: 'Opcionais: checklist marcando', fonte: F_FORTE, tam: 60, cor: '#fff', maius: false, dest: 'acento', opc: 'checklist' },
  preco: { nome: 'Preço', fonte: F_ALTA, tam: 150, cor: 'acento', contorno: '#000', lw: 18, sombra: true, contar: true, dest: '#fff' },
  de_por: { nome: 'De / Por (preço riscado)', fonte: F_ALTA, tam: 140, cor: 'acento', contorno: '#000', lw: 16, sombra: true, deppor: true },
  etiqueta: { nome: 'Etiqueta (pílula preta)', fonte: F_FORTE, tam: 58, cor: 'auto', caixa: 'escuro', maius: true, pilula: true, dest: 'acento' },
  callout: { nome: 'Callout (aponta detalhe)', fonte: F_FORTE, tam: 50, cor: 'auto', caixa: '#fff', maius: true, pilula: true, callout: true, dest: 'secundaria' },
  cta: { nome: 'Botão CTA', fonte: F_FORTE, tam: 64, cor: 'auto', caixa: 'cta', maius: true, pilula: true, pulso: true, dest: 'acento' },
  limpo: { nome: 'Limpo', fonte: (px) => F_FORTE(px, 800), tam: 70, cor: '#fff', sombra: true, dest: 'acento' },
};

export const LEGENDAS = { amarelo: 'Palavra na cor da marca', caixa: 'Palavra na caixa', branco: 'Só branco' };

// ---------------------------------------------------------------- velocidade (rampas)

const PERFIS = {
  rapido_lento: (u) => lerp(2.3, 0.42, suave((u - 0.22) / 0.33)),
  lento_rapido: (u) => lerp(0.42, 2.3, suave((u - 0.45) / 0.33)),
  rampa_meio: (u) => (u < 0.5 ? lerp(2.2, 0.4, suave((u - 0.08) / 0.24)) : lerp(0.4, 2.2, suave((u - 0.68) / 0.24))),
  slowmo: () => 0.5,
  rapido: () => 1.8,
  // takes de 30 fps: a parte lenta para em ~0,8x (abaixo disso o vídeo "engasga", quadros repetidos)
  rapido_lento_30: (u) => lerp(2.3, 0.8, suave((u - 0.22) / 0.33)),
  lento_rapido_30: (u) => lerp(0.8, 2.3, suave((u - 0.45) / 0.33)),
  rampa_meio_30: (u) => (u < 0.5 ? lerp(2.2, 0.8, suave((u - 0.08) / 0.24)) : lerp(0.8, 2.2, suave((u - 0.68) / 0.24))),
  slowmo_30: () => 0.8,
};
/** Perfil de velocidade conforme o fps do take (câmera lenta de verdade só com take a 60 fps). */
function perfil(c) {
  if (!c.rampa || !PERFIS[c.rampa]) return c.rampa;
  // take de 30 fps não tem quadros para acelerar/frear: a rampa vira solavanco. Só 60 fps usa rampa.
  return (take(c.takeId)?.fps || 30) < 49 ? 'nenhuma' : c.rampa;
}
/** Velocidade real do clipe: takes de 30 fps tocam em velocidade normal (câmera lenta = quadros repetidos = tremido). */
function vel(c) { return (take(c.takeId)?.fps || 30) < 49 ? 1 : (c.speed || 1); }
const tabelas = {};
function tabela(nome) {
  if (!tabelas[nome]) {
    const v = PERFIS[nome], tb = new Float32Array(201);
    for (let i = 1; i <= 200; i++) tb[i] = tb[i - 1] + v((i - 0.5) / 200) / 200;
    tabelas[nome] = tb;
  }
  return tabelas[nome];
}
/** Fração de fonte consumida até o progresso u (u pode passar de 0..1 nas transições). */
function integral(nome, u) {
  const v = PERFIS[nome];
  if (!v) return u;
  const tb = tabela(nome);
  if (u <= 0) return u * v(0);
  if (u >= 1) return tb[200] + (u - 1) * v(1);
  const i = u * 200, a = Math.floor(i);
  return tb[a] + (tb[a + 1] - tb[a]) * (i - a);
}
/** Quantos segundos de take o clipe consome por segundo de timeline (média). */
export const fatorFonte = (c) => vel(c) * integral(perfil(c), 1);
export const maxDurClip = (c, tk) => (tk ? Math.max(0.3, (tk.dur - c.in) / fatorFonte(c)) : 99);

export const FOTO = 0.5; // duração do congelamento do "momento foto"
export function srcTime(c, t) {
  const tk = take(c.takeId);
  let lt = t - c.start;
  if (c.foto) lt = lt < FOTO ? 0 : lt - FOTO;
  const u = lt / c.dur;
  const usa = vel(c) * c.dur * integral(perfil(c), 1);
  const ini = Math.max(0, Math.min(c.in, (tk?.dur || 0) - usa - 0.05)); // se não cabe, começa antes (nunca congela no fim)
  return clamp(ini + vel(c) * c.dur * integral(perfil(c), u), 0, Math.max(0, (tk?.dur || 0) - 0.05));
}
/** Tempo no take da metade de baixo (tela dividida). */
export function srcTime2(c, t) {
  const tk = take(c.duplo?.takeId);
  return clamp((c.duplo?.in || 0) + (t - c.start), 0, Math.max(0, (tk?.dur || 0) - 0.05));
}
function velocidadeEm(c, t) {
  const v = PERFIS[perfil(c)];
  return vel(c) * (v ? v(clamp((t - c.start) / c.dur, 0, 1)) : 1);
}

// ---------------------------------------------------------------- clipes ativos e transições

function durTransicao(c, prox) {
  if (!c || !prox || !c.transicao || c.transicao.tipo === 'corte') return 0;
  return Math.min(c.transicao.dur || 0.4, c.dur * 0.8, prox.dur * 0.8);
}

export function ativos(t) {
  const cl = TL().clips;
  for (let i = 0; i < cl.length; i++) {
    const c = cl[i], fim = c.start + c.dur;
    const ultimo = i === cl.length - 1;
    if (t < c.start || (t >= fim && !(ultimo && t <= fim + 0.05))) continue;
    const prox = cl[i + 1], ant = cl[i - 1];
    const dS = durTransicao(c, prox);
    if (dS > 0 && t >= fim - dS / 2) return { a: c, b: prox, p: (t - (fim - dS / 2)) / dS, tipo: c.transicao.tipo };
    const dA = durTransicao(ant, c);
    if (dA > 0 && t < c.start + dA / 2) return { a: ant, b: c, p: (t - (c.start - dA / 2)) / dA, tipo: ant.transicao.tipo };
    return { a: c };
  }
  return null;
}

/** Converte um ponto do take (0..1) para a posição na tela, considerando o recorte do clipe no tempo t. */
export function fonteParaTela(c, px, py, t) {
  const tk = take(c.takeId);
  if (!tk?.w) return { x: px, y: py };
  const g = geometria(c, tk.w, tk.h, t ?? c.start + c.dur / 2);
  return { x: (g.x + px * g.dw) / W, y: (g.y + py * g.dh) / H };
}

function geometria(c, vw, vh, t) {
  const u = clamp((t - c.start) / c.dur, 0, 1), lt = t - c.start;
  const mov = c.movimento === 'nenhum' ? 'deriva' : (c.movimento || 'deriva');
  let z = (c.zoomBase || 1), fx = c.focoX ?? 0.5, fy = c.focoY ?? 0.5, rot = 0;
  const lado = hash(c.id) % 2 ? 1 : -1;
  const k = 0.75 * u + 0.25 * E.inOut(u); // movimento constante de slider/gimbal
  switch (mov) {
    // o take já tem o movimento real da câmera: por cima dele, só uma aproximação lenta e constante
    case 'zoom_out': z *= 1.08 - 0.04 * u; break;
    default: z *= 1.04 + 0.04 * u; break; // deriva, zoom_in, pan, subir, descer, órbita, parado
  }
  // (soco de zoom removido: os cortes já dão o ritmo)
  const s = Math.max(W / vw, H / vh) * z;
  const dw = vw * s, dh = vh * s;
  const x = clamp(W / 2 - fx * dw, W - dw, 0);
  const y = clamp(H / 2 - fy * dh, H - dh, 0);
  return { x, y, dw, dh, rot };
}

// ---------------------------------------------------------------- legendas automáticas

let cacheLeg = { chave: '', blocos: [] };
function blocosLegenda() {
  const narr = TL().narracoes;
  const chave = JSON.stringify(narr.map((n) => [n.inicio, n.dur, n.texto]));
  if (chave === cacheLeg.chave) return cacheLeg.blocos;
  const blocos = [];
  for (const n of narr) {
    const brutas = String(n.texto || '').split(/\s+/).filter(Boolean);
    if (!brutas.length) continue;
    let emD = false;
    const palavras = brutas.map((pal) => {
      const abre = /^[^\w*]*\*/.test(pal), fecha = /\*[^\w*]*$/.test(pal) && (pal.match(/\*/g).length > 1 || !abre || emD);
      const dest = emD || abre; if (abre) emD = true; if (fecha) emD = false;
      return { txt: pal.replace(/\*/g, ''), dest };
    }).filter((p) => p.txt);
    const pesos = palavras.map((p) => p.txt.length + 2);
    const soma = pesos.reduce((a, b) => a + b, 0);
    const ini0 = n.inicio + 0.04, span = Math.max(0.3, n.dur * 0.96 - 0.04);
    let acc = 0;
    const tw = palavras.map((p, i) => { const a = ini0 + (acc / soma) * span; acc += pesos[i]; return { txt: p.txt, dest: p.dest, ini: a, fim: ini0 + (acc / soma) * span }; });
    let bloco = [];
    const fecha = () => { if (bloco.length) blocos.push({ ini: bloco[0].ini, fim: bloco[bloco.length - 1].fim, palavras: bloco }); bloco = []; };
    for (const w of tw) {
      const chars = bloco.reduce((s, x) => s + x.txt.length + 1, 0) + w.txt.length;
      if (bloco.length >= 3 || chars > 18) fecha();
      bloco.push(w);
      if (/[.!?,;:]$/.test(w.txt)) fecha();
    }
    fecha();
  }
  for (let i = 0; i < blocos.length - 1; i++) if (blocos[i + 1].ini - blocos[i].fim < 0.35) blocos[i].fim = blocos[i + 1].ini;
  // palavras-chave: sequências de palavras com *destaque* viram uma "explosão" no centro da tela
  const chaves = [];
  for (const b of blocos) for (const w of b.palavras) {
    const ult = chaves[chaves.length - 1];
    if (!w.dest) continue;
    if (ult && Math.abs(ult.fimFala - w.ini) < 0.05) { ult.txt += ` ${w.txt}`; ult.fimFala = w.fim; ult.fim = w.fim + 0.55; }
    else chaves.push({ txt: w.txt, ini: w.ini, fimFala: w.fim, fim: w.fim + 0.55 });
  }
  cacheLeg = { chave, blocos, chaves };
  return blocos;
}
/** Momentos em que as palavras-chave são faladas (para colocar som de impacto). */
export function palavrasChave() { blocosLegenda(); return cacheLeg.chaves || []; }

function desenharPalavraChave(ctx, t) {
  blocosLegenda();
  const ks = cacheLeg.chaves || [];
  const i = ks.findIndex((k) => t >= k.ini && t < k.fim);
  if (i < 0) return false;
  const k = ks[i], lt = t - k.ini, rest = k.fim - t;
  const txt = k.txt.replace(/[.,!?;:]+$/, '').toUpperCase();
  ctx.save();
  let px = 168;
  ctx.font = F_FORTE(px);
  const w = ctx.measureText(txt).width;
  if (w > W * 0.86) { px = Math.floor(px * (W * 0.86) / w); ctx.font = F_FORTE(px); }
  const e = entrada('slam', lt, 0);
  const sai = rest < 0.16 ? rest / 0.16 : 1;
  ctx.translate(W / 2, H * 0.5);
  if (lt > 0.15 && lt < 0.3) ctx.translate(ruido(t * 90) * 12, ruido(t * 77) * 12);
  ctx.rotate(((i % 2 ? 1 : -1) * 4 * Math.PI) / 180);
  const s = e.s * (sai < 1 ? 1 + (1 - sai) * 0.35 : 1);
  ctx.scale(s, s);
  ctx.globalAlpha = e.a * sai;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  // tarja atrás alterna amarela / branca
  const corTarja = i % 2 ? '#ffffff' : cor('acento');
  const bw = Math.min(W * 0.92, ctx.measureText(txt).width + px * 0.7), bh = px * 1.25;
  ctx.fillStyle = corTarja; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  caixa(ctx, -bw / 2, -bh / 2, bw, bh, 18); ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.fillStyle = contraste(corTarja); ctx.fillText(txt, 0, px * 0.05);
  ctx.restore();
  return true;
}

function desenharLegendas(ctx, t) {
  const cfg = TL().config;
  if (!cfg.legendas) return;
  const b = blocosLegenda().find((x) => t >= x.ini && t < x.fim);
  if (!b) return;
  const px = 74;
  ctx.save();
  ctx.font = F_FORTE(px);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const palavras = b.palavras.map((w) => w.txt.toUpperCase());
  const esp = ctx.measureText(' ').width * 1.6 + 22; // folga para a palavra atual crescer (e o contorno) sem encostar
  const larg = palavras.map((w) => ctx.measureText(w).width);
  const total = larg.reduce((a, c) => a + c, 0) + esp * (palavras.length - 1);
  const esc = 0.82 + 0.18 * E.outBack(clamp((t - b.ini) / 0.16, 0, 1));
  ctx.translate(W / 2, (cfg.legendaY ?? 0.7) * H);
  const k = Math.min(esc, ((W * 0.9) / total) * esc);
  ctx.scale(k, k);
  let x = -total / 2;
  palavras.forEach((w, i) => {
    const pw = b.palavras[i];
    const atual = t >= pw.ini && t < pw.fim;
    if (t < pw.ini - 0.02) { x += larg[i] + esp; return; } // palavra por palavra, junto com a voz
    const pop = Math.max(0.01, Math.min(1.04, E.outBack(clamp((t - pw.ini + 0.02) / 0.14, 0, 1))));
    ctx.save();
    ctx.translate(x + larg[i] / 2, 0);
    ctx.scale(pop * (atual ? 1.05 : 1), pop * (atual ? 1.05 : 1));
    if (atual && cfg.estiloLegenda === 'caixa') {
      ctx.fillStyle = cor('acento');
      caixa(ctx, -larg[i] / 2 - 12, -px * 0.62, larg[i] + 24, px * 1.24, 12); ctx.fill();
    }
    ctx.textAlign = 'center';
    if (!(atual && cfg.estiloLegenda === 'caixa')) { ctx.strokeStyle = '#000'; ctx.lineWidth = 13; ctx.strokeText(w, 0, 0); }
    ctx.fillStyle = atual ? (cfg.estiloLegenda === 'amarelo' ? cor('acento') : cfg.estiloLegenda === 'caixa' ? '#000' : '#fff') : '#fff';
    ctx.fillText(w, 0, 0);
    ctx.restore();
    x += larg[i] + esp;
  });
  ctx.restore();
}

// ---------------------------------------------------------------- texto cinético

function caixa(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}

/** Separa em linhas e palavras. Palavras entre *asteriscos* ficam em destaque. */
function diagramar(ctx, texto, larguraMax, maius) {
  const linhas = [];
  let emDestaque = false;
  const esp = ctx.measureText(' ').width * 1.3; // folga para a palavra em destaque pulsar sem encostar
  for (const par of String(texto).split('\n')) {
    let linha = { palavras: [], w: 0 };
    for (let bruto of par.split(/\s+/).filter(Boolean)) {
      const abre = /^[^\w*]*\*/.test(bruto), fecha = /\*[^\w*]*$/.test(bruto) && (bruto.match(/\*/g).length > 1 || !abre || emDestaque);
      const dest = emDestaque || abre;
      if (abre) emDestaque = true;
      if (fecha) emDestaque = false;
      bruto = bruto.replace(/\*/g, '');
      if (!bruto) continue;
      const txt = maius ? bruto.toUpperCase() : bruto;
      const w = ctx.measureText(txt).width;
      if (linha.palavras.length && linha.w + esp + w > larguraMax) { linhas.push(linha); linha = { palavras: [], w: 0 }; }
      linha.w += (linha.palavras.length ? esp : 0) + w;
      linha.palavras.push({ txt, w, dest });
    }
    if (linha.palavras.length) linhas.push(linha);
  }
  return { linhas, esp };
}

function contarNumero(texto, p) {
  if (p >= 1) return texto;
  return texto.replace(/\d[\d.]*(,\d+)?/g, (m) => {
    const n = parseInt(m.replace(/\./g, '').replace(/,\d+$/, ''), 10);
    if (!isFinite(n) || n < 10) return m;
    const v = Math.round(n * E.outCubic(p));
    return m.includes('.') ? v.toLocaleString('pt-BR') : String(v);
  });
}

/** Transformação de entrada para um elemento que começa em `atraso` segundos. */
function entrada(anim, lt, atraso = 0) {
  const d = anim === 'slam' ? 0.17 : anim === 'palavras' ? 0.3 : 0.42;
  const p = clamp((lt - atraso) / d, 0, 1);
  const r = { a: 1, s: 1, dx: 0, dy: 0, blur: 0, mascara: 1, p };
  if (lt < atraso) { r.a = 0; return r; }
  switch (anim) {
    case 'pop': case 'palavras': r.s = Math.max(0.01, E.outBack(p)); r.dy = (1 - E.outCubic(p)) * 40; r.a = clamp(p * 3, 0, 1); break;
    case 'slam': r.s = lerp(1.5, 1, E.outQuart(p)); r.a = clamp(p * 3, 0, 1); r.blur = (1 - p) * 6; break; // bate no lugar sem atropelar a vizinha
    case 'subir': r.dy = (1 - E.outCubic(p)) * 140; r.a = p; break;
    case 'zoom': r.s = 2.2 - 1.2 * E.outCubic(p); r.a = p; break;
    case 'deslizar': r.dx = -(1 - E.outCubic(p)) * W; break;
    case 'quique': r.dy = -(1 - E.outBounce(p)) * 420; break;
    case 'desfoque': r.blur = (1 - E.outCubic(p)) * 26; r.s = lerp(1.35, 1, E.outCubic(p)); r.a = p; break;
    case 'mascara': r.mascara = E.outQuart(p); break;
    default: break;
  }
  return r;
}

function saida(animOut, lt, dur) {
  const po = animOut === 'nenhuma' ? 1 : clamp((dur - lt) / 0.26, 0, 1);
  const r = { a: 1, s: 1, dx: 0, dy: 0, blur: 0 };
  if (po >= 1) return r;
  const k = 1 - po;
  switch (animOut) {
    case 'zoom': r.s = 1 + k * 0.6; r.a = po; break;
    case 'desfoque': r.blur = k * 24; r.a = po; break;
    case 'descer': r.dy = k * 140; r.a = po; break;
    case 'subir': r.dy = -k * 140; r.a = po; break;
    case 'deslizar': r.dx = E.inCubic(k) * W; break;
    default: r.a = po;
  }
  return r;
}

function vida(tipo, lt, semente) {
  const r = { dx: 0, dy: 0, s: 1, rot: 0 };
  switch (tipo) {
    case 'flutuar': r.dy = Math.sin(lt * 2.2 + semente) * 9; break;
    case 'pulsar': break; // sem pulsar
    case 'balancar': r.rot = Math.sin(lt * 2.4 + semente) * 2; break;
    case 'tremer': break; // sem tremer
    default: break;
  }
  return r;
}

export function desenharTexto(ctx, it, t) {
  const lt = t - it.inicio;
  if (lt < 0 || lt > it.dur) return;
  const est = ESTILOS[it.estilo] || ESTILOS.impacto;
  if (est.lista || (est.opc && est.opc !== 'contador')) return desenharOpcCompacto(ctx, it, lt, est);
  if (est.deppor) return desenharDePor(ctx, it, lt, est);
  if (est.opc && OPCIONAIS[est.opc]) return OPCIONAIS[est.opc](ctx, it, lt, est);
  const px = Math.round(est.tam * (it.tam || 1));
  ctx.save();
  ctx.font = est.fonte(px);
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  let texto = String(it.texto || '');
  if (est.contar) texto = contarNumero(texto.replace(/\*/g, ''), clamp(lt / 0.9, 0, 1));
  let anim = it.anim || 'pop';
  // tipografia cinética: entradas simples viram revelação palavra a palavra por máscara (padrão dos anúncios que performam)
  const cinetico = ['pop', 'subir', 'mascara', 'palavras', 'fade', 'nenhuma'].includes(anim) && !est.contar;
  const ehPreco = /preco|cta|de_por/.test(it.estilo || '') || /R\$\s?\d/.test(texto);
  if (cinetico) anim = ehPreco ? 'carimbo' : ['revelar', 'linhas', 'letras', 'marcador', 'revelar'][Math.abs(hash(it.id)) % 5];
  const K = ['revelar', 'linhas', 'letras', 'marcador'].includes(anim); // famílias cinéticas palavra a palavra
  const porPalavra = K || anim === 'slam';
  let letraIdx = 0;
  const nPalavras = String(texto).split(/\s+/).filter(Boolean).length;
  const passo = Math.min(0.07, 0.5 / Math.max(1, nPalavras)); // frases longas não demoram demais para entrar
  const { linhas, esp } = diagramar(ctx, texto, W * 0.84, est.maius);
  const alt = px * 1.14;

  // Callout: círculo desenhado no ponto + linha até o rótulo
  const cx = (it.x ?? 0.5) * W, cy = (it.y ?? 0.3) * H;
  if (est.callout) desenharAlvo(ctx, it, lt, cx, cy, alt * linhas.length);

  let ent = porPalavra ? { a: 1, s: 1, dx: 0, dy: 0, blur: 0, mascara: 1 } : entrada(anim, lt);
  if (anim === 'carimbo') { // selo batendo: grande e inclinado → assenta com sombra
    const pc = clamp(lt / 0.3, 0, 1);
    ent = { a: clamp(pc * 3, 0, 1), s: lerp(1.9, 1, E.outBack(pc)), dx: 0, dy: 0, blur: (1 - pc) * 8, mascara: 1 };
  }
  const sai = K ? { a: 1, s: 1, dx: 0, dy: 0, blur: 0 } : saida(it.animOut || 'fade', lt, it.dur);
  const vi = lt > 0.45 ? vida(it.vida, lt, hash(it.id) % 10) : { dx: 0, dy: 0, s: 1, rot: 0 };
  let esc = ent.s * sai.s * vi.s * (1 + 0.04 * clamp(lt / Math.max(it.dur, 0.5), 0, 1)); // aproximação lenta: o texto nunca fica parado
  // (pulsos removidos: o texto só faz a aproximação lenta)
  ctx.globalAlpha = ent.a * sai.a;
  const blur = ent.blur + sai.blur;
  if (blur > 0.5) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  ctx.translate(cx + ent.dx + sai.dx + vi.dx, cy + ent.dy + sai.dy + vi.dy);
  ctx.rotate(((it.rot || 0) + vi.rot + (anim === 'carimbo' ? lerp(-9, -3, E.outQuart(clamp(lt / 0.35, 0, 1))) : 0)) * Math.PI / 180);
  ctx.scale(esc, esc);

  // digitar: limita letras visíveis
  let restam = Infinity;
  if (anim === 'digitar') restam = Math.floor(texto.replace(/\*/g, '').length * clamp(lt / Math.max(0.3, texto.length * 0.035), 0, 1));

  // tremor no impacto do slam
  if (anim === 'slam') {
    const total = linhas.reduce((s, l) => s + l.palavras.length, 0);
    const pousou = lt - ((total - 1) * 0.14 + 0.17);
    if (pousou > 0 && pousou < 0.18) ctx.translate(ruido(lt * 90) * 10 * (1 - pousou / 0.18), ruido(lt * 77) * 10 * (1 - pousou / 0.18));
  }

  const y0 = -((linhas.length - 1) * alt) / 2;
  let indice = 0;
  linhas.forEach((ln, li) => {
    const y = y0 + li * alt;
    if (anim === 'mascara') { // cada linha sobe de dentro de uma máscara
      const m = entrada('mascara', lt, li * 0.1).mascara;
      ctx.save();
      ctx.beginPath(); ctx.rect(-W, y - alt / 2 - 10, W * 2, alt + 20); ctx.clip();
      ctx.translate(0, (1 - m) * alt * 1.1);
    }
    if (est.caixa) {
      const padX = px * 0.38, padY = px * 0.2;
      const p0 = K ? { s: 1, a: 1 } : porPalavra ? entrada('pop', lt, indice * 0.14) : { s: 1, a: 1 };
      ctx.save();
      ctx.globalAlpha *= p0.a;
      ctx.translate(0, y); ctx.scale(p0.s, p0.s);
      if (K) { // a caixa abre da esquerda para a direita e fecha na saída
        const abre = E.outQuart(clamp((lt - li * 0.06) / 0.28, 0, 1));
        const fecha = E.inCubic(clamp((lt - (it.dur - 0.3)) / 0.26, 0, 1));
        const larg = ln.w + px * 0.76;
        ctx.beginPath(); ctx.rect(-larg / 2 - 20 + larg * fecha, -alt, (larg + 40) * abre * (1 - fecha), alt * 2); ctx.clip();
      }
      ctx.fillStyle = cor(est.caixa);
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      const h = alt + padY;
      caixa(ctx, -ln.w / 2 - padX, -h / 2, ln.w + padX * 2, h, est.pilula ? h / 2 : 14);
      ctx.fill();
      ctx.restore();
    }
    let x = -ln.w / 2;
    for (const pw of ln.palavras) {
      let txt = pw.txt;
      if (restam !== Infinity) { if (restam <= 0) break; txt = txt.slice(0, restam); restam -= pw.txt.length + 1; }
      const atraso = (est.caixa && K ? 0.12 : 0) + (anim === 'linhas' ? li * 0.1 : indice * (anim === 'slam' ? 0.14 : passo));
      let e = { a: 1, s: 1, dx: 0, dy: 0 };
      ctx.save();
      if (anim === 'revelar') {
        const pe = clamp((lt - atraso) / 0.34, 0, 1);
        const ps = clamp((lt - (it.dur - 0.32 - (nPalavras - 1 - indice) * 0.025)) / 0.26, 0, 1); // saída em sequência
        if (pe <= 0) { ctx.restore(); x += pw.w + esp; indice++; continue; }
        ctx.beginPath(); ctx.rect(x - 30, y - alt * 0.62, pw.w + 60, alt * 1.24); ctx.clip(); // máscara da palavra
        e = { a: clamp(pe * 2.5, 0, 1) * (1 - ps), s: 1, dx: 0, dy: (1 - E.outQuart(pe)) * alt * 0.95 - E.inCubic(ps) * alt * 0.9 };
        const bl = (1 - E.outCubic(pe)) * 7;
        if (bl > 0.4) ctx.filter = `blur(${bl.toFixed(1)}px)`;
      } else if (anim === 'linhas') { // cada linha entra deslizando de um lado (alternado), com rastro
        const lado = li % 2 ? 1 : -1;
        const pe = clamp((lt - atraso) / 0.42, 0, 1), ps = clamp((lt - (it.dur - 0.32)) / 0.28, 0, 1);
        if (pe <= 0) { ctx.restore(); x += pw.w + esp; indice++; continue; }
        e = { a: clamp(pe * 3, 0, 1) * (1 - ps), s: 1, dy: 0, dx: lado * (1 - E.outQuart(pe)) * W * 0.55 - lado * E.inCubic(ps) * W * 0.55 };
        const bl = (1 - E.outCubic(pe)) * 12 + ps * 12;
        if (bl > 0.4) ctx.filter = `blur(${bl.toFixed(1)}px)`;
      } else if (anim === 'marcador' || anim === 'letras') {
        const pe = clamp((lt - atraso) / 0.22, 0, 1), ps = clamp((lt - (it.dur - 0.28)) / 0.24, 0, 1);
        if (pe <= 0 && anim === 'marcador') { ctx.restore(); x += pw.w + esp; indice++; continue; }
        e = { a: (anim === 'letras' ? 1 : clamp(pe * 2, 0, 1)) * (1 - ps), s: 1, dx: 0, dy: (anim === 'letras' ? 0 : (1 - E.outCubic(pe)) * 26) - E.inCubic(ps) * 30 };
      } else if (porPalavra) e = entrada(anim, lt, atraso);
      ctx.globalAlpha *= e.a;
      ctx.translate(x + pw.w / 2 + e.dx, y + e.dy + (est.caixa ? px * 0.04 : 0));
      const realce = pw.dest && !est.caixa && anim !== 'marcador' ? 1.04 : 1;
      ctx.scale(e.s * realce, e.s * realce);
      ctx.textAlign = 'center';
      let marcado = false;
      if (anim === 'marcador' && pw.dest) { // caixa na cor da marca "pinta" a palavra destacada
        const pb = E.outQuart(clamp((lt - atraso - 0.16) / 0.3, 0, 1));
        if (pb > 0) {
          ctx.save(); ctx.filter = 'none'; ctx.fillStyle = cor(it.corDestaque || est.dest || 'acento');
          ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 16;
          caixa(ctx, -pw.w / 2 - px * 0.18, -px * 0.62, (pw.w + px * 0.36) * pb, px * 1.18, 10); ctx.fill(); ctx.restore();
          marcado = pb > 0.55;
        }
      }
      if (est.sombra) { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6; }
      if (est.contorno && anim !== 'letras') { ctx.strokeStyle = est.contorno; ctx.lineWidth = est.lw * (it.tam || 1); ctx.strokeText(txt, 0, 0); }
      ctx.shadowColor = 'transparent';
      let preench = marcado ? contraste(cor(it.corDestaque || est.dest || 'acento')) : pw.dest ? cor(it.corDestaque || est.dest || 'acento') : corTexto(it, est);
      if (pw.dest && est.caixa && parecidas(preench, cor(est.caixa))) { // destaque da mesma cor do fundo: troca para algo legível
        preench = contraste(cor(est.caixa)) === '#111' ? '#ffffff' : cor('acento');
      }
      if (pw.dest && est.caixa && preench === '#ffffff') { ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = px * 0.12; ctx.strokeText(txt, 0, 0); }
      ctx.fillStyle = preench;
      if (anim === 'letras') { // letra por letra, cada uma sobe com um leve quique
        ctx.textAlign = 'left';
        let cx0 = -ctx.measureText(txt).width / 2;
        for (const ch of txt) {
          const pc = clamp((lt - 0.02 - letraIdx * 0.022) / 0.24, 0, 1);
          const wch = ctx.measureText(ch).width;
          if (pc > 0) {
            ctx.save(); ctx.globalAlpha *= clamp(pc * 3, 0, 1); ctx.translate(cx0, (1 - E.outBack(pc)) * px * 0.45);
            if (est.contorno) { ctx.strokeStyle = est.contorno; ctx.lineWidth = est.lw * (it.tam || 1); ctx.strokeText(ch, 0, 0); }
            ctx.fillText(ch, 0, 0); ctx.restore();
          }
          cx0 += wch; letraIdx++;
        }
        letraIdx++;
      } else ctx.fillText(txt, 0, 0);
      if (pw.dest && !est.caixa && anim === 'revelar') { // barra de destaque riscando sob a palavra
        const pb = E.outQuart(clamp((lt - atraso - 0.22) / 0.3, 0, 1));
        if (pb > 0) { ctx.filter = 'none'; ctx.fillStyle = cor(it.corDestaque || est.dest || 'acento'); caixa(ctx, -pw.w / 2, px * 0.5, pw.w * pb, Math.max(8, px * 0.09), 4); ctx.fill(); }
      }
      ctx.restore();
      x += pw.w + esp;
      indice++;
    }
    if (anim === 'mascara') ctx.restore();
  });
  if (est.pulso) desenharSeta(ctx, y0 + linhas.length * alt + 30, lt); // seta apontando para o botão do anúncio
  ctx.restore();
}

function desenharSeta(ctx, y, lt) {
  const p = clamp((lt - 0.4) / 0.3, 0, 1);
  if (p <= 0) return;
  const b = Math.abs(Math.sin(lt * 5)) * 26;
  ctx.save();
  ctx.globalAlpha *= p;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14;
  for (let k = 0; k < 2; k++) {
    const yy = y + b + k * 42;
    ctx.globalAlpha = p * (k ? 0.55 : 1);
    ctx.beginPath(); ctx.moveTo(-42, yy); ctx.lineTo(0, yy + 36); ctx.lineTo(42, yy); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- opcionais (5 animações + lista)

const ICONES = [
  [/teto|solar/, '☀️'], [/dire[cç][aã]o|hidr[aá]ulic/, '⚙️'], [/volante|multifun/, '🎛️'], [/vidro|trava|el[eé]tric/, '🔌'], [/carplay|android auto|multim[ií]dia|central|tela|espelhamento/, '📱'], [/couro|banco/, '💺'],
  [/c[aâ]mera|\br[eé]\b/, '📷'], [/sensor|estaciona/, '📡'], [/roda|aro|pneu|liga leve/, '🚘'], [/ar[- ]?condicionado|climatiz|ar digital/, '❄️'],
  [/turbo|motor|\bcv\b|pot[eê]ncia|torque/, '⚡'], [/autom[aá]tic|c[aâ]mbio|cvt/, '⚙️'], [/\bkm\b|quil[oô]metr|rodad/, '🛣️'],
  [/dono|propriet/, '👤'], [/revis/, '🔧'], [/laudo|vistoria|aprovad|cautelar/, '✅'], [/garantia|airbag|seguran/, '🛡️'],
  [/porta[- ]?malas|espa[cç]o|litros|bagag/, '🧳'], [/econom|consumo|km\/l|flex|combust/, '⛽'], [/farol|led|xenon|luz/, '💡'],
  [/chave|partida|keyless|presencial/, '🔑'], [/piloto|cruise|adaptativ/, '🎯'], [/som|alto[- ]?falante|jbl|harman|bose/, '🔊'],
  [/pre[cç]o|fipe|parcela|r\$|financ|troca/, '💰'], [/fam[ií]lia|crian/, '👨‍👩‍👧'], [/4x4|tra[cç][aã]o|off[- ]?road/, '🏔️'], [/uber|app|trabalh/, '💼'],
];
const iconePara = (s) => (ICONES.find(([re]) => re.test(s.toLowerCase())) || [null, '★'])[1];
const F_EMOJI = (px) => `${px}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;

function itensDe(it) {
  return String(it.texto || '').split(/\n|;| \+ | • |\|/)
    .map((s) => s.replace(/^[\s✓✔☑•\-–—\d.)º°#]+(?=\S)/, (m) => (m.includes('*') ? '*' : '')).trim()).filter(Boolean);
}
/** Momento (relativo ao início do texto) em que cada item aparece: sincronizado com os cortes quando houver. */
function temposDe(it, n) {
  if (Array.isArray(it.tempos) && it.tempos.length >= n) return it.tempos.slice(0, n);
  const passo = Math.min(0.9, Math.max(0.22, (it.dur - 0.6) / Math.max(1, n)));
  return [...Array(n)].map((_, k) => 0.08 + k * passo);
}
function atualIdx(tempos, lt) { let k = -1; tempos.forEach((t, i) => { if (lt >= t) k = i; }); return k; }

/** Escreve palavras com *destaque* (centralizado em x=0). */
function escreverRico(ctx, txt, y, corBase, corDest, contorno = null, lw = 0) {
  const pals = txt.split(/\s+/);
  const esp = ctx.measureText(' ').width;
  let emD = false;
  const pecas = pals.map((pal) => {
    const abre = /^[^\w*]*\*/.test(pal), fecha = /\*[^\w*]*$/.test(pal) && (pal.match(/\*/g).length > 1 || !abre || emD);
    const d = emD || abre; if (abre) emD = true; if (fecha) emD = false;
    const t = pal.replace(/\*/g, '');
    return { t, d, w: ctx.measureText(t).width };
  });
  const total = pecas.reduce((s, p) => s + p.w, 0) + esp * (pecas.length - 1);
  let x = -total / 2;
  ctx.textAlign = 'left';
  for (const p of pecas) {
    if (contorno) { ctx.strokeStyle = contorno; ctx.lineWidth = lw; ctx.strokeText(p.t, x, y); }
    ctx.fillStyle = p.d ? corDest : corBase; ctx.fillText(p.t, x, y);
    x += p.w + esp;
  }
  return total;
}
function ajustarFonte(ctx, est, px, txt, maxW) {
  ctx.font = est.fonte(px);
  const w = ctx.measureText(txt.replace(/\*/g, '')).width;
  if (w > maxW) { px = Math.max(24, Math.floor(px * maxW / w)); ctx.font = est.fonte(px); }
  return px;
}

const OPCIONAIS = {
  // Um card grande por vez: entra girando, o anterior sai pela esquerda; bolinhas de progresso.
  cards(ctx, it, lt, est) {
    const itens = itensDe(it); if (!itens.length) return;
    const tempos = temposDe(it, itens.length), k = atualIdx(tempos, lt);
    if (k < 0) return;
    const sai = saida(it.animOut || 'fade', lt, it.dur);
    const cx = (it.x ?? 0.5) * W, cy = (it.y ?? 0.42) * H, s = it.tam || 1;
    const cw = 800 * s, ch = 360 * s;
    const card = (i, q, saindo) => {
      const txt = est.maius ? itens[i].toUpperCase() : itens[i];
      ctx.save();
      if (saindo) { ctx.translate(-E.inCubic(q) * W * 0.9, 0); ctx.rotate(-E.inCubic(q) * 0.25); ctx.globalAlpha *= 1 - q; } else {
        const e = E.outBack(q);
        ctx.rotate((1 - E.outCubic(q)) * 0.22);
        ctx.scale(Math.max(0.01, e), Math.max(0.01, 0.6 + 0.4 * e));
        ctx.globalAlpha *= clamp(q * 3, 0, 1);
      }
      const vi = vida(it.vida || 'flutuar', lt, i);
      ctx.translate(vi.dx, vi.dy);
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
      ctx.fillStyle = '#fff'; caixa(ctx, -cw / 2, -ch / 2, cw, ch, 40 * s); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = cor(it.corDestaque || 'acento'); caixa(ctx, -cw / 2, -ch / 2, 22 * s, ch, 11 * s); ctx.fill();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.font = F_EMOJI(Math.round(120 * s)); ctx.fillStyle = cor(it.corDestaque || 'acento'); ctx.fillText(iconePara(itens[i]), 0, -ch * 0.18);
      const px = ajustarFonte(ctx, est, Math.round(est.tam * s), txt, cw - 80 * s); void px;
      escreverRico(ctx, txt, ch * 0.24, cor(it.cor || est.cor), cor(it.corDestaque || est.dest));
      ctx.restore();
    };
    ctx.save();
    ctx.globalAlpha = sai.a;
    ctx.translate(cx + sai.dx, cy + sai.dy);
    const q = clamp((lt - tempos[k]) / 0.42, 0, 1);
    if (k > 0 && q < 1) card(k - 1, clamp((lt - tempos[k]) / 0.3, 0, 1), true);
    card(k, q, false);
    // bolinhas de progresso
    const n = itens.length, gap = 34 * s;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i === k ? (cor(it.corDestaque || 'acento')) : 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc((i - (n - 1) / 2) * gap, ch / 2 + 50 * s, i === k ? 11 * s : 7 * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // Mosaico 2×N: cada bloco entra girando no tempo do seu corte; o mais novo brilha.
  grade(ctx, it, lt, est) {
    const itens = itensDe(it).slice(0, 6); if (!itens.length) return;
    const tempos = temposDe(it, itens.length);
    const sai = saida(it.animOut || 'fade', lt, it.dur);
    const s = it.tam || 1, tw = 480 * s, th = 300 * s, gap = 26 * s;
    const cols = itens.length === 1 ? 1 : 2, rows = Math.ceil(itens.length / cols);
    const cx = (it.x ?? 0.5) * W, cy = (it.y ?? 0.42) * H;
    const k = atualIdx(tempos, lt);
    ctx.save();
    ctx.globalAlpha = sai.a;
    ctx.translate(cx + sai.dx, cy + sai.dy);
    itens.forEach((txt0, i) => {
      const q = clamp((lt - tempos[i]) / 0.4, 0, 1);
      if (q <= 0) return;
      const r = Math.floor(i / cols), c = i % cols;
      const ultimaLinha = r === rows - 1 && itens.length % cols === 1;
      const x = ultimaLinha ? 0 : (c - (cols - 1) / 2) * (tw + gap);
      const y = (r - (rows - 1) / 2) * (th + gap);
      const vi = vida(it.vida || 'flutuar', lt, i * 1.3);
      ctx.save();
      ctx.translate(x + vi.dx, y + vi.dy);
      ctx.rotate((1 - E.outCubic(q)) * (i % 2 ? -0.35 : 0.35));
      const e = Math.max(0.01, E.outBack(q)); ctx.scale(e, e);
      ctx.globalAlpha *= clamp(q * 3, 0, 1);
      ctx.fillStyle = 'rgba(10,12,16,0.84)'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 24;
      caixa(ctx, -tw / 2, -th / 2, tw, th, 28 * s); ctx.fill(); ctx.shadowColor = 'transparent';
      const brilho = i === k ? 0.6 + 0.4 * Math.sin(lt * 8) : 0.35;
      ctx.strokeStyle = comAlpha(cor('acento'), brilho); ctx.lineWidth = (i === k ? 7 : 4) * s; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = F_EMOJI(Math.round(86 * s)); ctx.fillStyle = cor(it.corDestaque || 'acento'); ctx.fillText(iconePara(txt0), 0, -th * 0.2);
      const txt = est.maius ? txt0.toUpperCase() : txt0;
      // até 2 linhas, equilibradas, antes de reduzir a fonte
      ctx.font = est.fonte(Math.round(est.tam * s));
      const pals = txt.split(/\s+/);
      let linhas = [txt];
      if (ctx.measureText(txt.replace(/\*/g, '')).width > tw - 40 * s && pals.length > 1) {
        let melhor = null;
        for (let c = 1; c < pals.length; c++) {
          const a = pals.slice(0, c).join(' '), b = pals.slice(c).join(' ');
          const m = Math.max(ctx.measureText(a.replace(/\*/g, '')).width, ctx.measureText(b.replace(/\*/g, '')).width);
          if (!melhor || m < melhor.m) melhor = { a, b, m };
        }
        linhas = [melhor.a, melhor.b];
      }
      const maior = linhas.reduce((m, l) => (l.length > m.length ? l : m), '');
      const pxL = ajustarFonte(ctx, est, Math.round(est.tam * s), maior, tw - 40 * s);
      linhas.forEach((l, li) => escreverRico(ctx, l, th * 0.22 + (li - (linhas.length - 1) / 2) * pxL * 1.1 + (linhas.length > 1 ? pxL * 0.25 : 0), cor(it.cor || est.cor), cor(it.corDestaque || est.dest)));
      ctx.restore();
    });
    ctx.restore();
  },

  // Contagem: número gigante bate na tela (3, 2, 1) com o motivo embaixo.
  contador(ctx, it, lt, est) {
    const itens = itensDe(it); if (!itens.length) return;
    const tempos = temposDe(it, itens.length), k = atualIdx(tempos, lt);
    if (k < 0) return;
    const sai = saida(it.animOut || 'fade', lt, it.dur);
    const s = it.tam || 1, n = itens.length;
    const cx = (it.x ?? 0.5) * W, cy = (it.y ?? 0.36) * H;
    const lk = lt - tempos[k];
    ctx.save();
    ctx.globalAlpha = sai.a;
    ctx.translate(cx + sai.dx, cy + sai.dy);
    if (lk > 0.17 && lk < 0.35) ctx.translate(ruido(lt * 80) * 14, ruido(lt * 71) * 14);
    // número
    const e = entrada('slam', lk, 0);
    ctx.save();
    ctx.scale(e.s, e.s); ctx.globalAlpha *= e.a;
    ctx.font = F_ALTA(Math.round(400 * s)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 30;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 22 * s; ctx.strokeText(String(n - k), 0, -40 * s);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = cor(it.corDestaque || 'acento'); ctx.fillText(String(n - k), 0, -40 * s);
    ctx.restore();
    // texto do motivo, palavra por palavra
    const txt = est.maius ? itens[k].toUpperCase() : itens[k];
    ajustarFonte(ctx, est, Math.round(est.tam * s), txt, W * 0.86);
    const pals = txt.split(/\s+/);
    const vis = pals.slice(0, Math.max(1, Math.ceil((lk - 0.15) / 0.08))).join(' ');
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const ep = entrada('subir', lk, 0.15);
    ctx.globalAlpha *= ep.a;
    escreverRico(ctx, vis, 230 * s + ep.dy * 0.4, cor(it.cor || est.cor), cor(it.corDestaque || est.dest), '#000', 13 * s);
    ctx.restore();
  },

  // Duas faixas diagonais cruzadas correndo em sentidos opostos (estilo car edit).
  letreiro(ctx, it, lt, est) {
    const itens = itensDe(it); if (!itens.length) return;
    const sai = saida(it.animOut || 'fade', lt, it.dur);
    const s = it.tam || 1, px = Math.round(est.tam * s);
    const cy = (it.y ?? 0.42) * H;
    const tira = (cor, corTxt, ang, dy, vel, inv) => {
      ctx.save();
      ctx.translate(W / 2 + sai.dx, cy + dy + sai.dy);
      ctx.rotate(ang);
      const ent = E.outCubic(clamp(lt / 0.45, 0, 1));
      ctx.translate((1 - ent) * (inv ? -1 : 1) * W * 1.4, 0);
      const h = px * 1.7;
      ctx.fillStyle = cor; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 24;
      ctx.fillRect(-W * 1.2, -h / 2, W * 2.4, h); ctx.shadowColor = 'transparent';
      ctx.font = est.fonte(px); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const frase = itens.map((x) => (est.maius ? x.toUpperCase() : x).replace(/\*/g, '')).join('  ✦  ') + '  ✦  ';
      const fw = ctx.measureText(frase).width;
      let x0 = -W * 1.2 - ((lt * vel) % fw) * (inv ? -1 : 1);
      if (inv) x0 -= fw;
      ctx.fillStyle = corTxt;
      for (let x = x0; x < W * 1.2; x += fw) ctx.fillText(frase, x, px * 0.05);
      ctx.restore();
    };
    ctx.save();
    ctx.globalAlpha = sai.a;
    tira('#111', '#fff', 0.09, 120 * s, 230, true);
    tira(cor(it.corDestaque || 'acento'), contraste(cor(it.corDestaque || 'acento')), -0.12, -60 * s, 300, false);
    ctx.restore();
  },

  // Checklist: todos os itens aparecem apagados e vão sendo marcados (caixa + ✓ desenhado).
  checklist(ctx, it, lt, est) {
    const itens = itensDe(it); if (!itens.length) return;
    const tempos = temposDe(it, itens.length);
    const sai = saida(it.animOut || 'fade', lt, it.dur);
    const s = it.tam || 1, px = Math.round(est.tam * s), alt = px * 1.9;
    const cx = (it.x ?? 0.5) * W, cy = (it.y ?? 0.44) * H;
    const ent = E.outCubic(clamp(lt / 0.35, 0, 1));
    ctx.save();
    ctx.globalAlpha = sai.a * ent;
    ctx.font = est.fonte(px);
    const larg = Math.min(W * 0.88, Math.max(...itens.map((x) => ctx.measureText(x.replace(/\*/g, '')).width)) + px * 3.2);
    const topo = cy - ((itens.length) * alt) / 2;
    ctx.translate(cx - larg / 2 + sai.dx, sai.dy + (1 - ent) * 60);
    // painel
    ctx.fillStyle = 'rgba(8,10,14,0.82)'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30;
    caixa(ctx, -30 * s, topo - alt * 0.95, larg + 60 * s, alt * (itens.length + 1.05), 30 * s); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.font = F_FORTE(Math.round(px * 0.62)); ctx.fillStyle = cor(it.corDestaque || 'acento'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText((it.titulo || 'CHECKLIST APROVADO').toUpperCase(), 0, topo - alt * 0.45);
    itens.forEach((txt, i) => {
      const y = topo + (i + 0.5) * alt;
      const q = clamp((lt - tempos[i]) / 0.18, 0, 1), qc = clamp((lt - tempos[i] - 0.12) / 0.22, 0, 1);
      const b = px * 1.1;
      ctx.save();
      ctx.translate(b / 2, y);
      const pop = q > 0 && q < 1 ? 1 + 0.25 * Math.sin(q * Math.PI) : 1;
      ctx.scale(pop, pop);
      ctx.fillStyle = q > 0 ? cor('cta') : 'rgba(255,255,255,0.08)';
      ctx.strokeStyle = q > 0 ? cor('cta') : 'rgba(255,255,255,0.45)'; ctx.lineWidth = 5 * s;
      caixa(ctx, -b / 2, -b / 2, b, b, 12 * s); ctx.fill(); ctx.stroke();
      if (qc > 0) { // ✓ sendo desenhado
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 9 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const p1 = [-b * 0.26, 0], p2 = [-b * 0.06, b * 0.2], p3 = [b * 0.28, -b * 0.22];
        ctx.beginPath(); ctx.moveTo(...p1);
        const a = Math.min(1, qc * 2.2); ctx.lineTo(lerp(p1[0], p2[0], a), lerp(p1[1], p2[1], a));
        if (qc > 0.45) { const c2 = (qc - 0.45) / 0.55; ctx.lineTo(lerp(p2[0], p3[0], c2), lerp(p2[1], p3[1], c2)); }
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      ctx.font = est.fonte(px); ctx.textBaseline = 'middle';
      ctx.globalAlpha *= q > 0 ? 1 : 0.4;
      ctx.translate(b + px * 0.5 + (1 - E.outCubic(q)) * 20, y + px * 0.04);
      const w = ctx.measureText(txt.replace(/\*/g, '')).width;
      ctx.translate(w / 2, 0);
      escreverRico(ctx, txt, 0, q > 0 ? cor(it.cor || est.cor) : '#cfd3da', cor(it.corDestaque || est.dest));
      ctx.restore();
    });
    ctx.restore();
  },
};

function desenharAlvo(ctx, it, lt, lx, ly, altRotulo) {
  const ax = (it.alvoX ?? 0.5) * W, ay = (it.alvoY ?? 0.62) * H;
  const r = 70 * (it.tam || 1);
  const p = clamp(lt / 0.45, 0, 1), pl = clamp((lt - 0.3) / 0.3, 0, 1);
  const sai = saida(it.animOut || 'fade', lt, it.dur);
  ctx.save();
  ctx.globalAlpha = sai.a;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(ax, ay, r * (1 + 0.06 * Math.sin(lt * 6)), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * E.outCubic(p)); ctx.stroke();
  if (pl > 0) {
    const ang = Math.atan2(ly - ay, lx - ax);
    const sx = ax + Math.cos(ang) * r, sy = ay + Math.sin(ang) * r;
    const ex = lerp(sx, lx, E.outCubic(pl)), ey = lerp(sy, ly + (ly > ay ? -altRotulo / 2 : altRotulo / 2), E.outCubic(pl));
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ax, ay, 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Lista de opcionais: cada item entra em sequência com ✓. Itens separados por linha, ";" ou " + ". */

/** Opcionais compactos, logo abaixo da legenda: informam sem cobrir o carro.
 *  3 variações (escolhidas por texto, para cada vídeo não sair igual): pílulas, letreiro (um por vez) e lista lateral. */
function desenharOpcCompacto(ctx, it, lt, est) {
  const itens = itensDe(it).map((x) => x.replace(/\*/g, '').replace(/^[✓✔☑•\-–—\s]+/, '').trim()).filter(Boolean).map((x) => (x.length > 28 ? `${x.slice(0, 27)}…` : x));
  if (!itens.length) return;
  const tempos = temposDe(it, itens.length);
  const variante = ['pilulas', 'letreiro', 'lista'][Math.abs(hash(it.id)) % 3];
  const yBase = Math.min(0.83, (TL().config.legendaY ?? 0.7) + 0.085) * H;
  const sai = clamp((it.dur - lt) / 0.3, 0, 1);
  if (sai <= 0) return;
  const ac = cor('acento');
  ctx.save();
  ctx.globalAlpha = sai;
  ctx.textBaseline = 'middle';
  ctx.font = F_FORTE(40, 800);
  const larg = (t) => ctx.measureText(t).width + 84;
  const pilula = (cx, cy, t, p) => { // pílula escura translúcida + marcador verde com ✓
    if (p <= 0) return;
    const w = larg(t), h = 68, e = E.outQuart(p);
    ctx.save();
    ctx.globalAlpha *= clamp(p * 2.5, 0, 1);
    ctx.translate(cx, cy + (1 - e) * 18);
    ctx.fillStyle = 'rgba(8,10,11,.74)'; caixa(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(-w / 2 + 31, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = contraste(ac); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const k = clamp((p - 0.3) / 0.4, 0, 1); // o ✓ se desenha
    ctx.beginPath(); ctx.moveTo(-w / 2 + 25, 0); ctx.lineTo(-w / 2 + 25 + 5 * Math.min(1, k * 2), 5 * Math.min(1, k * 2));
    if (k > 0.5) ctx.lineTo(-w / 2 + 30 + 8 * (k - 0.5) * 2, 5 - 11 * (k - 0.5) * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(t, -w / 2 + 54, 2);
    ctx.restore();
  };
  const prog = (i) => clamp((lt - tempos[i]) / 0.35, 0, 1);
  if (variante === 'pilulas') { // linhas de pílulas centralizadas, cada uma entra no seu tempo
    const linhas = [[]]; let acc = 0;
    itens.forEach((t, i) => { const w = larg(t) + 12; if (acc + w > W * 0.9 && linhas[linhas.length - 1].length) { linhas.push([]); acc = 0; } linhas[linhas.length - 1].push(i); acc += w; });
    linhas.forEach((ln, li) => {
      const total = ln.reduce((a, i) => a + larg(itens[i]) + 12, -12);
      let x = W / 2 - total / 2;
      ln.forEach((i) => { const w = larg(itens[i]); pilula(x + w / 2, yBase + li * 72, itens[i], prog(i)); x += w + 12; });
    });
  } else if (variante === 'letreiro') { // um opcional por vez, trocando com deslize lateral
    const k = atualIdx(tempos, lt);
    if (k >= 0) {
      const p = prog(k);
      if (k > 0 && p < 1) { ctx.save(); ctx.globalAlpha *= 1 - p; ctx.translate(-E.inCubic(p) * 180, 0); pilula(W / 2, yBase, itens[k - 1], 1); ctx.restore(); }
      ctx.save(); ctx.translate((1 - E.outQuart(p)) * 180, 0); pilula(W / 2, yBase, itens[k], p); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; // indicador de posição
      itens.forEach((_, i) => { ctx.beginPath(); ctx.arc(W / 2 + (i - (itens.length - 1) / 2) * 18, yBase + 50, i === k ? 5 : 3, 0, Math.PI * 2); ctx.fill(); });
    }
  } else { // lista lateral à esquerda, pequena
    itens.forEach((t, i) => { const w = larg(t); pilula(56 + w / 2, yBase + i * 68 - Math.max(0, itens.length - 3) * 34, t, prog(i)); });
  }
  ctx.restore();
}

function desenharLista(ctx, it, lt, est) {
  const itens = itensDe(it);
  if (!itens.length) return;
  const px = Math.round(est.tam * (it.tam || 1));
  const alt = px * 1.75;
  const tempos = temposDe(it, itens.length);
  const sai = saida(it.animOut || 'fade', lt, it.dur);
  ctx.save();
  ctx.font = est.fonte(px);
  ctx.textBaseline = 'middle';
  const larg = Math.min(W * 0.86, Math.max(...itens.map((s) => ctx.measureText(s.replace(/\*/g, '')).width)) + px * 2.6);
  const x0 = (it.x ?? 0.5) * W - larg / 2;
  const y0 = (it.y ?? 0.45) * H - ((itens.length - 1) * alt) / 2;
  ctx.globalAlpha = sai.a;
  ctx.translate(sai.dx, sai.dy);
  itens.forEach((txt, i) => {
    const e = entrada(it.anim === 'nenhuma' ? 'nenhuma' : 'pop', lt, tempos[i]);
    if (e.a <= 0) return;
    const desliza = (1 - E.outCubic(clamp((lt - tempos[i]) / 0.35, 0, 1))) * -160;
    const vi = vida(it.vida, lt, i * 1.7);
    const y = y0 + i * alt + vi.dy;
    ctx.save();
    ctx.globalAlpha *= e.a;
    ctx.translate(x0 + desliza + vi.dx, y);
    // pílula escura
    ctx.fillStyle = 'rgba(10,12,16,0.78)';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    caixa(ctx, 0, -alt * 0.4, larg, alt * 0.8, alt * 0.4); ctx.fill();
    ctx.shadowColor = 'transparent';
    // ícone ✓ que "pula"
    const r = alt * 0.29, ix = alt * 0.42;
    const sIcone = Math.max(0.01, E.outBack(clamp((lt - tempos[i] - 0.04) / 0.3, 0, 1)));
    ctx.save(); ctx.translate(ix, 0); ctx.scale(sIcone, sIcone);
    ctx.fillStyle = cor(it.corDestaque || est.dest); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-r * 0.45, 0); ctx.lineTo(-r * 0.1, r * 0.35); ctx.lineTo(r * 0.5, -r * 0.35); ctx.stroke();
    ctx.restore();
    // texto (palavras com *destaque*)
    ctx.font = est.fonte(px);
    let x = ix + r + px * 0.45;
    let emDest = false;
    for (const pal of txt.split(/\s+/)) {
      const abre = /^[^\w*]*\*/.test(pal), fecha = /\*[^\w*]*$/.test(pal) && (pal.match(/\*/g).length > 1 || !abre || emDest);
      const dest = emDest || abre;
      if (abre) emDest = true;
      if (fecha) emDest = false;
      const limpo = pal.replace(/\*/g, '');
      ctx.fillStyle = dest ? cor(it.corDestaque || est.dest) : cor(it.cor || est.cor);
      ctx.textAlign = 'left';
      ctx.fillText(limpo, x, px * 0.04);
      x += ctx.measureText(limpo + ' ').width;
    }
    ctx.restore();
  });
  ctx.restore();
}

/** "De R$ 134.000 | Por R$ 129.900": preço antigo riscado, depois o novo bate na tela contando. */
function desenharDePor(ctx, it, lt, est) {
  const partes = String(it.texto || '').replace(/\*/g, '').split(/\||\n| por /i).map((s) => s.trim()).filter(Boolean); // * de destaque nunca aparece
  const de = (partes[0] || '').replace(/^de\s*/i, ''), por = (partes[1] || partes[0] || '').replace(/^por\s*/i, '');
  const px = Math.round(est.tam * (it.tam || 1));
  const cx = (it.x ?? 0.5) * W, cy = (it.y ?? 0.4) * H;
  const sai = saida(it.animOut || 'fade', lt, it.dur);
  ctx.save();
  ctx.globalAlpha = sai.a;
  ctx.translate(cx + sai.dx, cy + sai.dy);
  ctx.scale(sai.s, sai.s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  // "DE" pequeno, aparece e é riscado
  const e1 = entrada('pop', lt, 0);
  const pxDe = Math.round(px * 0.48);
  ctx.save();
  ctx.globalAlpha *= e1.a * (lt > 1.0 ? 0.75 : 1);
  ctx.translate(0, -px * 1.02); ctx.scale(e1.s, e1.s);
  ctx.font = F_FORTE(pxDe);
  const txtDe = `DE ${de}`.toUpperCase();
  const wDe = ctx.measureText(txtDe).width;
  ctx.strokeStyle = '#000'; ctx.lineWidth = 9; ctx.strokeText(txtDe, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillText(txtDe, 0, 0);
  const risco = E.outCubic(clamp((lt - 0.45) / 0.3, 0, 1));
  if (risco > 0) {
    ctx.strokeStyle = cor('primaria'); ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-wDe / 2 - 10, 4); ctx.lineTo(-wDe / 2 - 10 + (wDe + 20) * risco, -4); ctx.stroke();
  }
  ctx.restore();
  // "POR" grande com slam + contagem
  const t2 = lt - 0.8;
  if (t2 > 0) {
    const e2 = entrada('slam', t2, 0);
    const vi = vida(it.vida || 'pulsar', lt, 3);
    ctx.save();
    if (t2 > 0.17 && t2 < 0.35) ctx.translate(ruido(lt * 80) * 12, ruido(lt * 70) * 12);
    ctx.globalAlpha *= e2.a;
    ctx.scale(e2.s * vi.s, e2.s * vi.s);
    ctx.font = F_FORTE(Math.round(px * 0.34));
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 8;
    ctx.strokeText('POR APENAS', 0, -px * 0.18); ctx.fillText('POR APENAS', 0, -px * 0.18);
    ctx.font = est.fonte(px);
    const txt = contarNumero(por, clamp(t2 / 0.8, 0, 1));
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24;
    ctx.strokeStyle = '#000'; ctx.lineWidth = est.lw; ctx.strokeText(txt, 0, px * 0.5);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = cor(it.cor || est.cor); ctx.fillText(txt, 0, px * 0.5);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- efeitos de luz

function luz(ctx, t, intensidade, semente = 0) {
  if (intensidade <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = clamp(intensidade, 0, 1);
  const x1 = W * (0.2 + 0.6 * ((Math.sin(t * 1.3 + semente) + 1) / 2));
  const g1 = ctx.createRadialGradient(x1, H * 0.3, 0, x1, H * 0.3, H * 0.6);
  g1.addColorStop(0, 'rgba(255,170,60,0.95)'); g1.addColorStop(0.45, 'rgba(255,60,20,0.45)'); g1.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const x2 = W * (0.8 - 0.6 * ((Math.cos(t * 0.9 + semente) + 1) / 2));
  const g2 = ctx.createRadialGradient(x2, H * 0.8, 0, x2, H * 0.8, H * 0.5);
  g2.addColorStop(0, 'rgba(255,230,180,0.8)'); g2.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function separacaoRGB(ctx, k) {
  if (k <= 0.02) return;
  const cv = ctx.canvas, sx = cv.width / W;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.4 * k;
  ctx.drawImage(cv, 16 * k * sx, 0);
  ctx.drawImage(cv, -16 * k * sx, 0);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = `rgba(255,0,60,${0.12 * k})`; ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = `rgba(0,200,255,${0.12 * k})`; ctx.fillRect(W / 2, 0, W / 2, H);
  ctx.restore();
}

// ---------------------------------------------------------------- logotipo em texto (enquanto não há arquivo de logo)

/** "TOP" na cor da marca + "CAR" em branco, "VEÍCULOS" embaixo, sobre a silhueta de um carro. */
/** 81960002209 → (81) 96000-2209 */
export function formatarFone(n) {
  let d = String(n || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(n || '');
}

/** Ícone de balão com telefone (estilo WhatsApp), desenhado (sem depender de fonte). */
function iconeWhats(ctx, x, y, r, corFundo, corIcone) {
  ctx.save();
  ctx.fillStyle = corFundo;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - r * 0.78, y + r * 0.45); ctx.lineTo(x - r * 1.05, y + r * 1.05); ctx.lineTo(x - r * 0.35, y + r * 0.85); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = corIcone; ctx.lineWidth = r * 0.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r * 0.48, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke(); // fone
  ctx.beginPath(); ctx.moveTo(x - r * 0.32, y - r * 0.42); ctx.lineTo(x - r * 0.12, y - r * 0.5); ctx.moveTo(x - r * 0.32, y + r * 0.42); ctx.lineTo(x - r * 0.12, y + r * 0.5); ctx.stroke();
  ctx.restore();
}

function dadosCarro() {
  const c = S.p?.carro || {};
  const nome = [c.modelo, c.versao && String(c.versao).split(' ')[0], c.ano].filter(Boolean).join(' ');
  const km = String(c.km || '').replace(/\D/g, '');
  const kmTxt = km ? (+km >= 1000 ? `${Math.round(+km / 1000)} mil km` : `${km} km`) : '';
  return { nome: nome.toUpperCase(), preco: c.preco ? `R$ ${String(c.preco).replace(/^R\$\s*/, '')}` : '', km: kmTxt };
}

/** Faixa fixa com carro, km e preço: quem para no vídeo sabe na hora do que se trata (padrão dos anúncios que convertem). */
function desenharFaixa(ctx, t, inicio, fim) {
  const d = dadosCarro();
  if (!d.nome || !d.preco) return;
  const ent = E.outQuart(clamp((t - inicio) / 0.45, 0, 1)), sai = clamp((fim - t) / 0.3, 0, 1);
  if (ent <= 0 || sai <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(ent, sai);
  const x = 46 - (1 - ent) * 420, y = 236; // abaixo da barra do Instagram (perfil, progresso dos Stories)
  ctx.font = F_FORTE(40, 900);
  const w1 = ctx.measureText(d.nome).width;
  ctx.font = F_ALTA(56);
  const w2 = ctx.measureText(d.preco).width;
  const w = Math.max(w1, w2 + (d.km ? 0 : 0)) + 56;
  ctx.fillStyle = 'rgba(8,9,10,.82)'; caixa(ctx, x, y, w, 150, 18); ctx.fill();
  ctx.fillStyle = cor('acento'); ctx.fillRect(x, y + 18, 8, 114);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#fff'; ctx.font = F_FORTE(40, 900); ctx.fillText(d.nome, x + 30, y + 42);
  ctx.fillStyle = cor('acento'); ctx.font = F_ALTA(56); ctx.fillText(d.preco, x + 30, y + 102);
  if (d.km) { ctx.font = F_FORTE(28, 800); ctx.fillStyle = '#cfd4d8'; ctx.fillText(d.km, x + 40 + w2, y + 108); }
  ctx.restore();
}

function desenharLogoTexto(ctx, cx, cy, largura, alpha = 1) {
  const lt = S.marca?.logoTexto || {};
  const a = (lt.a || '').toUpperCase(), b = (lt.b || '').toUpperCase(), sub = (lt.sub || '').toUpperCase();
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.textBaseline = 'alphabetic';
  let px = 100;
  ctx.font = `italic 900 ${px}px "${S.marca?.fonteTitulo || 'Exo 2'}", sans-serif`;
  const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
  const k = largura / (wa + wb);
  px *= k;
  ctx.font = `italic 900 ${px}px "${S.marca?.fonteTitulo || 'Exo 2'}", sans-serif`;
  const total = (wa + wb) * k;
  const x0 = cx - total / 2;
  // silhueta do carro (linha) acima do nome
  ctx.strokeStyle = '#cfd3d8'; ctx.lineWidth = px * 0.05; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0 + total * 0.08, cy - px * 0.86);
  ctx.bezierCurveTo(x0 + total * 0.3, cy - px * 1.32, x0 + total * 0.62, cy - px * 1.38, x0 + total * 0.86, cy - px * 0.98);
  ctx.moveTo(x0 + total * 0.32, cy - px * 1.06);
  ctx.bezierCurveTo(x0 + total * 0.5, cy - px * 1.2, x0 + total * 0.72, cy - px * 1.18, x0 + total * 0.98, cy - px * 0.84);
  ctx.stroke();
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = px * 0.25;
  ctx.textAlign = 'left';
  ctx.fillStyle = cor('primaria'); ctx.fillText(a, x0, cy);
  ctx.fillStyle = '#fff'; ctx.fillText(b, x0 + wa * k, cy);
  if (sub) {
    ctx.font = `700 ${px * 0.3}px "${S.marca?.fonteTitulo || 'Exo 2'}", sans-serif`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = `${px * 0.04}px`;
    ctx.fillText(sub, x0 + total * 0.62, cy + px * 0.42);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- valorização dos takes

function desenharFlare(ctx, x, y, k) {
  if (k <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const r = 230;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.95 * k})`); g.addColorStop(0.18, `rgba(200,230,255,${0.55 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  // risco horizontal (lente anamórfica)
  const s = ctx.createLinearGradient(x - W * 0.7, y, x + W * 0.7, y);
  s.addColorStop(0, 'rgba(60,140,255,0)'); s.addColorStop(0.5, `rgba(170,215,255,${0.7 * k})`); s.addColorStop(1, 'rgba(60,140,255,0)');
  ctx.fillStyle = s; ctx.fillRect(x - W * 0.7, y - 4, W * 1.4, 8);
  // reflexos fantasmas na direção do centro
  const cx = 0, cy = 0;
  for (const [m, rr, a] of [[0.5, 46, 0.22], [1.2, 80, 0.12], [1.7, 30, 0.25]]) {
    const gx = x + (cx - x) * m, gy = y + (cy - y) * m;
    const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr);
    gg.addColorStop(0, `rgba(120,200,255,${a * k})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg; ctx.fillRect(gx - rr, gy - rr, rr * 2, rr * 2);
  }
  ctx.restore();
}

/** Faixa de luz atravessando a lataria (efeito clássico de comercial de carro). */
function brilhoLataria(ctx, c, t) {
  const u = (t - c.start) / c.dur;
  const p = clamp((u - 0.12) / 0.62, 0, 1);
  if (p <= 0 || p >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(-W * 0.4 + E.inOut(p) * W * 1.8, H / 2);
  ctx.rotate(0.38);
  for (const [larg, a] of [[300, 0.22], [110, 0.38]]) {
    const g = ctx.createLinearGradient(-larg, 0, larg, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-larg, -H, larg * 2, H * 2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- acabamento

let cacheBatidas = { chave: '', lista: [] };
function pulsoBatida(t) {
  const m = TL().musica;
  if (!m?.batidas?.length) return 0;
  const chave = `${m.id}|${m.offset}|${m.inicio}|${m.batidas.length}`;
  if (cacheBatidas.chave !== chave) {
    cacheBatidas = { chave, lista: m.batidas.map((b) => b - (m.offset || 0) + (m.inicio || 0)).filter((b) => b >= 0) };
  }
  const L = cacheBatidas.lista;
  let lo = 0, hi = L.length - 1, idx = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (L[mid] <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
  if (idx < 0) return 0;
  // só no 1º e 3º tempo do compasso, com ataque de 50 ms e queda suave: "respira" na batida sem tremer
  let k = idx;
  while (k >= 0 && k % 2 !== 0) k--;
  if (k < 0) return 0;
  const dt = t - L[k];
  const forca = k % 4 === 0 ? 0.016 : 0.009;
  if (dt < 0 || dt > 0.6) return 0;
  const ataque = Math.min(1, dt / 0.05);
  return forca * ataque * ataque * (3 - 2 * ataque) * Math.exp(-dt * 6);
}

/** n amostras de -0.5 a 0.5 (posições do "obturador" ao longo do movimento). */
function amostrar(n, fn) { return Array.from({ length: n }, (_, i) => fn(n === 1 ? 0 : i / (n - 1) - 0.5)); }

/** Bloom: as altas luzes (lataria, faróis, céu) ganham um brilho suave, como em comercial de carro. */
let telaBloom = null;
function bloom(ctx, forca = 0.22) {
  const cv = ctx.canvas;
  const w = Math.max(32, Math.round(cv.width / 6)), h = Math.max(32, Math.round(cv.height / 6));
  if (!telaBloom || telaBloom.width !== w || telaBloom.height !== h) { telaBloom = document.createElement('canvas'); telaBloom.width = w; telaBloom.height = h; }
  const b = telaBloom.getContext('2d');
  b.globalCompositeOperation = 'source-over';
  b.filter = 'brightness(0.62) contrast(3.2) saturate(1.3)'; // só o que é bem claro sobrevive
  b.drawImage(cv, 0, 0, w, h);
  b.filter = 'none';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = forca;
  ctx.filter = `blur(${Math.round(cv.width / 90)}px)`;
  ctx.drawImage(telaBloom, 0, 0, cv.width, cv.height);
  ctx.restore();
}

let texturaGrao = null;
function grao(ctx, t) {
  if (!texturaGrao) {
    texturaGrao = document.createElement('canvas');
    texturaGrao.width = texturaGrao.height = 256;
    const g = texturaGrao.getContext('2d'), img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
  }
  const f = Math.floor(t * 24);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.07;
  const ox = (f * 73) % 256, oy = (f * 151) % 256;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = ctx.createPattern(texturaGrao, 'repeat');
  ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

/** Faixa escura suave atrás dos textos ativos (leitura sobre qualquer imagem). */
function escurecerAtrasDosTextos(ctx, textos, t) {
  for (const it of textos) {
    const lt = t - it.inicio;
    if (lt < 0 || lt > it.dur) continue;
    const est = ESTILOS[it.estilo];
    if (!est || est.caixa || est.opc || est.lista) continue; // opcionais compactos já têm fundo próprio
    const a = Math.min(clamp(lt / 0.3, 0, 1), clamp((it.dur - lt) / 0.3, 0, 1));
    const y = (it.y ?? 0.3) * H, h = est.opc ? 760 : 520 * (it.tam || 1);
    const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, `rgba(0,0,0,${0.28 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y - h / 2, W, h);
  }
}

// ---------------------------------------------------------------- classe principal

export class Motor {
  constructor() {
    this.videos = new Map(); // clipId -> <video>
    this.imgs = new Map();
  }

  sincronizarElementos() {
    const ids = new Set();
    const garantir = (chave, tk) => {
      if (!tk?.proxy) return;
      ids.add(chave);
      const src = mediaUrl(tk.proxy);
      let v = this.videos.get(chave);
      if (!v) {
        v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto';
        // guarda o último quadro bom: enquanto o vídeo busca posição, desenhamos ele (nada de tela vazia)
        v.addEventListener('loadeddata', () => this.guardarQuadro(v, true));
        v.addEventListener('seeked', () => this.guardarQuadro(v, true));
        this.videos.set(chave, v);
      }
      if (v._src !== src) { v.src = src; v._src = src; v._cache = null; }
    };
    for (const c of TL().clips) {
      garantir(c.id, take(c.takeId));
      if (c.duplo?.takeId) garantir(`${c.id}#2`, take(c.duplo.takeId));
    }
    for (const [id, v] of this.videos) {
      if (!ids.has(id)) { v.pause(); v.removeAttribute('src'); v.load(); this.videos.delete(id); }
    }
  }

  guardarQuadro(v, forcar = false) {
    if (!(v.readyState >= 2 && v.videoWidth)) return;
    v._n = (v._n || 0) + 1;
    if (!forcar && v._cache && v._n % 4) return;
    if (!v._cache) {
      v._cache = document.createElement('canvas');
      v._cache.width = Math.min(540, v.videoWidth);
      v._cache.height = Math.round((v.videoHeight * v._cache.width) / v.videoWidth);
    }
    v._cache.getContext('2d').drawImage(v, 0, 0, v._cache.width, v._cache.height);
  }

  /** Melhor imagem disponível do vídeo: quadro atual → último quadro bom → miniatura do take. */
  fonteDe(v, tk) {
    if (v && v.readyState >= 2 && v.videoWidth) { this.guardarQuadro(v); return { src: v, w: v.videoWidth, h: v.videoHeight }; }
    if (v?._cache) { this.semQuadro = (this.semQuadro || 0) + 1; return { src: v._cache, w: v.videoWidth || tk?.w, h: v.videoHeight || tk?.h }; }
    const th = tk?.thumb && this.img(mediaUrl(tk.thumb));
    if (th) return { src: th, w: tk.w || th.naturalWidth, h: tk.h || th.naturalHeight };
    return null;
  }

  img(url) {
    if (!url) return null;
    if (!this.imgs.has(url)) { const i = new Image(); i.src = url; this.imgs.set(url, i); }
    const i = this.imgs.get(url);
    return i.complete && i.naturalWidth ? i : null;
  }

  /** Prévia: mantém os vídeos tocando sincronizados com o relógio do áudio (inclui rampas). */
  sincronizar(t, tocando) {
    const at = ativos(t);
    const precisa = new Set(at ? [at.a.id, at.b?.id].filter(Boolean) : []);
    const cl = TL().clips;
    for (const [id, v] of this.videos) {
      const dois = id.endsWith('#2');
      const c = cl.find((x) => x.id === (dois ? id.slice(0, -2) : id));
      if (!c || v.readyState < 1) continue;
      if (precisa.has(c.id)) {
        const alvo = dois ? srcTime2(c, t) : srcTime(c, t);
        const congelado = !dois && c.foto && t - c.start < FOTO;
        if (tocando && !congelado) {
          // velocidade constante (variar a velocidade do vídeo para "corrigir" causa oscilação visível)
          const base = dois ? 1 : clamp(velocidadeEm(c, t), 0.25, 4);
          if (Math.abs(v.playbackRate - base) > 0.01) v.playbackRate = base;
          if (Math.abs(alvo - v.currentTime) > 0.3 && !v.seeking) v.currentTime = alvo;
          if (v.paused) v.play().catch(() => {});
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - alvo) > 0.02 && !v.seeking) v.currentTime = alvo;
        }
      } else {
        if (!v.paused) v.pause();
        const alvo0 = dois ? srcTime2(c, c.start) : srcTime(c, c.start);
        // deixa o próximo clipe já posicionado (só os que vêm logo a seguir, para não sobrecarregar)
        if (c.start > t && c.start - t < 6 && Math.abs(v.currentTime - alvo0) > 0.1 && !v.seeking) v.currentTime = alvo0;
      }
    }
  }

  async prontoParaExportar() {
    this.sincronizarElementos();
    await Promise.all([...this.videos.values()].map((v) => (v.readyState >= 2 ? null : new Promise((res) => {
      v.addEventListener('loadeddata', res, { once: true });
      v.addEventListener('error', res, { once: true });
      setTimeout(res, 15000);
    }))));
    if (document.fonts?.load) await Promise.all([document.fonts.load(F_FORTE(80)), document.fonts.load(F_ALTA(80))]);
    for (const v of this.videos.values()) { v.pause(); v._quadro = -1; }
  }

  /** Exportação quadro a quadro, sem trepidação: pede o CENTRO de cada quadro do take (nunca a fronteira entre dois)
   *  e só segue quando o navegador realmente apresentou o quadro novo (requestVideoFrameCallback). */
  async posicionar(t) {
    const at = ativos(t);
    if (!at) return;
    const pares = [];
    for (const c of [at.a, at.b].filter(Boolean)) {
      pares.push([this.videos.get(c.id), srcTime(c, t), take(c.takeId)]);
      if (c.duplo) pares.push([this.videos.get(`${c.id}#2`), srcTime2(c, t), take(c.duplo.takeId)]);
    }
    await Promise.all(pares.map(([v, alvo, tk]) => {
      if (!v) return null;
      const fps = tk?.fps || 30;
      const dur = v.duration || tk?.dur || 0;
      const quadro = Math.max(0, Math.min(Math.floor(alvo * fps + 1e-4), Math.floor(dur * fps) - 1));
      if (v._quadro === quadro && !v.seeking) return null; // mesmo quadro do take (câmera lenta): reaproveita
      v._quadro = quadro;
      return new Promise((res) => {
        let feito = false;
        const fim = () => { if (!feito) { feito = true; res(); } };
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => fim());
        else v.addEventListener('seeked', fim, { once: true });
        v.currentTime = (quadro + 0.5) / fps;
        setTimeout(fim, 2500);
      }).then(async () => {
        // o quadro só pode ser desenhado quando o vídeo tem a imagem decodificada (readyState >= 2)
        for (let i = 0; i < 150 && (v.seeking || v.readyState < 2); i++) await new Promise((r) => setTimeout(r, 10));
        this.guardarQuadro(v, true);
      });
    }));
  }

  // ---------- desenho ----------

  desenharClip(ctx, c, t, fx = {}) {
    const v = this.videos.get(c.id);
    const cfg = TL().config;
    const lt = t - c.start;
    ctx.save();
    ctx.globalAlpha = fx.alpha ?? 1;
    const filtro = [FILTROS[cfg.filtroGlobal]?.css, FILTROS[c.filtro]?.css, fx.blur ? `blur(${fx.blur.toFixed(1)}px)` : ''].filter(Boolean).join(' ');
    ctx.filter = filtro || 'none';
    let dx = fx.dx || 0, dy = fx.dy || 0;
    // (tremor artificial removido)
    // (tranco de impacto removido)
    const tk = take(c.takeId);
    const f = tk ? this.fonteDe(v, tk) : null;
    if (c.duplo?.takeId && f) {
      this.desenharDuplo(ctx, c, t, f, dx, dy);
    } else if (f) {
      const g = geometria(c, f.w, f.h, t);
      let esc = fx.escala || 1;
      if (c.foto && lt >= 0 && lt < FOTO) esc *= 1 + 0.05 * (1 - lt / FOTO); // leve recuo no congelamento
      const rot = g.rot + (fx.rot || 0);
      ctx.translate(W / 2 + dx, H / 2 + dy);
      if (rot) ctx.rotate((rot * Math.PI) / 180);
      const k = esc * (rot ? 1.06 : 1);
      ctx.scale(k, k);
      ctx.drawImage(f.src, g.x - W / 2, g.y - H / 2, g.dw, g.dh);
      if (c.flare) { // brilho de lente no farol/lanterna
        ctx.filter = 'none';
        const u = clamp(lt / c.dur, 0, 1);
        desenharFlare(ctx, g.x - W / 2 + (c.flare.x ?? 0.5) * g.dw, g.y - H / 2 + (c.flare.y ?? 0.5) * g.dh, 0.45 + 0.55 * Math.sin(Math.PI * u) * (0.85 + 0.15 * Math.sin(t * 23)));
      }
    } else if (tk) {
      ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H); // vídeo ainda carregando: fundo neutro, nunca listras
    } else {
      this.cartao(ctx, t, dx, dy);
    }
    ctx.restore();
    if (!fx.cru) this.efeitosClip(ctx, c, t, fx.alpha ?? 1);
  }

  /** Borrão de movimento real: desenha o clipe em várias posições ao longo do movimento e faz a média
   *  (como o obturador de uma câmera), em vez de um desfoque uniforme. */
  desenharBorrado(ctx, c, t, amostras, alpha = 1, passo = 0) {
    // média acumulada: a i-ésima amostra entra com peso 1/(i+1) → todas pesam igual no final.
    // `passo` = distância (px da tela) entre amostras: um desfoque desse tamanho funde as cópias num rastro contínuo.
    const escala = ctx.canvas.width / W;
    const fundir = passo > 1 ? passo * 0.55 * escala : 0;
    amostras.forEach((fx, i) => this.desenharClip(ctx, c, t, { ...fx, cru: true, alpha: alpha / (i + 1), blur: (fx.blur || 0) + fundir }));
    this.efeitosClip(ctx, c, t, alpha);
  }

  efeitosClip(ctx, c, t, alpha) {
    const cfg = TL().config;
    const lt = t - c.start;
    const tinta = FILTROS[c.filtro]?.tinta || FILTROS[cfg.filtroGlobal]?.tinta;
    if (tinta) { ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = tinta; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    if (c.luz) luz(ctx, t, 0.28 + 0.1 * Math.sin(t * 2), hash(c.id));
    if (c.brilho) brilhoLataria(ctx, c, t);
    if (c.foto && lt >= 0 && lt < FOTO + 0.25) { // momento foto: flash + moldura enquanto congela
      ctx.save();
      const flash = Math.max(0, 1 - lt / 0.22);
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }
      if (lt < FOTO) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 18; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20;
        ctx.strokeRect(36, 36, W - 72, H - 72);
      }
      ctx.restore();
    }
  }

  /** Tela dividida: take principal em cima, segundo take embaixo, entrando de lados opostos. */
  desenharDuplo(ctx, c, t, fA, dx, dy) {
    const lt = t - c.start;
    const tk2 = take(c.duplo.takeId);
    const fB = this.fonteDe(this.videos.get(`${c.id}#2`), tk2) || fA;
    const e = E.outCubic(clamp(lt / 0.35, 0, 1));
    const u = clamp(lt / c.dur, 0, 1);
    const metade = (f, y0, fxp, fyp, desl, zoom) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, y0, W, H / 2); ctx.clip();
      const s = Math.max(W / f.w, (H / 2) / f.h) * zoom;
      const dw = f.w * s, dh = f.h * s;
      const x = clamp(W / 2 - fxp * dw, W - dw, 0) + desl + dx;
      const y = clamp(y0 + H / 4 - fyp * dh, y0 + H / 2 - dh, y0) + dy;
      ctx.drawImage(f.src, x, y, dw, dh);
      ctx.restore();
    };
    metade(fA, 0, c.focoX ?? 0.5, c.focoY ?? 0.5, -(1 - e) * W, 1.04 + 0.06 * u);
    metade(fB, H / 2, c.duplo.focoX ?? 0.5, 0.5, (1 - e) * W, 1.1 - 0.06 * u);
    ctx.save();
    ctx.filter = 'none';
    ctx.fillStyle = cor('acento');
    const lw = W * e;
    ctx.fillRect(W / 2 - lw / 2, H / 2 - 6, lw, 12);
    ctx.restore();
  }

  logoAtual() {
    if (S.p?.logo) return this.img(mediaUrl(S.p.logo));
    return S.marca?.logo ? this.img(marcaUrl(S.marca.logo)) : null;
  }

  /** Cartela da marca (cenas sem take): degradê nas cores da loja, logo, @ e WhatsApp. */
  cartao(ctx, t, dx = 0, dy = 0) {
    const cl = TL().clips, ult = cl[cl.length - 1];
    this.inicioCartao = ult && !ult.takeId ? ult.start : 0;
    const m = S.marca || {};
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1e20'); g.addColorStop(1, '#050607');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const brilho = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.75);
    brilho.addColorStop(0, comAlpha(cor('primaria'), 0.28)); brilho.addColorStop(1, comAlpha(cor('primaria'), 0));
    ctx.fillStyle = brilho; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = cor('primaria'); ctx.fillRect(0, H - 14, W, 14); // filete na cor da marca
    // brilho lento passando (movimento sutil, sem listras)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const x = ((t * 0.25) % 1.6 - 0.3) * W;
    const gl = ctx.createRadialGradient(x, H * 0.35, 0, x, H * 0.35, H * 0.45);
    gl.addColorStop(0, 'rgba(255,255,255,0.12)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const logo = this.logoAtual();
    ctx.save();
    ctx.translate(dx, dy);
    if (!logo && m.logoTexto) {
      desenharLogoTexto(ctx, W / 2, H * 0.3, 700 * (1 + 0.015 * Math.sin(t * 3)), Math.min(1, t * 3));
    }
    if (logo) {
      const lw = 600 * (1 + 0.02 * Math.sin(t * 3)), lh = (logo.naturalHeight / logo.naturalWidth) * lw;
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 40;
      ctx.drawImage(logo, W / 2 - lw / 2, H * 0.2 - lh / 2, lw, lh);
      ctx.shadowColor = 'transparent';
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const d = dadosCarro();
    const ent = (k) => E.outQuart(clamp((t - this.inicioCartao - k) / 0.4, 0, 1));
    if (d.nome) { // o carro e o preço, de novo, na hora da decisão
      ctx.globalAlpha = ent(0.1); ctx.font = F_FORTE(64, 900); ctx.fillStyle = '#fff';
      ctx.fillText(d.nome, W / 2, H * 0.53 + (1 - ent(0.1)) * 40);
      if (d.preco) {
        ctx.globalAlpha = ent(0.25); ctx.font = F_ALTA(110);
        const wp = ctx.measureText(d.preco).width + 90;
        ctx.fillStyle = cor('acento'); caixa(ctx, W / 2 - wp / 2, H * 0.6 - 70, wp, 140, 24); ctx.fill();
        ctx.fillStyle = contraste(cor('acento')); ctx.fillText(d.preco, W / 2, H * 0.6 + 4);
      }
      ctx.globalAlpha = 1;
    }
    if (m.whatsapp) {
      const a = ent(0.45), pulso = 1;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.735); ctx.scale(pulso, pulso);
      ctx.font = F_FORTE(34, 800); ctx.fillStyle = '#cfd4d8'; ctx.fillText('CHAMA NO WHATSAPP', 0, -78);
      const fone = formatarFone(m.whatsapp);
      ctx.font = F_ALTA(76);
      const wt = ctx.measureText(fone).width, wb = wt + 190;
      ctx.fillStyle = '#25D366'; caixa(ctx, -wb / 2, -58, wb, 116, 58); ctx.fill();
      iconeWhats(ctx, -wb / 2 + 70, 0, 34, '#fff', '#25D366');
      ctx.fillStyle = '#fff'; ctx.fillText(fone, 40, 4);
      ctx.restore();
    }
    if (m.instagram) {
      ctx.globalAlpha = ent(0.6); ctx.font = F_FORTE(42, 800); ctx.fillStyle = '#fff';
      ctx.fillText(m.instagram.startsWith('@') ? m.instagram : `@${m.instagram}`, W / 2, H * 0.86);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  desenharTransicao(ctx, at, t) {
    const { a, b } = at;
    const tipo = { giro: 'zoom', glitch: 'whip' }[at.tipo] || at.tipo; // giro e glitch pareciam amadores
    const p = clamp(at.p, 0, 1);
    const e = E.inOut(p);
    const pico = 1 - Math.abs(p - 0.5) * 2;
    switch (tipo) {
      case 'crossfade':
        this.desenharClip(ctx, a, t); this.desenharClip(ctx, b, t, { alpha: e }); break;
      case 'flash':
        this.desenharClip(ctx, p < 0.5 ? a : b, t, { escala: 1 + pico * 0.06 });
        ctx.fillStyle = `rgba(255,255,255,${pico})`; ctx.fillRect(0, 0, W, H); break;
      case 'luz':
        this.desenharClip(ctx, a, t); this.desenharClip(ctx, b, t, { alpha: e });
        luz(ctx, t, pico * 1.1, 2);
        ctx.fillStyle = `rgba(255,240,220,${pico * 0.35})`; ctx.fillRect(0, 0, W, H); break;
      case 'zoom': { // zoom através com borrão radial
        const n = 9, rastro = 0.14 * pico, passo = (rastro * W * 0.5) / (n - 1);
        if (p < 0.5) { const z = 1 + E.inCubic(p * 2) * 0.7; this.desenharBorrado(ctx, a, t, amostrar(n, (k) => ({ escala: z * (1 + rastro * k) })), 1, passo); }
        else { const z = 1.7 - E.outCubic((p - 0.5) * 2) * 0.7; this.desenharBorrado(ctx, b, t, amostrar(n, (k) => ({ escala: z * (1 + rastro * k) })), 1, passo); }
        ctx.fillStyle = `rgba(255,255,255,${pico * 0.22})`; ctx.fillRect(0, 0, W, H);
        break;
      }
      case 'giro': { // giro com borrão rotacional
        const n = 9, arco = 12 * pico, passo = ((arco / (n - 1)) * Math.PI / 180) * H * 0.45;
        if (p < 0.5) { const k0 = E.inCubic(p * 2); this.desenharBorrado(ctx, a, t, amostrar(n, (k) => ({ escala: 1 + k0 * 0.5, rot: k0 * 25 - arco * k })), 1, passo); }
        else { const k0 = 1 - E.outCubic((p - 0.5) * 2); this.desenharBorrado(ctx, b, t, amostrar(n, (k) => ({ escala: 1 + k0 * 0.5, rot: -k0 * 25 + arco * k })), 1, passo); }
        break;
      }
      case 'whip': case 'whip_v': { // chicote: o quadro "risca" na direção do movimento
        const n = 10, rastro = 0.32 * pico, vert = tipo === 'whip_v';
        const passo = (rastro * (vert ? H : W)) / (n - 1);
        const desl = (base, k) => (vert ? { dy: (base + rastro * k) * H } : { dx: (base + rastro * k) * W });
        this.desenharBorrado(ctx, a, t, amostrar(n, (k) => desl(-e, k)), 1, passo);
        this.desenharBorrado(ctx, b, t, amostrar(n, (k) => desl(1 - e, k)), 1, passo);
        break;
      }
      case 'desfoque':
        if (p < 0.5) this.desenharClip(ctx, a, t, { blur: p * 60, escala: 1 + p * 0.1 });
        else this.desenharClip(ctx, b, t, { blur: (1 - p) * 60, escala: 1.1 - (p - 0.5) * 0.2 });
        break;
      case 'slide':
        this.desenharClip(ctx, a, t, { dy: -e * H * 0.25 });
        ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 60;
        this.desenharClip(ctx, b, t, { dy: (1 - e) * H }); ctx.restore();
        break;
      case 'glitch': {
        this.desenharClip(ctx, p < 0.5 ? a : b, t);
        const cv = ctx.canvas, sx = cv.width / W;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (let i = 0; i < 9; i++) {
          const r = Math.sin(i * 91.7 + Math.floor(t * 30) * 13.3);
          const y = Math.abs(r) * cv.height, h = (20 + Math.abs(Math.sin(i * 7.1)) * 90) * sx;
          ctx.drawImage(cv, 0, y, cv.width, h, r * 120 * pico * sx, y, cv.width, h);
        }
        ctx.restore();
        separacaoRGB(ctx, pico);
        break;
      }
      case 'wipe': {
        this.desenharClip(ctx, a, t);
        const x = -W * 0.6 + e * W * 2.2;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(-W, 0); ctx.lineTo(x, 0); ctx.lineTo(x - W * 0.6, H); ctx.lineTo(-W, H); ctx.closePath(); ctx.clip();
        this.desenharClip(ctx, b, t); ctx.restore();
        ctx.strokeStyle = cor('acento'); ctx.lineWidth = 14;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - W * 0.6, H); ctx.stroke();
        break;
      }
      default:
        this.desenharClip(ctx, p < 0.5 ? a : b, t);
    }
  }

  desenhar(ctx, t, { exportando = false } = {}) {
    const tl = TL();
    const cfg = tl.config;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const at = ativos(t);
    // pulso de zoom em cada batida da música (sensação de "edição na batida")
    const pulso = 0; // sem zoom pulsando na batida: parecia amador
    ctx.save();
    if (pulso > 0.001) { ctx.translate(W / 2, H / 2); ctx.scale(1 + pulso, 1 + pulso); ctx.translate(-W / 2, -H / 2); }
    if (at?.b) this.desenharTransicao(ctx, at, t);
    else if (at) {
      const lt = t - at.a.start;
      if (false) { // (soco de zoom removido)
        const r = 0.07 * (1 - lt / 0.2);
        this.desenharBorrado(ctx, at.a, t, amostrar(6, (k) => ({ escala: 1 + r * (k + 0.5) })), 1, (r * W * 0.5) / 5);
      } else this.desenharClip(ctx, at.a, t);
    } else this.cartao(ctx, t);
    ctx.restore();
    if (cfg.bloom !== false && at) bloom(ctx, cfg.bloomForca ?? 0.2);
    if (cfg.grao !== false) grao(ctx, t);
    if (cfg.barras === true && t < 1.3) { // faixas de cinema: desligadas por padrão
      const h = 210 * (1 - E.inOut(clamp((t - 0.25) / 1.0, 0, 1)));
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h);
    }
    if (cfg.scrim !== false) escurecerAtrasDosTextos(ctx, tl.textos, t);

    // impacto: separação RGB rápida no início do clipe
    const atual = at && (at.b && at.p >= 0.5 ? at.b : at.a);
    // (separação RGB no impacto removida)

    if (tl.config.vinheta) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    for (const it of tl.textos) desenharTexto(ctx, it, t);
    // palavra-chave só explode se o centro da tela estiver livre (não atropela cards/preço)
    const centroOcupado = tl.textos.some((it) => t >= it.inicio - 0.1 && t <= it.inicio + it.dur && Math.abs((it.y ?? 0.3) - 0.42) < 0.24);
    const explodiu = cfg.palavrasChave !== false && !centroOcupado && desenharPalavraChave(ctx, t);
    if (!explodiu) desenharLegendas(ctx, t);

    const semTake = at && !(at.b && at.p >= 0.5 ? at.b : at.a).takeId; // na cartela o logo já aparece grande
    if (cfg.faixa === true && tl.clips.length) { // faixa de carro/preço: desligada (sobrepunha os textos e repetia informação)
      const ult = tl.clips[tl.clips.length - 1];
      const fimFaixa = ult.takeId ? ult.start + ult.dur : ult.start;
      if (!semTake) desenharFaixa(ctx, t, 1.6, fimFaixa);
    }
    const logo = tl.config.logo && !semTake && this.logoAtual();
    const pos = tl.config.logoPos || 'topo-dir';
    if (logo) {
      const lw = 190, lh = (logo.naturalHeight / logo.naturalWidth) * lw;
      const x = pos.endsWith('esq') ? 50 : W - lw - 50;
      const y = pos.startsWith('topo') ? 150 : H - lh - 520;
      ctx.globalAlpha = 0.92; ctx.drawImage(logo, x, y, lw, lh); ctx.globalAlpha = 1;
    } else if (tl.config.logo && !semTake && S.marca?.logoTexto) {
      const lw = 230;
      desenharLogoTexto(ctx, pos.endsWith('esq') ? 50 + lw / 2 : W - 50 - lw / 2, pos.startsWith('topo') ? 190 : H - 560, lw, 0.95);
    }

    if (!exportando && tl.sticker?.texto) { // onde colar o sticker do Instagram (só na prévia)
      ctx.save();
      const sy = H * 0.6, sw = W * 0.62, sh = 210;
      ctx.setLineDash([16, 10]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      caixa(ctx, W / 2 - sw / 2, sy - sh / 2, sw, sh, 30); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.font = F_FORTE(34, 800); ctx.fillText(`📌 STICKER: ${String(tl.sticker.tipo || '').toUpperCase()}`, W / 2, sy - 40);
      ctx.font = F_FORTE(40, 800); ctx.fillStyle = cor('acento'); ctx.fillText(String(tl.sticker.texto).slice(0, 34), W / 2, sy + 30);
      ctx.restore();
    }
    if (!exportando && S.zonaSegura) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,60,60,0.18)';
      ctx.fillRect(0, 0, W, 220);
      ctx.fillRect(0, H - 480, W, 480);
      ctx.fillRect(W - 170, H * 0.45, 170, H * 0.55 - 480);
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.setLineDash([18, 12]); ctx.lineWidth = 3;
      ctx.strokeRect(60, 220, W - 230, H - 700);
      ctx.restore();
    }
    if (!exportando && S.sel?.tipo === 'texto') {
      const it = tl.textos.find((x) => x.id === S.sel.id);
      if (it && t >= it.inicio && t <= it.inicio + it.dur) {
        ctx.save(); ctx.strokeStyle = comAlpha(cor('acento'), 0.9); ctx.setLineDash([12, 8]); ctx.lineWidth = 4;
        ctx.strokeRect((it.x ?? 0.5) * W - 440, (it.y ?? 0.3) * H - 90 * (it.tam || 1), 880, 180 * (it.tam || 1));
        if (ESTILOS[it.estilo]?.callout) { ctx.beginPath(); ctx.arc((it.alvoX ?? 0.5) * W, (it.alvoY ?? 0.62) * H, 18, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
    }
  }
}
