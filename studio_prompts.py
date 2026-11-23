"""Prompts e schemas do Estúdio: análise de takes, análise de referências e montagem."""
from prompt import SYSTEM_PROMPT as COPY_PROMPT

TRANSICOES = ["corte", "whip", "whip_v", "zoom", "flash", "luz", "giro", "slide", "glitch", "desfoque", "crossfade", "wipe"]
SFX = ["nenhum", "whoosh", "impacto", "riser", "pop", "clique", "dinheiro"]
ESTILOS_TEXTO = ["gancho", "impacto", "destaque", "lista", "cards", "grade", "contador", "letreiro", "checklist",
                 "preco", "de_por", "etiqueta", "callout", "cta", "limpo"]
ESTILOS_OPCIONAIS = ["lista", "cards", "grade", "contador", "letreiro", "checklist"]
ESTILOS_PROVA = [
    "`callout` apontando o detalhe no take (ex.: o hodômetro, o manual de revisões) com o dado ao lado",
    "uma única `etiqueta` grande com o dado mais forte, e o resto falado na narração",
    "frase de impacto `gancho` com o número em destaque (ex.: 'SÓ *38 MIL* KM'), sem pílulas",
    "dentro do `checklist` junto com os opcionais (procedência vira item marcado)",
    "`destaque` (faixa amarela) com uma frase de confiança, sem listar tudo",
]
ESTILOS_PRECO = [
    "`de_por` (FIPE riscada → preço) — só se houver FIPE ou preço antigo informado; senão use `preco`",
    "`preco` grande contando até o valor, com flash e impacto",
    "parcela primeiro (se informada) em `preco` e depois o valor à vista em `etiqueta`; senão `preco`",
    "suspense: pergunta em `impacto` ('quanto você acha?') e revelação em `preco` no plano seguinte",
]

# ---------------------------------------------------------------- formatos de roteiro (variedade)
# Cada vídeo usa UM formato. O servidor faz rodízio para não repetir.

FORMATOS = {
    "pov": {
        "nome": "POV — você é o cliente",
        "ideia": "Primeira pessoa: o espectador se imagina pegando o carro. Narração na 2ª pessoa ('você abre a porta…').",
        "estrutura": "gancho POV (texto 'POV: …') → abrindo a porta/sentando (interior) → detalhes que você sente (couro, teto, tela) → a conta que fecha (preço) → CTA 'esse pode ser o seu'",
        "edicao": "câmera subjetiva, transições whip e giro como se a cabeça virasse, opcionais em `cards`, música chill que cresce",
    },
    "tres_motivos": {
        "nome": "3 motivos",
        "ideia": "Lista numerada que prende até o fim (o motivo 1 é o mais forte, guardado para o final).",
        "estrutura": "gancho '3 motivos pra esse ser o melhor [categoria] da loja' → motivo 3 → motivo 2 → motivo 1 (o preço/condição) → CTA",
        "edicao": "use estilo `contador` (número gigante batendo + texto do motivo), um motivo por cena, flash a cada número, riser antes do motivo 1",
    },
    "adivinhe_preco": {
        "nome": "Adivinhe o preço",
        "ideia": "Curiosidade: o público tenta adivinhar o preço enquanto vê detalhes premium; revelação tardia.",
        "estrutura": "gancho 'Quanto você pagaria nesse [modelo]?' → detalhes que parecem caros → 'tá pensando em quanto?' (suspense) → REVELAÇÃO do preço com `de_por` ou `preco` + flash/impacto → CTA",
        "edicao": "ritmo que acelera até a revelação, slowmo no último detalhe antes do preço, riser + impacto, opcionais em `grade`",
    },
    "revelacao": {
        "nome": "Revelação cinematográfica",
        "ideia": "Mistério: só detalhes em macro e câmera lenta, sem dizer qual carro; revela o carro inteiro e o nome na batida forte.",
        "estrutura": "gancho enigmático ('Esse detalhe entrega qual carro?') → 3 a 5 detalhes macro → REVELAÇÃO com zoom_out + nome em `gancho`/slam → oferta rápida → CTA",
        "edicao": "pouca narração (frases curtas ou só texto), rampas rapido_lento, luz e desfoque, filtro cinema/noturno, opcionais em `letreiro`",
    },
    "checklist": {
        "nome": "Checklist do vendedor",
        "ideia": "Autoridade e confiança: a loja confere o carro item por item na frente do cliente.",
        "estrutura": "gancho 'Antes de anunciar, a gente confere tudo. Olha esse [modelo]:' → checklist visual (o que foi informado: km, revisões, procedência, opcionais) → 'aprovado' → preço → CTA",
        "edicao": "use estilo `checklist` (caixas sendo marcadas), punch-in a cada item, sons de clique, cortes secos",
    },
    "mito_verdade": {
        "nome": "Mito ou verdade",
        "ideia": "Quebra de objeção sobre comprar seminovo, com provas do próprio carro.",
        "estrutura": "gancho 'Seminovo é sempre dor de cabeça?' (MITO) → provas deste carro (só dados informados) em `etiqueta` → 'VERDADE: [benefício]' → preço → CTA",
        "edicao": "etiquetas MITO (vermelho) e VERDADE, glitch na quebra, punch-in, opcionais em `lista`",
    },
    "comparativo": {
        "nome": "Comparativo de valor",
        "ideia": "Ancoragem: compara com a FIPE ou com quanto seria o 0 km (sem inventar números que não foram informados).",
        "estrutura": "gancho de contraste ('Pagar caro no 0 km ou levar ESSE?') → o que você ganha neste (opcionais) → a diferença de preço (FIPE/preço) com `de_por` → CTA",
        "edicao": "split de argumentos com slide/wipe, opcionais em `grade`, impacto no preço",
    },
    "para_quem": {
        "nome": "Para quem é esse carro",
        "ideia": "Identificação: fala direto com o perfil de comprador ideal.",
        "estrutura": "gancho 'Esse carro é pra você se…' → 2 ou 3 perfis/necessidades atendidas, cada um com um diferencial → preço → CTA",
        "edicao": "opcionais em `cards` (um perfil/benefício por card), transições giro, vida flutuar",
    },
    "car_edit": {
        "nome": "Car edit na batida",
        "ideia": "Estilo edição de carro do TikTok: música forte, cortes em toda batida, ficha técnica cinética, quase sem fala.",
        "estrutura": "gancho visual em 3–4 cortes de 0,3 s → nome do carro em slam → ficha/opcionais em ritmo → preço → CTA",
        "edicao": "narração vazia ou 1 frase, `letreiro` ou `grade`, rampas em todo detalhe, impacto e glitch, ritmo frenético",
    },
    "tour_rapido": {
        "nome": "Tour de 20 segundos",
        "ideia": "Visita guiada rápida e fluida: por fora → por dentro → detalhes → preço.",
        "estrutura": "gancho 'Tour de 20 segundos nesse [modelo]' → exterior → interior → porta-malas/detalhes → preço → CTA",
        "edicao": "movimento contínuo (orbita, pans), transições giro e whip encadeadas, opcionais em `cards`",
    },
    "unidade_unica": {
        "nome": "Unidade única",
        "ideia": "Escassez verdadeira (todo seminovo é único): essa cor, esse km, essa versão — só tem um.",
        "estrutura": "gancho 'Só existe UM desse aqui' → o que o torna único (cor, km, versão, opcionais) → preço → CTA com urgência honesta",
        "edicao": "etiquetas que empilham, `lista` dos diferenciais, flash, pulso forte na batida",
    },
    "detalhes": {
        "nome": "Detalhes que ninguém repara",
        "ideia": "Conteúdo de valor: mostra detalhes do carro que o comprador comum não percebe (segura atenção como conteúdo, não como anúncio).",
        "estrutura": "gancho 'X detalhes desse [modelo] que quase ninguém repara' → detalhe 1, 2, 3 com `callout` → preço → CTA",
        "edicao": "callouts apontando, zoom_in lento, slowmo, opcionais em `checklist` ou `callout`",
    },
}


