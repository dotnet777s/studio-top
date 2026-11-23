// Liga tudo: projeto, player, montagem com IA, exportação e atalhos.
import {
  S, TL, api, on, emit, uid, clamp, fmt, take, duracao, empacotar, mudou, timelineVazia, iniciarHistorico,
  desfazer, refazer, salvarAgora, selecionar, acharItem, toast, modal, aplicarFontesMarca,
} from './estado.js';
import { Motor, W, H, fatorFonte, fonteParaTela, ativos, ESTILOS, palavrasChave, srcTime as srcTimeClip } from './motor.js';
import { PlayerAudio, mixar, paraWav } from './audio.js';
import { gerarTrilha, estiloPara, ESTILOS_TRILHA } from './trilha.js';
import { iniciarCalendario, agendar, proximaData, abrir as abrirCentral } from './calendario.js';
import { iniciarTimeline, desenhar as desenharTimeline, atualizarCursor } from './timeline.js';
import { iniciarPaineis, renderizarTudo, abrirAba, usarMusica } from './paineis.js';
import { iniciarSimples } from './simples.js';

const $ = (s) => document.querySelector(s);
const motor = new Motor();
const player = new PlayerAudio();
const canvas = $('#preview');
let ctx = canvas.getContext('2d');
let relogio = { t0: 0, base: 0 };
let exportando = false;

// ================================================================ prévia

function definirResolucao() {
  const hd = $('#chk-hq').checked;
  canvas.width = hd ? 1080 : 540;
  canvas.height = hd ? 1920 : 960;
  ctx = canvas.getContext('2d');
}

function quadro() {
  requestAnimationFrame(quadro);
  if (!S.p?.timeline || exportando) return;
  const total = duracao();
  if (S.tocando) {
    S.t = relogio.t0 + (player.agora() - relogio.base);
    if (S.t >= total) { pausar(); S.t = total; }
  }
  motor.sincronizar(S.t, S.tocando);
  const k = canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  motor.desenhar(ctx, Math.max(0, S.t));
  $('#tempo').textContent = `${fmt(S.t)} / ${fmt(total)}`;
  atualizarCursor();
}

async function tocar() {
  if (S.tocando) return;
  if (S.t >= duracao() - 0.05) S.t = 0;
  $('#btn-play').textContent = '⏸';
  S.tocando = true;
  relogio.t0 = S.t;
  relogio.base = await player.tocar(S.t);
}
function pausar() {
  S.tocando = false;
  player.parar();
  $('#btn-play').textContent = '▶';
}
function alternar() { S.tocando ? pausar() : tocar(); }

function buscar(t) {
  const estava = S.tocando;
  if (estava) pausar();
  S.t = clamp(t, 0, duracao());
  if (estava) tocar();
}

// ================================================================ projeto

async function listarProjetos(selecionado) {
  const lista = await api('/api/projetos');
  S.listaProjetos = lista;
  $('#sel-projeto').innerHTML = lista.map((p) => `<option value="${p.id}" ${p.id === selecionado ? 'selected' : ''}>${p.nome.replace(/</g, '&lt;')}</option>`).join('');
  return lista;
}

function normalizarTL(tl) {
  tl ||= timelineVazia();
  tl.config = { ...timelineVazia().config, ...tl.config };
  for (const k of ['clips', 'textos', 'narracoes', 'sfx']) tl[k] ||= [];
  return tl;
}

async function abrirProjeto(id) {
  pausar();
  const d = await api(`/api/projetos/${id}`);
  d.timeline = normalizarTL(d.timeline);
  S.conteudo = null;
  d.carro ||= {};
  d.briefing ||= { duracao: 30, formato: 'Locução em off com imagens do carro', tom: 'Automático', voz: 'Puck', estilo: '' };
  S.p = d; S.sel = null; S.t = 0;
  empacotar();
  iniciarHistorico();
  motor.sincronizarElementos();
  $('#nome-projeto').value = d.nome || '';
  try { localStorage.setItem('ultimoProjeto', id); } catch { /* sem storage */ }
  renderizarTudo();
  desenharTimeline();
  atualizarAvisoVazio();
  emit('projeto');
}

async function novoProjeto() {
  const nome = prompt('Nome do vídeo (ex.: Compass 2022 branco):', 'Novo vídeo');
  if (nome === null) return;
  await salvarAgora();
  const { id } = await api('/api/projetos', { json: { nome } });
  await listarProjetos(id);
  await abrirProjeto(id);
  abrirAba('carro');
}

async function atualizarMidias() {
  if (!S.p) return;
  const d = await api(`/api/projetos/${S.p.id}`);
  S.p.takes = d.takes; S.p.musicas = d.musicas; S.p.logo = d.logo;
  motor.sincronizarElementos();
  emit('midias');
}
async function atualizarRefs() {
  S.refs = await api('/api/referencias');
  emit('refs');
}

const trabalhando = (st) => ['na fila', 'processando', 'analisando'].includes(st);
setInterval(async () => {
  try {
    if (S.p?.takes?.some((t) => trabalhando(t.status))) await atualizarMidias();
    if (S.refs.some((r) => trabalhando(r.status))) await atualizarRefs();
  } catch { /* servidor ocupado; tenta de novo */ }
}, 2500);

function atualizarAvisoVazio() {
  $('#aviso-vazio').hidden = !!(S.p && TL().clips.length);
}

// ================================================================ montagem com IA

async function montar(opcoes = {}) {
  const c = S.p.carro || {};
  const falta = ['marca', 'modelo', 'ano', 'preco'].filter((k) => !String(c[k] || '').trim());
  if (falta.length) { abrirAba('carro'); return toast(`Preencha: ${falta.join(', ')}`, true); }
  const processando = (S.p.takes || []).filter((t) => trabalhando(t.status));
  if (processando.length && !confirm(`${processando.length} take(s) ainda estão sendo processados/analisados. Montar agora sem eles?`)) return;
  if (TL().clips.length && !confirm('Isso substitui a edição atual da linha do tempo. Continuar? (dá para desfazer com Ctrl+Z)')) return;

  pausar();
  const b = S.p.briefing;
  try {
    modal('🎬 Montando o vídeo', 'A IA está estudando o carro, os takes e as referências e escrevendo o roteiro…<br><span style="font-size:11px">No plano grátis pode levar de 1 a alguns minutos.</span>', 0.15);
    await salvarAgora();
    const r = await api(`/api/projetos/${S.p.id}/montar`, { json: opcoes });
    await atualizarMidias(); // takes com o mapa de fala (corte de pausas do apresentador)
    S.p.roteiro = r;
    const semFala = /só texto/i.test(b.formato) || b.voz === 'Sem narração'; // Stories também têm narração
    const apresentador = /apresentador/i.test(b.formato);
    let falas = r.cenas.map(() => null);
    if (!semFala && !apresentador && r.cenas.some((x) => x.narracao.trim())) {
      modal('🎙 Gravando a narração', `Voz: ${b.voz}. Gerando as falas…`, 0.6);
      const estilo = [b.estilo, r.estilo_narracao].filter(Boolean).join('. ');
      falas = await api(`/api/projetos/${S.p.id}/narrar`, { json: { linhas: r.cenas.map((x) => x.narracao), voz: b.voz, estilo } });
    }
    modal('✂ Editando', 'Montando cortes na batida, textos animados, transições e efeitos…', 0.9);
    await garantirMusica(r);
    construirTimeline(r, falas, { semFala, apresentador });
    modal(null);
    abrirAba('roteiro');
    emit('roteiro');
    buscar(0);
    toast(`Formato: ${r.formato_nome || 'livre'} · ${S.p.musicas?.length ? 'dê play ▶' : 'dica: envie uma música na aba Áudio 🎵'}`);
  } catch (e) {
    modal(null);
    toast(e.message, true);
  }
}

