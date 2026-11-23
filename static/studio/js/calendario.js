// Calendário editorial (Stories diários, Reels semanais, anúncios) + Plano Piloto.
import { S, api, esc, toast, modal } from './estado.js';
import { MODULOS, carregarSetor, ligarComuns, carregarFicha, abrirNoEstudio, fabrica, rodarRotina } from './setor.js';
import { renderFotos, ligarFotos, renderVideos, ligarVideos } from './midias.js';
import { renderHoje, ligarHoje, renderCatalogo, ligarCatalogo, carregarProcessos, processoFicha, ligarProcessoFicha } from './processos.js';

const $ = (s, r = document) => r.querySelector(s);
const TIPOS = { Stories: '📱', Reels: '🎬', 'Anúncio': '📣', 'Gravação': '🎥' };
const STATUS = {
  planejado: '💡 Planejado', gravar: '🎥 Gravar', editar: '✂ Editar', pronto: '✅ Pronto', postado: '📤 Postado', cancelado: '✖ Cancelado',
};
const PILARES = ['Vitrine', 'Autoridade', 'Prova social', 'Bastidores', 'Oferta'];
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const E = { pautas: [], leads: [], refs: [], marca: {}, integ: {}, cal: [], estoque: [], ano: 0, mes: 0, sel: null, aba: 'central', filtro: { Stories: true, Reels: true, 'Anúncio': true, 'Gravação': true }, plano: null, abrirProjeto: null, abrirAba: null };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function iniciarCalendario({ abrirProjeto, abrirAba }) {
  E.abrirProjeto = abrirProjeto; E.abrirAba = abrirAba;
  const hoje = new Date();
  E.ano = hoje.getFullYear(); E.mes = hoje.getMonth();
  $('#btn-central').onclick = () => abrir('central');
  $('#cal-fechar').onclick = () => ($('#calendario').hidden = true);
}

export async function abrir(aba, opts = {}) {
  $('#calendario').hidden = false;
  if (typeof aba === 'string') E.aba = aba;
  if (opts.carro) { E.carroSel = opts.carro; E.fichaAba = opts.fichaAba || 'midias'; }
  await recarregar();
}

async function recarregar() {
  try { [E.cal, E.estoque] = await Promise.all([api('/api/calendario'), api('/api/estoque'), carregarSetor(E), carregarProcessos(E)]); } catch (e) { toast(e.message, true); }
  if (!E.plano) { try { E.plano = await api('/api/plano'); } catch { E.plano = {}; } }
  if (E.aba === 'estoque' && E.carroSel) { try { await carregarFicha(E, E.carroSel); } catch { E.carroSel = null; E.ficha = null; } }
  render();
}

/** Usado pelo editor: coloca vídeos exportados no calendário. */
export async function agendar(entradas) {
  await api('/api/calendario', { json: entradas });
  toast(`${entradas.length} postagem(ns) no calendário 📅`);
}

/** Próxima data para um rótulo como "Segunda 12h" (a partir de amanhã). */
export function proximaData(rotulo, aPartirDe = new Date()) {
  const nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const txt = String(rotulo || '').toLowerCase().replace('terca', 'terça').replace('sabado', 'sábado');
  const alvo = nomes.findIndex((n) => txt.includes(n));
  const d = new Date(aPartirDe); d.setDate(d.getDate() + 1);
  if (alvo >= 0) while (d.getDay() !== alvo) d.setDate(d.getDate() + 1);
  const h = /(\d{1,2})\s*h/.exec(txt);
  return { data: iso(d), hora: h ? `${h[1].padStart(2, '0')}:00` : '12:00' };
}

const CTX = { recarregar: () => recarregar(), render: () => render(), abrirAba: (a) => E.abrirAba(a) };

function badges() {
  const hoje = iso(new Date());
  const P = E.processos || {};
  const n = {
    central: E.cal.filter((e) => e.data === hoje && e.status !== 'postado' && e.status !== 'cancelado' && ['Stories', 'Reels', 'Anúncio'].includes(e.tipo)).length
      + (E.conteudos || []).filter((c) => ['montado', 'roteiro', 'aprovado'].includes(c.status) && !c.arquivo).length,
    producao: E.cal.filter((e) => e.status !== 'cancelado' && e.status !== 'postado' && !e.arquivo && ['Stories', 'Reels', 'Anúncio'].includes(e.tipo) && e.data >= iso(new Date()) && e.data <= addDias(3)).length,
    estoque: E.estoque.filter((f) => f.etapa !== 'vendido' && ['cadastro', 'midias'].includes(P[f.id]?.acao.passo)).length,
    pautas: E.pautas.filter((p) => p.status === 'nova').length,
    atendimento: E.leads.filter((l) => l.status === 'novo').length,
  };
  document.querySelectorAll('[data-badge]').forEach((i) => { const v = n[i.dataset.badge] || 0; i.textContent = v || ''; i.hidden = !v; });
}