def instrucao_formato(chave, recentes):
    f = FORMATOS[chave]
    txt = (f"\n# FORMATO OBRIGATÓRIO DESTE VÍDEO: {f['nome']}\n"
           f"- Ideia: {f['ideia']}\n- Estrutura: {f['estrutura']}\n- Edição: {f['edicao']}\n"
           "- Adapte o formato ao carro; as etapas do schema (gancho/desejo/prova/oferta/cta) são só rótulos — a ordem, a quantidade de cenas (4 a 7) e o conteúdo seguem o formato.\n"
           "- Não afirme novidade ou urgência que não foi informada ('acabou de chegar', 'últimas horas', 'vai sair hoje').\n")
    if recentes:
        txt += ("\n# PROIBIDO REPETIR (vídeos recentes da loja) — crie ganchos, frases e ângulos NOVOS, diferentes destes:\n"
                + "\n".join(f"- [{r.get('formato', '?')}] gancho: \"{r.get('gancho', '')}\" | ângulo: {r.get('angulo', '')}" for r in recentes) + "\n")
    return txt
ANIMACOES = ["palavras", "slam", "pop", "mascara", "desfoque", "subir", "zoom", "deslizar", "quique", "digitar"]
VIDAS = ["batida", "nenhuma", "flutuar", "pulsar", "balancar", "tremer"]
FILTROS = ["nenhum", "vivo", "cinema", "premium", "noturno", "quente", "frio", "pb", "comercial", "showroom", "noite_neon"]
MOVIMENTOS = ["deriva", "zoom_in", "zoom_out", "pan_esq", "pan_dir", "subir", "descer", "orbita", "parado"]
RAMPAS = ["nenhuma", "rapido_lento", "lento_rapido", "rampa_meio", "slowmo", "rapido"]

# ---------------------------------------------------------------- takes

PROMPT_TAKE = """Você é um editor de vídeo e diretor de fotografia especialista em anúncios de carros.
Assista a este take (gravado em estúdio de uma loja de seminovos) e catalogue-o para montagem de Reels verticais 9:16 de até 30 segundos, com edição dinâmica (cortes de 0,4 a 2 s).

Liste MUITOS trechos curtos e úteis (0,5 a 4 s cada; pode haver sobreposição), cada um sem corte de câmera no meio:
- início e fim em segundos (precisos, dentro da duração do vídeo);
- o que aparece e o tipo de plano (detalhe, geral, interior, apresentador, movimento…);
- o movimento de câmera real no trecho (parada, travelling, órbita, aproximação…);
- para qual etapa do Reels serve melhor (gancho, desejo, prova, oferta, cta);
- foco_x/foco_y: posição do assunto principal no quadro (0 a 1) — usado para recortar na vertical;
- destaque_x/destaque_y: ponto exato do detalhe mais vendável do trecho (centro da roda, do farol, da tela…), para apontar com um círculo;
- nota de 1 a 10 (nitidez, luz, estabilidade, impacto visual) e se o trecho fica bom em câmera lenta.
Priorize: detalhes que geram desejo (rodas, faróis acendendo, painel, teto, bancos, porta-malas, emblema), movimentos suaves e momentos de revelação.
Se houver fala, transcreva exatamente e marque os trechos com fala."""

SCHEMA_TAKE = {
    "type": "object",
    "properties": {
        "resumo": {"type": "string", "description": "O que é este take em uma frase"},
        "tem_fala": {"type": "boolean"},
        "transcricao": {"type": "string", "description": "Fala exata, se houver; vazio se não houver"},
        "qualidade_geral": {"type": "integer"},
        "segmentos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "inicio": {"type": "number"},
                    "fim": {"type": "number"},
                    "descricao": {"type": "string"},
                    "plano": {"type": "string"},
                    "camera": {"type": "string"},
                    "uso": {"type": "string", "enum": ["gancho", "desejo", "prova", "oferta", "cta"]},
                    "foco_x": {"type": "number"},
                    "foco_y": {"type": "number"},
                    "destaque_x": {"type": "number"},
                    "destaque_y": {"type": "number"},
                    "bom_em_slowmo": {"type": "boolean"},
                    "tem_fala": {"type": "boolean"},
                    "nota": {"type": "integer"},
                },
                "required": ["inicio", "fim", "descricao", "plano", "camera", "uso", "foco_x", "foco_y",
                             "destaque_x", "destaque_y", "bom_em_slowmo", "tem_fala", "nota"],
            },
        },
        "take_planejado": {"type": "integer", "description": "Número do take do pré-roteiro a que este vídeo corresponde (0 se nenhum)"},
    },
    "required": ["resumo", "tem_fala", "transcricao", "qualidade_geral", "segmentos", "take_planejado"],
}

