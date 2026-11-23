// Telas guiadas por processo: Hoje (o que fazer + projeção da semana), Estoque (catálogo de carros) e o processo de cada carro.
import { api, esc, toast, modal } from './estado.js';
import { abrirNoEstudio } from './setor.js';

const $ = (s, r = document) => r.querySelector(s);
const IC = { Reels: '🎬', Stories: '📱', 'Anúncio': '📣', 'Gravação': '🎥' };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
const nomeCarro = (f) => [f.carro?.marca, f.carro?.modelo, f.carro?.versao, f.carro?.ano].filter(Boolean).join(' ') || f.nome;
const curto = (f) => [f.carro?.modelo, f.carro?.ano].filter(Boolean).join(' ') || f.nome;
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export async function carregarProcessos(E) {
  try { E.processos = await api('/api/processos'); } catch { E.processos = {}; }
}

/** Situação de uma postagem da agenda, olhando o conteúdo ligado a ela. */
function situacao(E, e) {
  const c = (E.conteudos || []).find((x) => x.id === e.conteudo || x.entrada === e.id);
  if (e.status === 'postado') return { cls: 'ok', txt: '✔ postado', c };
  if (e.arquivo || c?.arquivo) return { cls: 'ok', txt: '✅ vídeo pronto', c };
  if (c && ['montado', 'aprovado'].includes(c.status)) return { cls: 'rev', txt: '👀 revisar', c };
  if (c && c.status === 'roteiro') return { cls: 'rev', txt: '🎬 montar', c };
  if (c) return { cls: 'ia', txt: '⏳ IA criando', c };
  if (e.tipo === 'Gravação') return { cls: 'grav', txt: '🎥 gravar', c };
  return { cls: 'falta', txt: '⚠ sem vídeo', c };
}

// ---------------------------------------------------------------- HOJE