/** Música antes de montar, para cortar na batida: a enviada pelo usuário, senão uma trilha gerada para o formato. */
async function garantirMusica(r) {
  const enviadas = (S.p.musicas || []).filter((m) => !m.nome.startsWith('Trilha '));
  if (!TL().musica || TL().musica.gerada) {
    if (enviadas.length && !TL().musica) await usarMusica(enviadas[0]);
    else if (!enviadas.length) {
      modal('🎵 Criando a trilha', 'Gerando uma música no ritmo do formato do roteiro…', 0.85);
      await criarTrilha(estiloPara(r.formato, S.p.briefing?.tom));
    }
  }
}

// ================================================================ conteúdos do carro (Reels, Stories, Anúncio)

/** Monta a linha do tempo a partir de um roteiro + falas já gravadas no servidor (leva segundos). */
async function montarDeRoteiro(r, falas) {
  const b = S.p.briefing || {};
  const apresentador = /apresentador/i.test(b.formato || '') && (S.p.takes || []).some((t) => t.analise?.tem_fala);
  const semFala = !apresentador && !(falas || []).some(Boolean) && b.voz === 'Sem narração';
  S.p.roteiro = r;
  await garantirMusica(r);
  modal(null);
  construirTimeline(r, falas || r.cenas.map(() => null), { semFala, apresentador, story: S.conteudo?.tipo === 'Stories' });
  if (S.conteudo) { S.conteudo.roteiro = r; S.conteudo.status = 'montado'; }
  mudou();
  await salvarAgora();
}

async function abrirConteudo(pid, cid) {
  await salvarAgora();
  if (S.p?.id !== pid) { await listarProjetos(pid); $('#sel-projeto').value = pid; await abrirProjeto(pid); }
  const c = (await api(`/api/projetos/${pid}/conteudos`)).find((x) => x.id === cid);
  if (!c) return toast('Conteúdo não encontrado.', true);
  pausar();
  S.conteudo = { ...c, projeto: pid };
  S.p.briefing.destino = c.tipo;
  S.p.timeline = c.timeline?.clips ? normalizarTL(c.timeline) : normalizarTL(null);
  S.p.roteiro = c.roteiro || null;
  if (!c.timeline?.clips && c.roteiro) await montarDeRoteiro(c.roteiro, c.falas);
  empacotar(); iniciarHistorico(); motor.sincronizarElementos();
  renderizarTudo(); desenharTimeline(); atualizarAvisoVazio();
  S.t = 0;
  emit('conteudo');
}

async function novoConteudo(tipo, extra = {}) {
  await salvarAgora();
  const c = await api(`/api/projetos/${S.p.id}/conteudos`, { json: { tipo, titulo: extra.titulo || `${tipo} — ${S.p.carro?.modelo || S.p.nome}`, ...extra } });
  S.conteudo = { ...c, projeto: S.p.id };
  S.p.timeline = normalizarTL(null); S.p.roteiro = null;
  S.p.briefing.destino = tipo;
  empacotar(); iniciarHistorico(); motor.sincronizarElementos(); renderizarTudo(); desenharTimeline(); atualizarAvisoVazio();
  emit('conteudo');
  return S.conteudo;
}

/** Gera (ou gera outra versão) do vídeo do conteúdo: roteiro com o aprendizado do mercado + narração + montagem. */
async function gerarConteudo() {
  const car = S.p.carro || {};
  const falta = ['marca', 'modelo', 'ano', 'preco'].filter((k) => !String(car[k] || '').trim());
  if (falta.length) return toast(`Complete os dados do carro (${falta.join(', ')}) no Estoque.`, true);
  if (!(S.p.takes || []).some((t) => t.proxy)) return toast('Este carro ainda não tem takes. Envie as mídias no Estoque.', true);
  if (!S.conteudo) await novoConteudo(S.p.briefing?.destino || 'Reels');
  pausar();
  const ab = new AbortController();
  const limite = setTimeout(() => ab.abort(), 240000); // nunca fica girando para sempre
  try {
    modal('🎬 Criando o vídeo', 'A IA está escrevendo o roteiro com o que aprendeu do mercado e gravando a narração…<br><span style="font-size:11px">Leva de 1 a 2 minutos no plano grátis.</span>', 0.3,
      [['Cancelar', () => ab.abort(), 'perigo']]);
    await salvarAgora();
    const c = await api(`/api/projetos/${S.p.id}/conteudos/${S.conteudo.id}/roteirizar`, { method: 'POST', signal: ab.signal });
    S.conteudo = { ...c, projeto: S.p.id };
    modal('✂ Montando', 'Cortes na batida, textos, efeitos e trilha…', 0.85);
    await atualizarMidias();
    await montarDeRoteiro(c.roteiro, c.falas);
    modal(null);
    S.t = 0;
    emit('conteudo');
    toast('Vídeo pronto para revisar ▶');
  } catch (e) {
    modal(null);
    toast(e.name === 'AbortError' ? 'Cancelado. A IA pode estar sem cota agora — tente de novo em alguns minutos.' : e.message, true);
  } finally { clearTimeout(limite); }
}

/** Fábrica: monta sozinha todos os conteúdos que a rotina diária já roteirizou (ficam prontos para revisar). */
async function produzirPendentes(aviso) {
  const lista = (await api('/api/conteudos')).filter((c) => c.status === 'roteiro');
  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    aviso?.(`Montando ${i + 1} de ${lista.length}: ${c.titulo}`, i / lista.length);
    try { await abrirConteudo(c.projeto, c.id); } catch (e) { console.warn('fábrica', e); }
  }
  return lista.length;
}

const DUR_TRANS = { whip: 0.3, whip_v: 0.3, giro: 0.34, zoom: 0.3, flash: 0.24, luz: 0.5, glitch: 0.26, desfoque: 0.4, slide: 0.34, crossfade: 0.5, wipe: 0.4 };
const Y_ESTILO = {
  gancho: 0.32, impacto: 0.3, destaque: 0.3, lista: 0.46, cards: 0.42, grade: 0.42, contador: 0.34, letreiro: 0.42, checklist: 0.44,
  preco: 0.4, de_por: 0.4, etiqueta: 0.26, callout: 0.3, cta: 0.52, limpo: 0.3,
};

/** Batidas da música já na escala da timeline. */
function batidasNaTimeline() {
  const m = TL().musica;
  if (!m?.batidas?.length) return [];
  return m.batidas.map((b) => b - (m.offset || 0) + (m.inicio || 0)).filter((b) => b > 0);
}
const batidaPerto = (batidas, t, raio) => {
  let melhor = null;
  for (const b of batidas) if (Math.abs(b - t) <= raio && (melhor === null || Math.abs(b - t) < Math.abs(melhor - t))) melhor = b;
  return melhor;
};