# ---------------------------------------------------------------- pré-roteiro de gravação

PROMPT_PRE = """Você é diretor de vídeo e roteirista de anúncios de carros para Reels (Meta Ads), trabalhando para uma loja de seminovos com estúdio próprio.
Antes da gravação, crie o PRÉ-ROTEIRO: o plano exato do que gravar para que a edição fique PROFISSIONAL — dinâmica, com cortes a cada ~1 s, rampas de velocidade, detalhes que geram desejo e um gancho forte.

Princípios de captação para edição profissional:
- Grave MAIS do que vai usar: cada take com 4 a 8 s, sempre com MOVIMENTO de câmera (nunca parado) — o editor corta o melhor 1 s.
- Variedade de planos: geral 3/4 em ângulo baixo, laterais em travelling, detalhes macro (farol acendendo, roda girando/ emblema, costura do banco, tela da central, botões), interior pela porta, porta-malas abrindo, chave/partida.
- Movimentos com celular: travelling lateral lento, órbita em volta do carro, push-in (aproximar) no detalhe, pull-out (afastar) para revelar, tilt de baixo para cima, "reveal" passando atrás de um pilar/porta.
- Câmera lenta (120 fps) para detalhes e revelações; 4K/1080p 60 fps no restante; vertical; exposição travada; lente limpa.
- Pelo menos 2 takes "herói" do carro inteiro (abertura e fechamento) e 1 take de AÇÃO (porta abrindo, farol acendendo, roda girando, motor ligando).
- Se houver apresentador: falas curtas (1 frase por take, até 3 s), olhando para a câmera, gravar cada fala 2 vezes (normal e com mais energia), uma fala de gancho que pare a rolagem, e gestos que interagem com o carro (abrir porta, apontar, sentar).
- Use SOMENTE os dados informados do carro; não invente opcionais.
Escreva como um diretor experiente orientando o videomaker e o apresentador da loja, em português do Brasil, prático e específico."""

SCHEMA_PRE = {
    "type": "object",
    "properties": {
        "titulo": {"type": "string"},
        "conceito": {"type": "string", "description": "A ideia do vídeo em 1-2 frases"},
        "gancho": {"type": "string", "description": "O gancho dos 2 primeiros segundos (visual + texto/fala)"},
        "duracao_alvo_seg": {"type": "integer"},
        "estrutura": {"type": "array", "items": {"type": "string"}, "description": "Sequência do vídeo editado, em etapas curtas"},
        "takes": {
            "type": "array",
            "description": "Lista de takes a gravar, na ORDEM MAIS EFICIENTE DE GRAVAÇÃO (10 a 18 takes)",
            "items": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer"},
                    "nome": {"type": "string", "description": "Nome curto (ex.: 'Farol acendendo')"},
                    "uso": {"type": "string", "enum": ["gancho", "desejo", "prova", "oferta", "cta"]},
                    "o_que_gravar": {"type": "string"},
                    "enquadramento": {"type": "string"},
                    "movimento": {"type": "string", "description": "Como mover o celular/gimbal — NUNCA câmera fixa (no mínimo um push-in lento)"},
                    "segundos": {"type": "integer", "description": "Quanto tempo GRAVAR (com sobra para a edição): mínimo 5, ideal 6 a 8"},
                    "camera_lenta": {"type": "boolean"},
                    "fala": {"type": "string", "description": "Fala do apresentador neste take (vazio se não houver)"},
                    "dica": {"type": "string"},
                    "essencial": {"type": "boolean"},
                },
                "required": ["n", "nome", "uso", "o_que_gravar", "enquadramento", "movimento", "segundos", "camera_lenta", "fala", "dica", "essencial"],
            },
        },
        "narracao_off": {"type": "array", "items": {"type": "string"}, "description": "Se for locução em off: frases na ordem (vazio se for apresentador)"},
        "preparacao_carro": {"type": "array", "items": {"type": "string"}},
        "camera_e_luz": {"type": "array", "items": {"type": "string"}},
        "dicas_apresentador": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["titulo", "conceito", "gancho", "duracao_alvo_seg", "estrutura", "takes", "narracao_off",
                 "preparacao_carro", "camera_e_luz", "dicas_apresentador"],
}


# ---------------------------------------------------------------- marca e guia de estilo da casa

PROMPT_GUIA = """Você é diretor de criação de uma loja de seminovos. Abaixo estão as análises dos vídeos que a PRÓPRIA loja já publicou,
com os resultados informados (visualizações, mensagens etc.). Monte o GUIA DE ESTILO DA CASA para que todo vídeo novo
pareça da mesma marca e repita o que funcionou — e aponte, com franqueza, onde dá para subir o nível para padrão profissional.
Dê mais peso aos vídeos com melhores resultados. Seja específico (cite bordões, ganchos, cores, estilos) e prático."""

SCHEMA_GUIA = {
    "type": "object",
    "properties": {
        "resumo": {"type": "string", "description": "A identidade da loja em 2 frases"},
        "tom_de_voz": {"type": "string"},
        "bordoes_e_expressoes": {"type": "array", "items": {"type": "string"}},
        "ganchos_que_funcionam": {"type": "array", "items": {"type": "string"}},
        "estrutura_padrao": {"type": "string"},
        "apresentador": {"type": "string", "description": "Jeito, energia, gestos, como fala (vazio se não houver)"},
        "identidade_visual": {"type": "string", "description": "Cores, fontes/estilo de texto, cenário, enquadramentos recorrentes"},
        "cta_padrao": {"type": "string"},
        "manter": {"type": "array", "items": {"type": "string"}},
        "evitar": {"type": "array", "items": {"type": "string"}},
        "subir_o_nivel": {"type": "array", "items": {"type": "string"}, "description": "Melhorias concretas para chegar ao nível profissional"},
    },
    "required": ["resumo", "tom_de_voz", "bordoes_e_expressoes", "ganchos_que_funcionam", "estrutura_padrao", "apresentador",
                 "identidade_visual", "cta_padrao", "manter", "evitar", "subir_o_nivel"],
}


PROMPT_MERCADO = """Você é estrategista de performance para lojas de seminovos. Abaixo estão as análises de vídeos de OUTRAS lojas e marcas
(concorrentes, referências nacionais, anúncios da Biblioteca de Anúncios). Condense tudo numa INTELIGÊNCIA DE MERCADO prática:
o que os melhores fazem (com mais peso para anúncios que ficam muito tempo no ar e vídeos de nota alta), o que é comum demais
(e por isso não diferencia) e, principalmente, as OPORTUNIDADES que quase ninguém explora — onde a nossa loja pode se destacar."""

