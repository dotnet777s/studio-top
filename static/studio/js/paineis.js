// Painéis laterais (Carro, Takes, Áudio, Referências, Roteiro) e o Inspetor de propriedades.
import { S, TL, take, api, mediaUrl, marcaUrl, aplicarFontesMarca, mudou, agendarSalvar, salvarAgora, selecionar, acharItem, uid, clamp, esc, fmt, toast, modal, emit, on, duracao } from './estado.js';
import { FILTROS, TRANSICOES, ANIMACOES, SAIDAS, ESTILOS, LEGENDAS, MOVIMENTOS, RAMPAS, VIDAS, maxDurClip, cor, contraste } from './motor.js';
import { SFX, buffer, detectarBatidas, paraWav } from './audio.js';
import { ESTILOS_TRILHA, gerarTrilha } from './trilha.js';

const $ = (s, r = document) => r.querySelector(s);
let C = {}; // funções vindas do main (buscar, player, narrarItem, regerarNarracoes)

export const VOZES = {
  Puck: 'Puck — animado', Fenrir: 'Fenrir — empolgado', Kore: 'Kore — firme (fem.)', Orus: 'Orus — firme',
  Charon: 'Charon — informativo', Zephyr: 'Zephyr — claro (fem.)', Leda: 'Leda — jovem (fem.)',
  Aoede: 'Aoede — leve (fem.)', Achird: 'Achird — amigável', Sadachbia: 'Sadachbia — vivo',
};
const FORMATOS = ['Locução em off com imagens do carro', 'Apresentador falando para a câmera', 'Só texto na tela + música (sem fala)'];
const RITMOS = [
  'Calmo / premium (1 a 2 planos por cena)',
  'Dinâmico (2 a 3 planos por cena, ~1 corte a cada 1-1,5 s)',
  'Frenético estilo car edit (3 a 4 planos por cena, corte a cada batida)',
];
const TONS = ['Automático', 'Energético e urgente', 'Premium / sofisticado', 'Próximo e de confiança', 'Divertido / descontraído', 'Racional / custo-benefício'];

const opcoes = (obj, atual) => Object.entries(obj).map(([v, r]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(typeof r === 'string' ? r : r.nome)}</option>`).join('');
const lista = (arr, atual) => arr.map((v) => `<option ${v === atual ? 'selected' : ''}>${esc(v)}</option>`).join('');

export function iniciarPaineis(funcs) {
  C = funcs;
  document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));
  on('selecao', inspetor);
  on('mudou', () => { inspetor(); });
  on('midias', () => { painelTakes(); painelAudio(); });
  on('roteiro', painelRoteiro);
  on('refs', () => { painelRefs(); painelMarca(); });
  document.addEventListener('focar-transicao', () => setTimeout(() => $('#insp-transicao')?.scrollIntoView({ block: 'center' }), 30));
}

export function abrirAba(nome) {
  document.querySelectorAll('.abas button').forEach((b) => b.classList.toggle('on', b.dataset.aba === nome));
  document.querySelectorAll('.painel').forEach((p) => (p.hidden = p.id !== `aba-${nome}`));
}

export function renderizarTudo() {
  painelCarro(); painelGravacao(); painelTakes(); painelAudio(); painelRefs(); painelRoteiro(); painelMarca(); inspetor();
}

// ================================================================ Carro + briefing

const CAMPOS_CARRO = [
  ['marca', 'Marca *', 'Jeep'], ['modelo', 'Modelo *', 'Compass'], ['ano', 'Ano *', '2021/2022'], ['preco', 'Preço *', 'R$ 129.900'],
  ['versao', 'Versão / motor', 'Longitude 1.3 Turbo'], ['km', 'Km', '38.000 km'], ['cor', 'Cor', 'Branco'], ['cambio', 'Câmbio', 'Automático'],
  ['fipe', 'Valor FIPE', 'R$ 134.000'], ['entrada', 'Entrada', 'R$ 30.000'],
];

function painelCarro() {
  const c = (S.p.carro ||= {});
  const b = (S.p.briefing ||= { duracao: 30, formato: FORMATOS[0], tom: 'Automático', voz: 'Puck', estilo: '' });
  const campo = ([k, rot, ph]) => `<label>${rot}<input data-c="${k}" value="${esc(c[k] || '')}" placeholder="${esc(ph)}"></label>`;
  const pares = [];
  for (let i = 0; i < CAMPOS_CARRO.length; i += 2) pares.push(`<div class="linha2">${campo(CAMPOS_CARRO[i])}${campo(CAMPOS_CARRO[i + 1])}</div>`);
  $('#aba-carro').innerHTML = `
    <h4>O carro</h4>
    ${pares.join('')}
    <label>Parcela<input data-c="parcela" value="${esc(c.parcela || '')}" placeholder="48x de R$ 2.390"></label>
    <label>Opcionais / diferenciais<textarea data-c="diferenciais" placeholder="Teto solar, CarPlay, couro...">${esc(c.diferenciais || '')}</textarea></label>
    <label>Procedência<input data-c="procedencia" value="${esc(c.procedencia || '')}" placeholder="Único dono, revisões na concessionária, laudo aprovado"></label>
    <label>Condição especial / urgência real<input data-c="condicoes" value="${esc(c.condicoes || '')}" placeholder="Preço até sábado, IPVA pago..."></label>
    <div class="acoes" style="margin-bottom:10px">
      <label class="chk"><input type="checkbox" data-c="aceita_troca" ${c.aceita_troca ? 'checked' : ''}> Aceita troca</label>
      <label class="chk"><input type="checkbox" data-c="financia" ${c.financia ? 'checked' : ''}> Financia</label>
    </div>
    <div class="linha2">
      <label>Loja<input data-c="loja" value="${esc(c.loja || '')}"></label>
      <label>Cidade<input data-c="cidade" value="${esc(c.cidade || '')}"></label>
    </div>
    <label>Observações para a IA<textarea data-c="observacoes" placeholder="Pneus novos, chave reserva, nunca bateu...">${esc(c.observacoes || '')}</textarea></label>

    <h4>O vídeo</h4>
    <div class="linha2">
      <label>Duração<select data-b="duracao">${[15, 20, 30].map((d) => `<option value="${d}" ${+b.duracao === d ? 'selected' : ''}>${d}s</option>`).join('')}</select></label>
      <label>CTA<select data-c="cta_canal">${lista(['WhatsApp', 'Direct do Instagram', 'Visita à loja'], c.cta_canal || 'WhatsApp')}</select></label>
    </div>
    <label>Destino<select data-b="destino">${lista(['Reels', 'Stories'], b.destino || 'Reels')}</select></label>
    <label>Roteiro<select data-b="formato_roteiro">${opcoes({ auto: '🎲 Automático — muda a cada vídeo', ...(S.formatos || {}) }, b.formato_roteiro || 'auto')}</select></label>
    <label>Formato de gravação<select data-b="formato">${lista(FORMATOS, b.formato)}</select></label>
    <div class="linha2">
      <label>Tom<select data-b="tom">${lista(TONS, b.tom)}</select></label>
      <label>Ritmo da edição<select data-b="ritmo">${lista(RITMOS, b.ritmo || RITMOS[1])}</select></label>
    </div>
    <label>Público-alvo<input data-b="publico" value="${esc(b.publico || '')}" placeholder="Vazio = a IA decide"></label>
    <div class="linha2">
      <label>Voz da narração<select data-b="voz">${opcoes(VOZES, b.voz || 'Puck')}</select></label>
      <label>Jeito de falar<input data-b="estilo" value="${esc(b.estilo || '')}" placeholder="animado, jovem"></label>
    </div>
    <button class="destaque" style="width:100%;justify-content:center;padding:11px" id="btn-montar-2">🎬 Montar vídeo com IA</button>
    <div class="linha2" style="grid-template-columns:1fr auto;margin-top:8px">
      <button id="btn-serie" style="justify-content:center">📅 Série de Stories (1 por dia)</button>
      <select id="serie-n" style="width:70px">${[3, 4, 5, 6].map((x) => `<option ${x === 4 ? 'selected' : ''}>${x}</option>`).join('')}</select>
    </div>
    <p class="muted" style="font-size:11px">A IA escolhe os melhores trechos dos takes, escreve o roteiro, grava a narração e monta a edição com textos, transições e efeitos. Depois você ajusta tudo na linha do tempo.</p>`;
  $('#aba-carro').querySelectorAll('[data-c]').forEach((i) => i.addEventListener('input', () => {
    c[i.dataset.c] = i.type === 'checkbox' ? i.checked : i.value; agendarSalvar();
  }));
  $('#aba-carro').querySelectorAll('[data-b]').forEach((i) => i.addEventListener('input', () => { b[i.dataset.b] = i.value; agendarSalvar(); }));
  $('#btn-montar-2').onclick = () => C.montar();
  $('#btn-serie').onclick = () => C.gerarSerie(+$('#serie-n').value);
}

// ================================================================ Gravação (pré-roteiro)

const EQUIPAMENTOS = ['Celular na mão', 'Celular + gimbal (estabilizador)', 'Câmera profissional + gimbal'];

function textoPreRoteiro(p) {
  const L = [`🎬 PRÉ-ROTEIRO — ${p.titulo}`, `Formato: ${p.formato_nome}`, `Ideia: ${p.conceito}`, `Gancho: ${p.gancho}`, '',
    `📋 TAKES (${p.takes.length}) — grave cada um com sobra de tempo e sempre com movimento:`];
  for (const t of p.takes) {
    L.push(`${t.n}. ${t.nome}${t.essencial ? ' ⭐' : ''}${t.camera_lenta ? ' (CÂMERA LENTA)' : ''} — ${t.segundos}s`);
    L.push(`   O quê: ${t.o_que_gravar}`, `   Enquadramento: ${t.enquadramento}`, `   Movimento: ${t.movimento}`);
    if (t.fala) L.push(`   🗣 Fala: "${t.fala}"`);
    if (t.dica) L.push(`   💡 ${t.dica}`);
  }
  if (p.narracao_off?.length) L.push('', '🎙 NARRAÇÃO (off):', ...p.narracao_off.map((f) => `- ${f}`));
  L.push('', '🧽 PREPARAR O CARRO:', ...p.preparacao_carro.map((x) => `- ${x}`));
  L.push('', '📱 CÂMERA E LUZ:', ...p.camera_e_luz.map((x) => `- ${x}`));
  if (p.dicas_apresentador?.length) L.push('', '🎤 APRESENTADOR:', ...p.dicas_apresentador.map((x) => `- ${x}`));
  return L.join('\n');
}

function teleprompter(p) {
  const falas = p.takes.filter((t) => t.fala).map((t) => `<div class="f"><small>Take ${t.n} · ${esc(t.nome)}</small>${esc(t.fala)}</div>`).join('');
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups para abrir o teleprompter.', true);
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Teleprompter</title><style>
    body{margin:0;background:#000;color:#fff;font:700 56px/1.35 system-ui,sans-serif;padding:40px 8vw}
    .f{margin:0 0 70px} small{display:block;font-size:20px;color:#ffb020;font-weight:600;margin-bottom:6px}
    .barra{position:fixed;top:0;left:0;right:0;background:#111;padding:8px 14px;font:14px system-ui;color:#aaa}
  </style><div class="barra">Clique para iniciar/pausar a rolagem · roda do mouse ajusta</div><div style="height:30vh"></div>${falas || '<div class="f">Este pré-roteiro não tem falas (narração em off).</div>'}<div style="height:80vh"></div>
  <script>let on=false;document.onclick=()=>on=!on;setInterval(()=>{if(on)scrollBy(0,2)},30)<\/script>`);
}

