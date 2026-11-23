// Setor de Conteúdo & Visual da TopCar: produção, pautas, quadros fixos, resultados, anúncios,
// atendimento (WhatsApp), inteligência de mercado, identidade visual e integrações (Meta / WhatsApp Cloud API).
import { api, esc, toast, modal } from './estado.js';

const $ = (s, r = document) => r.querySelector(s);
const TIPOS = { Stories: '📱', Reels: '🎬', 'Anúncio': '📣', 'Gravação': '🎥' };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
const nomeCarro = (f) => [f.carro?.marca, f.carro?.modelo, f.carro?.versao, f.carro?.ano].filter(Boolean).join(' ') || f.nome;
const curto = (f) => [f.carro?.modelo, f.carro?.ano].filter(Boolean).join(' ') || f.nome;
const num = (v) => (Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0);
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',')} mil` : String(Math.round(n)));
const txt = (x) => (typeof x === 'string' ? x : Object.values(x || {}).filter((v) => typeof v === 'string').join(' — '));
const lista = (arr) => `<ul>${(arr || []).map((x) => `<li>${esc(txt(x))}</li>`).join('')}</ul>`;
const soDigitos = (s) => String(s || '').replace(/\D/g, '');

/** Carrega o que os módulos do setor precisam (além de calendário e estoque). */
export async function carregarSetor(E) {
  const pega = (url, padrao) => api(url).catch(() => padrao);
  [E.pautas, E.leads, E.marca, E.refs, E.integ, E.conteudos, E.rotina] = await Promise.all([
    pega('/api/pautas', []), pega('/api/leads', []), pega('/api/marca', {}), pega('/api/referencias', []), pega('/api/integracoes', {}),
    pega('/api/conteudos', []), pega('/api/rotina', {}),
  ]);
  E.topcrm = await pega('/api/topcrm', {});
  E.nuvem = await pega('/api/nuvem', {});
  E.portais = await pega('/api/portais', []);
  E.dia = await pega('/api/dia', {});
}

// ---------------------------------------------------------------- Produção (esteira: pauta → gravar → roteiro → revisar → pronto → postado)

const ST_C = {
  rascunho: ['Rascunho', 'cinza'], roteiro: ['Roteiro pronto', 'azul'], montado: ['Para revisar', 'amarelo'],
  aprovado: ['Aprovado', 'verde'], pronto: ['Vídeo pronto', 'verde'], postado: ['Postado', 'cinza'],
};
const IC = { Reels: '🎬', Stories: '📱', 'Anúncio': '📣', 'Gravação': '🎥' };

/** Abre um conteúdo no estúdio (fecha o setor). */
export async function abrirNoEstudio(pid, cid) {
  $('#calendario').hidden = true;
  await window.estudio.abrirConteudo(pid, cid);
}

function renderProducao(E) {
  const porId = Object.fromEntries(E.estoque.map((f) => [f.id, f]));
  const conts = E.conteudos || [];
  const ligadas = new Set(conts.map((c) => c.entrada).filter(Boolean));
  const col = { pauta: [], gravar: [], roteiro: [], revisar: [], pronto: [], postado: [] };
  for (const p of E.pautas.filter((x) => ['nova', 'aprovada'].includes(x.status) && !x.conteudo)) col.pauta.push({ pauta: p });
  const agenda = E.cal.filter((e) => e.status !== 'cancelado' && ['Stories', 'Reels', 'Anúncio'].includes(e.tipo) && e.data >= addDias(-7) && e.data <= addDias(14));
  for (const e of agenda) {
    if (ligadas.has(e.id) || e.conteudo) continue;
    if (e.status === 'postado') { if (e.data >= addDias(-7)) col.postado.push({ e }); continue; }
    if (e.arquivo) { col.pronto.push({ e }); continue; }
    const f = porId[e.projeto];
    if (f && (!f.takes?.total || ['cadastrar', 'pre_roteiro', 'gravar'].includes(f.etapa))) col.gravar.push({ e, motivo: 'carro sem takes' });
    else col.roteiro.push({ e, aCriar: true });
  }
  for (const c of conts) {
    if (c.status === 'postado') { if ((c.data || '') >= addDias(-7)) col.postado.push({ c }); continue; }
    if (['pronto'].includes(c.status) || c.arquivo) col.pronto.push({ c });
    else if (['montado', 'aprovado'].includes(c.status)) col.revisar.push({ c });
    else col.roteiro.push({ c });
  }
  const data = (x) => x.c?.data || x.e?.data || '9';
  Object.values(col).forEach((l) => l.sort((a, b) => String(data(a)).localeCompare(String(data(b)))));
  const nomes = { pauta: ['💡', 'Pautas aprovadas'], gravar: ['🎥', 'Gravar takes'], roteiro: ['🧠', 'Roteiro / montagem'], revisar: ['👀', 'Revisar falas'], pronto: ['✅', 'Pronto p/ postar'], postado: ['📤', 'Postado (7 dias)'] };
  const atrasado = (d) => d && d < iso(new Date());
  const card = (x) => {
    if (x.pauta) {
      return `<div class="peca"><div class="peca-topo"><span>${IC[x.pauta.tipo] || ''} ${esc(x.pauta.tipo)}</span>${x.pauta.quadro && x.pauta.quadro !== 'Avulso' ? `<span class="selo">${esc(x.pauta.quadro)}</span>` : ''}</div>
        <b>${esc(x.pauta.titulo)}</b><div class="muted">${esc(x.pauta.carro || 'Geral')}</div>
        <div class="acoes"><button class="mini primario" data-ir="pautas">🎬 Produzir</button></div></div>`;
    }
    if (x.c) {
      const c = x.c, [st, cor] = ST_C[c.status] || [c.status, ''];
      return `<div class="peca ${atrasado(c.data) && c.status !== 'postado' && !c.arquivo ? 'atrasada' : ''}">
        <div class="peca-topo"><span>${IC[c.tipo] || ''} ${c.data ? dm(c.data) : 'sem data'}</span><span class="st ${cor}">${st}</span></div>
        <b>${esc(c.titulo || c.tipo)}</b><div class="muted">${esc(c.carro || '')}${c.etapa ? ` · ⏳ ${esc(c.etapa)}` : ''}</div>
        <div class="acoes"><button class="mini primario" data-estudio="${c.projeto}|${c.id}">${c.status === 'montado' ? '👀 Revisar' : c.arquivo ? '▶ Ver' : '🎬 Abrir'}</button>
          ${c.arquivo ? `<a class="btn mini" href="${esc(c.arquivo)}" download>⬇</a>` : ''}</div></div>`;
    }
    const e = x.e;
    return `<div class="peca ${atrasado(e.data) && e.status !== 'postado' ? 'atrasada' : ''}">
      <div class="peca-topo"><span>${IC[e.tipo] || ''} ${dm(e.data)} ${esc(e.hora || '')}</span><span class="st">${x.motivo ? 'gravar' : x.aCriar ? 'a criar' : e.status}</span></div>
      <b>${esc(e.titulo || '')}</b><div class="muted">${esc(e.carro || 'Geral')}${x.motivo ? ` · ${x.motivo}` : ''}</div>
      <div class="acoes">${e.projeto ? (x.motivo ? `<button class="mini" data-ficha="${e.projeto}">📁 Enviar takes</button>` : `<button class="mini primario" data-criar="${e.id}">🎬 Criar vídeo</button>`) : '<button class="mini" data-cal="' + e.id + '">✎ Ligar a um carro</button>'}
        ${e.arquivo ? `<a class="btn mini" href="${esc(e.arquivo)}" download>⬇</a>` : ''}</div></div>`;
  };
  const comRoteiro = conts.filter((c) => c.status === 'roteiro').length;
  return `
    <div class="setor-cab"><div></div><div class="acoes">
      ${comRoteiro ? `<button class="primario" id="pr-fabrica">▶ Montar os ${comRoteiro} vídeos com roteiro pronto</button>` : ''}
      <button id="pr-rotina" title="Completa a agenda, cria os conteúdos de hoje e amanhã com roteiro e narração, e repõe as pautas">🤖 Rodar a rotina do dia</button></div></div>
    <div class="kanban k6">${Object.entries(col).map(([k, itens]) => `<div class="kanban-col"><h3>${nomes[k][0]} ${nomes[k][1]} <span class="status">${itens.length}</span></h3>${itens.map(card).join('') || '<p class="muted">—</p>'}</div>`).join('')}</div>`;
}

function ligarProducao(E, ctx) {
  const box = $('#cal-corpo');
  if ($('#pr-fabrica')) $('#pr-fabrica').onclick = () => fabrica(ctx);
  if ($('#pr-rotina')) $('#pr-rotina').onclick = () => rodarRotina(ctx);
}

export async function fabrica(ctx) {
  $('#calendario').hidden = true;
  try {
    const n = await window.estudio.produzirPendentes((txt, p) => modal('🏭 Fábrica de vídeos', txt, 0.1 + p * 0.85));
    modal(null);
    toast(n ? `${n} vídeos montados — estão em "Revisar falas".` : 'Nada para montar agora.');
  } catch (e) { modal(null); toast(e.message, true); }
  $('#calendario').hidden = false;
  await ctx.recarregar();
}

export async function rodarRotina(ctx) {
  await api('/api/rotina/rodar', { method: 'POST' });
  toast('🤖 Rotina rodando em segundo plano: agenda, roteiros, narrações e pautas. Acompanhe na tela Hoje.');
  const vigia = setInterval(async () => {
    const r = await api('/api/rotina').catch(() => ({}));
    if (!r.rodando) { clearInterval(vigia); await ctx.recarregar(); toast('🤖 Rotina do dia concluída.'); }
  }, 8000);
}

// ---------------------------------------------------------------- Ficha do carro (dados + mídias + conteúdos + agenda)

const CAMPOS_CARRO = [
  ['placa', 'Placa'], ['marca', 'Marca'], ['modelo', 'Modelo'], ['versao', 'Versão / motor'], ['ano', 'Ano'], ['preco', 'Preço à vista'], ['km', 'Quilometragem'],
  ['cor', 'Cor'], ['cambio', 'Câmbio'], ['combustivel', 'Combustível'], ['fipe', 'Valor FIPE'], ['entrada', 'Entrada'], ['parcela', 'Parcela (valor x meses)'],
];
const CAMPOS_LONGOS = [['diferenciais', 'Opcionais e diferenciais (um por linha)'], ['procedencia', 'Procedência (único dono, revisões, laudo, garantia)'], ['condicoes', 'Condição especial / urgência real'], ['observacoes', 'Observações para a IA (o que destacar, o que evitar)']];

export async function carregarFicha(E, pid) {
  const [proj, conts] = await Promise.all([api(`/api/projetos/${pid}`), api(`/api/projetos/${pid}/conteudos`).catch(() => [])]);
  E.ficha = { id: pid, proj, conts };
}

function renderFicha(E) {
  const { proj: p, conts } = E.ficha;
  const f = E.estoque.find((x) => x.id === p.id) || {};
  const c = p.carro || {};
  const takes = p.takes || [];
  const aba = ['dados', 'midias', 'agenda', 'criar'].includes(E.fichaAba) ? E.fichaAba : 'criar';
  const agenda = E.cal.filter((e) => e.projeto === p.id && e.status !== 'cancelado').sort((a, b) => a.data.localeCompare(b.data));
  const nome = [c.marca, c.modelo, c.versao, c.ano].filter(Boolean).join(' ') || p.nome;
  const trab = (t) => ['na fila', 'processando', 'analisando'].includes(t.status);
  const pre = p.prerroteiro;
  return `
    <button class="link" data-voltar>← Estoque</button>
    <section class="ficha-cab">
      ${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : '<div class="sem-foto">📷</div>'}
      <div><h2>${esc(nome)}</h2>
        <p>${c.preco ? `<b>R$ ${esc(c.preco)}</b>` : 'sem preço'}${c.km ? ` · ${esc(c.km)} km` : ''}${c.cor ? ` · ${esc(c.cor)}` : ''} · ${f.dias_no_estoque ?? 0} ${f.dias_no_estoque === 1 ? 'dia' : 'dias'} no pátio</p>
        <div class="hero-mini"><span>🎞 <b>${takes.length}</b> takes</span><span>🎬 <b>${conts.length}</b> conteúdos</span><span>✅ <b>${conts.filter((x) => x.arquivo).length}</b> vídeos prontos</span><span>📅 <b>${agenda.filter((e) => e.data >= iso(new Date())).length}</b> posts agendados</span></div></div>
      <div class="ficha-acoes">
        <select class="mini-sel" data-venda="${p.id}">${[['disponivel|Recife', '🟢 Em loja — Recife'], ['disponivel|Olinda', '🟢 Em loja — Olinda'], ['preparacao|', '🔧 Em preparação'], ['reservado|', '🟡 Reservado'], ['vendido|', '🏁 Vendido']]
          .map(([v, n]) => { const [s, u] = v.split('|'); const at = (p.estoque?.status || 'disponivel') === s && (s !== 'disponivel' || (p.estoque?.unidade || p.topcrm?.unidade || 'Recife') === u); return `<option value="${v}" ${at ? 'selected' : ''}>${n}</option>`; }).join('')}</select>
        ${c.placa ? `<div class="placa-grande">${esc(c.placa)}</div>` : ''}
      </div>
    </section>
    <div class="subabas">${[['criar', `🎬 Criar vídeos (${conts.length})`], ['midias', `🎞 Vídeos (${takes.length})`], ['fotos', `📷 Fotos (${f.fotos || 0})`], ['dados', '📋 Dados do carro'], ['agenda', `📅 Agenda (${agenda.length})`]].map(([k, n]) => `<button data-fa="${k}" class="${aba === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    ${aba === 'dados' ? `
      <div class="card ficha-form">
        <div class="grade-campos">${CAMPOS_CARRO.map(([k, n]) => `<label>${n}<input data-cc="${k}" value="${esc(c[k] || '')}"></label>`).join('')}</div>
        <div class="linha2" style="margin:8px 0"><label class="chk"><input type="checkbox" data-cb="aceita_troca" ${c.aceita_troca ? 'checked' : ''}> Aceita troca</label><label class="chk"><input type="checkbox" data-cb="financia" ${c.financia ? 'checked' : ''}> Financia</label></div>
        ${CAMPOS_LONGOS.map(([k, n]) => `<label>${n}<textarea data-cc="${k}" rows="${k === 'diferenciais' ? 4 : 2}">${esc(c[k] || '')}</textarea></label>`).join('')}
        <div class="acoes"><button class="primario" id="fc-salvar">💾 Salvar dados</button><span class="muted">A IA usa só o que está aqui: quanto mais completo, melhor o roteiro.</span></div>
      </div>
      ${!p.ficha_versao?.itens_serie?.length ? `<div class="dica">📘 <b>Ficha da versão:</b> a IA pesquisa na web os itens de série desta versão (com as fontes) — eles viram opcionais e fatos verdadeiros nos roteiros. <button class="mini destaque" data-pesq-ficha>📘 Pesquisar ficha da versão</button></div>` : ''}
      ${p.ficha_versao?.itens_serie?.length ? `<div class="card"><b>📘 Ficha da versão</b> <button class="mini" data-pesq-ficha style="float:right">↻ Pesquisar de novo</button> <span class="muted">(${esc(p.ficha_versao.versao_confirmada || '')} — itens de série pesquisados, usados como fatos verdadeiros)</span>
        <p class="muted" style="font-size:12px">${esc([p.ficha_versao.motor, p.ficha_versao.cambio].filter(Boolean).join(' · '))}</p><ul class="itens-ficha">${p.ficha_versao.itens_serie.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${(p.ficha_versao.fontes || []).length ? `<small class="muted">Fontes: ${p.ficha_versao.fontes.map((x) => `<a href="${esc(x.url)}" target="_blank">${esc(x.titulo)}</a>`).join(' · ')}</small>` : ''}</div>` : ''}
      <div class="card"><b>🌐 Portais</b> <span class="muted">— marque onde o carro está anunciado e cole o link. Sem fotos não posta; vendido sai de todos.</span>
        <div class="portais">${(E.portais || []).filter((x) => x.ativo !== false).map((x) => { const r = (p.portais || {})[x.id] || {}; return `<div class="portal ${r.postado ? 'on' : ''}" data-portal="${x.id}">
          <label class="chk"><input type="checkbox" ${r.postado ? 'checked' : ''}> <b>${esc(x.nome)}</b></label>
          <input type="url" placeholder="link do anúncio" value="${esc(r.link || '')}">${r.link ? `<a class="btn mini" href="${esc(r.link)}" target="_blank">↗</a>` : ''}
          <small class="muted">${r.postado && r.data ? `desde ${new Date(r.data * 1000).toLocaleDateString('pt-BR')}` : r.removido ? `retirado ${new Date(r.removido * 1000).toLocaleDateString('pt-BR')}` : 'não postado'}</small></div>`; }).join('')}</div></div>` : ''}
    ${aba === 'midias' ? `
      <div class="soltar" id="fc-soltar">⬆ <b>Arraste os takes deste carro aqui</b> ou clique para escolher (MP4, MOV — vários de uma vez)<input type="file" id="fc-arq" accept="video/*" multiple hidden></div>
      <p class="muted" style="font-size:12px">Cada take é estabilizado (se tremer), tem a cor corrigida e é assistido pela IA, que marca os melhores trechos. Grave em 60 fps para câmera lenta suave.</p>
      ${pre?.takes?.length ? `<div class="card"><b>🧭 Lista do que gravar (pré-roteiro)</b><ol class="lista-grav">${pre.takes.map((t) => `<li><b>${esc(t.nome || '')}</b> <span class="muted">${esc(t.como_gravar || t.descricao || '')}</span></li>`).join('')}</ol></div>`
        : `<div class="dica">Antes de gravar, gere a lista de takes: <button class="mini destaque" id="fc-pre">🧭 O que gravar deste carro</button></div>`}
      <div class="grade-takes">${takes.map((t) => `<div class="take-card">
        ${t.thumb ? `<img src="/media/${p.id}/${esc(t.thumb)}" alt="">` : '<div class="sem-foto">⏳</div>'}
        <div class="take-info"><b title="${esc(t.nome)}">${esc(t.nome)}</b>
          <span class="muted">${t.dur ? `${t.dur.toFixed(1)}s` : ''} ${trab(t) ? `· ⏳ ${esc(t.etapa || t.status)}` : ''}</span>
          <span>${t.tratado ? '<span class="st verde">✨ tratado</span>' : ''} ${t.estabilizado ? '<span class="st verde">🎯 estabilizado</span>' : ''} ${t.analise ? '<span class="st azul">🤖 analisado</span>' : ''}</span>
          ${t.analise?.resumo ? `<small class="muted">${esc(t.analise.resumo.slice(0, 110))}</small>` : ''}
          <button class="mini perigo" data-apagar-take="${t.id}">Apagar</button></div></div>`).join('') || '<p class="muted">Nenhuma mídia ainda.</p>'}</div>` : ''}
    ${aba === 'criar' ? renderCriar(E) : ''}
    ${aba === 'agenda' ? `<div class="card"><table class="tab"><tr><th>Data</th><th>Tipo</th><th>Post</th><th>Status</th><th></th></tr>
      ${agenda.map((e) => `<tr><td>${dm(e.data)} ${esc(e.hora || '')}</td><td>${IC[e.tipo] || ''} ${esc(e.tipo)}</td><td>${esc(e.titulo || '')}</td><td>${esc(e.status)}</td>
        <td>${e.conteudo ? `<button class="mini" data-estudio="${p.id}|${e.conteudo}">🎬 Conteúdo</button>` : ['Stories', 'Reels', 'Anúncio'].includes(e.tipo) && e.status !== 'postado' ? `<button class="mini primario" data-criar="${e.id}">🎬 Criar vídeo</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nada agendado para este carro. A rotina diária inclui os carros do estoque no planejamento.</td></tr>'}</table></div>` : ''}`;
}

function renderCriar(E) {
  const { proj: p, conts } = E.ficha;
  const takes = (p.takes || []).filter((t) => t.proxy);
  const trab = (p.takes || []).some((t) => ['na fila', 'processando', 'analisando'].includes(t.status));
  const pre = p.prerroteiro;
  const gravados = new Set((p.takes || []).map((t) => t.analise?.take_planejado).filter(Boolean));
  const anuncios = conts.filter((c) => c.origem === 'anuncio_ab');
  const semTakes = !takes.length;
  return `
    ${semTakes ? `<div class="aviso-carro">📷 <div><b>Este carro ainda não tem takes.</b><br>Para <b>Stories</b> e <b>anúncios</b>, envie os takes que você já tem. Para o <b>Reels</b>, gere primeiro o roteiro de gravação (card do meio) e grave seguindo a lista.</div><button class="primario" data-fa="midias">⬆ Enviar takes</button></div>` : ''}
    ${trab ? '<div class="dica">⏳ Takes sendo estabilizados e analisados pela IA — os vídeos ficam melhores se você esperar terminar.</div>' : ''}
    <div class="criar-grade">
      <div class="criar-card">
        <div class="cc-topo"><span>📱</span><div><h3>Stories</h3><small>12–18 s · feito com os takes que já existem</small></div></div>
        <p>A IA escolhe os melhores trechos, escreve e narra as falas, coloca preço e chamada para o WhatsApp.</p>
        <button class="primario grande" data-criar-stories ${semTakes ? 'disabled title="Envie os takes primeiro"' : ''}>📱 Criar Stories</button>
      </div>
      <div class="criar-card destaque-card">
        <div class="cc-topo"><span>🎬</span><div><h3>Reels</h3><small>roteiro → gravação → montagem</small></div></div>
        <ol class="etapas-reels">
          <li class="${pre ? 'ok' : 'agora'}"><b>1. Roteiro e lista de takes</b>
            ${pre ? `<div class="pre-resumo"><b>${esc(pre.titulo || '')}</b><small>🎣 ${esc(pre.gancho || '')}</small></div>
              <details><summary>Ver os ${pre.takes?.length || 0} takes e as falas</summary><ol class="lista-grav">${(pre.takes || []).map((t) => `<li class="${gravados.has(t.n) ? 'gravado' : ''}">${gravados.has(t.n) ? '✅' : '⬜'} <b>${esc(t.nome || '')}</b> <span class="muted">${esc(t.o_que_gravar || '')}${t.segundos ? ` · ${t.segundos}s` : ''}</span>${t.fala ? `<div class="fala-take">🗣 “${esc(t.fala)}”</div>` : ''}</li>`).join('')}</ol>
              ${(pre.narracao_off || []).length ? `<div class="fala-take">🎙 Narração: ${esc(pre.narracao_off.join(' '))}</div>` : ''}</details>
              <div class="acoes"><button class="mini" data-copiar-pre>📋 Copiar para o time</button><button class="mini" data-outro-pre>🎲 Outra ideia</button></div>`
            : `<div class="form-pre"><label>Quem aparece<select id="cr-quem"><option value="apresentador">🧑‍💼 Apresentador falando</option><option value="off">🎙 Só o carro + narração</option></select></label>
              <label>Ideia do time (opcional)<textarea id="cr-ideia" rows="2" placeholder="Ex.: mostrar que cabe a família toda; comparar com o Creta…"></textarea></label>
              <button class="primario" data-gerar-pre>🧭 Gerar roteiro de gravação</button></div>`}</li>
          <li class="${pre && gravados.size ? 'ok' : pre ? 'agora' : ''}"><b>2. Gravar e subir os takes</b>
            <small>${pre ? `${gravados.size} de ${pre.takes?.length || 0} takes do roteiro já gravados` : 'depois do roteiro'}</small>
            ${pre ? '<button class="mini" data-fa="midias">⬆ Subir takes gravados</button>' : ''}</li>
          <li class="${pre && takes.length ? 'agora' : ''}"><b>3. Montar o Reels</b>
            <button class="primario" data-criar-reels ${!takes.length ? 'disabled title="Suba os takes primeiro"' : ''}>🎬 Montar o Reels</button></li>
        </ol>
      </div>
      <div class="criar-card">
        <div class="cc-topo"><span>📣</span><div><h3>Anúncios A/B/C</h3><small>3 criativos para teste no Meta Ads</small></div></div>
        <ul class="ab">${['A — Oferta direta: preço e condição nos 2 primeiros segundos', 'B — Prova e confiança: km, laudo e detalhes antes do preço', 'C — Desejo: edição cinematográfica, emoção e estilo de vida'].map((x) => `<li>${x}</li>`).join('')}</ul>
        ${anuncios.length ? `<div class="muted" style="font-size:12px">${anuncios.length} criativos criados — veja abaixo.</div>` : ''}
        <button class="primario grande" data-criar-anuncios ${semTakes ? 'disabled title="Envie os takes primeiro"' : ''}>📣 ${anuncios.length ? 'Criar mais 3' : 'Criar os 3 anúncios'}</button>
      </div>
    </div>
    <h2 class="sec">Vídeos deste carro</h2>
    <div class="lista-conteudos">${conts.map((x) => { const [st, cor] = ST_C[x.status] || [x.status, '']; return `<div class="card linha-conteudo">
      <span class="ic">${IC[x.tipo] || ''}</span><div><b>${esc(x.titulo || x.tipo)}</b><div class="muted">${x.tipo}${x.teste ? ` · teste ${x.teste}` : ''}${x.data ? ` · posta ${dm(x.data)}` : ''}${x.etapa ? ` · ⏳ ${esc(x.etapa)}` : ''}${x.erro ? ` · <span class="txt-erro">${esc(x.erro.slice(0, 60))}</span>` : ''}</div></div>
      <span class="st ${cor}">${st}</span>
      <div class="acoes"><button class="mini primario" data-estudio="${p.id}|${x.id}">${x.status === 'montado' ? '👀 Revisar' : x.arquivo ? '▶ Ver' : '🎬 Abrir'}</button>${x.arquivo ? `<a class="btn mini" href="${esc(x.arquivo)}" download>⬇</a>` : ''}<button class="mini perigo" data-apagar-c="${x.id}">✖</button></div></div>`; }).join('') || '<p class="muted">Nenhum vídeo deste carro ainda.</p>'}</div>`;
}

function ligarFicha(E, ctx) {
  const box = $('#cal-corpo');
  const pid = E.ficha.id;
  const q = (s) => $(s, box);
  box.querySelector('[data-voltar]').onclick = () => { E.carroSel = null; E.ficha = null; ctx.render(); };
  box.querySelectorAll('[data-fa]').forEach((b) => (b.onclick = () => {
    if (b.dataset.fa === 'fotos') { E.aba = 'fotos'; E.midiaCarro = pid; E.midiaDados = null; E.carroSel = null; E.ficha = null; ctx.render(); return; }
    E.fichaAba = b.dataset.fa; ctx.render();
  }));
  box.querySelectorAll('[data-venda]').forEach((s) => (s.onchange = async () => {
    const [status, unidade] = s.value.split('|');
    await api(`/api/estoque/${pid}`, { method: 'PUT', json: { status, ...(unidade ? { unidade } : {}) } });
    toast(status === 'vendido' ? 'Vendido! 🏁 Postagens futuras canceladas e anúncio retirado de todos os portais.' : 'Status atualizado.'); await ctx.recarregar();
  }));
  box.querySelectorAll('[data-portal]').forEach((el) => {
    const id = el.dataset.portal;
    const enviar = async (corpo) => { try { await api(`/api/projetos/${pid}/portais/${id}`, { method: 'PUT', json: corpo }); toast('Portal atualizado.'); await ctx.recarregar(); } catch (e) { toast(e.message, true); ctx.render(); } };
    el.querySelector('input[type=checkbox]').onchange = (ev) => enviar({ postado: ev.target.checked });
    el.querySelector('input[type=url]').onchange = (ev) => enviar({ link: ev.target.value });
  });
  box.querySelectorAll('[data-pesq-ficha]').forEach((b) => (b.onclick = async () => {
    modal('📘 Ficha da versão', 'Pesquisando as fichas técnicas na web e extraindo só os itens de série desta versão…', 0.4);
    try { const f = await api(`/api/projetos/${pid}/ficha`, { method: 'POST' }); modal(null); toast(`Ficha: ${f.versao_confirmada} — ${f.itens_serie.length} itens (confiança ${f.confianca}).`); await ctx.recarregar(); }
    catch (e) { modal(null); toast(e.message, true); }
  }));
  if (q('#fc-salvar')) q('#fc-salvar').onclick = async () => {
    const carro = { ...(E.ficha.proj.carro || {}) };
    box.querySelectorAll('[data-cc]').forEach((i) => { carro[i.dataset.cc] = i.value.trim(); });
    box.querySelectorAll('[data-cb]').forEach((i) => { carro[i.dataset.cb] = i.checked; });
    const nome = [carro.marca, carro.modelo, carro.ano].filter(Boolean).join(' ');
    await api(`/api/projetos/${pid}`, { method: 'PUT', json: { carro, ...(nome ? { nome } : {}) } });
    toast('Dados do carro salvos ✔'); await ctx.recarregar();
  };
  if (q('#fc-soltar')) {
    const zona = q('#fc-soltar'), inp = q('#fc-arq');
    const enviar = async (files) => {
      if (!files?.length) return;
      const fd = new FormData(); for (const f of files) fd.append('arquivos', f);
      toast(`Enviando ${files.length} take(s)…`);
      await api(`/api/projetos/${pid}/takes`, { method: 'POST', body: fd });
      toast('Enviado! Tratando e analisando os takes…'); await ctx.recarregar();
    };
    zona.onclick = () => inp.click(); inp.onchange = () => enviar(inp.files);
    zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('sobre'); };
    zona.ondragleave = () => zona.classList.remove('sobre');
    zona.ondrop = (e) => { e.preventDefault(); zona.classList.remove('sobre'); enviar(e.dataTransfer.files); };
  }
  if (q('#fc-pre')) q('#fc-pre').onclick = async () => {
    modal('🧭 Planejando a gravação', 'A IA está definindo os takes que valorizam este carro…', 0.4);
    try { await api(`/api/projetos/${pid}/prerroteiro`, { json: {} }); modal(null); await ctx.recarregar(); } catch (e) { modal(null); toast(e.message, true); }
  };
  box.querySelectorAll('[data-apagar-take]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Apagar este take?')) return;
    await api(`/api/projetos/${pid}/takes/${b.dataset.apagarTake}`, { method: 'DELETE' }); await ctx.recarregar();
  }));
  const abrirEGerar = async (c) => { await abrirNoEstudio(pid, c.id); await window.estudio.gerarConteudo(); };
  if (q('[data-criar-stories]')) q('[data-criar-stories]').onclick = async () => abrirEGerar(await api(`/api/projetos/${pid}/stories`, { json: {} }));
  if (q('[data-criar-reels]')) q('[data-criar-reels]').onclick = async () => abrirEGerar(await api(`/api/projetos/${pid}/reels`, { json: {} }));
  if (q('[data-criar-anuncios]')) q('[data-criar-anuncios]').onclick = async (ev) => {
    ev.target.disabled = true;
    await api(`/api/projetos/${pid}/anuncios`, { json: {} });
    toast('📣 3 anúncios na fila: a IA escreve e narra cada abordagem (alguns minutos). Eles aparecem em "Vídeos deste carro".');
    await ctx.recarregar();
  };
  const gerarPre = async (corpo) => {
    modal('🧭 Roteiro de gravação', 'A IA está criando o roteiro do Reels: gancho, falas e a lista de takes para gravar…', 0.4);
    try { await api(`/api/projetos/${pid}/prerroteiro`, { json: corpo }); modal(null); await ctx.recarregar(); } catch (e) { modal(null); toast(e.message, true); }
  };
  if (q('[data-gerar-pre]')) q('[data-gerar-pre]').onclick = () => gerarPre({ quem: q('#cr-quem').value, ideia: q('#cr-ideia').value.trim() });
  if (q('[data-outro-pre]')) q('[data-outro-pre]').onclick = () => gerarPre({});
  if (q('[data-copiar-pre]')) q('[data-copiar-pre]').onclick = () => {
    const pr = E.ficha.proj.prerroteiro;
    const t = `${pr.titulo}\nGancho: ${pr.gancho}\n\nTAKES:\n${(pr.takes || []).map((x) => `${x.n}. ${x.nome} — ${x.o_que_gravar} (${x.segundos || '?'}s)${x.fala ? `\n   FALA: "${x.fala}"` : ''}`).join('\n')}${(pr.narracao_off || []).length ? `\n\nNARRAÇÃO: ${pr.narracao_off.join(' ')}` : ''}`;
    navigator.clipboard.writeText(t).then(() => toast('Roteiro copiado — mande para quem vai gravar.'));
  };
  box.querySelectorAll('[data-apagar-c]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Apagar este conteúdo?')) return;
    await api(`/api/projetos/${pid}/conteudos/${b.dataset.apagarC}`, { method: 'DELETE' }); await ctx.recarregar();
  }));
  ligarProducao(E, ctx);
  if (E.ficha.proj.takes?.some((t) => ['na fila', 'processando', 'analisando'].includes(t.status))) {
    clearTimeout(E.vigiaFicha);
    E.vigiaFicha = setTimeout(() => { if (E.aba === 'estoque' && E.carroSel === pid && !$('#calendario').hidden) ctx.recarregar(); }, 5000);
  }
}

