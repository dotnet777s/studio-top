// Estoque → Fotos e Vídeos: central de envio das mídias de cada carro.
// Fotos: formulário dos carros e integrador de portais (API /api/publico/estoque). Vídeos (takes): usados pelo estúdio.
import { api, esc, toast } from './estado.js';

const $ = (s, r = document) => r.querySelector(s);
const nomeCarro = (f) => [f.carro?.marca, f.carro?.modelo, f.carro?.versao, f.carro?.ano].filter(Boolean).join(' ') || f.nome;

/** Lista de carros à esquerda (com contagem do que interessa à aba) e o carro escolhido. */
function listaCarros(E, chave, rotulo) {
  const carros = E.estoque.filter((f) => f.etapa !== 'vendido').sort((a, b) => (a[chave] || 0) - (b[chave] || 0) || b.dias_no_estoque - a.dias_no_estoque);
  if (!E.midiaCarro || !carros.some((f) => f.id === E.midiaCarro)) E.midiaCarro = carros[0]?.id;
  return `<aside class="mid-lista">${carros.map((f) => { const n = chave === 'fotos' ? f.fotos || 0 : f.takes?.total || 0; return `<button class="${f.id === E.midiaCarro ? 'on' : ''}" data-mid-carro="${f.id}">
    ${f.thumb ? `<img src="${esc(f.thumb.startsWith('/') ? f.thumb : `/media/${f.id}/${f.thumb}`)}" alt="">` : '<span class="sem">📷</span>'}
    <span class="tx"><b>${esc(nomeCarro(f))}</b><small>${f.carro?.placa ? `${esc(f.carro.placa)} · ` : ''}${f.topcrm?.unidade ? esc(f.topcrm.unidade) : `R$ ${esc(f.carro?.preco || '—')}`}</small></span>
    <span class="cont ${n ? 'ok' : 'falta'}">${n || '0'} ${rotulo}</span></button>`; }).join('') || '<p class="muted">Sem carros no estoque.</p>'}</aside>`;
}

function ligarLista(E, ctx) {
  $('#cal-corpo').querySelectorAll('[data-mid-carro]').forEach((b) => (b.onclick = () => { E.midiaCarro = b.dataset.midCarro; E.midiaDados = null; ctx.render(); }));
}

function zonaEnvio(id, texto, aceita) {
  return `<div class="soltar" id="${id}">⬆ <b>${texto}</b><br><span class="muted">arraste aqui ou clique para escolher — vários de uma vez</span><input type="file" id="${id}-arq" accept="${aceita}" multiple hidden></div>`;
}

function ligarZona(id, enviar) {
  const zona = $(`#${id}`), inp = $(`#${id}-arq`);
  if (!zona) return;
  zona.onclick = () => inp.click();
  inp.onchange = () => enviar(inp.files);
  zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('sobre'); };
  zona.ondragleave = () => zona.classList.remove('sobre');
  zona.ondrop = (e) => { e.preventDefault(); zona.classList.remove('sobre'); enviar(e.dataTransfer.files); };
}

async function carregar(E, ctx, url) {
  if (E.midiaDados && E.midiaDados.id === E.midiaCarro) return true;
  try { E.midiaDados = { id: E.midiaCarro, dados: await api(url) }; } catch (e) { toast(e.message, true); }
  ctx.render();
  return false;
}

// ---------------------------------------------------------------- FOTOS

