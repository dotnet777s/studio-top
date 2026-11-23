"""Ficha da versão (método do TopCRM): itens de série pesquisados na web, com as fontes.

Busca no DuckDuckGo (sem chave) → lê as 3 melhores páginas de ficha técnica → a IA extrai os itens SÓ desses textos.
O resultado vira fato verdadeiro para os roteiros (a checagem de fatos aceita estes itens).
"""
import html as html_mod
import re
import time
import urllib.parse
import urllib.request

import ia

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9"}
SITES_RUINS = ("youtube.", "facebook.", "instagram.", "tiktok.", "olx.", "mercadolivre.", "x.com", "twitter.", "webmotors.com.br/comprar")

INSTRUCAO = """Você monta a ficha de itens de SÉRIE de uma versão de carro vendida no Brasil, para um vendedor usar em anúncios.
Use SOMENTE as informações dos textos das páginas fornecidas (fichas técnicas e catálogos). Se as páginas divergirem, fique com
o que aparece em mais de uma ou com a página mais específica da versão/ano. Não invente: item que não aparece nos textos fica de
fora. Português do Brasil, termos de vendedor."""

SCHEMA = {
    "type": "object",
    "properties": {
        "versao_confirmada": {"type": "string", "description": "Nome da versão como o mercado conhece"},
        "motor": {"type": "string", "description": "Ex.: 1.0 turbo 116 cv flex"},
        "cambio": {"type": "string", "description": "Ex.: automático de 6 marchas"},
        "itens_serie": {"type": "array", "items": {"type": "string"}, "description": "Até 14 itens de série que ajudam a vender"},
        "diferenciais": {"type": "array", "items": {"type": "string"}, "description": "3 a 5 diferenciais desta versão, frases curtas"},
        "selos": {"type": "array", "items": {"type": "string"}, "description": "3 a 6 rótulos curtos (até 22 caracteres) para o vídeo"},
        "confianca": {"type": "string", "enum": ["alta", "media", "baixa"]},
        "observacao": {"type": "string"},
    },
    "required": ["versao_confirmada", "motor", "cambio", "itens_serie", "diferenciais", "selos", "confianca", "observacao"],
}


def _abrir(url, dados=None, timeout=20):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(dados).encode() if dados else None, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        tipo = r.headers.get("content-type", "")
        return r.read(1_500_000).decode("utf-8", "ignore"), tipo


BONS = ("ficha", "carrosnaweb", "icarros", "autopapo", "quatrorodas", "motor1", "autoesporte", "noticiasautomoveis", "garagem360",
        "forumcarros", "mobiauto", "carrodegaragem", "napista", "kbb", "fipe")


def _bing(consulta):
    import base64
    try:
        txt, _ = _abrir("https://www.bing.com/search?" + urllib.parse.urlencode({"q": consulta, "setlang": "pt-BR", "cc": "BR"}))
    except Exception:  # noqa: BLE001
        return []
    urls = []
    for l in re.findall(r'<li class="b_algo"[^>]*>.*?<h2[^>]*><a[^>]+href="([^"]+)"', txt, re.S):
        l = html_mod.unescape(l)
        u = urllib.parse.parse_qs(urllib.parse.urlparse(l).query).get("u", [""])[0]
        if u.startswith("a1"):  # link de redirecionamento do Bing: a1 + base64url da URL real
            try:
                l = base64.urlsafe_b64decode(u[2:] + "=" * (-len(u[2:]) % 4)).decode()
            except Exception:  # noqa: BLE001
                continue
        urls.append(l)
    return urls


def buscar(consulta, n=6):
    """DuckDuckGo; se bloquear (página de verificação), Bing. Sites de ficha técnica primeiro."""
    urls = []
    try:
        txt, _ = _abrir("https://html.duckduckgo.com/html/", {"q": consulta, "kl": "br-pt"})
        for l in re.findall(r'class="result__a" href="([^"]+)"', txt):
            urls.append(urllib.parse.parse_qs(urllib.parse.urlparse(html_mod.unescape(l)).query).get("uddg", [l])[0])
    except Exception:  # noqa: BLE001
        pass
    if not urls:
        urls = _bing(consulta)
    vistos, out = set(), []
    for u in urls:
        if u.startswith("http") and not any(s in u for s in SITES_RUINS) and u not in vistos:
            vistos.add(u)
            out.append(u)
    out.sort(key=lambda u: not any(b in u for b in BONS))
    return out[:n]


def via_google(nome):
    """Último caminho (método do TopCRM): a própria IA pesquisa no Google e devolve o texto com as fontes."""
    from google.genai import types
    cfg = types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())], temperature=0.1)
    ultimo = None
    for m in ia.MODELOS:
        try:
            r = ia.client().models.generate_content(model=m, contents=(
                f"Pesquise na web a ficha técnica do {nome} vendido no Brasil e liste versão, motor, câmbio e TODOS os itens de série "
                "desta versão/ano (só o que as fontes confirmam)."), config=cfg)
            gm = r.candidates[0].grounding_metadata
            fontes = [(c.web.uri, c.web.title) for c in (gm.grounding_chunks or [])] if gm else []
            return r.text or "", fontes
        except Exception as e:  # noqa: BLE001
            ultimo = e
    raise RuntimeError(f"Busca do Google pela IA indisponível agora ({str(ultimo)[:80]}).")


def texto_da_pagina(url, limite=9000):
    try:
        h, tipo = _abrir(url, timeout=15)
    except Exception:  # noqa: BLE001
        return ""
    if "html" not in tipo:
        return ""
    h = re.sub(r"<(script|style|noscript|svg|header|footer|nav)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
    h = re.sub(r"<(br|/p|/li|/tr|/h\d|/div)[^>]*>", "\n", h, flags=re.I)
    t = html_mod.unescape(re.sub(r"<[^>]+>", " ", h))
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t)
    return t.strip()[:limite]


def pesquisar(carro):
    """Pesquisa a ficha da versão do carro. Levanta ia.ErroIA / RuntimeError se não achar."""
    nome = " ".join(str(carro.get(k, "")) for k in ("marca", "modelo", "versao", "ano")).strip()
    if not carro.get("modelo"):
        raise RuntimeError("Carro sem modelo.")
    paginas = []
    for u in buscar(f"{nome} itens de série ficha técnica"):
        if not any(b in u for b in BONS):  # só sites de ficha técnica (home de montadora/concessionária dá ficha errada)
            continue
        t = texto_da_pagina(u)
        if len(t) > 800:
            paginas.append((u, t))
        if len(paginas) == 3:
            break
    if paginas:
        pedido = f"Carro: {nome}.\n\n" + "\n\n".join(f"=== PÁGINA {i} ({u}) ===\n{t}" for i, (u, t) in enumerate(paginas, 1))
        fontes = [(u, urllib.parse.urlparse(u).netloc.replace("www.", "")) for u, _ in paginas]
    else:  # busca bloqueada: a IA pesquisa no Google
        texto, fontes = via_google(nome)
        if not texto.strip():
            raise RuntimeError("Não encontrei a ficha desta versão.")
        pedido = f"Carro: {nome}.\n\n=== RESULTADO DA PESQUISA NA WEB ===\n{texto}"
    f = ia.gerar_json(INSTRUCAO, pedido, SCHEMA, temperatura=0.1)
    f["fontes"] = [{"url": u, "titulo": t} for u, t in fontes][:5]
    f["pesquisado_em"] = time.strftime("%Y-%m-%dT%H:%M")
    f["selos"] = [s[:24] for s in f.get("selos", [])]
    return f