SCHEMA_MERCADO = {
    "type": "object",
    "properties": {
        "resumo": {"type": "string"},
        "ganchos_campeoes": {"type": "array", "items": {"type": "string"}},
        "formatos_mais_fortes": {"type": "array", "items": {"type": "string"}},
        "ritmo_medio": {"type": "string"},
        "padroes_de_texto_e_visual": {"type": "array", "items": {"type": "string"}},
        "padroes_de_cta_e_oferta": {"type": "array", "items": {"type": "string"}},
        "comum_demais": {"type": "array", "items": {"type": "string"}, "description": "O que todo mundo faz (não diferencia)"},
        "oportunidades": {"type": "array", "items": {"type": "string"}, "description": "O que quase ninguém faz e funcionaria"},
        "recomendacoes": {"type": "array", "items": {"type": "string"}, "description": "Ações concretas para os próximos vídeos e anúncios da loja"},
    },
    "required": ["resumo", "ganchos_campeoes", "formatos_mais_fortes", "ritmo_medio", "padroes_de_texto_e_visual",
                 "padroes_de_cta_e_oferta", "comum_demais", "oportunidades", "recomendacoes"],
}


def texto_mercado(mc):
    if not mc:
        return ""
    return ("\n# INTELIGÊNCIA DE MERCADO (concorrentes e referências estudadas)\n"
            f"- {mc['resumo']}\n- Ganchos campeões: {'; '.join(mc['ganchos_campeoes'])}\n"
            f"- Formatos mais fortes: {'; '.join(mc['formatos_mais_fortes'])}\n- Ritmo médio: {mc['ritmo_medio']}\n"
            f"- Comum demais (evite parecer igual): {'; '.join(mc['comum_demais'])}\n"
            f"- OPORTUNIDADES para se diferenciar (use): {'; '.join(mc['oportunidades'])}\n"
            f"- Padrões de texto e visual: {'; '.join(mc.get('padroes_de_texto_e_visual', []))}\n"
            f"- Padrões de CTA e oferta: {'; '.join(mc.get('padroes_de_cta_e_oferta', []))}\n"
            f"- Recomendações: {'; '.join(mc['recomendacoes'])}\n"
            "- OBRIGATÓRIO: o gancho dos primeiros 1,5 s usa um dos GANCHOS CAMPEÕES acima (adaptado ao carro; ganchos de preço/FIPE NÃO valem: regra da loja), o CTA segue os padrões"
            " de CTA/oferta e pelo menos uma OPORTUNIDADE é aplicada. Diga qual no campo aprendizado_aplicado.")


def texto_marca(m):
    """Contexto da marca para os prompts de roteiro."""
    if not m:
        return ""
    linhas = [texto_mercado(m.get("mercado")), "\n# A LOJA (use a identidade da marca)"]
    if m.get("condicoes_loja"):
        linhas.append("- CONDIÇÕES REAIS DA LOJA (verdadeiras para todo carro, pode usar): " + "; ".join(m["condicoes_loja"]))
    if m.get("playbook_topcrm"):
        import json as _json
        linhas.append("\n# PLAYBOOK DA LOJA (aprendido no Studio antigo com as referências e o feedback da equipe — siga a voz e as táticas)\n"
                      + _json.dumps(m["playbook_topcrm"].get("conteudo", {}), ensure_ascii=False)[:6000])
    if m.get("feedback_topcrm"):
        fb = [f for f in m["feedback_topcrm"] if f.get("avaliacao") or f.get("resultado_no_ar")][:15]
        if fb:
            linhas.append("- O que a equipe aprovou/reprovou nos roteiros antigos (repita o que deu certo, evite o que foi reprovado): "
                          + " | ".join(f"{f['avaliacao'] or 'no ar'}: {f.get('angulo') or ''} {f.get('motivo') or ''} {f.get('resultado_no_ar') or ''}".strip() for f in fb))
    if m.get("regras_loja"):
        linhas.append("- REGRAS DA LOJA (obrigatórias, valem MAIS que a inteligência de mercado): " + " | ".join(m["regras_loja"]))
    for k, rot in (("nome", "Nome"), ("instagram", "Instagram"), ("whatsapp", "WhatsApp"), ("cidade", "Cidade"), ("slogan", "Slogan"), ("cta", "CTA padrão")):
        if str(m.get(k, "")).strip():
            linhas.append(f"- {rot}: {m[k]}")
    g = m.get("guia")
    if g:
        linhas += [f"\n# GUIA DE ESTILO DA CASA (aprendido com os vídeos da própria loja — siga)",
                   f"- Identidade: {g['resumo']}", f"- Tom de voz: {g['tom_de_voz']}",
                   f"- Bordões/expressões: {'; '.join(g['bordoes_e_expressoes'])}",
                   f"- Ganchos que funcionam: {'; '.join(g['ganchos_que_funcionam'])}",
                   f"- Estrutura padrão: {g['estrutura_padrao']}"]
        if g.get("apresentador"):
            linhas.append(f"- Apresentador: {g['apresentador']}")
        linhas += [f"- CTA padrão: {g['cta_padrao']}", f"- Manter: {'; '.join(g['manter'])}", f"- Evitar: {'; '.join(g['evitar'])}",
                   f"- Subir o nível (aplique): {'; '.join(g['subir_o_nivel'])}"]
    return "\n".join(linhas)


def texto_prerroteiro(pre):
    """Resumo do pré-roteiro para orientar a análise dos takes e a montagem."""
    if not pre:
        return ""
    linhas = [f"Conceito: {pre.get('conceito', '')}", f"Gancho planejado: {pre.get('gancho', '')}",
              f"Estrutura: {' → '.join(pre.get('estrutura', []))}", "Takes planejados:"]
    for t in pre.get("takes", []):
        fala = f" | FALA: \"{t['fala']}\"" if t.get("fala") else ""
        linhas.append(f"  #{t['n']} {t['nome']} [{t['uso']}] — {t['o_que_gravar']} ({t['movimento']}){fala}")
    if pre.get("narracao_off"):
        linhas.append("Narração em off planejada: " + " / ".join(pre["narracao_off"]))
    return "\n".join(linhas)