// Cabeçalho padrão de cada tela: para que serve + como usar (passo a passo).
const META = {
  central: { t: 'Hoje', d: 'Tudo o que o setor de conteúdo precisa fazer hoje, já em ordem. Faça de cima para baixo.' },
  pautas: { t: 'Pautas', d: 'Cada pauta é um vídeo pronto para produzir: gancho, roteiro, takes, CTA e legenda.', p: ['Gere com a IA ou escreva', 'Aprove as boas', 'Escolha a data', 'Produza no editor'] },
  quadros: { t: 'Quadros fixos', d: 'As séries semanais com nome próprio da TopCar. Toda semana tem episódio: é o que cria audiência fiel.', p: ['Escolha o quadro', 'Gere episódios', 'Agende na pauta'] },
  producao: { t: 'Produção', d: 'Cada vídeo dos próximos 14 dias e em que etapa está. A IA escreve, narra e monta; a equipe grava, revisa as falas e posta. Cartão vermelho = atrasado.', p: ['Gravar os takes', 'IA cria roteiro e voz', 'Revisar as falas', 'Gerar MP4', 'Postar'] },
  mes: { t: 'Agenda', d: 'O calendário de postagens: Stories todo dia, Reels segunda, quarta e sexta, anúncios na segunda.', p: ['Planeje o mês com a IA', 'Clique num post para editar', 'Depois de postar, lance os números'] },
  estoque: { t: 'Estoque', d: 'A base de tudo: cada carro tem sua ficha com dados, mídias (takes), conteúdos e agenda. Os vídeos são construídos em cima do carro.', p: ['Cadastre o carro com os detalhes', 'Envie as mídias na ficha', 'A IA cria os conteúdos', 'Marque vendido quando sair'] },
  resultados: { t: 'Resultados', d: 'Quanto cada post deu de visualização e de conversa no WhatsApp, e quais vídeos viraram venda.' },
  anuncios: { t: 'Anúncios', d: 'Campanhas pagas no Instagram/Facebook: quais carros impulsionar, criativos prontos e o que pausar.' },
  atendimento: { t: 'Atendimento', d: 'Toda postagem termina numa conversa. Links rastreáveis, respostas prontas e a lista de leads.', p: ['Copie o link do carro', 'Cole no Story/anúncio', 'Registre quem chamou', 'Acompanhe até a venda'] },
  visual: { t: 'Identidade visual', d: 'Como a TopCar aparece em todo vídeo: logo, cores, fontes e o guia de estilo da casa.' },
  inteligencia: { t: 'Inteligência de mercado', d: 'O que as lojas que mais vendem estão fazendo nos vídeos e anúncios, e onde a TopCar pode ser diferente.' },
  plano: { t: 'Plano piloto', d: 'A estratégia completa: funil, pilares, cadência, anúncios, metas e a rotina da semana.' },
  fotos: { t: 'Fotos dos carros', d: 'Fotos de cada carro, na ordem certa e com capa, para o formulário dos carros e para o integrador dos portais (API do estoque).' },
  videos: { t: 'Vídeos dos carros', d: 'Os vídeos gravados (takes) de cada carro. O estúdio usa eles para montar Stories, Reels e anúncios.' },
  dia: { t: 'Dia a dia', d: 'Entretenimento e relacionamento: dinâmicas de Stories para postar hoje e Reels elaborados para gravar. Os carros do estoque são o cenário.' },
  social: { t: 'Plano de social media', d: 'Como a TopCar se comporta no Instagram: posicionamento, público, tom, semana padrão, rotina diária, metas e datas comerciais.' },
  ficha: { t: '', d: '' },
  integracoes: { t: 'Conexões', d: 'Conecte o Instagram/Facebook (Meta) e o WhatsApp oficial para postar, medir e atender daqui.' },
};
const GRUPOS = [['estoque', 'fotos', 'videos'], ['mes', 'dia', 'pautas', 'quadros'], ['resultados', 'atendimento', 'anuncios'], ['social', 'visual', 'inteligencia', 'plano', 'integracoes']];
const NOME_SUB = { estoque: '🚗 Carros', fotos: '📷 Fotos', videos: '🎞 Vídeos', dia: '🎉 Dia a dia', mes: '📅 Calendário', atendimento: '💬 Leads e WhatsApp', integracoes: '🔌 Conexões', social: '📣 Plano de social media', pautas: '💡 Pautas', quadros: '📺 Quadros fixos', resultados: '📊 Resultados', anuncios: '📣 Anúncios', visual: '🎨 Identidade visual', inteligencia: '🧠 Inteligência de mercado', plano: '🧭 Plano piloto' };

function cabecalho() {
  const m = META[E.aba] || {};
  const g = GRUPOS.find((x) => x.includes(E.aba));
  return `${g ? `<div class="subabas">${g.map((a) => `<button data-sub="${a}" class="${a === E.aba ? 'on' : ''}">${NOME_SUB[a]}</button>`).join('')}</div>` : ''}
    <header class="pg-cab"><h1>${m.t || ''}</h1><p>${m.d || ''}</p>
    ${m.p ? `<ol class="passos">${m.p.map((x) => `<li>${x}</li>`).join('')}</ol>` : ''}</header>`;
}

function render() {
  const box = $('#cal-corpo');
  $('#cal-abas').querySelectorAll('button[data-aba]').forEach((b) => {
    b.classList.toggle('on', b.dataset.aba === E.aba || (b.dataset.grupo || '').split(' ').includes(E.aba));
    b.onclick = () => { E.aba = b.dataset.aba; render(); };
  });
  badges();
  box.scrollTop = 0;
  const ficha = E.aba === 'estoque' && E.carroSel && E.ficha;
  const MOD_MIDIA = { fotos: { render: renderFotos, ligar: ligarFotos }, videos: { render: renderVideos, ligar: ligarVideos } };
  const mod = ficha ? MODULOS.ficha : MODULOS[E.aba] || MOD_MIDIA[E.aba];
  let html, ligar;
  if (mod) {
    html = mod.render(E);
    if (ficha) html = html.replace('</section>', `</section>${processoFicha(E, E.carroSel)}`); // o processo do carro no topo
    ligar = () => { mod.ligar?.(E, CTX); ligarComuns(E, CTX); if (ficha) ligarProcessoFicha(E, CTX); };
  }
  else if (E.aba === 'plano') { html = renderPlano(); ligar = () => {}; }
  else if (E.aba === 'central') { html = renderHoje(E); ligar = () => { ligarHoje(E, CTX); ligarComuns(E, CTX); }; }
  else if (E.aba === 'estoque') { html = renderCatalogo(E); ligar = () => { ligarCatalogo(E, CTX); ligarComuns(E, CTX); }; }
  else { html = renderMes(); ligar = ligarMes; }
  box.innerHTML = `<div class="pg">${E.aba === 'central' || ficha ? '' : cabecalho()}${html}</div>`;
  box.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = () => { E.aba = b.dataset.sub; render(); }));
  ligar();
}

// ---------------------------------------------------------------- mês