export function renderHoje(E) {
  const hoje = iso(new Date());
  const agora = new Date();
  const posts = E.cal.filter((e) => e.status !== 'cancelado');
  const P = E.processos || {};
  const estoque = E.estoque.filter((f) => f.etapa !== 'vendido');
  // 1. postar hoje
  const postarHoje = posts.filter((e) => e.data === hoje && ['Stories', 'Reels', 'Anúncio'].includes(e.tipo)).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  // 2. revisar
  const revisar = (E.conteudos || []).filter((c) => ['montado', 'roteiro', 'aprovado'].includes(c.status) && !c.arquivo)
    .sort((a, b) => String(a.data || '9').localeCompare(String(b.data || '9')));
  // 3. carros que precisam de você (cadastro, mídias, pacote)
  const carrosTodos = estoque.filter((f) => (f.estoque?.status || 'disponivel') === 'disponivel').map((f) => ({ f, p: P[f.id] }))
    .filter((x) => x.p && ['cadastro', 'midias', 'videos'].includes(x.p.acao.passo) && !/IA está|aguarde/.test(x.p.acao.texto))
    .sort((a, b) => (b.p.acao.passo === 'videos') - (a.p.acao.passo === 'videos') || b.f.dias_no_estoque - a.f.dias_no_estoque);
  const carros = carrosTodos.slice(0, 5);
  const leads = E.leads.filter((l) => l.status === 'novo');
  const medir = posts.filter((e) => e.status === 'postado' && e.data < hoje && !e.views && e.tipo !== 'Gravação');
  const tarefas = [];
  postarHoje.forEach((e) => {
    const s = situacao(E, e);
    const arq = e.arquivo || s.c?.arquivo;
    tarefas.push({ feito: e.status === 'postado', ic: IC[e.tipo], t: `Postar ${e.tipo} às ${e.hora || '—'}: ${e.titulo || ''}`, sub: e.carro || '',
      acoes: e.status === 'postado' ? '' : arq ? `<a class="btn mini primario" href="${esc(arq)}" download>⬇ Baixar vídeo</a>${e.legenda || s.c?.legenda ? `<button class="mini" data-leg="${e.id}">📋 Legenda</button>` : ''}<button class="mini" data-postado="${e.id}">✔ Postei</button>`
        : s.c ? `<button class="mini primario" data-estudio="${s.c.projeto}|${s.c.id}">${s.txt.includes('revisar') ? '👀 Revisar e aprovar' : '🎬 Abrir o vídeo'}</button>`
          : e.projeto ? `<button class="mini primario" data-criar="${e.id}">🎬 Criar o vídeo agora</button>` : '<span class="muted">sem carro definido</span>' });
  });
  revisar.filter((c) => !postarHoje.some((e) => e.id === c.entrada)).forEach((c) => tarefas.push({ ic: '👀', t: `Revisar as falas: ${c.titulo}`, sub: `${c.carro || ''}${c.data ? ` · posta ${dm(c.data)}` : ''}`,
    acoes: `<button class="mini primario" data-estudio="${c.projeto}|${c.id}">${c.status === 'roteiro' ? '🎬 Montar e revisar' : '👀 Revisar e aprovar'}</button>` }));
  carros.forEach(({ f, p }) => tarefas.push({ ic: p.acao.passo === 'cadastro' ? '📝' : p.acao.passo === 'midias' ? '🎥' : '🎬', t: `${curto(f)}: ${p.acao.texto}`, sub: `${f.dias_no_estoque} dias no pátio`,
    acoes: `<button class="mini primario" data-ficha-aba="${f.id}|${p.acao.passo === 'cadastro' ? 'dados' : 'criar'}">${p.acao.passo === 'cadastro' ? '📝 Completar cadastro' : p.acao.passo === 'videos' ? '🎬 Criar os vídeos' : '🎥 Roteiro e gravação'}</button>` }));
  if (carrosTodos.length > 5) tarefas.push({ ic: '🚗', t: `Mais ${carrosTodos.length - 5} carros em loja sem vídeos`, sub: 'grave conforme a agenda — os mais antigos no pátio primeiro', acoes: '<button class="mini" data-ir="estoque">Ver no Estoque</button>' });
  if (E.dia?.data === hoje && (E.dia.dinamicas || []).length) tarefas.push({ ic: '🎉', t: `Postar as dinâmicas de Stories do dia (${E.dia.dinamicas.length})`, sub: E.dia.dinamicas.map((x) => x.titulo).slice(0, 3).join(' · '), acoes: '<button class="mini primario" data-ir="dia">🎉 Ver dinâmicas</button>' });
  if (leads.length) tarefas.push({ ic: '💬', t: `Responder ${leads.length} cliente(s) no WhatsApp`, sub: leads.map((l) => l.nome || l.telefone).slice(0, 3).join(', '), acoes: '<button class="mini primario" data-ir="atendimento">💬 Atender</button>' });
  if (medir.length) tarefas.push({ ic: '📈', t: `Lançar os números de ${medir.length} post(s) de ontem`, sub: 'views e mensagens — é assim que a IA aprende o que vende', acoes: `<button class="mini" data-cal="${medir[0].id}">📊 Lançar</button>` });
  const pend = tarefas.filter((x) => !x.feito).length;

  // projeção: 7 dias
  const dias = Array.from({ length: 7 }, (_, i) => addDias(i));
  const semana = dias.map((d) => {
    const it = posts.filter((e) => e.data === d && e.tipo !== 'Gravação').sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
    const dt = new Date(`${d}T12:00`);
    const ok = it.filter((e) => ['ok'].includes(situacao(E, e).cls)).length;
    return `<div class="dia ${d === hoje ? 'hoje' : ''}"><div class="dia-cab"><b>${d === hoje ? 'Hoje' : SEM[dt.getDay()]}</b><span>${dm(d)}</span><i class="${it.length && ok === it.length ? 'cheio' : ''}">${ok}/${it.length}</i></div>
      ${it.map((e) => { const s = situacao(E, e); return `<button class="post ${s.cls}" ${s.c ? `data-estudio="${s.c.projeto}|${s.c.id}"` : `data-cal="${e.id}"`} title="${esc(e.titulo || '')}">
        <span>${IC[e.tipo] || ''} ${esc(e.hora || '')}</span><b>${esc((e.carro || 'Geral').replace(/^(CHEVROLET|FORD|FIAT|VOLKSWAGEN|VW|HYUNDAI|TOYOTA|HONDA|RENAULT|NISSAN|JEEP)\s+/i, ''))}</b><small>${s.txt}</small></button>`; }).join('') || '<p class="muted">—</p>'}</div>`;
  }).join('');
  const prontosSemana = dias.reduce((a, d) => a + posts.filter((e) => e.data === d && e.tipo !== 'Gravação' && situacao(E, e).cls === 'ok').length, 0);
  const totalSemana = dias.reduce((a, d) => a + posts.filter((e) => e.data === d && e.tipo !== 'Gravação').length, 0);
  const R = E.rotina || {};
  return `
    <header class="pg-cab hoje-cab">
      <div><h1>${['Bom dia', 'Boa tarde', 'Boa noite'][agora.getHours() < 12 ? 0 : agora.getHours() < 18 ? 1 : 2]}! ${pend ? `${pend} ${pend === 1 ? 'coisa' : 'coisas'} para fazer hoje` : 'Tudo em dia hoje ✔'}</h1>
      <p>Os próximos 7 dias têm <b>${totalSemana} posts</b>, <b>${prontosSemana}</b> já com vídeo pronto. A IA trabalha sozinha às 6h; você grava, revisa e posta.</p></div>
      <div class="acoes"><button id="hj-rotina" title="Completa a agenda, cria e narra os vídeos dos próximos dias e repõe as ideias">🤖 ${R.rodando ? 'IA trabalhando…' : 'Rodar a IA agora'}</button></div>
    </header>
    <h2 class="sec">Próximos 7 dias</h2>
    <div class="semana">${semana}</div>
    <h2 class="sec">Plano de hoje — faça nesta ordem</h2>
    <ol class="plano-hoje">${tarefas.map((x) => `<li class="${x.feito ? 'feito' : ''}"><span class="ic">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.sub || '')}</small></div><div class="acoes">${x.acoes}</div></li>`).join('')
      || '<li class="feito"><span class="ic">✔</span><div><b>Nada pendente.</b><small>Aproveite para gravar um carro novo ou ver as ideias da semana.</small></div><div class="acoes"><button class="mini" data-ir="pautas">💡 Ideias</button></div></li>'}</ol>`;
}

