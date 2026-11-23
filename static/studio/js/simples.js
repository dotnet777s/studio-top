// Estúdio simples: a IA cuida de cortes, efeitos, transições e tempos. A equipe só escolhe o conteúdo,
// assiste e corrige as falas/textos. O editor completo continua no "Modo avançado".
import { S, TL, api, esc, toast, mudou, on, mediaUrl, fmt } from './estado.js';

const $ = (s, r = document) => r.querySelector(s);
const ICONE = { Reels: '🎬', Stories: '📱', 'Anúncio': '📣' };
const ST = {
  rascunho: ['Rascunho', 'cinza'], roteiro: ['Roteiro pronto', 'azul'], montado: ['Para revisar', 'amarelo'],
  aprovado: ['Aprovado', 'verde'], pronto: ['Vídeo pronto', 'verde'], postado: ['Postado', 'cinza'],
};
const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
let C = null;
let lista = [];

export function iniciarSimples(ctx) {
  C = ctx;
  let modo = 'simples';
  try { modo = localStorage.getItem('modoEstudio') || 'simples'; } catch { /* */ }
  aplicarModo(modo);
  $('#btn-modo').onclick = () => aplicarModo(document.body.classList.contains('simples') ? 'avancado' : 'simples');
  on('conteudo', renderTudo);
  on('midias', renderEsq);
  on('projeto', renderTudo);
}

function aplicarModo(m) {
  document.body.classList.toggle('simples', m === 'simples');
  $('#btn-modo').textContent = m === 'simples' ? '⚙ Modo avançado' : '✨ Modo simples';
  try { localStorage.setItem('modoEstudio', m); } catch { /* */ }
  window.dispatchEvent(new Event('resize'));
  if (m === 'simples') renderTudo();
}

export async function renderTudo() {
  if (!document.body.classList.contains('simples') || !S.p) return;
  try { lista = await api(`/api/projetos/${S.p.id}/conteudos`); } catch { lista = []; }
  renderEsq();
  renderDir();
}

// ---------------------------------------------------------------- esquerda: o carro e seus conteúdos

function renderEsq() {
  if (!document.body.classList.contains('simples') || !S.p) return;
  const c = S.p.carro || {};
  const takes = (S.p.takes || []).filter((t) => t.proxy);
  const thumb = takes[0]?.thumb;
  const nome = [c.marca, c.modelo, c.versao, c.ano].filter(Boolean).join(' ') || S.p.nome;
  const ord = [...lista].sort((a, b) => String(a.data || '9').localeCompare(String(b.data || '9')) || a.criado - b.criado);
  $('#s-esq').innerHTML = `
    <div class="s-carro">
      ${thumb ? `<img src="${mediaUrl(thumb)}" alt="">` : '<div class="s-sem">📷 sem mídias</div>'}
      <div><b>${esc(nome)}</b><span>${c.preco ? `R$ ${esc(c.preco)}` : 'sem preço'}${c.km ? ` · ${esc(c.km)} km` : ''}</span>
      <button class="link" id="s-ficha">📁 Dados e mídias do carro (${takes.length} takes)</button></div>
    </div>
    <h4>Conteúdos deste carro</h4>
    <div class="s-lista">${ord.map((x) => `<button class="s-item ${S.conteudo?.id === x.id ? 'on' : ''}" data-c="${x.id}">
        <span class="ic">${ICONE[x.tipo] || '🎬'}</span>
        <span class="tx"><b>${esc(x.titulo || x.tipo)}</b><small>${x.tipo}${x.data ? ` · ${dm(x.data)}` : ''}${x.etapa ? ` · ${esc(x.etapa)}…` : ''}</small></span>
        <span class="st ${ST[x.status]?.[1] || ''}">${ST[x.status]?.[0] || x.status}</span></button>`).join('')
      || '<p class="muted">Nenhum conteúdo ainda. Crie o primeiro abaixo — a IA faz o resto.</p>'}</div>
    <h4>Criar conteúdo</h4>
    <div class="s-novo">${['Reels', 'Stories', 'Anúncio'].map((t) => `<button data-novo="${t}"><span>${ICONE[t]}</span>${t}</button>`).join('')}</div>`;
  $('#s-esq').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => C.abrirConteudo(S.p.id, b.dataset.c)));
  $('#s-esq').querySelectorAll('[data-novo]').forEach((b) => (b.onclick = async () => { await C.novoConteudo(b.dataset.novo); C.gerarConteudo(); }));
  $('#s-ficha').onclick = () => C.abrirFicha(S.p.id);
}