function renderMes() {
  const primeiro = new Date(E.ano, E.mes, 1);
  const inicio = new Date(primeiro); inicio.setDate(1 - ((primeiro.getDay() + 6) % 7)); // começa na segunda
  const hoje = iso(new Date());
  const doMes = E.cal.filter((e) => e.data?.startsWith(`${E.ano}-${String(E.mes + 1).padStart(2, '0')}`));
  const cont = (tipo, st) => doMes.filter((e) => e.tipo === tipo && (!st || e.status === st)).length;
  const celulas = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio); d.setDate(inicio.getDate() + i);
    const k = iso(d);
    const itens = E.cal.filter((e) => e.data === k && E.filtro[e.tipo]).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
    celulas.push(`<div class="cal-dia ${d.getMonth() !== E.mes ? 'fora' : ''} ${k === hoje ? 'hoje' : ''}" data-dia="${k}">
      <div class="cal-num">${d.getDate()} <button class="cal-mais" data-novo="${k}" title="Nova postagem">＋</button></div>
      ${itens.map((e) => `<div class="cal-item t-${({ 'Anúncio': 'ads', 'Gravação': 'grav' })[e.tipo] || e.tipo.toLowerCase()} s-${e.status} ${E.sel === e.id ? 'sel' : ''}" data-id="${e.id}" title="${esc(e.ideia || '')}">
        <span>${TIPOS[e.tipo] || ''} ${esc(e.hora || '')}</span> ${esc(e.titulo || '')}<i>${(STATUS[e.status] || '').split(' ')[0]}</i></div>`).join('')}
    </div>`);
  }
  const ed = E.cal.find((e) => e.id === E.sel);
  return `
    <div class="cal-barra">
      <button id="cal-ant">◀</button><b class="cal-titulo">${MESES[E.mes]} ${E.ano}</b><button id="cal-prox">▶</button>
      <button id="cal-hoje" class="mini">Hoje</button>
      ${Object.keys(TIPOS).map((t) => `<label class="chk"><input type="checkbox" data-filtro="${t}" ${E.filtro[t] ? 'checked' : ''}> ${TIPOS[t]} ${t}</label>`).join('')}
      <div class="espaco"></div>
      <span class="muted">Stories ${cont('Stories', 'postado')}/${cont('Stories')} · Reels ${cont('Reels', 'postado')}/${cont('Reels')} · Anúncios ${cont('Anúncio', 'postado')}/${cont('Anúncio')} postados</span>
      <button id="cal-ia" class="destaque">🧠 Planejar o mês com IA</button>
      <a class="btn" href="/api/calendario.ics" download title="Importe no Google Agenda ou na agenda do celular para receber lembretes">⬇ Google Agenda (.ics)</a>
    </div>
    <div class="cal-grade-wrap">
      <div class="cal-grade">${DIAS.map((d) => `<div class="cal-cab">${d}</div>`).join('')}${celulas.join('')}</div>
      <aside class="cal-editor">${ed ? renderEditor(ed) : `<p class="muted">Clique numa postagem para editar, ou no ＋ de um dia para criar.<br><br>
        <b>Cores:</b> <span class="cal-item t-stories">📱 Stories</span> <span class="cal-item t-reels">🎬 Reels</span> <span class="cal-item t-ads">📣 Anúncio</span><br><br>
        Vídeos exportados pela <b>série de Stories</b> entram aqui sozinhos, já com o arquivo ligado.</p>`}</aside>
    </div>`;
}

