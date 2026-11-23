// Linha do tempo: desenho das faixas e interação (arrastar, aparar, reordenar, ímã).
import { S, TL, take, mediaUrl, mudou, selecionar, acharItem, duracao, clamp, esc, on } from './estado.js';
import { TRANSICOES, maxDurClip, fatorFonte } from './motor.js';
import { bufferPronto, buffer, picos, SFX } from './audio.js';

const $ = (s) => document.querySelector(s);
let aoBuscar = () => {};

export function iniciarTimeline({ buscar }) {
  aoBuscar = buscar;
  const rol = $('#tl-rolagem');
  $('#tl-regua').addEventListener('pointerdown', (e) => {
    const mover = (ev) => buscar(xParaT(ev.clientX));
    mover(e);
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mover), { once: true });
  });
  rol.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('tl-faixa')) { selecionar(null); buscar(xParaT(e.clientX)); }
  });
  rol.addEventListener('wheel', (e) => {
    if (e.ctrlKey) { e.preventDefault(); definirZoom(S.pxs * (e.deltaY < 0 ? 1.15 : 0.87)); }
  }, { passive: false });
  $('#tl-zoom').addEventListener('input', (e) => definirZoom(+e.target.value));
  on('mudou', desenhar);
  on('selecao', marcarSelecao);
  on('midias', desenhar);
  desenhar();
}

function definirZoom(v) {
  S.pxs = clamp(v, 30, 300);
  $('#tl-zoom').value = S.pxs;
  desenhar();
}

function xParaT(clientX) {
  const r = $('#tl-conteudo').getBoundingClientRect();
  return clamp((clientX - r.left) / S.pxs, 0, duracao());
}

export function atualizarCursor() {
  const c = $('#tl-cursor');
  const x = S.t * S.pxs;
  c.style.left = `${x}px`;
  if (S.tocando) {
    const rol = $('#tl-rolagem');
    if (x > rol.scrollLeft + rol.clientWidth - 60 || x < rol.scrollLeft) rol.scrollLeft = x - 80;
  }
}

// ---------------------------------------------------------------- desenho

function el(classe, x, w, html) {
  const d = document.createElement('div');
  d.className = `item ${classe}`;
  d.style.left = `${x}px`;
  d.style.width = `${Math.max(6, w)}px`;
  d.innerHTML = html;
  return d;
}

function alcas(d, e = true, dd = true) {
  if (e) d.insertAdjacentHTML('beforeend', '<div class="alca e"></div>');
  if (dd) d.insertAdjacentHTML('beforeend', '<div class="alca d"></div>');
}

function onda(d, url, ini, dur, w) {
  const buf = bufferPronto(url);
  if (!buf) { buffer(url).then((b) => b && desenharOnda(d, b, ini, dur, w)); return; }
  buf.then((b) => b && desenharOnda(d, b, ini, dur, w));
}
function desenharOnda(d, buf, ini, dur, w) {
  if (!d.isConnected) return;
  const cv = document.createElement('canvas');
  cv.className = 'onda';
  cv.width = Math.max(10, Math.min(4000, Math.round(w)));
  cv.height = 30;
  const c = cv.getContext('2d');
  const a = Math.floor((ini / buf.duration) * buf.length), b = Math.floor(((ini + dur) / buf.duration) * buf.length);
  const fatia = { getChannelData: () => buf.getChannelData(0).subarray(a, Math.max(a + 1, Math.min(buf.length, b))), length: b - a };
  const p = picos(fatia, cv.width);
  c.fillStyle = '#fff';
  for (let i = 0; i < p.length; i++) { const h = Math.max(1, p[i] * 28); c.fillRect(i, 15 - h / 2, 1, h); }
  d.prepend(cv);
}