function construirTimeline(r, falas, opts = {}) {
  const { semFala, apresentador } = opts;
  const tl = TL();
  const clips = [], textos = [], narracoes = [], sfx = [];
  const batidas = batidasNaTimeline();
  const addSfx = (tipo, quando, volume = 0.8) => {
    quando = Math.max(0, +quando.toFixed(2));
    if (sfx.some((s) => s.tipo === tipo && Math.abs(s.inicio - quando) < 0.3)) return;
    sfx.push({ id: uid('s'), tipo, inicio: quando, volume });
  };
  // ---- planos longos viram vários cortes (reenquadramento do mesmo take ou outro trecho): nada fica parado
  const ritmo = S.p.briefing?.ritmo || '';
  const maxPlano = /calmo/i.test(ritmo) ? 2.3 : /fren/i.test(ritmo) ? 0.95 : 1.45;
  const pool = (S.p.takes || []).filter((x) => x.proxy).flatMap((x) => (x.analise?.segmentos?.length ? x.analise.segmentos : [{ inicio: 0, fim: x.dur, foco_x: 0.5, nota: 5 }])
    .map((s) => ({ tk: x, s }))).sort((a, b) => (b.s.nota || 5) - (a.s.nota || 5));
  let iPool = 0;
  const doPool = (evitarTake) => {
    for (let n = 0; n < pool.length; n++) { const p = pool[(iPool++) % pool.length]; if (p.tk.id !== evitarTake) return p; }
    return pool[0];
  };
  const MOVS = ['zoom_in', 'pan_dir', 'zoom_out', 'pan_esq', 'subir', 'orbita', 'descer'];
  function subdividir(clip, inicioTL, tk) {
    const d = clip.dur;
    const n = Math.max(1, Math.round(d / maxPlano));
    if (n === 1 || !tk) return [clip];
    // pontos de corte iguais, puxados para a batida
    const pts = [inicioTL];
    for (let j = 1; j < n; j++) {
      let c = inicioTL + (d * j) / n;
      const b = batidaPerto(batidas, c, 0.2);
      if (b !== null) c = b;
      pts.push(clamp(c, pts[j - 1] + 0.35, inicioTL + d - 0.35 * (n - j)));
    }
    pts.push(inicioTL + d);
    const saida = [];
    let fonte = clip.in, takeAtual = tk;
    for (let j = 0; j < n; j++) {
      const dj = pts[j + 1] - pts[j];
      const sub = { ...clip, id: uid('c'), dur: dj, transicao: j === n - 1 ? clip.transicao : { tipo: 'corte', dur: 0.2 } };
      if (j > 0) {
        sub.rampa = j % 2 ? 'nenhuma' : clip.rampa; sub.impacto = false;
        sub.movimento = MOVS[(j + clips.length) % MOVS.length];
        const fechado = j % 2 === 1;
        sub.zoomBase = fechado ? 1.22 : 1; sub.punch = fechado && j % 4 === 1; // reenquadra sem dar "soco" em todo corte
        sub.focoX = clamp((clip.focoX ?? 0.5) + (fechado ? (j % 4 === 1 ? 0.12 : -0.12) : 0), 0, 1);
        sub.focoY = fechado ? 0.45 : 0.5;
      }
      const precisa = dj * fatorFonte(sub);
      if (fonte + precisa > takeAtual.dur - 0.05 && !clip.volume) { // acabou o take: puxa outro trecho (nunca no meio de uma fala)
        const p = doPool(takeAtual.id);
        if (p) { takeAtual = p.tk; fonte = p.s.inicio; sub.focoX = p.s.foco_x ?? 0.5; sub.zoomBase = 1; sub.punch = false; }
        if (fonte + precisa > takeAtual.dur) { fonte = Math.max(0, takeAtual.dur - precisa); if (takeAtual.dur < precisa) sub.speed = +clamp(takeAtual.dur / precisa, 0.4, 1).toFixed(2); }
      }
      sub.takeId = takeAtual.id; sub.in = fonte;
      sub.volume = takeAtual.analise?.tem_fala && clip.volume ? clip.volume : 0;
      fonte += dj * fatorFonte(sub);
      saida.push(sub);
    }
    return saida;
  }

  // ---- apresentador ----------------------------------------------------------------
  const falaDe = (tk) => !!(tk?.audio && (tk.analise?.tem_fala || tk.fala?.length));
  const usados = new Set();
  /** Trechos com fala dos planos da cena, na ordem, sem repetir. */
  function trechosDeVoz(pls) {
    const out = [];
    for (const pl of pls) {
      const tk = take(pl.take_id);
      if (!falaDe(tk)) continue;
      const ini = pl.inicio || 0, fim = pl.fim > ini ? pl.fim : tk.dur;
      const segs = tk.fala?.length ? tk.fala.filter((s) => s[1] > ini && s[0] < fim) : [[ini, fim]];
      for (const s of segs) {
        const a = Math.max(s[0], ini - 0.05), b = Math.min(s[1], fim + 0.05);
        const chave = `${tk.id}:${a.toFixed(1)}`;
        if (b - a < 0.25 || usados.has(chave)) continue;
        usados.add(chave);
        out.push({ tk, ini: +a.toFixed(2), fim: +b.toFixed(2) });
      }
    }
    return out;
  }
  /** Palavras da transcrição de cada trecho de fala (proporcional à duração do trecho). */
  function textoDoTrecho(tk, ini, fim) {
    const palavras = String(tk.analise?.transcricao || '').split(/\s+/).filter(Boolean);
    const segs = tk.fala?.length ? tk.fala : [[0, tk.dur]];
    const total = segs.reduce((s, x) => s + (x[1] - x[0]), 0) || 1;
    let acc = 0, a = null, b = null;
    for (const s of segs) {
      const p0 = acc / total; acc += s[1] - s[0]; const p1 = acc / total;
      if (s[1] > ini && s[0] < fim) { a = a ?? p0; b = p1; }
    }
    if (a === null) return '';
    return palavras.slice(Math.round(a * palavras.length), Math.round(b * palavras.length)).join(' ');
  }
  const brolls = () => pool.filter((p) => !falaDe(p.tk));
  let iBroll = 0, alterna = false;
  function montarApresentador(vozes, cena, iCena, t0) {
    // palavras-chave da cena (entre *asteriscos* na fala planejada), marcadas palavra a palavra
    const chaves = new Set([...String(cena.narracao || '').matchAll(/\*([^*]+)\*/g)]
      .flatMap((m) => m[1].toLowerCase().split(/\s+/)).map((w) => w.replace(/[^\p{L}\d]/gu, '')).filter((w) => w.length > 1 || /\d/.test(w)));
    // detalhes que a IA planejou para esta cena (sem fala) entram por cima da voz primeiro
    const doPlano = (cena.planos || []).map((pl) => ({ pl, tk: take(pl.take_id) })).filter((x) => x.tk && !falaDe(x.tk))
      .map((x) => ({ tk: x.tk, s: { inicio: x.pl.inicio || 0, foco_x: x.pl.foco_x ?? 0.5 } }));
    const clipBroll = (p, d) => {
      const c = { id: uid('c'), takeId: p.tk.id, in: p.s.inicio, dur: d, speed: 1, movimento: MOVS[iBroll % MOVS.length], rampa: 'nenhuma',
        punch: true, impacto: false, focoX: p.s.foco_x ?? 0.5, focoY: 0.5, filtro: r.filtro || 'nenhum', tremor: false, volume: 0, transicao: { tipo: 'corte', dur: 0.2 } };
      if (p.tk.dur - c.in < d) { c.in = Math.max(0, p.tk.dur - d); if (p.tk.dur < d) c.speed = +clamp(p.tk.dur / d, 0.4, 1).toFixed(2); }
      return c;
    };
    const clipApresentador = (v, ini, d) => {
      const c = { id: uid('c'), takeId: v.tk.id, in: ini, dur: d, speed: 1, movimento: 'deriva', rampa: 'nenhuma',
        punch: alterna, impacto: false, zoomBase: alterna ? 1.25 : 1, focoX: 0.5, focoY: 0.42, filtro: r.filtro || 'nenhum', tremor: false,
        volume: 0, transicao: { tipo: 'corte', dur: 0.2 } };
      alterna = !alterna; // jump cut: alterna aberto/fechado a cada frase
      return c;
    };
    let tt = t0;
    vozes.forEach((v, k) => {
      const d = v.fim - v.ini;
      let texto = textoDoTrecho(v.tk, v.ini, v.fim);
      if (chaves.size) texto = texto.split(/\s+/).map((w) => (chaves.has(w.toLowerCase().replace(/[^\p{L}\d]/gu, '')) ? `*${w}*` : w)).join(' ');
      narracoes.push({ id: uid('n'), inicio: +tt.toFixed(3), dur: +d.toFixed(3), url: v.tk.audio, in: v.ini, texto, volume: 1, voz: true });
      const planejado = doPlano.length ? doPlano.shift() : null;
      const candidato = planejado || (brolls().length ? brolls()[iBroll % brolls().length] : null);
      const abre = iCena === 0 && k === 0; // o gancho fica no rosto do apresentador
      if (candidato && !abre && d >= 2.4) {
        // L-cut: começa no apresentador e corta para o detalhe enquanto a voz continua
        const dA = +(d * 0.45).toFixed(2);
        clips.push(clipApresentador(v, v.ini, dA));
        iBroll++;
        clips.push(clipBroll(candidato, +(d - dA).toFixed(2)));
        addSfx('whoosh', tt + dA - 0.15, 0.35);
      } else if (candidato && !abre && d >= 0.9 && k % 3 === 2) {
        iBroll++;
        clips.push(clipBroll(candidato, d)); // a frase inteira coberta por imagem do carro
      } else {
        if (planejado) doPlano.unshift(planejado); // não usado nesta frase: fica para a próxima
        clips.push(clipApresentador(v, v.ini, d));
      }
      tt += d;
    });
    const ult = clips[clips.length - 1];
    if (ult && iCena < r.cenas.length - 1) {
      const tr = cena.planos?.[cena.planos.length - 1]?.transicao;
      if (tr && tr !== 'corte') { ult.transicao = { tipo: tr, dur: DUR_TRANS[tr] || 0.3 }; if (['whip', 'whip_v', 'giro', 'slide', 'zoom'].includes(tr)) addSfx('whoosh', tt - 0.2, 0.6); }
    }
  }

  const cenasIdx = []; // [inicioIdxClip, fimIdxClip, cena]
  let t = 0;
  r.cenas.forEach((cena, i) => {
    const idx0 = clips.length;
    cenasIdx.push([idx0, null, cena]);
    const fala = falas[i];
    const planos = cena.planos?.length ? cena.planos : [{ take_id: '', duracao_seg: cena.duracao_seg || 2, transicao: 'corte' }];
    // duração da cena: manda a narração; senão a soma dos planos
    const somaPlanos = planos.reduce((s, p) => s + (p.duracao_seg || 1), 0);
    let dur = fala ? Math.max(fala.dur + 0.3, 1.0) : Math.max(cena.duracao_seg || somaPlanos, 0.8);
    // apresentador: só os trechos com fala (pausas cortadas), voz contínua, imagens por cima
    const vozes = apresentador ? trechosDeVoz(planos) : [];
    if (vozes.length) dur = vozes.reduce((s, v) => s + (v.fim - v.ini), 0);
    // termina a cena numa batida (estica até 0,4 s) — nunca no apresentador (criaria silêncio)
    const bFim = !vozes.length && batidas.find((b) => b >= t + dur - 0.05 && b <= t + dur + 0.4);
    if (bFim) dur = bFim - t;

    // cortes internos proporcionais aos planos, puxados para a batida mais próxima
    const cortes = [t];
    let acc = 0;
    if (vozes.length) { let tv = t; for (const v of vozes.slice(0, -1)) { tv += v.fim - v.ini; cortes.push(tv); } }
    else for (let k = 0; k < planos.length - 1; k++) {
      acc += (planos[k].duracao_seg || 1) / somaPlanos;
      let c = t + dur * acc;
      const b = batidaPerto(batidas, c, 0.22);
      if (b !== null) c = b;
      c = clamp(c, cortes[cortes.length - 1] + 0.3, t + dur - 0.3 * (planos.length - 1 - k));
      cortes.push(c);
    }
    cortes.push(t + dur);

    if (vozes.length) montarApresentador(vozes, cena, i, t);
    else planos.forEach((pl, k) => {
      const d = cortes[k + 1] - cortes[k];
      if (d < 0.2) return;
      const tk = take(pl.take_id);
      const ultimoDoVideo = i === r.cenas.length - 1 && k === planos.length - 1;
      const tipoTr = ultimoDoVideo ? 'corte' : (pl.transicao || 'corte');
      const clip = {
        id: uid('c'), takeId: tk ? tk.id : '', in: pl.inicio || 0, dur: d, speed: 1,
        movimento: pl.movimento && pl.movimento !== 'nenhum' ? pl.movimento : 'deriva', rampa: pl.rampa || 'nenhuma',
        punch: !!pl.punch, impacto: !!pl.impacto, luz: false,
        focoX: pl.foco_x ?? 0.5, focoY: 0.5, filtro: r.filtro || 'nenhum', tremor: false,
        volume: apresentador && tk?.analise?.tem_fala ? 1 : 0,
        transicao: { tipo: tipoTr, dur: DUR_TRANS[tipoTr] || 0.3 },
      };
      if (tk) {
        const precisa = d * fatorFonte(clip);
        if (tk.dur - clip.in < precisa) {
          clip.in = Math.max(0, tk.dur - precisa);
          if (tk.dur < precisa) { clip.in = 0; clip.speed = +clamp(tk.dur / precisa, 0.4, 1).toFixed(2); }
        }
      }
      clips.push(...subdividir(clip, cortes[k], tk));
      if (['whip', 'whip_v', 'giro', 'slide', 'zoom', 'desfoque'].includes(tipoTr)) addSfx('whoosh', cortes[k + 1] - 0.2, 0.65);
      if (tipoTr === 'glitch') addSfx('clique', cortes[k + 1] - 0.05, 0.7);
      if (clip.impacto) addSfx('impacto', cortes[k], 0.7);
    });

    // texto cinético da cena
    let txt = (cena.texto_tela || '').trim();
    if (txt) {
      let est = cena.estilo_texto || 'impacto';
      if (est === 'preco' && txt.includes('|')) est = 'de_por';           // "De X | Por Y" sempre vira preço riscado
      if (est === 'callout') txt = txt.split('|').map((s) => s.trim()).filter(Boolean).join(' • ');
      const it = {
        id: uid('x'), inicio: +(i === 0 ? 0.02 : t + 0.08).toFixed(2), dur: Math.max(0.7, dur - 0.12), texto: txt,
        estilo: est, anim: cena.animacao || 'pop', animOut: 'fade', vida: cena.vida || 'nenhuma',
        x: 0.5, y: Y_ESTILO[est] ?? 0.3, tam: 1,
      };
      if (est === 'callout') {
        const alvo = { x: cena.callout_x ?? 0.5, y: cena.callout_y ?? 0.6 };
        const clipAlvo = clips.filter((c) => c.takeId).slice(-planos.length)[0];
        if (clipAlvo) {
          empacotarLocal(clips);
          const p = fonteParaTela(clipAlvo, alvo.x, alvo.y, clipAlvo.start + 0.3);
          alvo.x = clamp(p.x, 0.12, 0.88); alvo.y = clamp(p.y, 0.15, 0.85);
        }
        it.alvoX = alvo.x; it.alvoY = alvo.y;
        it.y = alvo.y > 0.5 ? alvo.y - 0.2 : alvo.y + 0.2;
      }
      // selos empilhados: "38.000 KM | Único dono | Revisado" vira várias pílulas entrando em sequência
      const selos = est === 'etiqueta' ? txt.split('|').map((s) => s.trim()).filter(Boolean) : [];
      if (selos.length > 1) {
        const passo = Math.min(0.6, Math.max(0.3, (it.dur - 0.6) / selos.length));
        const linhasDe = (s) => Math.max(1, Math.ceil(s.replace(/\*/g, '').length / 22)); // ~22 letras por linha a 90%
        let y = 0.19;
        selos.forEach((s, k) => {
          const h = 0.042 * linhasDe(s) + 0.02;
          const ini = +(it.inicio + k * passo).toFixed(2);
          textos.push({ ...it, id: uid('x'), texto: s, inicio: ini, dur: +(it.dur - k * passo).toFixed(2), y: +(y + h / 2).toFixed(3), tam: 0.9, anim: 'pop' });
          y += h + 0.012;
          addSfx('pop', ini + 0.05, 0.6);
        });
      } else textos.push(it);
      // som que acompanha o texto
      if (ESTILOS[est]?.opc) {
        // opcionais: cada item aparece no corte do plano que mostra aquele opcional
        const n = txt.split(/\n|;| \+ | • |\|/).filter((s) => s.trim()).length;
        if (planos.length >= n && n > 1) it.tempos = cortes.slice(0, n).map((c) => +Math.max(0.05, c - it.inicio + 0.04).toFixed(2));
        else {
          const passo = Math.min(0.9, Math.max(0.22, (it.dur - 0.6) / Math.max(1, n)));
          it.tempos = [...Array(n)].map((_, k) => +(0.08 + k * passo).toFixed(2));
        }
        const som = { lista: ['pop', 0.55], cards: ['whoosh', 0.5], grade: ['pop', 0.6], contador: ['impacto', 0.65], checklist: ['clique', 0.75] }[est];
        if (som) it.tempos.forEach((tp) => addSfx(som[0], it.inicio + tp + (est === 'contador' ? 0.15 : 0.02), som[1]));
        if (est === 'cards' || est === 'grade') it.tempos.forEach((tp) => addSfx('pop', it.inicio + tp + 0.2, 0.45));
        if (est === 'letreiro') addSfx('whoosh', it.inicio, 0.7);
      } else if (est === 'de_por') {
        addSfx('clique', it.inicio + 0.5, 0.6); addSfx('impacto', it.inicio + 0.85, 0.8); addSfx('dinheiro', it.inicio + 0.95, 0.7);
      } else if (est === 'preco') addSfx('dinheiro', it.inicio + 0.1, 0.75);
      else if ((est === 'etiqueta' && selos.length <= 1) || est === 'callout') addSfx('pop', it.inicio + 0.05, 0.6);
      else if (est === 'gancho' && (cena.animacao === 'slam')) addSfx('impacto', it.inicio + 0.17, 0.6);
    }

    if (fala) narracoes.push({ id: uid('n'), inicio: +(t + 0.1).toFixed(2), dur: fala.dur, url: fala.url, texto: cena.narracao, volume: 1 });
    else if (!semFala && !vozes.length && (cena.narracao || '').trim()) narracoes.push({ id: uid('n'), inicio: t, dur, url: null, texto: cena.narracao });

    const s = cena.sfx;
    if (s && s !== 'nenhum') addSfx(s, s === 'whoosh' ? t + dur - 0.22 : s === 'riser' ? Math.max(t, t + dur - 1.2) : t + 0.12, s === 'riser' ? 0.6 : 0.8);
    if (cena.etapa === 'oferta' && i > 0) addSfx('riser', Math.max(0, t - 1.2), 0.55);
    cenasIdx[cenasIdx.length - 1][1] = clips.length;
    t += dur;
  });

  // ---- valorização automática dos takes (usa a análise de cada trecho)
  empacotarLocal(clips);
  const segDe = (tk, ini) => {
    const ss = tk?.analise?.segmentos || [];
    return ss.find((s) => ini >= s.inicio - 0.05 && ini < s.fim) || ss.slice().sort((a, b) => Math.abs(a.inicio - ini) - Math.abs(b.inicio - ini))[0];
  };
  const info = (c) => { const tk = take(c.takeId); const s = segDe(tk, c.in); return { tk, s, d: `${s?.descricao || ''} ${s?.plano || ''} ${s?.camera || ''}`.toLowerCase() }; };
  const EXTERNO = /lateral|frente|frontal|traseira|carroceria|exterior|perfil|lataria|cap[oô]|3\/4|carro (inteiro|branco|todo)|ve[ií]culo/;
  let nBrilho = 0, nFlare = 0, ultimoFlare = -9;
  clips.forEach((c, i) => {
    if (!c.takeId) return;
    const { s, d } = info(c);
    if (/farol|far[oó]is|lanterna/.test(d) && s && nFlare < 2 && i - ultimoFlare > 2) {
      c.flare = { x: s.destaque_x ?? 0.5, y: s.destaque_y ?? 0.5 }; nFlare++; ultimoFlare = i;
    } else if (EXTERNO.test(d) && c.dur >= 0.6 && nBrilho < 4 && nBrilho++ % 2 === 0) c.brilho = true;
  });
  // momento foto: primeiro plano externo da oferta (o "carro herói")
  const oferta = cenasIdx.find(([, , cn]) => cn.etapa === 'oferta');
  const heroi = oferta && clips.slice(oferta[0], oferta[1]).find((c) => c.takeId && EXTERNO.test(info(c).d) && c.dur >= 0.9);
  if (heroi) { heroi.foto = true; heroi.flare = null; addSfx('clique', heroi.start, 0.95); addSfx('whoosh', heroi.start + 0.45, 0.5); }
  // tela dividida: uma vez por vídeo, numa cena de desejo/prova sem cards/grade por cima
  const takesDistintos = new Set(clips.map((c) => c.takeId).filter(Boolean));
  if (takesDistintos.size >= 2) {
    const alvoCena = cenasIdx.find(([a, b, cn]) => ['desejo', 'prova'].includes(cn.etapa) && b - a >= 2 && !['cards', 'grade'].includes(cn.estilo_texto));
    const c = alvoCena && clips[alvoCena[0] + 1];
    if (c && c.takeId && !c.foto) {
      const p = doPool(c.takeId);
      if (p) {
        const ini = Math.max(0, Math.min(p.s.inicio, p.tk.dur - c.dur));
        c.duplo = { takeId: p.tk.id, in: ini, focoX: p.s.foco_x ?? 0.5 };
        addSfx('whoosh', c.start, 0.6);
      }
    }
  }

  // apresentador: alterna plano aberto e fechado (punch-in) a cada frase
  if (apresentador) {
    let alterna = false;
    for (const c of clips) if (c.volume > 0) { c.zoomBase = alterna ? 1.25 : 1; c.punch = alterna; c.focoY = 0.4; alterna = !alterna; }
  }
  // cartela final da marca (logo, @ e WhatsApp)
  const mk = S.marca || {};
  if (mk.cartela !== false && (mk.logo || mk.instagram || mk.whatsapp) && clips.length) {
    const ult = clips[clips.length - 1];
    ult.transicao = { tipo: 'luz', dur: 0.5 };
    empacotarLocal(clips);
    const fimVideo = ult.start + ult.dur;
    clips.push({ id: uid('c'), takeId: '', in: 0, dur: opts?.story ? 1.3 : 1.8, speed: 1, movimento: 'parado', rampa: 'nenhuma', focoX: 0.5, focoY: 0.5,
      filtro: 'nenhum', transicao: { tipo: 'corte', dur: 0.2 }, volume: 0, cartela: true });
    addSfx('whoosh', fimVideo - 0.25, 0.6);
  }
  tl.sticker = null;
  dosarEfeitos(clips);
  separarTextos(textos);
  Object.assign(tl, { clips, textos, narracoes, sfx });
  // impacto quando cada palavra-chave "explode" na tela
  for (const k of palavrasChave()) addSfx('impacto', k.ini, 0.45);
  selecionar(null);
  mudou();
}