export function ligarHoje(E, ctx) {
  const box = $('#cal-corpo');
  box.querySelectorAll('[data-leg]').forEach((b) => (b.onclick = () => {
    const e = E.cal.find((x) => x.id === b.dataset.leg);
    const c = (E.conteudos || []).find((x) => x.entrada === e?.id);
    navigator.clipboard.writeText(e?.legenda || c?.legenda || '').then(() => toast('Legenda copiada!'));
  }));
  box.querySelectorAll('[data-pacote]').forEach((b) => (b.onclick = () => criarPacote(b.dataset.pacote, ctx)));
  box.querySelectorAll('[data-ficha-aba]').forEach((b) => (b.onclick = () => { const [pid, aba] = b.dataset.fichaAba.split('|'); E.aba = 'estoque'; E.carroSel = pid; E.fichaAba = aba; ctx.recarregar(); }));
  if ($('#hj-rotina')) $('#hj-rotina').onclick = async () => {
    await api('/api/rotina/rodar', { method: 'POST' });
    toast('🤖 A IA está completando a agenda e criando os vídeos. A tela atualiza sozinha.');
    const vigia = setInterval(async () => { const r = await api('/api/rotina').catch(() => ({})); if (!r.rodando) { clearInterval(vigia); ctx.recarregar(); } }, 8000);
  };
}

async function criarPacote(pid, ctx) {
  try {
    const conts = await api(`/api/projetos/${pid}/pacote`, { method: 'POST' });
    toast(`🎬 ${conts.length} vídeos agendados. A IA está escrevendo e narrando — aparecem em "Revisar" em alguns minutos.`);
    ctx.recarregar();
  } catch (e) { toast(e.message, true); }
}

// ---------------------------------------------------------------- ESTOQUE (catálogo)

const PASSOS = ['Cadastro', 'Mídias', 'Vídeos', 'Revisão', 'No ar'];

function barraProcesso(p) {
  if (!p) return '';
  return `<div class="processo">${p.passos.map((x, i) => `<span class="${x.ok ? 'ok' : p.acao.passo === x.id ? 'agora' : ''}" title="${x.nome}">${x.ok ? '✓' : i + 1}</span>`).join('<i></i>')}</div>`;
}