// ---------------------------------------------------------------- direita: revisão (só falas e textos)

function renderDir() {
  if (!document.body.classList.contains('simples') || !S.p) return;
  const box = $('#s-dir');
  const c = S.conteudo;
  if (!c) {
    box.innerHTML = `<div class="s-vazio"><div style="font-size:42px">🎬</div><h3>Escolha ou crie um conteúdo</h3>
      <p>Cada carro tem seus Reels, Stories e anúncios. A IA escreve, narra e edita; você só revisa as falas e aprova.</p></div>`;
    return;
  }
  const tl = TL();
  const temVideo = tl.clips.length > 0;
  const passos = [['Roteiro', !!c.roteiro], ['Vídeo montado', temVideo], ['Revisado', ['aprovado', 'pronto', 'postado'].includes(c.status)], ['Pronto', !!c.arquivo]];
  const narr = [...tl.narracoes].sort((a, b) => a.inicio - b.inicio);
  const textos = [...tl.textos].sort((a, b) => a.inicio - b.inicio);
  const aprend = c.aprendizado || S.p.roteiro?.aprendizado_aplicado;
  const rev = S.p.roteiro?.revisao;
  box.innerHTML = `
    <div class="s-topo">
      <span class="s-tipo">${ICONE[c.tipo] || ''} ${esc(c.tipo)}${c.data ? ` · ${dm(c.data)}` : ''}</span>
      <input id="s-titulo" value="${esc(c.titulo || '')}">
      <div class="s-passos">${passos.map(([n, ok], i) => `<span class="${ok ? 'ok' : ''}">${ok ? '✓' : i + 1} ${n}</span>`).join('<i></i>')}</div>
    </div>
    ${c.etapa ? `<div class="dica">⏳ ${esc(c.etapa)}…</div>` : ''}
    ${c.erro ? `<div class="dica erro">⚠ ${esc(c.erro)}</div>` : ''}
    ${!temVideo ? `<div class="s-gerar"><p>${c.direcao ? `<b>Pauta:</b> ${esc(c.direcao.split('\n').slice(0, 3).join(' · '))}` : 'A IA vai escrever o roteiro usando os takes deste carro e o que aprendeu com os vídeos campeões do mercado.'}</p>
      <button class="primario grande" id="s-gerar">🎬 Gerar o vídeo</button></div>` : `
    ${aprend ? `<div class="s-aprend"><b>🧠 Aprendizado aplicado</b><p>${esc(aprend)}</p></div>` : ''}
    ${rev?.nota != null ? `<details class="s-rev"><summary>📝 Revisão da IA: <b class="${rev.nota >= 80 ? 'ok' : 'baixa'}">${rev.nota}/100</b> — ${esc(rev.veredito || '')}</summary><ul>${(rev.criterios || []).map((x) => `<li><b>${esc(x.nome)}</b> ${x.nota}/10 — ${esc(x.comentario || '')}</li>`).join('')}</ul></details>` : ''}
    <h4>🎙 Falas <small>corrija o texto; a voz é regravada sozinha</small></h4>
    <div class="s-falas">${narr.map((n) => `<div class="s-fala" data-n="${n.id}">
        <button class="tempo" data-ir="${n.inicio}">${fmt(n.inicio)}</button>
        <textarea rows="2">${esc(n.texto || '')}</textarea>
        <div class="acoes-fala">${n.voz ? '<span class="muted" title="Fala gravada pelo apresentador: o texto corrige a legenda">🎤 legenda</span>'
          : `<button class="mini" data-regravar title="Regravar com o texto corrigido">🔊</button>${n.url ? '' : '<span class="st amarelo">sem áudio</span>'}`}</div>
      </div>`).join('') || '<p class="muted">Este vídeo não tem falas.</p>'}</div>
    ${narr.some((n) => !n.voz) ? '<button class="mini" id="s-regravar-todas">🔊 Regravar todas as falas</button>' : ''}
    <h4>🔤 Textos na tela <small>*palavra* entre asteriscos = destaque em verde</small></h4>
    <div class="s-falas">${textos.map((it) => `<div class="s-fala" data-t="${it.id}">
        <button class="tempo" data-ir="${it.inicio}">${fmt(it.inicio)}</button>
        <textarea rows="${String(it.texto || '').includes('\n') ? 3 : 1}">${esc(it.texto || '')}</textarea></div>`).join('')}</div>
    ${S.p.roteiro?.legenda_post ? `<h4>📝 Legenda do post</h4><textarea id="s-legenda" rows="4">${esc([S.p.roteiro.legenda_post, (S.p.roteiro.hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')].filter(Boolean).join('\n\n'))}</textarea>` : ''}
    `}
    <div class="s-rodape">
      ${temVideo ? '<button id="s-versao" title="A IA escreve e monta outra versão do zero">🎲 Outra versão</button>' : ''}
      ${temVideo && !c.arquivo ? '<button class="primario" id="s-exportar">✅ Aprovar e gerar MP4</button>' : ''}
      ${c.arquivo ? `<a class="btn primario" href="${esc(c.arquivo)}" download>⬇ Baixar MP4</a><button id="s-exportar">↻ Gerar de novo</button>` : ''}
      ${c.arquivo && !c.entrada ? `<input type="date" id="s-data" value="${c.data || new Date(Date.now() + 864e5).toISOString().slice(0, 10)}"><button id="s-agendar">📅 Agendar</button>` : ''}
      ${c.entrada ? '<span class="st verde">📅 na agenda</span>' : ''}
    </div>`;
  ligarDir(c);
}

