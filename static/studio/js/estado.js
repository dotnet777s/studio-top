// Estado global do estúdio, histórico (desfazer) e comunicação com o servidor.

export const S = {
  p: null,          // projeto aberto
  sel: null,        // { tipo: 'clip'|'texto'|'narracao'|'sfx'|'musica', id }
  t: 0,             // tempo do cursor (s)
  tocando: false,
  pxs: 90,          // pixels por segundo na linha do tempo
  zonaSegura: false,
  refs: [],
  hist: [], futuro: [], ultimo: null,
  conteudo: null,   // conteúdo do carro aberto no estúdio (Reels, Stories, Anúncio)
};

const bus = new EventTarget();
export const on = (nome, fn) => bus.addEventListener(nome, (e) => fn(e.detail));
export const emit = (nome, d) => bus.dispatchEvent(new CustomEvent(nome, { detail: d }));

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

export async function api(url, opts = {}) {
  const o = { ...opts };
  if (o.json !== undefined) {
    o.method = o.method || 'POST';
    o.headers = { 'Content-Type': 'application/json' };
    o.body = JSON.stringify(o.json);
    delete o.json;
  }
  const r = await fetch(url, o);
  let j = null;
  try { j = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw new Error(j?.erro || `Erro ${r.status}`);
  return j;
}

export const mediaUrl = (rel) => (rel ? `/media/${S.p.id}/${rel}` : '');
export const marcaUrl = (arq) => (arq ? `/marca/${arq}` : '');

/** Carrega as fontes da marca (Google Fonts) e espera ficarem prontas para o canvas. */
export async function aplicarFontesMarca() {
  const m = S.marca || {};
  const familias = [...new Set([m.fonteTitulo || 'Montserrat', m.fonteNumeros || 'Anton'])];
  for (const f of familias) {
    const id = `fonte-${f.replace(/\s+/g, '-')}`;
    if (document.getElementById(id)) continue;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700;800;900&display=swap`;
    document.head.appendChild(l);
  }
  try { await Promise.all(familias.map((f) => document.fonts.load(`900 60px "${f}"`))); } catch { /* sem internet */ }
}

export function timelineVazia() {
  return {
    clips: [], textos: [], narracoes: [], sfx: [], musica: null,
    config: {
      legendas: true, estiloLegenda: 'amarelo', vinheta: true, logo: true, logoPos: 'topo-dir', filtroGlobal: 'nenhum',
      pulso: true, grao: true, barras: true, scrim: true,
    },
  };
}

export const TL = () => S.p.timeline;
export const take = (id) => S.p?.takes?.find((t) => t.id === id);

export function empacotar() {
  let t = 0;
  for (const c of TL().clips) { c.start = t; t += c.dur; }
}

export function duracao() {
  const tl = TL();
  if (!tl) return 0;
  const c = tl.clips.reduce((s, x) => s + x.dur, 0);
  if (c > 0) return c;
  const fins = [...tl.textos.map((x) => x.inicio + x.dur), ...tl.narracoes.map((x) => x.inicio + x.dur)];
  return Math.max(3, ...fins);
}

export function acharItem(tipo, id) {
  const tl = TL();
  if (tipo === 'musica') return tl.musica;
  const lista = { clip: tl.clips, texto: tl.textos, narracao: tl.narracoes, sfx: tl.sfx }[tipo];
  return lista?.find((x) => x.id === id) || null;
}

export function selecionar(tipo, id) {
  S.sel = tipo ? { tipo, id } : null;
  emit('selecao');
}

// ---------- histórico ----------
const foto = () => JSON.stringify(TL());

export function iniciarHistorico() {
  S.hist = []; S.futuro = []; S.ultimo = foto();
}

/** Chame DEPOIS de alterar a timeline. `parcial` = durante um arrasto (sem histórico nem redesenho da timeline). */
export function mudou(parcial = false) {
  empacotar();
  if (parcial) { emit('redesenhar'); return; }
  const agora = foto();
  if (agora !== S.ultimo) {
    S.hist.push(S.ultimo);
    if (S.hist.length > 80) S.hist.shift();
    S.futuro = [];
    S.ultimo = agora;
  }
  agendarSalvar();
  emit('mudou');
}

function restaurar(json) {
  S.p.timeline = JSON.parse(json);
  S.ultimo = json;
  empacotar();
  if (S.sel && !acharItem(S.sel.tipo, S.sel.id)) S.sel = null;
  agendarSalvar();
  emit('mudou'); emit('selecao');
}
export function desfazer() { if (S.hist.length) { S.futuro.push(foto()); restaurar(S.hist.pop()); } }
export function refazer() { if (S.futuro.length) { S.hist.push(foto()); restaurar(S.futuro.pop()); } }

// ---------- salvar ----------
let timer = null;
export function agendarSalvar() {
  clearTimeout(timer);
  emit('salvo', 'alterado…');
  timer = setTimeout(salvarAgora, 700);
}
export async function salvarAgora() {
  clearTimeout(timer);
  if (!S.p) return;
  const { nome, carro, briefing, roteiro, timeline, prerroteiro } = S.p;
  try {
    await api(`/api/projetos/${S.p.id}`, { method: 'PUT', json: { nome, carro, briefing, roteiro, timeline, ...(prerroteiro ? { prerroteiro } : {}) } });
    if (S.conteudo?.projeto === S.p.id) { // o vídeo aberto é um conteúdo do carro: guarda a edição nele
      const c = S.conteudo;
      await api(`/api/projetos/${S.p.id}/conteudos/${c.id}`, { method: 'PUT', json: { timeline, roteiro: c.roteiro, status: c.status, titulo: c.titulo } });
    }
    emit('salvo', '✓ salvo');
  } catch (e) {
    emit('salvo', '⚠ não salvou');
  }
}

// ---------- avisos ----------
export function toast(msg, erro = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast on' + (erro ? ' erro' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = 'toast'), erro ? 5000 : 1800);
}

export function modal(titulo, texto, progresso = null, acoes = []) {
  const m = document.getElementById('modal');
  if (titulo === null) { m.hidden = true; return; }
  m.hidden = false;
  document.getElementById('modal-titulo').textContent = titulo;
  document.getElementById('modal-texto').innerHTML = texto || '';
  const barra = document.getElementById('modal-barra');
  barra.parentElement.hidden = progresso === null;
  if (progresso !== null) barra.style.width = `${Math.round(progresso * 100)}%`;
  const box = document.getElementById('modal-acoes');
  box.innerHTML = '';
  for (const [rot, fn, classe] of acoes) {
    const b = document.createElement('button');
    b.textContent = rot;
    if (classe) b.className = classe;
    b.onclick = fn;
    box.appendChild(b);
  }
}
