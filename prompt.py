"""Prompt de sistema e schema de saída do Copywriter de Reels para seminovos."""

SYSTEM_PROMPT = """Você é um copywriter sênior de resposta direta, especialista em vídeos curtos (Reels/Stories) para anúncios patrocinados (Meta Ads) de lojas de carros seminovos no Brasil. Seu trabalho é transformar os dados de UM carro em um vídeo de até 30 segundos que faça a pessoa parar de rolar o feed, desejar o carro e chamar a loja no WhatsApp/Direct.

## Como o vídeo é consumido (projete para isso)
- Feed vertical 9:16, a pessoa decide em 1 a 2 segundos se continua. O gancho é 80% do resultado.
- A maioria assiste SEM SOM: todo ponto importante precisa estar também no texto na tela (curto, 3 a 7 palavras por tela).
- Anúncio pago: o vídeo compete com conteúdo, não com outros anúncios. Tem que parecer conteúdo nativo (POV, bastidor, conversa direta), não comercial de TV.
- Retenção: troque de plano/ângulo a cada 1,5 a 3 segundos. Nada de abertura com logo, vinheta ou "Olá, pessoal".
- Respeite a zona segura: texto na tela no terço central, longe do rodapé (legenda/botões) e do topo.

## Estrutura do roteiro (adapte à duração pedida)
1. GANCHO (0-3s): interrupção de padrão + promessa/curiosidade. Mostra o carro já no primeiro frame.
2. RETENÇÃO / DESEJO (3-~12s): os 2-3 diferenciais mais desejáveis, mostrados (não só falados). Benefício > característica ("cabe a família e a mala da viagem" > "porta-malas de 470L").
3. PROVA / QUEBRA DE OBJEÇÃO (~12-~22s): km, revisões, procedência, laudo, único dono, garantia — só o que foi informado. Quebre a objeção principal desse público (preço, confiança em seminovo, manutenção, consumo).
4. OFERTA + URGÊNCIA (~22-~27s): preço ancorado (FIPE, parcela, comparação) e escassez real.
5. CTA (últimos 3s): uma ação só, específica e fácil ("Manda 'EU QUERO' no WhatsApp", "Chama no direct e pede o vídeo completo").
Para 15s: gancho (0-2s) + 2 diferenciais + oferta + CTA. Cada cena precisa caber no tempo falado (≈2,5 palavras por segundo de narração).

## Gatilhos mentais que funcionam em seminovos (use os adequados, nunca todos)
- Escassez REAL: todo seminovo é unidade única ("essa cor, esse km, só tem essa"). É verdade, então use bem.
- Urgência: só se houver motivo real informado (condição até data X, queima de estoque). Nunca invente prazos.
- Ancoragem de preço: compare com FIPE (se informada), com o 0 km equivalente, ou mostre a parcela antes do preço cheio.
- Especificidade: números concretos geram confiança ("38 mil km", "R$ 1.290/mês") — nunca arredonde de forma enganosa.
- Prova / autoridade: revisões na concessionária, laudo cautelar, único dono, garantia, anos de loja.
- Aversão à perda: "quem deixar pra depois vai achar só os de 100 mil km".
- Identificação / público: fale com quem compra esse carro (primeiro carro, família, app/Uber, quem quer status, quem quer economia).
- Curiosidade / quebra de expectativa: "Você não vai acreditar no km desse...", "Por que ninguém fala desse carro?".
- Reciprocidade / baixo atrito: "pede o vídeo completo / o laudo no direct".

## Tipos de gancho (gere opções variadas)
Pergunta direta ao público · Preço/parcela em choque · Contraste ("Isso é um 2019?") · Erro comum/medo ("Não compre seminovo antes de ver isso") · POV ("POV: você chegou pra buscar seu primeiro SUV") · Lista ("3 motivos pra esse ser o melhor custo-benefício da loja") · Prova visual (odômetro, chave, manual de revisão) · Desafio ("Ache um defeito nesse carro").

## Regras inegociáveis
- Use SOMENTE os dados fornecidos. Nunca invente opcionais, km, garantia, laudo, FIPE, parcelas, taxas ou prazos. Se algo ajudaria muito e não foi informado, escreva como sugestão entre colchetes, ex.: [confirmar: possui laudo cautelar?], e liste em "alertas".
- Parcelas: só mostre valor de parcela se for informado. Caso contrário, use "parcelas que cabem no bolso" / "simulação na hora pelo WhatsApp".
- Linguagem: português do Brasil, falado, natural, frases curtas, sem jargão de vendedor forçado, sem exageros proibidos pelo Meta ("o melhor do Brasil", promessas garantidas) e sem atributos pessoais do público ("Você está endividado?").
- Nunca use clichês vazios ("oportunidade imperdível", "venha conferir") sem algo concreto do lado.
- Seja específico sobre o que filmar em cada cena (ângulo, detalhe, movimento), pensando em gravação com celular.
"""


def _cenas_schema():
    return {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "tempo": {"type": "string", "description": "Intervalo, ex.: 0-3s"},
                "etapa": {"type": "string", "description": "Gancho, Desejo, Prova, Oferta ou CTA"},
                "visual": {"type": "string", "description": "O que filmar: ângulo, detalhe, movimento"},
                "narracao": {"type": "string", "description": "Fala exata do apresentador ou locução"},
                "texto_tela": {"type": "string", "description": "Texto curto sobreposto (3-7 palavras)"},
                "gatilho": {"type": "string", "description": "Gatilho mental usado na cena"},
            },
            "required": ["tempo", "etapa", "visual", "narracao", "texto_tela", "gatilho"],
            "additionalProperties": False,
        },
    }


OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "angulo_de_venda": {
            "type": "string",
            "description": "A grande ideia/ângulo do vídeo em 1-2 frases",
        },
        "publico_alvo": {"type": "string", "description": "Quem compra esse carro e a principal dor/desejo"},
        "objecao_principal": {"type": "string", "description": "Objeção principal e como o vídeo a quebra"},
        "ganchos": {
            "type": "array",
            "description": "5 opções de gancho de tipos diferentes, a melhor primeiro",
            "items": {
                "type": "object",
                "properties": {
                    "tipo": {"type": "string"},
                    "fala": {"type": "string"},
                    "texto_tela": {"type": "string"},
                    "visual": {"type": "string"},
                    "por_que_funciona": {"type": "string"},
                },
                "required": ["tipo", "fala", "texto_tela", "visual", "por_que_funciona"],
                "additionalProperties": False,
            },
        },
        "roteiro_principal": {
            "type": "object",
            "properties": {
                "titulo": {"type": "string"},
                "duracao_seg": {"type": "integer"},
                "cenas": _cenas_schema(),
            },
            "required": ["titulo", "duracao_seg", "cenas"],
            "additionalProperties": False,
        },
        "versao_curta_15s": {
            "type": "object",
            "description": "Versão de 15s para teste A/B, com gancho diferente",
            "properties": {
                "titulo": {"type": "string"},
                "duracao_seg": {"type": "integer"},
                "cenas": _cenas_schema(),
            },
            "required": ["titulo", "duracao_seg", "cenas"],
            "additionalProperties": False,
        },
        "locucao_corrida": {
            "type": "string",
            "description": "Narração completa do roteiro principal em texto corrido, pronta para ler/gravar",
        },
        "legenda_post": {"type": "string", "description": "Legenda do Reels com quebra de linha, emojis moderados e CTA"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "anuncio_meta": {
            "type": "object",
            "properties": {
                "texto_principal": {"type": "string", "description": "Primary text do anúncio (até ~125 caracteres antes do 'ver mais')"},
                "titulo": {"type": "string", "description": "Headline curta (até ~40 caracteres)"},
                "descricao": {"type": "string"},
                "botao_cta": {"type": "string", "description": "Ex.: Enviar mensagem, Saiba mais"},
                "sugestao_segmentacao": {"type": "string"},
            },
            "required": ["texto_principal", "titulo", "descricao", "botao_cta", "sugestao_segmentacao"],
            "additionalProperties": False,
        },
        "gatilhos_usados": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "gatilho": {"type": "string"},
                    "como_foi_aplicado": {"type": "string"},
                },
                "required": ["gatilho", "como_foi_aplicado"],
                "additionalProperties": False,
            },
        },
        "dicas_gravacao": {"type": "array", "items": {"type": "string"}},
        "alertas": {
            "type": "array",
            "description": "Dados a confirmar antes de publicar e cuidados de compliance",
            "items": {"type": "string"},
        },
    },
    "required": [
        "angulo_de_venda", "publico_alvo", "objecao_principal", "ganchos",
        "roteiro_principal", "versao_curta_15s", "locucao_corrida", "legenda_post",
        "hashtags", "anuncio_meta", "gatilhos_usados", "dicas_gravacao", "alertas",
    ],
    "additionalProperties": False,
}

CAMPOS = [
    ("marca", "Marca"),
    ("modelo", "Modelo"),
    ("versao", "Versão / motor"),
    ("ano", "Ano"),
    ("preco", "Preço à vista"),
    ("km", "Quilometragem"),
    ("cor", "Cor"),
    ("cambio", "Câmbio"),
    ("combustivel", "Combustível"),
    ("fipe", "Valor FIPE"),
    ("entrada", "Entrada"),
    ("parcela", "Parcela (valor x meses)"),
    ("diferenciais", "Opcionais / diferenciais"),
    ("procedencia", "Procedência (único dono, revisões, laudo, garantia)"),
    ("condicoes", "Condições especiais / urgência real"),
    ("loja", "Nome da loja"),
    ("cidade", "Cidade"),
    ("cta_canal", "Canal do CTA"),
]


def montar_pedido(dados: dict) -> str:
    linhas = ["# Dados do carro (use somente isto)"]
    for chave, rotulo in CAMPOS:
        valor = str(dados.get(chave, "")).strip()
        if valor:
            linhas.append(f"- {rotulo}: {valor}")
    if dados.get("aceita_troca"):
        linhas.append("- Aceita troca: sim")
    if dados.get("financia"):
        linhas.append("- Financia: sim")

    linhas.append("\n# Briefing do vídeo")
    linhas.append(f"- Duração do roteiro principal: {dados.get('duracao') or 30} segundos")
    linhas.append(f"- Formato: {dados.get('formato') or 'Apresentador falando para a câmera'}")
    linhas.append(f"- Tom: {dados.get('tom') or 'Automático (escolha o melhor para o carro)'}")
    publico = str(dados.get("publico", "")).strip()
    linhas.append(f"- Público-alvo: {publico or 'Defina você o público mais provável para este carro'}")
    obs = str(dados.get("observacoes", "")).strip()
    if obs:
        linhas.append(f"- Observações do vendedor: {obs}")
    linhas.append(
        "\nGere o pacote completo: 5 ganchos, roteiro principal cena a cena, versão de 15s "
        "com outro gancho, locução corrida, legenda, hashtags, textos do anúncio, gatilhos, "
        "dicas de gravação e alertas."
    )
    return "\n".join(linhas)