function ligarDir(c) {
  const box = $('#s-dir');
  const q = (s) => $(s, box);
  if (q('#s-titulo')) q('#s-titulo').onchange = (e) => { c.titulo = e.target.value; mudou(); renderEsqLocal(); };
  if (q('#s-gerar')) q('#s-gerar').onclick = () => C.gerarConteudo();
  if (q('#s-versao')) q('#s-versao').onclick = () => { if (confirm('Gerar outra versão do zero? As correções desta versão serão perdidas.')) C.gerarConteudo(); };
  if (q('#s-exportar')) q('#s-exportar').onclick = async () => { c.status = 'aprovado'; mudou(); await C.exportar(); };
  if (q('#s-regravar-todas')) q('#s-regravar-todas').onclick = async () => { await C.regerarNarracoes(); renderDir(); };
  box.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => C.buscar(+b.dataset.ir + 0.05)));
  box.querySelectorAll('[data-n]').forEach((el) => {
    const n = TL().narracoes.find((x) => x.id === el.dataset.n);
    const ta = el.querySelector('textarea');
    ta.onchange = async () => {
      const novo = ta.value.trim();
      if (!n || novo === n.texto) return;
      if (n.voz) { n.texto = novo; mudou(); toast('Legenda corrigida.'); return; }
      await C.narrarItem(n, novo); renderDir();
    };
    const rb = el.querySelector('[data-regravar]');
    if (rb) rb.onclick = async () => { await C.narrarItem(n, ta.value.trim()); renderDir(); };
  });
  box.querySelectorAll('[data-t]').forEach((el) => {
    const it = TL().textos.find((x) => x.id === el.dataset.t);
    el.querySelector('textarea').onchange = (e) => { if (it) { it.texto = e.target.value; mudou(); } };
  });
  if (q('#s-legenda')) q('#s-legenda').onchange = (e) => { if (S.p.roteiro) { S.p.roteiro.legenda_post = e.target.value; S.p.roteiro.hashtags = []; mudou(); } };
  if (q('#s-agendar')) q('#s-agendar').onclick = async () => {
    const data = q('#s-data').value;
    const [e] = await api('/api/calendario', { json: { data, hora: c.tipo === 'Reels' ? '19:00' : '12:00', tipo: c.tipo, pilar: 'Vitrine', titulo: c.titulo,
      projeto: S.p.id, conteudo: c.id, arquivo: c.arquivo, legenda: c.legenda || '', status: 'pronto',
      carro: [S.p.carro?.marca, S.p.carro?.modelo, S.p.carro?.ano].filter(Boolean).join(' ') } });
    Object.assign(c, await api(`/api/projetos/${S.p.id}/conteudos/${c.id}`, { method: 'PUT', json: { entrada: e.id, data } }));
    toast(`Agendado para ${dm(data)} ✔`); renderTudo();
  };
}

function renderEsqLocal() {
  const i = lista.findIndex((x) => x.id === S.conteudo?.id);
  if (i >= 0) { lista[i] = { ...lista[i], titulo: S.conteudo.titulo }; renderEsq(); }
}