function renderEditor(e) {
  const projetos = (S.listaProjetos || []).filter((p) => !p.nome.startsWith('zz'));
  return `
    <h3>${TIPOS[e.tipo] || ''} ${esc(e.titulo || 'Postagem')}</h3>
    <div class="linha3">
      <label>Data<input type="date" data-e="data" value="${esc(e.data)}"></label>
      <label>Hora<input type="time" data-e="hora" value="${esc(e.hora || '12:00')}"></label>
      <label>Tipo<select data-e="tipo">${Object.keys(TIPOS).map((t) => `<option ${t === e.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="linha2">
      <label>Status<select data-e="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === e.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Pilar<select data-e="pilar">${PILARES.map((p) => `<option ${p === e.pilar ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    </div>
    <label>Título<input data-e="titulo" value="${esc(e.titulo || '')}"></label>
    <label>Ideia<textarea data-e="ideia">${esc(e.ideia || '')}</textarea></label>
    <label>Gancho<input data-e="gancho" value="${esc(e.gancho || '')}"></label>
    <div class="linha2">
      <label>Carro<input data-e="carro" value="${esc(e.carro || '')}"></label>
      <label>Projeto no app<select data-e="projeto"><option value="">—</option>${projetos.map((p) => `<option value="${p.id}" ${p.id === e.projeto ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
    </div>
    ${e.tipo === 'Stories' ? `<label>Sticker<input data-e="sticker" value="${esc(e.sticker || '')}"></label>` : ''}
    <label>CTA<input data-e="cta" value="${esc(e.cta || '')}"></label>
    ${e.legenda ? `<label>Legenda<textarea data-e="legenda">${esc(e.legenda)}</textarea></label>` : ''}
    ${e.arquivo ? `<p>🎞 <a href="${esc(e.arquivo)}" download>Baixar o vídeo</a></p>` : '<p class="muted" style="font-size:12px">Sem vídeo ligado ainda.</p>'}
    <h4>Resultados (depois de postar)</h4>
    <div class="linha3">
      <label>Views<input type="number" data-e="views" value="${esc(e.views || '')}"></label>
      <label>Alcance<input type="number" data-e="alcance" value="${esc(e.alcance || '')}"></label>
      <label>Mensagens<input type="number" data-e="mensagens" value="${esc(e.mensagens || '')}"></label>
    </div>
    <div class="linha2">
      <label>Retenção 3s (%)<input type="number" data-e="retencao" value="${esc(e.retencao || '')}"></label>
      <label>Custo/conversa (R$)<input type="number" step="0.01" data-e="custo_conversa" value="${esc(e.custo_conversa || '')}"></label>
    </div>
    <div class="acoes">
      ${e.conteudo && e.projeto ? `<button class="mini primario" data-estudio="${e.projeto}|${e.conteudo}">🎬 Abrir o vídeo</button>` : e.projeto ? '<button class="mini" id="ce-abrir">✂ Abrir o carro no estúdio</button>' : ''}
      <button class="mini" id="ce-postado">📤 Marcar postado</button>
      ${e.arquivo ? '<button class="mini" id="ce-aprender" title="A IA estuda este vídeo com os resultados e melhora o guia de estilo">📈 Aprender com este post</button>' : ''}
      <button class="mini perigo" id="ce-apagar">🗑 Apagar</button>
    </div>`;
}

function ligarMes() {
  $('#cal-ant').onclick = () => { E.mes--; if (E.mes < 0) { E.mes = 11; E.ano--; } render(); };
  $('#cal-prox').onclick = () => { E.mes++; if (E.mes > 11) { E.mes = 0; E.ano++; } render(); };
  $('#cal-hoje').onclick = () => { const h = new Date(); E.ano = h.getFullYear(); E.mes = h.getMonth(); render(); };
  document.querySelectorAll('[data-filtro]').forEach((c) => (c.onchange = () => { E.filtro[c.dataset.filtro] = c.checked; render(); }));
  document.querySelectorAll('.cal-item[data-id]').forEach((el) => (el.onclick = (ev) => { ev.stopPropagation(); E.sel = el.dataset.id; render(); }));
  document.querySelectorAll('[data-novo]').forEach((b) => (b.onclick = async (ev) => {
    ev.stopPropagation();
    const [e] = await api('/api/calendario', { json: { data: b.dataset.novo, hora: '12:00', tipo: 'Stories', pilar: 'Vitrine', titulo: 'Nova postagem', status: 'planejado' } });
    E.cal.push(e); E.sel = e.id; render();
  }));
  $('#cal-ia').onclick = planejarMes;
  const e = E.cal.find((x) => x.id === E.sel);
  if (!e) return;
  let t = null;
  document.querySelectorAll('[data-e]').forEach((i) => i.addEventListener(i.tagName === 'SELECT' || i.type === 'date' ? 'change' : 'input', () => {
    e[i.dataset.e] = i.value;
    clearTimeout(t);
    t = setTimeout(() => api(`/api/calendario/${e.id}`, { method: 'PUT', json: e }).catch((er) => toast(er.message, true)), 400);
    if (i.tagName === 'SELECT' || i.type === 'date') render();
  }));
  if ($('#ce-abrir')) $('#ce-abrir').onclick = () => { $('#calendario').hidden = true; E.abrirProjeto(e.projeto); };
  document.querySelectorAll('#cal-corpo [data-estudio]').forEach((b) => (b.onclick = () => { const [pid, cid] = b.dataset.estudio.split('|'); abrirNoEstudio(pid, cid); }));
  $('#ce-postado').onclick = async () => { e.status = 'postado'; await api(`/api/calendario/${e.id}`, { method: 'PUT', json: e }); render(); toast('Marcado como postado. Depois lance os resultados aqui.'); };
  if ($('#ce-aprender')) $('#ce-aprender').onclick = async () => {
    try { await api(`/api/calendario/${e.id}/aprender`, { method: 'POST' }); toast('A IA vai estudar este post. Depois gere de novo o guia de estilo (aba Marca).'); }
    catch (er) { toast(er.message, true); }
  };
  $('#ce-apagar').onclick = async () => { await api(`/api/calendario/${e.id}`, { method: 'DELETE' }); E.cal = E.cal.filter((x) => x.id !== e.id); E.sel = null; render(); };
}

async function planejarMes() {
  modal('🧠 Planejando o mês', `A IA está montando o calendário de ${MESES[E.mes]}: Stories todos os dias, Reels 3x por semana e anúncios — seguindo o plano piloto, o estoque e o guia da loja…`, 0.4);
  try {
    const r = await api('/api/calendario/plano', { json: { ano: E.ano, mes: E.mes + 1 } });
    modal(null);
    await recarregar();
    toast(`${r.criadas} postagens planejadas. ${r.resumo ? r.resumo.slice(0, 120) : ''}`);
  } catch (e) { modal(null); toast(e.message, true); }
}

// ---------------------------------------------------------------- Central: as ordens do dia

const ETAPAS = {
  cadastrar: ['📝', 'Completar cadastro'], pre_roteiro: ['🧭', 'Gerar pré-roteiro'], gravar: ['🎥', 'Gravar'],
  processando: ['⏳', 'Processando takes'], editar: ['✂', 'Editar'], pronto: ['✅', 'Pronto p/ postar'], no_ar: ['📤', 'No ar'], vendido: ['🏁', 'Vendido'],
};
const nomeCarro = (f) => [f.carro?.marca, f.carro?.modelo, f.carro?.versao, f.carro?.ano].filter(Boolean).join(' ') || f.nome;
const addDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

/** Monta as tarefas a partir do estoque, do calendário e do plano piloto (regras fixas: é ordem, não sugestão). */
function tarefas() {
  const hoje = iso(new Date()), em3 = addDias(3), ontem = addDias(-1);
  const T = { postar: [], gravar: [], editar: [], resultados: [], vendidos: [], anuncios: [], exposicao: [] };
  const porId = Object.fromEntries(E.estoque.map((f) => [f.id, f]));
  for (const e of E.cal) {
    if (['cancelado'].includes(e.status)) continue;
    if (e.data === hoje && e.status !== 'postado' && e.tipo !== 'Gravação' && e.tipo !== 'Anúncio') T.postar.push(e);
    if (e.data === hoje && e.tipo === 'Anúncio' && e.status !== 'postado') T.anuncios.push(e);
    if (e.data > hoje && e.data <= em3 && !e.arquivo && ['Stories', 'Reels'].includes(e.tipo) && e.status !== 'postado') T.editar.push({ entrada: e, ficha: porId[e.projeto] });
    if (e.status === 'postado' && e.data <= ontem && !e.views && e.tipo !== 'Gravação') T.resultados.push(e);
  }
  for (const f of E.estoque) {
    if (f.etapa === 'pre_roteiro' || f.etapa === 'gravar' || f.etapa === 'cadastrar') T.gravar.push(f);
    if (f.etapa === 'editar') T.editar.push({ ficha: f });
    if (f.etapa === 'vendido' && f.estoque?.vendido_em && f.estoque.vendido_em >= addDias(-7)) T.vendidos.push(f);
    const temProximo = f.proximos?.some((p) => p.data <= addDias(7));
    if (!['vendido', 'cadastrar'].includes(f.etapa) && !temProximo && f.dias_no_estoque >= 5) T.exposicao.push(f);
  }
  T.gravar.sort((a, b) => b.dias_no_estoque - a.dias_no_estoque);
  T.postar.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  return T;
}

function renderCentral() {
  const T = tarefas();
  const hoje = new Date();
  const est = E.estoque.filter((f) => f.etapa !== 'vendido');
  const cont = (et) => E.estoque.filter((f) => f.etapa === et).length;
  const semana = E.cal.filter((e) => e.data >= addDias(-((hoje.getDay() + 6) % 7)) && e.data <= addDias(6 - ((hoje.getDay() + 6) % 7)) && e.tipo !== 'Gravação');
  const proximos7 = E.cal.filter((e) => e.data >= iso(hoje) && e.data <= addDias(7)).length;
  const bloco = (titulo, itens, html, vazio, id = '') => `<div class="central-bloco" id="${id}"><h3>${titulo} <span class="status ${itens.length ? 'trab' : 'ok'}">${itens.length}</span></h3>${itens.length ? itens.map(html).join('') : `<p class="muted">${vazio}</p>`}</div>`;
  const leadsNovos = E.leads.filter((l) => l.status === 'novo');
  const revisar = (E.conteudos || []).filter((c) => ['montado', 'roteiro'].includes(c.status));
  const R = E.rotina || {};
  const pautasAbertas = E.pautas.filter((p) => ['nova', 'aprovada'].includes(p.status));
  const passos = [
    { n: T.postar.length, ic: '📤', t: 'Postar', d: T.postar.length ? `${T.postar.filter((e) => !e.arquivo).length ? `${T.postar.filter((e) => !e.arquivo).length} ainda sem vídeo` : 'vídeos prontos para baixar'}` : 'nada para postar hoje', alvo: 'bl-postar' },
    { n: T.gravar.length, ic: '🎥', t: 'Gravar', d: T.gravar.length ? 'carros esperando takes' : 'todos os carros gravados', alvo: 'bl-gravar' },
    { n: T.editar.length, ic: '🎬', t: 'Criar vídeos', d: T.editar.length ? 'posts próximos ainda sem vídeo' : 'tudo com vídeo', alvo: 'bl-editar' },
    { n: revisar.length, ic: '👀', t: 'Revisar', d: revisar.length ? 'vídeos da IA esperando sua revisão' : 'nada para revisar', alvo: 'bl-revisar' },
    { n: leadsNovos.length, ic: '💬', t: 'Atender', d: leadsNovos.length ? 'clientes esperando resposta' : 'nenhum lead esperando', alvo: 'bl-leads' },
    { n: T.resultados.length, ic: '📈', t: 'Medir', d: T.resultados.length ? 'posts sem números lançados' : 'resultados em dia', alvo: 'bl-result' },
  ];
  const pendentes = passos.reduce((a, p) => a + p.n, 0);
  const feitosSemana = semana.filter((e) => e.status === 'postado').length;
  const pct = semana.length ? Math.round((feitosSemana / semana.length) * 100) : 0;
  const saud = ['Bom dia', 'Boa tarde', 'Boa noite'][hoje.getHours() < 12 ? 0 : hoje.getHours() < 18 ? 1 : 2];
  return `
    <section class="hoje-hero">
      <div>
        <small>${((d) => d[0].toUpperCase() + d.slice(1))(hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</small>
        <h1>${saud}, TopCar!</h1>
        <p>${pendentes ? `Hoje são <b>${pendentes} tarefas</b>. Siga a ordem abaixo, de cima para baixo.` : 'Tudo em dia. Bom momento para <b>gerar pautas novas</b> ou gravar um carro.'}</p>
        <div class="hero-mini"><span>🚗 <b>${est.length}</b> carros</span><span>🎬 <b>${cont('pronto') + cont('no_ar')}</b> com vídeo</span><span>💡 <b>${pautasAbertas.length}</b> pautas abertas</span><span>📅 <b>${proximos7}</b> posts em 7 dias</span></div>
      </div>
      <div class="anel" style="--p:${pct}"><div><b>${feitosSemana}/${semana.length}</b><span>posts da semana</span></div></div>
    </section>
    ${proximos7 < 5 ? `<div class="alerta-acao"><div><b>A agenda dos próximos dias está vazia.</b><br><span>A IA monta o mês inteiro em 1 minuto, já usando o estoque e o plano piloto.</span></div><button class="primario" id="ct-planejar">🧠 Planejar o mês</button></div>` : ''}
    <div class="rotina ${R.rodando ? 'rodando' : ''}">
      <span class="robo">🤖</span>
      <div><b>${R.rodando ? 'A rotina do dia está trabalhando agora…' : R.data === iso(new Date()) ? `Rotina de hoje concluída às ${new Date((R.fim || R.inicio) * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'A rotina de hoje ainda não rodou'}</b>
        <small>Todo dia às 6h o sistema completa a agenda, escreve e narra os vídeos de hoje e amanhã e repõe as pautas.</small>
        ${(R.log || []).length ? `<details><summary>O que foi feito (${R.log.length})</summary><ul>${R.log.map((l) => `<li>${esc(l.msg)}</li>`).join('')}</ul></details>` : ''}</div>
      <div class="acoes">${revisar.some((c) => c.status === 'roteiro') ? `<button class="primario" id="ct-fabrica">▶ Montar ${revisar.filter((c) => c.status === 'roteiro').length} vídeos</button>` : ''}
        ${R.rodando ? '' : '<button id="ct-rotina">🤖 Rodar agora</button>'}</div>
    </div>
    <h2 class="sec">Missão de hoje</h2>
    <div class="missao">${passos.map((p, i) => `<button class="passo ${p.n ? '' : 'feito'}" data-rolar="${p.alvo}">
      <span class="num">${p.n ? i + 1 : '✓'}</span><span class="ic">${p.ic}</span>
      <span class="txt"><b>${p.t}</b><small>${p.d}</small></span><span class="qtd">${p.n || ''}</span></button>`).join('')}</div>
    <h2 class="sec">Detalhes</h2>
    <div class="central-grade">
      ${bloco('📤 Postar hoje', T.postar, (e) => `<div class="tarefa">
        <div><b>${TIPOS[e.tipo] || ''} ${esc(e.hora || '')} · ${esc(e.titulo || '')}</b><div class="muted">${esc(e.carro || '')} ${e.sticker ? `· 📌 ${esc(e.sticker)}` : ''}</div></div>
        <div class="acoes">${e.arquivo ? `<a class="btn mini primario" href="${esc(e.arquivo)}" download>⬇ Vídeo</a>` : `<span class="status erro">sem vídeo</span>${e.projeto ? `<button class="mini" data-abrir="${e.projeto}">✂ Produzir agora</button>` : ''}`}
          ${e.legenda ? `<button class="mini" data-copiar="${esc(e.id)}">📋 Legenda</button>` : ''}<button class="mini" data-postado="${e.id}">📤 Postado</button></div></div>`,
      'Nada para postar hoje. ✔', 'bl-postar')}
      ${bloco('🎥 Gravar', T.gravar, (f) => `<div class="tarefa">
        <div><b>${esc(nomeCarro(f))}</b><div class="muted">${f.dias_no_estoque} ${f.dias_no_estoque === 1 ? "dia" : "dias"} no pátio · ${f.etapa === 'cadastrar' ? 'falta completar o cadastro' : f.tem_prerroteiro ? `pré-roteiro “${esc(f.pre_formato || '')}”: ${f.takes.planejados} takes` : 'sem pré-roteiro ainda'}</div></div>
        <div class="acoes"><button class="mini ${f.tem_prerroteiro ? 'primario' : 'destaque'}" data-gravacao="${f.id}">${f.etapa === 'cadastrar' ? '📝 Cadastrar' : f.tem_prerroteiro ? '📋 Ver lista de takes' : '🧭 Gerar pré-roteiro'}</button></div></div>`,
      'Todos os carros já foram gravados. ✔', 'bl-gravar')}
      ${bloco('🎬 Criar vídeos (próximos 3 dias)', T.editar, (x) => `<div class="tarefa">
        <div><b>${x.entrada ? `${TIPOS[x.entrada.tipo] || ''} ${esc(x.entrada.data.slice(8))}/${esc(x.entrada.data.slice(5, 7))} · ${esc(x.entrada.titulo || '')}` : `${esc(nomeCarro(x.ficha))}`}</b>
        <div class="muted">${x.entrada ? `precisa do vídeo para ${esc(x.entrada.data)}` : `${x.ficha.takes.total} takes prontos: monte o Reels e a série de Stories`}</div></div>
        <div class="acoes">${x.entrada?.conteudo ? `<button class="mini primario" data-estudio="${x.entrada.projeto}|${x.entrada.conteudo}">🎬 Abrir vídeo</button>`
          : x.entrada?.projeto ? `<button class="mini primario" data-criar="${x.entrada.id}">🎬 Criar vídeo</button>`
          : x.ficha ? `<button class="mini primario" data-ficha="${x.ficha.id}">🎬 Criar conteúdo</button>` : '<span class="muted">a rotina das 6h escolhe o carro</span>'}</div></div>`,
      'Nada pendente de edição. ✔', 'bl-editar')}
      ${bloco('📣 Anúncios', [...T.anuncios, ...T.vendidos], (x) => x.etapa === 'vendido'
        ? `<div class="tarefa"><div><b>🏁 Pausar anúncios do ${esc(nomeCarro(x))}</b><div class="muted">vendido em ${esc(x.estoque.vendido_em)} — troque pelo próximo carro herói</div></div></div>`
        : `<div class="tarefa"><div><b>${esc(x.titulo || 'Subir criativos da semana')}</b><div class="muted">${esc(x.ideia || '')}</div></div><div class="acoes"><button class="mini" data-postado="${x.id}">✔ Feito</button></div></div>`,
      'Sem ações de anúncio hoje.')}
      ${bloco('📈 Lançar resultados', T.resultados, (e) => `<div class="tarefa"><div><b>${TIPOS[e.tipo] || ''} ${esc(e.titulo || '')}</b><div class="muted">postado em ${esc(e.data)} — lance views e mensagens</div></div>
        <div class="acoes"><button class="mini" data-cal="${e.id}">📊 Lançar</button></div></div>`, 'Resultados em dia. ✔', 'bl-result')}
      ${bloco('👀 Revisar vídeos da IA', revisar, (c) => `<div class="tarefa">
        <div><b>${TIPOS[c.tipo] || ''} ${esc(c.titulo || c.tipo)}</b><div class="muted">${esc(c.carro || '')}${c.data ? ` · posta ${esc(c.data.slice(8))}/${esc(c.data.slice(5, 7))}` : ''} · ${c.status === 'roteiro' ? 'roteiro e narração prontos, falta montar' : 'montado — confira as falas e aprove'}</div></div>
        <div class="acoes"><button class="mini primario" data-estudio="${c.projeto}|${c.id}">${c.status === 'roteiro' ? '🎬 Montar' : '👀 Revisar'}</button></div></div>`,
      'Nenhum vídeo esperando revisão. ✔', 'bl-revisar')}
      ${bloco('💡 Pautas para aprovar/agendar', E.pautas.filter((p) => ['nova', 'aprovada'].includes(p.status) && (p.prioridade || 2) <= 2).slice(0, 6), (p) => `<div class="tarefa"><div><b>${TIPOS[p.tipo] || ''} ${esc(p.titulo)}</b><div class="muted">${esc(p.quadro && p.quadro !== 'Avulso' ? p.quadro + ' · ' : '')}${esc(p.carro || 'Geral')}</div></div>
        <div class="acoes"><button class="mini destaque" data-ir="pautas">📅 Agendar</button></div></div>`, 'Banco de pautas em dia. <button class="mini" data-ir="pautas">🧠 Gerar novas</button>')}
      ${bloco('💬 Leads sem resposta', E.leads.filter((l) => l.status === 'novo'), (l) => `<div class="tarefa"><div><b>${esc(l.nome || l.telefone || 'Lead')}</b><div class="muted">${esc(l.origem || '')} · ${esc(l.data || '')}</div></div>
        <div class="acoes"><button class="mini primario" data-ir="atendimento">💬 Atender</button></div></div>`, 'Nenhum lead esperando. ✔', 'bl-leads')}
      ${bloco('👀 Carros sem exposição', T.exposicao, (f) => `<div class="tarefa"><div><b>${esc(nomeCarro(f))}</b><div class="muted">${f.dias_no_estoque} ${f.dias_no_estoque === 1 ? "dia" : "dias"} no pátio e nada agendado nos próximos 7 dias</div></div>
        <div class="acoes"><button class="mini" data-abrir="${f.id}">✂ Abrir</button></div></div>`, 'Todo o estoque tem exposição agendada. ✔')}
    </div>`;
}

function ligarCentral() {
  const box = $('#cal-corpo');
  if ($('#ct-planejar')) $('#ct-planejar').onclick = planejarMes;
  if ($('#ct-fabrica')) $('#ct-fabrica').onclick = () => fabrica(CTX);
  if ($('#ct-rotina')) $('#ct-rotina').onclick = () => rodarRotina(CTX);
  box.querySelectorAll('[data-rolar]').forEach((b) => (b.onclick = () => {
    const alvo = document.getElementById(b.dataset.rolar);
    if (alvo) { alvo.scrollIntoView({ behavior: 'smooth', block: 'start' }); alvo.classList.add('piscar'); setTimeout(() => alvo.classList.remove('piscar'), 1200); }
  }));
  box.querySelectorAll('[data-abrir]').forEach((b) => (b.onclick = () => { $('#calendario').hidden = true; E.abrirProjeto(b.dataset.abrir); }));
  box.querySelectorAll('[data-gravacao]').forEach((b) => (b.onclick = async () => {
    $('#calendario').hidden = true;
    await E.abrirProjeto(b.dataset.gravacao);
    E.abrirAba(E.estoque.find((f) => f.id === b.dataset.gravacao)?.etapa === 'cadastrar' ? 'carro' : 'gravacao');
  }));
  box.querySelectorAll('[data-postado]').forEach((b) => (b.onclick = async () => {
    await api(`/api/calendario/${b.dataset.postado}`, { method: 'PUT', json: { status: 'postado' } });
    await recarregar(); toast('Marcado como postado ✔');
  }));
  box.querySelectorAll('[data-copiar]').forEach((b) => (b.onclick = () => {
    const e = E.cal.find((x) => x.id === b.dataset.copiar);
    navigator.clipboard.writeText(e?.legenda || '').then(() => toast('Legenda copiada!'));
  }));
  box.querySelectorAll('[data-cal]').forEach((b) => (b.onclick = () => {
    const e = E.cal.find((x) => x.id === b.dataset.cal);
    if (e) { const [a, m] = e.data.split('-'); E.ano = +a; E.mes = +m - 1; }
    E.sel = b.dataset.cal; E.aba = 'mes'; render();
  }));
}

// ---------------------------------------------------------------- Estoque

function renderEstoque() {
  const colunas = [['Gravar', ['cadastrar', 'pre_roteiro', 'gravar']], ['Editar', ['processando', 'editar']], ['Pronto', ['pronto']], ['No ar', ['no_ar']], ['Vendidos', ['vendido']]];
  const card = (f) => `<div class="carro-card" data-id="${f.id}">
    ${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : '<div class="sem-foto">📷 sem takes</div>'}
    <div class="carro-info">
      <b>${esc(nomeCarro(f))}</b>
      <div>${f.carro?.preco ? `R$ ${esc(f.carro.preco)}` : '<span class="muted">sem preço</span>'} ${f.carro?.km ? `· ${esc(f.carro.km)} km` : ''}</div>
      <div class="muted">${f.dias_no_estoque} ${f.dias_no_estoque === 1 ? "dia" : "dias"} no pátio</div>
      <div><span class="status ${['gravar', 'pre_roteiro', 'cadastrar', 'editar'].includes(f.etapa) ? 'trab' : 'ok'}">${ETAPAS[f.etapa]?.[0] || ''} ${ETAPAS[f.etapa]?.[1] || f.etapa}</span></div>
      <div class="muted" style="font-size:11px">🎞 ${f.takes.total} takes${f.takes.planejados ? ` de ${f.takes.planejados} planejados` : ''} · 🎬 ${f.videos} vídeos · 📤 ${f.postados} postados${f.serie ? ` · 📅 série de ${f.serie}` : ''}</div>
      ${f.proximos?.length ? `<div style="font-size:11px">Próximo: ${TIPOS[f.proximos[0].tipo] || ''} ${esc(f.proximos[0].data.slice(8))}/${esc(f.proximos[0].data.slice(5, 7))} ${esc(f.proximos[0].titulo || '')}</div>` : ''}
      <div class="acoes">
        <button class="mini primario" data-ficha="${f.id}">📁 Abrir ficha</button>
        <select class="mini-sel" data-venda="${f.id}">${['disponivel', 'reservado', 'vendido'].map((s) => `<option value="${s}" ${(f.estoque?.status || 'disponivel') === s ? 'selected' : ''}>${{ disponivel: '🟢 Disponível', reservado: '🟡 Reservado', vendido: '🏁 Vendido' }[s]}</option>`).join('')}</select>
      </div>
    </div></div>`;
  return `
    <div class="cal-barra">
      <b class="cal-titulo" style="text-align:left;min-width:0">🚗 Estoque — ${E.estoque.filter((f) => f.etapa !== 'vendido').length} carros</b>
      <div class="espaco"></div>
      <button id="es-novo" class="primario">＋ Cadastrar carro</button>
      <button id="es-importar">📋 Importar lista</button>
    </div>
    <div id="es-form" hidden class="card" style="margin-bottom:10px">
      <div class="linha3"><label>Marca<input id="es-marca"></label><label>Modelo<input id="es-modelo"></label><label>Versão<input id="es-versao"></label></div>
      <div class="linha3"><label>Ano<input id="es-ano"></label><label>Preço<input id="es-preco"></label><label>Km<input id="es-km"></label></div>
      <button id="es-salvar" class="primario">Salvar carro</button>
    </div>
    <div id="es-lista" hidden class="card" style="margin-bottom:10px">
      <p class="muted">Cole o estoque, <b>um carro por linha</b>: marca; modelo; versão; ano; preço; km; cor; câmbio; FIPE (pode copiar direto do Excel).</p>
      <textarea id="es-texto" style="min-height:140px" placeholder="Ford; Ka; SE 1.0; 2020; 47.990; 70.000; Branco; Manual; 55.000&#10;Chevrolet; Tracker; LT 1.0 Turbo; 2024; 91.990; 35.000"></textarea>
      <button id="es-enviar" class="primario">Cadastrar todos</button>
    </div>
    <div class="kanban">${colunas.map(([nome, etapas]) => {
      const itens = E.estoque.filter((f) => etapas.includes(f.etapa));
      return `<div class="kanban-col"><h3>${nome} <span class="status">${itens.length}</span></h3>${itens.map(card).join('') || '<p class="muted">—</p>'}</div>`;
    }).join('')}</div>`;
}

function ligarEstoque() {
  const box = $('#cal-corpo');
  $('#es-novo').onclick = () => { $('#es-form').hidden = !$('#es-form').hidden; };
  $('#es-importar').onclick = () => { $('#es-lista').hidden = !$('#es-lista').hidden; };
  $('#es-salvar').onclick = async () => {
    const carro = Object.fromEntries(['marca', 'modelo', 'versao', 'ano', 'preco', 'km'].map((k) => [k, $(`#es-${k}`).value.trim()]).filter(([, v]) => v));
    if (!carro.marca || !carro.modelo) return toast('Informe pelo menos marca e modelo.', true);
    await api('/api/projetos', { json: { nome: [carro.marca, carro.modelo, carro.ano].filter(Boolean).join(' '), carro } });
    toast('Carro cadastrado — já aparece em "Gravar".'); await recarregar();
  };
  $('#es-enviar').onclick = async () => {
    const r = await api('/api/estoque/importar', { json: { texto: $('#es-texto').value } });
    toast(`${r.criados} carros cadastrados.`); await recarregar();
  };
  box.querySelectorAll('[data-abrir]').forEach((b) => (b.onclick = () => { $('#calendario').hidden = true; E.abrirProjeto(b.dataset.abrir); }));
  box.querySelectorAll('[data-venda]').forEach((s) => (s.onchange = async () => {
    await api(`/api/estoque/${s.dataset.venda}`, { method: 'PUT', json: { status: s.value } });
    toast(s.value === 'vendido' ? 'Vendido! 🏁 Postagens futuras dele foram canceladas — pause os anúncios dele.' : 'Status atualizado.');
    await recarregar();
  }));
}

// ---------------------------------------------------------------- plano piloto

function renderPlano() {
  const p = E.plano || {};
  const lista = (arr) => `<ul>${(arr || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `<div class="plano">
    <p class="plano-obj">${esc(p.objetivo || '')}</p>
    <h3>Funil</h3>
    <div class="plano-grade">${(p.funil || []).map((f) => `<div class="card"><b>${esc(f.etapa)}</b><p class="muted">${esc(f.objetivo)}</p>${lista(f.conteudos)}<small>📊 ${esc(f.metrica)}</small></div>`).join('')}</div>
    <h3>Pilares de conteúdo</h3>
    <div class="plano-grade">${(p.pilares || []).map((f) => `<div class="card"><b>${esc(f.nome)}</b> <span class="status ok">${esc(f.peso)}</span><p>${esc(f.descricao)}</p></div>`).join('')}</div>
    <h3>Cadência</h3>
    <div class="card"><p>📱 <b>Stories:</b> ${esc(p.cadencia?.stories || '')}</p><p>🎬 <b>Reels:</b> ${esc(p.cadencia?.reels || '')}</p><p>📣 <b>Anúncios:</b> ${esc(p.cadencia?.anuncios || '')}</p></div>
    <h3>Stories da semana</h3>
    <div class="plano-grade">${(p.stories_por_dia || []).map((d) => `<div class="card"><b>${esc(d.dia)} — ${esc(d.tema)}</b><p>${esc(d.ideia)}</p><small>📌 ${esc(d.sticker)}</small></div>`).join('')}</div>
    <h3>Anúncios pagos (Meta Ads)</h3>
    <div class="plano-grade">${(p.anuncios?.estrutura || []).map((c) => `<div class="card"><b>${esc(c.campanha)}</b> <span class="status ok">${esc(c.orcamento)}</span><p><small>Público:</small> ${esc(c.publico)}</p><p><small>Criativos:</small> ${esc(c.criativos)}</p></div>`).join('')}</div>
    <div class="card"><b>Regras de otimização</b>${lista(p.anuncios?.regras)}<p class="muted">${esc(p.anuncios?.metas_iniciais || '')}</p></div>
    <h3>Padrão de vídeo</h3><div class="card">${lista(p.padroes_de_video)}</div>
    <h3>Indicadores (KPIs)</h3>
    <div class="plano-grade">${(p.kpis || []).map((k) => `<div class="card"><b>${esc(k.nome)}</b><p>🎯 ${esc(k.meta)}</p><small>${esc(k.onde)}</small></div>`).join('')}</div>
    <h3>Rotina da semana</h3>
    <div class="plano-grade">${(p.rotina_semanal || []).map((r) => `<div class="card"><b>${esc(r.dia)}</b><p>${esc(r.tarefa)}</p></div>`).join('')}</div>
    <h3>Piloto de 30 dias</h3>
    <div class="plano-grade">${(p.piloto_30_dias || []).map((s) => `<div class="card"><b>${esc(s.semana)}</b>${lista(s.acoes)}</div>`).join('')}</div>
  </div>`;
}