/** Edição profissional é dosada: soco de zoom e tranco só de vez em quando, nunca em clipes seguidos. */
function dosarEfeitos(clips) {
  let ultPunch = -9, ultImpacto = -9;
  const maxPunch = Math.max(2, Math.round(clips.length * 0.3));
  let nPunch = 0;
  clips.forEach((c, i) => {
    if (c.punch && c.volume <= 0) {
      if (i - ultPunch < 3 || nPunch >= maxPunch) c.punch = false; else { ultPunch = i; nPunch++; }
    }
    if (c.impacto) { if (i - ultImpacto < 5 || i === 0) c.impacto = false; else ultImpacto = i; }
    if (c.tremor && i > 0 && clips[i - 1].tremor) c.tremor = false;
  });
}

/** Dois textos na mesma altura ao mesmo tempo se atropelam: o anterior sai antes; se ficaria curto demais, o novo muda de altura. */
function separarTextos(textos) {
  const ord = [...textos].sort((a, b) => a.inicio - b.inicio);
  for (let i = 0; i < ord.length; i++) {
    for (let j = i + 1; j < ord.length; j++) {
      const a = ord[i], b = ord[j];
      if (b.inicio >= a.inicio + a.dur) break;
      const ya = a.y ?? 0.3, yb = b.y ?? 0.3;
      if (Math.abs(ya - yb) > 0.2) continue;
      if (b.inicio - a.inicio >= 0.7) a.dur = +(b.inicio - a.inicio - 0.05).toFixed(2);
      else b.y = ya < 0.45 ? 0.62 : 0.3;
    }
  }
}