# ---------------------------------------------------------------- referências

PROMPT_REFERENCIA = """Você é um estrategista de performance em Meta Ads e editor sênior, especializado no mercado automotivo brasileiro.
Analise este anúncio/vídeo de referência. Anúncios que ficam no ar por muitos dias e com várias versões costumam ser os que dão lucro — use os dados informados pelo usuário como sinal de performance.

Desmonte o vídeo como um editor e copywriter:
- o gancho dos primeiros 3 segundos (o que se vê, o que se fala, o texto na tela);
- a estrutura cena a cena (em etapas curtas);
- o ritmo: quantos cortes a cada 10 segundos e duração total;
- estilo do texto na tela, da narração, da música e dos efeitos/transições;
- o CTA e os gatilhos mentais;
- por que provavelmente vende;
- o que uma loja de seminovos deve copiar (padrões, não o conteúdo) e o que deve evitar;
- a DECUPAGEM: cada corte com tempo exato, plano, movimento de câmera/edição, velocidade (rampa, slow motion), texto e sua animação, transição e som;
- as técnicas de edição reaplicáveis (ex.: "corte a cada batida", "rampa rápido→lento ao revelar a roda", "texto entra palavra por palavra com pop").
Seja específico e prático, como um editor sênior ensinando outro editor. Se algo não puder ser visto, diga."""

SCHEMA_REFERENCIA = {
    "type": "object",
    "properties": {
        "titulo": {"type": "string", "description": "Nome curto para esta referência"},
        "gancho": {"type": "string"},
        "tipo_gancho": {"type": "string"},
        "estrutura": {"type": "array", "items": {"type": "string"}},
        "duracao_seg": {"type": "number"},
        "cortes_por_10s": {"type": "number"},
        "texto_na_tela": {"type": "string"},
        "narracao": {"type": "string"},
        "musica": {"type": "string"},
        "efeitos": {"type": "array", "items": {"type": "string"}},
        "cta": {"type": "string"},
        "gatilhos": {"type": "array", "items": {"type": "string"}},
        "por_que_vende": {"type": "string"},
        "copiar": {"type": "array", "items": {"type": "string"}},
        "evitar": {"type": "array", "items": {"type": "string"}},
        "nota_performance": {"type": "integer", "description": "1 a 10, estimativa de força do anúncio"},
        "decupagem": {
            "type": "array",
            "description": "Cada plano/corte do vídeo, em ordem (no máximo 40)",
            "items": {
                "type": "object",
                "properties": {
                    "tempo": {"type": "string", "description": "ex.: 0.0-0.6s"},
                    "plano": {"type": "string"},
                    "camera": {"type": "string"},
                    "velocidade": {"type": "string"},
                    "texto": {"type": "string"},
                    "transicao": {"type": "string"},
                    "som": {"type": "string"},
                },
                "required": ["tempo", "plano", "camera", "velocidade", "texto", "transicao", "som"],
            },
        },
        "tecnicas_edicao": {"type": "array", "items": {"type": "string"}},
        "identidade_visual": {"type": "string", "description": "Cores, fontes, estilo dos textos, bordões e jeito do apresentador observados"},
    },
    "required": ["titulo", "gancho", "tipo_gancho", "estrutura", "duracao_seg", "cortes_por_10s",
                 "texto_na_tela", "narracao", "musica", "efeitos", "cta", "gatilhos",
                 "por_que_vende", "copiar", "evitar", "nota_performance", "decupagem", "tecnicas_edicao", "identidade_visual"],
}

# ---------------------------------------------------------------- montagem

PLAYBOOK_EDICAO = """
## Você também é o EDITOR — padrão de edição profissional (aprendido de anúncios e edições de carro que performam)
Ritmo é tudo. Um take parado por vários segundos = vídeo "mecânico" = rolagem. Regras:

1. VÁRIOS PLANOS POR CENA. A narração define a duração da cena, mas a imagem troca: cada cena tem 2 a 4 `planos` de 0,4 a 1,8 s
   (edição cinematográfica de carro ≈ 1 corte por segundo, sempre na batida da música). Nunca repita o mesmo trecho.
2. GANCHO VISUAL (0–2 s): abra com 3 ou 4 planos MUITO curtos (0,3–0,6 s) dos detalhes mais impactantes (farol acendendo, roda, emblema, carro inteiro em ângulo baixo),
   com `punch` e transição `flash`/`whip`/`zoom`, e texto `gancho` com animação `slam` ou `palavras`. O primeiro quadro já tem movimento.
3. RAMPA DE VELOCIDADE nos planos de desejo: `rapido_lento` para revelar um detalhe (a roda gira rápido e desacelera no auge), `slowmo` em trechos marcados como bons em câmera lenta.
   Use em 2 a 4 planos, não em todos.
4. MOVIMENTO SEMPRE: nenhum plano estático. Varie `zoom_in` (detalhes), `zoom_out` (revelar o carro), `pan_esq`/`pan_dir`, `subir`/`descer` (tilt), `orbita`. `deriva` é o mínimo.
5. PUNCH-IN no corte de cada argumento novo (zoom seco de 20%) e `impacto` (tremida + RGB) só nos momentos de revelação (preço, km, gancho). Com apresentador: alterne plano aberto e fechado do mesmo take a cada frase.
6. TEXTO CINÉTICO, não legenda parada:
   - gancho: estilo `gancho` + `slam`/`palavras`, 2 a 5 palavras, com *palavra-chave* entre asteriscos (fica amarela e pulsa);
   - opcionais/diferenciais: 3 a 5 itens curtos (2 a 4 palavras) separados por quebra de linha, SEM ✓/números/marcadores (a animação cria). Escolha o estilo:
     `cards` (um card grande com ícone por vez), `grade` (mosaico 2×2 de ícones), `contador` (3, 2, 1 — um motivo por item),
     `letreiro` (faixas diagonais correndo, estilo car edit), `checklist` (caixas sendo marcadas), `lista` (pílulas com ✓).
     Na cena dos opcionais, faça UM PLANO POR ITEM, na mesma ordem dos itens, mostrando aquele opcional no take (o item aparece no corte do seu plano);
   - procedência/km: `etiqueta` — pílulas vermelhas que pulam; para 2 ou 3 selos em sequência separe com " | " (ex.: "*38 MIL KM* | ÚNICO DONO | REVISADO");
     ou `callout` apontando o detalhe no take (use o destaque_x/destaque_y do trecho);
   - preço: `de_por` quando houver FIPE ou preço antigo (texto "De R$ X | Por R$ Y"), senão `preco` (conta até o valor);
   - CTA: `cta` com `quique` ou `pop` e vida `pulsar`.
   Dê `vida` aos textos que ficam mais de 1,5 s na tela — prefira `batida` (pulsa com a música) nos ganchos e textos de impacto.
   PALAVRA-CHAVE FALADA: em cada `narracao`, marque com *asteriscos* a palavra ou expressão mais forte (até 3 palavras: número, benefício, preço),
   ex.: "Só *38 mil km* e revisado". Ela EXPLODE no centro da tela no instante em que é falada. Uma por cena, nunca a frase inteira.
   Narração em frases CURTAS e diretas (a voz vai em ritmo acelerado).
7. TRANSIÇÕES com função: `corte` seco é o padrão dentro da cena (na batida); entre cenas use `whip`, `zoom`, `giro` (energia), `flash` ou `luz` (revelação/preço), `glitch` (quebra de padrão no meio do vídeo).
   Nunca a mesma transição em todos os cortes.
8. DESENHO DE SOM: `whoosh` em whip/giro/slide, `riser` antes do preço, `impacto` + `dinheiro` na revelação do preço, `pop` em etiquetas. Moderado, mas presente.
9. QUEBRA DE PADRÃO a cada ~3 s (novo plano, texto, efeito ou som) para segurar a retenção até o CTA.
10. FINAL: CTA claro; último plano com `zoom_out` revelando o carro inteiro.
"""