export function desenhar() {
  if (!S.p?.timeline) return;
  const tl = TL();
  const total = duracao();
  const largura = Math.max($('#tl-rolagem').clientWidth, (total + 4) * S.pxs);
  $('#tl-conteudo').style.width = `${largura}px`;

  // régua
  const regua = $('#tl-regua');
  regua.innerHTML = '';
  const passo = S.pxs > 140 ? 0.5 : S.pxs > 60 ? 1 : 2;
  for (let t = 0; t <= largura / S.pxs; t += passo) {
    const m = document.createElement('div');
    const inteiro = Math.abs(t - Math.round(t)) < 1e-6;
    m.className = 'marca-t' + (inteiro && Math.round(t) % (passo >= 2 ? 2 : 1) === 0 ? '' : ' peq');
    m.style.left = `${t * S.pxs}px`;
    if (!m.classList.contains('peq')) m.textContent = `${Math.round(t)}s`;
    regua.appendChild(m);
  }

  const faixa = (n) => { const f = document.querySelector(`.tl-faixa[data-faixa="${n}"]`); f.innerHTML = ''; return f; };

  // vídeo
  const fv = faixa('video');
  tl.clips.forEach((c, i) => {
    const tk = take(c.takeId);
    const d = el('video' + (tk ? '' : ' cartao'), c.start * S.pxs, c.dur * S.pxs,
      `<span>${c.rampa && c.rampa !== 'nenhuma' ? '⚡' : ''}${c.punch ? '✦' : ''}${c.impacto ? '💥' : ''}${esc(tk ? tk.nome : 'Cartão de texto')}${c.speed && c.speed !== 1 ? ` · ${c.speed}x` : ''}</span>`);
    d.title = `${tk ? tk.nome : 'Cartão'} · ${c.dur.toFixed(2)}s${c.rampa && c.rampa !== 'nenhuma' ? ' · rampa de velocidade' : ''}`;
    if (tk?.thumb) d.style.backgroundImage = `linear-gradient(#0005,#0005), url("${mediaUrl(tk.thumb)}")`;
    d.dataset.tipo = 'clip'; d.dataset.id = c.id;
    alcas(d);
    fv.appendChild(d);
    if (i < tl.clips.length - 1) {
      const tr = document.createElement('div');
      tr.className = 'trans';
      tr.style.left = `${(c.start + c.dur) * S.pxs}px`;
      const tipo = c.transicao?.tipo || 'corte';
      tr.textContent = { corte: '|', crossfade: '◐', whip: '»', zoom: '⊕', flash: '✦', slide: '⇡', glitch: '▦', wipe: '◢', luz: '☀', giro: '↻', desfoque: '◌' }[tipo] || '|';
      tr.title = `Transição: ${TRANSICOES[tipo]} (clique para editar)`;
      tr.addEventListener('pointerdown', (e) => { e.stopPropagation(); selecionar('clip', c.id); document.dispatchEvent(new CustomEvent('focar-transicao')); });
      fv.appendChild(tr);
    }
  });

  // texto
  const ft = faixa('texto');
  for (const x of tl.textos) {
    const d = el('texto', x.inicio * S.pxs, x.dur * S.pxs, `<span>${esc(x.texto)}</span>`);
    d.dataset.tipo = 'texto'; d.dataset.id = x.id;
    alcas(d); ft.appendChild(d);
  }

  // narração
  const fn = faixa('narracao');
  for (const n of tl.narracoes) {
    const d = el('narracao' + (n.url ? '' : ' mudo') + (n.voz ? ' voz' : ''), n.inicio * S.pxs, n.dur * S.pxs, `<span>${n.voz ? '🎤 ' : ''}${esc(n.texto)}</span>`);
    d.dataset.tipo = 'narracao'; d.dataset.id = n.id;
    d.title = n.url ? n.texto : 'Só legenda (usa o som original do take)';
    if (!n.url) alcas(d);
    fn.appendChild(d);
    if (n.url) onda(d, mediaUrl(n.url), n.in || 0, n.dur, n.dur * S.pxs);
  }

  // música
  const fm = faixa('musica');
  if (tl.musica) {
    const m = tl.musica;
    const ini = m.inicio || 0;
    const d = el('musica', ini * S.pxs, (total - ini) * S.pxs, `<span>🎵 ${esc(m.nome)}${m.bpm ? ` · ${m.bpm} BPM` : ''}</span>`);
    d.dataset.tipo = 'musica'; d.dataset.id = 'musica';
    fm.appendChild(d);
    onda(d, mediaUrl(m.url), m.offset || 0, total - ini, (total - ini) * S.pxs);
    for (const b of m.batidas || []) {
      const t = b - (m.offset || 0) + ini;
      if (t < ini || t > total) continue;
      const k = document.createElement('div');
      k.className = 'batida'; k.style.left = `${t * S.pxs}px`;
      fm.appendChild(k);
    }
  }

  // efeitos
  const fs = faixa('sfx');
  for (const s of tl.sfx) {
    const d = el('sfx', s.inicio * S.pxs - 9, 18, { whoosh: '〰', impacto: '💥', riser: '↗', pop: '•', clique: '·', dinheiro: '$' }[s.tipo] || '♪');
    d.title = SFX[s.tipo] || s.tipo;
    d.dataset.tipo = 'sfx'; d.dataset.id = s.id;
    fs.appendChild(d);
  }

  for (const d of document.querySelectorAll('.tl-faixa .item')) d.addEventListener('pointerdown', iniciarArrasto);
  marcarSelecao();
  atualizarCursor();
}

function marcarSelecao() {
  for (const d of document.querySelectorAll('.tl-faixa .item')) {
    d.classList.toggle('sel', !!S.sel && d.dataset.tipo === S.sel.tipo && d.dataset.id === S.sel.id);
  }
}