function empacotarLocal(clips) { let t = 0; for (const c of clips) { c.start = t; t += c.dur; } }

// ================================================================ Stories (série diária)

async function gerarSerie(n = 4) {
  const c = S.p.carro || {};
  const falta = ['marca', 'modelo', 'ano', 'preco'].filter((k) => !String(c[k] || '').trim());
  if (falta.length) { abrirAba('carro'); return toast(`Preencha: ${falta.join(', ')}`, true); }
  pausar();
  await salvarAgora();
  modal('📅 Criando a série de Stories', `A IA está planejando ${n} stories diferentes deste carro (um por dia)…`, 0.3);
  try {
    S.p.serie = await api(`/api/projetos/${S.p.id}/serie`, { json: { n } });
    await atualizarMidias();
    modal(null);
    emit('roteiro');
    abrirAba('roteiro');
    toast(`${S.p.serie.stories.length} stories prontos — abra cada um ou exporte todos`);
  } catch (e) { modal(null); toast(e.message, true); }
}

async function abrirStory(i) {
  const st = S.p.serie?.stories?.[i];
  if (!st) return;
  pausar();
  if (!TL().musica || TL().musica.gerada) {
    const enviadas = (S.p.musicas || []).filter((m) => !m.nome.startsWith('Trilha '));
    if (enviadas.length && !TL().musica) await usarMusica(enviadas[0]);
    else if (!enviadas.length && !TL().musica) await criarTrilha('phonk');
  }
  construirTimeline({ filtro: st.filtro, cenas: st.cenas }, st.cenas.map(() => null), { semFala: true, apresentador: false, story: true });
  TL().sticker = { tipo: st.sticker, texto: st.texto_sticker };
  S.storyAtual = i;
  mudou();
  buscar(0);
  emit('roteiro');
}