PROMPT_MONTAGEM = COPY_PROMPT + PLAYBOOK_EDICAO + f"""
## Montagem a partir do catálogo de takes
- Use `take_id`, `inicio` e `fim` dentro dos trechos catalogados; prefira trechos com nota alta. Use o `foco_x` do trecho.
- A soma das durações dos planos de uma cena deve ficar próxima de `duracao_seg` da cena.
- Narração: frases curtas, UMA por cena, que caibam no tempo (≈2,5 palavras por segundo). Se o formato for "só texto", deixe narração vazia.
- Formato "Apresentador falando": use os trechos COM FALA e coloque em `narracao` exatamente a fala transcrita (vira legenda; o áudio original é usado).
  Intercale com planos de detalhe sem fala por cima (B-roll) só se a fala continuar no áudio.
- Se não houver takes, deixe take_id vazio — vira cartão animado com texto.
- Filtro: o mesmo filtro para todas as cenas (consistência), escolhido pelo tom.
- `estilo_narracao`: instrução curta de como a voz deve soar (ritmo, energia, emoção), em português.
- Se houver referências de anúncios/edições vencedoras, aplique os PADRÕES delas (gancho, ritmo, estrutura, técnicas), nunca copie texto.

Valores permitidos — transicao: {TRANSICOES}; sfx: {SFX}; estilo_texto: {ESTILOS_TEXTO}; animacao: {ANIMACOES};
vida: {VIDAS}; filtro: {FILTROS}; movimento: {MOVIMENTOS}; rampa: {RAMPAS}.
"""

_PLANO = {
    "type": "object",
    "properties": {
        "take_id": {"type": "string"},
        "inicio": {"type": "number"},
        "fim": {"type": "number"},
        "foco_x": {"type": "number"},
        "movimento": {"type": "string", "enum": MOVIMENTOS},
        "rampa": {"type": "string", "enum": RAMPAS},
        "punch": {"type": "boolean"},
        "impacto": {"type": "boolean"},
        "duracao_seg": {"type": "number"},
        "transicao": {"type": "string", "enum": TRANSICOES, "description": "transição para o plano seguinte"},
    },
    "required": ["take_id", "inicio", "fim", "foco_x", "movimento", "rampa", "punch", "impacto", "duracao_seg", "transicao"],
}

SCHEMA_MONTAGEM = {
    "type": "object",
    "properties": {
        "angulo_de_venda": {"type": "string"},
        "aprendizado_aplicado": {"type": "string", "description": "Qual padrão campeão da INTELIGÊNCIA DE MERCADO / guia da casa este vídeo aplica e em que cena (1-2 frases, cite o padrão)"},
        "publico_alvo": {"type": "string"},
        "estilo_narracao": {"type": "string"},
        "energia_musica": {"type": "string", "description": "Que tipo de música combina (BPM, clima)"},
        "filtro": {"type": "string", "enum": FILTROS},
        "cenas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "etapa": {"type": "string", "enum": ["gancho", "desejo", "prova", "oferta", "cta"]},
                    "narracao": {"type": "string"},
                    "duracao_seg": {"type": "number"},
                    "texto_tela": {"type": "string", "description": "Use *asteriscos* na palavra-chave; em `lista` um item por linha; em `de_por` 'De R$ X | Por R$ Y'"},
                    "estilo_texto": {"type": "string", "enum": ESTILOS_TEXTO},
                    "animacao": {"type": "string", "enum": ANIMACOES},
                    "vida": {"type": "string", "enum": VIDAS},
                    "callout_x": {"type": "number", "description": "Só para estilo callout: destaque_x do trecho (0-1)"},
                    "callout_y": {"type": "number", "description": "Só para estilo callout: destaque_y do trecho (0-1)"},
                    "sfx": {"type": "string", "enum": SFX},
                    "planos": {"type": "array", "items": _PLANO},
                },
                "required": ["etapa", "narracao", "duracao_seg", "texto_tela", "estilo_texto", "animacao", "vida",
                             "callout_x", "callout_y", "sfx", "planos"],
            },
        },
        "ganchos_alternativos": {"type": "array", "items": {"type": "string"}},
        "legenda_post": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "anuncio_meta": {
            "type": "object",
            "properties": {
                "texto_principal": {"type": "string"},
                "titulo": {"type": "string"},
                "descricao": {"type": "string"},
                "botao_cta": {"type": "string"},
            },
            "required": ["texto_principal", "titulo", "descricao", "botao_cta"],
        },
        "alertas": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["angulo_de_venda", "aprendizado_aplicado", "publico_alvo", "estilo_narracao", "energia_musica", "filtro", "cenas",
                 "ganchos_alternativos", "legenda_post", "hashtags", "anuncio_meta", "alertas"],
}


# ---------------------------------------------------------------- Stories (série diária)