export function renderFotos(E) {
  const f = E.estoque.find((x) => x.id === E.midiaCarro) || null;
  const fotos = E.midiaDados && E.midiaDados.id === E.midiaCarro ? E.midiaDados.dados : null;
  return `<div class="mid">
    ${listaCarros(E, 'fotos', 'fotos')}
    <section class="mid-painel">${!f ? '' : `
      <div class="mid-cab"><div><h2>${esc(nomeCarro(f))}</h2><p class="muted">${f.carro?.placa ? `Placa ${esc(f.carro.placa)} · ` : ''}A primeira foto é a <b>capa</b>. Arraste para mudar a ordem — é a ordem que vai para os portais e para o formulário.</p></div>
        <div class="acoes">${fotos?.length ? `<a class="btn" href="/api/projetos/${f.id}/fotos.zip">⬇ Baixar todas (ZIP)</a>` : ''}<button data-copiar-api="${f.id}" title="Link JSON deste carro para o formulário / integrador">🔗 Link da API</button></div></div>
      ${zonaEnvio('ft-zona', 'Enviar fotos do carro (JPG, PNG, WEBP, HEIC)', 'image/*,.heic,.heif')}
      <p class="muted" style="font-size:12px">Cada foto é ajustada para portal (até 1920 px, JPEG, na orientação certa, sem dados de localização) e ganha miniatura. O original fica guardado.</p>
      ${fotos === null ? '<p class="muted">Carregando…</p>' : `<div class="grade-fotos" id="ft-grade">${fotos.map((x) => `<div class="foto-item" draggable="true" data-foto="${x.id}">
        <img src="/media/${f.id}/${esc(x.mini)}" alt="" loading="lazy">${x.capa ? '<em>CAPA</em>' : `<span class="ord">${x.ordem}</span>`}
        <div class="foto-acoes">${x.capa ? '' : `<button class="mini" data-capa="${x.id}">★ Capa</button>`}<a class="btn mini" href="/media/${f.id}/${esc(x.arquivo)}" target="_blank">↗</a><button class="mini perigo" data-apagar-foto="${x.id}">✖</button></div></div>`).join('') || '<p class="muted">Nenhuma foto ainda.</p>'}</div>`}`}
    </section></div>`;
}

export function ligarFotos(E, ctx) {
  ligarLista(E, ctx);
  const pid = E.midiaCarro;
  if (!pid) return;
  carregar(E, ctx, `/api/projetos/${pid}/fotos`);
  ligarZona('ft-zona', async (files) => {
    if (!files?.length) return;
    const fd = new FormData(); for (const x of files) fd.append('arquivos', x);
    toast(`Enviando ${files.length} foto(s)…`);
    try {
      const r = await api(`/api/projetos/${pid}/fotos`, { method: 'POST', body: fd });
      E.midiaDados = { id: pid, dados: r.fotos };
      toast(`${r.enviadas} foto(s) prontas.${r.erros.length ? ` ${r.erros.length} com erro: ${r.erros.join('; ')}` : ''}`, !!r.erros.length);
      await ctx.recarregar();
    } catch (e) { toast(e.message, true); }
  });
  const box = $('#cal-corpo');
  const salvarOrdem = async (ordem) => { E.midiaDados = { id: pid, dados: await api(`/api/projetos/${pid}/fotos`, { method: 'PUT', json: { ordem } }) }; await ctx.recarregar(); };
  box.querySelectorAll('[data-capa]').forEach((b) => (b.onclick = () => {
    const ids = E.midiaDados.dados.map((x) => x.id); salvarOrdem([b.dataset.capa, ...ids.filter((i) => i !== b.dataset.capa)]);
  }));
  box.querySelectorAll('[data-apagar-foto]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Apagar esta foto?')) return;
    await api(`/api/projetos/${pid}/fotos/${b.dataset.apagarFoto}`, { method: 'DELETE' });
    E.midiaDados = null; await ctx.recarregar();
  }));
  box.querySelectorAll('[data-copiar-api]').forEach((b) => (b.onclick = () => navigator.clipboard.writeText(`${location.origin}/api/publico/carros/${b.dataset.copiarApi}`).then(() => toast('Link da API copiado.'))));
  // arrastar para reordenar
  let arrastando = null;
  box.querySelectorAll('[data-foto]').forEach((el) => {
    el.ondragstart = () => { arrastando = el; el.classList.add('arrastando'); };
    el.ondragend = () => el.classList.remove('arrastando');
    el.ondragover = (e) => { e.preventDefault(); el.classList.add('alvo'); };
    el.ondragleave = () => el.classList.remove('alvo');
    el.ondrop = (e) => {
      e.preventDefault(); el.classList.remove('alvo');
      if (!arrastando || arrastando === el) return;
      const ids = [...box.querySelectorAll('[data-foto]')].map((x) => x.dataset.foto).filter((i) => i !== arrastando.dataset.foto);
      ids.splice(ids.indexOf(el.dataset.foto), 0, arrastando.dataset.foto);
      salvarOrdem(ids);
    };
  });
}