function imprimir(p) {
  const w = window.open('', '_blank');
  if (!w) return toast('Permita pop-ups para imprimir.', true);
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(p.titulo)}</title><style>
    body{font:14px/1.45 system-ui,sans-serif;max-width:800px;margin:24px auto;color:#111;padding:0 16px} h1{font-size:22px;margin:0 0 4px}
    .t{border:1px solid #ccc;border-radius:8px;padding:8px 12px;margin:8px 0;break-inside:avoid} .t b{font-size:15px}
    .box{display:inline-block;width:14px;height:14px;border:2px solid #333;border-radius:3px;margin-right:6px;vertical-align:-2px}
    .fala{background:#eef8f1;padding:4px 8px;border-radius:6px;margin-top:4px} small{color:#666}
  </style><h1>🎬 ${esc(p.titulo)}</h1><p><b>Formato:</b> ${esc(p.formato_nome)} · <b>Ideia:</b> ${esc(p.conceito)}<br><b>Gancho:</b> ${esc(p.gancho)}</p>
  ${p.takes.map((t) => `<div class="t"><span class="box"></span><b>${t.n}. ${esc(t.nome)}</b> ${t.essencial ? '⭐' : ''} ${t.camera_lenta ? '· <b>CÂMERA LENTA</b>' : ''} · ${t.segundos}s
    <br><small>${esc(t.uso)}</small><br>${esc(t.o_que_gravar)}<br><small>Enquadramento:</small> ${esc(t.enquadramento)} · <small>Movimento:</small> ${esc(t.movimento)}
    ${t.fala ? `<div class="fala">🗣 “${esc(t.fala)}”</div>` : ''}${t.dica ? `<br><small>💡 ${esc(t.dica)}</small>` : ''}</div>`).join('')}
  <h3>Preparar o carro</h3><ul>${p.preparacao_carro.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  <h3>Câmera e luz</h3><ul>${p.camera_e_luz.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
  ${p.dicas_apresentador?.length ? `<h3>Apresentador</h3><ul>${p.dicas_apresentador.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  <script>setTimeout(()=>print(),300)<\/script>`);
}

export function painelGravacao() {
  const box = $('#aba-gravacao');
  const p = S.p.prerroteiro;
  const b = S.p.briefing || {};
  const opcoesForm = `
    <label>Quem aparece no vídeo<select id="pr-formato">${lista(FORMATOS, b.formato)}</select></label>
    <label>Ideia do roteiro<select id="pr-roteiro">${opcoes({ auto: '🎲 Automático — a IA escolhe um formato novo', ...(S.formatos || {}) }, b.formato_roteiro || 'auto')}</select></label>
    <label>Equipamento<select id="pr-equip">${lista(EQUIPAMENTOS, b.equipamento || EQUIPAMENTOS[0])}</select></label>`;
  if (!p) {
    box.innerHTML = `
      <h4>Pré-roteiro de gravação</h4>
      <div class="dica"><b>Grave pensando na edição.</b> A IA cria o plano do vídeo <b>antes</b> de você gravar: a ideia, o gancho, a <b>lista de takes</b> (o que filmar, enquadramento, como mexer o celular, quantos segundos, câmera lenta), as <b>falas do apresentador</b> e o checklist do carro.<br><br>Depois é só gravar a lista, enviar na aba Takes e clicar em 🎬 Montar: o vídeo segue o que foi planejado.</div>
      ${opcoesForm}
      <button id="pr-gerar" class="destaque" style="width:100%;justify-content:center;padding:11px">📝 Gerar pré-roteiro</button>
      <p class="muted" style="font-size:11px">Preencha antes os dados do carro (aba Carro).</p>`;
  } else {
    const feitos = new Set(p.feitos || []);
    const pct = Math.round((feitos.size / Math.max(1, p.takes.length)) * 100);
    box.innerHTML = `
      <h4>Pré-roteiro <span class="status ok">${esc(p.formato_nome || '')}</span></h4>
      <p style="margin:0 0 4px"><b>${esc(p.titulo)}</b></p>
      <p class="muted" style="margin:0 0 6px">${esc(p.conceito)}</p>
      <div class="dica"><b>Gancho:</b> ${esc(p.gancho)}<br><b>Estrutura:</b> ${esc((p.estrutura || []).join(' → '))}</div>
      <div class="acoes">
        <button class="mini" id="pr-copiar">📋 Copiar (WhatsApp)</button>
        <button class="mini" id="pr-imprimir">🖨 Imprimir / PDF</button>
        <button class="mini" id="pr-tele">🎤 Teleprompter</button>
        <button class="mini" id="pr-nova">🔄 Outra ideia</button>
      </div>
      <h4>Takes para gravar · ${feitos.size}/${p.takes.length}</h4>
      <div class="progresso"><div style="width:${pct}%"></div></div>
      ${p.takes.map((t) => `
        <div class="card plano-take ${feitos.has(t.n) ? 'feito' : ''}" data-n="${t.n}">
          <div class="num" title="Marcar como gravado" style="cursor:pointer">${feitos.has(t.n) ? '✓' : t.n}</div>
          <div>
            <div><b>${esc(t.nome)}</b> <span class="selo">${esc(t.uso)}</span>${t.essencial ? '<span class="selo ess">⭐ essencial</span>' : ''}${t.camera_lenta ? '<span class="selo slow">câmera lenta</span>' : ''}<span class="selo">${t.segundos}s</span></div>
            <div style="margin-top:4px">${esc(t.o_que_gravar)}</div>
            <div class="muted" style="font-size:12px">📐 ${esc(t.enquadramento)} · 🎥 ${esc(t.movimento)}</div>
            ${t.fala ? `<div class="fala">🗣 “${esc(t.fala)}”</div>` : ''}
            ${t.dica ? `<div class="muted" style="font-size:12px">💡 ${esc(t.dica)}</div>` : ''}
          </div>
        </div>`).join('')}
      ${p.narracao_off?.length ? `<h4>Narração (off)</h4><ul>${p.narracao_off.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <h4>Preparar o carro</h4><ul>${(p.preparacao_carro || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h4>Câmera e luz</h4><ul>${(p.camera_e_luz || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${p.dicas_apresentador?.length ? `<h4>Apresentador</h4><ul>${p.dicas_apresentador.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <details style="margin-top:10px"><summary style="cursor:pointer;color:var(--ac)">Gerar de novo com outras opções</summary>${opcoesForm}
        <button id="pr-gerar" class="destaque" style="width:100%;justify-content:center">📝 Gerar novo pré-roteiro</button></details>
      <p class="muted" style="font-size:11px;margin-top:10px">Gravou? Envie os vídeos na aba <b>Takes</b>: a IA reconhece qual take planejado é cada um, e o 🎬 Montar segue este plano.</p>`;
    $('#pr-copiar').onclick = () => navigator.clipboard.writeText(textoPreRoteiro(p)).then(() => toast('Pré-roteiro copiado!'));
    $('#pr-imprimir').onclick = () => imprimir(p);
    $('#pr-tele').onclick = () => teleprompter(p);
    $('#pr-nova').onclick = () => gerarPre(true);
    box.querySelectorAll('.plano-take .num').forEach((el) => (el.onclick = () => {
      const n = +el.closest('.plano-take').dataset.n;
      const s = new Set(p.feitos || []);
      s.has(n) ? s.delete(n) : s.add(n);
      p.feitos = [...s];
      agendarSalvar();
      painelGravacao();
    }));
  }
  const btn = $('#pr-gerar');
  if (btn) btn.onclick = () => gerarPre(false);
}

async function gerarPre(outra) {
  const b = (S.p.briefing ||= {});
  if ($('#pr-formato')) { b.formato = $('#pr-formato').value; b.formato_roteiro = $('#pr-roteiro').value; b.equipamento = $('#pr-equip').value; }
  const c = S.p.carro || {};
  const falta = ['marca', 'modelo', 'ano', 'preco'].filter((k) => !String(c[k] || '').trim());
  if (falta.length) { abrirAba('carro'); return toast(`Preencha: ${falta.join(', ')}`, true); }
  await salvarAgora();
  modal('📝 Criando o pré-roteiro', 'A IA está planejando a ideia, o gancho, a lista de takes e as falas…', 0.4);
  try {
    const p = await api(`/api/projetos/${S.p.id}/prerroteiro`, { json: { formato: outra ? 'auto' : b.formato_roteiro, equipamento: b.equipamento } });
    S.p.prerroteiro = p;
    modal(null);
    painelGravacao();
    toast(`Pré-roteiro pronto: ${p.takes.length} takes · ${p.formato_nome}`);
  } catch (e) { modal(null); toast(e.message, true); }
}

// ================================================================ Marca (kit da marca + vídeos da casa + guia de estilo)

const FONTES = ['Montserrat', 'Poppins', 'Bebas Neue', 'Anton', 'Oswald', 'Archivo Black', 'Barlow Condensed', 'Rubik',
  'Russo One', 'Teko', 'Kanit', 'Saira Condensed', 'Exo 2', 'Big Shoulders Display', 'Inter', 'Raleway'];
const ROTULOS_COR = { primaria: 'Primária (pílulas, cartela)', acento: 'Destaque (palavras-chave)', secundaria: 'Secundária', cta: 'Botão / WhatsApp' };

/** Extrai as cores dominantes do logo (ignora branco, preto e cinza). */
function coresDoLogo(img) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 72;
  const c = cv.getContext('2d'); c.drawImage(img, 0, 0, 72, 72);
  const d = c.getImageData(0, 0, 72, 72).data;
  const baldes = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
    if (a < 200) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 40 || mx < 40) continue; // cinza/preto/branco
    const k = `${r >> 5},${g >> 5},${b >> 5}`;
    const v = baldes.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    v.n++; v.r += r; v.g += g; v.b += b; baldes.set(k, v);
  }
  const hex = (v) => '#' + [v.r / v.n, v.g / v.n, v.b / v.n].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  return [...baldes.values()].sort((a, b) => b.n - a.n).map(hex);
}

export function painelMarca() {
  const box = $('#aba-marca');
  const m = (S.marca ||= {});
  m.cores ||= {};
  const casa = (S.refs || []).filter((r) => r.casa);
  const g = m.guia;
  box.innerHTML = `
    <h4>Kit da Marca</h4>
    <div class="dica">Vale para <b>todos os vídeos</b>: textos, pílulas, palavra-chave, legenda e a cartela final usam o logo, as cores e as fontes da loja.</div>
    <label class="btn" style="width:100%;justify-content:center;margin-bottom:8px">⬆ Enviar logo (PNG, de preferência sem fundo)<input type="file" id="mk-logo" accept="image/*" hidden></label>
    ${m.logo ? `<div style="background:#2a2f3a;border-radius:8px;padding:10px;text-align:center;margin-bottom:8px"><img id="mk-logo-img" src="${marcaUrl(m.logo)}" style="max-width:100%;max-height:110px"></div>` : ''}
    <div class="linha2">
      <label>Nome da loja<input data-m="nome" value="${esc(m.nome || '')}" placeholder="TopCar Veículos"></label>
      <label>Instagram<input data-m="instagram" value="${esc(m.instagram || '')}" placeholder="@topcarveiculos.pe"></label>
    </div>
    <div class="linha2">
      <label>WhatsApp<input data-m="whatsapp" value="${esc(m.whatsapp || '')}" placeholder="(81) 9 9999-9999"></label>
      <label>Cidade<input data-m="cidade" value="${esc(m.cidade || '')}" placeholder="Recife - PE"></label>
    </div>
    <label>Slogan<input data-m="slogan" value="${esc(m.slogan || '')}"></label>
    <label>Logotipo em texto (usado enquanto não há arquivo de logo)</label>
    <div class="linha3" style="margin-top:-6px">
      <input data-lt="a" value="${esc(m.logoTexto?.a || '')}" placeholder="TOP" title="Parte colorida">
      <input data-lt="b" value="${esc(m.logoTexto?.b || '')}" placeholder="CAR" title="Parte branca">
      <input data-lt="sub" value="${esc(m.logoTexto?.sub || '')}" placeholder="VEÍCULOS" title="Linha de baixo">
    </div>
    <label>CTA padrão<input data-m="cta" value="${esc(m.cta || '')}" placeholder="Chama no WhatsApp da TopCar"></label>
    <h4>Cores ${m.logo ? '<button class="mini" id="mk-extrair" style="float:right">🎨 Pegar do logo</button>' : ''}</h4>
    <div class="linha2">${Object.entries(ROTULOS_COR).map(([k, r]) => `<label>${r}<input type="color" data-cor="${k}" value="${cor(k)}"></label>`).join('')}</div>
    <h4>Fontes</h4>
    <div class="linha2">
      <label>Títulos e textos<select data-m="fonteTitulo">${lista(FONTES, m.fonteTitulo || 'Montserrat')}</select></label>
      <label>Preço e números<select data-m="fonteNumeros">${lista(FONTES, m.fonteNumeros || 'Anton')}</select></label>
    </div>
    <div id="mk-amostra" style="background:#000;border-radius:10px;padding:14px;text-align:center;margin-bottom:10px">
      <div style="font:900 30px '${esc(m.fonteTitulo || 'Montserrat')}';color:#fff;text-transform:uppercase">Abaixo da <span style="color:${cor('acento')}">FIPE</span></div>
      <div style="font:46px '${esc(m.fonteNumeros || 'Anton')}';color:${cor('acento')}">R$ 47.990</div>
      <span style="display:inline-block;background:${cor('primaria')};color:${contraste(cor('primaria'))};font:900 16px '${esc(m.fonteTitulo || 'Montserrat')}';padding:6px 14px;border-radius:99px">ÚNICO DONO</span>
      <span style="display:inline-block;background:${cor('cta')};color:${contraste(cor('cta'))};font:900 16px '${esc(m.fonteTitulo || 'Montserrat')}';padding:6px 14px;border-radius:99px">CHAMA NO WHATSAPP</span>
    </div>
    <label class="chk" style="margin-bottom:12px"><input type="checkbox" id="mk-cartela" ${m.cartela !== false ? 'checked' : ''}> Fechar todo vídeo com a cartela da loja (logo, @ e WhatsApp)</label>

    <h4>Vídeos da loja (aprender com o que já fazemos)</h4>
    <div class="dica">Envie os Reels e Stories que a loja já postou (baixe do celular). Informe os resultados: a IA dá mais peso aos que <b>venderam</b> e monta o <b>Guia de estilo da casa</b>, usado em todo roteiro.</div>
    <label>Vídeo<input type="file" id="mk-video" accept="video/*"></label>
    <div class="linha3">
      <label>Tipo<select id="mk-tipo">${lista(['Reels', 'Stories', 'Anúncio'], 'Reels')}</select></label>
      <label>Visualizações<input id="mk-views" type="number" min="0"></label>
      <label>Mensagens<input id="mk-msgs" type="number" min="0"></label>
    </div>
    <label>Observação (o que achou dele)<input id="mk-obs" placeholder="Vendeu o carro em 2 dias…"></label>
    <button id="mk-enviar" style="width:100%;justify-content:center">🤖 Enviar e analisar</button>
    ${casa.map((r) => `<div class="card" style="margin-top:8px"><b>${esc(r.analise?.titulo || r.tipo || 'Vídeo da loja')}</b>
      <span class="status ${r.status === 'analisado' ? 'ok' : r.status === 'erro' ? 'erro' : 'trab'}">${r.status === 'analisado' ? '✓ estudado' : r.status === 'erro' ? 'erro' : '⏳ estudando'}</span>
      <div class="muted" style="font-size:12px">${esc(r.tipo || '')} · ${esc(r.visualizacoes || '?')} views · ${esc(r.mensagens || '?')} msgs</div>
      ${r.analise ? `<div style="font-size:12px">Gancho: ${esc(r.analise.gancho)}<br>Identidade: ${esc(r.analise.identidade_visual || '')}</div>` : ''}
      <div class="acoes"><button class="mini perigo" data-apagar-casa="${r.id}">Apagar</button></div></div>`).join('')}
    <button id="mk-guia" class="destaque" style="width:100%;justify-content:center;margin-top:10px" ${casa.some((r) => r.analise) ? '' : 'disabled'}>🧠 Gerar guia de estilo da casa (${casa.filter((r) => r.analise).length} vídeos)</button>
    ${g ? `<h4>Guia de estilo da casa <span class="muted" style="text-transform:none">(base: ${g.base} vídeos)</span></h4>
      <p><b>${esc(g.resumo)}</b></p>
      <p class="muted">Tom: ${esc(g.tom_de_voz)}</p>
      <b>Bordões</b><ul>${g.bordoes_e_expressoes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <b>Ganchos que funcionam</b><ul>${g.ganchos_que_funcionam.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${g.apresentador ? `<b>Apresentador</b><p class="muted">${esc(g.apresentador)}</p>` : ''}
      <b>Identidade visual</b><p class="muted">${esc(g.identidade_visual)}</p>
      <b>Manter</b><ul>${g.manter.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <b>Evitar</b><ul>${g.evitar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <b>🚀 Subir o nível</b><ul>${g.subir_o_nivel.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;

  let tSalvar = null;
  const salvar = (redesenhar = false) => {
    clearTimeout(tSalvar);
    tSalvar = setTimeout(async () => {
      try { await api('/api/marca', { method: 'PUT', json: { ...m, guia: undefined, mercado: undefined } }); } catch (e) { toast(e.message, true); }
    }, 500);
    emit('redesenhar');
    if (redesenhar) painelMarca();
  };
  box.querySelectorAll('[data-m]').forEach((i) => i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', async () => {
    m[i.dataset.m] = i.value;
    if (i.dataset.m.startsWith('fonte')) { await aplicarFontesMarca(); salvar(true); } else salvar();
  }));
  box.querySelectorAll('[data-cor]').forEach((i) => i.addEventListener('input', () => { m.cores[i.dataset.cor] = i.value; salvar(); }));
  box.querySelectorAll('[data-lt]').forEach((i) => i.addEventListener('input', () => { (m.logoTexto ||= {})[i.dataset.lt] = i.value; salvar(); }));
  box.querySelectorAll('[data-cor]').forEach((i) => i.addEventListener('change', () => painelMarca()));
  $('#mk-cartela').onchange = (e) => { m.cartela = e.target.checked; salvar(); };
  $('#mk-logo').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('arquivo', f);
    try {
      const r = await api('/api/marca/logo', { method: 'POST', body: fd });
      m.logo = r.logo; painelMarca();
      const img = $('#mk-logo-img');
      img.onload = () => { const c = coresDoLogo(img); if (c.length) { m.cores.primaria = c[0]; m.cores.acento = c[1] || c[0]; salvar(true); toast('Logo salvo e cores extraídas!'); } };
    } catch (er) { toast(er.message, true); }
  };
  if ($('#mk-extrair')) $('#mk-extrair').onclick = () => {
    const c = coresDoLogo($('#mk-logo-img'));
    if (!c.length) return toast('Não achei cores no logo (é preto e branco?). Escolha manualmente.', true);
    m.cores.primaria = c[0]; m.cores.acento = c[1] || c[0]; if (c[2]) m.cores.secundaria = c[2];
    salvar(true); toast(`Cores do logo: ${c.slice(0, 3).join(', ')}`);
  };
  $('#mk-enviar').onclick = async () => {
    const v = $('#mk-video').files[0];
    if (!v) return toast('Escolha o vídeo da loja.', true);
    const fd = new FormData();
    fd.append('video', v); fd.append('casa', '1'); fd.append('anunciante', m.nome || 'Nossa loja');
    fd.append('tipo', $('#mk-tipo').value); fd.append('visualizacoes', $('#mk-views').value); fd.append('mensagens', $('#mk-msgs').value); fd.append('obs', $('#mk-obs').value);
    try { $('#mk-enviar').disabled = true; await api('/api/referencias', { method: 'POST', body: fd }); toast('Enviado! A IA está estudando o vídeo…'); C.atualizarRefs(); }
    catch (e) { toast(e.message, true); } finally { $('#mk-enviar').disabled = false; }
  };
  box.querySelectorAll('[data-apagar-casa]').forEach((b) => (b.onclick = async () => { await api(`/api/referencias/${b.dataset.apagarCasa}`, { method: 'DELETE' }); C.atualizarRefs(); }));
  $('#mk-guia').onclick = async () => {
    modal('🧠 Estudando a casa', 'A IA está cruzando os vídeos da loja com os resultados para montar o guia de estilo…', 0.5);
    try { m.guia = await api('/api/marca/guia', { method: 'POST' }); modal(null); painelMarca(); toast('Guia de estilo pronto — já vale para os próximos roteiros!'); }
    catch (e) { modal(null); toast(e.message, true); }
  };
}

// ================================================================ Takes

const rotuloStatus = (t) => {
  if (t.status === 'analisado') return '<span class="status ok">✓ analisado pela IA</span>';
  if (t.status === 'pronto') return `<span class="status ${t.erro ? 'erro' : 'ok'}">${t.erro ? 'sem análise' : 'pronto'}</span>`;
  if (t.status === 'erro') return '<span class="status erro">erro</span>';
  return `<span class="status trab">⏳ ${esc(t.etapa || t.status)}</span>`;
};

function painelTakes() {
  const takes = S.p.takes || [];
  $('#aba-takes').innerHTML = `
    <div class="soltar" id="soltar">⬆ <b>Arraste os takes do estúdio aqui</b><br><span style="font-size:11px">ou clique para escolher (MP4, MOV…) — vários de uma vez</span>
      <input type="file" id="in-takes" accept="video/*" multiple hidden></div>
    <div class="dica">O original fica guardado. O editor usa uma <b>cópia leve</b> e a IA assiste cada take para achar os melhores trechos. Clique num trecho para colocá-lo na linha do tempo.</div>
    ${takes.some((t) => t.proxy && !t.tratado && t.status !== 'processando') ? `<div class="dica"><b>Takes sem tratamento.</b> Estabiliza os tremidos e corrige exposição e cor. <button class="mini primario" id="tratar-todos">✨ Tratar todos</button></div>` : ''}
    ${takes.length ? '' : '<p class="muted">Nenhum take ainda.</p>'}
    ${takes.map((t) => `
      <div class="card take" data-id="${t.id}">
        ${t.thumb ? `<img src="${mediaUrl(t.thumb)}" alt="">` : '<div class="sem-thumb"></div>'}
        <div style="min-width:0">
          <div class="nome" title="${esc(t.nome)}">${esc(t.nome)}</div>
          <div class="muted">${t.dur ? fmt(t.dur) : ''} ${t.w ? `· ${t.w}×${t.h}` : ''} ${t.tem_audio ? '· 🔊' : ''}</div>
          ${rotuloStatus(t)}
          ${t.erro ? `<div style="color:var(--erro);font-size:11px">${esc(t.erro)}</div>` : ''}
        </div>
        ${t.analise?.take_planejado && S.p.prerroteiro ? `<div style="grid-column:1/-1"><span class="status ok">= take planejado #${t.analise.take_planejado} ${esc(S.p.prerroteiro.takes.find((x) => x.n === t.analise.take_planejado)?.nome || '')}</span></div>` : ''}
        ${t.analise ? `<div class="muted" style="grid-column:1/-1;font-size:12px">${esc(t.analise.resumo)}${t.analise.tem_fala && t.analise.transcricao ? `<br>🗣 “${esc(t.analise.transcricao)}”` : ''}</div>
          <div class="segs">${t.analise.segmentos.map((s, i) => `<button class="seg" data-seg="${i}"><b>${s.inicio.toFixed(1)}–${s.fim.toFixed(1)}s</b> ★${s.nota} · ${esc(s.uso)}<br>${esc(s.descricao)}</button>`).join('')}</div>` : ''}
        ${t.proxy ? `<div class="trat" style="grid-column:1/-1">
          ${t.tratado ? `<span class="status ok">✨ tratado</span> ${t.estabilizado ? '<span class="status ok">🎯 estabilizado</span>' : ''}` : '<span class="status trab">sem tratamento</span>'}
          ${t.tremor != null ? `<span class="muted" title="Tremor medido (% da largura)">tremor ${t.tremor < 0.35 ? 'baixo' : t.tremor < 1 ? 'médio' : 'alto'}</span>` : ''}
          <select class="mini-sel" data-estab title="Estabilização">${[['auto', '🎯 Auto'], ['forte', '🎯 Forte'], ['off', '🎯 Desligada']].map(([v, n]) => `<option value="${v}" ${(t.estabilizar || 'auto') === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <label class="chk" title="Correção automática de exposição, balanço de branco e nitidez"><input type="checkbox" data-cor ${t.corrigir_cor !== false ? 'checked' : ''}> 🎨 Cor</label>
          <button class="mini" data-acao="tratar">Aplicar</button></div>` : ''}
        <div class="acoes" style="grid-column:1/-1">
          ${t.proxy ? '<button class="mini" data-acao="inteiro">＋ Take inteiro</button>' : ''}
          ${t.proxy ? '<button class="mini" data-acao="analisar">🤖 Analisar de novo</button>' : ''}
          <button class="mini perigo" data-acao="apagar">Apagar</button>
        </div>
      </div>`).join('')}`;

  if ($('#tratar-todos')) $('#tratar-todos').onclick = async () => {
    const r = await api(`/api/projetos/${S.p.id}/tratar_todos`, { method: 'POST' });
    toast(`${r.enfileirados} takes na fila de tratamento (≈10 s cada).`); C.atualizarMidias();
  };
  const zona = $('#soltar'), inp = $('#in-takes');
  zona.onclick = () => inp.click();
  inp.onchange = () => enviarTakes(inp.files);
  zona.ondragover = (e) => { e.preventDefault(); zona.classList.add('sobre'); };
  zona.ondragleave = () => zona.classList.remove('sobre');
  zona.ondrop = (e) => { e.preventDefault(); zona.classList.remove('sobre'); enviarTakes(e.dataTransfer.files); };

  $('#aba-takes').querySelectorAll('.take').forEach((card) => {
    const t = take(card.dataset.id);
    card.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => adicionarClip(t, t.analise.segmentos[+b.dataset.seg])));
    card.querySelectorAll('[data-acao]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.acao === 'inteiro') adicionarClip(t, { inicio: 0, fim: t.dur, foco_x: 0.5 });
      if (b.dataset.acao === 'tratar') {
        await api(`/api/projetos/${S.p.id}/takes/${t.id}/tratamento`, { json: { estabilizar: card.querySelector('[data-estab]').value, cor: card.querySelector('[data-cor]').checked } });
        toast('Tratando o take… a prévia atualiza sozinha quando terminar.'); C.atualizarMidias();
      }
      if (b.dataset.acao === 'analisar') { await api(`/api/projetos/${S.p.id}/takes/${t.id}/analisar`, { method: 'POST' }); C.atualizarMidias(); }
      if (b.dataset.acao === 'apagar') {
        if (TL().clips.some((c) => c.takeId === t.id) && !confirm('Este take está na linha do tempo. Apagar mesmo assim?')) return;
        await api(`/api/projetos/${S.p.id}/takes/${t.id}`, { method: 'DELETE' });
        TL().clips = TL().clips.filter((c) => c.takeId !== t.id); mudou();
        C.atualizarMidias();
      }
    }));
  });
}

async function enviarTakes(files) {
  if (!files?.length) return;
  const fd = new FormData();
  let total = 0;
  for (const f of files) { fd.append('arquivos', f); total += f.size; }
  toast(`Enviando ${files.length} take(s) (${(total / 1e6).toFixed(0)} MB)…`);
  try {
    await api(`/api/projetos/${S.p.id}/takes`, { method: 'POST', body: fd });
    toast('Enviado! Processando os takes…');
    C.atualizarMidias();
  } catch (e) { toast(e.message, true); }
}

export function adicionarClip(t, seg) {
  const tl = TL();
  const selIdx = S.sel?.tipo === 'clip' ? tl.clips.findIndex((c) => c.id === S.sel.id) : -1;
  const ref = tl.clips[selIdx] || tl.clips[tl.clips.length - 1];
  const clip = {
    id: uid('c'), takeId: t.id, in: seg.inicio, dur: clamp(seg.fim - seg.inicio, 0.4, 3), speed: 1,
    movimento: 'deriva', rampa: 'nenhuma', punch: false, impacto: false,
    focoX: seg.foco_x ?? 0.5, focoY: seg.foco_y ?? 0.5, filtro: ref?.filtro || 'nenhum', tremor: false,
    volume: (seg.tem_fala ?? t.analise?.tem_fala) ? 1 : 0, transicao: { tipo: 'corte', dur: 0.3 },
  };
  tl.clips.splice(selIdx >= 0 ? selIdx + 1 : tl.clips.length, 0, clip);
  mudou();
  selecionar('clip', clip.id);
  C.buscar(clip.start);
}

// ================================================================ Áudio

let previaMusica = null;

function painelAudio() {
  const musicas = S.p.musicas || [];
  const atual = TL()?.musica;
  $('#aba-audio').innerHTML = `
    <h4>🎵 Trilha automática (sem direitos autorais)</h4>
    <div class="dica">O app <b>compõe a música</b> na hora e sabe onde cai cada batida, então os cortes, os textos e o pulso de zoom encaixam no ritmo. Se você não enviar música, a montagem usa uma automaticamente.</div>
    <div class="linha2" style="grid-template-columns:1fr auto;margin-bottom:6px">
      <select id="au-trilha">${opcoes(Object.fromEntries(Object.entries(ESTILOS_TRILHA).map(([k, v]) => [k, `${v.nome} · ${v.bpm} BPM`])), atual?.estilo || 'house')}</select>
      <button id="au-gerar" class="primario">Usar</button>
    </div>
    <div class="acoes" style="margin-bottom:6px">
      <button class="mini" id="au-ouvir-trilha">▶ Ouvir prévia</button>
      ${atual?.gerada ? '<button class="mini" id="au-alinhar">🥁 Realinhar cortes à batida</button>' : ''}
    </div>
    <h4>Música enviada</h4>
    <div class="dica">Use músicas livres para anúncio: <b>Sound Collection do Meta</b> (facebook.com/sound/collection) ou <b>Biblioteca de Áudio do YouTube</b>. Músicas comerciais podem bloquear o anúncio.</div>
    <label class="btn" style="width:100%;justify-content:center;margin-bottom:10px">⬆ Enviar música (MP3, WAV, M4A)<input type="file" id="in-musica" accept="audio/*" hidden></label>
    ${musicas.map((m) => `
      <div class="card" data-id="${m.id}">
        <div class="nome">🎵 ${esc(m.nome)} ${atual?.id === m.id ? '<span class="status ok">no vídeo</span>' : ''}</div>
        <div class="acoes">
          <button class="mini" data-acao="ouvir">▶ Ouvir</button>
          <button class="mini" data-acao="usar">${atual?.id === m.id ? '↻ Recolocar' : '＋ Usar no vídeo'}</button>
          <button class="mini perigo" data-acao="apagar">Apagar</button>
        </div>
      </div>`).join('') || '<p class="muted">Nenhuma música enviada.</p>'}

    <h4>Narração</h4>
    <div class="linha2">
      <label>Voz<select id="au-voz">${opcoes(VOZES, S.p.briefing?.voz || 'Puck')}</select></label>
      <label>Jeito de falar<input id="au-estilo" value="${esc(S.p.briefing?.estilo || '')}" placeholder="animado, jovem"></label>
    </div>
    <button id="au-regerar" style="width:100%;justify-content:center">🎙 Gravar todas as falas de novo com essa voz</button>
    <p class="muted" style="font-size:11px">Para mudar uma fala só, clique nela na faixa 🎙 e edite o texto no inspetor.</p>

    <h4>Efeitos sonoros</h4>
    <p class="muted" style="font-size:11px">▶ ouve · ＋ coloca no cursor</p>
    <div class="grade-sfx">${Object.entries(SFX).map(([k, r]) => `<div class="acoes" style="margin:0"><button class="mini" data-ouvir="${k}">▶</button><button class="mini" data-sfx="${k}" style="flex:1">＋ ${esc(r)}</button></div>`).join('')}</div>`;

  $('#in-musica').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('arquivo', f);
    toast('Enviando música…');
    try { const m = await api(`/api/projetos/${S.p.id}/musicas`, { method: 'POST', body: fd }); await C.atualizarMidias(); if (!TL().musica) usarMusica(m); toast('Música pronta!'); } catch (er) { toast(er.message, true); }
  };
  $('#aba-audio').querySelectorAll('.card[data-id]').forEach((card) => {
    const m = musicas.find((x) => x.id === card.dataset.id);
    card.querySelectorAll('[data-acao]').forEach((b) => (b.onclick = async () => {
      if (b.dataset.acao === 'ouvir') {
        if (previaMusica && !previaMusica.paused) { previaMusica.pause(); b.textContent = '▶ Ouvir'; return; }
        previaMusica = new Audio(mediaUrl(m.arquivo)); previaMusica.play(); b.textContent = '⏸ Parar';
      }
      if (b.dataset.acao === 'usar') usarMusica(m);
      if (b.dataset.acao === 'apagar') {
        await api(`/api/projetos/${S.p.id}/musicas/${m.id}`, { method: 'DELETE' });
        if (TL().musica?.id === m.id) { TL().musica = null; mudou(); }
        C.atualizarMidias();
      }
    }));
  });
  $('#au-gerar').onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = 'Compondo…';
    try { await C.criarTrilha($('#au-trilha').value); toast('Trilha no vídeo! Use "Realinhar cortes à batida" se quiser.'); } catch (er) { toast(er.message, true); }
    finally { e.target.disabled = false; e.target.textContent = 'Usar'; }
  };
  $('#au-ouvir-trilha').onclick = async (e) => {
    if (previaMusica && !previaMusica.paused) { previaMusica.pause(); e.target.textContent = '▶ Ouvir prévia'; return; }
    e.target.textContent = 'Compondo…';
    const { buffer } = await gerarTrilha({ estilo: $('#au-trilha').value, dur: 12 });
    previaMusica = new Audio(URL.createObjectURL(paraWav(buffer)));
    previaMusica.play(); e.target.textContent = '⏸ Parar';
  };
  if ($('#au-alinhar')) $('#au-alinhar').onclick = ajustarCortesNaBatida;
  const salvarVoz = () => { S.p.briefing.voz = $('#au-voz').value; S.p.briefing.estilo = $('#au-estilo').value; agendarSalvar(); };
  $('#au-voz').onchange = salvarVoz; $('#au-estilo').oninput = salvarVoz;
  $('#au-regerar').onclick = () => C.regerarNarracoes();
  $('#aba-audio').querySelectorAll('[data-ouvir]').forEach((b) => (b.onclick = () => C.player.previa(b.dataset.ouvir)));
  $('#aba-audio').querySelectorAll('[data-sfx]').forEach((b) => (b.onclick = () => {
    const s = { id: uid('s'), tipo: b.dataset.sfx, inicio: S.t, volume: 0.8 };
    TL().sfx.push(s); mudou(); selecionar('sfx', s.id);
  }));
}

export async function usarMusica(m) {
  TL().musica = { id: m.id, nome: m.nome, url: m.arquivo, inicio: 0, offset: 0, volume: 0.35, ducking: true, batidas: [], bpm: null };
  mudou();
  painelAudio();
  const buf = await buffer(mediaUrl(m.arquivo));
  if (buf && TL().musica?.id === m.id) {
    const { bpm, batidas } = detectarBatidas(buf);
    Object.assign(TL().musica, { bpm, batidas });
    mudou();
    toast(`Música no vídeo · ${bpm} BPM detectado`);
  }
}

function ajustarCortesNaBatida() {
  const tl = TL(), m = tl.musica;
  if (!m?.batidas?.length) return toast('A música ainda não tem batidas detectadas.', true);
  const batidas = m.batidas.map((b) => b - (m.offset || 0) + (m.inicio || 0)).filter((b) => b > 0);
  let t = 0;
  for (const c of tl.clips) {
    const fimDesejado = t + c.dur;
    const alvo = batidas.reduce((best, b) => (Math.abs(b - fimDesejado) < Math.abs(best - fimDesejado) && b > t + 0.4 ? b : best), fimDesejado);
    c.dur = clamp(alvo - t, 0.3, maxDurClip(c, take(c.takeId)));
    t += c.dur;
  }
  mudou();
  toast('Cortes alinhados às batidas da música');
}

// ================================================================ Referências (Biblioteca de Anúncios)

function linkBiblioteca(termo) {
  const q = encodeURIComponent(termo || 'seminovos');
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=video&q=${q}&search_type=keyword_unordered`;
}

export function painelRefs() {
  const refs = (S.refs || []).filter((r) => !r.casa); // os da casa ficam na aba Marca
  $('#aba-refs').innerHTML = `
    <h4>Pesquisar na Biblioteca de Anúncios</h4>
    <div class="linha2" style="grid-template-columns:1fr auto">
      <input id="ref-termo" value="seminovos" placeholder="seminovos, SUV usado, nome da loja…">
      <button id="ref-abrir">Abrir ↗</button>
    </div>
    <div class="dica" style="margin-top:8px">
      <b>Como achar os que vendem:</b> o Meta não mostra resultado de anúncio comercial no Brasil. O melhor sinal é o anúncio estar <b>no ar há mais de 30 dias</b> e ter <b>várias versões</b> (“X anúncios usam este criativo”). Quem paga por muito tempo é porque dá lucro.<br>
      Baixe o vídeo (ou grave a tela) e envie aqui com quantos dias está no ar. A IA desmonta o anúncio e os padrões entram automaticamente nos seus roteiros.
    </div>
    <h4>⚡ Estudar em lote (dezenas de vídeos)</h4>
    <div class="dica">Baixe os vídeos que mais rodam das lojas concorrentes (Biblioteca de Anúncios, Instagram) e envie <b>todos de uma vez</b> — ou cole vários links do YouTube, um por linha. A IA estuda um por um (2 de cada vez). No plano grátis, até ~50 por dia é seguro.</div>
    <label>Vídeos (pode selecionar vários)<input type="file" id="lote-videos" accept="video/*" multiple></label>
    <label>…e/ou links do YouTube (um por linha)<textarea id="lote-links" placeholder="https://www.youtube.com/shorts/…"></textarea></label>
    <div class="linha2">
      <label>Loja / origem<input id="lote-anunciante" placeholder="Lojas de Pernambuco"></label>
      <label>Dias no ar (se souber)<input id="lote-dias" type="number" min="0"></label>
    </div>
    <button id="lote-enviar" class="primario" style="width:100%;justify-content:center">🤖 Enviar todos para estudo</button>
    ${(() => { const mc = S.marca?.mercado; const n = refs.filter((r) => r.analise).length; return `
    <button id="ref-sintese" class="destaque" style="width:100%;justify-content:center;margin-top:8px" ${n >= 3 ? '' : 'disabled'}>🧠 Gerar inteligência de mercado (${n} estudadas)</button>
    ${mc ? `<div class="card" style="margin-top:8px"><b>Inteligência de mercado</b> <span class="muted">(${mc.base} vídeos)</span>
      <p>${esc(mc.resumo)}</p>
      <b>Ganchos campeões</b><ul>${mc.ganchos_campeoes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <b>Comum demais (todo mundo faz)</b><ul>${mc.comum_demais.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <b>🚀 Oportunidades para se diferenciar</b><ul>${mc.oportunidades.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <b>Recomendações</b><ul>${mc.recomendacoes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}`; })()}
    <h4>Adicionar referência</h4>
    <label>🔗 Link do YouTube (Shorts ou vídeo público) — <b style="color:var(--ac)">a IA assiste direto, sem baixar</b>
      <input id="ref-yt" placeholder="https://www.youtube.com/shorts/…"></label>
    <label>…ou o arquivo do vídeo (baixado da Biblioteca de Anúncios)<input type="file" id="ref-video" accept="video/*"></label>
    <div class="linha2">
      <label>Anunciante<input id="ref-anunciante" placeholder="Nome da loja"></label>
      <label>Dias no ar<input id="ref-dias" type="number" min="0" placeholder="45"></label>
    </div>
    <div class="linha2">
      <label>Nº de versões<input id="ref-variacoes" type="number" min="0" placeholder="3"></label>
      <label>Link<input id="ref-link" placeholder="facebook.com/ads/library/?id=…"></label>
    </div>
    <label>Texto do anúncio<textarea id="ref-texto" placeholder="Cole o texto que aparece acima do vídeo"></textarea></label>
    <label>O que te chamou atenção<input id="ref-obs" placeholder="Gancho forte, preço no início…"></label>
    <button id="ref-enviar" class="primario" style="width:100%;justify-content:center">🤖 Analisar referência</button>
    <h4>Referências (${refs.length})</h4>
    ${refs.map((r) => {
      const a = r.analise;
      return `<div class="card" data-id="${r.id}">
        <div class="nome">${esc(a?.titulo || r.anunciante || 'Referência')} ${r.dias ? `<span class="status">${esc(r.dias)} dias</span>` : ''}
          ${r.status === 'analisado' ? `<span class="status ok">nota ${a.nota_performance}/10</span>` : r.status === 'erro' ? '<span class="status erro">erro</span>' : '<span class="status trab">⏳ analisando</span>'}</div>
        ${r.erro ? `<div style="color:var(--erro);font-size:11px">${esc(r.erro)}</div>` : ''}
        ${a ? `<div style="font-size:12px;margin-top:6px"><b>Gancho (${esc(a.tipo_gancho)}):</b> ${esc(a.gancho)}<br>
          <b>Ritmo:</b> ${a.cortes_por_10s} cortes/10s · ${a.duracao_seg}s<br>
          <b>Estrutura:</b> ${esc(a.estrutura.join(' → '))}<br>
          <b>Por que vende:</b> ${esc(a.por_que_vende)}<br>
          ${a.tecnicas_edicao?.length ? `<b>Técnicas de edição:</b><ul>${a.tecnicas_edicao.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          ${a.decupagem?.length ? `<details><summary style="cursor:pointer;color:var(--ac)">Decupagem corte a corte (${a.decupagem.length})</summary><ul>${a.decupagem.map((d) => `<li><b>${esc(d.tempo)}</b> ${esc(d.plano)} · ${esc(d.camera)} · ${esc(d.velocidade)}${d.texto ? ` · “${esc(d.texto)}”` : ''} · ${esc(d.transicao)} · 🔊 ${esc(d.som)}</li>`).join('')}</ul></details>` : ''}
          <b>Copiar:</b><ul>${a.copiar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <b>Evitar:</b><ul>${a.evitar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        <div class="acoes">
          <label class="chk"><input type="checkbox" data-usar ${r.usar !== false ? 'checked' : ''}> Usar nos roteiros</label>
          <div class="espaco"></div>
          ${r.link ? `<a class="btn mini" href="${esc(r.link)}" target="_blank" rel="noopener">Ver ↗</a>` : ''}
          <button class="mini perigo" data-apagar>Apagar</button>
        </div>
      </div>`;
    }).join('') || '<p class="muted">Nenhuma referência ainda.</p>'}`;

  $('#ref-abrir').onclick = () => window.open(linkBiblioteca($('#ref-termo').value), '_blank', 'noopener');
  $('#lote-enviar').onclick = async () => {
    const arquivos = [...$('#lote-videos').files];
    const links = $('#lote-links').value.split(/\s+/).map((s) => s.trim()).filter((s) => /youtu\.?be/.test(s));
    if (!arquivos.length && !links.length) return toast('Escolha vídeos ou cole links do YouTube.', true);
    const anunciante = $('#lote-anunciante').value, dias = $('#lote-dias').value;
    const btn = $('#lote-enviar'); btn.disabled = true;
    let ok = 0;
    const itens = [...arquivos.map((f) => ['video', f]), ...links.map((l) => ['link', l])];
    for (const [tipo, v] of itens) {
      const fd = new FormData();
      fd.append(tipo, v); fd.append('anunciante', anunciante); fd.append('dias', dias);
      fd.append('obs', 'Estudo em lote de lojas concorrentes/referência');
      try { await api('/api/referencias', { method: 'POST', body: fd }); ok++; btn.textContent = `Enviando… ${ok}/${itens.length}`; } catch (e) { toast(e.message, true); }
    }
    btn.disabled = false; btn.textContent = '🤖 Enviar todos para estudo';
    toast(`${ok} vídeos na fila de estudo. Quando terminar, gere a inteligência de mercado.`);
    C.atualizarRefs();
  };
  $('#ref-sintese').onclick = async () => {
    modal('🧠 Inteligência de mercado', 'A IA está cruzando todas as referências: o que os melhores fazem, o que é comum demais e onde a loja pode se destacar…', 0.5);
    try { (S.marca ||= {}).mercado = await api('/api/referencias/sintese', { method: 'POST' }); modal(null); painelRefs(); toast('Pronto — já vale para os próximos roteiros.'); }
    catch (e) { modal(null); toast(e.message, true); }
  };
  $('#ref-enviar').onclick = async () => {
    const fd = new FormData();
    const v = $('#ref-video').files[0];
    if (v) fd.append('video', v);
    for (const k of ['anunciante', 'dias', 'variacoes', 'link', 'texto', 'obs']) fd.append(k, $(`#ref-${k}`).value);
    const yt = $('#ref-yt').value.trim();
    if (yt) fd.set('link', yt);
    try {
      $('#ref-enviar').disabled = true;
      await api('/api/referencias', { method: 'POST', body: fd });
      toast('Referência enviada. A IA está analisando…');
      C.atualizarRefs();
    } catch (e) { toast(e.message, true); } finally { $('#ref-enviar').disabled = false; }
  };
  $('#aba-refs').querySelectorAll('.card[data-id]').forEach((card) => {
    const id = card.dataset.id;
    $('[data-usar]', card).onchange = (e) => api(`/api/referencias/${id}`, { method: 'PATCH', json: { usar: e.target.checked } });
    $('[data-apagar]', card).onclick = async () => { await api(`/api/referencias/${id}`, { method: 'DELETE' }); C.atualizarRefs(); };
  });
}

// ================================================================ Roteiro / copy do anúncio

function botaoCopiar(texto) {
  const b = document.createElement('button');
  b.className = 'mini'; b.textContent = 'Copiar';
  b.onclick = () => navigator.clipboard.writeText(texto).then(() => toast('Copiado!'));
  return b;
}

function blocoSerie() {
  const s = S.p.serie;
  if (!s?.stories?.length) return '';
  return `<h4>📅 Série de Stories (${s.stories.length})</h4>
    <p class="muted" style="font-size:12px">${esc(s.estrategia || '')}</p>
    <button id="serie-exportar" class="primario" style="width:100%;justify-content:center;margin-bottom:8px">⬇ Exportar todos os stories</button>
    ${s.stories.map((st, i) => `<div class="card" ${S.storyAtual === i ? 'style="border-color:var(--ac)"' : ''}>
      <b>${i + 1}. ${esc(st.titulo)}</b> <span class="selo">${esc(st.dia)}</span>
      <div class="muted" style="font-size:12px">${esc(st.objetivo)}</div>
      <div style="font-size:12px;margin-top:4px">📌 <b>${esc(st.sticker)}</b>: “${esc(st.texto_sticker)}”</div>
      <div class="acoes"><button class="mini" data-story="${i}">${S.storyAtual === i ? '✓ Aberto na timeline' : '▶ Abrir na timeline'}</button></div>
    </div>`).join('')}`;
}

function painelRoteiro() {
  const r = S.p.roteiro;
  const box = $('#aba-roteiro');
  const ligarSerie = () => {
    box.querySelectorAll('[data-story]').forEach((b) => (b.onclick = () => C.abrirStory(+b.dataset.story)));
    if ($('#serie-exportar')) $('#serie-exportar').onclick = () => C.exportarSerie();
  };
  if (!r) {
    box.innerHTML = blocoSerie() + '<p class="muted">Clique em <b>🎬 Montar com IA</b> para gerar o roteiro, a legenda do post e os textos do anúncio — ou em <b>📅 Série de Stories</b> na aba Carro.</p>';
    ligarSerie();
    return;
  }
  const a = r.anuncio_meta || {};
  const legenda = `${r.legenda_post}\n\n${(r.hashtags || []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`;
  const anuncio = `Texto principal:\n${a.texto_principal}\n\nTítulo: ${a.titulo}\nDescrição: ${a.descricao}\nBotão: ${a.botao_cta}`;
  const roteiro = (r.cenas || []).map((c, i) => `${i + 1}. [${c.etapa}] ${c.narracao || '(sem fala)'}\n   Tela: ${c.texto_tela}`).join('\n');
  box.innerHTML = `
    <h4>Estratégia</h4>
    ${r.formato_nome ? `<p><span class="status ok">Formato: ${esc(r.formato_nome)}</span> <span class="muted" style="font-size:11px">— use 🎲 Outra versão para outro formato</span></p>` : ''}
    <p><b>${esc(r.angulo_de_venda)}</b></p>
    <p class="muted">Público: ${esc(r.publico_alvo)}<br>Música ideal: ${esc(r.energia_musica)}</p>
    <h4>Roteiro <span id="cp-rot"></span></h4><div class="copiavel">${esc(roteiro)}</div>
    <h4>Ganchos alternativos (teste A/B)</h4><ul>${(r.ganchos_alternativos || []).map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
    <h4>Legenda do post <span id="cp-leg"></span></h4><div class="copiavel">${esc(legenda)}</div>
    <h4>Anúncio (Meta Ads) <span id="cp-anu"></span></h4><div class="copiavel">${esc(anuncio)}</div>
    <h4>⚠ Confirmar antes de publicar</h4><ul>${(r.alertas || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li>Nada pendente.</li>'}</ul>
    <p class="muted" style="font-size:11px">Gerado por ${esc(r._modelo || 'IA')}</p>`;
  $('#cp-rot').append(botaoCopiar(roteiro));
  $('#cp-leg').append(botaoCopiar(legenda));
  $('#cp-anu').append(botaoCopiar(anuncio));
  box.insertAdjacentHTML('afterbegin', blocoSerie());
  ligarSerie();
}

// ================================================================ Inspetor

function campo(rot, html) { return `<label>${rot}${html}</label>`; }
const num = (k, v, min, max, passo = 0.1) => `<input type="number" data-k="${k}" value="${+(+v).toFixed(2)}" min="${min}" max="${max}" step="${passo}">`;
const faixa = (k, v, min, max, passo = 0.01) => `<input type="range" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${passo}">`;
const sel = (k, obj, v) => `<select data-k="${k}">${opcoes(obj, v)}</select>`;

function ligar(box, alvo, aoMudar) {
  box.querySelectorAll('[data-k]').forEach((i) => {
    const evento = i.type === 'range' || i.tagName === 'TEXTAREA' || i.type === 'text' || i.type === 'color' ? 'input' : 'change';
    i.addEventListener(evento, () => {
      const caminho = i.dataset.k.split('.');
      let o = alvo;
      while (caminho.length > 1) o = o[caminho.shift()] ||= {};
      const k = caminho[0];
      o[k] = i.type === 'checkbox' ? i.checked : i.type === 'number' || i.type === 'range' ? +i.value : i.value;
      aoMudar?.(k);
      mudou(evento === 'input');
    });
    if (i.type === 'range' || i.tagName === 'TEXTAREA' || i.type === 'text') i.addEventListener('change', () => mudou());
  });
}

export function inspetor() {
  const box = $('#inspetor');
  const titulo = $('#insp-titulo');
  if (!S.p?.timeline) { box.innerHTML = ''; return; }
  if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text],input:not([type]),textarea')) return; // não atrapalha quem digita
  const it = S.sel && acharItem(S.sel.tipo, S.sel.id);
  if (!it) return inspetorProjeto(box, titulo);
  const tipo = S.sel.tipo;

  if (tipo === 'clip') {
    const tk = take(it.takeId);
    titulo.textContent = '🎥 Clipe';
    const segs = tk?.analise?.segmentos || [];
    box.innerHTML = `
      ${tk?.thumb ? `<img src="${mediaUrl(tk.thumb)}" style="width:100%;border-radius:8px;margin-bottom:8px">` : ''}
      <div class="muted" style="margin-bottom:8px">${esc(tk?.nome || 'Cartão de texto (sem take)')}</div>
      <label>Trocar por<select id="i-trocar"><option value="">— escolher take/trecho —</option>
        ${(S.p.takes || []).filter((t) => t.proxy).map((t) => `<option value="${t.id}|0|${t.dur}|0.5">${esc(t.nome)} (inteiro)</option>${(t.analise?.segmentos || []).map((s) => `<option value="${t.id}|${s.inicio}|${s.fim}|${s.foco_x}">   ↳ ${s.inicio.toFixed(1)}–${s.fim.toFixed(1)}s ${esc(s.descricao.slice(0, 40))}</option>`).join('')}`).join('')}
      </select></label>
      <div class="linha3">${campo('Início no take', num('in', it.in, 0, tk?.dur || 99))}${campo('Duração', num('dur', it.dur, 0.2, 30))}${campo('Velocidade', num('speed', it.speed || 1, 0.25, 3, 0.05))}</div>
      <h4>Dinâmica</h4>
      ${campo('Movimento de câmera', sel('movimento', MOVIMENTOS, it.movimento === 'nenhum' || !it.movimento ? 'deriva' : it.movimento))}
      ${campo('Rampa de velocidade', sel('rampa', RAMPAS, it.rampa || 'nenhuma'))}
      <div class="acoes" style="margin-bottom:8px">
        <label class="chk"><input type="checkbox" data-k="punch" ${it.punch ? 'checked' : ''}> Punch-in no corte</label>
        <label class="chk"><input type="checkbox" data-k="impacto" ${it.impacto ? 'checked' : ''}> Impacto (tremida + RGB)</label>
        <label class="chk"><input type="checkbox" data-k="luz" ${it.luz ? 'checked' : ''}> Luz (light leak)</label>
        <label class="chk"><input type="checkbox" data-k="tremor" ${it.tremor ? 'checked' : ''}> Câmera na mão</label>
      </div>
      <h4>Valorizar o take</h4>
      <div class="acoes" style="margin-bottom:8px">
        <label class="chk"><input type="checkbox" data-k="brilho" ${it.brilho ? 'checked' : ''}> ✨ Brilho na lataria</label>
        <label class="chk"><input type="checkbox" data-k="foto" ${it.foto ? 'checked' : ''}> 📸 Momento foto</label>
        <label class="chk"><input type="checkbox" id="i-flare" ${it.flare ? 'checked' : ''}> 💡 Flare (farol)</label>
      </div>
      ${it.flare ? `<div class="linha2">${campo('Flare horizontal', faixa('flare.x', it.flare.x ?? 0.5, 0, 1))}${campo('Flare vertical', faixa('flare.y', it.flare.y ?? 0.5, 0, 1))}</div>` : ''}
      <label>Tela dividida com<select id="i-duplo"><option value="">— não dividir —</option>
        ${(S.p.takes || []).filter((t) => t.proxy).map((t) => `<option value="${t.id}" ${it.duplo?.takeId === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}
      </select></label>
      <h4>Enquadramento <span class="muted" style="text-transform:none;letter-spacing:0">(ou arraste o vídeo na prévia)</span></h4>
      ${campo(`Horizontal <span class="muted">(${Math.round((it.focoX ?? 0.5) * 100)}%)</span>`, faixa('focoX', it.focoX ?? 0.5, 0, 1))}
      ${campo('Vertical', faixa('focoY', it.focoY ?? 0.5, 0, 1))}
      ${campo('Zoom fixo', faixa('zoomBase', it.zoomBase ?? 1, 1, 2, 0.01))}
      ${campo('Cor (filtro)', sel('filtro', FILTROS, it.filtro || 'nenhum'))}
      ${tk?.audio ? campo('Som original do take', faixa('volume', it.volume || 0, 0, 1.5)) : ''}
      <h4 id="insp-transicao">Transição para o próximo</h4>
      <div class="linha2">${campo('Tipo', sel('transicao.tipo', TRANSICOES, it.transicao?.tipo || 'corte'))}${campo('Duração', num('transicao.dur', it.transicao?.dur ?? 0.4, 0.1, 1.5, 0.05))}</div>
      <button class="mini" id="i-trans-todos">Aplicar esta transição em todos</button>
      <div class="acoes" style="margin-top:12px">
        <button class="mini" id="i-dividir">✂ Dividir no cursor</button>
        <button class="mini" id="i-duplicar">⧉ Duplicar</button>
        <button class="mini perigo" id="i-apagar">🗑 Apagar</button>
      </div>`;
    ligar(box, it, (k) => {
      const tkk = take(it.takeId);
      if (tkk && ['in', 'dur', 'speed', 'rampa'].includes(k)) {
        it.in = clamp(it.in, 0, tkk.dur - 0.3);
        it.dur = clamp(it.dur, 0.2, maxDurClip(it, tkk));
      }
    });
    $('#i-trocar').onchange = (e) => {
      if (!e.target.value) return;
      const [tid, ini, fim, fx] = e.target.value.split('|');
      const novo = take(tid);
      Object.assign(it, { takeId: tid, in: +ini, focoX: +fx, volume: novo.analise?.tem_fala ? 1 : 0 });
      it.dur = clamp(it.dur, 0.2, maxDurClip(it, novo));
      if (+fim - +ini < it.dur && +fim - +ini > 0.3) it.dur = +fim - +ini;
      mudou();
    };
    $('#i-flare').onchange = (e) => { it.flare = e.target.checked ? { x: 0.5, y: 0.5 } : null; mudou(); };
    $('#i-duplo').onchange = (e) => {
      const id = e.target.value;
      if (!id) it.duplo = null;
      else { const t2 = take(id); it.duplo = { takeId: id, in: Math.max(0, Math.min(0.2, t2.dur - it.dur)), focoX: 0.5 }; }
      mudou();
    };
    $('#i-trans-todos').onclick =() => { for (const c of TL().clips) c.transicao = { ...it.transicao }; mudou(); toast('Transição aplicada em todos os cortes'); };
    $('#i-dividir').onclick = () => C.dividir();
    $('#i-duplicar').onclick = () => { const cl = TL().clips; const i = cl.indexOf(it); cl.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(it)), id: uid('c') }); mudou(); };
    $('#i-apagar').onclick = () => C.apagarSelecionado();
    void segs;
    return;
  }

  if (tipo === 'texto') {
    titulo.textContent = '🔤 Texto na tela';
    const est = ESTILOS[it.estilo] || {};
    const dicaEstilo = est.opc ? 'Um opcional por linha. Cada item entra no corte do seu take (troque o estilo para ver outra animação: cards, grade, contagem, letreiro, checklist).'
      : est.deppor ? 'Formato: De R$ 134.000 | Por R$ 129.900'
      : est.callout ? 'Arraste o círculo e o rótulo direto na prévia.'
      : 'Use *asteriscos* na palavra-chave para destacar (ex.: ABAIXO DA *FIPE*).';
    box.innerHTML = `
      ${campo('Texto', `<textarea data-k="texto">${esc(it.texto)}</textarea>`)}
      <div class="dica" style="margin-top:-4px">${dicaEstilo}<br>Arraste o texto direto na prévia para posicionar.</div>
      ${campo('Estilo', sel('estilo', ESTILOS, it.estilo))}
      <div class="linha2">${campo('Entrada', sel('anim', ANIMACOES, it.anim))}${campo('Saída', sel('animOut', SAIDAS, it.animOut || 'fade'))}</div>
      ${campo('Movimento na tela', sel('vida', VIDAS, it.vida || 'nenhuma'))}
      <div class="linha2">${campo('Cor', `<input type="color" data-k="cor" value="${it.cor || (est.cor ?? '#ffffff')}">`)}${campo('Cor do destaque', `<input type="color" data-k="corDestaque" value="${it.corDestaque || est.dest || '#FFD400'}">`)}</div>
      ${campo(`Horizontal <span class="muted">(${Math.round((it.x ?? 0.5) * 100)}%)</span>`, faixa('x', it.x ?? 0.5, 0.05, 0.95))}
      ${campo(`Altura <span class="muted">(${Math.round((it.y ?? 0.3) * 100)}%)</span>`, faixa('y', it.y ?? 0.3, 0.05, 0.95))}
      ${est.callout ? `<div class="linha2">${campo('Alvo horizontal', faixa('alvoX', it.alvoX ?? 0.5, 0, 1))}${campo('Alvo vertical', faixa('alvoY', it.alvoY ?? 0.62, 0, 1))}</div>` : ''}
      <div class="linha2">${campo('Tamanho', faixa('tam', it.tam ?? 1, 0.4, 2))}${campo('Inclinação', faixa('rot', it.rot ?? 0, -15, 15, 1))}</div>
      <div class="linha2">${campo('Começa em', num('inicio', it.inicio, 0, 120))}${campo('Duração', num('dur', it.dur, 0.2, 60))}</div>
      <div class="acoes"><button class="mini" id="i-cor-padrao">Cores padrão</button><button class="mini" id="i-duplicar">⧉ Duplicar</button><button class="mini perigo" id="i-apagar">🗑 Apagar</button></div>`;
    ligar(box, it);
    $('#i-cor-padrao').onclick = () => { delete it.cor; delete it.corDestaque; mudou(); };
    $('#i-duplicar').onclick = () => { const n = { ...it, id: uid('x'), inicio: it.inicio + it.dur }; TL().textos.push(n); mudou(); selecionar('texto', n.id); };
    $('#i-apagar').onclick = () => C.apagarSelecionado();
    return;
  }

  if (tipo === 'narracao') {
    titulo.textContent = '🎙 Fala';
    box.innerHTML = `
      ${campo('Texto da fala (também vira legenda)', `<textarea id="i-fala">${esc(it.texto)}</textarea>`)}
      ${it.url ? `<button id="i-regravar" style="width:100%;justify-content:center;margin-bottom:10px">🎙 Regravar esta fala com a IA</button>
        ${campo('Volume', faixa('volume', it.volume ?? 1, 0, 2))}` : `<div class="dica">Só legenda: o som vem do próprio take (apresentador).</div>
        ${campo('Duração', num('dur', it.dur, 0.3, 60))}`}
      ${campo('Começa em', num('inicio', it.inicio, 0, 120))}
      <div class="acoes"><button class="mini perigo" id="i-apagar">🗑 Apagar</button></div>`;
    ligar(box, it);
    $('#i-fala').addEventListener('change', (e) => { it.texto = e.target.value; mudou(); });
    if (it.url) $('#i-regravar').onclick = () => C.narrarItem(it, $('#i-fala').value);
    $('#i-apagar').onclick = () => C.apagarSelecionado();
    return;
  }

  if (tipo === 'sfx') {
    titulo.textContent = '💥 Efeito sonoro';
    box.innerHTML = `
      ${campo('Efeito', sel('tipo', SFX, it.tipo))}
      ${campo('Volume', faixa('volume', it.volume ?? 0.8, 0, 1.5))}
      ${campo('Momento', num('inicio', it.inicio, 0, 120, 0.05))}
      <div class="acoes"><button class="mini" id="i-ouvir">▶ Ouvir</button><button class="mini perigo" id="i-apagar">🗑 Apagar</button></div>`;
    ligar(box, it);
    $('#i-ouvir').onclick = () => C.player.previa(it.tipo);
    $('#i-apagar').onclick = () => C.apagarSelecionado();
    return;
  }

  if (tipo === 'musica') {
    titulo.textContent = '🎵 Música';
    box.innerHTML = `
      <div class="nome" style="margin-bottom:8px">${esc(it.nome)} ${it.bpm ? `<span class="status">${it.bpm} BPM</span>` : ''}</div>
      ${campo('Volume', faixa('volume', it.volume ?? 0.35, 0, 1))}
      <label class="chk" style="margin-bottom:10px"><input type="checkbox" data-k="ducking" ${it.ducking !== false ? 'checked' : ''}> Abaixar automaticamente quando alguém fala</label>
      ${campo('Começar a música a partir de (s)', num('offset', it.offset || 0, 0, 600, 0.5))}
      ${campo('Entra no vídeo em (s)', num('inicio', it.inicio || 0, 0, 60, 0.1))}
      <button id="i-batida" style="width:100%;justify-content:center;margin-bottom:8px">🥁 Ajustar cortes às batidas</button>
      <div class="acoes"><button class="mini perigo" id="i-tirar">Tirar música do vídeo</button></div>`;
    ligar(box, it);
    $('#i-batida').onclick = ajustarCortesNaBatida;
    $('#i-tirar').onclick = () => { TL().musica = null; selecionar(null); mudou(); emit('midias'); };
  }
}

function inspetorProjeto(box, titulo) {
  titulo.textContent = '⚙ Projeto';
  const cfg = TL().config;
  box.innerHTML = `
    <p class="muted" style="font-size:12px">Clique em qualquer item da linha do tempo para editar. Duração atual: <b>${fmt(duracao())}</b></p>
    <h4>Legendas automáticas</h4>
    <label class="chk" style="margin-bottom:8px"><input type="checkbox" data-k="legendas" ${cfg.legendas ? 'checked' : ''}> Mostrar legendas das falas (palavra por palavra)</label>
    <label class="chk" style="margin-bottom:8px"><input type="checkbox" data-k="palavrasChave" ${cfg.palavrasChave !== false ? 'checked' : ''}> Palavra-chave explode no centro quando é falada</label>
    ${campo('Estilo', sel('estiloLegenda', LEGENDAS, cfg.estiloLegenda))}
    ${campo('Altura', faixa('legendaY', cfg.legendaY ?? 0.7, 0.4, 0.85))}
    <h4>Visual</h4>
    ${campo('Filtro em todo o vídeo', sel('filtroGlobal', FILTROS, cfg.filtroGlobal || 'nenhum'))}
    <h4>Acabamento profissional</h4>
    <div style="display:grid;gap:6px;margin-bottom:10px">
      <label class="chk"><input type="checkbox" data-k="pulso" ${cfg.pulso !== false ? 'checked' : ''}> Pulso de zoom na batida da música</label>
      <label class="chk"><input type="checkbox" data-k="barras" ${cfg.barras !== false ? 'checked' : ''}> Faixas de cinema abrindo no início</label>
      <label class="chk"><input type="checkbox" data-k="grao" ${cfg.grao !== false ? 'checked' : ''}> Granulação de filme</label>
      <label class="chk"><input type="checkbox" data-k="scrim" ${cfg.scrim !== false ? 'checked' : ''}> Escurecer atrás dos textos (leitura)</label>
      <label class="chk"><input type="checkbox" data-k="vinheta" ${cfg.vinheta ? 'checked' : ''}> Vinheta (bordas escuras)</label>
    </div>
    <h4>Logo da loja</h4>
    <label class="btn" style="margin-bottom:8px">⬆ Enviar logo (PNG transparente)<input type="file" id="in-logo" accept="image/*" hidden></label>
    ${S.p.logo ? `<img src="${mediaUrl(S.p.logo)}" style="max-width:120px;display:block;margin-bottom:8px;background:#333;padding:6px;border-radius:6px">` : ''}
    <label class="chk" style="margin-bottom:8px"><input type="checkbox" data-k="logo" ${cfg.logo ? 'checked' : ''}> Mostrar logo</label>
    ${campo('Posição', sel('logoPos', { 'topo-dir': 'Topo direita', 'topo-esq': 'Topo esquerda', 'base-dir': 'Baixo direita', 'base-esq': 'Baixo esquerda' }, cfg.logoPos))}
    <h4>Atalhos</h4>
    <p class="muted" style="font-size:11px">Espaço: play/pause · S: dividir · T: texto · Delete: apagar · Ctrl+Z / Ctrl+Y · ← →: 1 quadro · Ctrl+roda: zoom</p>`;
  ligar(box, cfg);
  $('#in-logo').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('arquivo', f);
    try { await api(`/api/projetos/${S.p.id}/logo`, { method: 'POST', body: fd }); await C.atualizarMidias(); cfg.logo = true; mudou(); } catch (er) { toast(er.message, true); }
  };
}
