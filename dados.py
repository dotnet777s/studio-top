"""Backup e restauração dos dados do app (carros, takes, vídeos, aprendizado, agenda, marca).

    python dados.py backup                → backups/TopCar_dados_AAAA-MM-DD_HHMM.zip
    python dados.py restaurar arquivo.zip → coloca os dados nesta pasta (os atuais vão para backups/antes_de_restaurar_…)

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


def arquivos_de_dados():
    for nome in PASTAS:
        p = BASE / nome
        if p.is_dir():
            for f in p.rglob("*"):
                if f.is_file() and not f.name.endswith(PULAR) and ".bak" not in f.name:
                    yield f
    for f in BASE.glob("*.json"):
        yield f


def backup(destino=None):
    pasta = BASE / "backups"
    pasta.mkdir(exist_ok=True)
    destino = Path(destino) if destino else pasta / f"TopCar_dados_{time.strftime('%Y-%m-%d_%H%M')}.zip"
    lista = list(arquivos_de_dados())
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


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "backup":
        backup(sys.argv[2] if len(sys.argv) > 2 else None)
    elif len(sys.argv) >= 3 and sys.argv[1] == "restaurar":
        restaurar(sys.argv[2])
    else:
        print(__doc__)