async function exportarSerie() {
  const lista = S.p.serie?.stories || [];
  if (!lista.length) return;
  const sinal = { cancelado: false };
  const carro = `${S.p.carro?.marca || ''}_${S.p.carro?.modelo || ''}`;
  const hoje = new Date().toISOString().slice(0, 10);
  const prontos = [];
  try {
    for (let i = 0; i < lista.length; i++) {
      if (sinal.cancelado) break;
      await abrirStory(i);
      await new Promise((r) => setTimeout(r, 800));
      const url = await exportar({ nome: `${hoje}_${carro}_story${i + 1}_${lista[i].titulo}`.slice(0, 90), rotulo: `Story ${i + 1} de ${lista.length}`, sinal });
      if (url) prontos.push([lista[i], url]);
    }
  } catch (e) { toast(e.message, true); }
  if (prontos.length) {
    const carroTxt = `${S.p.carro?.marca || ''} ${S.p.carro?.modelo || ''}`.trim();
    let base = new Date();
    const entradas = prontos.map(([st, url]) => {
      const q = proximaData(st.dia, base);
      return { ...q, tipo: 'Stories', pilar: 'Vitrine', titulo: `${carroTxt}: ${st.titulo}`, ideia: st.objetivo, sticker: `${st.sticker}: ${st.texto_sticker}`,
        arquivo: url, projeto: S.p.id, carro: carroTxt, status: 'pronto', cta: S.marca?.cta || '' };
    });
    try { await agendar(entradas); } catch (e) { toast(e.message, true); }
  }
  modal(`✅ ${prontos.length} stories prontos — já estão no 📅 Calendário`, prontos.map(([st, url], k) =>
    `<div style="margin:6px 0"><b>${k + 1}. ${st.titulo}</b> <span class="muted">· ${st.dia}</span><br>
     <span class="muted">Sticker: ${st.sticker} — “${st.texto_sticker}”</span><br><a class="btn mini" href="${url}" download>⬇ Baixar</a></div>`).join(''),
  1, [['Fechar', () => modal(null)]]);
}

/** Gera (ou reaproveita) uma trilha sintetizada e coloca no vídeo com as batidas exatas. */
async function criarTrilha(estilo) {
  const cfg = ESTILOS_TRILHA[estilo] || ESTILOS_TRILHA.house;
  const nome = `Trilha ${cfg.nome} · ${cfg.bpm} BPM`;
  let m = (S.p.musicas || []).find((x) => x.nome === nome);
  if (!m) {
    const { buffer } = await gerarTrilha({ estilo, dur: 46 });
    const fd = new FormData();
    fd.append('arquivo', new File([paraWav(buffer)], `${nome}.wav`, { type: 'audio/wav' }));
    m = await api(`/api/projetos/${S.p.id}/musicas`, { method: 'POST', body: fd });
    await atualizarMidias();
  }
  const batidas = [];
  for (let t = 0; t < 46; t += 60 / cfg.bpm) batidas.push(+t.toFixed(4));
  TL().musica = { id: m.id, nome, url: m.arquivo, inicio: 0, offset: 0, volume: 0.42, ducking: true, batidas, bpm: cfg.bpm, gerada: true, estilo };
  mudou();
  emit('midias');
}

