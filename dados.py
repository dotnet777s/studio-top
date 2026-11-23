"""Backup e restauração dos dados do app (carros, takes, vídeos, aprendizado, agenda, marca).

    python dados.py backup                → backups/TopCar_dados_AAAA-MM-DD_HHMM.zip
    python dados.py restaurar arquivo.zip → coloca os dados nesta pasta (os atuais vão para backups/antes_de_restaurar_…)

Sem pendrive (pelo banco do estoque na nuvem, o mesmo ESTOQUE_DATABASE_URL do .env):
    python dados.py enviar-nuvem          → máquina antiga: sobe o essencial (sem os brutos dos takes, renders e vídeos de referência)
    python dados.py baixar-nuvem          → máquina nova: baixa, restaura e apaga o pacote do banco (libera espaço)

O código vem do GitHub; os dados vêm por aqui. O .env (senhas) não entra no backup: copie-o à parte.
"""
import shutil
import sys
import time
import zipfile
from pathlib import Path

BASE = Path(__file__).parent
PASTAS = ["projetos", "renders", "referencias", "marca"]
PULAR = (".tmp", ".pyc")
JA_COMPRIMIDOS = (".mp4", ".mov", ".m4a", ".mp3", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".zip")


def arquivos_de_dados(essencial=False):
    for nome in PASTAS:
        if essencial and nome == "renders":
            continue  # vídeos já exportados/postados
        p = BASE / nome
        if p.is_dir():
            for f in p.rglob("*"):
                if not f.is_file() or f.name.endswith(PULAR) or ".bak" in f.name:
                    continue
                if essencial and ("_original." in f.name or (nome == "referencias" and f.suffix.lower() not in (".json", ".jpg", ".png"))):
                    continue  # bruto do take (já existe a versão tratada) e vídeo de referência (a análise está no refs.json)
                yield f
    for f in BASE.glob("*.json"):
        yield f


def backup(destino=None, essencial=False):
    pasta = BASE / "backups"
    pasta.mkdir(exist_ok=True)
    destino = Path(destino) if destino else pasta / f"TopCar_dados_{time.strftime('%Y-%m-%d_%H%M')}{'_essencial' if essencial else ''}.zip"
    lista = list(arquivos_de_dados(essencial))
    total = sum(f.stat().st_size for f in lista)
    print(f"Copiando {len(lista)} arquivos ({total / 1024 ** 2:,.0f} MB) para {destino} …")
    feito = 0
    with zipfile.ZipFile(destino, "w", allowZip64=True) as z:
        for i, f in enumerate(lista, 1):
            tipo = zipfile.ZIP_STORED if f.suffix.lower() in JA_COMPRIMIDOS else zipfile.ZIP_DEFLATED
            z.write(f, f.relative_to(BASE).as_posix(), compress_type=tipo)
            feito += f.stat().st_size
            if i % 50 == 0 or i == len(lista):
                print(f"  {feito * 100 // max(total, 1)}%", end="\r")
    print(f"\nPronto: {destino} ({destino.stat().st_size / 1024 ** 2:,.0f} MB)")
    return destino


def restaurar(arquivo):
    arquivo = Path(arquivo)
    if not arquivo.exists():
        sys.exit(f"Arquivo não encontrado: {arquivo}")
    with zipfile.ZipFile(arquivo) as z:
        nomes = z.namelist()
        if not any(n.startswith("projetos/") for n in nomes):
            sys.exit("Este ZIP não parece um backup do app (não tem a pasta projetos/).")
        for n in nomes:  # nada fora desta pasta
            alvo = (BASE / n).resolve()
            if BASE.resolve() not in alvo.parents:
                sys.exit(f"Caminho inválido dentro do ZIP: {n}")
        atuais = [BASE / p for p in PASTAS if (BASE / p).exists() and any((BASE / p).iterdir())] + list(BASE.glob("*.json"))
        if atuais:
            guarda = BASE / "backups" / f"antes_de_restaurar_{time.strftime('%Y-%m-%d_%H%M')}"
            guarda.mkdir(parents=True)
            for p in atuais:
                shutil.move(str(p), str(guarda / p.name))
            print(f"Os dados que estavam aqui foram guardados em {guarda}")
        print(f"Restaurando {len(nomes)} arquivos…")
        z.extractall(BASE)
    print("Pronto. Abra o app pelo iniciar.bat.")