PROMPT_SERIE = PROMPT_MONTAGEM + """
## DESTINO: STORIES DO INSTAGRAM (conteúdo diário pré-agendado)
- Cada story tem 12 a 18 segundos, COM narração curta e direta (1 frase por cena, fala de vendedor pernambucano, sem enrolação) + texto cinético grande.
- A série conta uma história ao longo dos dias, cada story com um OBJETIVO diferente (ex.: teaser/curiosidade → detalhes/opcionais →
  prova/procedência → preço/condição → última chamada). Não repita gancho, texto nem ordem de planos entre os stories.
- Ritmo frenético: planos de 0,4 a 1,2 s, sempre na batida.
- Deixe livres o topo (15%) e a base (22%) da tela para os stickers do Instagram; textos entre 20% e 75% da altura.
- Sugira o sticker nativo ideal para cada story (enquete, caixa de perguntas, contagem regressiva, link do WhatsApp, quiz, emoji slider)
  com o texto exato do sticker — stickers aumentam o alcance e as respostas.
- Use os takes disponíveis variando os trechos entre os stories.
"""

SCHEMA_SERIE = {
    "type": "object",
    "properties": {
        "estrategia": {"type": "string", "description": "A lógica da série em 1-2 frases"},
        "stories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "objetivo": {"type": "string"},
                    "dia": {"type": "string", "description": "Quando postar (ex.: Segunda 12h)"},
                    "sticker": {"type": "string", "description": "Tipo de sticker do Instagram"},
                    "texto_sticker": {"type": "string"},
                    "filtro": {"type": "string", "enum": FILTROS},
                    "cenas": SCHEMA_MONTAGEM["properties"]["cenas"],
                },
                "required": ["titulo", "objetivo", "dia", "sticker", "texto_sticker", "filtro", "cenas"],
            },
        },
    },
    "required": ["estrategia", "stories"],
}


# ---------------------------------------------------------------- calendário editorial

PROMPT_CALENDARIO = """Você é o gerente de marketing digital de uma loja de seminovos e planeja o calendário editorial do mês
(Instagram + anúncios pagos no Meta). Siga o PLANO PILOTO (funil, pilares com seus pesos, cadência, tema dos Stories por dia da semana)
e o guia de estilo da loja. Distribua o ESTOQUE informado: cada carro herói ganha 1 Reels de Vitrine + séries de Stories; carros que estão
há mais tempo merecem mais exposição. Varie formatos (nunca o mesmo formato de roteiro em Reels seguidos). Seja específico: cada entrada
diz exatamente qual é a ideia, o gancho e o CTA. Datas no formato AAAA-MM-DD; horários de pico (Stories 12h e 19h; Reels 18h–20h)."""

SCHEMA_CALENDARIO = {
    "type": "object",
    "properties": {
        "resumo": {"type": "string"},
        "entradas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "data": {"type": "string"},
                    "hora": {"type": "string"},
                    "tipo": {"type": "string", "enum": ["Stories", "Reels", "Anúncio", "Gravação"]},
                    "pilar": {"type": "string", "enum": ["Vitrine", "Autoridade", "Prova social", "Bastidores", "Oferta"]},
                    "titulo": {"type": "string"},
                    "ideia": {"type": "string", "description": "O que mostrar e como (2-3 frases)"},
                    "gancho": {"type": "string"},
                    "carro": {"type": "string", "description": "Carro do estoque (como informado) ou 'Geral'"},
                    "formato_roteiro": {"type": "string", "enum": list(FORMATOS.keys()) + ["livre"]},
                    "sticker": {"type": "string", "description": "Só Stories: sticker sugerido e o texto"},
                    "cta": {"type": "string"},
                },
                "required": ["data", "hora", "tipo", "pilar", "titulo", "ideia", "gancho", "carro", "formato_roteiro", "sticker", "cta"],
            },
        },
    },
    "required": ["resumo", "entradas"],
}


def catalogo_takes(takes):
    linhas = []
    for t in takes:
        a = t.get("analise")
        if not a:
            linhas.append(f"- take_id={t['id']} ({t['nome']}, {t['dur']:.1f}s): sem análise — use trechos de 0 a {t['dur']:.1f}s")
            continue
        fala = f" | FALA: \"{a['transcricao']}\"" if a.get("tem_fala") and a.get("transcricao") else ""
        plan = f" [= take planejado #{a['take_planejado']}]" if a.get("take_planejado") else ""
        linhas.append(f"- take_id={t['id']} ({t['nome']}, {t['dur']:.1f}s){plan}: {a['resumo']}{fala}")
        for s in a.get("segmentos", []):
            extra = []
            if s.get("camera"):
                extra.append(f"câmera: {s['camera']}")
            if s.get("bom_em_slowmo"):
                extra.append("bom em slowmo")
            if s.get("tem_fala"):
                extra.append("COM FALA")
            if s.get("destaque_x") is not None:
                extra.append(f"destaque ({s['destaque_x']:.2f},{s.get('destaque_y', 0.5):.2f})")
            linhas.append(
                f"    • {s['inicio']:.1f}-{s['fim']:.1f}s [{s['plano']}, uso: {s['uso']}, foco_x {s['foco_x']:.2f}, nota {s['nota']}"
                f"{', ' + ', '.join(extra) if extra else ''}] {s['descricao']}"
            )
    return "\n".join(linhas) or "(nenhum take enviado)"


def resumo_referencias(refs):
    linhas = []
    validas = [r for r in refs if r.get("analise") and r.get("usar", True) and not r.get("casa")]
    if len(validas) > 8:  # muitas referências: as 8 melhores, de lojas diferentes (o resto vem pela inteligência de mercado)
        ordem = sorted(validas, key=lambda r: (r["analise"].get("nota_performance") or 0, int(r.get("dias") or 0)), reverse=True)
        refs, vistos = [], set()
        for r in ordem:
            if r.get("anunciante") not in vistos:
                refs.append(r); vistos.add(r.get("anunciante"))
            if len(refs) == 8:
                break
    for r in refs:
        a = r.get("analise")
        if not a or not r.get("usar", True) or r.get("casa"):  # vídeos da casa entram pelo guia de estilo
            continue
        sinal = f"no ar há {r['dias']} dias" if r.get("dias") else "sem dado de dias"
        tec = "; ".join(a.get("tecnicas_edicao", [])[:5])
        linhas.append(
            f"- {a['titulo']} ({sinal}, nota {a['nota_performance']}): gancho [{a['tipo_gancho']}] \"{a['gancho']}\"; "
            f"ritmo {a['cortes_por_10s']} cortes/10s; estrutura: {' → '.join(a['estrutura'])}; "
            f"técnicas de edição: {tec}; copiar: {'; '.join(a['copiar'])}; evitar: {'; '.join(a['evitar'])}"
        )
    return "\n".join(linhas)


