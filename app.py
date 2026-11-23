"""Estúdio de Reels para seminovos — servidor Flask + Google Gemini (plano gratuito)."""
import json
import os
import queue
import random
import re
import shutil
import threading
import time
import uuid
from pathlib import Path


def carregar_env():
    """Lê o arquivo .env (CHAVE=valor) sem dependências extras."""
    env = Path(__file__).parent / ".env"
    if not env.exists():
        return
    for linha in env.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


carregar_env()

from flask import send_file, Flask, abort, jsonify, request, send_from_directory  # noqa: E402
from werkzeug.utils import secure_filename  # noqa: E402

import ia  # noqa: E402
import midia  # noqa: E402
import studio_prompts as sp  # noqa: E402
from prompt import CAMPOS, OUTPUT_SCHEMA, SYSTEM_PROMPT, montar_pedido  # noqa: E402

BASE = Path(__file__).parent
PROJETOS = BASE / "projetos"
REFS = BASE / "referencias"
RENDERS = BASE / "renders"
for p in (PROJETOS, REFS, RENDERS):
    p.mkdir(exist_ok=True)

app = Flask(__name__, static_folder="static")
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 ** 3  # takes de estúdio podem ser grandes
trava = threading.RLock()


def uid(prefixo=""):
    return prefixo + uuid.uuid4().hex[:8]