// ---------------------------------------------------------------- VÍDEOS (takes do estúdio)

export function renderVideos(E) {
  const f = E.estoque.find((x) => x.id === E.midiaCarro) || null;
  const proj = E.midiaDados && E.midiaDados.id === E.midiaCarro ? E.midiaDados.dados : null;
  const takes = proj?.takes || [];
  const trab = (t) => ['na fila', 'processando', 'analisando'].includes(t.status);
  return `<div class="mid">
    ${listaCarros(E, 'takes', 'vídeos')}
    <section class="mid-painel">${!f ? '' : `
      <div class="mid-cab"><div><h2>${esc(nomeCarro(f))}</h2><p class="muted">Os vídeos (takes) gravados deste carro. O estúdio usa eles para montar Stories, Reels e anúncios.</p></div>
        <div class="acoes"><button class="primario" data-ficha="${f.id}">🎬 Criar vídeos com estes takes</button></div></div>
      ${zonaEnvio('vd-zona', 'Enviar vídeos gravados (MP4, MOV)', 'video/*')}
      <p class="muted" style="font-size:12px">Cada vídeo tem a cor corrigida, é estabilizado quando treme e a IA marca os melhores trechos. Grave em 60 fps para câmera lenta suave.</p>
      ${proj === null ? '<p class="muted">Carregando…</p>' : `<div class="grade-takes">${takes.map((t) => `<div class="take-card">
        ${t.thumb ? `<img src="/media/${f.id}/${esc(t.thumb)}" alt="">` : '<div class="sem-foto">⏳</div>'}
        <div class="take-info"><b title="${esc(t.nome)}">${esc(t.nome)}</b>
          <span class="muted">${t.dur ? `${t.dur.toFixed(1)}s` : ''}${t.fps ? ` · ${t.fps} fps` : ''}${trab(t) ? ` · ⏳ ${esc(t.etapa || t.status)}` : ''}</span>
          <span>${t.tratado ? '<span class="st verde">✨ cor tratada</span>' : ''} ${t.estabilizado ? '<span class="st verde">🎯 estabilizado</span>' : ''} ${t.analise ? '<span class="st azul">🤖 analisado</span>' : ''}</span>
          ${t.analise?.resumo ? `<small class="muted">${esc(t.analise.resumo.slice(0, 110))}</small>` : ''}
          <button class="mini perigo" data-apagar-take="${t.id}">Apagar</button></div></div>`).join('') || '<p class="muted">Nenhum vídeo deste carro ainda.</p>'}</div>`}`}
    </section></div>`;
}

export function ligarVideos(E, ctx) {
  ligarLista(E, ctx);
  const pid = E.midiaCarro;
  if (!pid) return;
  carregar(E, ctx, `/api/projetos/${pid}`);
  ligarZona('vd-zona', async (files) => {
    if (!files?.length) return;
    const fd = new FormData(); for (const x of files) fd.append('arquivos', x);
    toast(`Enviando ${files.length} vídeo(s)…`);
    try { await api(`/api/projetos/${pid}/takes`, { method: 'POST', body: fd }); toast('Enviado! Tratando e analisando…'); E.midiaDados = null; await ctx.recarregar(); }
    catch (e) { toast(e.message, true); }
  });
  $('#cal-corpo').querySelectorAll('[data-apagar-take]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Apagar este vídeo?')) return;
    await api(`/api/projetos/${pid}/takes/${b.dataset.apagarTake}`, { method: 'DELETE' }); E.midiaDados = null; await ctx.recarregar();
  }));
  if (E.midiaDados?.dados?.takes?.some((t) => ['na fila', 'processando', 'analisando'].includes(t.status))) {
    clearTimeout(E.vigiaVideos);
    E.vigiaVideos = setTimeout(() => { if (E.aba === 'videos' && !$('#calendario').hidden) { E.midiaDados = null; ctx.render(); } }, 5000);
  }
}