# ---------------------------------------------------------------- Banco de pautas (Setor de Conteúdo)

PROMPT_PAUTAS = """Você é o diretor de conteúdo de uma loja de seminovos que quer ser a REFERÊNCIA DO ESTADO no Instagram.
Crie pautas PRONTAS PARA PRODUZIR, não ideias vagas. Cada pauta é uma ordem de produção: o que gravar, o que falar, como editar.
Regras:
- Use os QUADROS FIXOS da loja (séries recorrentes com nome próprio) em pelo menos metade das pautas — consistência cria audiência.
- Pautas de Vitrine e Oferta são de um carro ESPECÍFICO do estoque (escreva o código entre colchetes, ex.: [p1234abcd] Ford Ka 2020);
  priorize carros com mais dias no pátio. Pautas de Autoridade/Bastidores podem ser 'Geral'.
- Aplique o que a INTELIGÊNCIA DE MERCADO mostrou que funciona (ganchos campeões, oportunidades) e evite o que está saturado.
- Gancho nos primeiros 1,5 s, sempre ano/modelo/preço na tela em vídeo de carro, CTA com motivo para chamar no WhatsApp.
- Reels = vídeo elaborado (geralmente com apresentador, 20–40 s). Stories = sequência curta só com takes + sticker. Anúncio = criativo de 15–25 s com prova e oferta.
- Roteiro em batidas curtas (o que aparece + o que é dito), linguagem de Pernambuco natural, sem clichês ('venha conferir', 'oportunidade imperdível').
- 'por_que' explica em 1 frase qual padrão do mercado/da casa justifica a pauta."""

SCHEMA_PAUTAS = {
    "type": "object",
    "properties": {
        "pautas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "quadro": {"type": "string", "description": "Nome do quadro fixo ou 'Avulso'"},
                    "tipo": {"type": "string", "enum": ["Reels", "Stories", "Anúncio"]},
                    "pilar": {"type": "string", "enum": ["Vitrine", "Autoridade", "Prova social", "Bastidores", "Oferta"]},
                    "formato_roteiro": {"type": "string", "enum": list(FORMATOS.keys()) + ["livre"]},
                    "carro": {"type": "string"},
                    "apresentador": {"type": "boolean"},
                    "precisa_gravar": {"type": "boolean", "description": "true se exige gravação nova; false se dá para montar com takes existentes"},
                    "gancho": {"type": "string"},
                    "ideia": {"type": "string", "description": "Resumo em 2 frases"},
                    "roteiro": {"type": "array", "items": {"type": "string"}, "description": "Batidas: '0-2s: [imagem] — fala/texto'"},
                    "takes": {"type": "array", "items": {"type": "string"}, "description": "Lista de takes a gravar"},
                    "cta": {"type": "string"},
                    "legenda": {"type": "string"},
                    "por_que": {"type": "string"},
                    "prioridade": {"type": "integer", "description": "1 (urgente) a 3"},
                },
                "required": ["titulo", "quadro", "tipo", "pilar", "formato_roteiro", "carro", "apresentador", "precisa_gravar",
                             "gancho", "ideia", "roteiro", "takes", "cta", "legenda", "por_que", "prioridade"],
            },
        },
    },
    "required": ["pautas"],
}



# ---------------------------------------------------------------- Dia a dia (entretenimento e relacionamento)

PROMPT_DIA = """Você é o social media de uma loja de seminovos de Pernambuco que quer ser a página de carros mais divertida e útil do estado.
Crie o conteúdo de ENTRETENIMENTO E RELACIONAMENTO de HOJE (além dos vídeos de venda dos carros):
- 4 DINÂMICAS DE STORIES prontas para postar: enquete, quiz, caixa de perguntas, 'este ou aquele', adivinhe o preço, contagem regressiva,
  bastidores da loja, 'você sabia?'. Cada uma usa um carro do estoque como cenário/assunto (escreva o código [p...]) e gera resposta do público.
  Escreva as telas (texto curto de cada tela), a fala curta da narração e o sticker exato (tipo, pergunta e opções).
- 2 IDEIAS DE REELS ELABORADOS (humor de loja, bastidor da negociação, especialista 'filé ou mico', comparação, mito/verdade, tour com
  apresentador): conceito, gancho, falas e a lista de takes a gravar (curta, gravável hoje no pátio).
Regras: linguagem pernambucana natural, sem clichê, nada de expor cliente, sempre ligado a carro/loja (os carros são o carro-chefe)."""

SCHEMA_DIA = {
    "type": "object",
    "properties": {
        "dinamicas": {"type": "array", "items": {"type": "object", "properties": {
            "titulo": {"type": "string"}, "dinamica": {"type": "string", "enum": ["enquete", "quiz", "caixa_perguntas", "este_ou_aquele", "adivinhe_preco", "contagem", "bastidores", "voce_sabia"]},
            "objetivo": {"type": "string"}, "carro": {"type": "string"}, "horario": {"type": "string"},
            "telas": {"type": "array", "items": {"type": "string"}}, "fala": {"type": "string"},
            "sticker_tipo": {"type": "string"}, "sticker_texto": {"type": "string"}, "sticker_opcoes": {"type": "array", "items": {"type": "string"}}},
            "required": ["titulo", "dinamica", "objetivo", "carro", "horario", "telas", "fala", "sticker_tipo", "sticker_texto", "sticker_opcoes"]}},
        "reels": {"type": "array", "items": {"type": "object", "properties": {
            "titulo": {"type": "string"}, "formato": {"type": "string"}, "conceito": {"type": "string"}, "gancho": {"type": "string"},
            "carro": {"type": "string"}, "falas": {"type": "array", "items": {"type": "string"}}, "takes": {"type": "array", "items": {"type": "string"}},
            "por_que": {"type": "string"}},
            "required": ["titulo", "formato", "conceito", "gancho", "carro", "falas", "takes", "por_que"]}},
    },
    "required": ["dinamicas", "reels"],
}