export function renderCatalogo(E) {
  const P = E.processos || {};
  const filtro = E.filtroEstoque || 'todos';
  const todos = [...E.estoque].sort((a, b) => (a.etapa === 'vendido') - (b.etapa === 'vendido') || b.dias_no_estoque - a.dias_no_estoque);
  const st = (f) => f.estoque?.status || 'disponivel';
  const filtros = {
    todos: ['Em estoque', (f) => st(f) !== 'vendido'],
    recife: ['Recife', (f) => st(f) !== 'vendido' && f.unidade === 'Recife'],
    olinda: ['Olinda', (f) => st(f) !== 'vendido' && f.unidade === 'Olinda'],
    preparacao: ['Em preparação', (f) => st(f) === 'preparacao'],
    gravar: ['Sem vídeos', (f) => st(f) !== 'vendido' && st(f) !== 'preparacao' && !(f.takes?.total)],
    revisar: ['Vídeos para revisar', (f) => P[f.id]?.acao.passo === 'revisao'],
    vendidos: ['Vendidos', (f) => st(f) === 'vendido'],
  };
  const busca = (E.buscaEstoque || '').trim().toLowerCase();
  const lista = todos.filter(filtros[filtro][1]).filter((f) => !busca || `${nomeCarro(f)} ${f.carro?.placa || ''} ${f.carro?.cor || ''}`.toLowerCase().includes(busca));
  const T = E.topcrm || {};
  const N = E.nuvem || {};
  const hora = (t) => new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `
    <div class="topcrm ${!N.configurado ? '' : N.erro ? 'erro' : N.quando ? 'ok' : ''}"><span>☁️</span><div><b>Banco do estoque na nuvem</b><small>${!N.configurado ? 'Desligado: coloque ESTOQUE_DATABASE_URL no arquivo .env para os outros apps consultarem o estoque e as fotos.' : N.erro ? `Atenção: ${esc(N.erro)}` : N.quando ? `Espelhado ${hora(N.quando)} · ${N.enviados} carros · fotos ${N.modo_fotos === 's3' ? 'no storage S3' : 'dentro do banco'} · atualiza sozinho a cada minuto` : 'Ligado, primeira sincronização em instantes…'}</small></div><div class="acoes">${N.configurado ? '<button id="nv-sync">☁️ Sincronizar agora</button>' : ''}</div></div>
    <div class="topcrm ${T.erro ? 'erro' : T.quando ? 'ok' : ''}"><span>🔗</span><div><b>TopCRM</b><small>${T.quando && T.origem === 'arquivo' ? `Importado do arquivo em ${new Date(T.quando * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${T.veiculos} veículos (${T.disponiveis} em loja, ${T.preparacao} em preparação, ${T.vendidos} vendidos)` : !T.configurado ? 'O cadastro e a gestão dos carros agora ficam aqui. Para trazer o estoque do TopCRM, importe o arquivo exportado (ou configure a conexão do banco).' : T.erro ? `Erro: ${esc(T.erro)}` : T.quando ? `Estoque sincronizado ${new Date(T.quando * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${T.veiculos} veículos (${T.criados} novos, ${T.vendidos} vendidos) · atualiza sozinho a cada 30 min` : 'Conectado, ainda não sincronizado.'}</small></div><div class="acoes">${T.configurado ? '<button id="tc-sync">🔄 Sincronizar agora</button><button id="tc-aprend" title="Playbook, referências e feedback do Studio do TopCRM">🧠 Trazer aprendizado</button>' : ''}<button id="tc-fichas" title="A IA pesquisa os itens de série dos carros que ainda não têm (10 por vez)">📘 Pesquisar fichas</button><button id="tc-arq" title="Export JSON da tabela estoque_veiculo">📥 Importar arquivo do TopCRM</button><input type="file" id="tc-arq-in" accept=".json,application/json" hidden></div></div>
    <div class="cat-barra">
      <div class="chips">${Object.entries(filtros).map(([k, [n, fn]]) => `<button class="${k === filtro ? 'on' : ''}" data-filtro-est="${k}">${n} <b>${todos.filter(fn).length}</b></button>`).join('')}</div>
      <div class="acoes"><input id="ct-busca" placeholder="🔎 Placa, modelo ou cor" value="${esc(E.buscaEstoque || '')}" style="width:220px"><button class="primario" id="ct-novo">＋ Cadastrar carro</button><button id="ct-importar">📋 Importar lista</button></div>
    </div>
    <div id="ct-form" hidden class="card" style="margin-bottom:14px">
      <div class="grade-campos">${[['marca', 'Marca'], ['modelo', 'Modelo'], ['versao', 'Versão'], ['ano', 'Ano'], ['preco', 'Preço'], ['km', 'Km'], ['cor', 'Cor'], ['cambio', 'Câmbio']].map(([k, n]) => `<label>${n}<input id="nc-${k}"></label>`).join('')}</div>
      <div class="acoes"><button id="ct-salvar" class="primario">Salvar e abrir o carro</button></div>
    </div>
    <div id="ct-lista" hidden class="card" style="margin-bottom:14px">
      <p class="muted">Cole o estoque, <b>um carro por linha</b>: marca; modelo; versão; ano; preço; km; cor; câmbio; FIPE (pode copiar do Excel).</p>
      <textarea id="ct-texto" rows="6"></textarea><div class="acoes"><button id="ct-enviar" class="primario">Cadastrar todos</button></div>
    </div>
    <div class="catalogo">${lista.map((f) => { const p = P[f.id]; return `<button class="carro" data-ficha="${f.id}">
      <div class="foto">${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : '<span>📷 sem fotos</span>'}<em class="vend ${f.estoque?.status || 'disponivel'}">${{ disponivel: f.unidade ? `Loja ${f.unidade}` : 'Disponível', reservado: 'Reservado', vendido: 'Vendido', preparacao: 'Em preparação' }[f.estoque?.status || 'disponivel']}</em></div>
      <div class="info"><b>${esc(nomeCarro(f))}</b>${f.carro?.placa || f.topcrm ? `<small class="placa">${esc(f.carro?.placa || '')}${f.topcrm?.unidade ? ` · ${esc(f.topcrm.unidade)}` : ''}</small>` : ''}
        <div class="preco">${f.carro?.preco ? `R$ ${esc(f.carro.preco)}` : 'sem preço'}<span>${f.carro?.km ? `${esc(f.carro.km)} km · ` : ''}${f.dias_no_estoque} ${f.dias_no_estoque === 1 ? 'dia' : 'dias'}</span></div>
        ${barraProcesso(p)}
        <div class="prox">${p ? `<span>Próximo passo</span>${esc(p.acao.texto)}` : ''}</div>
        <div class="nums"><span>📷 ${f.fotos || 0} fotos</span><span>🎞 ${p?.takes ?? f.takes?.total ?? 0} takes</span><span>🎬 ${p?.conteudos ?? 0} conteúdos</span><span>✅ ${p?.prontos ?? 0} prontos</span></div>
      </div></button>`; }).join('') || '<p class="muted">Nenhum carro aqui.</p>'}</div>`;
}

export function ligarCatalogo(E, ctx) {
  const box = $('#cal-corpo');
  box.querySelectorAll('[data-filtro-est]').forEach((b) => (b.onclick = () => { E.filtroEstoque = b.dataset.filtroEst; ctx.render(); }));
  $('#ct-novo').onclick = () => { $('#ct-form').hidden = !$('#ct-form').hidden; };
  $('#ct-importar').onclick = () => { $('#ct-lista').hidden = !$('#ct-lista').hidden; };
  $('#ct-salvar').onclick = async () => {
    const carro = Object.fromEntries(['marca', 'modelo', 'versao', 'ano', 'preco', 'km', 'cor', 'cambio'].map((k) => [k, $(`#nc-${k}`).value.trim()]).filter(([, v]) => v));
    if (!carro.marca || !carro.modelo) return toast('Informe pelo menos marca e modelo.', true);
    const { id } = await api('/api/projetos', { json: { nome: [carro.marca, carro.modelo, carro.ano].filter(Boolean).join(' '), carro } });
    E.carroSel = id; E.fichaAba = 'midias'; toast('Carro cadastrado. Agora envie as mídias.'); ctx.recarregar();
  };
  if ($('#ct-busca')) $('#ct-busca').oninput = (ev) => { E.buscaEstoque = ev.target.value; clearTimeout(E.tBusca); E.tBusca = setTimeout(() => { ctx.render(); const i = $('#ct-busca'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  if ($('#tc-arq')) { $('#tc-arq').onclick = () => $('#tc-arq-in').click(); $('#tc-arq-in').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('arquivo', f);
    toast('Importando o estoque do TopCRM…');
    try { const r = await api('/api/topcrm/importar', { method: 'POST', body: fd }); toast(`TopCRM importado: ${r.veiculos} veículos · ${r.criados} novos · ${r.ligados} ligados aos que já existiam · ${r.disponiveis} em loja · ${r.preparacao} em preparação · ${r.vendidos} vendidos.`); }
    catch (e) { toast(e.message, true); }
    ctx.recarregar();
  }; }
  if ($('#tc-aprend')) $('#tc-aprend').onclick = async () => {
    try { const r = await api('/api/topcrm/aprendizado', { method: 'POST' }); toast(`Aprendizado do TopCRM: ${r.playbook ? 'playbook da loja, ' : ''}${r.referencias} referências e ${r.feedback} roteiros avaliados — já valem nos próximos roteiros.`); }
    catch (e) { toast(e.message, true); }
  };
  if ($('#tc-fichas')) $('#tc-fichas').onclick = async () => {
    const r = await api('/api/estoque/fichas', { json: { limite: 10 } });
    toast(r.enfileirados ? `📘 Pesquisando a ficha de ${r.enfileirados} carros em segundo plano (${r.faltam - r.enfileirados} ficam para depois; a rotina faz 10 por dia).` : 'Todos os carros em estoque já têm ficha.');
  };
  if ($('#nv-sync')) $('#nv-sync').onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = '⏳ Enviando…';
    try { const r = await api('/api/nuvem/sincronizar', { method: 'POST' }); toast(r.ocupado ? 'Já está sincronizando — aguarde.' : `Nuvem: ${r.enviados} carros atualizados, ${r.fotos_enviadas} fotos enviadas${r.erros?.length ? ` · ${r.erros[0]}` : ''}.`, !!r.erros?.length); }
    catch (e) { toast(e.message, true); }
    ctx.recarregar();
  };
  if ($('#tc-sync')) $('#tc-sync').onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = '⏳ Sincronizando…';
    try { const r = await api('/api/topcrm/sincronizar', { method: 'POST' }); toast(`TopCRM: ${r.veiculos} veículos · ${r.criados} novos · ${r.vendidos} vendidos.`); }
    catch (e) { toast(e.message, true); }
    ctx.recarregar();
  };
  $('#ct-enviar').onclick = async () => { const r = await api('/api/estoque/importar', { json: { texto: $('#ct-texto').value } }); toast(`${r.criados} carros cadastrados.`); ctx.recarregar(); };
}

// ---------------------------------------------------------------- processo no topo da ficha do carro

export function processoFicha(E, pid) {
  const p = (E.processos || {})[pid];
  if (!p) return '';
  const botao = p.acao.passo === 'cadastro' ? `<button class="primario" data-fa="dados">📝 Completar cadastro</button>`
    : ['midias', 'videos', 'revisao'].includes(p.acao.passo) && !/aguarde/.test(p.acao.texto) ? `<button class="primario" data-fa="criar">${p.acao.passo === 'revisao' ? '👀 Revisar os vídeos' : '🎬 Criar vídeos'}</button>` : '';
  return `<div class="proc-ficha">
    <div class="passos-carro">${p.passos.map((x, i) => `<div class="${x.ok ? 'ok' : p.acao.passo === x.id ? 'agora' : ''}"><span>${x.ok ? '✓' : i + 1}</span>${PASSOS[i]}</div>`).join('')}</div>
    <div class="prox-acao"><div><small>Próximo passo</small><b>${esc(p.acao.texto)}</b></div>${botao}</div></div>`;
}

export function ligarProcessoFicha(E, ctx) {
  $('#cal-corpo').querySelectorAll('[data-pacote]').forEach((b) => (b.onclick = () => criarPacote(b.dataset.pacote, ctx)));
}

export { abrirNoEstudio };