async function regerarNarracoes() {
  const itens = TL().narracoes.filter((n) => !n.voz && n.texto?.trim()); // inclui falas que ficaram sem áudio
  if (!itens.length) return toast('Não há falas de narração neste vídeo.', true);
  const b = S.p.briefing;
  try {
    modal('🎙 Gravando a narração', `Voz: ${b.voz}`, 0.5);
    const res = await api(`/api/projetos/${S.p.id}/narrar`, { json: { linhas: itens.map((n) => n.texto), voz: b.voz, estilo: [b.estilo, S.p.roteiro?.estilo_narracao].filter(Boolean).join('. ') } });
    itens.forEach((n, i) => { if (res[i]) Object.assign(n, res[i]); });
    modal(null); mudou(); toast('Narração regravada');
  } catch (e) { modal(null); toast(e.message, true); }
}

async function narrarItem(n, texto) {
  const b = S.p.briefing;
  try {
    toast('Gravando a fala…');
    const [res] = await api(`/api/projetos/${S.p.id}/narrar`, { json: { linhas: [texto], voz: b.voz, estilo: [b.estilo, S.p.roteiro?.estilo_narracao].filter(Boolean).join('. ') } });
    if (res) Object.assign(n, res, { texto });
    mudou(); toast('Fala regravada');
  } catch (e) { toast(e.message, true); }
}

// ================================================================ edição

function dividir() {
  const tl = TL();
  let c = S.sel?.tipo === 'clip' ? acharItem('clip', S.sel.id) : null;
  if (!c || S.t <= c.start || S.t >= c.start + c.dur) c = tl.clips.find((x) => S.t > x.start && S.t < x.start + x.dur);
  if (!c) return toast('Coloque o cursor sobre um clipe para dividir.', true);
  const corte = S.t - c.start;
  if (corte < 0.15 || c.dur - corte < 0.15) return toast('Muito perto da borda do clipe.', true);
  const novo = { ...JSON.parse(JSON.stringify(c)), id: uid('c'), in: srcTimeClip(c, S.t), dur: c.dur - corte, rampa: 'nenhuma', punch: false, impacto: false };
  c.rampa = 'nenhuma';
  c.dur = corte;
  c.transicao = { tipo: 'corte', dur: 0.35 };
  tl.clips.splice(tl.clips.indexOf(c) + 1, 0, novo);
  mudou();
  selecionar('clip', novo.id);
}

function apagarSelecionado() {
  if (!S.sel) return;
  const tl = TL();
  const { tipo, id } = S.sel;
  if (tipo === 'musica') tl.musica = null;
  else {
    const k = { clip: 'clips', texto: 'textos', narracao: 'narracoes', sfx: 'sfx' }[tipo];
    tl[k] = tl[k].filter((x) => x.id !== id);
  }
  selecionar(null);
  mudou();
  if (tipo === 'musica') emit('midias');
}

function adicionarTexto() {
  const it = { id: uid('x'), inicio: +S.t.toFixed(2), dur: 2, texto: 'SEU *TEXTO*', estilo: 'impacto', anim: 'palavras', animOut: 'fade', vida: 'flutuar', x: 0.5, y: 0.3, tam: 1 };
  TL().textos.push(it);
  mudou();
  selecionar('texto', it.id);
}

// ================================================================ exportação

const nomeArquivo = (s) => (s || 'video').normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'video';

/** Exporta a timeline atual. `lote` = { rotulo, sinal } quando faz parte de uma exportação em série (sem janela final). */
async function exportar(opcoes = {}) {
  if (!TL().clips.length && !TL().textos.length) { toast('A linha do tempo está vazia.', true); return null; }
  pausar();
  const total = duracao();
  const fps = 30, n = Math.round(total * fps);
  const sinal = opcoes.sinal || { cancelado: false };
  const cancelar = ['Cancelar', () => { sinal.cancelado = true; }, 'perigo'];
  const titulo = opcoes.rotulo ? `⬇ ${opcoes.rotulo}` : '⬇ Exportando MP4';
  exportando = true;
  let jid = null;
  try {
    modal(titulo, 'Preparando os vídeos…', 0.01, [cancelar]);
    await motor.prontoParaExportar();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    ({ id: jid } = await api('/api/render/iniciar', { json: { fps, w: W, h: H } }));
    let pendentes = [];
    const inicio = performance.now();
    for (let f = 0; f < n; f++) {
      if (sinal.cancelado) throw new Error('Exportação cancelada.');
      const t = f / fps;
      await motor.posicionar(t);
      c2.setTransform(1, 0, 0, 1, 0, 0);
      motor.desenhar(c2, t, { exportando: true });
      c2.getImageData(0, 0, 1, 1); // força o desenho AGORA (o Chrome adia; sem isso o quadro sai com a imagem do próximo = trepidação)
      // a compressão JPEG roda em paralelo com a busca do próximo quadro
      pendentes.push(new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.92)));
      if (pendentes.length === 20 || f === n - 1) {
        const blobs = await Promise.all(pendentes);
        const lote = new FormData();
        blobs.forEach((b, k) => lote.append(`f${String(f - blobs.length + 1 + k).padStart(6, '0')}`, b));
        await api(`/api/render/${jid}/quadros`, { method: 'POST', body: lote });
        pendentes = [];
        const seg = (performance.now() - inicio) / 1000;
        const resta = (seg / (f + 1)) * (n - f - 1);
        modal(titulo, `Quadro ${f + 1} de ${n} · falta ~${Math.ceil(resta)}s`, ((f + 1) / n) * 0.85, [cancelar]);
      }
    }
    modal(titulo, 'Mixando música, narração e efeitos…', 0.88, [cancelar]);
    const wav = paraWav(await mixar());
    const fd = new FormData();
    fd.append('audio', wav, 'audio.wav');
    fd.append('nome', nomeArquivo(opcoes.nome || (S.conteudo ? [S.conteudo.data, S.conteudo.tipo, S.p.carro?.modelo, S.conteudo.titulo].filter(Boolean).join(' ') : S.p.nome) || 'reels'));
    modal(titulo, 'Codificando o MP4 final em alta qualidade…', 0.94);
    const { url } = await api(`/api/render/${jid}/finalizar`, { method: 'POST', body: fd });
    jid = null;
    if (S.conteudo?.projeto === S.p.id && !opcoes.rotulo) {
      const r = S.p.roteiro || {};
      const legenda = [r.legenda_post, (r.hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')].filter(Boolean).join('\n\n');
      S.conteudo = { ...S.conteudo, ...(await api(`/api/projetos/${S.p.id}/conteudos/${S.conteudo.id}`, { method: 'PUT', json: { arquivo: url, status: 'pronto', legenda } })), projeto: S.p.id };
      emit('conteudo');
      if (S.conteudo.entrada) { modal(null); toast('✅ Vídeo pronto e já ligado à postagem da agenda.'); return url; }
    }
    if (!opcoes.rotulo) {
      modal('✅ Vídeo pronto!', `${fmt(total)} · 1080×1920 · 30 fps · H.264 + AAC — pronto para subir no Meta Ads.`, 1, [
        ['⬇ Baixar MP4', () => { const a = document.createElement('a'); a.href = url; a.click(); }, 'primario'],
        ['📅 Agendar', async () => {
          const r = S.p.roteiro || {};
          const tipo = S.p.briefing?.destino === 'Stories' ? 'Stories' : 'Reels';
          const q = proximaData(tipo === 'Reels' ? 'quarta 18h' : '12h');
          const carroTxt = `${S.p.carro?.marca || ''} ${S.p.carro?.modelo || ''}`.trim();
          await agendar([{ ...q, tipo, pilar: 'Vitrine', titulo: S.p.nome || carroTxt, ideia: r.angulo_de_venda || '', gancho: r.ganchos_alternativos?.[0] || '',
            legenda: [r.legenda_post, (r.hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')].filter(Boolean).join('\n\n'),
            arquivo: url, projeto: S.p.id, carro: carroTxt, status: 'pronto', cta: S.marca?.cta || '' }]);
          modal(null);
        }],
        ['Fechar', () => modal(null)],
      ]);
    }
    return url;
  } catch (e) {
    if (jid) fetch(`/api/render/${jid}`, { method: 'DELETE' });
    if (opcoes.rotulo) throw e;
    modal(null);
    toast(e.message, true);
    return null;
  } finally {
    exportando = false;
  }
}

// ================================================================ arrastar na prévia (textos e enquadramento)

function coordsLogicas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, escala: W / r.width };
}

