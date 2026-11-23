"""Banco do estoque na nuvem (Postgres: Neon, Supabase…), com as fotos dos carros.

Este app (na máquina da empresa) é a fonte da verdade: cadastro, status, portais e fotos são editados aqui e espelhados na nuvem
a cada minuto. Os outros apps (consulta de estoque, formulário, integrador de portais) leem do banco.

Fotos:
  - padrão: dentro do próprio banco (tabela veiculo_foto_arquivo, JPEG em bytea). Só precisa do ESTOQUE_DATABASE_URL.
  - opcional: num storage S3 (Supabase Storage, Cloudflare R2, AWS…) com link público em veiculo_foto.url — configure FOTOS_S3_*.

Tabelas: veiculo · veiculo_foto · veiculo_foto_arquivo · estoque_meta. View pronta para consulta: vw_estoque (carro + fotos em JSON).
"""
import hashlib
import json
import os
import re
import threading
import time
from datetime import date, timedelta
from pathlib import Path

VERSAO_SCHEMA = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS veiculo (
  id             text PRIMARY KEY,
  placa          text NOT NULL DEFAULT '',
  marca          text, modelo text, versao text,
  ano            integer,
  km             integer,
  preco          numeric(12,2),
  cor            text, cambio text, combustivel text, motor text,
  fipe           numeric(12,2),
  opcionais      jsonb NOT NULL DEFAULT '[]',
  itens_serie    jsonb NOT NULL DEFAULT '[]',
  procedencia    text, observacoes text,
  status         text NOT NULL DEFAULT 'disponivel',
  unidade        text NOT NULL DEFAULT '',
  data_entrada   date,
  data_venda     date,
  portais        jsonb NOT NULL DEFAULT '{}',
  topcrm_id      integer,
  total_fotos    integer NOT NULL DEFAULT 0,
  capa_url       text,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veiculo_status_idx ON veiculo (status);
CREATE INDEX IF NOT EXISTS veiculo_placa_idx ON veiculo (placa);

CREATE TABLE IF NOT EXISTS veiculo_foto (
  id             text PRIMARY KEY,
  veiculo_id     text NOT NULL REFERENCES veiculo(id) ON DELETE CASCADE,
  ordem          integer NOT NULL,
  capa           boolean NOT NULL DEFAULT false,
  largura        integer, altura integer,
  bytes          integer,
  sha256         text,
  url            text,
  url_miniatura  text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS veiculo_foto_veiculo_idx ON veiculo_foto (veiculo_id, ordem);

CREATE TABLE IF NOT EXISTS veiculo_foto_arquivo (
  foto_id        text PRIMARY KEY REFERENCES veiculo_foto(id) ON DELETE CASCADE,
  jpeg           bytea NOT NULL,
  miniatura      bytea
);

CREATE TABLE IF NOT EXISTS estoque_meta (chave text PRIMARY KEY, valor jsonb, atualizado_em timestamptz NOT NULL DEFAULT now());

DROP VIEW IF EXISTS vw_estoque;
CREATE VIEW vw_estoque AS
SELECT v.*,
       COALESCE(json_agg(json_build_object('id', f.id, 'ordem', f.ordem, 'capa', f.capa, 'url', f.url, 'miniatura', f.url_miniatura,
                                           'largura', f.largura, 'altura', f.altura) ORDER BY f.ordem)
                FILTER (WHERE f.id IS NOT NULL), '[]') AS fotos
FROM veiculo v LEFT JOIN veiculo_foto f ON f.veiculo_id = v.id
GROUP BY v.id;
"""


class ErroNuvem(Exception):
    pass


def url_banco():
    return os.environ.get("ESTOQUE_DATABASE_URL", "").strip()


def configurado():
    return bool(url_banco())


def s3_config():
    c = {k: os.environ.get(f"FOTOS_S3_{k.upper()}", "").strip() for k in ("endpoint", "bucket", "chave", "segredo", "regiao")}
    c["url_publica"] = os.environ.get("FOTOS_URL_PUBLICA", "").strip().rstrip("/")
    return c if c["bucket"] and c["chave"] and c["segredo"] else None


def modo_fotos():
    return "s3" if s3_config() else "banco"


def dias_fotos_vendidos():
    try:
        return int(os.environ.get("ESTOQUE_FOTOS_VENDIDOS_DIAS", "30"))
    except ValueError:
        return 30


# ---------------------------------------------------------------- conversões

def inteiro(v):
    s = re.sub(r"[^\d]", "", str(v or "").split(",")[0])
    return int(s) if s else None


def dinheiro(v):
    s = str(v or "").strip()
    if not s:
        return None
    s = re.sub(r"[^\d,\.]", "", s)
    if "," in s:  # 89.900,50
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+", s):  # 89.900
        s = s.replace(".", "")
    try:
        n = float(s)
    except ValueError:
        return None
    return n if n > 1000 else None


def data_iso(v):
    try:
        return date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def assinatura(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


# ---------------------------------------------------------------- storage S3 (opcional)

_s3 = None


def cliente_s3():
    global _s3
    if _s3 is None:
        try:
            import boto3
            from botocore.config import Config
        except ImportError as e:
            raise ErroNuvem("Para fotos em S3 instale boto3 (pip install boto3) ou apague FOTOS_S3_* do .env para guardar no banco.") from e
        c = s3_config()
        _s3 = boto3.client("s3", endpoint_url=c["endpoint"] or None, aws_access_key_id=c["chave"], aws_secret_access_key=c["segredo"],
                           region_name=c["regiao"] or "auto", config=Config(signature_version="s3v4", retries={"max_attempts": 4}))
    return _s3


def _chave_s3(vid, fid, mini=False):
    return f"carros/{vid}/{fid}{'_mini' if mini else ''}.jpg"


def _url_s3(chave):
    c = s3_config()
    if c["url_publica"]:
        return f"{c['url_publica']}/{chave}"
    if c["endpoint"]:
        return f"{c['endpoint'].rstrip('/')}/{c['bucket']}/{chave}"
    return f"https://{c['bucket']}.s3.amazonaws.com/{chave}"


# ---------------------------------------------------------------- sincronização

_trava = threading.Lock()


def conectar():
    try:
        import psycopg
    except ImportError as e:
        raise ErroNuvem("Biblioteca psycopg não instalada (pip install psycopg[binary]).") from e
    try:
        return psycopg.connect(url_banco(), connect_timeout=20, autocommit=False)
    except Exception as e:  # noqa: BLE001
        raise ErroNuvem(f"Não consegui conectar no banco do estoque: {str(e)[:200]}") from e


def preparar(con):
    with con.cursor() as cur:
        cur.execute("SELECT to_regclass('estoque_meta')")
        existe = cur.fetchone()[0]
        versao = None
        if existe:
            cur.execute("SELECT valor FROM estoque_meta WHERE chave = 'versao_schema'")
            r = cur.fetchone()
            versao = r[0] if r else None
        if versao != VERSAO_SCHEMA:
            cur.execute(SCHEMA)
            cur.execute("INSERT INTO estoque_meta (chave, valor) VALUES ('versao_schema', %s) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()",
                        (json.dumps(VERSAO_SCHEMA),))
    con.commit()


COLUNAS = ["placa", "marca", "modelo", "versao", "ano", "km", "preco", "cor", "cambio", "combustivel", "motor", "fipe", "opcionais", "itens_serie",
           "procedencia", "observacoes", "status", "unidade", "data_entrada", "data_venda", "portais", "topcrm_id"]
JSONB = {"opcionais", "itens_serie", "portais"}


def _upsert_veiculo(cur, vid, reg):
    from psycopg.types.json import Jsonb
    vals = [Jsonb(reg.get(c)) if c in JSONB else reg.get(c) for c in COLUNAS]
    cols = ", ".join(COLUNAS)
    ph = ", ".join(["%s"] * len(COLUNAS))
    upd = ", ".join(f"{c} = EXCLUDED.{c}" for c in COLUNAS)
    cur.execute(f"INSERT INTO veiculo (id, {cols}) VALUES (%s, {ph}) ON CONFLICT (id) DO UPDATE SET {upd}, atualizado_em = now()", [vid, *vals])


def _sync_fotos(cur, vid, fotos):
    """fotos: [{id, ordem, capa, largura, altura, arquivo: Path, mini: Path}] na ordem final."""
    modo = modo_fotos()
    cur.execute("SELECT id, ordem, capa FROM veiculo_foto WHERE veiculo_id = %s", (vid,))
    remotas = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
    locais = {f["id"] for f in fotos}
    enviadas = 0
    for fid in set(remotas) - locais:
        cur.execute("DELETE FROM veiculo_foto WHERE id = %s", (fid,))
        if modo == "s3":
            for mini in (False, True):
                try:
                    cliente_s3().delete_object(Bucket=s3_config()["bucket"], Key=_chave_s3(vid, fid, mini))
                except Exception:  # noqa: BLE001
                    pass
    for f in fotos:
        if f["id"] in remotas:
            if remotas[f["id"]] != (f["ordem"], f["capa"]):
                cur.execute("UPDATE veiculo_foto SET ordem = %s, capa = %s WHERE id = %s", (f["ordem"], f["capa"], f["id"]))
            continue
        jpeg = Path(f["arquivo"]).read_bytes()
        mini = Path(f["mini"]).read_bytes() if f.get("mini") and Path(f["mini"]).exists() else None
        url = url_mini = None
        if modo == "s3":
            s3, bucket = cliente_s3(), s3_config()["bucket"]
            s3.put_object(Bucket=bucket, Key=_chave_s3(vid, f["id"]), Body=jpeg, ContentType="image/jpeg", CacheControl="public, max-age=31536000")
            url = _url_s3(_chave_s3(vid, f["id"]))
            if mini:
                s3.put_object(Bucket=bucket, Key=_chave_s3(vid, f["id"], True), Body=mini, ContentType="image/jpeg", CacheControl="public, max-age=31536000")
                url_mini = _url_s3(_chave_s3(vid, f["id"], True))
        cur.execute("INSERT INTO veiculo_foto (id, veiculo_id, ordem, capa, largura, altura, bytes, sha256, url, url_miniatura)"
                    " VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (f["id"], vid, f["ordem"], f["capa"], f.get("largura"), f.get("altura"), len(jpeg), hashlib.sha256(jpeg).hexdigest(), url, url_mini))
        if modo == "banco":
            cur.execute("INSERT INTO veiculo_foto_arquivo (foto_id, jpeg, miniatura) VALUES (%s, %s, %s)", (f["id"], jpeg, mini))
        enviadas += 1
    capa = next((f for f in fotos if f["capa"]), None)
    capa_url = None
    if capa and modo == "s3":
        capa_url = _url_s3(_chave_s3(vid, capa["id"]))
    cur.execute("UPDATE veiculo SET total_fotos = %s, capa_url = %s WHERE id = %s", (len(fotos), capa_url, vid))
    return enviadas


def sincronizar(carros, estado, forcar=False):
    """carros: {id: {"registro": {...colunas}, "fotos": [...]}} — todo o estoque local.
    estado: {"carros": {id: assinatura}} (o que já foi enviado). Devolve o estado novo + resumo."""
    if not configurado():
        raise ErroNuvem("Falta ESTOQUE_DATABASE_URL no .env (banco do estoque na nuvem).")
    if not _trava.acquire(blocking=False):
        return estado, {"ocupado": True}
    t0 = time.time()
    res = {"enviados": 0, "fotos_enviadas": 0, "removidos": 0, "iguais": 0, "erros": []}
    enviados = dict((estado or {}).get("carros") or {})
    limite = date.today() - timedelta(days=dias_fotos_vendidos())
    try:
        with conectar() as con:
            preparar(con)
            for vid, c in carros.items():
                reg = c["registro"]
                fotos = c["fotos"]
                if reg.get("status") == "vendido" and (data_iso(reg.get("data_venda")) or date.today()) < limite:
                    fotos = []  # vendido há mais de N dias: as fotos saem da nuvem (continuam neste computador)
                ass = assinatura([reg, [(f["id"], f["ordem"], f["capa"]) for f in fotos], modo_fotos()])
                if not forcar and enviados.get(vid) == ass:
                    res["iguais"] += 1
                    continue
                try:
                    with con.cursor() as cur:
                        _upsert_veiculo(cur, vid, reg)
                        res["fotos_enviadas"] += _sync_fotos(cur, vid, fotos)
                    con.commit()
                    enviados[vid] = ass
                    res["enviados"] += 1
                except Exception as e:  # noqa: BLE001
                    con.rollback()
                    res["erros"].append(f"{reg.get('marca', '')} {reg.get('modelo', '')} {reg.get('placa', '')}: {str(e)[:160]}")
            # carros apagados aqui saem da nuvem — com trava de segurança (nunca apaga em massa por pasta vazia/erro)
            with con.cursor() as cur:
                cur.execute("SELECT id FROM veiculo")
                remotos = {r[0] for r in cur.fetchall()}
                sobrando = remotos - set(carros)
                if sobrando and len(carros) >= 10 and len(sobrando) <= max(5, len(remotos) // 5):
                    for vid in sobrando:
                        if modo_fotos() == "s3":
                            cur.execute("SELECT id FROM veiculo_foto WHERE veiculo_id = %s", (vid,))
                            for (fid,) in cur.fetchall():
                                for mini in (False, True):
                                    try:
                                        cliente_s3().delete_object(Bucket=s3_config()["bucket"], Key=_chave_s3(vid, fid, mini))
                                    except Exception:  # noqa: BLE001
                                        pass
                        cur.execute("DELETE FROM veiculo WHERE id = %s", (vid,))
                        enviados.pop(vid, None)
                    res["removidos"] = len(sobrando)
                elif sobrando:
                    res["erros"].append(f"{len(sobrando)} carros estão na nuvem e não neste computador — não apaguei por segurança.")
                cur.execute("INSERT INTO estoque_meta (chave, valor) VALUES ('ultima_sincronizacao', %s) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()",
                            (json.dumps({"quando": time.strftime("%Y-%m-%dT%H:%M:%S"), "carros": len(carros), "modo_fotos": modo_fotos()}),))
            con.commit()
    finally:
        _trava.release()
    res["segundos"] = round(time.time() - t0, 1)
    return {"carros": enviados}, res


def resumo_remoto():
    """Contagem do que está na nuvem (para a tela)."""
    with conectar() as con:
        preparar(con)
        with con.cursor() as cur:
            cur.execute("SELECT count(*), count(*) FILTER (WHERE status <> 'vendido'), coalesce(sum(total_fotos),0) FROM veiculo")
            total, estoque, fotos = cur.fetchone()
            cur.execute("SELECT coalesce(pg_total_relation_size('veiculo_foto_arquivo'),0) + coalesce(pg_total_relation_size('veiculo'),0) + coalesce(pg_total_relation_size('veiculo_foto'),0)")
            tamanho = cur.fetchone()[0]
    return {"veiculos": total, "em_estoque": estoque, "fotos": int(fotos), "tamanho_mb": round(tamanho / 1024 / 1024, 1)}