// ---------------------------------------------------------------- Dia a dia (entretenimento e relacionamento)

const DIN = { enquete: '📊 Enquete', quiz: '❓ Quiz', caixa_perguntas: '💬 Caixa de perguntas', este_ou_aquele: '⚖ Este ou aquele', adivinhe_preco: '💰 Adivinhe o preço', contagem: '⏳ Contagem', bastidores: '🎬 Bastidores', voce_sabia: '💡 Você sabia?' };

function renderDia(E) {
  const d = E.dia || {};
  const hoje = iso(new Date());
  const atual = d.data === hoje;
  return `
    <div class="cat-barra"><div class="muted">${d.data ? (atual ? 'Gerado hoje pela rotina das 6h.' : `Última geração: ${dm(d.data)}.`) : 'Ainda não gerado.'} Os carros do estoque são o cenário de tudo.</div>
      <div class="acoes"><button class="primario" id="dia-gerar">🎉 ${d.data ? 'Gerar novas dinâmicas' : 'Gerar as dinâmicas de hoje'}</button></div></div>
    <h2 class="sec">Dinâmicas de Stories para hoje</h2>
    <div class="dia-grade">${(d.dinamicas || []).map((x) => `<div class="card dinamica">
      <div class="peca-topo"><span class="selo">${DIN[x.dinamica] || x.dinamica}</span><span>🕐 ${esc(x.horario || '')}</span></div>
      <h3>${esc(x.titulo)}</h3><div class="muted">🚗 ${esc(x.carro || 'Geral')} · ${esc(x.objetivo || '')}</div>
      <ol class="telas">${(x.telas || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      <div class="sticker">📌 <b>${esc(x.sticker_tipo || '')}</b>: ${esc(x.sticker_texto || '')}${(x.sticker_opcoes || []).length ? ` <span class="muted">(${x.sticker_opcoes.map(esc).join(' / ')})</span>` : ''}</div>
      <div class="acoes"><button class="mini primario" data-dia-story="${x.id}" ${x.projeto ? '' : 'disabled'}>🎬 Criar o story</button><button class="mini" data-dia-copiar="${x.id}">📋 Copiar</button></div></div>`).join('') || '<p class="muted">Clique em gerar.</p>'}</div>
    <h2 class="sec">Reels elaborados (gravar hoje)</h2>
    <div class="dia-grade">${(d.reels || []).map((x) => `<div class="card dinamica">
      <div class="peca-topo"><span class="selo">🎬 ${esc(x.formato || 'Reels')}</span><span>🚗 ${esc(x.carro || 'Geral')}</span></div>
      <h3>${esc(x.titulo)}</h3><p>${esc(x.conceito || '')}</p><div class="gancho">🎣 “${esc(x.gancho || '')}”</div>
      <details><summary>Falas (${(x.falas || []).length}) e takes (${(x.takes || []).length})</summary><b>Falas</b><ol class="telas">${(x.falas || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ol><b>Takes</b><ol class="telas">${(x.takes || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></details>
      <small class="muted">📈 ${esc(x.por_que || '')}</small>
      <div class="acoes"><button class="mini primario" data-dia-reels="${x.id}" ${x.projeto ? '' : 'disabled'}>🎥 Gravar este Reels</button><button class="mini" data-dia-copiar="${x.id}">📋 Copiar</button></div></div>`).join('')}</div>`;
}

function ligarDia(E, ctx) {
  const box = $('#cal-corpo');
  const acha = (id) => [...(E.dia?.dinamicas || []), ...(E.dia?.reels || [])].find((x) => x.id === id);
  $('#dia-gerar').onclick = async () => {
    modal('🎉 Dia a dia', 'A IA está criando as dinâmicas de Stories e as ideias de Reels de hoje…', 0.4);
    try { E.dia = await api('/api/dia/gerar', { json: {} }); modal(null); ctx.render(); } catch (e) { modal(null); toast(e.message, true); }
  };
  box.querySelectorAll('[data-dia-copiar]').forEach((b) => (b.onclick = () => {
    const x = acha(b.dataset.diaCopiar);
    const t = x.telas ? `${x.titulo}\n${(x.telas || []).map((y, i) => `Tela ${i + 1}: ${y}`).join('\n')}\nSticker ${x.sticker_tipo}: ${x.sticker_texto} ${(x.sticker_opcoes || []).join(' / ')}`
      : `${x.titulo}\n${x.conceito}\nGancho: ${x.gancho}\n\nFALAS:\n${(x.falas || []).join('\n')}\n\nTAKES:\n${(x.takes || []).map((y) => `- ${y}`).join('\n')}`;
    navigator.clipboard.writeText(t).then(() => toast('Copiado.'));
  }));
  box.querySelectorAll('[data-dia-story]').forEach((b) => (b.onclick = async () => {
    const x = acha(b.dataset.diaStory);
    const direcao = `STORIES DE DINÂMICA (${DIN[x.dinamica] || x.dinamica}): ${x.titulo}. Objetivo: ${x.objetivo}.\nTelas (use estes textos na tela, nesta ordem): ${(x.telas || []).join(' | ')}\nNarração curta: ${x.fala}\nTermine deixando espaço para o sticker "${x.sticker_tipo}: ${x.sticker_texto}".`;
    const c = await api(`/api/projetos/${x.projeto}/stories`, { json: { titulo: x.titulo, direcao, origem: 'dia' } });
    await abrirNoEstudio(x.projeto, c.id); await window.estudio.gerarConteudo();
  }));
  box.querySelectorAll('[data-dia-reels]').forEach((b) => (b.onclick = async () => {
    const x = acha(b.dataset.diaReels);
    modal('🧭 Roteiro de gravação', 'Transformando a ideia em roteiro com lista de takes para o carro…', 0.4);
    try {
      await api(`/api/projetos/${x.projeto}/prerroteiro`, { json: { quem: /apresentador|especialista|humor|bastidor|tour/i.test(`${x.formato} ${x.conceito}`) ? 'apresentador' : 'off',
        ideia: `${x.titulo}. ${x.conceito}\nGancho: ${x.gancho}\nFalas: ${(x.falas || []).join(' / ')}\nTakes: ${(x.takes || []).join(' / ')}` } });
      modal(null); E.aba = 'estoque'; E.carroSel = x.projeto; E.fichaAba = 'criar'; ctx.recarregar();
    } catch (e) { modal(null); toast(e.message, true); }
  }));
}

// ---------------------------------------------------------------- Plano de social media

function renderSocial(E) {
  const s = E.plano?.social_media;
  if (!s) return '<p class="muted">Plano ainda não carregado.</p>';
  const L = (arr) => `<ul>${(arr || []).map((x) => `<li>${esc(txt(x))}</li>`).join('')}</ul>`;
  return `
    <div class="plano-obj">${esc(s.posicionamento)}</div>
    <h3>Para quem falamos</h3>
    <div class="plano-grade">${s.personas.map((p) => `<div class="card"><b>${esc(p.nome)}</b><p>${esc(p.perfil)}</p><small><b>Dor:</b> ${esc(p.dor)}</small><br><small><b>O que convence:</b> ${esc(p.convence)}</small></div>`).join('')}</div>
    <h3>Tom de voz</h3><div class="card"><p>${esc(s.tom_de_voz.resumo)}</p><div class="linha2"><div><b>✔ Falamos assim</b>${L(s.tom_de_voz.sim)}</div><div><b>✖ Nunca assim</b>${L(s.tom_de_voz.nao)}</div></div></div>
    <h3>Perfil do Instagram</h3>
    <div class="plano-grade"><div class="card"><b>Bio</b><p class="legenda">${esc(s.perfil.bio)}</p></div><div class="card"><b>Destaques fixos</b>${L(s.perfil.destaques)}</div><div class="card"><b>Feed</b>${L(s.perfil.feed)}</div></div>
    <h3>Semana padrão</h3>
    <div class="card"><table class="tab"><tr><th>Dia</th><th>Stories</th><th>Reels / feed</th><th>Anúncios e gestão</th></tr>
      ${s.semana.map((d) => `<tr><td><b>${esc(d.dia)}</b></td><td>${esc(d.stories)}</td><td>${esc(d.reels)}</td><td>${esc(d.gestao)}</td></tr>`).join('')}</table></div>
    <h3>Rotina diária do social media</h3>
    <div class="card"><table class="tab">${s.rotina_diaria.map((r) => `<tr><td style="width:90px"><b>${esc(r.hora)}</b></td><td>${esc(r.tarefa)}</td></tr>`).join('')}</table></div>
    <h3>Padrões obrigatórios de cada formato</h3>
    <div class="plano-grade">${s.formatos.map((f) => `<div class="card"><b>${esc(f.formato)}</b>${L(f.regras)}</div>`).join('')}</div>
    <h3>Comunidade e atendimento</h3><div class="card">${L(s.comunidade)}</div>
    <h3>Datas comerciais</h3>
    <div class="plano-grade">${s.datas.map((d) => `<div class="card"><b>${esc(d.quando)} — ${esc(d.data)}</b><p>${esc(d.acao)}</p></div>`).join('')}</div>
    <h3>Metas mensais</h3>
    <div class="plano-grade">${s.metas.map((m) => `<div class="card"><b>${esc(m.indicador)}</b><p>🎯 ${esc(m.meta)}</p><small>${esc(m.como)}</small></div>`).join('')}</div>
    <h3>Hashtags e localização</h3><div class="card"><p>${esc(s.hashtags.join(' '))}</p><small class="muted">${esc(s.regra_hashtags)}</small></div>
    <h3>Reputação e crise</h3><div class="card">${L(s.crise)}</div>
    <h3>Fluxo de aprovação</h3><div class="card">${L(s.aprovacao)}</div>`;
}

// ---------------------------------------------------------------- Pautas

const ST_PAUTA = { nova: '💡 Nova', aprovada: '✅ Aprovada', agendada: '📅 Agendada', feita: '🏁 Feita', descartada: '✖ Descartada' };

function renderPautas(E) {
  const f = E.filtroPauta || 'abertas';
  const vis = E.pautas.filter((p) => (f === 'abertas' ? ['nova', 'aprovada'].includes(p.status) : f === 'todas' ? p.status !== 'descartada' : p.status === f))
    .sort((a, b) => (a.prioridade || 3) - (b.prioridade || 3));
  const amanha = addDias(1);
  const card = (p) => `<div class="pauta ${p.status}">
    <div class="peca-topo"><span>${TIPOS[p.tipo] || ''} <b>${esc(p.tipo || '')}</b> · ${esc(p.pilar || '')}${p.apresentador ? ' · 🧑‍💼 apresentador' : ' · 🎞 só takes'}</span>
      <span>${p.quadro && p.quadro !== 'Avulso' ? `<span class="selo">${esc(p.quadro)}</span>` : ''} <span class="status ${p.prioridade === 1 ? 'erro' : 'ok'}">P${p.prioridade || 2}</span> <span class="status">${ST_PAUTA[p.status] || p.status}</span></span></div>
    <h3>${esc(p.titulo)}</h3>
    <div class="muted">🚗 ${esc(p.carro || 'Geral')}${p.data ? ` · 📅 ${dm(p.data)}` : ''}</div>
    ${p.gancho ? `<div class="gancho">🎣 “${esc(p.gancho)}”</div>` : ''}
    <p>${esc(p.ideia || '')}</p>
    <details><summary>Roteiro (${(p.roteiro || []).length} batidas) · Takes (${(p.takes || []).length})</summary>
      <div class="linha2"><div><b>Roteiro</b>${lista(p.roteiro)}</div><div><b>Takes para gravar</b>${lista(p.takes)}</div></div>
      ${p.legenda ? `<b>Legenda</b><p class="legenda">${esc(p.legenda)}</p>` : ''}
    </details>
    ${p.cta ? `<div><b>CTA:</b> ${esc(p.cta)}</div>` : ''}
    ${p.por_que ? `<div class="muted" style="font-size:12px">📈 ${esc(p.por_que)}</div>` : ''}
    <div class="acoes">
      ${p.status === 'nova' ? `<button class="mini primario" data-pa-st="${p.id}" data-v="aprovada">✅ Aprovar</button>` : ''}
      ${['nova', 'aprovada'].includes(p.status) ? `<input type="date" class="mini-data" id="pd-${p.id}" value="${amanha}"><button class="mini destaque" data-pa-agendar="${p.id}">📅 Agendar</button>` : ''}
      ${p.conteudo ? `<button class="mini primario" data-estudio="${p.projeto}|${p.conteudo}">🎬 Abrir vídeo</button>`
        : `${p.projeto ? '' : `<select class="mini-sel" id="pc-${p.id}">${E.estoque.filter((f) => f.etapa !== 'vendido' && f.takes?.total).map((f) => `<option value="${f.id}">${esc(curto(f))}</option>`).join('')}</select>`}<button class="mini primario" data-pa-produzir="${p.id}">🎬 Produzir vídeo</button>`}
      <button class="mini" data-pa-copiar="${p.id}">📋 Copiar</button>
      ${p.status !== 'descartada' ? `<button class="mini perigo" data-pa-st="${p.id}" data-v="descartada">✖</button>` : ''}
    </div></div>`;
  return `
    <div class="setor-cab"><div></div></div>
    <div class="cal-barra">
      <input id="pa-pedido" placeholder="Direcione a IA (opcional): ex. foco nos SUVs, campanha de fim de ano, carros até 60 mil…" style="flex:1;min-width:280px">
      <select id="pa-qtd"><option>6</option><option selected>10</option><option>15</option></select>
      <button id="pa-gerar" class="destaque">🧠 Gerar pautas</button>
      <button id="pa-nova">＋ Manual</button>
    </div>
    <div class="cal-barra">${[['abertas', 'Abertas'], ['agendada', 'Agendadas'], ['feita', 'Feitas'], ['todas', 'Todas'], ['descartada', 'Descartadas']].map(([k, n]) => `<button class="mini ${f === k ? 'on' : ''}" data-pa-filtro="${k}">${n}</button>`).join('')}
      <span class="muted">${vis.length} pautas</span></div>
    <div id="pa-form" hidden class="card" style="margin-bottom:10px">
      <div class="linha3"><label>Título<input id="pf-titulo"></label><label>Tipo<select id="pf-tipo">${['Reels', 'Stories', 'Anúncio'].map((t) => `<option>${t}</option>`).join('')}</select></label>
        <label>Quadro<select id="pf-quadro"><option>Avulso</option>${(E.plano?.quadros || []).map((q) => `<option>${esc(q.nome)}</option>`).join('')}</select></label></div>
      <label>Gancho<input id="pf-gancho"></label><label>Ideia<textarea id="pf-ideia"></textarea></label>
      <button id="pf-salvar" class="primario">Salvar pauta</button>
    </div>
    <div class="pautas">${vis.map(card).join('') || '<p class="muted">Nenhuma pauta aqui. Clique em <b>🧠 Gerar pautas</b>: a IA usa os quadros fixos, o estoque e a inteligência de mercado.</p>'}</div>`;
}

function ligarPautas(E, ctx) {
  const box = $('#cal-corpo');
  $('#pa-gerar').onclick = async () => {
    modal('🧠 Criando pautas', 'A IA está cruzando quadros fixos, estoque (carros há mais tempo no pátio primeiro) e o que mais performa no mercado…', 0.4);
    try {
      const r = await api('/api/pautas/gerar', { json: { quantidade: +$('#pa-qtd').value, pedido: $('#pa-pedido').value.trim() } });
      modal(null); E.filtroPauta = 'abertas'; await ctx.recarregar(); toast(`${r.pautas.length} pautas novas prontas para aprovar.`);
    } catch (e) { modal(null); toast(e.message, true); }
  };
  $('#pa-nova').onclick = () => { $('#pa-form').hidden = !$('#pa-form').hidden; };
  $('#pf-salvar').onclick = async () => {
    const p = { titulo: $('#pf-titulo').value.trim(), tipo: $('#pf-tipo').value, quadro: $('#pf-quadro').value, gancho: $('#pf-gancho').value.trim(), ideia: $('#pf-ideia').value.trim(), pilar: 'Vitrine', prioridade: 2, origem: 'manual' };
    if (!p.titulo) return toast('Dê um título para a pauta.', true);
    await api('/api/pautas', { json: p }); await ctx.recarregar();
  };
  box.querySelectorAll('[data-pa-filtro]').forEach((b) => (b.onclick = () => { E.filtroPauta = b.dataset.paFiltro; ctx.render(); }));
  box.querySelectorAll('[data-pa-st]').forEach((b) => (b.onclick = async () => {
    await api(`/api/pautas/${b.dataset.paSt}`, { method: 'PUT', json: { status: b.dataset.v } }); await ctx.recarregar();
  }));
  box.querySelectorAll('[data-pa-agendar]').forEach((b) => (b.onclick = async () => {
    const data = $(`#pd-${b.dataset.paAgendar}`).value;
    if (!data) return toast('Escolha a data.', true);
    await api(`/api/pautas/${b.dataset.paAgendar}/agendar`, { json: { data } });
    await ctx.recarregar(); toast(`Agendada para ${dm(data)} — já aparece na Produção e no Calendário.`);
  }));
  box.querySelectorAll('[data-pa-produzir]').forEach((b) => (b.onclick = async () => {
    const id = b.dataset.paProduzir;
    const sel = $(`#pc-${id}`);
    try {
      const c = await api(`/api/pautas/${id}/produzir`, { json: sel ? { projeto: sel.value } : {} });
      await abrirNoEstudio(c.projeto || sel?.value || E.pautas.find((x) => x.id === id)?.projeto, c.id);
      await window.estudio.gerarConteudo();
    } catch (e) { toast(e.message, true); }
  }));
  box.querySelectorAll('[data-pa-copiar]').forEach((b) => (b.onclick = () => {
    const p = E.pautas.find((x) => x.id === b.dataset.paCopiar);
    const t = `${p.titulo}\n${p.carro || ''}\n\nGANCHO: ${p.gancho || ''}\n\nROTEIRO:\n${(p.roteiro || []).join('\n')}\n\nTAKES:\n${(p.takes || []).map((x) => `- ${x}`).join('\n')}\n\nCTA: ${p.cta || ''}\n\nLEGENDA:\n${p.legenda || ''}`;
    navigator.clipboard.writeText(t).then(() => toast('Pauta copiada (mande para o apresentador/videomaker).'));
  }));
}

// ---------------------------------------------------------------- Quadros fixos

function renderQuadros(E) {
  const qs = E.plano?.quadros || [];
  const conta = (nome) => E.cal.filter((e) => e.quadro === nome && e.status !== 'cancelado').length + E.pautas.filter((p) => p.quadro === nome && ['nova', 'aprovada'].includes(p.status)).length;
  const postados = (nome) => E.cal.filter((e) => e.quadro === nome && e.status === 'postado');
  return `
    <div class="setor-cab"><div></div></div>
    <div class="plano-grade quadros">${qs.map((q) => {
      const ps = postados(q.nome);
      const v = ps.reduce((s, e) => s + num(e.views), 0), m = ps.reduce((s, e) => s + num(e.mensagens), 0);
      return `<div class="card quadro">
        <div class="peca-topo"><span>${TIPOS[q.tipo] || ''} <b>${esc(q.tipo)}</b> · ${esc(q.dia)}</span><span class="selo">${esc(q.pilar)}</span></div>
        <h3>${esc(q.nome)}</h3>
        <p>${esc(q.formato)}</p>
        <div class="gancho">🎣 “${esc(q.gancho_modelo || '')}”</div>
        <div class="muted" style="font-size:12px">📈 ${esc(q.por_que || '')}</div>
        <div class="muted" style="font-size:12px;margin-top:6px">${q.apresentador ? '🧑‍💼 com apresentador' : '🎞 só takes'} · ${conta(q.nome)} em pauta/agenda · ${ps.length} no ar${ps.length ? ` · ${fmt(v)} views · ${m} msgs` : ''}</div>
        <div class="acoes"><button class="mini destaque" data-q-gerar="${esc(q.nome)}">🧠 Gerar 3 episódios</button></div>
      </div>`;
    }).join('')}</div>`;
}

function ligarQuadros(E, ctx) {
  $('#cal-corpo').querySelectorAll('[data-q-gerar]').forEach((b) => (b.onclick = async () => {
    modal('🧠 Criando episódios', `Próximos episódios do quadro “${b.dataset.qGerar}”…`, 0.4);
    try {
      await api('/api/pautas/gerar', { json: { quantidade: 4, pedido: `Crie SOMENTE episódios do quadro fixo "${b.dataset.qGerar}" (campo quadro exatamente "${b.dataset.qGerar}"), com temas diferentes entre si.` } });
      modal(null); E.aba = 'pautas'; E.filtroPauta = 'abertas'; await ctx.recarregar(); toast('Episódios no banco de pautas.');
    } catch (e) { modal(null); toast(e.message, true); }
  }));
}

// ---------------------------------------------------------------- Resultados

function renderResultados(E) {
  const desde = addDias(-30);
  const posts = E.cal.filter((e) => e.status === 'postado' && e.data >= desde && e.tipo !== 'Gravação');
  const comDados = posts.filter((e) => e.views || e.mensagens);
  const soma = (arr, k) => arr.reduce((s, e) => s + num(e[k]), 0);
  const leads30 = E.leads.filter((l) => (l.data || '') >= desde);
  const vendas = leads30.filter((l) => l.status === 'vendido');
  const custos = comDados.filter((e) => num(e.custo_conversa) > 0);
  const tabela = (titulo, chave) => {
    const g = {};
    for (const e of comDados) { const k = e[chave] || '—'; (g[k] ||= []).push(e); }
    const linhas = Object.entries(g).map(([k, l]) => ({ k, n: l.length, v: soma(l, 'views') / l.length, m: soma(l, 'mensagens') / l.length })).sort((a, b) => b.m - a.m || b.v - a.v);
    return `<div class="card"><b>${titulo}</b><table class="tab"><tr><th></th><th>posts</th><th>views/post</th><th>msgs/post</th></tr>
      ${linhas.map((r) => `<tr><td>${esc(r.k)}</td><td>${r.n}</td><td>${fmt(r.v)}</td><td>${r.m.toFixed(1).replace('.', ',')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">sem dados</td></tr>'}</table></div>`;
  };
  const top = [...comDados].sort((a, b) => num(b.mensagens) - num(a.mensagens) || num(b.views) - num(a.views)).slice(0, 6);
  const origens = {};
  for (const l of leads30) (origens[l.origem || '—'] ||= { n: 0, v: 0 }), origens[l.origem || '—'].n++, l.status === 'vendido' && origens[l.origem || '—'].v++;
  const pend = E.cal.filter((e) => e.status === 'postado' && !e.views && e.tipo !== 'Gravação').length;
  return `
    <div class="setor-cab"><div></div></div>
    <div class="kpis">
      <div class="kpi"><b>${posts.length}</b><span>posts publicados</span></div>
      <div class="kpi"><b>${fmt(soma(comDados, 'views'))}</b><span>visualizações</span></div>
      <div class="kpi"><b>${soma(comDados, 'mensagens')}</b><span>conversas geradas</span></div>
      <div class="kpi"><b>${leads30.length}</b><span>leads registrados</span></div>
      <div class="kpi"><b>${vendas.length}</b><span>vendas atribuídas</span></div>
    </div>
    ${pend ? `<div class="dica" style="margin-bottom:10px">⚠ <b>${pend} posts sem resultado lançado.</b> Sem número, o sistema não aprende o que vende. <button class="mini" data-ir="central">Lançar agora</button></div>` : ''}
    ${custos.length ? `<div class="dica" style="margin-bottom:10px">💰 Custo médio por conversa nos anúncios: <b>R$ ${(soma(custos, 'custo_conversa') / custos.length).toFixed(2).replace('.', ',')}</b></div>` : ''}
    <div class="plano-grade">${tabela('Por tipo', 'tipo')}${tabela('Por pilar', 'pilar')}${tabela('Por quadro', 'quadro')}${tabela('Por formato de roteiro', 'formato_roteiro')}</div>
    <h3>🏆 Posts campeões</h3>
    <div class="card"><table class="tab"><tr><th>Data</th><th>Post</th><th>Carro</th><th>Views</th><th>Msgs</th><th>Retenção 3s</th></tr>
      ${top.map((e) => `<tr><td>${dm(e.data)}</td><td>${TIPOS[e.tipo] || ''} ${esc(e.titulo || '')}</td><td>${esc(e.carro || '')}</td><td>${fmt(num(e.views))}</td><td>${esc(e.mensagens || 0)}</td><td>${e.retencao ? `${esc(e.retencao)}%` : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Ainda sem resultados lançados.</td></tr>'}</table>
      ${top.length ? '<p class="muted" style="font-size:12px">Abra um campeão no calendário e clique em <b>📈 Aprender com este post</b>: a IA estuda o vídeo e reforça o guia de estilo da casa.</p>' : ''}</div>
    <h3>💬 Leads por origem</h3>
    <div class="card"><table class="tab"><tr><th>Origem</th><th>Leads</th><th>Vendas</th><th>Conversão</th></tr>
      ${Object.entries(origens).sort((a, b) => b[1].n - a[1].n).map(([k, o]) => `<tr><td>${esc(k)}</td><td>${o.n}</td><td>${o.v}</td><td>${o.n ? Math.round((o.v / o.n) * 100) : 0}%</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Registre os leads em 💬 Atendimento para saber qual conteúdo vende.</td></tr>'}</table></div>`;
}

// ---------------------------------------------------------------- Anúncios

function renderAnuncios(E) {
  const a = E.plano?.anuncios || {};
  const porId = Object.fromEntries(E.estoque.map((f) => [f.id, f]));
  const vendidos = new Set(E.estoque.filter((f) => f.etapa === 'vendido').map((f) => f.id));
  const criativos = E.cal.filter((e) => e.arquivo && ['Reels', 'Anúncio'].includes(e.tipo) && !vendidos.has(e.projeto) && e.data >= addDias(-30));
  const semana = E.cal.filter((e) => e.tipo === 'Anúncio' && e.data >= addDias(-1) && e.data <= addDias(7) && e.status !== 'cancelado');
  const pausar = E.estoque.filter((f) => f.etapa === 'vendido' && f.estoque?.vendido_em >= addDias(-14));
  const herois = E.estoque.filter((f) => !['vendido', 'cadastrar'].includes(f.etapa)).sort((x, y) => y.dias_no_estoque - x.dias_no_estoque).slice(0, 3);
  const meta = E.integ?.meta || {};
  return `
    <div class="setor-cab"><div></div>
      <span class="status ${meta.conectado ? 'ok' : 'trab'}">${meta.conectado ? '🔌 Meta conectada' : '🔌 Meta não conectada'}</span></div>
    ${meta.conectado ? '' : '<div class="dica" style="margin-bottom:10px">Hoje os anúncios são subidos manualmente no Gerenciador de Anúncios. Quando você conectar a <b>Meta</b> em <button class="mini" data-ir="integracoes">🔌 Integrações</button>, este painel passa a subir os criativos e puxar custo por conversa sozinho.</div>'}
    <h3>Campanhas</h3>
    <div class="plano-grade">${(a.estrutura || []).map((c) => `<div class="card"><b>${esc(c.campanha)}</b> <span class="status ok">${esc(c.orcamento)}</span><p><small>Público:</small> ${esc(c.publico)}</p><p><small>Criativos:</small> ${esc(c.criativos)}</p></div>`).join('')}</div>
    <div class="linha2" style="gap:12px;align-items:start">
      <div class="card"><b>🚀 Carros heróis desta semana</b><p class="muted" style="font-size:12px">Os mais antigos no pátio recebem a verba de conversão.</p>
        ${herois.map((f) => `<div class="tarefa"><div><b>${esc(nomeCarro(f))}</b><div class="muted">${f.dias_no_estoque} dias · R$ ${esc(f.carro?.preco || '?')} · ${f.videos} vídeos</div></div>
          <div class="acoes">${f.videos ? '' : '<span class="status erro">sem criativo</span>'}<button class="mini" data-abrir="${f.id}">✂ Criativo</button></div></div>`).join('') || '<p class="muted">Cadastre o estoque.</p>'}</div>
      <div class="card"><b>⏸ Pausar agora</b>
        ${pausar.map((f) => `<div class="tarefa"><div><b>${esc(nomeCarro(f))}</b><div class="muted">vendido em ${esc(f.estoque.vendido_em)}</div></div></div>`).join('') || '<p class="muted">Nada para pausar. ✔</p>'}
        <b style="display:block;margin-top:10px">📅 Tarefas de anúncio (7 dias)</b>
        ${semana.map((e) => `<div class="tarefa"><div><b>${dm(e.data)} · ${esc(e.titulo || '')}</b><div class="muted">${esc(e.ideia || '')}</div></div><div class="acoes"><button class="mini" data-postado="${e.id}">✔ Feito</button></div></div>`).join('') || '<p class="muted">Sem tarefas.</p>'}</div>
    </div>
    <h3>🎞 Criativos prontos para subir</h3>
    <div class="criativos">${criativos.map((e) => `<div class="card"><b>${TIPOS[e.tipo] || ''} ${esc(e.titulo || '')}</b><div class="muted">${esc(e.carro || '')} · ${dm(e.data)}${e.views ? ` · ${fmt(num(e.views))} views orgânicas` : ''}</div>
      <div class="acoes"><a class="btn mini primario" href="${esc(e.arquivo)}" download>⬇ MP4</a>${e.legenda ? `<button class="mini" data-copiar="${e.id}">📋 Texto</button>` : ''}</div></div>`).join('') || '<p class="muted">Nenhum vídeo exportado ainda. Os Reels exportados e agendados aparecem aqui.</p>'}</div>
    <h3>Regras de otimização</h3><div class="card">${lista(a.regras)}<p class="muted">${esc(a.metas_iniciais || '')}</p></div>`;
}

// ---------------------------------------------------------------- Atendimento (WhatsApp)

const ST_LEAD = { novo: '🆕 Novo', atendimento: '💬 Em atendimento', visita: '📍 Visita marcada', proposta: '📝 Proposta', vendido: '🏁 Vendido', perdido: '✖ Perdido' };
const ORIGENS = ['Stories', 'Reels', 'Anúncio', 'Perfil/Bio', 'Indicação', 'Passante', 'OLX/Webmotors', 'Outro'];

function codigoCarro(f) { return `TC${(f.carro?.modelo || f.nome || 'X').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}${String(f.carro?.ano || '').slice(-2)}`; }

function linkWhats(numero, texto) {
  const n = soDigitos(numero);
  return `https://wa.me/${n.length <= 11 ? `55${n}` : n}?text=${encodeURIComponent(texto)}`;
}

function modelosResposta(E, f) {
  const nome = E.marca?.nome || 'TopCar Veículos';
  const c = f ? `${f.carro?.marca || ''} ${f.carro?.modelo || ''} ${f.carro?.versao || ''} ${f.carro?.ano || ''}`.replace(/\s+/g, ' ').trim() : 'o carro';
  const preco = f?.carro?.preco ? `R$ ${f.carro.preco}` : 'o valor';
  return [
    ['1ª resposta (até 5 min)', `Oi! Aqui é da ${nome} 👋 Que bom que você curtiu o ${c}! Ele está disponível sim, por ${preco}${f?.carro?.km ? `, com ${f.carro.km} km` : ''}. Você pensa em comprar à vista, financiado ou dando um carro na troca?`],
    ['Simulação', `Pra eu te mandar a simulação certinha do ${c}: qual valor de entrada você pensa em dar e em quantas vezes fica bom pra você? Se tiver carro na troca, me manda o modelo, ano e km 📲`],
    ['Convite para visita', `Que tal vir ver o ${c} pessoalmente e fazer um test drive? Tenho horário hoje às 16h ou amanhã às 10h. Qual fica melhor? 📍 ${nome}`],
    ['Retomada (24h sem resposta)', `Oi! Passando pra saber se ficou alguma dúvida sobre o ${c}. Ele tem chamado bastante atenção essa semana — se quiser, seguro ele pra você vir ver 😉`],
    ['Pós-venda (pedir depoimento)', `Parabéns pelo ${c}! 🎉 Foi um prazer. Posso gravar um vídeo rápido de 10 segundos seu com o carro para o nosso quadro “Entrega da Semana”? E se puder, deixa sua avaliação no Google pra gente 🙏`],
  ];
}

function renderAtendimento(E) {
  const numero = E.marca?.whatsapp || '';
  const carros = E.estoque.filter((f) => f.etapa !== 'vendido');
  const sel = carros.find((f) => f.id === E.atCarro) || carros[0];
  const origem = E.atOrigem || 'Stories';
  const msg = sel ? `Oi! Vi o ${curto(sel)} no ${origem === 'Anúncio' ? 'anúncio' : origem} da TopCar e quero saber mais. [${codigoCarro(sel)}]` : '';
  const wa = E.integ?.whatsapp || {};
  const leads = [...E.leads].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  const abertos = leads.filter((l) => !['vendido', 'perdido'].includes(l.status));
  return `
    <div class="setor-cab"><div></div>
      <span class="status ${wa.conectado ? 'ok' : 'trab'}">${wa.conectado ? '🔌 WhatsApp API conectada' : '🔌 WhatsApp API não conectada'}</span></div>
    <div class="linha2" style="gap:12px;align-items:start">
      <div class="card">
        <b>🔗 Link do WhatsApp por carro (rastreável)</b>
        <p class="muted" style="font-size:12px">Use no sticker de link dos Stories e no botão dos anúncios. O código entre colchetes mostra de qual carro e canal veio o lead.</p>
        ${numero ? '' : '<div class="dica">Cadastre o número do WhatsApp da loja na aba <b>Marca</b> do editor (ou em Integrações).</div>'}
        <div class="linha2"><label>Carro<select id="at-carro">${carros.map((f) => `<option value="${f.id}" ${f.id === sel?.id ? 'selected' : ''}>${esc(nomeCarro(f))}</option>`).join('')}</select></label>
          <label>Canal<select id="at-origem">${['Stories', 'Reels', 'Anúncio', 'Perfil/Bio'].map((o) => `<option ${o === origem ? 'selected' : ''}>${o}</option>`).join('')}</select></label></div>
        ${sel && numero ? `<input readonly id="at-link" value="${esc(linkWhats(numero, msg))}"><div class="acoes"><button class="mini primario" id="at-copiar">📋 Copiar link</button><a class="btn mini" target="_blank" href="${esc(linkWhats(numero, msg))}">Testar</a></div>` : ''}
      </div>
      <div class="card"><b>📝 Respostas-padrão ${sel ? `— ${esc(curto(sel))}` : ''}</b>
        ${modelosResposta(E, sel).map(([t, m], i) => `<div class="tarefa"><div><b>${t}</b><div class="muted" style="font-size:12px">${esc(m)}</div></div><div class="acoes"><button class="mini" data-modelo="${i}">📋</button></div></div>`).join('')}
      </div>
    </div>
    <h3>👥 Leads <span class="status ${abertos.length ? 'trab' : 'ok'}">${abertos.length} em aberto</span></h3>
    <div class="card">
      <div class="linha-form">
        <input id="ld-nome" placeholder="Nome"><input id="ld-tel" placeholder="WhatsApp">
        <select id="ld-carro"><option value="">Carro de interesse</option>${carros.map((f) => `<option value="${f.id}">${esc(curto(f))}</option>`).join('')}</select>
        <select id="ld-origem">${ORIGENS.map((o) => `<option>${o}</option>`).join('')}</select>
        <button id="ld-add" class="primario">＋ Registrar lead</button>
      </div>
      <table class="tab"><tr><th>Data</th><th>Nome</th><th>Carro</th><th>Origem</th><th>Status</th><th></th></tr>
        ${leads.map((l) => { const f = E.estoque.find((x) => x.id === l.carro); return `<tr><td>${dm(l.data)}</td><td>${esc(l.nome || '')}</td><td>${esc(f ? curto(f) : '—')}</td><td>${esc(l.origem || '')}</td>
          <td><select class="mini-sel" data-lead="${l.id}">${Object.entries(ST_LEAD).map(([k, v]) => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
          <td>${l.telefone ? `<a class="btn mini" target="_blank" href="${esc(linkWhats(l.telefone, `Oi ${l.nome || ''}! Aqui é da TopCar 👋`))}">💬</a>` : ''}<button class="mini perigo" data-lead-del="${l.id}">✖</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Nenhum lead ainda. Registre cada conversa que chegar com o código do link (ex.: [TCKA20]).</td></tr>'}
      </table>
    </div>`;
}

function ligarAtendimento(E, ctx) {
  const box = $('#cal-corpo');
  const re = () => ctx.render();
  if ($('#at-carro')) $('#at-carro').onchange = (e) => { E.atCarro = e.target.value; re(); };
  if ($('#at-origem')) $('#at-origem').onchange = (e) => { E.atOrigem = e.target.value; re(); };
  if ($('#at-copiar')) $('#at-copiar').onclick = () => navigator.clipboard.writeText($('#at-link').value).then(() => toast('Link copiado — cole no sticker de link do Stories.'));
  const sel = E.estoque.find((f) => f.id === ($('#at-carro')?.value));
  box.querySelectorAll('[data-modelo]').forEach((b) => (b.onclick = () => navigator.clipboard.writeText(modelosResposta(E, sel)[+b.dataset.modelo][1]).then(() => toast('Resposta copiada.'))));
  $('#ld-add').onclick = async () => {
    const l = { nome: $('#ld-nome').value.trim(), telefone: $('#ld-tel').value.trim(), carro: $('#ld-carro').value, origem: $('#ld-origem').value, data: iso(new Date()), status: 'novo' };
    if (!l.nome && !l.telefone) return toast('Informe nome ou WhatsApp.', true);
    await api('/api/leads', { json: l }); await ctx.recarregar(); toast('Lead registrado.');
  };
  box.querySelectorAll('[data-lead]').forEach((s) => (s.onchange = async () => {
    await api(`/api/leads/${s.dataset.lead}`, { method: 'PUT', json: { status: s.value } });
    if (s.value === 'vendido') toast('Venda! 🏁 Peça o depoimento para a “Entrega da Semana” e marque o carro como vendido no Estoque.');
    await ctx.recarregar();
  }));
  box.querySelectorAll('[data-lead-del]').forEach((b) => (b.onclick = async () => { await api(`/api/leads/${b.dataset.leadDel}`, { method: 'DELETE' }); await ctx.recarregar(); }));
}

// ---------------------------------------------------------------- Inteligência de mercado

function renderInteligencia(E) {
  const mc = E.marca?.mercado;
  const refs = E.refs.filter((r) => !r.casa);
  const ok = refs.filter((r) => r.analise);
  const lojas = {};
  for (const r of ok) { const k = r.anunciante || '?'; (lojas[k] ||= []).push(r); }
  const fila = refs.filter((r) => ['na fila', 'analisando'].includes(r.status)).length;
  const sec = (t, arr) => (arr?.length ? `<div class="card"><b>${t}</b>${lista(arr)}</div>` : '');
  return `
    <div class="setor-cab"><div></div>
      <div class="acoes"><button id="in-sintese" class="destaque">🔄 Atualizar inteligência</button><button data-refs>＋ Estudar mais vídeos</button></div></div>
    <div class="kpis">
      <div class="kpi"><b>${ok.length}</b><span>vídeos estudados</span></div>
      <div class="kpi"><b>${Object.keys(lojas).length}</b><span>lojas/marcas</span></div>
      <div class="kpi ${fila ? 'alerta' : ''}"><b>${fila}</b><span>na fila de estudo</span></div>
      <div class="kpi"><b>${mc?.base || 0}</b><span>vídeos na última síntese</span></div>
      <div class="kpi"><b>${E.refs.filter((r) => r.casa && r.analise).length}</b><span>vídeos da casa</span></div>
    </div>
    ${fila ? `<div class="dica">⏳ <b>${fila} vídeos sendo estudados em segundo plano</b> (o plano grátis do Gemini estuda ~1 vídeo a cada 1–2 min; quando bate o limite, ele espera e continua sozinho). Ao terminar, clique em <b>🔄 Atualizar inteligência</b>.</div>` : ''}
    ${refs.some((r) => r.status === 'erro') ? `<div class="dica">⚠ ${refs.filter((r) => r.status === 'erro').length} vídeos deram erro. <button class="mini" id="in-retentar">🔁 Tentar de novo</button></div>` : ''}
    ${mc ? `<div class="plano-obj">${esc(mc.resumo || '')}</div>
    <div class="plano-grade" style="margin-top:10px">
      ${sec('🏆 Ganchos campeões', mc.ganchos_campeoes)}${sec('🎬 Formatos mais fortes', mc.formatos_mais_fortes)}
      ${sec('✍ Texto e visual', mc.padroes_de_texto_e_visual)}${sec('💬 CTA e oferta', mc.padroes_de_cta_e_oferta)}
      ${sec('🚫 Comum demais (evitar)', mc.comum_demais)}${sec('💎 Oportunidades para a TopCar', mc.oportunidades)}
    </div>
    ${sec('✅ Recomendações aplicadas nos roteiros', mc.recomendacoes)}
    ${mc.ritmo_medio ? `<p class="muted">Ritmo médio do mercado: ${esc(txt(mc.ritmo_medio))}</p>` : ''}` : '<div class="dica">Ainda sem síntese. Estude pelo menos 3 vídeos e clique em <b>🔄 Atualizar inteligência</b>.</div>'}
    <h3>Vídeos estudados por loja</h3>
    <div class="card"><table class="tab"><tr><th>Loja / marca</th><th>Vídeos</th><th>Nota média</th><th>Melhor gancho</th></tr>
      ${Object.entries(lojas).sort((a, b) => b[1].length - a[1].length).map(([k, l]) => {
        const best = [...l].sort((a, b) => (b.analise.nota_performance || 0) - (a.analise.nota_performance || 0))[0];
        return `<tr><td>${esc(k)}</td><td>${l.length}</td><td>${(l.reduce((s, r) => s + (r.analise.nota_performance || 0), 0) / l.length).toFixed(1).replace('.', ',')}</td><td class="muted">${esc(best.analise.gancho || '')}</td></tr>`;
      }).join('')}</table></div>`;
}

function ligarInteligencia(E, ctx) {
  $('#in-sintese').onclick = async () => {
    modal('🧠 Atualizando', 'A IA está cruzando todos os vídeos estudados…', 0.5);
    try { await api('/api/referencias/sintese', { method: 'POST' }); modal(null); await ctx.recarregar(); toast('Inteligência atualizada — já vale para os próximos roteiros.'); }
    catch (e) { modal(null); toast(e.message, true); }
  };
  if ($('#in-retentar')) $('#in-retentar').onclick = async () => { const r = await api('/api/referencias/retentar', { method: 'POST' }); toast(`${r.recolocadas} vídeos de volta na fila.`); await ctx.recarregar(); };
  const b = $('#cal-corpo').querySelector('[data-refs]');
  if (b) b.onclick = () => { $('#calendario').hidden = true; ctx.abrirAba('refs'); };
}

// ---------------------------------------------------------------- Identidade visual

function renderVisual(E) {
  const m = E.marca || {}, c = m.cores || {}, g = m.guia;
  const lt = m.logoTexto || { a: 'TOP', b: 'CAR', sub: 'VEÍCULOS' };
  return `
    <div class="setor-cab"><div></div>
      <div class="acoes"><button class="primario" data-marca>✎ Editar marca</button></div></div>
    <div class="plano-grade">
      <div class="card visual-logo">${m.logo ? `<img src="/marca/${esc(m.logo)}" alt="logo">` : `<div class="logo-txt"><span style="color:${esc(c.primaria || '#7DC242')}">${esc(lt.a)}</span>${esc(lt.b)}<small>${esc(lt.sub)}</small></div>`}
        <p class="muted" style="font-size:12px">${m.logo ? 'Logo oficial' : 'Logo em texto (envie o PNG oficial na aba Marca)'} · ${esc(m.instagram || '')} · ${esc(m.whatsapp || 'WhatsApp não cadastrado')}</p></div>
      <div class="card"><b>Cores</b><div class="paleta">${Object.entries(c).map(([k, v]) => `<div><i style="background:${esc(v)}"></i><span>${esc(k)}<br><code>${esc(v)}</code></span></div>`).join('')}</div></div>
      <div class="card"><b>Tipografia</b><p style="font:900 28px '${esc(m.fonteTitulo || 'Exo 2')}';margin:6px 0">TÍTULO ${esc(m.fonteTitulo || 'Exo 2')}</p><p style="font:800 26px '${esc(m.fonteNumeros || 'Saira Condensed')}';margin:6px 0">R$ 89.990 · ${esc(m.fonteNumeros || 'Saira Condensed')}</p></div>
    </div>
    <h3>Padrão de vídeo TopCar</h3><div class="card">${lista(E.plano?.padroes_de_video)}</div>
    <h3>Guia de estilo da casa</h3>
    ${g ? `<div class="plano-obj">${esc(g.resumo || '')}</div><div class="plano-grade" style="margin-top:10px">
      <div class="card"><b>Tom de voz</b><p>${esc(txt(g.tom_de_voz))}</p></div>
      <div class="card"><b>Manter</b>${lista(g.manter)}</div><div class="card"><b>Evitar</b>${lista(g.evitar)}</div><div class="card"><b>Subir o nível</b>${lista(g.subir_o_nivel)}</div></div>`
    : '<div class="dica">O guia da casa ainda não foi gerado: envie 5–10 vídeos que a loja já postou (com views e mensagens) na aba <b>Marca</b> do editor e clique em “Gerar guia”.</div>'}`;
}

// ---------------------------------------------------------------- Integrações

function renderIntegracoes(E) {
  const I = E.integ || {};
  const campo = (s, k, rotulo, ph = '', tipo = 'text') => `<label>${rotulo}<input type="${tipo}" data-in="${s}.${k}" value="${esc(I[s]?.[k] || '')}" placeholder="${esc(ph)}"></label>`;
  const estado = (s) => (I[s]?.conectado ? `<span class="status ok">✔ conectado${I[s].conta?.name || I[s].conta?.username || I[s].conta?.verified_name ? ` — ${esc(I[s].conta.username || I[s].conta.name || I[s].conta.verified_name)}` : ''}</span>`
    : I[s]?.erro ? `<span class="status erro" title="${esc(I[s].erro)}">✖ ${esc(String(I[s].erro).slice(0, 60))}</span>` : '<span class="status trab">não conectado</span>');
  return `
    <div class="setor-cab"><div></div></div>
    <div class="linha2" style="gap:12px;align-items:start">
      <div class="card integ">
        <div class="peca-topo"><b>📸 Meta — Instagram, Facebook e Anúncios</b>${estado('meta')}</div>
        ${campo('meta', 'token', 'Token de acesso (System User)', 'EAAG…', 'password')}
        <div class="linha2">${campo('meta', 'ig_id', 'ID da conta do Instagram Business', '1784…')}${campo('meta', 'page_id', 'ID da Página do Facebook')}</div>
        ${campo('meta', 'ad_account', 'Conta de anúncios', 'act_123…')}
        <div class="acoes"><button class="primario" data-salvar="meta">Salvar</button><button data-testar="meta">Testar conexão</button></div>
        <b>O que vai liberar</b>
        <ul><li>Postar Stories e Reels do calendário direto pelo app no horário agendado</li><li>Puxar views, alcance e retenção de cada post sozinho (Resultados)</li>
          <li>Subir criativos e acompanhar custo por conversa nas campanhas (Anúncios)</li><li>Pausar anúncio de carro vendido automaticamente</li></ul>
        <p class="muted" style="font-size:12px">Como obter: business.facebook.com → Configurações do negócio → Usuários do sistema → gerar token com instagram_content_publish, instagram_manage_insights, ads_management, pages_read_engagement.</p>
      </div>
      <div class="card integ">
        <div class="peca-topo"><b>💬 WhatsApp Business — Cloud API</b>${estado('whatsapp')}</div>
        <label>Número do WhatsApp da loja (usado nos links e no cartão final dos vídeos)<input id="in-numero" value="${esc(E.marca?.whatsapp || '')}" placeholder="(81) 9 9999-9999"></label>
        ${campo('whatsapp', 'token', 'Token de acesso', 'EAAG…', 'password')}
        <div class="linha2">${campo('whatsapp', 'phone_id', 'Phone number ID')}${campo('whatsapp', 'waba_id', 'WhatsApp Business Account ID')}</div>
        <div class="acoes"><button class="primario" data-salvar="whatsapp">Salvar</button><button data-testar="whatsapp">Testar conexão</button></div>
        <b>O que vai liberar</b>
        <ul><li>Receber as conversas aqui, já com o carro e o post de origem (código do link)</li><li>Resposta automática em segundos com preço, fotos e simulação</li>
          <li>Lembrete de retomada em 24h e pedido de depoimento pós-venda</li><li>Funil de leads → vendas ligado aos Resultados</li></ul>
        <p class="muted" style="font-size:12px">Como obter: developers.facebook.com → seu app → WhatsApp → Configuração da API (número da TopCar verificado no Gerenciador do WhatsApp).</p>
      </div>
    </div>
    <div class="card"><b>🧩 Já ativo</b><ul><li>🤖 Google Gemini (IA de roteiros, pautas, análise de vídeo e narração)</li><li>📅 Calendário exportável para Google Agenda (.ics)</li><li>🔗 Links rastreáveis de WhatsApp por carro (Atendimento)</li></ul></div>`;
}

function ligarIntegracoes(E, ctx) {
  const box = $('#cal-corpo');
  const coletar = (s) => Object.fromEntries([...box.querySelectorAll(`[data-in^="${s}."]`)].map((i) => [i.dataset.in.split('.')[1], i.value.trim()]));
  box.querySelectorAll('[data-salvar]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.salvar === 'whatsapp' && $('#in-numero').value.trim() !== (E.marca?.whatsapp || '')) {
      E.marca = await api('/api/marca', { method: 'PUT', json: { whatsapp: $('#in-numero').value.trim() } });
    }
    E.integ = await api('/api/integracoes', { method: 'PUT', json: { [b.dataset.salvar]: coletar(b.dataset.salvar) } }); toast('Salvo.'); ctx.render();
  }));
  box.querySelectorAll('[data-testar]').forEach((b) => (b.onclick = async () => {
    const s = b.dataset.testar;
    await api('/api/integracoes', { method: 'PUT', json: { [s]: coletar(s) } });
    try { const r = await api(`/api/integracoes/${s}/testar`, { method: 'POST' }); toast(r.conectado ? 'Conectado ✔' : `Falhou: ${r.erro}`, !r.conectado); }
    catch (e) { toast(e.message, true); }
    E.integ = await api('/api/integracoes'); ctx.render();
  }));
}

// ---------------------------------------------------------------- registro

export const MODULOS = {
  producao: { render: renderProducao, ligar: ligarProducao },
  social: { render: renderSocial },
  dia: { render: renderDia, ligar: ligarDia },
  ficha: { render: renderFicha, ligar: ligarFicha },
  pautas: { render: renderPautas, ligar: ligarPautas },
  quadros: { render: renderQuadros, ligar: ligarQuadros },
  resultados: { render: renderResultados },
  anuncios: { render: renderAnuncios },
  atendimento: { render: renderAtendimento, ligar: ligarAtendimento },
  inteligencia: { render: renderInteligencia, ligar: ligarInteligencia },
  visual: { render: renderVisual },
  integracoes: { render: renderIntegracoes, ligar: ligarIntegracoes },
};

/** Ações comuns (abrir no editor, postado, copiar legenda, ir para módulo) em qualquer módulo. */
export function ligarComuns(E, ctx) {
  const box = $('#cal-corpo');
  box.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => { E.aba = b.dataset.ir; ctx.render(); }));
  box.querySelectorAll('[data-criar]').forEach((b) => (b.onclick = async () => {
    const e = E.cal.find((x) => x.id === b.dataset.criar);
    b.disabled = true; b.textContent = '⏳ escrevendo…';
    try {
      const c = await api(`/api/projetos/${e.projeto}/conteudos`, { json: { tipo: e.tipo, titulo: e.titulo, origem: 'agenda', entrada: e.id, data: e.data, direcao: [e.titulo, e.ideia, e.gancho && `Gancho: ${e.gancho}`, e.cta && `CTA: ${e.cta}`, e.sticker && `Sticker: ${e.sticker}`].filter(Boolean).join('\n') } });
      await abrirNoEstudio(e.projeto, c.id);
      await window.estudio.gerarConteudo();
    } catch (er) { toast(er.message, true); b.disabled = false; }
  }));
  box.querySelectorAll('[data-estudio]').forEach((b) => (b.onclick = () => { const [pid, cid] = b.dataset.estudio.split('|'); abrirNoEstudio(pid, cid); }));
  box.querySelectorAll('[data-ficha]').forEach((b) => (b.onclick = () => { E.aba = 'estoque'; E.carroSel = b.dataset.ficha; E.fichaAba = 'criar'; ctx.recarregar(); }));
  box.querySelectorAll('[data-abrir]').forEach((b) => (b.onclick = () => { $('#calendario').hidden = true; E.abrirProjeto(b.dataset.abrir); }));
  box.querySelectorAll('[data-marca]').forEach((b) => (b.onclick = () => { $('#calendario').hidden = true; ctx.abrirAba('marca'); }));
  box.querySelectorAll('[data-postado]').forEach((b) => (b.onclick = async () => {
    await api(`/api/calendario/${b.dataset.postado}`, { method: 'PUT', json: { status: 'postado' } }); await ctx.recarregar(); toast('Marcado ✔');
  }));
  box.querySelectorAll('[data-copiar]').forEach((b) => (b.onclick = () => {
    const e = E.cal.find((x) => x.id === b.dataset.copiar);
    navigator.clipboard.writeText(e?.legenda || '').then(() => toast('Texto copiado!'));
  }));
  box.querySelectorAll('[data-cal]').forEach((b) => (b.onclick = () => {
    const e = E.cal.find((x) => x.id === b.dataset.cal);
    if (e) { const [a, m] = e.data.split('-'); E.ano = +a; E.mes = +m - 1; }
    E.sel = b.dataset.cal; E.aba = 'mes'; ctx.render();
  }));
}