function arrastarNaPrevia(e) {
  if (!S.p?.timeline || e.button !== 0) return;
  const p0 = coordsLogicas(e);
  const tl = TL();
  // 1) texto visível mais próximo do clique (ou o alvo de um callout)
  let melhor = null;
  for (const it of tl.textos) {
    if (S.t < it.inicio || S.t > it.inicio + it.dur) continue;
    const cands = [{ k: 'rotulo', x: (it.x ?? 0.5) * W, y: (it.y ?? 0.3) * H }];
    if (ESTILOS[it.estilo]?.callout) cands.push({ k: 'alvo', x: (it.alvoX ?? 0.5) * W, y: (it.alvoY ?? 0.62) * H });
    for (const c of cands) {
      const dx = Math.abs(c.x - p0.x), dy = Math.abs(c.y - p0.y);
      const limY = ESTILOS[it.estilo]?.lista ? 380 : 170 * (it.tam || 1);
      if (dx < 460 && dy < limY) {
        const d = dx / 4 + dy;
        if (!melhor || d < melhor.d) melhor = { it, k: c.k, d };
      }
    }
  }
  let alvo = null, orig = null;
  if (melhor) {
    selecionar('texto', melhor.it.id);
    alvo = melhor;
    orig = melhor.k === 'alvo' ? { x: melhor.it.alvoX ?? 0.5, y: melhor.it.alvoY ?? 0.62 } : { x: melhor.it.x ?? 0.5, y: melhor.it.y ?? 0.3 };
  } else {
    // 2) senão, o clipe do momento: arrastar reenquadra o vídeo
    const at = ativos(S.t);
    if (!at) return;
    const c = at.b && at.p >= 0.5 ? at.b : at.a;
    selecionar('clip', c.id);
    alvo = { clip: c };
    orig = { x: c.focoX ?? 0.5, y: c.focoY ?? 0.5 };
  }
  canvas.setPointerCapture(e.pointerId);
  let moveu = false;
  const mover = (ev) => {
    const p = coordsLogicas(ev);
    const dx = (p.x - p0.x) / W, dy = (p.y - p0.y) / H;
    if (Math.abs(dx) + Math.abs(dy) > 0.004) moveu = true;
    if (!moveu) return;
    if (alvo.clip) {
      alvo.clip.focoX = clamp(orig.x - dx * 0.8, 0, 1);
      alvo.clip.focoY = clamp(orig.y - dy * 0.8, 0, 1);
    } else {
      let nx = clamp(orig.x + dx, 0.05, 0.95), ny = clamp(orig.y + dy, 0.05, 0.95);
      if (Math.abs(nx - 0.5) < 0.02) nx = 0.5; // ímã no centro
      if (alvo.k === 'alvo') { alvo.it.alvoX = nx; alvo.it.alvoY = ny; } else { alvo.it.x = nx; alvo.it.y = ny; }
    }
    mudou(true);
  };
  canvas.addEventListener('pointermove', mover);
  canvas.addEventListener('pointerup', () => { canvas.removeEventListener('pointermove', mover); if (moveu) mudou(); }, { once: true });
}

// ================================================================ início

function atalhos(e) {
  if (e.target.matches('input, textarea, select')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); alternar(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer(); }
  else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); refazer(); }
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); apagarSelecionado(); }
  else if (k === 's' && !e.ctrlKey) dividir();
  else if (k === 't') adicionarTexto();
  else if (k === 'arrowright') buscar(S.t + (e.shiftKey ? 1 : 1 / 30));
  else if (k === 'arrowleft') buscar(S.t - (e.shiftKey ? 1 : 1 / 30));
  else if (k === 'home') buscar(0);
  else if (k === 'escape') selecionar(null);
}

async function iniciar() {
  iniciarTimeline({ buscar });
  iniciarCalendario({ abrirAba, abrirProjeto: async (id) => { await salvarAgora(); await listarProjetos(id); $('#sel-projeto').value = id; await abrirProjeto(id); } });
  iniciarPaineis({ buscar, montar, regerarNarracoes, narrarItem, dividir, apagarSelecionado, atualizarMidias, atualizarRefs, player, criarTrilha,
    gerarSerie, abrirStory, exportarSerie });

  iniciarSimples({ abrirConteudo, gerarConteudo, novoConteudo, exportar, narrarItem, regerarNarracoes, buscar,
    abrirFicha: (pid) => abrirCentral('estoque', { carro: pid }) });
  $('#btn-play').onclick = alternar;
  $('#btn-inicio').onclick = () => buscar(0);
  $('#btn-montar').onclick = () => montar();
  $('#btn-versao').onclick = () => montar({ evitar: [S.p.roteiro?.formato].filter(Boolean) });
  $('#btn-exportar').onclick = () => exportar();
  $('#btn-desfazer').onclick = desfazer;
  $('#btn-refazer').onclick = refazer;
  $('#btn-novo').onclick = novoProjeto;
  $('#tl-dividir').onclick = dividir;
  $('#tl-apagar').onclick = apagarSelecionado;
  $('#tl-texto').onclick = adicionarTexto;
  $('#chk-zona').onchange = (e) => { S.zonaSegura = e.target.checked; };
  $('#chk-hq').onchange = definirResolucao;
  $('#sel-projeto').onchange = async (e) => { await salvarAgora(); abrirProjeto(e.target.value); };
  $('#nome-projeto').oninput = (e) => { S.p.nome = e.target.value; mudou(); };
  $('#nome-projeto').onchange = () => listarProjetos(S.p.id);
  document.addEventListener('keydown', atalhos);
  canvas.addEventListener('pointerdown', arrastarNaPrevia);
  canvas.style.cursor = 'move';
  on('salvo', (txt) => ($('#status-salvo').textContent = txt));
  on('mudou', () => { motor.sincronizarElementos(); atualizarAvisoVazio(); });
  window.addEventListener('beforeunload', () => salvarAgora());

  try { S.formatos = await api('/api/formatos'); } catch { S.formatos = {}; }
  try { S.marca = await api('/api/marca'); } catch { S.marca = {}; }
  await aplicarFontesMarca();
  let lista = await listarProjetos();
  if (!lista.length) {
    await api('/api/projetos', { json: { nome: 'Meu primeiro vídeo' } });
    lista = await listarProjetos();
  }
  let ultimo = null;
  try { ultimo = localStorage.getItem('ultimoProjeto'); } catch { /* */ }
  const id = lista.find((p) => p.id === ultimo)?.id || lista[0].id;
  $('#sel-projeto').value = id;
  await abrirProjeto(id);
  await atualizarRefs();
  requestAnimationFrame(quadro);
  abrirCentral('central'); // o app abre nas ordens do dia
  window.estudio = { S, montar, abrirConteudo, gerarConteudo, produzirPendentes, exportar, construirTimeline, buscar, tocar, pausar, abrirProjeto, motor, abrirStory, exportarSerie }; // acesso para depuração
}

iniciar().catch((e) => toast(`Erro ao iniciar: ${e.message}`, true));