# ---------------------------------------------------------------- transferência pelo banco na nuvem

PARTE = 8 * 1024 * 1024


def _url_banco():
    import os
    env = BASE / ".env"
    if env.exists():
        for linha in env.read_text(encoding="utf-8").splitlines():
            if linha.strip().startswith("ESTOQUE_DATABASE_URL=") and "=" in linha:
                os.environ.setdefault("ESTOQUE_DATABASE_URL", linha.split("=", 1)[1].strip().strip('"').strip("'"))
    url = os.environ.get("ESTOQUE_DATABASE_URL", "").strip()
    if not url:
        sys.exit("Falta ESTOQUE_DATABASE_URL no .env.")
    return url


def enviar_nuvem():
    import psycopg
    zipado = backup(BASE / "backups" / f"transferencia_{time.strftime('%Y-%m-%d_%H%M')}.zip", essencial=True)
    tam = zipado.stat().st_size
    partes = (tam + PARTE - 1) // PARTE
    print(f"Enviando {tam / 1024 ** 2:,.0f} MB em {partes} partes para o banco…")
    with psycopg.connect(_url_banco(), connect_timeout=30) as con:
        con.execute("CREATE TABLE IF NOT EXISTS app_transferencia (parte integer PRIMARY KEY, dados bytea NOT NULL, total integer NOT NULL,"
                    " nome text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now())")
        con.execute("DELETE FROM app_transferencia")
        con.commit()
        with open(zipado, "rb") as f:
            for i in range(partes):
                con.execute("INSERT INTO app_transferencia (parte, dados, total, nome) VALUES (%s, %s, %s, %s)", (i, f.read(PARTE), partes, zipado.name))
                con.commit()
                print(f"  {i + 1}/{partes}", end="\r")
    print(f"\nPronto. Na máquina nova rode: python dados.py baixar-nuvem")


def baixar_nuvem():
    import psycopg
    pasta = BASE / "backups"
    pasta.mkdir(exist_ok=True)
    with psycopg.connect(_url_banco(), connect_timeout=30) as con:
        if not con.execute("SELECT to_regclass('app_transferencia')").fetchone()[0]:
            sys.exit("Não há pacote de dados no banco (rode 'enviar-nuvem' na máquina antiga).")
        info = con.execute("SELECT count(*), max(total), max(nome) FROM app_transferencia").fetchone()
        if not info[0] or info[0] != info[1]:
            sys.exit(f"Pacote incompleto no banco ({info[0]} de {info[1]} partes). Rode 'enviar-nuvem' de novo na máquina antiga.")
        destino = pasta / info[2]
        print(f"Baixando {info[2]} ({info[0]} partes)…")
        with open(destino, "wb") as f:
            for i in range(info[0]):
                f.write(con.execute("SELECT dados FROM app_transferencia WHERE parte = %s", (i,)).fetchone()[0])
                print(f"  {i + 1}/{info[0]}", end="\r")
    print()
    restaurar(destino)
    with psycopg.connect(_url_banco(), connect_timeout=30) as con:
        con.execute("DROP TABLE IF EXISTS app_transferencia")
    print("Pacote apagado do banco (espaço liberado). Uma cópia ficou em", destino)


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "enviar-nuvem":
        enviar_nuvem(); sys.exit()
    if len(sys.argv) >= 2 and sys.argv[1] == "baixar-nuvem":
        baixar_nuvem(); sys.exit()
    if len(sys.argv) >= 2 and sys.argv[1] == "backup":
        backup(sys.argv[2] if len(sys.argv) > 2 else None)
    elif len(sys.argv) >= 3 and sys.argv[1] == "restaurar":
        restaurar(sys.argv[2])
    else:
        print(__doc__)
