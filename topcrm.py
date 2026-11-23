"""Migração do TopCRM (que será descontinuado): o cadastro e a gestão dos carros passam a viver neste app.

Fontes: o banco Neon do TopCRM (TOPCRM_DATABASE_URL no .env, só leitura) ou o export JSON da tabela estoque_veiculo.
"""
import json
import os
import re
from datetime import date, datetime


class ErroTopCRM(Exception):
    pass


def url_banco():
    url = os.environ.get("TOPCRM_DATABASE_URL", "").strip()
    if not url:
        raise ErroTopCRM("Falta a conexão do TopCRM: coloque TOPCRM_DATABASE_URL=postgresql://… (Neon) no arquivo .env do app.")
    return url


def ano_normalizado(valor):
    """Mesma regra do TopCRM: '27' → 2027, '1819' (fab/modelo) → 2019, '2425' → 2025."""
    try:
        a = int(valor or 0)
    except (TypeError, ValueError):
        return valor
    limite = date.today().year + 2
    if 1950 <= a <= limite:
        return a
    if 0 < a < 100:
        return 2000 + a if 2000 + a <= limite else 1900 + a
    if 1000 <= a <= 9999:
        fab, mod = divmod(a, 100)
        if mod in (fab, fab + 1):
            return ano_normalizado(mod)
    return a


def preco_br(v):
    try:
        n = int(round(float(v or 0)))
    except (TypeError, ValueError):
        return ""
    return f"{n:,}".replace(",", ".") if n > 1000 else ""  # 0 / 1.000 eram "sem preço" no TopCRM


MARCAS = {"VOLKSWAGEM": "VOLKSWAGEN", "VW": "VOLKSWAGEN", "FAIT": "FIAT", "CAOACHERY": "CAOA CHERY", "CAOA": "CAOA CHERY",
          "CHEVROLLET": "CHEVROLET", "CEVROLET": "CHEVROLET", "HYUNDAY": "HYUNDAI", "MINI 1.5": "MINI", "CITROËN": "CITROEN"}

# status do TopCRM → (status no estoque deste app, unidade)
STATUS = {"loja_recife": ("disponivel", "Recife"), "loja_olinda": ("disponivel", "Olinda"),
          "preparacao": ("preparacao", ""), "vendido": ("vendido", "")}


def _data(v):
    if not v:
        return None
    if isinstance(v, (date, datetime)):
        return v.date() if isinstance(v, datetime) else v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def ler_estoque():
    """Lê todos os veículos do Neon (só leitura)."""
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as e:
        raise ErroTopCRM("Biblioteca psycopg não instalada (pip install psycopg[binary]).") from e
    try:
        with psycopg.connect(url_banco(), connect_timeout=20, row_factory=dict_row) as con:
            con.read_only = True
            return con.execute(
                "SELECT id, marca, modelo, versao, ano_modelo, placa, cor, km, valor_venda, status, possui_fotos,"
                " data_venda, ficha, criado_em, atualizado_em FROM estoque_veiculo ORDER BY id").fetchall()
    except ErroTopCRM:
        raise
    except Exception as e:  # noqa: BLE001
        raise ErroTopCRM(f"Não consegui ler o banco do TopCRM: {str(e)[:200]}") from e


def ler_export(conteudo):
    """Export JSON da tabela estoque_veiculo (lista de veículos)."""
    try:
        dados = json.loads(conteudo) if isinstance(conteudo, (str, bytes)) else conteudo
    except json.JSONDecodeError as e:
        raise ErroTopCRM(f"Arquivo JSON inválido: {e}") from e
    if isinstance(dados, dict):
        dados = dados.get("estoque_veiculo") or dados.get("veiculos") or dados.get("rows") or []
    if not isinstance(dados, list) or not all(isinstance(x, dict) and "placa" in x for x in dados):
        raise ErroTopCRM("O arquivo não parece o export da tabela estoque_veiculo (lista com placa, marca, modelo…).")
    for v in dados:
        if isinstance(v.get("ficha"), str):
            try:
                v["ficha"] = json.loads(v["ficha"])
            except json.JSONDecodeError:
                v["ficha"] = {}
    return dados


def carro_de(v):
    """Veículo do TopCRM → campos de carro deste app (marca corrigida, motor separado do modelo, placa limpa)."""
    ficha = v.get("ficha") or {}
    marca = re.sub(r"\s+", " ", str(v.get("marca") or "").strip().upper())
    marca = MARCAS.get(marca, marca)
    modelo = re.sub(r"\s+", " ", str(v.get("modelo") or "").strip().upper())
    versao = re.sub(r"\s+", " ", str(v.get("versao") or "").strip().upper())
    m = re.match(r"^(.*?)\s+(\d\.\d)(?:\s+(TURBO|T))?$", modelo)  # "ONIX 1.0" → modelo ONIX, motor 1.0 na versão
    if m and m.group(1):
        modelo = m.group(1)
        motor = m.group(2) + (" TURBO" if m.group(3) else "")
        if motor not in versao:
            versao = f"{motor} {versao}".strip()
    itens = [*(ficha.get("selos") or []), *(ficha.get("diferenciais") or []), *(ficha.get("itens_serie") or [])]
    vistos, difs = set(), []
    for i in itens:
        k = str(i).strip().lower()
        if k and k not in vistos:
            vistos.add(k)
            difs.append(str(i).strip())
    c = {
        "marca": marca, "modelo": modelo, "versao": versao, "ano": str(ano_normalizado(v.get("ano_modelo")) or ""),
        "preco": preco_br(v.get("valor_venda")), "km": str(int(v.get("km") or 0) or ""), "cor": str(v.get("cor") or "").strip().upper(),
        "placa": re.sub(r"[^A-Z0-9]", "", str(v.get("placa") or "").upper()),
    }
    if ficha.get("cambio"):
        c["cambio"] = ficha["cambio"]
    if ficha.get("motor"):
        c["motor"] = ficha["motor"]
    status, unidade = STATUS.get(v.get("status"), ("disponivel", ""))
    return c, difs[:12], {"status": status, "unidade": unidade, "data_venda": _data(v.get("data_venda")),
                          "entrada": _data(v.get("criado_em")), "possui_fotos": bool(v.get("possui_fotos")), "ficha": ficha}



def ler_aprendizado():
    """O que o Studio do TopCRM aprendeu: o playbook mais recente, as referências analisadas e os roteiros avaliados pela loja."""
    import psycopg
    from psycopg.rows import dict_row
    out = {"playbook": None, "referencias": [], "feedback": []}
    try:
        with psycopg.connect(url_banco(), connect_timeout=20, row_factory=dict_row) as con:
            con.read_only = True
            pb = con.execute("SELECT conteudo, fontes, criado_em FROM estoque_playbookia ORDER BY criado_em DESC LIMIT 1").fetchone()
            out["playbook"] = pb
            out["referencias"] = con.execute(
                "SELECT id, titulo, link, da_loja, analise, resultados, observacoes, origem FROM estoque_referenciareels"
                " WHERE ativa AND status_analise = 'ok' ORDER BY criado_em DESC LIMIT 120").fetchall()
            out["feedback"] = con.execute(
                "SELECT marca, modelo, ano, tipo, angulo, avaliacao, motivo_avaliacao, resultado_real, resultado FROM estoque_copyreels"
                " WHERE avaliacao <> 0 OR resultado_real <> '' ORDER BY criado_em DESC LIMIT 40").fetchall()
    except ErroTopCRM:
        raise
    except Exception as e:  # noqa: BLE001
        raise ErroTopCRM(f"Não consegui ler o aprendizado do TopCRM: {str(e)[:200]}") from e
    return out