// ---------------------------------------------------------------- ímã

function pontosIma(ignorarId) {
  const tl = TL();
  const p = [0, S.t, duracao()];
  for (const c of tl.clips) if (c.id !== ignorarId) p.push(c.start, c.start + c.dur);
  for (const x of tl.textos) if (x.id !== ignorarId) p.push(x.inicio, x.inicio + x.dur);
  for (const n of tl.narracoes) if (n.id !== ignorarId) p.push(n.inicio, n.inicio + n.dur);
  if ($('#tl-batida').checked && tl.musica?.batidas) {
    const m = tl.musica;
    for (const b of m.batidas) p.push(b - (m.offset || 0) + (m.inicio || 0));
  }
  return p;
}
function ima(t, pontos) {
  if (!$('#tl-ima').checked && !$('#tl-batida').checked) return t;
  const lim = 9 / S.pxs;
  let melhor = t, dist = lim;
  for (const p of pontos) { const d = Math.abs(p - t); if (d < dist) { dist = d; melhor = p; } }
  return melhor;
}

// ---------------------------------------------------------------- arrastar

function iniciarArrasto(e) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const d = e.currentTarget;
  const { tipo, id } = d.dataset;
  selecionar(tipo, id);
  const item = acharItem(tipo, id);
  if (!item) return;
  const modo = e.target.classList.contains('alca') ? (e.target.classList.contains('e') ? 'esq' : 'dir') : 'mover';
  const x0 = e.clientX;
  const orig = JSON.parse(JSON.stringify(item));
  const pontos = pontosIma(id);
  let moveu = false;
  d.setPointerCapture(e.pointerId);

  const mover = (ev) => {
    const dt = (ev.clientX - x0) / S.pxs;
    if (Math.abs(ev.clientX - x0) > 3) moveu = true;
    if (!moveu) return;
    if (tipo === 'clip') arrastarClip(item, orig, modo, dt, d, ev);
    else if (tipo === 'musica') { item.inicio = Math.max(0, ima(orig.inicio + dt, pontos)); }
    else if (modo === 'mover') {
      const inicio = (orig.inicio ?? 0) + dt;
      let novo = ima(inicio, pontos);
      if (item.dur) { const fim = ima(inicio + item.dur, pontos); if (Math.abs(fim - (inicio + item.dur)) < Math.abs(novo - inicio)) novo = fim - item.dur; }
      item.inicio = Math.max(0, novo);
    } else if (modo === 'dir') {
      item.dur = Math.max(0.2, ima(orig.inicio + orig.dur + dt, pontos) - item.inicio);
    } else if (modo === 'esq') {
      const fim = orig.inicio + orig.dur;
      item.inicio = clamp(ima(orig.inicio + dt, pontos), 0, fim - 0.2);
      item.dur = fim - item.inicio;
    }
    if (tipo !== 'clip') {
      d.style.left = `${(item.inicio - (tipo === 'sfx' ? 9 / S.pxs : 0)) * S.pxs}px`;
      if (item.dur && tipo !== 'musica') d.style.width = `${item.dur * S.pxs}px`;
    }
    mudou(true);
  };
  const soltar = () => {
    d.removeEventListener('pointermove', mover);
    if (tipo === 'clip' && modo === 'mover' && moveu) reordenarClip(item, d);
    if (moveu) mudou(); else if (tipo !== 'musica') aoBuscar(S.t);
  };
  d.addEventListener('pointermove', mover);
  d.addEventListener('pointerup', soltar, { once: true });
  d.addEventListener('pointercancel', soltar, { once: true });
}

function arrastarClip(c, orig, modo, dt, d, ev) {
  const tk = take(c.takeId);
  const vel = fatorFonte(c);
  if (modo === 'dir') {
    c.dur = clamp(orig.dur + dt, 0.2, maxDurClip(c, tk));
    d.style.width = `${c.dur * S.pxs}px`;
  } else if (modo === 'esq') {
    const delta = clamp(dt, -orig.in / vel, orig.dur - 0.2);
    c.in = orig.in + delta * vel;
    c.dur = orig.dur - delta;
    d.style.width = `${c.dur * S.pxs}px`;
  } else {
    d.style.transform = `translateX(${dt * S.pxs}px)`;
    d.style.zIndex = 10; d.style.opacity = 0.85;
    c._arrastoX = c.start + dt + c.dur / 2;
  }
}

function reordenarClip(c) {
  const cl = TL().clips;
  const centro = c._arrastoX;
  delete c._arrastoX;
  if (centro === undefined) return;
  const outros = cl.filter((x) => x !== c);
  let idx = outros.findIndex((x) => centro < x.start + x.dur / 2);
  if (idx < 0) idx = outros.length;
  outros.splice(idx, 0, c);
  TL().clips = outros;
}