def ler_json(caminho, padrao):
    try:
        return json.loads(Path(caminho).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return padrao


def gravar_json(caminho, dados):
    tmp = Path(str(caminho) + ".tmp")
    tmp.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(caminho)


def pasta_projeto(pid):
    p = PROJETOS / secure_filename(pid)
    if not p.is_dir():
        abort(404)
    return p


def midias(pid):
    return ler_json(pasta_projeto(pid) / "midias.json", {"takes": [], "musicas": [], "logo": None})


def alterar_midias(pid, fn):
    with trava:
        m = midias(pid)
        fn(m)
        gravar_json(pasta_projeto(pid) / "midias.json", m)
        return m


def alterar_take(pid, tid, **campos):
    def f(m):
        for t in m["takes"]:
            if t["id"] == tid:
                t.update(campos)
    alterar_midias(pid, f)


def erro(msg, status=400):
    return jsonify(erro=msg), status


@app.errorhandler(ia.ErroIA)
def _erro_ia(e):
    return erro(str(e), e.status)


# ================================================================ páginas

@app.get("/")
def estudio():
    return send_from_directory(BASE / "static" / "studio", "index.html")


@app.get("/copy")
def pagina_copy():
    return send_from_directory(BASE / "static", "copy.html")


@app.get("/media/<pid>/<path:arquivo>")
def media(pid, arquivo):
    return send_from_directory(pasta_projeto(pid), arquivo, conditional=True)


@app.get("/refmedia/<path:arquivo>")
def refmedia(arquivo):
    return send_from_directory(REFS, arquivo, conditional=True)


# ================================================================ copy rápida (página antiga)

@app.post("/api/gerar")
def gerar_copy():
    dados = request.get_json(silent=True) or {}
    faltando = [c for c in ("marca", "modelo", "ano", "preco") if not str(dados.get(c, "")).strip()]
    if faltando:
        return erro(f"Preencha: {', '.join(faltando)}")
    return jsonify(ia.gerar_json(SYSTEM_PROMPT, montar_pedido(dados), OUTPUT_SCHEMA))


# ================================================================ projetos

@app.get("/api/projetos")
def listar_projetos():
    lista = []
    for p in sorted(PROJETOS.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        d = ler_json(p / "projeto.json", None)
        if d:
            lista.append({"id": p.name, "nome": d.get("nome", p.name), "alterado": p.stat().st_mtime})
    return jsonify(lista)


@app.post("/api/projetos")
def criar_projeto():
    d = request.get_json(silent=True) or {}
    return jsonify(id=novo_projeto(d.get("nome") or "Novo vídeo", d.get("carro")))


def novo_projeto(nome, carro=None):
    pid = uid("p")
    pasta = PROJETOS / pid
    for sub in ("takes", "musicas", "narracao", "img"):
        (pasta / sub).mkdir(parents=True)
    dados = {"nome": nome, "criado": time.time(), "estoque": {"status": "disponivel", "entrada": time.strftime("%Y-%m-%d")}}
    if carro:
        dados["carro"] = carro
    gravar_json(pasta / "projeto.json", dados)
    gravar_json(pasta / "midias.json", {"takes": [], "musicas": [], "logo": None})
    return pid


# ================================================================ Estoque (cada carro = um projeto) e estágio de produção

def eh_teste(nome):
    return str(nome or "").lower().startswith("zz")


def ficha_estoque(p):
    """Resumo de um carro do estoque com o estágio de produção de conteúdo."""
    pj = ler_json(p / "projeto.json", {})
    md = ler_json(p / "midias.json", {"takes": []})
    takes = md.get("takes", [])
    pre = pj.get("prerroteiro") or {}
    cal = [e for e in ler_json(CALENDARIO, []) if e.get("projeto") == p.name]
    videos = [e for e in cal if e.get("arquivo")]
    est = pj.get("estoque") or {"status": "disponivel"}
    carro = pj.get("carro") or {}
    analisados = sum(1 for t in takes if t.get("status") == "analisado")
    trabalhando = sum(1 for t in takes if t.get("status") in ("na fila", "processando", "analisando"))
    if est.get("status") == "vendido":
        etapa = "vendido"
    elif not all(str(carro.get(k, "")).strip() for k in ("marca", "modelo", "ano", "preco")):
        etapa = "cadastrar"
    elif not takes:
        etapa = "gravar" if pre else "pre_roteiro"
    elif trabalhando:
        etapa = "processando"
    elif not videos:
        etapa = "editar"
    elif not any(e.get("status") == "postado" for e in cal):
        etapa = "pronto"
    else:
        etapa = "no_ar"
    entrada = est.get("entrada") or time.strftime("%Y-%m-%d", time.localtime(pj.get("criado", time.time())))
    try:
        dias = (time.time() - time.mktime(time.strptime(entrada, "%Y-%m-%d"))) // 86400
    except ValueError:
        dias = 0
    externos = [t for t in takes if t.get("thumb") and re.search(r"frente|frontal|lateral|traseira|extern|exterior|três quartos|3/4|carroceria",
                                                                  str((t.get("analise") or {}).get("resumo", "")), re.I)]
    thumb = next((t.get("thumb") for t in externos + takes if t.get("thumb")), None)  # capa: de preferência o carro por fora
    fotos = ler_json(p / "fotos.json", [])
    if fotos:
        thumb = fotos[0]["mini"]  # a capa das fotos (definida pelo time) é a imagem do carro
    return {
        "fotos": len(fotos), "topcrm": pj.get("topcrm"), "portais": pj.get("portais") or {},
        "unidade": (pj.get("estoque") or {}).get("unidade") or (pj.get("topcrm") or {}).get("unidade") or "",
        "id": p.name, "nome": pj.get("nome"), "carro": carro, "estoque": est, "dias_no_estoque": int(dias), "etapa": etapa,
        "takes": {"total": len(takes), "analisados": analisados, "trabalhando": trabalhando,
                  "planejados": len(pre.get("takes", [])), "feitos_plano": len(pre.get("feitos", []))},
        "thumb": f"/media/{p.name}/{thumb}" if thumb else None,
        "tem_prerroteiro": bool(pre), "pre_formato": pre.get("formato_nome"),
        "tem_roteiro": bool(pj.get("roteiro")), "serie": len((pj.get("serie") or {}).get("stories", [])),
        "videos": len(videos), "postados": sum(1 for e in cal if e.get("status") == "postado"),
        "proximos": sorted([{"id": e["id"], "data": e.get("data"), "hora": e.get("hora"), "tipo": e.get("tipo"), "titulo": e.get("titulo"),
                             "status": e.get("status")} for e in cal if e.get("data", "") >= time.strftime("%Y-%m-%d")],
                           key=lambda x: (x["data"], x.get("hora") or ""))[:6],
    }


@app.get("/api/estoque")
def listar_estoque():
    fichas = [ficha_estoque(p) for p in PROJETOS.iterdir() if (p / "projeto.json").exists()
              and not eh_teste(ler_json(p / "projeto.json", {}).get("nome"))]
    ordem = {"cadastrar": 0, "pre_roteiro": 1, "gravar": 2, "processando": 3, "editar": 4, "pronto": 5, "no_ar": 6, "vendido": 9}
    return jsonify(sorted(fichas, key=lambda f: (ordem.get(f["etapa"], 7), -f["dias_no_estoque"])))


@app.post("/api/estoque/importar")
def importar_estoque():
    """Cadastra vários carros de uma vez. Uma linha por carro: marca; modelo; versão; ano; preço; km; cor; câmbio; FIPE."""
    texto = (request.get_json(silent=True) or {}).get("texto", "")
    campos = ["marca", "modelo", "versao", "ano", "preco", "km", "cor", "cambio", "fipe"]
    criados = []
    for linha in texto.splitlines():
        partes = [x.strip() for x in re.split(r"[;\t|]", linha)]
        if len(partes) < 2 or not partes[0]:
            continue
        carro = {k: v for k, v in zip(campos, partes) if v}
        nome = " ".join(x for x in (carro.get("marca"), carro.get("modelo"), carro.get("ano")) if x)
        criados.append(novo_projeto(nome, carro))
    return jsonify(criados=len(criados), ids=criados)


@app.put("/api/estoque/<pid>")
def alterar_estoque(pid):
    """Status de venda (disponível, reservado, vendido) e data de entrada no pátio."""
    pasta = pasta_projeto(pid)
    d = request.get_json(silent=True) or {}
    with trava:
        pj = ler_json(pasta / "projeto.json", {})
        est = pj.get("estoque") or {}
        est.update({k: v for k, v in d.items() if k in ("status", "entrada", "obs", "unidade")})
        if d.get("status") == "vendido":
            est["vendido_em"] = time.strftime("%Y-%m-%d")
        pj["estoque"] = est
        gravar_json(pasta / "projeto.json", pj)
    if d.get("status") == "vendido":  # postagens futuras canceladas e anúncios retirados dos portais
        ao_vender(pid)
    return jsonify(ok=True)


@app.get("/api/projetos/<pid>")
def abrir_projeto(pid):
    pasta = pasta_projeto(pid)
    d = ler_json(pasta / "projeto.json", {})
    d.update(midias(pid))
    d["id"] = pid
    return jsonify(d)


@app.put("/api/projetos/<pid>")
def salvar_projeto(pid):
    pasta = pasta_projeto(pid)
    d = request.get_json(silent=True) or {}
    for k in ("takes", "musicas", "logo", "id"):
        d.pop(k, None)  # mídias são controladas pelo servidor
    with trava:
        atual = ler_json(pasta / "projeto.json", {})
        atual.update(d)
        gravar_json(pasta / "projeto.json", atual)
    return jsonify(ok=True)


@app.delete("/api/projetos/<pid>")
def apagar_projeto(pid):
    shutil.rmtree(pasta_projeto(pid), ignore_errors=True)
    return jsonify(ok=True)


# ================================================================ takes (fila de processamento)

fila = queue.Queue()      # FFmpeg (cópias leves): 1 por vez, para poupar memória
fila_ia = queue.Queue()   # análises da IA: rodam em paralelo e nunca travam o processamento dos takes


def trabalhador(q):
    while True:
        tarefa = q.get()
        try:
            tarefa()
        except Exception as e:  # noqa: BLE001
            print("[fila] erro:", e)
        finally:
            q.task_done()


threading.Thread(target=trabalhador, args=(fila,), daemon=True).start()
for _ in range(2):
    threading.Thread(target=trabalhador, args=(fila_ia,), daemon=True).start()


def processar_take(pid, tid, analisar=True):
    pasta = pasta_projeto(pid)
    t = next(x for x in midias(pid)["takes"] if x["id"] == tid)
    orig = pasta / t["original"]
    try:
        alterar_take(pid, tid, status="processando", etapa="lendo arquivo")
        info = midia.sondar(orig)
        if not info["dur"] or not info["w"]:
            raise RuntimeError("Arquivo de vídeo não reconhecido.")
        alterar_take(pid, tid, dur=info["dur"], w=info["w"], h=info["h"], tem_audio=info["tem_audio"],
                     etapa="criando cópia leve para edição")
        midia.criar_proxy(orig, pasta / "takes" / f"{tid}_proxy.mp4", info)
        pinfo = midia.sondar(pasta / "takes" / f"{tid}_proxy.mp4")
        midia.criar_miniatura(pasta / "takes" / f"{tid}_proxy.mp4", pasta / "takes" / f"{tid}.jpg",
                              min(info["dur"] * 0.3, 3))
        campos = {"proxy": f"takes/{tid}_proxy.mp4", "thumb": f"takes/{tid}.jpg", "fps": midia.fps_saida(info),
                  "w": pinfo["w"], "h": pinfo["h"], "dur": pinfo["dur"] or info["dur"]}
        if info["tem_audio"]:
            midia.extrair_audio(pasta / campos["proxy"], pasta / "takes" / f"{tid}.wav")
            campos["audio"] = f"takes/{tid}.wav"
            campos["fala"] = midia.segmentos_fala(pasta / "takes" / f"{tid}.wav")
        alterar_take(pid, tid, etapa="estabilizando e tratando a cor", **campos)
        aplicar_tratamento(pid, tid)
        alterar_take(pid, tid, etapa="preparando para a IA")
        midia.criar_proxy_ia(orig, pasta / "takes" / f"{tid}_ia.mp4", info["tem_audio"])
        alterar_take(pid, tid, status="pronto", etapa="")
    except Exception as e:  # noqa: BLE001
        alterar_take(pid, tid, status="erro", etapa="", erro=f"Falha ao processar: {str(e)[-200:]}")
        return
    if analisar:
        alterar_take(pid, tid, status="na fila", etapa="aguardando a IA")
        fila_ia.put(lambda: analisar_take(pid, tid))


def aplicar_tratamento(pid, tid, estabilizar=None, cor=None):
    """Tratamento profissional do take: mede o tremor, estabiliza (vidstab) se precisar, corrige exposição/cor
    e dá nitidez. A versão tratada vira a cópia de edição; a cópia crua fica guardada (proxy_bruto)."""
    pasta = pasta_projeto(pid)
    t = next(x for x in midias(pid)["takes"] if x["id"] == tid)
    bruto = pasta / (t.get("proxy_bruto") or t["proxy"])
    estabilizar = estabilizar or t.get("estabilizar") or "auto"
    cor = t.get("corrigir_cor", True) if cor is None else cor
    try:
        pi = midia.sondar(bruto)
        med = midia.medir_tremor(bruto, pi["w"], pi["h"])
        st = midia.medir_cor(bruto, pi["w"], pi["h"], pi["dur"]) if cor else False
        info = midia.sondar(pasta / t["original"])
        versao = int(t.get("versao_trat") or 0) + 1
        destino = pasta / "takes" / f"{tid}_trat{versao}.mp4"
        estab = midia.tratar_take(pasta / t["original"], bruto, destino, info, estabilizar, med["tremor"], st)
        tranco_cru = midia.medir_tranco(bruto, pi["w"], pi["h"])
        tranco = tranco_cru
        if estab:  # estabilizador inteligente: só fica se o resultado medir melhor que o take original
            di = midia.sondar(destino)
            tranco = midia.medir_tranco(destino, di["w"], di["h"])
            if tranco >= tranco_cru * 0.85 and estabilizar != "forte":
                print(f"[tratamento] {tid}: estabilizar piorou/não ajudou ({tranco_cru} → {tranco}); mantendo o movimento original")
                estab = midia.tratar_take(pasta / t["original"], bruto, destino, info, "off", med["tremor"], st)
                tranco = tranco_cru
        antigo = t.get("proxy") if t.get("proxy_bruto") else None
        alterar_take(pid, tid, proxy=f"takes/{destino.name}", proxy_bruto=str(bruto.relative_to(pasta)).replace("\\", "/"),
                     tremor=med["tremor"], estabilizado=estab, estabilizar=estabilizar, corrigir_cor=bool(cor),
                     versao_trat=versao, tratado=True, fps=midia.fps_saida(info), tranco=tranco, tranco_cru=tranco_cru)
        if antigo and antigo != f"takes/{destino.name}":
            (pasta / antigo).unlink(missing_ok=True)
        print(f"[tratamento] {tid}: tremor {med['tremor']} → {'estabilizado' if estab else 'sem estabilização'}, cor {'sim' if cor else 'não'}")
    except Exception as e:  # noqa: BLE001  (sem tratamento o take continua usável com a cópia crua)
        print(f"[tratamento] {tid} falhou: {e}")
        alterar_take(pid, tid, tratado=False, erro_trat=str(e)[-200:])


def analisar_take(pid, tid):
    pasta = pasta_projeto(pid)
    t = next(x for x in midias(pid)["takes"] if x["id"] == tid)
    alterar_take(pid, tid, status="analisando", etapa="a IA está assistindo o take", erro="")
    arquivo = None
    try:
        arquivo = ia.enviar_video(str(pasta / "takes" / f"{tid}_ia.mp4"))
        pedido = f"Duração do take: {t['dur']:.2f} segundos. Nome do arquivo: {t['nome']}."
        pre = ler_json(pasta / "projeto.json", {}).get("prerroteiro")
        if pre:
            pedido += ("\n\nEste take foi gravado seguindo o pré-roteiro abaixo. Identifique a qual take planejado ele corresponde "
                       "(campo take_planejado) e transcreva a fala se houver:\n" + sp.texto_prerroteiro(pre))
        analise = ia.gerar_json(sp.PROMPT_TAKE, [arquivo, pedido], sp.SCHEMA_TAKE, temperatura=0.3)
        for s in analise.get("segmentos", []):
            s["inicio"] = max(0.0, min(float(s["inicio"]), t["dur"] - 0.3))
            s["fim"] = max(s["inicio"] + 0.3, min(float(s["fim"]), t["dur"]))
            for k in ("foco_x", "foco_y", "destaque_x", "destaque_y"):
                s[k] = max(0.0, min(1.0, float(s.get(k, 0.5) or 0.5)))
        alterar_take(pid, tid, status="analisado", etapa="", analise=analise)
    except Exception as e:  # noqa: BLE001
        alterar_take(pid, tid, status="pronto", etapa="", erro=f"Análise da IA falhou: {e}")
    finally:
        if arquivo:
            ia.apagar_arquivo(arquivo)
    # processo: mídias do carro prontas (todas analisadas, pelo menos 4) e nenhum vídeo ainda → cria o pacote de conversão
    try:
        tks = midias(pid)["takes"]
        if (len([x for x in tks if x.get("proxy")]) >= 4 and not any(x.get("status") in ("na fila", "processando", "analisando") for x in tks)
                and not ler_conteudos(pid) and (ler_json(pasta_projeto(pid) / "projeto.json", {}).get("carro") or {}).get("preco")):
            print(f"[processo] mídias prontas em {pid}: carro pronto para criar vídeos")
    except Exception as e:  # noqa: BLE001
        print("[processo] pacote:", e)


@app.post("/api/projetos/<pid>/takes")
def enviar_takes(pid):
    pasta = pasta_projeto(pid)
    novos = []
    for f in request.files.getlist("arquivos"):
        tid = uid("t")
        ext = Path(f.filename or "video.mp4").suffix.lower() or ".mp4"
        nome_orig = f"takes/{tid}_original{ext}"
        f.save(pasta / nome_orig)
        take = {"id": tid, "nome": f.filename or tid, "original": nome_orig, "status": "na fila",
                "etapa": "aguardando", "dur": 0, "w": 0, "h": 0}
        alterar_midias(pid, lambda m, take=take: m["takes"].append(take))
        fila.put(lambda tid=tid: processar_take(pid, tid))
        novos.append(take)
    return jsonify(novos)


@app.post("/api/projetos/<pid>/takes/<tid>/analisar")
def reanalisar_take(pid, tid):
    alterar_take(pid, tid, status="na fila", etapa="aguardando análise")
    fila_ia.put(lambda: analisar_take(pid, tid))
    return jsonify(ok=True)


@app.delete("/api/projetos/<pid>/takes/<tid>")
def apagar_take(pid, tid):
    pasta = pasta_projeto(pid)
    alterar_midias(pid, lambda m: m.update(takes=[t for t in m["takes"] if t["id"] != tid]))
    for f in (pasta / "takes").glob(f"{tid}*"):
        try:
            f.unlink()
        except OSError:
            pass
    return jsonify(ok=True)


# ================================================================ músicas e logo

@app.post("/api/projetos/<pid>/musicas")
def enviar_musica(pid):
    pasta = pasta_projeto(pid)
    f = request.files.get("arquivo")
    if not f:
        return erro("Envie um arquivo de áudio.")
    mid = uid("m")
    orig = pasta / "musicas" / f"{mid}_orig{Path(f.filename or 'a.mp3').suffix.lower()}"
    f.save(orig)
    try:
        midia.converter_audio(orig, pasta / "musicas" / f"{mid}.wav")
    except Exception as e:  # noqa: BLE001
        return erro(f"Não consegui ler esse áudio: {str(e)[-150:]}")
    orig.unlink(missing_ok=True)
    musica = {"id": mid, "nome": Path(f.filename or mid).stem, "arquivo": f"musicas/{mid}.wav"}
    alterar_midias(pid, lambda m: m["musicas"].append(musica))
    return jsonify(musica)


@app.delete("/api/projetos/<pid>/musicas/<mid>")
def apagar_musica(pid, mid):
    alterar_midias(pid, lambda m: m.update(musicas=[x for x in m["musicas"] if x["id"] != mid]))
    (pasta_projeto(pid) / "musicas" / f"{mid}.wav").unlink(missing_ok=True)
    return jsonify(ok=True)


@app.post("/api/projetos/<pid>/logo")
def enviar_logo(pid):
    f = request.files.get("arquivo")
    if not f:
        return erro("Envie uma imagem.")
    nome = f"img/logo_{uid()}{Path(f.filename or 'l.png').suffix.lower()}"
    f.save(pasta_projeto(pid) / nome)
    alterar_midias(pid, lambda m: m.update(logo=nome))
    return jsonify(logo=nome)


# ================================================================ montagem com IA

def pedido_montagem(proj, takes, refs):
    carro = proj.get("carro", {})
    b = proj.get("briefing", {})
    linhas = ["# Dados do carro (use somente isto)"]
    for chave, rotulo in CAMPOS:
        v = str(carro.get(chave, "")).strip()
        if v:
            linhas.append(f"- {rotulo}: {v}")
    if carro.get("aceita_troca"):
        linhas.append("- Aceita troca: sim")
    if carro.get("financia"):
        linhas.append("- Financia: sim")
    linhas += [
        "\n# Briefing",
        f"- Duração alvo: {b.get('duracao') or 30} segundos (nunca passe disso)",
        f"- Formato: {b.get('formato') or 'Locução em off com imagens do carro'}",
        f"- Destino: {b.get('destino') or 'Reels'}" + (" (vídeo curto de 12-18 s COM narração curta e direta — 1 frase por cena —, texto grande, espaço livre no topo e na base para stickers)" if b.get("destino") == "Stories" else " (criativo de anúncio pago 15-22 s: gancho, prova, preço/condição e CTA com incentivo)" if b.get("destino") == "Anúncio" else ""),
        f"- Tom: {b.get('tom') or 'Automático'}",
        f"- Ritmo de edição: {b.get('ritmo') or 'Dinâmico (2 a 3 planos por cena, ~1 corte a cada 1-1,5 s)'}",
        f"- Público: {b.get('publico') or 'defina você'}",
    ]
    if str(carro.get("observacoes", "")).strip():
        linhas.append(f"- Observações do vendedor: {carro['observacoes']}")
    if proj.get("prerroteiro"):
        linhas += ["\n# PRÉ-ROTEIRO (o que foi planejado e gravado) — siga este plano: mesma ideia, gancho, estrutura e falas;"
                   " use os takes de acordo com o take planejado que cada um corresponde",
                   sp.texto_prerroteiro(proj["prerroteiro"])]
    linhas += ["\n# Takes disponíveis (catálogo)", sp.catalogo_takes(takes)]
    r = sp.resumo_referencias(refs)
    if r:
        linhas += ["\n# Referências: anúncios que estão vendendo (aplique os padrões)", r]
    linhas.append(sp.texto_marca(ler_json(MARCA, {})))
    linhas.append("\nMonte o vídeo completo: cenas na ordem, com take, trecho, narração, texto, "
                  "animação, transição, sfx e movimento. Depois a legenda, hashtags, textos do anúncio, "
                  "ganchos alternativos e alertas.")
    return "\n".join(linhas)


HISTORICO = BASE / "historico.json"


def escolher_formato(pedido, evitar):
    """Formato pedido, ou rodízio: sorteia entre os menos usados recentemente."""
    if pedido in sp.FORMATOS:
        return pedido
    hist = ler_json(HISTORICO, [])
    recentes = [h.get("formato") for h in hist[-6:]] + list(evitar or [])
    candidatos = [k for k in sp.FORMATOS if k not in recentes] or [k for k in sp.FORMATOS if k not in recentes[-2:]]
    if not candidatos:
        candidatos = list(sp.FORMATOS)
    usos = {k: sum(1 for h in hist if h.get("formato") == k) for k in candidatos}
    menor = min(usos.values())
    return random.choice([k for k in candidatos if usos[k] == menor])


def validar_planos(cenas, takes):
    """Garante takes válidos e tempos dentro do take (nunca cartão vazio quando há takes)."""
    por_id = {t["id"]: t for t in takes}
    for ic, c in enumerate(cenas):
        planos = []
        for pl in c.get("planos") or []:
            t = por_id.get(pl.get("take_id"))
            if not t and takes:
                t = takes[(len(planos) + ic) % len(takes)]
                pl["take_id"], pl["inicio"] = t["id"], 0.0
            if t:
                pl["inicio"] = max(0.0, min(float(pl.get("inicio") or 0), t["dur"] - 0.3))
                pl["fim"] = max(pl["inicio"] + 0.3, min(float(pl.get("fim") or t["dur"]), t["dur"]))
            else:
                pl["take_id"] = ""
            pl["foco_x"] = max(0.0, min(1.0, float(pl.get("foco_x", 0.5))))
            pl["duracao_seg"] = max(0.25, float(pl.get("duracao_seg") or 1.0))
            planos.append(pl)
        c["planos"] = planos or [{"take_id": "", "inicio": 0, "fim": 0, "foco_x": 0.5, "movimento": "deriva", "rampa": "nenhuma",
                                  "punch": False, "impacto": False, "duracao_seg": float(c.get("duracao_seg") or 2), "transicao": "corte"}]
        for k in ("callout_x", "callout_y"):
            c[k] = max(0.0, min(1.0, float(c.get(k) or 0.5)))
    return cenas


@app.post("/api/projetos/<pid>/takes/<tid>/tratamento")
def refazer_tratamento(pid, tid):
    d = request.get_json(silent=True) or {}
    est = d.get("estabilizar") if d.get("estabilizar") in ("auto", "forte", "off") else None
    cor = d.get("cor") if isinstance(d.get("cor"), bool) else None
    antes = next((x.get("status") for x in midias(pid)["takes"] if x["id"] == tid), "pronto")
    antes = antes if antes in ("pronto", "analisado") else "pronto"
    alterar_take(pid, tid, status="processando", etapa="estabilizando e tratando a cor")

    def job():
        aplicar_tratamento(pid, tid, est, cor)
        alterar_take(pid, tid, status=antes, etapa="")
    fila.put(job)
    return jsonify(ok=True)


@app.post("/api/projetos/<pid>/tratar_todos")
def tratar_todos(pid):
    """Aplica o tratamento nos takes que ainda não têm (takes enviados antes desta versão)."""
    n = 0
    forcar = bool((request.get_json(silent=True) or {}).get("forcar"))
    for t in midias(pid)["takes"]:
        if t.get("proxy") and (forcar or not t.get("tratado") or not t.get("estabilizado")) and t.get("status") in ("pronto", "analisado", "erro"):
            st = t.get("status")
            alterar_take(pid, t["id"], status="processando", etapa="estabilizando e tratando a cor")

            def job(i=t["id"], s=st):
                aplicar_tratamento(pid, i)
                alterar_take(pid, i, status=s, etapa="")
            fila.put(job)
            n += 1
    return jsonify(enfileirados=n)


@app.post("/api/projetos/<pid>/serie")
def gerar_serie(pid):
    pasta = pasta_projeto(pid)
    proj = ler_json(pasta / "projeto.json", {})
    carro = proj.get("carro", {})
    faltando = [c for c in ("marca", "modelo", "ano", "preco") if not str(carro.get(c, "")).strip()]
    if faltando:
        return erro(f"Preencha os dados do carro: {', '.join(faltando)}")
    n = max(2, min(6, int((request.get_json(silent=True) or {}).get("n") or 4)))
    takes = [t for t in midias(pid)["takes"] if t.get("proxy")]
    refs = ler_json(REFS / "refs.json", [])
    pedido = pedido_montagem(proj, takes, refs)
    pedido += f"\n\nCrie uma SÉRIE de {n} STORIES deste carro, para postar em dias diferentes. Cada story com 3 a 5 cenas curtas.\n"
    serie = ia.gerar_json(sp.PROMPT_SERIE, pedido, sp.SCHEMA_SERIE, temperatura=1.0)
    for st in serie.get("stories", []):
        validar_planos(st.get("cenas", []), takes)
    serie["criado"] = time.time()
    with trava:
        atual = ler_json(pasta / "projeto.json", {})
        atual["serie"] = serie
        gravar_json(pasta / "projeto.json", atual)
    return jsonify(serie)


@app.post("/api/projetos/<pid>/prerroteiro")
def gerar_prerroteiro(pid):
    pasta = pasta_projeto(pid)
    proj = ler_json(pasta / "projeto.json", {})
    carro = proj.get("carro", {})
    faltando = [c for c in ("marca", "modelo", "ano", "preco") if not str(carro.get(c, "")).strip()]
    if faltando:
        return erro(f"Preencha os dados do carro: {', '.join(faltando)}")
    corpo = request.get_json(silent=True) or {}
    pedido_fmt = corpo.get("formato") or (proj.get("briefing") or {}).get("formato_roteiro") or "auto"
    evitar = list(corpo.get("evitar") or [])
    if (proj.get("prerroteiro") or {}).get("formato"):
        evitar.append(proj["prerroteiro"]["formato"])  # pedir de novo = outra ideia
    formato = escolher_formato(pedido_fmt, evitar if pedido_fmt == "auto" else None)
    b = proj.get("briefing") or {}
    pedido = pedido_montagem(proj, [], []).split("\n# Takes disponíveis")[0]
    pedido += sp.instrucao_formato(formato, ler_json(HISTORICO, [])[-6:])
    if corpo.get("ideia"):
        pedido += "\n# IDEIA DEFINIDA PELO TIME (siga a ideia; pode melhorar a execução):\n" + str(corpo["ideia"])[:2000] + "\n"
    quem = {"apresentador": "Apresentador falando para a câmera (vendedor da loja) + takes do carro",
            "off": "Locução em off com imagens do carro"}.get(corpo.get("quem"), b.get("formato") or "Locução em off com imagens do carro")
    if corpo.get("quem") in ("apresentador", "off"):
        with trava:
            atual = ler_json(pasta / "projeto.json", {})
            atual.setdefault("briefing", {})["formato"] = quem
            gravar_json(pasta / "projeto.json", atual)
    pedido += (f"\n# Gravação\n- Quem aparece: {quem}\n"
               f"- Equipamento: {corpo.get('equipamento') or 'celular (com ou sem gimbal) no estúdio da loja'}\n"
               "\nCrie o pré-roteiro completo deste vídeo: conceito, gancho, estrutura, lista de takes na ordem de gravação, "
               "falas (se houver apresentador) ou narração em off, preparação do carro, câmera/luz e dicas.")
    pre = ia.gerar_json(sp.PROMPT_PRE, pedido, sp.SCHEMA_PRE, temperatura=1.0)
    pre["formato"] = formato
    pre["formato_nome"] = sp.FORMATOS[formato]["nome"]
    pre["criado"] = time.time()
    with trava:
        atual = ler_json(pasta / "projeto.json", {})
        atual["prerroteiro"] = pre
        gravar_json(pasta / "projeto.json", atual)
    return jsonify(pre)


@app.get("/api/formatos")
def listar_formatos():
    return jsonify({k: v["nome"] for k, v in sp.FORMATOS.items()})


# ---------------------------------------------------------------- checagem de fatos: nada que não esteja na ficha do carro

AFIRMACOES = [  # (o que a IA escreveu, o que precisa existir na ficha para poder afirmar)
    (r"ipva", r"ipva"),
    (r"laudo|cautelar|vistoria|perícia|pericia", r"laudo|cautelar|vistoria|perícia|pericia"),
    (r"garantia", r"garantia"),
    (r"[úu]nico dono|primeiro dono", r"[úu]nico dono|primeiro dono"),
    (r"revis(ad|õ|o|ões|oes)", r"revis"),
    (r"chave reserva|manual do propriet", r"chave reserva|manual"),
    (r"tanque cheio", r"tanque"),
    (r"transfer[êe]ncia (gr[áa]tis|inclusa|por nossa)", r"transfer"),
    (r"blindad", r"blind"),
    (r"pneus? novos?", r"pneu"),
    (r"sem detalhes|zero detalhe|impec[áa]vel|nunca bateu|sem batida|sem retoque", r"bateu|batida|retoque|impec|detalhe"),
    (r"aprova(ção|cao|do) (garantid|na hora|imediat)|sem consulta", r"aprova"),
]


def _numeros_validos(carro):
    vals = set()
    for k in ("preco", "fipe", "entrada", "parcela", "km"):
        for n in re.findall(r"\d[\d.,]*", str(carro.get(k, ""))):
            d = re.sub(r"\D", "", n.split(",")[0])
            if d:
                vals.add(int(d))
    return vals


def limpar_tela(t):
    """Tira linhas vazias e separadores sobrando depois de remover frases."""
    partes = [x.strip() for x in t.split("\n")]
    partes = [re.sub(r"^\|\s*|\s*\|$", "", re.sub(r"(\|\s*){2,}", "| ", x)).strip() for x in partes]
    return "\n".join(x for x in partes if x)


def checar_fatos(roteiro, carro, extra=""):
    """Remove de cada cena as frases (tela e narração) que afirmam algo que não está na ficha. Devolve o que foi removido.
    `extra`: fatos verdadeiros além da ficha (condições da loja, itens de série da versão)."""
    ficha = (" ".join(str(v) for v in carro.values()) + " " + extra).lower()
    nums = _numeros_validos(carro)
    km = int(re.sub(r"\D", "", str(carro.get("km", ""))) or 0)
    removidos = []

    def invalida(frase):
        f = frase.lower().replace("*", "")
        for diz, precisa in AFIRMACOES:
            if re.search(diz, f) and not re.search(precisa, ficha):
                return True
        for m in re.finditer(r"(\d{1,3})(?:[.,](\d{3}))?\s*(mil)?\s*(km|quil[ôo]metro)", f):  # km diferente da ficha
            v = int(m.group(1)) * (1000 if (m.group(3) or m.group(2)) else 1) + (int(m.group(2)) if m.group(2) else 0) - (int(m.group(1)) * 1000 if m.group(2) else 0)
            v = int(m.group(1) + (m.group(2) or "")) if m.group(2) else v
            if km and abs(v - km) > km * 0.1:
                return True
        for m in re.finditer(r"r\$\s*(\d[\d.]*)", f):  # preço/valor que não está na ficha
            v = int(re.sub(r"\D", "", m.group(1)) or 0)
            if v >= 1000 and nums and not any(abs(v - n) <= max(5, n * 0.002) for n in nums):
                return True
        return False

    for c in roteiro.get("cenas", []):
        tela = c.get("texto_tela") or ""
        linhas = re.split(r"(\n|\|)", tela)
        boas = [l for l in linhas if l in ("\n", "|") or not invalida(l)]
        if len(boas) != len(linhas):
            removidos += [l.strip() for l in linhas if l not in ("\n", "|") and invalida(l)]
            c["texto_tela"] = limpar_tela("".join(boas))
        narr = c.get("narracao") or ""
        frases = re.split(r"(?<=[.!?])\s+", narr)
        ok = [f for f in frases if not invalida(f)]
        if len(ok) != len(frases):
            removidos += [f for f in frases if invalida(f)]
            c["narracao"] = " ".join(ok)
    if removidos:
        print("[fatos] removido por não estar na ficha:", removidos)
    roteiro["fatos_removidos"] = removidos
    return removidos


NOTA_MINIMA = 80
CRITERIOS_REVISAO = [
    ("Gancho", "Para o scroll no 1º segundo? Específico, sem 'olá pessoal'? REGRA DA LOJA: o gancho e a 1ª cena NÃO podem falar de preço/valor/FIPE (se falar, nota máxima 3)."),
    ("Clareza da oferta", "Modelo, versão e preço ficam claros (e o preço é falado de forma natural, depois da apresentação)?"),
    ("Tempo", "A fala cabe na duração sem atropelar? Frases curtas, uma ideia por cena?"),
    ("Voz da loja", "Soa como a loja (pernambucana, especialista, direta) e não como locutor genérico?"),
    ("Persuasão", "Usa gatilhos com honestidade (escassez real, especificidade, ancoragem)?"),
    ("CTA", "Um único CTA claro, SEMPRE para o WhatsApp (direct/link/perfil = nota máxima 5), com motivo para chamar agora?"),
    ("Conformidade", "Não inventa dados (FIPE, parcela, km, itens fora da ficha, estado de conservação sem dado), sem superlativo falso, ok com Meta Ads? Dado inventado = nota máxima 3. As condições da loja e a ficha da versão são verdadeiras; prometer aprovação de crédito não."),
    ("Originalidade", "Foge dos ganchos/ângulos usados recentemente?"),
]
SCHEMA_REVISAO = {"type": "object", "properties": {
    "criterios": {"type": "array", "items": {"type": "object", "properties": {"nome": {"type": "string"}, "nota": {"type": "number"}, "comentario": {"type": "string"}},
                                             "required": ["nome", "nota", "comentario"]}},
    "correcoes": {"type": "array", "items": {"type": "string"}}, "veredito": {"type": "string"}}, "required": ["criterios", "correcoes", "veredito"]}


def revisar_roteiro(roteiro, proj, tipo):
    """Revisor exigente (método do TopCRM): nota 0–100 em 8 critérios + correções concretas. Falha da IA → None (não bloqueia)."""
    entrada = {"tipo": tipo, "carro": {k: (proj.get("carro") or {}).get(k) for k in ("marca", "modelo", "versao", "ano", "preco", "km", "cor")},
               "condicoes_da_loja": ler_json(MARCA, {}).get("condicoes_loja", []),
               "ganchos_recentes_para_nao_repetir": [h.get("gancho") for h in ler_json(HISTORICO, [])[-10:]],
               "roteiro": [{k: c.get(k) for k in ("narracao", "texto_tela")} for c in roteiro.get("cenas", [])],
               "criterios": [{"nome": n, "pergunta": q} for n, q in CRITERIOS_REVISAO]}
    try:
        rev = ia.gerar_json("Você é um revisor exigente de anúncios em vídeo (Meta Ads) para lojas de seminovos. Avalie com frieza, como quem paga "
                            "pela mídia: o que faz parar de rolar, entender a oferta e chamar no WhatsApp. Nota de 0 a 10 por critério e correções "
                            "CONCRETAS (reescreva a frase). Não elogie à toa.", "Revise este roteiro (JSON):\n" + json.dumps(entrada, ensure_ascii=False),
                            SCHEMA_REVISAO, temperatura=0.2)
    except Exception as e:  # noqa: BLE001
        print("[revisão] falhou:", e)
        return None
    notas = [max(0.0, min(10.0, float(c.get("nota") or 0))) for c in rev.get("criterios", [])]
    rev["nota"] = round(sum(notas) / len(notas) * 10) if notas else None
    print(f"[revisão] nota {rev['nota']}: {rev.get('veredito', '')[:100]}")
    return rev


@app.post("/api/projetos/<pid>/montar")
def montar(pid):
    proj = ler_json(pasta_projeto(pid) / "projeto.json", {})
    faltando = [c for c in ("marca", "modelo", "ano", "preco") if not str(proj.get("carro", {}).get(c, "")).strip()]
    if faltando:
        return erro(f"Preencha os dados do carro: {', '.join(faltando)}")
    return jsonify(gerar_roteiro(pid, request.get_json(silent=True) or {}))


DURACAO_TIPO = {"Stories": 15, "Reels": 30, "Anúncio": 20}


def gerar_roteiro(pid, corpo):
    """Roteiro completo (cenas, planos, falas, textos) para um vídeo do carro.
    corpo: formato, evitar, destino (Reels/Stories/Anúncio), direcao (pauta/agenda que originou o conteúdo)."""
    pasta = pasta_projeto(pid)
    proj = ler_json(pasta / "projeto.json", {})
    carro = proj.get("carro", {})
    if corpo.get("destino"):
        proj["briefing"] = {**(proj.get("briefing") or {}), "destino": corpo["destino"],
                            "duracao": DURACAO_TIPO.get(corpo["destino"], 30)}
    takes = [t for t in midias(pid)["takes"] if t.get("proxy")]
    for t in takes:  # takes antigos: voz limpa + mapa de fala (para corte de pausas e legenda sincronizada)
        if t.get("audio") and "fala" not in t:
            try:
                midia.extrair_audio(pasta / t["proxy"], pasta / t["audio"])
                t["fala"] = midia.segmentos_fala(pasta / t["audio"])
                alterar_take(pid, t["id"], fala=t["fala"])
            except Exception as e:  # noqa: BLE001
                print("[fala] falhou:", e)
    refs = ler_json(REFS / "refs.json", [])
    pre = proj.get("prerroteiro") or {}
    if pre.get("formato") and not corpo.get("formato") and not corpo.get("evitar"):
        pedido_fmt = pre["formato"]  # o vídeo segue o formato que foi planejado e gravado
    else:
        pedido_fmt = corpo.get("formato") or (proj.get("briefing") or {}).get("formato_roteiro") or "auto"
    formato = escolher_formato(pedido_fmt, corpo.get("evitar"))
    hist = ler_json(HISTORICO, [])
    estilos_recentes = [h.get("opcionais") for h in hist[-2:] if h.get("opcionais")]
    extra = sp.instrucao_formato(formato, hist[-8:])
    if estilos_recentes:
        extra += f"\nPara os opcionais, NÃO use os estilos {estilos_recentes} (usados nos últimos vídeos); escolha outro de {sp.ESTILOS_OPCIONAIS}.\n"
    # rodízio de como a prova e o preço aparecem (para o miolo não ficar igual)
    ult = hist[-1] if hist else {}
    prova = random.choice([p for p in sp.ESTILOS_PROVA if p != ult.get("prova")] or sp.ESTILOS_PROVA)
    preco = random.choice([p for p in sp.ESTILOS_PRECO if p != ult.get("preco")] or sp.ESTILOS_PRECO)
    extra += f"\nNeste vídeo, apresente a PROVA (km/procedência) assim: {prova}.\nApresente o PREÇO assim: {preco}.\n"
    frases = [f for h in hist[-6:] for f in h.get("frases", [])]
    if frases:
        extra += "\nFrases de tela já usadas recentemente (NÃO repita nem parafraseie de perto):\n" + "\n".join(f"- {f}" for f in frases[-30:]) + "\n"
    extra += f"\nSemente criativa deste vídeo: {random.randint(1000, 9999)} (use para variar escolhas de palavras, ordem de planos e transições).\n"
    if corpo.get("direcao"):
        extra += ("\n# ESTE VÍDEO JÁ TEM PAUTA DEFINIDA (siga a ideia, o gancho e o CTA; adapte aos takes):\n" + str(corpo["direcao"])[:2500] + "\n")
    extra += ("\n# FATOS (regra absoluta): só afirme procedência, km, preço, IPVA, laudo, garantia, revisões, dono e ofertas que estejam"
              " LITERALMENTE nos dados do carro acima. Se não está na ficha, não existe. Na dúvida, fale do que se vê nos takes.\n")
    marca = ler_json(MARCA, {})
    fv = proj.get("ficha_versao") or {}
    fatos_extra = " ".join(marca.get("condicoes_loja", []) + fv.get("itens_serie", []) + fv.get("selos", []) + [fv.get("motor", ""), fv.get("cambio", "")])
    if fv.get("itens_serie"):
        extra += "\n# FICHA DA VERSÃO (itens de série pesquisados, verdadeiros): " + "; ".join(fv.get("itens_serie", [])[:14]) + "\n"
    roteiro = ia.gerar_json(sp.PROMPT_MONTAGEM, pedido_montagem(proj, takes, refs) + extra, sp.SCHEMA_MONTAGEM, temperatura=1.1)
    checar_fatos(roteiro, carro, fatos_extra)
    rev = revisar_roteiro(roteiro, proj, corpo.get("destino") or (proj.get("briefing") or {}).get("destino") or "Reels")
    if rev and rev.get("nota") is not None and rev["nota"] < NOTA_MINIMA:  # abaixo da nota: reescreve com as correções
        print(f"[revisão] nota {rev['nota']} < {NOTA_MINIMA}: reescrevendo")
        try:
            novo = ia.gerar_json(sp.PROMPT_MONTAGEM, pedido_montagem(proj, takes, refs) + extra
                                 + "\n# REVISÃO DO ROTEIRO ANTERIOR (corrija TUDO isto nesta versão):\n- " + "\n- ".join(rev.get("correcoes", [])),
                                 sp.SCHEMA_MONTAGEM, temperatura=0.9)
            checar_fatos(novo, carro, fatos_extra)
            rev2 = revisar_roteiro(novo, proj, corpo.get("destino") or "Reels")
            if not rev2 or rev2.get("nota") is None or rev2["nota"] >= rev["nota"]:
                roteiro, rev = novo, (rev2 or rev)
        except Exception as e:  # noqa: BLE001
            print("[revisão] reescrita falhou:", e)
    if rev:
        roteiro["revisao"] = rev
    roteiro["formato"] = formato
    roteiro["formato_nome"] = sp.FORMATOS[formato]["nome"]
    opc = next((c["estilo_texto"] for c in roteiro.get("cenas", []) if c.get("estilo_texto") in sp.ESTILOS_OPCIONAIS), None)
    with trava:
        hist = ler_json(HISTORICO, [])
        gancho = next((c.get("texto_tela") or c.get("narracao") for c in roteiro.get("cenas", [])), "")
        hist.append({"formato": formato, "gancho": (gancho or "")[:120], "angulo": roteiro.get("angulo_de_venda", "")[:160],
                     "opcionais": opc, "prova": prova, "preco": preco,
                     "frases": [c.get("texto_tela", "")[:80] for c in roteiro.get("cenas", []) if c.get("texto_tela")][:8],
                     "carro": f"{carro.get('marca', '')} {carro.get('modelo', '')}", "quando": time.time()})
        gravar_json(HISTORICO, hist[-60:])
    por_id = {t["id"]: t for t in takes}
    rodizio = [t for t in takes]
    for c in roteiro.get("cenas", []):
        planos = []
        for pl in c.get("planos") or []:
            t = por_id.get(pl.get("take_id"))
            if not t and rodizio:  # a IA deixou sem take: usa um take real (nunca cartão vazio quando há takes)
                t = rodizio[(len(planos) + roteiro["cenas"].index(c)) % len(rodizio)]
                pl["take_id"], pl["inicio"] = t["id"], 0.0
            if not t:
                pl["take_id"] = ""
            else:
                pl["inicio"] = max(0.0, min(float(pl["inicio"]), t["dur"] - 0.3))
                pl["fim"] = max(pl["inicio"] + 0.3, min(float(pl["fim"]), t["dur"]))
            pl["foco_x"] = max(0.0, min(1.0, float(pl.get("foco_x", 0.5))))
            pl["duracao_seg"] = max(0.25, float(pl.get("duracao_seg") or 1.0))
            planos.append(pl)
        if not planos:
            planos = [{"take_id": "", "inicio": 0, "fim": 0, "foco_x": 0.5, "movimento": "deriva", "rampa": "nenhuma",
                       "punch": False, "impacto": False, "duracao_seg": float(c.get("duracao_seg") or 2), "transicao": "corte"}]
        c["planos"] = planos
        for k in ("callout_x", "callout_y"):
            c[k] = max(0.0, min(1.0, float(c.get(k) or 0.5)))
    return roteiro


# ================================================================ narração

def salvar_wav(pid, wav):
    nome = f"narracao/{uid('n')}.wav"
    (pasta_projeto(pid) / nome).write_bytes(wav)
    return {"url": nome, "dur": round(midia.duracao_wav(wav), 3)}


@app.post("/api/projetos/<pid>/narrar")
def narrar(pid):
    d = request.get_json(silent=True) or {}
    return jsonify(narrar_linhas(pid, d.get("linhas", []), d.get("voz"), d.get("estilo")))


def narrar_linhas(pid, linhas, voz=None, estilo=None):
    linhas = [str(x or "").replace("*", "").strip() for x in linhas]  # *destaques* só valem na tela
    voz = voz or "Puck"
    estilo = estilo or "animado, confiante, ritmo acelerado, vendedor de carros jovem, português do Brasil"
    validas = [(i, l) for i, l in enumerate(linhas) if l]
    saida = [None] * len(linhas)
    if not validas:
        return saida
    if len(validas) == 1:
        saida[validas[0][0]] = salvar_wav(pid, ia.narrar(validas[0][1], voz, estilo))
        return saida
    # Uma única chamada (economiza cota grátis) e depois divide pelas pausas.
    texto = "\n\n".join(l for _, l in validas)
    wav = ia.narrar(texto, voz, estilo + ". Faça uma pausa clara de meio segundo entre cada frase.")
    partes = midia.dividir_por_silencio(wav, [len(l) + 4 for _, l in validas])
    if partes is None:
        print("[narrar] não achei as pausas; gerando frase por frase")
        partes = [ia.narrar(l, voz, estilo) for _, l in validas]
    for (i, _), p in zip(validas, partes):
        saida[i] = salvar_wav(pid, p)
    return saida


# ================================================================ referências (Biblioteca de Anúncios)

def analisar_referencia(rid):
    refs = ler_json(REFS / "refs.json", [])
    r = next((x for x in refs if x["id"] == rid), None)
    if not r:
        return

    def atualizar(**campos):
        with trava:
            lst = ler_json(REFS / "refs.json", [])
            for x in lst:
                if x["id"] == rid:
                    x.update(campos)
            gravar_json(REFS / "refs.json", lst)

    atualizar(status="analisando", erro="")
    arquivo = None
    try:
        if r.get("casa"):
            contexto = (f"VÍDEO DA PRÓPRIA LOJA ({ler_json(MARCA, {}).get('nome') or 'nossa loja'}): estude a identidade — cores, fontes, "
                        f"bordões, jeito do apresentador, estrutura.\nTipo: {r.get('tipo') or '?'}\n"
                        f"Resultados: {r.get('visualizacoes') or '?'} visualizações, {r.get('mensagens') or '?'} mensagens/contatos\n")
        else:
            contexto = ""
        contexto += (f"Anunciante: {r.get('anunciante') or '?'}\nNo ar há: {r.get('dias') or '?'} dias\n"
                    f"Versões/variações do anúncio: {r.get('variacoes') or '?'}\nLink: {r.get('link') or '-'}\n"
                    f"Texto do anúncio: {r.get('texto') or '-'}\nObservações: {r.get('obs') or '-'}")
        conteudo = contexto
        link = r.get("link") or ""
        if not r.get("video") and re.search(r"(youtube\.com/(watch|shorts)|youtu\.be/)", link):
            conteudo = [ia.parte_youtube(link), contexto]  # o Gemini assiste direto do YouTube
        elif r.get("video"):
            ia_path = REFS / f"{rid}_ia.mp4"
            info = midia.sondar(REFS / r["video"])
            midia.criar_proxy_ia(REFS / r["video"], ia_path, info["tem_audio"])
            arquivo = ia.enviar_video(str(ia_path))
            conteudo = [arquivo, contexto]
        analise = ia.gerar_json(sp.PROMPT_REFERENCIA, conteudo, sp.SCHEMA_REFERENCIA, temperatura=0.4)
        atualizar(status="analisado", analise=analise)
        sintese_automatica()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        n = int(r.get("tentativas") or 0) + 1
        if n <= 8 and re.search(r"Limite|sobrecarregado|conexão|client has been closed", msg):
            # cota grátis do Gemini/instabilidade: volta para a fila e tenta de novo mais tarde
            atualizar(status="na fila", tentativas=n, erro="")
            threading.Timer(120 * n, lambda: fila_ia.put(lambda: analisar_referencia(rid))).start()
        else:
            atualizar(status="erro", erro=msg[:300])
    finally:
        if arquivo:
            ia.apagar_arquivo(arquivo)


# ================================================================ Calendário editorial + plano piloto

CALENDARIO = BASE / "calendario.json"
PLANO = BASE / "plano_piloto.json"
DIAS_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]


@app.get("/api/plano")
def obter_plano():
    return jsonify(ler_json(PLANO, {}))


@app.get("/api/calendario")
def listar_calendario():
    return jsonify(ler_json(CALENDARIO, []))


@app.post("/api/calendario")
def criar_entradas():
    d = request.get_json(silent=True) or {}
    novas = d if isinstance(d, list) else [d]
    with trava:
        cal = ler_json(CALENDARIO, [])
        for e in novas:
            e.setdefault("id", uid("e"))
            e.setdefault("status", "planejado")
            e.setdefault("criado", time.time())
            cal = [x for x in cal if x["id"] != e["id"]] + [e]
        gravar_json(CALENDARIO, cal)
    return jsonify(novas)


@app.put("/api/calendario/<eid>")
def alterar_entrada(eid):
    d = request.get_json(silent=True) or {}
    with trava:
        cal = ler_json(CALENDARIO, [])
        for e in cal:
            if e["id"] == eid:
                e.update({k: v for k, v in d.items() if k != "id"})
        gravar_json(CALENDARIO, cal)
    return jsonify(ok=True)


@app.delete("/api/calendario/<eid>")
def apagar_entrada(eid):
    with trava:
        gravar_json(CALENDARIO, [e for e in ler_json(CALENDARIO, []) if e["id"] != eid])
    return jsonify(ok=True)


@app.post("/api/calendario/plano")
def planejar_mes():
    """A IA monta o calendário do mês a partir do plano piloto, do estoque (projetos) e do guia da loja."""
    import datetime as _dt
    d = request.get_json(silent=True) or {}
    hoje = _dt.date.today()
    return jsonify(planejar(int(d.get("ano") or hoje.year), int(d.get("mes") or hoje.month)))


def planejar(ano, mes, inicio=None):
    """Monta o calendário de um mês (a partir de hoje ou de `inicio`) com o estoque, o plano e a inteligência de mercado."""
    import calendar as _cal
    import datetime as _dt
    hoje = inicio or _dt.date.today()
    ini = max(_dt.date(ano, mes, 1), hoje)
    fim = _dt.date(ano, mes, _cal.monthrange(ano, mes)[1])
    dias = [(ini + _dt.timedelta(days=i)) for i in range((fim - ini).days + 1)]
    ETAPA_TXT = {"cadastrar": "falta cadastro", "pre_roteiro": "precisa de pré-roteiro e gravação", "gravar": "PRECISA GRAVAR (pré-roteiro pronto)",
                 "processando": "takes processando", "editar": "takes gravados, PRECISA EDITAR", "pronto": "vídeos prontos para postar",
                 "no_ar": "já tem conteúdo no ar", "vendido": "VENDIDO"}
    fichas = [ficha_estoque(p) for p in PROJETOS.iterdir() if (p / "projeto.json").exists()
              and not eh_teste(ler_json(p / "projeto.json", {}).get("nome"))]
    fichas = [f for f in fichas if f["etapa"] != "vendido" and f["carro"].get("modelo")]
    estoque = [f"- [{f['id']}] {f['carro'].get('marca', '')} {f['carro'].get('modelo', '')} {f['carro'].get('versao', '')} {f['carro'].get('ano', '')}"
               f" — R$ {f['carro'].get('preco', '')} | {f['dias_no_estoque']} dias no pátio | {ETAPA_TXT.get(f['etapa'], f['etapa'])}"
               f" | {f['takes']['total']} takes" for f in fichas]
    plano = ler_json(PLANO, {})
    existentes = [e for e in ler_json(CALENDARIO, []) if str(e.get("data", "")).startswith(f"{ano:04d}-{mes:02d}")]
    pedido = (f"# Período\nDe {ini.isoformat()} a {fim.isoformat()} ({len(dias)} dias).\nDias: "
              + ", ".join(f"{x.isoformat()} ({DIAS_SEMANA[x.weekday()]})" for x in dias)
              + "\n\n# Estoque atual (carros com projeto no app)\n" + ("\n".join(estoque) or "(nenhum cadastrado — use 'Geral' e conteúdos de autoridade/bastidores)")
              + "\n\n# PLANO PILOTO\n" + json.dumps({k: plano.get(k) for k in ("funil", "pilares", "cadencia", "stories_por_dia", "anuncios")}, ensure_ascii=False)
              + sp.texto_marca(ler_json(MARCA, {}))
              + (("\n\n# Já agendado neste mês (não duplicar)\n" + "\n".join(f"- {e['data']} {e['tipo']}: {e.get('titulo', '')}" for e in existentes)) if existentes else "")
              + "\n\nCrie: 1 entrada de Stories POR DIA (a sequência do dia, com o tema do dia da semana), Reels conforme a cadência"
                " (segunda, quarta e sexta), 1 entrada de Anúncio por semana (segunda) listando os criativos a subir e, para cada carro que"
                " PRECISA GRAVAR ou precisa de pré-roteiro, 1 entrada de Gravação (terça de manhã, antes dos Reels dele)."
                " No campo carro, escreva o código entre colchetes do estoque, ex.: [p1234abcd] Ford Ka 2020."
                " Os Reels de Vitrine só podem ser de carros com takes ou com Gravação agendada antes deles."
                " Isto é uma ORDEM de produção, não sugestão: títulos no imperativo (Grave…, Poste…, Suba…).")
    r = ia.gerar_json(sp.PROMPT_CALENDARIO, pedido, sp.SCHEMA_CALENDARIO, temperatura=0.9)
    validas = []
    datas_ok = {x.isoformat() for x in dias}
    for e in r.get("entradas", []):
        if e.get("data") in datas_ok:
            e.update(id=uid("e"), status="planejado", criado=time.time(), origem="ia")
            pid = re.search(r"\[(p[0-9a-z]+)\]", e.get("carro", ""))
            alvo = next((f for f in fichas if pid and f["id"] == pid.group(1)), None) or next(
                (f for f in fichas if f["carro"].get("modelo") and f["carro"]["modelo"].lower() in str(e.get("carro", "")).lower()), None)
            if alvo:  # liga a postagem ao carro do estoque
                e["projeto"] = alvo["id"]
                e["carro"] = f"{alvo['carro'].get('marca', '')} {alvo['carro'].get('modelo', '')} {alvo['carro'].get('ano', '')}".strip()
            validas.append(e)
    with trava:
        cal = ler_json(CALENDARIO, []) + validas
        gravar_json(CALENDARIO, cal)
    return {"resumo": r.get("resumo", ""), "criadas": len(validas)}


@app.get("/api/calendario.ics")
def exportar_ics():
    """Arquivo para importar no Google Agenda / Agenda do celular (lembretes de postagem)."""
    linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TopCar Estudio//PT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Postagens da loja"]
    for e in ler_json(CALENDARIO, []):
        dt = str(e.get("data", "")).replace("-", "")
        h = re.sub(r"\D", "", str(e.get("hora") or "1200"))[:4].ljust(4, "0")
        if len(dt) != 8:
            continue
        txt = lambda s: str(s or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
        linhas += ["BEGIN:VEVENT", f"UID:{e['id']}@topcar-estudio", f"DTSTART:{dt}T{h}00", f"DURATION:PT30M",
                   f"SUMMARY:{txt(e.get('tipo'))}: {txt(e.get('titulo'))}",
                   f"DESCRIPTION:{txt(e.get('ideia'))}\\nGancho: {txt(e.get('gancho'))}\\nSticker: {txt(e.get('sticker'))}\\nStatus: {txt(e.get('status'))}",
                   "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Hora de postar", "END:VALARM", "END:VEVENT"]
    linhas.append("END:VCALENDAR")
    from flask import Response
    return Response("\r\n".join(linhas), mimetype="text/calendar",
                    headers={"Content-Disposition": "attachment; filename=postagens.ics"})


@app.post("/api/calendario/<eid>/aprender")
def aprender_com_post(eid):
    """Post publicado + métricas -> vira 'vídeo da casa' para o guia de estilo aprender o que funciona."""
    e = next((x for x in ler_json(CALENDARIO, []) if x["id"] == eid), None)
    if not e or not e.get("arquivo"):
        return erro("Este post não tem vídeo exportado ligado a ele.")
    m = re.match(r"/renders/([^/]+)/(.+)$", e["arquivo"])
    origem = RENDERS / secure_filename(m.group(1)) / m.group(2) if m else None
    if not origem or not origem.exists():
        return erro("Não achei o arquivo do vídeo (foi apagado?).")
    rid = uid("r")
    destino = REFS / f"{rid}.mp4"
    shutil.copy(origem, destino)
    ref = {"id": rid, "casa": True, "anunciante": ler_json(MARCA, {}).get("nome") or "Nossa loja", "tipo": e.get("tipo"),
           "visualizacoes": str(e.get("views") or ""), "mensagens": str(e.get("mensagens") or ""),
           "obs": f"Post de {e.get('data')} ({e.get('pilar')}): {e.get('titulo')}. Alcance {e.get('alcance') or '?'}, "
                  f"retenção 3s {e.get('retencao') or '?'}%, custo por conversa {e.get('custo_conversa') or '?'}",
           "video": destino.name, "link": "", "dias": "", "variacoes": "", "texto": "", "status": "na fila", "usar": True, "criado": time.time()}
    with trava:
        lst = ler_json(REFS / "refs.json", [])
        lst.insert(0, ref)
        gravar_json(REFS / "refs.json", lst)
    fila_ia.put(lambda: analisar_referencia(rid))
    return jsonify(ok=True, ref=rid)


# ================================================================ Kit da marca + guia de estilo da casa

MARCA = BASE / "marca"
MARCA.mkdir(exist_ok=True)
MARCA = MARCA / "marca.json"


@app.get("/api/marca")
def obter_marca():
    return jsonify(ler_json(MARCA, {}))


@app.put("/api/marca")
def salvar_marca():
    d = request.get_json(silent=True) or {}
    with trava:
        atual = ler_json(MARCA, {})
        d.pop("guia", None) if "guia" in d and d["guia"] is None else None
        atual.update(d)
        gravar_json(MARCA, atual)
    return jsonify(atual)


@app.post("/api/marca/logo")
def logo_marca():
    f = request.files.get("arquivo")
    if not f:
        return erro("Envie uma imagem.")
    nome = f"logo_{uid()}{Path(f.filename or 'l.png').suffix.lower() or '.png'}"
    f.save(MARCA.parent / nome)
    with trava:
        atual = ler_json(MARCA, {})
        atual["logo"] = nome
        gravar_json(MARCA, atual)
    return jsonify(logo=nome)


@app.get("/marca/<arquivo>")
def arquivo_marca(arquivo):
    return send_from_directory(MARCA.parent, secure_filename(arquivo))


@app.post("/api/marca/guia")
def gerar_guia():
    casa = [r for r in ler_json(REFS / "refs.json", []) if r.get("casa") and r.get("analise")]
    if not casa:
        return erro("Envie pelo menos 1 vídeo da loja na aba Marca e espere a análise terminar.")
    blocos = []
    for r in casa:
        a = r["analise"]
        blocos.append(
            f"## {a['titulo']} ({r.get('tipo') or '?'}) - {r.get('visualizacoes') or '?'} visualizações, {r.get('mensagens') or '?'} mensagens\n"
            f"Gancho [{a['tipo_gancho']}]: {a['gancho']}\nEstrutura: {' -> '.join(a['estrutura'])}\n"
            f"Ritmo: {a['cortes_por_10s']} cortes/10s | Texto na tela: {a['texto_na_tela']}\nNarração: {a['narracao']}\n"
            f"Música: {a['musica']} | CTA: {a['cta']}\nIdentidade visual: {a.get('identidade_visual', '')}\n"
            f"Técnicas: {'; '.join(a.get('tecnicas_edicao', []))}\nPor que funciona: {a['por_que_vende']}")
    m = ler_json(MARCA, {})
    cabeca = f"Loja: {m.get('nome') or 'loja de seminovos'} ({m.get('instagram') or ''})\n\n"
    guia = ia.gerar_json(sp.PROMPT_GUIA, cabeca + "\n\n".join(blocos), sp.SCHEMA_GUIA, temperatura=0.5)
    guia["base"] = len(casa)
    with trava:
        atual = ler_json(MARCA, {})
        atual["guia"] = guia
        gravar_json(MARCA, atual)
    return jsonify(guia)


@app.post("/api/referencias/sintese")
def sintetizar_mercado():
    refs = [r for r in ler_json(REFS / "refs.json", []) if r.get("analise") and not r.get("casa")]
    if len(refs) < 3:
        return erro("Analise pelo menos 3 referências antes de gerar a inteligência de mercado.")
    return jsonify(gerar_mercado(refs))


def sintese_automatica():
    """Quando a fila de estudo esvazia e há vídeos novos, a inteligência de mercado se atualiza sozinha."""
    lst = ler_json(REFS / "refs.json", [])
    if any(r.get("status") in ("na fila", "analisando") for r in lst):
        return
    refs = [r for r in lst if r.get("analise") and not r.get("casa")]
    base = (ler_json(MARCA, {}).get("mercado") or {}).get("base", 0)
    if len(refs) >= 3 and len(refs) - base >= 5:
        try:
            gerar_mercado(refs)
            print(f"[inteligência] atualizada com {len(refs)} vídeos")
        except Exception as e:  # noqa: BLE001
            print("[inteligência] falhou:", e)


def gerar_mercado(refs):
    blocos = []
    for r in refs:
        a = r["analise"]
        blocos.append(f"## {a['titulo']} — {r.get('anunciante') or '?'} (no ar há {r.get('dias') or '?'} dias, nota {a['nota_performance']})\n"
                      f"Gancho [{a['tipo_gancho']}]: {a['gancho']}\nEstrutura: {' -> '.join(a['estrutura'])}\n"
                      f"Ritmo: {a['cortes_por_10s']} cortes/10s | CTA: {a['cta']}\nTécnicas: {'; '.join(a.get('tecnicas_edicao', []))}\n"
                      f"Por que vende: {a['por_que_vende']}")
    mc = ia.gerar_json(sp.PROMPT_MERCADO, "\n\n".join(blocos), sp.SCHEMA_MERCADO, temperatura=0.5)
    mc["base"] = len(refs)
    mc["lojas"] = len({r.get("anunciante") for r in refs})
    mc["atualizado"] = time.time()
    with trava:
        atual = ler_json(MARCA, {})
        atual["mercado"] = mc
        gravar_json(MARCA, atual)
    return mc


@app.get("/api/referencias")
def listar_refs():
    return jsonify(ler_json(REFS / "refs.json", []))


@app.post("/api/referencias")
def criar_ref():
    rid = uid("r")
    f = request.files.get("video")
    ref = {k: (request.form.get(k) or "").strip() for k in ("anunciante", "link", "dias", "variacoes", "texto", "obs",
                                                           "visualizacoes", "mensagens", "tipo")}
    ref.update(id=rid, status="na fila", usar=True, criado=time.time(), casa=request.form.get("casa") == "1")
    if f and f.filename:
        ref["video"] = f"{rid}{Path(f.filename).suffix.lower() or '.mp4'}"
        f.save(REFS / ref["video"])
    elif not (ref["texto"] or ref["obs"] or re.search(r"youtube\.com|youtu\.be", ref["link"])):
        return erro("Envie o vídeo do anúncio, um link do YouTube ou pelo menos o texto/observações.")
    with trava:
        lst = ler_json(REFS / "refs.json", [])
        lst.insert(0, ref)
        gravar_json(REFS / "refs.json", lst)
    fila_ia.put(lambda: analisar_referencia(rid))
    return jsonify(ref)


@app.post("/api/referencias/retentar")
def retentar_refs():
    """Recoloca na fila as referências que deram erro."""
    with trava:
        lst = ler_json(REFS / "refs.json", [])
        ids = [x["id"] for x in lst if x.get("status") == "erro"]
        for x in lst:
            if x["id"] in ids:
                x.update(status="na fila", erro="", tentativas=0)
        gravar_json(REFS / "refs.json", lst)
    for rid in ids:
        fila_ia.put(lambda i=rid: analisar_referencia(i))
    return jsonify(recolocadas=len(ids))


@app.patch("/api/referencias/<rid>")
def alterar_ref(rid):
    d = request.get_json(silent=True) or {}
    with trava:
        lst = ler_json(REFS / "refs.json", [])
        for x in lst:
            if x["id"] == rid and "usar" in d:
                x["usar"] = bool(d["usar"])
        gravar_json(REFS / "refs.json", lst)
    return jsonify(ok=True)


@app.delete("/api/referencias/<rid>")
def apagar_ref(rid):
    with trava:
        lst = ler_json(REFS / "refs.json", [])
        gravar_json(REFS / "refs.json", [x for x in lst if x["id"] != rid])
    for f in REFS.glob(f"{secure_filename(rid)}*"):
        f.unlink(missing_ok=True)
    return jsonify(ok=True)


# ================================================================ render final

renders = {}


@app.post("/api/render/iniciar")
def render_iniciar():
    d = request.get_json(silent=True) or {}
    jid = uid("j")
    pasta = RENDERS / jid
    pasta.mkdir()
    renders[jid] = midia.Render(pasta, int(d.get("fps", 30)), int(d.get("w", 1080)), int(d.get("h", 1920)))
    return jsonify(id=jid)


@app.post("/api/render/<jid>/quadros")
def render_quadros(jid):
    r = renders.get(jid) or abort(404)
    nomes = sorted(request.files.keys())
    for n in nomes:
        r.quadro(request.files[n].read())
    return jsonify(quadros=r.quadros)


@app.post("/api/render/<jid>/finalizar")
def render_finalizar(jid):
    r = renders.pop(jid, None) or abort(404)
    audio = request.files.get("audio")
    wav = None
    if audio:
        wav = r.pasta / "audio.wav"
        audio.save(wav)
    nome = secure_filename(request.form.get("nome") or "reels") or "reels"
    try:
        final = r.finalizar(wav)
    except Exception as e:  # noqa: BLE001
        return erro(f"Falha ao codificar o vídeo: {str(e)[-300:]}", 500)
    destino = r.pasta / f"{nome}.mp4"
    final.replace(destino)
    (r.pasta / "video.mp4").unlink(missing_ok=True)
    if wav:
        wav.unlink(missing_ok=True)
    return jsonify(url=f"/renders/{jid}/{destino.name}")


@app.delete("/api/render/<jid>")
def render_cancelar(jid):
    r = renders.pop(jid, None)
    if r:
        r.cancelar()
        shutil.rmtree(r.pasta, ignore_errors=True)
    return jsonify(ok=True)


@app.get("/renders/<jid>/<arquivo>")
def baixar_render(jid, arquivo):
    return send_from_directory(RENDERS / secure_filename(jid), arquivo, as_attachment=True)


# ================================================================ Setor de Conteúdo & Visual: pautas, leads e integrações

PAUTAS = BASE / "pautas.json"
LEADS = BASE / "leads.json"
INTEG = BASE / "integracoes.json"


def _registrar_colecao(nome, caminho, prefixo, padrao):
    """CRUD simples de uma coleção JSON (lista de dicts com id)."""
    def listar():
        return jsonify(ler_json(caminho, []))

    def criar():
        d = request.get_json(silent=True) or {}
        novos = d if isinstance(d, list) else [d]
        with trava:
            lst = ler_json(caminho, [])
            for x in novos:
                for k, v in padrao.items():
                    x.setdefault(k, v)
                x.setdefault("id", uid(prefixo))
                x.setdefault("criado", time.time())
                lst.insert(0, x)
            gravar_json(caminho, lst)
        return jsonify(novos)

    def alterar(xid):
        d = request.get_json(silent=True) or {}
        with trava:
            lst = ler_json(caminho, [])
            for x in lst:
                if x["id"] == xid:
                    x.update({k: v for k, v in d.items() if k != "id"})
            gravar_json(caminho, lst)
        return jsonify(ok=True)

    def apagar(xid):
        with trava:
            gravar_json(caminho, [x for x in ler_json(caminho, []) if x["id"] != xid])
        return jsonify(ok=True)

    app.add_url_rule(f"/api/{nome}", f"listar_{nome}", listar, methods=["GET"])
    app.add_url_rule(f"/api/{nome}", f"criar_{nome}", criar, methods=["POST"])
    app.add_url_rule(f"/api/{nome}/<xid>", f"alterar_{nome}", alterar, methods=["PUT"])
    app.add_url_rule(f"/api/{nome}/<xid>", f"apagar_{nome}", apagar, methods=["DELETE"])


_registrar_colecao("pautas", PAUTAS, "a", {"status": "nova"})
_registrar_colecao("leads", LEADS, "l", {"status": "novo"})


def fichas_ativas():
    fichas = [ficha_estoque(p) for p in PROJETOS.iterdir() if (p / "projeto.json").exists()
              and not eh_teste(ler_json(p / "projeto.json", {}).get("nome"))]
    return [f for f in fichas if f["etapa"] != "vendido" and f["carro"].get("modelo")]


@app.post("/api/pautas/gerar")
def gerar_pautas():
    """A IA cria o banco de pautas: quadros fixos + estoque + inteligência de mercado."""
    d = request.get_json(silent=True) or {}
    qtd = max(4, min(int(d.get("quantidade") or 10), 20))
    plano = ler_json(PLANO, {})
    fichas = fichas_ativas()
    estoque = [f"- [{f['id']}] {f['carro'].get('marca', '')} {f['carro'].get('modelo', '')} {f['carro'].get('versao', '')} "
               f"{f['carro'].get('ano', '')} — R$ {f['carro'].get('preco', '')} | {f['carro'].get('km', '?')} km | "
               f"{f['dias_no_estoque']} dias no pátio | etapa: {f['etapa']} | {f['takes']['total']} takes" for f in fichas]
    antigas = [p.get("titulo", "") for p in ler_json(PAUTAS, [])[:60]]
    pedido = ("# Quadros fixos da loja\n" + json.dumps(plano.get("quadros", []), ensure_ascii=False)
              + "\n\n# Pilares\n" + json.dumps(plano.get("pilares", []), ensure_ascii=False)
              + "\n\n# Estoque\n" + ("\n".join(estoque) or "(sem carros cadastrados)")
              + sp.texto_marca(ler_json(MARCA, {}))
              + (("\n\n# Pautas que já existem (NÃO repetir tema nem gancho)\n- " + "\n- ".join(antigas)) if antigas else "")
              + (f"\n\n# Pedido do gerente\n{d['pedido']}" if d.get("pedido") else "")
              + f"\n\nCrie {qtd} pautas prontas para produzir.")
    r = ia.gerar_json(sp.PROMPT_PAUTAS, pedido, sp.SCHEMA_PAUTAS, temperatura=1.0)
    novas = []
    for p in r.get("pautas", []):
        m = re.search(r"\[(p[0-9a-z]+)\]", p.get("carro", ""))
        alvo = next((f for f in fichas if m and f["id"] == m.group(1)), None)
        if alvo:
            p["projeto"] = alvo["id"]
            p["carro"] = f"{alvo['carro'].get('marca', '')} {alvo['carro'].get('modelo', '')} {alvo['carro'].get('ano', '')}".strip()
        limpa = lambda v: re.sub(r"\s*\[p[0-9a-z]{6,}\]\s*", " ", v).strip() if isinstance(v, str) else [limpa(x) for x in v] if isinstance(v, list) else v
        for k in ("titulo", "ideia", "gancho", "roteiro", "takes", "cta", "legenda", "por_que"):
            p[k] = limpa(p.get(k))
        p.update(id=uid("a"), status="nova", criado=time.time(), origem="ia")
        novas.append(p)
    with trava:
        gravar_json(PAUTAS, novas + ler_json(PAUTAS, []))
    return jsonify(pautas=novas)


@app.post("/api/pautas/<aid>/agendar")
def agendar_pauta(aid):
    d = request.get_json(silent=True) or {}
    with trava:
        lst = ler_json(PAUTAS, [])
        p = next((x for x in lst if x["id"] == aid), None)
        if not p:
            return erro("Pauta não encontrada.", 404)
        e = {"id": uid("e"), "data": d.get("data"), "hora": d.get("hora") or ("19:00" if p.get("tipo") == "Reels" else "12:00"),
             "tipo": p.get("tipo") or "Reels", "pilar": p.get("pilar") or "Vitrine", "titulo": p.get("titulo"),
             "ideia": p.get("ideia", ""), "gancho": p.get("gancho", ""), "carro": p.get("carro", ""), "projeto": p.get("projeto"),
             "formato_roteiro": p.get("formato_roteiro", "livre"), "cta": p.get("cta", ""), "legenda": p.get("legenda", ""),
             "quadro": p.get("quadro", ""), "pauta": aid, "status": "gravar" if p.get("precisa_gravar") else "editar",
             "criado": time.time(), "origem": "pauta"}
        cal = ler_json(CALENDARIO, [])
        cal.append(e)
        gravar_json(CALENDARIO, cal)
        p.update(status="agendada", entrada=e["id"], data=e["data"])
        gravar_json(PAUTAS, lst)
    return jsonify(entrada=e)


SEGREDOS = ("token", "chave", "segredo")
MASCARA = "••••"


def _mascarar(d):
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out[k] = _mascarar(v)
        elif any(s in k for s in SEGREDOS) and v:
            out[k] = MASCARA + str(v)[-4:]
        else:
            out[k] = v
    return out


@app.get("/api/integracoes")
def obter_integracoes():
    return jsonify(_mascarar(ler_json(INTEG, {})))


@app.put("/api/integracoes")
def salvar_integracoes():
    d = request.get_json(silent=True) or {}
    with trava:
        atual = ler_json(INTEG, {})
        for servico, campos in d.items():
            if not isinstance(campos, dict):
                continue
            alvo = atual.setdefault(servico, {})
            for k, v in campos.items():
                if isinstance(v, str) and v.startswith(MASCARA):
                    continue  # valor mascarado: mantém o que já está salvo
                alvo[k] = v
        gravar_json(INTEG, atual)
    return jsonify(_mascarar(atual))


@app.post("/api/integracoes/<servico>/testar")
def testar_integracao(servico):
    """Confere se o token da Meta / WhatsApp Cloud API responde (só quando o usuário clica em Testar)."""
    import urllib.request as _ur, urllib.parse as _up, urllib.error as _ue
    cfg = ler_json(INTEG, {}).get(servico, {})
    token = cfg.get("token")
    if not token:
        return erro("Cole o token de acesso antes de testar.")
    alvo = {"meta": cfg.get("ig_id") or "me", "whatsapp": cfg.get("phone_id") or "me"}.get(servico, "me")
    campos = {"meta": "id,name,username", "whatsapp": "display_phone_number,verified_name,quality_rating"}.get(servico, "id,name")
    if servico == "meta" and alvo == "me":
        campos = "id,name"
    url = f"https://graph.facebook.com/v21.0/{_up.quote(alvo)}?fields={campos}&access_token={_up.quote(token)}"
    try:
        r = json.loads(_ur.urlopen(url, timeout=15).read())
        estado = {"conectado": True, "conta": r, "testado": time.time(), "erro": ""}
    except _ue.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error", {}).get("message", str(e))
        except Exception:
            msg = str(e)
        estado = {"conectado": False, "erro": msg, "testado": time.time()}
    except Exception as e:
        estado = {"conectado": False, "erro": str(e), "testado": time.time()}
    with trava:
        atual = ler_json(INTEG, {})
        atual.setdefault(servico, {}).update(estado)
        gravar_json(INTEG, atual)
    return jsonify(estado)


# ================================================================ Conteúdos do carro (cada vídeo: Reels, Stories, Anúncio)
# O carro é a base: dados + mídias (takes) + conteúdos. Cada conteúdo tem seu roteiro, falas, linha do tempo,
# vídeo final e ligação com a agenda e com a pauta que o originou.

ST_CONTEUDO = ["rascunho", "roteiro", "montado", "aprovado", "pronto", "postado"]


def arq_conteudos(pid):
    return pasta_projeto(pid) / "conteudos.json"


def ler_conteudos(pid):
    return ler_json(arq_conteudos(pid), [])


def alterar_conteudo(pid, cid, **campos):
    with trava:
        lst = ler_conteudos(pid)
        for c in lst:
            if c["id"] == cid:
                c.update(campos)
                c["atualizado"] = time.time()
        gravar_json(arq_conteudos(pid), lst)
    return next((c for c in lst if c["id"] == cid), None)


def novo_conteudo(pid, tipo="Reels", titulo="", origem="manual", direcao="", entrada=None, pauta=None, data=None):
    c = {"id": uid("c"), "tipo": tipo if tipo in DURACAO_TIPO else "Reels", "titulo": titulo or f"{tipo} do carro",
         "status": "rascunho", "origem": origem, "direcao": direcao, "entrada": entrada, "pauta": pauta, "data": data,
         "criado": time.time(), "atualizado": time.time()}
    with trava:
        lst = ler_conteudos(pid)
        lst.append(c)
        gravar_json(arq_conteudos(pid), lst)
    if entrada:  # liga a postagem da agenda ao conteúdo
        with trava:
            cal = ler_json(CALENDARIO, [])
            for e in cal:
                if e["id"] == entrada:
                    e["conteudo"] = c["id"]
                    e["projeto"] = pid
            gravar_json(CALENDARIO, cal)
    return c


def direcao_de(e):
    """Texto de direção a partir de uma postagem da agenda ou de uma pauta."""
    partes = [f"Título: {e.get('titulo', '')}", f"Ideia: {e.get('ideia', '')}", f"Gancho: {e.get('gancho', '')}",
              f"Pilar: {e.get('pilar', '')}", f"Quadro fixo: {e.get('quadro', '')}", f"CTA: {e.get('cta', '')}"]
    if e.get("roteiro"):
        partes.append("Roteiro: " + " | ".join(e["roteiro"]))
    if e.get("sticker"):
        partes.append(f"Sticker do Stories: {e['sticker']}")
    return "\n".join(p for p in partes if not p.endswith(": "))


def roteirizar_conteudo(pid, cid):
    """A parte pesada (IA): roteiro + narração. O navegador só monta o vídeo a partir disto, em segundos."""
    c = next((x for x in ler_conteudos(pid) if x["id"] == cid), None)
    if not c:
        return None
    proj = ler_json(pasta_projeto(pid) / "projeto.json", {})
    b = proj.get("briefing") or {}
    alterar_conteudo(pid, cid, status="rascunho", etapa="escrevendo o roteiro", erro="")
    try:
        r = gerar_roteiro(pid, {"destino": c["tipo"], "direcao": c.get("direcao") or ""})
        apresentador = bool(re.search(r"apresentador", b.get("formato") or "", re.I)) and any(
            (t.get("analise") or {}).get("tem_fala") for t in midias(pid)["takes"])
        falas = [None] * len(r.get("cenas", []))
        if not apresentador and c.get("narrar", True) and any((x.get("narracao") or "").strip() for x in r.get("cenas", [])):
            alterar_conteudo(pid, cid, etapa="gravando a narração")
            estilo = ". ".join(x for x in [b.get("estilo"), r.get("estilo_narracao")] if x)
            falas = narrar_linhas(pid, [x.get("narracao", "") for x in r["cenas"]], b.get("voz"), estilo)
        return alterar_conteudo(pid, cid, roteiro=r, falas=falas, status="roteiro", etapa="", timeline=None,
                                aprendizado=r.get("aprendizado_aplicado", ""), legenda=r.get("legenda", ""))
    except Exception as e:  # noqa: BLE001
        alterar_conteudo(pid, cid, etapa="", erro=str(e)[:300])
        raise


@app.get("/api/projetos/<pid>/conteudos")
def listar_conteudos(pid):
    return jsonify(ler_conteudos(pid))


@app.post("/api/projetos/<pid>/conteudos")
def criar_conteudo(pid):
    d = request.get_json(silent=True) or {}
    direcao = d.get("direcao") or ""
    if d.get("pauta"):
        p = next((x for x in ler_json(PAUTAS, []) if x["id"] == d["pauta"]), None)
        if p:
            direcao = direcao or direcao_de(p)
            d.setdefault("tipo", p.get("tipo"))
            d.setdefault("titulo", p.get("titulo"))
    c = novo_conteudo(pid, d.get("tipo") or "Reels", d.get("titulo") or "", d.get("origem") or "manual", direcao,
                      d.get("entrada"), d.get("pauta"), d.get("data"))
    return jsonify(c)


@app.put("/api/projetos/<pid>/conteudos/<cid>")
def salvar_conteudo(pid, cid):
    d = request.get_json(silent=True) or {}
    d.pop("id", None)
    c = alterar_conteudo(pid, cid, **d)
    if c and d.get("arquivo") and c.get("entrada"):  # vídeo pronto: a postagem da agenda recebe o arquivo
        with trava:
            cal = ler_json(CALENDARIO, [])
            for e in cal:
                if e["id"] == c["entrada"]:
                    e.update(arquivo=d["arquivo"], status="pronto" if e.get("status") != "postado" else "postado",
                             legenda=e.get("legenda") or c.get("legenda", ""))
            gravar_json(CALENDARIO, cal)
    return jsonify(c or {})


@app.delete("/api/projetos/<pid>/conteudos/<cid>")
def apagar_conteudo(pid, cid):
    with trava:
        gravar_json(arq_conteudos(pid), [c for c in ler_conteudos(pid) if c["id"] != cid])
    return jsonify(ok=True)


@app.post("/api/projetos/<pid>/conteudos/<cid>/roteirizar")
def roteirizar(pid, cid):
    return jsonify(roteirizar_conteudo(pid, cid))


@app.get("/api/conteudos")
def todos_conteudos():
    """Todos os conteúdos de todos os carros (para Hoje, Produção e a fábrica de vídeos)."""
    out = []
    for p in PROJETOS.iterdir():
        if not (p / "conteudos.json").exists():
            continue
        pj = ler_json(p / "projeto.json", {})
        if eh_teste(pj.get("nome")):
            continue
        carro = pj.get("carro", {})
        nome = " ".join(str(carro.get(k, "")) for k in ("marca", "modelo", "ano")).strip() or pj.get("nome")
        for c in ler_json(p / "conteudos.json", []):
            out.append({k: v for k, v in c.items() if k not in ("timeline", "roteiro", "falas")} | {"projeto": p.name, "carro": nome})
    return jsonify(sorted(out, key=lambda c: (c.get("data") or "9999", c.get("criado", 0))))


# ================================================================ Rotina diária: o setor trabalha sozinho

ROTINA = BASE / "rotina.json"


def rotina_diaria(forcar=False):
    """Uma vez por dia: completa a agenda, cria os conteúdos do dia (e de amanhã) já roteirizados e narrados,
    e repõe o banco de pautas. O que sobra para a equipe: gravar takes, revisar as falas e postar."""
    import datetime as _dt
    hoje = _dt.date.today()
    estado = ler_json(ROTINA, {})
    if estado.get("data") == hoje.isoformat() and not forcar:
        return estado
    log = []
    estado.update(data=hoje.isoformat(), inicio=time.time(), rodando=True, log=log)
    gravar_json(ROTINA, estado)

    def registrar(msg):
        print("[rotina]", msg)
        log.append({"t": time.time(), "msg": msg})
        estado["log"] = log
        gravar_json(ROTINA, estado)

    try:
        # 1. agenda: os próximos 10 dias precisam estar planejados
        cal = ler_json(CALENDARIO, [])
        prox = [e for e in cal if e.get("status") != "cancelado" and hoje.isoformat() <= e.get("data", "") <= (hoje + _dt.timedelta(days=10)).isoformat()]
        if len({e["data"] for e in prox if e.get("tipo") == "Stories"}) < 7:
            try:
                r = planejar(hoje.year, hoje.month)
                registrar(f"Agenda do mês completada: {r['criadas']} postagens novas.")
                fim_mes = _dt.date(hoje.year, hoje.month, 28)
                if hoje >= fim_mes - _dt.timedelta(days=5):
                    nm = (hoje.replace(day=28) + _dt.timedelta(days=5))
                    r = planejar(nm.year, nm.month, inicio=nm.replace(day=1))
                    registrar(f"Agenda do mês seguinte iniciada: {r['criadas']} postagens.")
            except Exception as e:  # noqa: BLE001
                registrar(f"Não consegui planejar a agenda agora: {e}")
        # 2. conteúdos: cada postagem de hoje até depois de amanhã vira um conteúdo num carro, já roteirizado e narrado.
        #    Postagem "Geral" (sem carro) recebe o carro do dia: o que tem takes, menos conteúdo recente e mais dias no pátio.
        dias_alvo = {(hoje + _dt.timedelta(days=k)).isoformat() for k in range(3)}
        fichas = [f for f in fichas_ativas() if f["takes"]["total"] > 0]
        recentes = {}
        for f in fichas:
            recentes[f["id"]] = sum(1 for c in ler_conteudos(f["id"]) if c.get("criado", 0) > time.time() - 7 * 86400)
        fila_carros = sorted(fichas, key=lambda f: (recentes[f["id"]], -f["dias_no_estoque"]))
        with trava:
            cal = ler_json(CALENDARIO, [])
            k = 0
            for e in cal:
                if (e.get("data") in dias_alvo and e.get("tipo") in ("Stories", "Reels", "Anúncio") and not e.get("projeto")
                        and e.get("status") not in ("cancelado", "postado") and fila_carros):
                    f = fila_carros[k % len(fila_carros)]
                    k += 1
                    e["projeto"], e["carro_auto"] = f["id"], True
                    e["carro"] = f"{f['carro'].get('marca', '')} {f['carro'].get('modelo', '')} {f['carro'].get('ano', '')}".strip()
            gravar_json(CALENDARIO, cal)
        if k:
            registrar(f"{k} postagens sem carro receberam o carro do dia (quem está há mais tempo sem conteúdo).")
        alvo = [e for e in cal if e.get("data") in dias_alvo
                and e.get("tipo") in ("Stories", "Reels", "Anúncio") and e.get("status") not in ("cancelado", "postado")
                and e.get("projeto") and not e.get("conteudo") and not e.get("arquivo")]
        alvo.sort(key=lambda e: (e["data"], e.get("hora", "")))
        for e in alvo:
            pid = e["projeto"]
            if not (PROJETOS / pid / "projeto.json").exists():
                continue
            if not any(t.get("proxy") for t in midias(pid)["takes"]):
                registrar(f"{e['titulo']}: o carro ainda não tem takes — vai para a lista de gravação.")
                continue
            c = novo_conteudo(pid, e["tipo"], e.get("titulo", ""), "rotina", direcao_de(e), e["id"], e.get("pauta"), e.get("data"))
            try:
                roteirizar_conteudo(pid, c["id"])
                registrar(f"Roteiro e narração prontos: {e['tipo']} {e['data'][8:]}/{e['data'][5:7]} — {e.get('titulo', '')}")
            except Exception as ex:  # noqa: BLE001
                registrar(f"Roteiro de '{e.get('titulo', '')}' ficou para depois ({str(ex)[:80]}).")
        # 2b. processo: todo carro com mídias prontas e sem vídeos ganha o pacote de conversão (agendado e roteirizado)
        for f in fichas_ativas():
            if False:  # pacote automático desligado: os vídeos nascem na ficha do carro
                conts = criar_pacote(f["id"], roteirizar=False)
                for c in conts:
                    _roteirizar_seguro(f["id"], c["id"])
                if conts:
                    registrar(f"Pacote de {len(conts)} vídeos criado e agendado para {f['carro'].get('modelo', '')} {f['carro'].get('ano', '')}.")
        # 2c. conteúdo do dia a dia (dinâmicas de Stories e ideias de Reels)
        if ler_json(DIA, {}).get("data") != hoje.isoformat():
            try:
                with app.test_request_context(json={}):
                    gerar_dia()
                registrar("Dinâmicas de Stories e ideias de Reels do dia geradas.")
            except Exception as e:  # noqa: BLE001
                registrar(f"Dinâmicas do dia ficaram para depois: {e}")
        # 2d. ficha da versão dos carros que ainda não têm (até 10 por dia, cota grátis)
        sem_ficha = [f for f in fichas_ativas() if not (ler_json(PROJETOS / f["id"] / "projeto.json", {}).get("ficha_versao") or {}).get("itens_serie")]
        for f in sem_ficha[:10]:
            _ficha_segura(f["id"])
        if sem_ficha:
            registrar(f"Ficha da versão pesquisada para {min(10, len(sem_ficha))} carros ({max(0, len(sem_ficha) - 10)} ficam para os próximos dias).")
        # 3. banco de pautas sempre com ideias frescas
        abertas = [p for p in ler_json(PAUTAS, []) if p.get("status") in ("nova", "aprovada")]
        if len(abertas) < 6:
            try:
                with app.test_request_context(json={"quantidade": 8}):
                    gerar_pautas()
                registrar("8 pautas novas no banco de ideias.")
            except Exception as e:  # noqa: BLE001
                registrar(f"Pautas ficaram para depois: {e}")
        registrar("Rotina do dia concluída.")
    finally:
        estado.update(rodando=False, fim=time.time())
        gravar_json(ROTINA, estado)
    return estado


def _relogio_rotina():
    """Confere a cada 10 min: depois das 6h, se a rotina de hoje não rodou, roda."""
    import datetime as _dt
    time.sleep(20)
    while True:
        try:
            agora = _dt.datetime.now()
            if agora.hour >= 6 and ler_json(ROTINA, {}).get("data") != agora.date().isoformat():
                fila_ia.put(rotina_diaria)
                time.sleep(120)
        except Exception as e:  # noqa: BLE001
            print("[rotina] relógio:", e)
        time.sleep(600)


@app.get("/api/rotina")
def status_rotina():
    return jsonify(ler_json(ROTINA, {}))


@app.post("/api/rotina/rodar")
def rodar_rotina():
    fila_ia.put(lambda: rotina_diaria(forcar=True))
    return jsonify(ok=True)


@app.post("/api/pautas/<aid>/produzir")
def produzir_pauta(aid):
    """Pauta → conteúdo no carro (e na agenda, se ainda não estiver)."""
    d = request.get_json(silent=True) or {}
    p = next((x for x in ler_json(PAUTAS, []) if x["id"] == aid), None)
    if not p:
        return erro("Pauta não encontrada.", 404)
    pid = d.get("projeto") or p.get("projeto")
    if not pid:
        return erro("Escolha o carro desta pauta.")
    c = novo_conteudo(pid, p.get("tipo") or "Reels", p.get("titulo", ""), "pauta", direcao_de(p), p.get("entrada"), aid, p.get("data"))
    with trava:
        lst = ler_json(PAUTAS, [])
        for x in lst:
            if x["id"] == aid:
                x.update(conteudo=c["id"], projeto=pid, status="agendada" if x.get("entrada") else "aprovada")
        gravar_json(PAUTAS, lst)
    return jsonify(c)


# ================================================================ Processo do carro: cadastro → mídias → pacote de vídeos → revisão → no ar

PACOTE = [  # o kit de conversão de todo carro que entra (cada um com o objetivo dele no funil)
    {"tipo": "Reels", "titulo": "Vitrine", "dia": [0, 2, 4], "hora": "19:00",
     "direcao": "REELS DE VITRINE (fundo e meio de funil): gancho campeão nos primeiros 1,5 s, ano/modelo/preço na tela, 3 opcionais que vendem, prova (km, laudo, revisão), condição e CTA para o WhatsApp com motivo para chamar hoje."},
    {"tipo": "Stories", "titulo": "Chegou na TopCar", "dia": None, "hora": "12:00",
     "direcao": "STORIES 'CHEGOU NA TOPCAR': novidade e urgência. Mostre a chegada, 2 destaques e o preço. Sticker: enquete 'Vale ou não vale?'."},
    {"tipo": "Stories", "titulo": "Quanto custa manter?", "dia": None, "hora": "19:00",
     "direcao": "STORIES 'QUANTO CUSTA MANTER?': quebre a objeção do custo — consumo, revisão, IPVA aproximado e a parcela. Sticker: caixa de perguntas."},
    {"tipo": "Anúncio", "titulo": "Anúncio de conversão", "dia": [0], "hora": "09:00",
     "direcao": "ANÚNCIO PAGO (objetivo: conversas no WhatsApp), 15-20 s: preço e condição até o 3º segundo, prova, oferta com incentivo ('diga que viu este vídeo') e CTA direto."},
]


def _proxima_data(dias_semana, ocupadas, inicio):
    """Próximo dia livre a partir de `inicio` (dias_semana: 0=segunda… ou None = qualquer dia)."""
    import datetime as _dt
    d = inicio
    for _ in range(30):
        if (dias_semana is None or d.weekday() in dias_semana) and d.isoformat() not in ocupadas:
            return d
        d += _dt.timedelta(days=1)
    return inicio


def criar_pacote(pid, roteirizar=True):
    """Cria o pacote de conteúdos do carro já agendado nos próximos espaços livres da agenda."""
    import datetime as _dt
    pj = ler_json(pasta_projeto(pid) / "projeto.json", {})
    car = pj.get("carro", {})
    nome = f"{car.get('modelo', '')} {car.get('ano', '')}".strip() or pj.get("nome", "")
    existentes = ler_conteudos(pid)
    if any(c.get("origem") == "pacote" for c in existentes):
        return []
    amanha = _dt.date.today() + _dt.timedelta(days=1)
    cal = ler_json(CALENDARIO, [])
    criados = []
    for item in PACOTE:
        ocupadas = {e["data"] for e in cal if e.get("tipo") == item["tipo"] and e.get("projeto") and e.get("status") != "cancelado"}
        d = _proxima_data(item["dia"], ocupadas, amanha)
        e = {"id": uid("e"), "data": d.isoformat(), "hora": item["hora"], "tipo": item["tipo"], "pilar": "Oferta" if item["tipo"] == "Anúncio" else "Vitrine",
             "titulo": f"{item['titulo']} — {nome}", "ideia": item["direcao"], "carro": nome, "projeto": pid, "status": "planejado",
             "criado": time.time(), "origem": "pacote"}
        cal.append(e)
        criados.append((item, e))
    with trava:
        atual = ler_json(CALENDARIO, [])
        atual += [e for _, e in criados]
        gravar_json(CALENDARIO, atual)
    conts = []
    for item, e in criados:
        c = novo_conteudo(pid, item["tipo"], e["titulo"], "pacote", item["direcao"], e["id"], None, e["data"])
        conts.append(c)
        if roteirizar:
            fila_ia.put(lambda c=c: _roteirizar_seguro(pid, c["id"]))
    return conts


def _roteirizar_seguro(pid, cid):
    try:
        roteirizar_conteudo(pid, cid)
    except Exception as e:  # noqa: BLE001
        print("[pacote] roteiro ficou para depois:", e)


def processo_carro(pid):
    """Em que passo do processo o carro está e qual é a próxima ação (uma só, objetiva)."""
    pj = ler_json(pasta_projeto(pid) / "projeto.json", {})
    car = pj.get("carro", {})
    takes = [t for t in midias(pid)["takes"]]
    prontos = [t for t in takes if t.get("proxy")]
    conts = ler_conteudos(pid)
    falta = [k for k in ("marca", "modelo", "ano", "preco", "km") if not str(car.get(k, "")).strip()]
    revisar = [c for c in conts if c.get("status") in ("montado", "roteiro", "aprovado") and not c.get("arquivo")]
    prontos_v = [c for c in conts if c.get("arquivo")]
    passos = [
        {"id": "cadastro", "nome": "Cadastro", "ok": not falta},
        {"id": "midias", "nome": "Mídias", "ok": len(prontos) >= 4},
        {"id": "videos", "nome": "Vídeos", "ok": len(conts) >= 4 and all(c.get("roteiro") or c.get("arquivo") for c in conts)},
        {"id": "revisao", "nome": "Revisão", "ok": bool(conts) and not revisar and bool(prontos_v)},
        {"id": "no_ar", "nome": "No ar", "ok": any(c.get("status") == "postado" for c in conts)},
    ]
    if (pj.get("estoque") or {}).get("status") == "vendido":
        acao = {"passo": "vendido", "texto": "Carro vendido — conteúdos encerrados."}
    elif falta:
        acao = {"passo": "cadastro", "texto": f"Completar o cadastro ({', '.join(falta)})"}
    elif any(t.get("status") in ("na fila", "processando", "analisando") for t in takes):
        acao = {"passo": "midias", "texto": "Mídias sendo tratadas pela IA (aguarde alguns minutos)"}
    elif len(prontos) < 4:
        acao = {"passo": "midias", "texto": ("Gravar os takes do roteiro e enviar" if pj.get("prerroteiro") else "Gerar o roteiro de gravação e gravar os takes")
                + f" ({len(prontos)} enviados)", "aba": "criar"}
    elif not conts:
        acao = {"passo": "videos", "texto": "Criar os vídeos do carro: Stories, Reels e 3 anúncios", "aba": "criar"}
    elif any(not c.get("roteiro") and not c.get("arquivo") for c in conts):
        acao = {"passo": "videos", "texto": "A IA está escrevendo e narrando os vídeos"}
    elif revisar:
        acao = {"passo": "revisao", "texto": f"Revisar as falas e aprovar {len(revisar)} vídeo(s)"}
    else:
        acao = {"passo": "no_ar", "texto": "Postar nos dias agendados e lançar os resultados"}
    return {"passos": passos, "acao": acao, "conteudos": len(conts), "prontos": len(prontos_v), "revisar": len(revisar), "takes": len(prontos)}


@app.get("/api/processos")
def todos_processos():
    out = {}
    for p in PROJETOS.iterdir():
        if (p / "projeto.json").exists() and not eh_teste(ler_json(p / "projeto.json", {}).get("nome")):
            try:
                out[p.name] = processo_carro(p.name)
            except Exception as e:  # noqa: BLE001
                print("[processo]", p.name, e)
    return jsonify(out)


@app.post("/api/projetos/<pid>/pacote")
def pacote_carro(pid):
    conts = criar_pacote(pid)
    if not conts:
        return erro("Este carro já tem o pacote de vídeos.")
    return jsonify(conts)


# ================================================================ Fluxo pelo carro: Stories (dos takes), Reels (roteiro → gravação → montagem), 3 anúncios

ANUNCIOS_AB = [
    {"letra": "A", "nome": "Oferta direta",
     "direcao": "CRIATIVO A — OFERTA DIRETA: gancho forte SEM preço (regra da loja); logo depois da apresentação do carro, o preço (e a comparação "
                "com a FIPE, se for menor) e a condição de pagamento (60x, entrada no cartão em 21x, troca). Ritmo rápido, 3 motivos curtos, CTA com "
                "incentivo para chamar hoje no WhatsApp."},
    {"letra": "B", "nome": "Prova e confiança",
     "direcao": "CRIATIVO B — PROVA E CONFIANÇA: gancho de objeção ('medo de comprar seminovo?'), mostre km real, laudo/vistoria, revisões e detalhes "
                "de conservação em close. O preço aparece depois da prova. CTA: 'veja pessoalmente / chama no WhatsApp'."},
    {"letra": "C", "nome": "Desejo e estilo de vida",
     "direcao": "CRIATIVO C — DESEJO: edição cinematográfica do carro (planos bonitos, câmera lenta, trilha marcante), gancho emocional/aspiracional "
                "(para quem é este carro), poucos textos, preço e CTA no final. Deve parecer comercial de marca."},
]


@app.post("/api/projetos/<pid>/anuncios")
def criar_anuncios(pid):
    """3 criativos de anúncio com abordagens diferentes para teste A/B/C no Meta Ads."""
    pj = ler_json(pasta_projeto(pid) / "projeto.json", {})
    nome = f"{pj.get('carro', {}).get('modelo', '')} {pj.get('carro', {}).get('ano', '')}".strip()
    conts = []
    for a in ANUNCIOS_AB:
        c = novo_conteudo(pid, "Anúncio", f"Anúncio {a['letra']} — {a['nome']} — {nome}", "anuncio_ab", a["direcao"])
        alterar_conteudo(pid, c["id"], teste=a["letra"], etapa="na fila da IA")
        conts.append(c)
        fila_ia.put(lambda c=c: _roteirizar_seguro(pid, c["id"]))
    return jsonify(conts)


@app.post("/api/projetos/<pid>/stories")
def criar_stories(pid):
    """Stories direto dos takes que o carro já tem."""
    d = request.get_json(silent=True) or {}
    pj = ler_json(pasta_projeto(pid) / "projeto.json", {})
    nome = f"{pj.get('carro', {}).get('modelo', '')} {pj.get('carro', {}).get('ano', '')}".strip()
    c = novo_conteudo(pid, "Stories", d.get("titulo") or f"Stories — {nome}", d.get("origem") or "stories", d.get("direcao") or
                      "STORIES DO CARRO: 12-18 s, gancho que prende no 1º segundo, 2-3 destaques reais dos takes, preço na tela e sticker com chamada para o WhatsApp.")
    return jsonify(c)


@app.post("/api/projetos/<pid>/reels")
def criar_reels(pid):
    """Reels a partir do roteiro de gravação (pré-roteiro): a montagem segue o que foi planejado e gravado."""
    pj = ler_json(pasta_projeto(pid) / "projeto.json", {})
    pre = pj.get("prerroteiro") or {}
    nome = f"{pj.get('carro', {}).get('modelo', '')} {pj.get('carro', {}).get('ano', '')}".strip()
    c = novo_conteudo(pid, "Reels", f"Reels — {pre.get('titulo') or nome}", "reels",
                      "REELS GRAVADO COM ROTEIRO: siga o pré-roteiro (gancho, estrutura, falas) usando os takes gravados para cada take planejado.")
    return jsonify(c)


# ---------------------------------------------------------------- Dia a dia: entretenimento e relacionamento (além dos carros)

DIA = BASE / "dia.json"


@app.get("/api/dia")
def obter_dia():
    return jsonify(ler_json(DIA, {}))


@app.post("/api/dia/gerar")
def gerar_dia():
    """Dinâmicas de Stories para hoje + ideias de Reels elaborados (bastidores, humor, especialista), usando o estoque como cenário."""
    import datetime as _dt
    fichas = fichas_ativas()
    estoque = "\n".join(f"- [{f['id']}] {f['carro'].get('marca', '')} {f['carro'].get('modelo', '')} {f['carro'].get('ano', '')} — R$ {f['carro'].get('preco', '')}"
                        f" | {f['takes']['total']} takes" for f in fichas)
    antigos = ler_json(DIA, {})
    pedido = (f"# Hoje: {_dt.date.today().strftime('%A, %d/%m/%Y')}\n# Estoque (os carros são o carro-chefe; use-os como cenário e assunto)\n{estoque}\n"
              + sp.texto_marca(ler_json(MARCA, {}))
              + "\n# Quadros fixos\n" + json.dumps(ler_json(PLANO, {}).get("quadros", []), ensure_ascii=False)
              + (("\n# Já feitos ontem (não repetir)\n- " + "\n- ".join(x.get("titulo", "") for x in antigos.get("dinamicas", []) + antigos.get("reels", []))) if antigos else ""))
    r = ia.gerar_json(sp.PROMPT_DIA, pedido, sp.SCHEMA_DIA, temperatura=1.0)
    for x in r.get("dinamicas", []) + r.get("reels", []):
        x["id"] = uid("d")
        m = re.search(r"\[(p[0-9a-z]+)\]", x.get("carro", ""))
        f = next((f for f in fichas if m and f["id"] == m.group(1)), None)
        x["projeto"] = f["id"] if f else (fichas[0]["id"] if fichas else None)
        x["carro"] = f"{(f or {}).get('carro', {}).get('modelo', '')} {(f or {}).get('carro', {}).get('ano', '')}".strip() if f else "Geral"
    r["data"] = _dt.date.today().isoformat()
    r["criado"] = time.time()
    gravar_json(DIA, r)
    return jsonify(r)

# ================================================================ Cadastro e gestão dos carros (migrado do TopCRM)

import topcrm  # noqa: E402

SYNC = BASE / "topcrm_sync.json"
PORTAIS = BASE / "portais.json"
PORTAIS_PADRAO = [{"id": "olx", "nome": "OLX", "url_base": "https://www.olx.com.br"}, {"id": "webmotors", "nome": "Webmotors", "url_base": "https://www.webmotors.com.br"},
                  {"id": "napista", "nome": "Napista", "url_base": "https://napista.com.br"}, {"id": "mobiauto", "nome": "Mobiauto", "url_base": "https://www.mobiauto.com.br"},
                  {"id": "icarros", "nome": "iCarros", "url_base": "https://www.icarros.com.br"}, {"id": "marketplace", "nome": "Facebook Marketplace", "url_base": "https://www.facebook.com/marketplace"}]


def _km(x):
    return int(re.sub(r"\D", "", str(x or "")) or 0)


def sincronizar_topcrm(veiculos=None, origem="neon"):
    """Traz o estoque do TopCRM (banco Neon ou export JSON): cria os carros que faltam (inclusive vendidos, como histórico),
    atualiza dados/status dos existentes e liga os que já tinham sido cadastrados à mão aqui (placa ou modelo+ano+km)."""
    if veiculos is None:
        veiculos = topcrm.ler_estoque()
    projetos = {p.name: ler_json(p / "projeto.json", {}) for p in PROJETOS.iterdir() if (p / "projeto.json").exists()}
    por_id = {str((pj.get("topcrm") or {}).get("id")): pid for pid, pj in projetos.items() if (pj.get("topcrm") or {}).get("id")}
    por_placa = {re.sub(r"[^A-Z0-9]", "", str((pj.get("carro") or {}).get("placa", "")).upper()): pid
                 for pid, pj in projetos.items() if (pj.get("carro") or {}).get("placa")}
    cont = {"criados": 0, "atualizados": 0, "vendidos": 0, "ligados": 0, "preparacao": 0, "disponiveis": 0}
    for v in veiculos:
        carro, difs, info = topcrm.carro_de(v)
        pid = por_id.get(str(v["id"])) or por_placa.get(carro["placa"])
        if not pid:  # já cadastrado à mão aqui? liga pelo modelo + ano + km (um único candidato)
            cands = []
            for qid, pj in projetos.items():
                c = pj.get("carro") or {}
                if eh_teste(pj.get("nome")) or (pj.get("topcrm") or {}).get("id"):
                    continue
                mod_a = str(c.get("modelo", "")).upper().split(" ")[0]
                if mod_a and mod_a == carro["modelo"].split(" ")[0] and str(c.get("ano", "")) == carro["ano"]:
                    ka, kb = _km(c.get("km")), _km(carro["km"])
                    if ka and kb and abs(ka - kb) <= max(1000, kb * 0.06):
                        cands.append((abs(ka - kb), qid))
            if cands:
                pid = sorted(cands)[0][1]
                cont["ligados"] += 1
        if not pid:
            pid = novo_projeto(" ".join(x for x in (carro["marca"], carro["modelo"], carro["ano"]) if x), dict(carro, diferenciais="\n".join(difs)))
            projetos[pid] = {}
            cont["criados"] += 1
        with trava:
            pj = ler_json(PROJETOS / pid / "projeto.json", {})
            atual = pj.get("carro") or {}
            atual.update({k: val for k, val in carro.items() if val})  # cadastro: o TopCRM era a fonte da verdade
            if not str(atual.get("diferenciais", "")).strip() and difs:
                atual["diferenciais"] = "\n".join(difs)
            pj["carro"] = atual
            pj["nome"] = " ".join(x for x in (carro["marca"], carro["modelo"], carro["ano"]) if x) or pj.get("nome")
            if info["ficha"]:
                pj["ficha_versao"] = info["ficha"]
            pj["topcrm"] = {"id": v["id"], "placa": carro["placa"], "status": v.get("status"), "unidade": info["unidade"],
                            "possui_fotos": info["possui_fotos"], "sincronizado": time.time(), "origem": origem}
            est = pj.get("estoque") or {}
            ja_vendido = est.get("status") == "vendido"
            est["status"] = info["status"]
            est["unidade"] = info["unidade"]
            if info["entrada"]:
                est["entrada"] = info["entrada"].isoformat()
            if info["status"] == "vendido":
                est["vendido_em"] = (info["data_venda"] or date_hoje()).isoformat()
            else:
                est.pop("vendido_em", None)
            pj["estoque"] = est
            gravar_json(PROJETOS / pid / "projeto.json", pj)
        if info["status"] == "vendido":
            cont["vendidos"] += 1
            if not ja_vendido:
                ao_vender(pid)
        elif info["status"] == "preparacao":
            cont["preparacao"] += 1
        else:
            cont["disponiveis"] += 1
        cont["atualizados"] += 1
    r = {"quando": time.time(), "veiculos": len(veiculos), "origem": origem, "erro": "", **cont}
    gravar_json(SYNC, r)
    print(f"[topcrm] {r}")
    return r


def ao_vender(pid):
    """Carro vendido: postagens futuras canceladas e anúncio retirado de todos os portais (regra do TopCRM)."""
    hoje = time.strftime("%Y-%m-%d")
    with trava:
        cal = ler_json(CALENDARIO, [])
        for e in cal:
            if e.get("projeto") == pid and e.get("data", "") >= hoje and e.get("status") != "postado":
                e["status"] = "cancelado"
        gravar_json(CALENDARIO, cal)
        pj = ler_json(PROJETOS / pid / "projeto.json", {})
        for d in (pj.get("portais") or {}).values():
            if d.get("postado"):
                d.update(postado=False, removido=time.time())
        gravar_json(PROJETOS / pid / "projeto.json", pj)


def date_hoje():
    import datetime as _dt
    return _dt.date.today()


@app.get("/api/topcrm")
def status_topcrm():
    return jsonify({**ler_json(SYNC, {}), "configurado": bool(os.environ.get("TOPCRM_DATABASE_URL"))})


@app.post("/api/topcrm/sincronizar")
def rota_sincronizar_topcrm():
    try:
        return jsonify(sincronizar_topcrm())
    except topcrm.ErroTopCRM as e:
        gravar_json(SYNC, {**ler_json(SYNC, {}), "erro": str(e), "quando_erro": time.time()})
        return erro(str(e))


@app.post("/api/topcrm/importar")
def importar_topcrm():
    """Importa o export JSON da tabela estoque_veiculo (arquivo enviado ou corpo JSON)."""
    f = request.files.get("arquivo")
    try:
        veiculos = topcrm.ler_export(f.read() if f else request.get_data())
        return jsonify(sincronizar_topcrm(veiculos, origem="arquivo"))
    except topcrm.ErroTopCRM as e:
        return erro(str(e))


@app.post("/api/topcrm/aprendizado")
def importar_aprendizado_topcrm():
    """Traz o aprendizado do Studio do TopCRM: playbook (voz da loja, ganchos, estruturas, ângulos, regras) e o feedback dos roteiros
    entram em todo roteiro novo; as referências analisadas viram referências daqui (as da loja ensinam a voz)."""
    try:
        a = topcrm.ler_aprendizado()
    except topcrm.ErroTopCRM as e:
        return erro(str(e))
    with trava:
        m = ler_json(MARCA, {})
        if a["playbook"]:
            m["playbook_topcrm"] = {"conteudo": a["playbook"]["conteudo"], "fontes": a["playbook"].get("fontes"),
                                    "criado_em": str(a["playbook"].get("criado_em"))}
        m["feedback_topcrm"] = [{"carro": f"{x['marca']} {x['modelo']} {x['ano']}", "tipo": x.get("tipo"), "angulo": x.get("angulo"),
                                 "avaliacao": "aprovado" if x.get("avaliacao") == 1 else "reprovado" if x.get("avaliacao") == -1 else "",
                                 "motivo": x.get("motivo_avaliacao"), "resultado_no_ar": x.get("resultado_real")} for x in a["feedback"]]
        gravar_json(MARCA, m)
        refs = ler_json(REFS / "refs.json", [])
        ja = {r.get("topcrm_id") for r in refs}
        novas = 0
        for r in a["referencias"]:
            if r["id"] in ja:
                continue
            an = r.get("analise") or {}
            refs.append({"id": uid("r"), "topcrm_id": r["id"], "anunciante": "TopCar (Studio antigo)" if r.get("da_loja") else (r.get("titulo") or "Referência TopCRM"),
                         "link": r.get("link") or "", "casa": bool(r.get("da_loja")), "status": "importado", "usar": True, "criado": time.time(),
                         "obs": f"Importado do Studio do TopCRM. Resultados: {r.get('resultados') or '-'}. O que a loja gosta: {r.get('observacoes') or '-'}",
                         "analise_topcrm": an})
            novas += 1
        gravar_json(REFS / "refs.json", refs)
    return jsonify(playbook=bool(a["playbook"]), referencias=novas, feedback=len(a["feedback"]))


def _relogio_topcrm():
    """Enquanto o TopCRM existir: mantém igual a ele (a cada 30 min, se o banco estiver configurado)."""
    time.sleep(15)
    while True:
        if os.environ.get("TOPCRM_DATABASE_URL"):
            try:
                sincronizar_topcrm()
            except Exception as e:  # noqa: BLE001
                print("[topcrm] sincronização falhou:", e)
        time.sleep(1800)


# ---------------------------------------------------------------- Portais (controle de postagem por carro, como no TopCRM)

def lista_portais():
    lst = ler_json(PORTAIS, None)
    if lst is None:
        gravar_json(PORTAIS, PORTAIS_PADRAO)
        lst = PORTAIS_PADRAO
    return lst


@app.get("/api/portais")
def rota_portais():
    return jsonify(lista_portais())


@app.put("/api/portais")
def salvar_portais():
    lst = request.get_json(silent=True) or []
    out = []
    for x in lst:
        nome = str(x.get("nome", "")).strip()
        if nome:
            out.append({"id": x.get("id") or re.sub(r"[^a-z0-9]+", "", nome.lower()) or uid("pt"), "nome": nome,
                        "url_base": x.get("url_base", ""), "ativo": x.get("ativo", True) is not False})
    gravar_json(PORTAIS, out)
    return jsonify(out)


@app.put("/api/projetos/<pid>/portais/<portal>")
def postar_portal(pid, portal):
    """Marca o carro como postado/retirado num portal (com o link do anúncio). Sem foto não posta."""
    d = request.get_json(silent=True) or {}
    pasta = pasta_projeto(pid)
    with trava:
        pj = ler_json(pasta / "projeto.json", {})
        if d.get("postado"):
            if (pj.get("estoque") or {}).get("status") == "vendido":
                return erro("Carro vendido não pode ser postado.")
            if not ler_json(pasta / "fotos.json", []) and not (pj.get("topcrm") or {}).get("possui_fotos"):
                return erro("Este carro ainda não tem fotos — envie as fotos antes de postar no portal.")
        reg = (pj.setdefault("portais", {})).setdefault(portal, {})
        if "postado" in d:
            reg["postado"] = bool(d["postado"])
            reg["data" if d["postado"] else "removido"] = time.time()
        if "link" in d:
            reg["link"] = str(d["link"]).strip()
        gravar_json(pasta / "projeto.json", pj)
    return jsonify(pj["portais"])


# ---------------------------------------------------------------- Ficha da versão (itens de série pesquisados na web)

import ficha_versao  # noqa: E402


def pesquisar_ficha(pid):
    pasta = pasta_projeto(pid)
    pj = ler_json(pasta / "projeto.json", {})
    f = ficha_versao.pesquisar(pj.get("carro") or {})
    with trava:
        pj = ler_json(pasta / "projeto.json", {})
        pj["ficha_versao"] = f
        c = pj.setdefault("carro", {})
        if not str(c.get("diferenciais", "")).strip():  # opcionais vazios: entram os selos e diferenciais da versão
            c["diferenciais"] = "\n".join(dict.fromkeys([*f.get("selos", []), *f.get("diferenciais", [])]))
        for k in ("cambio", "motor"):
            if f.get(k) and not c.get(k):
                c[k] = f[k]
        gravar_json(pasta / "projeto.json", pj)
    print(f"[ficha] {pid}: {f.get('versao_confirmada')} ({len(f.get('itens_serie', []))} itens, confiança {f.get('confianca')})")
    return f


@app.post("/api/projetos/<pid>/ficha")
def rota_pesquisar_ficha(pid):
    try:
        return jsonify(pesquisar_ficha(pid))
    except (RuntimeError, ia.ErroIA) as e:
        return erro(str(e))


@app.post("/api/estoque/fichas")
def fichas_em_lote():
    """Pesquisa a ficha dos carros em estoque que ainda não têm (na fila da IA, até `limite` por vez — cota grátis)."""
    limite = max(1, min(int((request.get_json(silent=True) or {}).get("limite") or 10), 40))
    alvo = []
    for p in PROJETOS.iterdir():
        pj = ler_json(p / "projeto.json", {})
        if (p / "projeto.json").exists() and not eh_teste(pj.get("nome")) and (pj.get("estoque") or {}).get("status") != "vendido" \
                and not (pj.get("ficha_versao") or {}).get("itens_serie") and (pj.get("carro") or {}).get("modelo"):
            alvo.append(p.name)
    for pid in alvo[:limite]:
        fila_ia.put(lambda pid=pid: _ficha_segura(pid))
    return jsonify(enfileirados=min(len(alvo), limite), faltam=len(alvo))


def _ficha_segura(pid):
    try:
        pesquisar_ficha(pid)
    except Exception as e:  # noqa: BLE001
        print(f"[ficha] {pid}: {e}")


# ================================================================ Fotos dos carros (formulário e integrador de portais)

FOTOS_EXT = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")


def fotos_de(pid):
    return ler_json(pasta_projeto(pid) / "fotos.json", [])


def gravar_fotos(pid, lst):
    for i, f in enumerate(lst):
        f["ordem"] = i + 1
        f["capa"] = i == 0
    gravar_json(pasta_projeto(pid) / "fotos.json", lst)


def preparar_foto(origem, pasta, fid):
    """Versão para portal (até 1920 px, JPEG 88%, sem metadados de GPS) + miniatura 480 px, na orientação certa."""
    from PIL import Image, ImageOps
    try:
        from pillow_heif import register_heif_opener  # opcional (fotos do iPhone)
        register_heif_opener()
    except ImportError:
        pass
    im = ImageOps.exif_transpose(Image.open(origem)).convert("RGB")
    w, h = im.size
    grande = im.copy(); grande.thumbnail((1920, 1920), Image.LANCZOS)
    grande.save(pasta / f"{fid}.jpg", "JPEG", quality=88, optimize=True, progressive=True)
    mini = im.copy(); mini.thumbnail((480, 480), Image.LANCZOS)
    mini.save(pasta / f"{fid}_mini.jpg", "JPEG", quality=80, optimize=True)
    return {"w": grande.size[0], "h": grande.size[1], "orig_w": w, "orig_h": h}


@app.get("/api/projetos/<pid>/fotos")
def listar_fotos(pid):
    return jsonify(fotos_de(pid))


@app.post("/api/projetos/<pid>/fotos")
def enviar_fotos(pid):
    pasta = pasta_projeto(pid) / "fotos"
    pasta.mkdir(exist_ok=True)
    novas, erros = [], []
    for f in request.files.getlist("arquivos"):
        ext = Path(f.filename or "foto.jpg").suffix.lower()
        if ext not in FOTOS_EXT:
            erros.append(f"{f.filename}: formato não suportado")
            continue
        fid = uid("f")
        orig = pasta / f"{fid}_original{ext}"
        f.save(orig)
        try:
            info = preparar_foto(orig, pasta, fid)
        except Exception as e:  # noqa: BLE001
            erros.append(f"{f.filename}: {str(e)[:80]}")
            orig.unlink(missing_ok=True)
            continue
        novas.append({"id": fid, "nome": f.filename, "arquivo": f"fotos/{fid}.jpg", "mini": f"fotos/{fid}_mini.jpg",
                      "original": f"fotos/{orig.name}", "criado": time.time(), **info})
    with trava:
        lst = fotos_de(pid) + novas
        gravar_fotos(pid, lst)
        pj = ler_json(pasta_projeto(pid) / "projeto.json", {})
        pj["fotos_total"] = len(lst)
        gravar_json(pasta_projeto(pid) / "projeto.json", pj)
    return jsonify(enviadas=len(novas), erros=erros, fotos=fotos_de(pid))


@app.put("/api/projetos/<pid>/fotos")
def ordenar_fotos(pid):
    """Recebe a nova ordem (lista de ids); a primeira é a capa."""
    ordem = (request.get_json(silent=True) or {}).get("ordem") or []
    with trava:
        lst = fotos_de(pid)
        idx = {f["id"]: f for f in lst}
        nova = [idx[i] for i in ordem if i in idx] + [f for f in lst if f["id"] not in ordem]
        gravar_fotos(pid, nova)
    return jsonify(fotos_de(pid))


@app.delete("/api/projetos/<pid>/fotos/<fid>")
def apagar_foto(pid, fid):
    pasta = pasta_projeto(pid) / "fotos"
    with trava:
        lst = [f for f in fotos_de(pid) if f["id"] != fid]
        gravar_fotos(pid, lst)
        pj = ler_json(pasta_projeto(pid) / "projeto.json", {})
        pj["fotos_total"] = len(lst)
        gravar_json(pasta_projeto(pid) / "projeto.json", pj)
    for arq in pasta.glob(f"{secure_filename(fid)}*"):
        arq.unlink(missing_ok=True)
    return jsonify(ok=True)


@app.get("/api/projetos/<pid>/fotos.zip")
def zip_fotos(pid):
    """Todas as fotos do carro (versão de portal, na ordem, capa primeiro) num ZIP."""
    import io, zipfile
    pj = ler_json(pasta_projeto(pid) / "projeto.json", {})
    c = pj.get("carro") or {}
    nome = secure_filename(f"{c.get('marca', '')}_{c.get('modelo', '')}_{c.get('ano', '')}_{c.get('placa', '')}".strip("_")) or pid
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        for f in fotos_de(pid):
            z.write(pasta_projeto(pid) / f["arquivo"], f"{nome}_{f['ordem']:02d}.jpg")
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True, download_name=f"{nome}_fotos.zip")


# ================================================================ API pública do estoque (formulário dos carros e integrador de portais)

def _url(pid, rel):
    return f"{request.host_url.rstrip('/')}/media/{pid}/{rel}" if rel else None


def _token_ok():
    tok = os.environ.get("API_ESTOQUE_TOKEN", "").strip()
    return not tok or request.headers.get("Authorization", "") == f"Bearer {tok}" or request.args.get("token") == tok


def carro_publico(pid):
    pj = ler_json(PROJETOS / pid / "projeto.json", {})
    c = pj.get("carro") or {}
    tc = pj.get("topcrm") or {}
    conts = ler_conteudos(pid) if (PROJETOS / pid / "conteudos.json").exists() else []
    return {
        "id": pid, "topcrm_id": tc.get("id"), "placa": c.get("placa") or tc.get("placa"),
        "marca": c.get("marca"), "modelo": c.get("modelo"), "versao": c.get("versao"), "ano": c.get("ano"),
        "preco": c.get("preco"), "km": c.get("km"), "cor": c.get("cor"), "cambio": c.get("cambio"), "combustivel": c.get("combustivel"),
        "motor": c.get("motor"), "fipe": c.get("fipe"),
        "opcionais": [x.strip() for x in str(c.get("diferenciais", "")).splitlines() if x.strip()],
        "procedencia": c.get("procedencia"), "observacoes": c.get("observacoes"),
        "status": (pj.get("estoque") or {}).get("status", "disponivel"), "unidade": tc.get("unidade"),
        "fotos": [{"ordem": f["ordem"], "capa": f["capa"], "url": _url(pid, f["arquivo"]), "miniatura": _url(pid, f["mini"]),
                   "largura": f.get("w"), "altura": f.get("h")} for f in fotos_de(pid)] if (PROJETOS / pid / "fotos.json").exists() else [],
        "videos": [{"tipo": x["tipo"], "titulo": x.get("titulo"), "url": f"{request.host_url.rstrip('/')}{x['arquivo']}"} for x in conts if x.get("arquivo")],
        "atualizado": max((PROJETOS / pid / "projeto.json").stat().st_mtime, (PROJETOS / pid / "fotos.json").stat().st_mtime if (PROJETOS / pid / "fotos.json").exists() else 0),
    }


@app.get("/api/publico/estoque")
def api_publica_estoque():
    """Estoque para integração: ?status=disponivel (padrão: todos menos vendidos) · ?com_fotos=1."""
    if not _token_ok():
        return erro("Token inválido.", 401)
    lista = []
    for p in PROJETOS.iterdir():
        if (p / "projeto.json").exists() and not eh_teste(ler_json(p / "projeto.json", {}).get("nome")):
            lista.append(carro_publico(p.name))
    st = request.args.get("status")
    lista = [c for c in lista if (c["status"] == st if st else c["status"] != "vendido")]
    if request.args.get("com_fotos"):
        lista = [c for c in lista if c["fotos"]]
    return jsonify(total=len(lista), carros=lista)


@app.get("/api/publico/carros/<pid>")
def api_publica_carro(pid):
    if not _token_ok():
        return erro("Token inválido.", 401)
    pasta_projeto(pid)
    return jsonify(carro_publico(pid))


# ================================================================ Banco do estoque na nuvem (consultado pelos outros apps)

import nuvem  # noqa: E402

NUVEM = BASE / "nuvem.json"


def registro_nuvem(pid):
    pj = ler_json(PROJETOS / pid / "projeto.json", {})
    c = pj.get("carro") or {}
    tc = pj.get("topcrm") or {}
    est = pj.get("estoque") or {}
    fv = pj.get("ficha_versao") or {}
    reg = {
        "placa": re.sub(r"[^A-Z0-9]", "", str(c.get("placa") or tc.get("placa") or "").upper()),
        "marca": c.get("marca"), "modelo": c.get("modelo"), "versao": c.get("versao"),
        "ano": nuvem.inteiro(c.get("ano")), "km": nuvem.inteiro(c.get("km")), "preco": nuvem.dinheiro(c.get("preco")),
        "cor": c.get("cor"), "cambio": c.get("cambio"), "combustivel": c.get("combustivel"), "motor": c.get("motor"),
        "fipe": nuvem.dinheiro(c.get("fipe")),
        "opcionais": [x.strip() for x in str(c.get("diferenciais", "")).splitlines() if x.strip()],
        "itens_serie": fv.get("itens_serie") or [],
        "procedencia": c.get("procedencia"), "observacoes": c.get("observacoes"),
        "status": est.get("status") or "disponivel", "unidade": est.get("unidade") or tc.get("unidade") or "",
        "data_entrada": est.get("entrada"), "data_venda": est.get("vendido_em"),
        "portais": {k: {"postado": bool(v.get("postado")), "link": v.get("link") or ""} for k, v in (pj.get("portais") or {}).items()},
        "topcrm_id": tc.get("id"),
    }
    pasta = PROJETOS / pid
    fotos = [{"id": f["id"], "ordem": f["ordem"], "capa": f["capa"], "largura": f.get("w"), "altura": f.get("h"),
              "arquivo": pasta / f["arquivo"], "mini": pasta / f["mini"] if f.get("mini") else None}
             for f in ler_json(pasta / "fotos.json", []) if (pasta / f["arquivo"]).exists()]
    return {"registro": reg, "fotos": fotos}


def estoque_local():
    out = {}
    for p in PROJETOS.iterdir():
        pj = ler_json(p / "projeto.json", None)
        if pj and not eh_teste(pj.get("nome")) and (pj.get("carro") or {}).get("modelo"):
            out[p.name] = registro_nuvem(p.name)
    return out


def sincronizar_nuvem(forcar=False):
    st = ler_json(NUVEM, {})
    try:
        novo, res = nuvem.sincronizar(estoque_local(), st, forcar=forcar)
    except nuvem.ErroNuvem as e:
        gravar_json(NUVEM, {**st, "erro": str(e), "quando_erro": time.time()})
        raise
    if res.get("ocupado"):
        return res
    gravar_json(NUVEM, {**novo, "quando": time.time(), "erro": "; ".join(res["erros"])[:500], "ultimo": res})
    if res["enviados"] or res["removidos"] or res["erros"]:
        print(f"[nuvem] {res}")
    return res


@app.get("/api/nuvem")
def status_nuvem():
    st = ler_json(NUVEM, {})
    r = {"configurado": nuvem.configurado(), "modo_fotos": nuvem.modo_fotos(), "quando": st.get("quando"), "erro": st.get("erro", ""),
         "ultimo": st.get("ultimo"), "enviados": len(st.get("carros") or {})}
    if request.args.get("remoto") and nuvem.configurado():
        try:
            r["remoto"] = nuvem.resumo_remoto()
        except nuvem.ErroNuvem as e:
            r["erro"] = str(e)
    return jsonify(r)


@app.post("/api/nuvem/sincronizar")
def rota_sincronizar_nuvem():
    try:
        return jsonify(sincronizar_nuvem(forcar=bool((request.get_json(silent=True) or {}).get("forcar"))))
    except nuvem.ErroNuvem as e:
        return erro(str(e))


def _relogio_nuvem():
    """Espelha o estoque na nuvem a cada minuto (só o que mudou)."""
    time.sleep(20)
    while True:
        if nuvem.configurado():
            try:
                sincronizar_nuvem()
            except Exception as e:  # noqa: BLE001
                print("[nuvem] sincronização falhou:", e)
        time.sleep(60)


if __name__ == "__main__":
    if not os.environ.get("GEMINI_API_KEY"):
        print("\n[!] GEMINI_API_KEY não encontrada. Copie .env.example para .env e coloque sua chave.")
        print("    Chave grátis em: https://aistudio.google.com/apikey\n")
    # Retoma takes que ficaram pela metade se o servidor foi fechado
    for pasta in PROJETOS.iterdir():
        m = ler_json(pasta / "midias.json", None)
        for t in (m or {}).get("takes", []):
            if t.get("status") in ("na fila", "processando") and not (t.get("proxy") and t.get("status") == "na fila"):
                fila.put(lambda p=pasta.name, i=t["id"]: processar_take(p, i))
            elif t.get("status") == "analisando" or (t.get("proxy") and t.get("status") == "na fila"):
                fila_ia.put(lambda p=pasta.name, i=t["id"]: analisar_take(p, i))
    for r in ler_json(REFS / "refs.json", []):  # referências que estavam na fila de estudo
        if r.get("status") in ("na fila", "analisando"):
            fila_ia.put(lambda i=r["id"]: analisar_referencia(i))
    threading.Thread(target=_relogio_rotina, daemon=True).start()  # rotina diária automática
    threading.Thread(target=_relogio_topcrm, daemon=True).start()  # estoque sempre igual ao do TopCRM
    threading.Thread(target=_relogio_nuvem, daemon=True).start()  # banco do estoque na nuvem (outros apps consultam)
    porta = int(os.environ.get("PORTA", "5000"))
    print(f"Estúdio aberto em: http://localhost:{porta}   (gerador de copy rápida: /copy)")
    print("Banco do estoque na nuvem:", f"ligado (fotos no {nuvem.modo_fotos()})" if nuvem.configurado() else "desligado (falta ESTOQUE_DATABASE_URL no .env)")
    try:
        from waitress import serve  # servidor de produção (mais estável que o do Flask para rodar o dia todo)
        serve(app, host=os.environ.get("HOST", "127.0.0.1"), port=porta, threads=16, channel_timeout=900,
              max_request_body_size=app.config["MAX_CONTENT_LENGTH"])
    except ImportError:
        app.run(host=os.environ.get("HOST", "127.0.0.1"), port=porta, debug=False, threaded=True)
